// Spelling and grammar underlines in the word processor. Issues are shown with
// ProseMirror decorations, so the document and its Yjs state are never touched
// and every collaborator sees only their own checks.
//
// Incremental: ProseMirror reuses unchanged nodes, so a paragraph whose node
// object has already been checked keeps its (mapped) decorations; only new
// node objects are checked again, after a short pause in typing. Results are
// cached by text, so undo or retyping a word needs no new check.

import { Extension, type Editor } from '@tiptap/core'
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'
import type * as Y from 'yjs'
import { SpellClient, type CheckResult } from '../../../core/spell/client'
import { loadSettings, personalWords, saveSettings, savePersonalWords, UI_VARIANT, type SpellSettings } from '../../../core/spell/settings'
import { dictOf, normalizeTag, variantOf } from '../../../core/spell/variants'
import { OBJECT, type Issue, type Lang, type Paragraph } from '../../../core/spell/types'
import type { WorkerEvent } from '../../../core/spell/worker'

export const spellKey = new PluginKey<DecorationSet>('spell')

interface Meta {
  // Replace the decorations of these block ranges.
  blocks?: { from: number; to: number; decos: Decoration[] }[]
  // Remove decorations whose issue matches.
  remove?: (issue: IssueSpec) => boolean
  clear?: boolean
}

export interface IssueSpec {
  issue: Issue
  lang: Lang
  // Dictionary id of the paragraph's variant (for suggestions).
  dict: string
  // The underlined text when it was checked.
  text: string
  // Paragraph start (position of the block's content) is not kept: positions
  // come from the decoration itself.
}

export interface FoundIssue extends IssueSpec {
  from: number
  to: number
}

const CLASSES = { spelling: 'spell-error', grammar: 'grammar-error', style: 'style-error' }
const MAX_BATCH_CHARS = 30_000
const MAX_CACHE = 8000

type Context = NonNullable<Paragraph['context']>

interface Block {
  node: PMNode
  pos: number
  paragraph: Paragraph
  key: string
}

export class SpellController {
  settings: SpellSettings
  editor!: Editor
  private client: SpellClient
  private applied = new WeakSet<PMNode>()
  private cache = new Map<string, CheckResult>()
  private timer = 0
  private running = false
  private again = false
  private lastEdit = 0
  // A misspelling at the cursor is shown once the cursor leaves the word.
  private held: { from: number; to: number; node: PMNode } | null = null
  private ignoredOnce = DecorationSet.empty
  private ignoredWords = new Set<string>()
  private ignoredRules = new Set<string>()
  private personal = new Map<Lang, Set<string>>()
  private listeners = new Set<() => void>()
  harperReady = false
  languageToolOk: boolean | null = null
  // Dictionary ids being downloaded.
  loading = new Set<string>()

  constructor(
    private meta: Y.Map<unknown>,
    private editable: () => boolean,
  ) {
    this.settings = loadSettings()
    this.client = new SpellClient((e) => this.onWorkerEvent(e))
    meta.observe((e) => {
      if (e.keysChanged.has('lang')) this.recheck()
    })
  }

  // ---------- Settings ----------

  get enabled(): boolean {
    return this.settings.spelling || this.settings.grammar
  }

  // Document language as a variant tag ("es-MX"). Older documents store a
  // bare code ("es"): the browser's region of that language is used.
  docLang(): string {
    return normalizeTag(this.meta.get('lang')) ?? UI_VARIANT
  }

  docBase(): Lang {
    return variantOf(this.docLang())!.lang
  }

  setDocLang(tag: string): void {
    if (this.editable()) this.meta.set('lang', tag)
  }

  update(patch: Partial<SpellSettings>): void {
    this.settings = { ...this.settings, ...patch }
    saveSettings(this.settings)
    this.recheck()
    this.notify()
  }

