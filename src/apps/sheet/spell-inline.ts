// Spelling and grammar underlines in the spreadsheet's cell editor. Univer
// draws the text being edited on a canvas, so the underlines are an overlay
// placed with Univer's own text layout (calcDocRangePositions of docs-ui, the
// same positions its pop-ups use). Nothing is added to the cell.

import { calcDocRangePositions, IEditorBridgeService, IRenderManagerService } from '@univerjs/preset-sheets-core'
import { DOCS_NORMAL_EDITOR_UNIT_ID_KEY, ICommandService, IUniverInstanceService, type DocumentDataModel, type Univer } from '@univerjs/presets'
import type { Paragraph } from '../../core/spell/types'
import { checkParagraphs, isPersonal, onSpellChange, spellSettings, type DocLanguage } from '../../ui/spell/service'
import '../../ui/spell/inline.css'

const EDITOR = DOCS_NORMAL_EDITOR_UNIT_ID_KEY

export function sheetInlineSpelling(univer: Univer, language: DocLanguage): void {
  const injector = univer.__getInjector()
  const renders = injector.get(IRenderManagerService)
  const instances = injector.get(IUniverInstanceService)
  const commands = injector.get(ICommandService)
  const bridge = injector.get(IEditorBridgeService)
  const overlay = document.createElement('div')
  overlay.className = 'wo-spell-overlay wo-sheet-spell'
  document.body.append(overlay)

  interface Found {
    from: number
    to: number
    kind: string
  }
  let found: Found[] = []
  let version = 0
  let timer = 0
  let lastText = ''

  const editing = () => {
    try {
      return bridge.isVisible().visible
    } catch {
      return false
    }
  }
  const editorText = (): string | null => {
    const doc = instances.getUnit<DocumentDataModel>(EDITOR)
    const stream = doc?.getBody()?.dataStream
    return typeof stream === 'string' ? stream.replace(/\r?\n$/, '') : null
  }

  const paint = () => {
    overlay.replaceChildren()
    const render = renders.getRenderUnitById(EDITOR)
    if (!render || !found.length || !editing()) return
    const canvas = render.engine.getCanvasElement()
    const clip = canvas?.getBoundingClientRect()
    if (!clip?.width) return
    overlay.dataset.issues = String(found.length)
    for (const f of found) {
      let rects: { left: number; right: number; top: number; bottom: number }[] = []
      try {
        rects = calcDocRangePositions({ startOffset: f.from, endOffset: f.to, collapsed: false }, render) ?? []
      } catch {
        rects = []
      }
      for (const r of rects) {
        if (r.bottom < clip.top || r.top > clip.bottom || r.right < clip.left || r.left > clip.right) continue
        const line = document.createElement('div')
        line.className = `wo-spell-line wo-${f.kind}`
        const left = Math.max(r.left, clip.left)
        Object.assign(line.style, { left: `${left}px`, top: `${Math.min(r.bottom, clip.bottom) - 3}px`, width: `${Math.max(0, Math.min(r.right, clip.right) - left)}px` })
        overlay.append(line)
      }
    }
  }

  const clear = () => {
    found = []
    lastText = ''
    delete overlay.dataset.issues
    overlay.replaceChildren()
  }

  const check = async () => {
    const s = spellSettings()
    const text = editing() ? editorText() : null
    // Formulas are not text.
    if (text === null || text.startsWith('=') || !(s.spelling || s.grammar)) return clear()
    if (text === lastText) return paint()
    const v = language.variant()
    const lines = text.split('\r')
    const paragraphs: Paragraph[] = lines.map((line) => ({ text: line, lang: v.lang, variant: v.tag, context: 'table' }))
    const id = ++version
    const results = await checkParagraphs(paragraphs, { spelling: s.spelling, grammar: s.grammar, optionalStyle: s.optionalStyle })
    if (id !== version || !editing()) return
    if (editorText() !== text) return schedule(150)
    found = []
    let offset = 0
    results.forEach((r, i) => {
      for (const issue of r.issues) {
        const word = lines[i].slice(issue.from, issue.to)
        if (issue.rule === 'spelling' && isPersonal(v.lang, word)) continue
        found.push({ from: offset + issue.from, to: offset + issue.to, kind: issue.kind })
      }
      offset += lines[i].length + 1
    })
    // Pending dictionary results must never be cached as a completed check.
    lastText = results.some((r) => r.pending) ? '' : text
    paint()
    if (results.some((r) => r.pending)) schedule(500)
  }

  const schedule = (delay = 300) => {
    clearTimeout(timer)
    timer = window.setTimeout(() => void check(), delay)
  }

  commands.onCommandExecuted((info) => {
    const params = info.params as { unitId?: string } | undefined
    if (params?.unitId === EDITOR || info.id.includes('cell-edit-visible') || info.id.includes('set-cell-edit')) {
      // Text changed: stale underlines go until the next check.
      if (params?.unitId === EDITOR && info.id.includes('mutation')) overlay.replaceChildren()
      schedule()
    }
  })
  bridge.visible$.subscribe(() => schedule(editing() ? 100 : 0))
  onSpellChange(() => {
    lastText = ''
    schedule(0)
  })
  language.onChange(() => {
    lastText = ''
    schedule(0)
  })
  window.addEventListener('resize', () => paint())
}