  // Cached results depend on the options too.
  private signature(): string {
    const o = this.options()
    return `${+o.spelling}${+o.grammar}${+o.optionalStyle}${o.languageTool ?? ''}`
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private notify() {
    this.listeners.forEach((fn) => fn())
  }

  // Checks the whole document again (cached results are reused); the
  // underlines of each paragraph are replaced when its results arrive.
  recheck(clearCache = false): void {
    if (clearCache) this.cache.clear()
    this.applied = new WeakSet()
    if (!this.editor) return
    if (!this.enabled) this.dispatch({ clear: true })
    this.schedule(0)
  }

  // ---------- Personal dictionary and ignore lists ----------

  private personalSet(lang: Lang): Set<string> {
    let set = this.personal.get(lang)
    if (!set) {
      set = new Set(personalWords(lang))
      this.personal.set(lang, set)
      this.client.setPersonal(lang, [...set])
    }
    return set
  }

  addToDictionary(word: string, lang: Lang): void {
    const set = this.personalSet(lang)
    set.add(word)
    savePersonalWords(lang, [...set])
    this.client.setPersonal(lang, [...set])
    this.dispatch({ remove: (s) => s.issue.rule === 'spelling' && s.lang === lang && s.text === word })
  }

  removeFromDictionary(word: string, lang: Lang): void {
    const set = this.personalSet(lang)
    set.delete(word)
    savePersonalWords(lang, [...set])
    this.client.setPersonal(lang, [...set])
    this.recheck(true)
  }

  ignoreAll(spec: IssueSpec): void {
    if (spec.issue.rule === 'spelling') {
      this.ignoredWords.add(`${spec.lang}:${spec.text}`)
      this.dispatch({ remove: (s) => s.issue.rule === 'spelling' && s.lang === spec.lang && s.text === spec.text })
    } else {
      this.ignoredRules.add(spec.issue.rule)
      this.client.disableRule(spec.issue.rule)
      this.dispatch({ remove: (s) => s.issue.rule === spec.issue.rule })
    }
  }

  ignoreOnce(found: FoundIssue): void {
    this.ignoredOnce = this.ignoredOnce.add(this.editor.state.doc, [Decoration.inline(found.from, found.to, {}, { text: found.text, rule: found.issue.rule })])
    const spec = this.findAt(found.from, found.to)?.spec as IssueSpec | undefined
    if (spec) this.dispatch({ remove: (s) => s === spec })
  }

  private isIgnored(lang: Lang, issue: Issue, text: string, from: number, to: number): boolean {
    if (issue.rule === 'spelling') {
      if (this.ignoredWords.has(`${lang}:${text}`)) return true
      const personal = this.personalSet(lang)
      if (personal.has(text) || personal.has(text.toLowerCase())) return true
    } else if (this.ignoredRules.has(issue.rule)) return true
    return this.ignoredOnce.find(from, to).some((d) => d.from === from && d.to === to && d.spec.text === text && d.spec.rule === issue.rule)
  }

  // ---------- Transactions ----------

  record(tr: Transaction): void {
    if (!tr.docChanged) return
    this.lastEdit = Date.now()
    this.ignoredOnce = this.ignoredOnce.map(tr.mapping, tr.doc)
    if (this.held) {
      const from = tr.mapping.map(this.held.from, -1)
      const to = tr.mapping.map(this.held.to, 1)
      this.held = { ...this.held, from, to }
    }
    this.schedule()
  }

  selectionMoved(): void {
    const held = this.held
    if (!held) return
    const { head } = this.editor.state.selection
    if (head >= held.from && head <= held.to) return
    this.held = null
    this.applied.delete(held.node)
    this.schedule(0)
  }

  private dispatch(meta: Meta) {
    const view = this.editor?.view
    if (!view || view.isDestroyed) return
    view.dispatch(view.state.tr.setMeta(spellKey, meta).setMeta('addToHistory', false))
  }

  schedule(delay = 400): void {
    clearTimeout(this.timer)
    if (!this.enabled) return
    this.timer = window.setTimeout(() => void this.run(), delay)
  }

  // ---------- Checking ----------

  private blocks(doc: PMNode, all: boolean): Block[] {
    const docTag = this.docLang()
    const sig = this.signature()
    // A paragraph with a bare code of the document's language follows its variant.
    const variant = (attr: unknown) => {
      const v = variantOf(attr) ?? variantOf(docTag)!
      return typeof attr === 'string' && !attr.includes('-') && v.lang === variantOf(docTag)!.lang ? docTag : v.tag
    }
    const out: Block[] = []
    let prev = ''
    const walk = (node: PMNode, pos: number, context: Context) => {
      node.forEach((child, offset) => {
        const at = pos + offset
        if (child.isTextblock) {
          const last = prev
          const tail = child.lastChild
          prev = tail?.isText ? tail.text!.trimEnd().slice(-1) : ''
          if (child.type.spec.code) return
          if (!all && this.applied.has(child)) return
          const tag = variant(child.attrs.lang)
          const paragraph: Paragraph = { text: blockText(child), lang: variantOf(tag)!.lang, variant: tag, context: child.type.name === 'heading' ? 'heading' : context, prev: last }
          out.push({ node: child, pos: at, paragraph, key: `${tag}|${sig}|${paragraph.context}|${last}|${paragraph.text}` })
        } else if (!child.isLeaf) {
          const name = child.type.name
          const next: Context = name === 'listItem' || name === 'taskItem' ? 'list' : name === 'tableCell' || name === 'tableHeader' ? 'table' : context
          walk(child, at + 1, next)
        }
      })
    }
    walk(doc, 0, 'paragraph')
    return out
  }

  private async run() {
    if (this.running) {
      this.again = true
      return
    }
    const view = this.editor?.view
    if (!view || view.isDestroyed || !this.enabled) return
    this.running = true
    try {
      const pending = this.blocks(view.state.doc, false)
      if (!pending.length) return
      // Cached paragraphs are shown at once.
      const cached = pending.filter((b) => this.cache.has(b.key))
      if (cached.length) this.show(cached.map((b) => [b, this.cache.get(b.key)!]))
      // The rest, nearest to the cursor first, in batches.
      const head = view.state.selection.head
      const todo = pending.filter((b) => !this.cache.has(b.key)).sort((a, b) => Math.abs(a.pos - head) - Math.abs(b.pos - head))
      while (todo.length) {
        const batch: Block[] = []
        let size = 0
        while (todo.length && (batch.length === 0 || size + todo[0].paragraph.text.length < MAX_BATCH_CHARS)) {
          const b = todo.shift()!
          size += b.paragraph.text.length
          batch.push(b)
        }
        const startDoc = view.state.doc
      const results = await this.client.check(
          batch.map((b) => b.paragraph),
          this.options(),
        )
        const done: [Block, CheckResult][] = []
        batch.forEach((b, i) => {
          if (!results[i].pending) this.remember(b.key, results[i])
          done.push([b, results[i]])
        })
        this.show(done)
        if (this.editor.view.isDestroyed) return
        // The text changed meanwhile: start again from the cursor.
        if (this.editor.state.doc !== startDoc) {
          this.again = true
          break
        }
      }
    } finally {
      this.running = false
      if (this.again) {
        this.again = false
        this.schedule(50)
      }
    }
  }

  private options() {
    const s = this.settings
    return {
      spelling: s.spelling,
      grammar: s.grammar,
      optionalStyle: s.optionalStyle,
      languageTool: s.grammar && s.useLanguageTool && s.languageToolUrl ? s.languageToolUrl : undefined,
    }
  }

  private remember(key: string, result: CheckResult) {
    if (this.cache.size >= MAX_CACHE) this.cache.delete(this.cache.keys().next().value!)
    this.cache.set(key, result)
  }

  // Shows results for blocks that are still in the document (found by node identity).
  private show(results: [Block, CheckResult][]) {
    const view = this.editor.view
    if (view.isDestroyed) return
    // Redrawing a paragraph during IME composition would interrupt it.
    if (view.composing) {
      setTimeout(() => this.show(results), 300)
      return
    }
    const doc = view.state.doc
    // A node object can appear more than once (identical pasted paragraphs).
    const positions = new Map<PMNode, number[]>()
    const wanted = new Set(results.map(([b]) => b.node))
    doc.descendants((node, pos) => {
      if (wanted.has(node)) positions.set(node, [...(positions.get(node) ?? []), pos])
      return !node.isTextblock
    })
    const { head, empty } = view.state.selection
    const typing = empty && Date.now() - this.lastEdit < 1500
    const blocks: NonNullable<Meta['blocks']> = []
    for (const [block, result] of results) for (const pos of positions.get(block.node) ?? []) {
      const start = pos + 1
      const decos: Decoration[] = []
      for (const issue of result.issues) {
        const from = start + issue.from
        const to = start + issue.to
        const text = block.paragraph.text.slice(issue.from, issue.to)
        if (this.isIgnored(block.paragraph.lang, issue, text, from, to)) continue
        // Do not underline the word being typed.
        if (typing && issue.rule === 'spelling' && head >= from && head <= to) {
          this.held = { from, to, node: block.node }
          continue
        }
        const spec: IssueSpec = { issue, lang: block.paragraph.lang, dict: dictOf(block.paragraph), text }
        decos.push(
          Decoration.inline(from, to, { class: CLASSES[issue.kind], 'aria-invalid': issue.kind === 'spelling' ? 'spelling' : 'grammar' }, spec),
        )
      }
      blocks.push({ from: pos, to: pos + block.node.nodeSize, decos })
      if (!result.pending) this.applied.add(block.node)
      else this.loading.add(dictOf(block.paragraph))
    }
    if (blocks.length) this.dispatch({ blocks })
    this.notify()
  }

  private onWorkerEvent(e: WorkerEvent) {
    if (e.type === 'ready') {
      this.loading.delete(e.dict)
      // Paragraphs checked without their dictionary are checked again.
      this.schedule(0)
    } else if (e.type === 'dictionary-error') {
      this.loading.delete(e.dict)
    } else if (e.type === 'harper') {
      this.harperReady = e.ready
      if (e.ready) {
        for (const key of [...this.cache.keys()]) if (key.startsWith('en-')) this.cache.delete(key)
        this.recheck()
      }
    } else if (e.type === 'languagetool') {
      this.languageToolOk = e.ok
    }
    this.notify()
  }

  // ---------- Queries and actions ----------

  private findAt(from: number, to: number): Decoration | undefined {
    const set = spellKey.getState(this.editor.state)
    return set?.find(from, to).find((d) => d.from === from && d.to === to)
  }

  // The issue under a document position (the innermost one).
  issueAt(pos: number): FoundIssue | null {
    const set = spellKey.getState(this.editor.state)
    const found = set?.find(pos, pos).filter((d) => d.from <= pos && d.to >= pos) ?? []
    found.sort((a, b) => a.to - a.from - (b.to - b.from))
    const d = found[0]
    return d ? { ...(d.spec as IssueSpec), from: d.from, to: d.to } : null
  }

  // Every issue shown, in document order.
  issues(): FoundIssue[] {
    const set = spellKey.getState(this.editor.state)
    return (set?.find() ?? []).map((d) => ({ ...(d.spec as IssueSpec), from: d.from, to: d.to })).sort((a, b) => a.from - b.from)
  }

  // True while some paragraph has not been checked yet.
  get busy(): boolean {
    return this.running || this.blocks(this.editor.state.doc, false).length > 0
  }

  suggestions(found: FoundIssue): Promise<string[]> {
    if (found.issue.rule !== 'spelling') return Promise.resolve(found.issue.replacements)
    return this.client.suggest(found.text, found.dict)
  }

  // Replaces the issue's text (or its wider span) with a suggestion.
  replace(found: FoundIssue, text: string): boolean {
    if (!this.editable()) return false
    const { state } = this.editor
    let from = found.from
    let to = found.to
    if (state.doc.textBetween(from, to, '\n', OBJECT) !== found.text) return false
    const span = found.issue.span
    if (span) {
      const start = found.from - found.issue.from
      from = start + span[0]
      to = start + span[1]
    }
    const tr = state.tr
    if (text) tr.insertText(text, from, to)
    else tr.delete(from, to)
    this.editor.view.dispatch(tr.scrollIntoView())
    return true
  }

  // Replaces every occurrence of the same misspelled word.
  replaceAll(found: FoundIssue, text: string): number {
    const same = this.issues().filter((i) => i.issue.rule === found.issue.rule && i.text === found.text && i.lang === found.lang)
    let n = 0
    for (const i of same.reverse()) if (this.replace(i, text)) n++
    return n
  }

  destroy(): void {
    clearTimeout(this.timer)
  }
}

// Paragraph text with one character per document position: inline atoms,
// inline code and deleted suggestions are masked.
export function blockText(node: PMNode): string {
  let text = ''
  node.forEach((child) => {
    if (child.isText) {
      const masked = child.marks.some((m) => m.type.name === 'code' || m.type.name === 'deletion')
      text += masked ? OBJECT.repeat(child.text!.length) : child.text!
    } else text += child.type.name === 'hardBreak' ? '\n' : OBJECT.repeat(child.nodeSize)
  })
  return text
}

export function spellExtension(controller: SpellController) {
  return Extension.create({
    name: 'spellcheck',
    addProseMirrorPlugins() {
      return [
        new Plugin<DecorationSet>({
          key: spellKey,
          state: {
            init: () => DecorationSet.empty,
            apply(tr, set) {
              const meta = tr.getMeta(spellKey) as Meta | undefined
              let next = set.map(tr.mapping, tr.doc)
              if (tr.docChanged) {
                controller.record(tr)
                // Hide underlines where the text changed until it is checked again.
                const stale: Decoration[] = []
                tr.mapping.maps.forEach((map, i) => {
                  const rest = tr.mapping.slice(i + 1)
                  map.forEach((_a, _b, start, end) => stale.push(...next.find(rest.map(start, -1), rest.map(end, 1))))
                })
                if (stale.length) next = next.remove(stale)
              }
              if (!meta) return next
              if (meta.clear) return DecorationSet.empty
              if (meta.remove) next = next.remove(next.find(undefined, undefined, (spec) => meta.remove!(spec as IssueSpec)))
              for (const block of meta.blocks ?? []) {
                next = next.remove(next.find(block.from, block.to).filter((d) => d.from >= block.from && d.to <= block.to))
                if (block.decos.length) next = next.add(tr.doc, block.decos)
              }
              return next
            },
          },
          props: {
            decorations: (state) => (controller.enabled ? spellKey.getState(state) : null),
            // Our checker replaces the browser's while it is on.
            attributes: () => ({ spellcheck: controller.settings.spelling ? 'false' : 'true', lang: controller.docLang() }),
          },
          view: () => ({
            update: (view, prev) => {
              if (!prev.selection.eq(view.state.selection)) controller.selectionMoved()
            },
          }),
        }),
      ]
    },
    onCreate() {
      controller.editor = this.editor
      controller.schedule(300)
    },
    onDestroy() {
      controller.destroy()
    },
  })
}
