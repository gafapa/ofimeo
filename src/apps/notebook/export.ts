// Exports and imports of notebooks, built from the shared state only (they
// also run from the home screen's Download, without the app mounted):
//   page / section / notebook → Word, OpenDocument, Markdown (the writer's
//     converters: each page is its title as a heading plus its content, pages
//     separated by page breaks; tags become symbols such as ☐ or ⭐ before the
//     text, files their names, and the ink a picture after the page's text)
//   notebook → ZIP of Markdown: one folder per section, one .md per page,
//     pictures, files and ink (SVG) in assets/, and notebook.json with the
//     section colours, subpage levels and ink strokes for a faithful re-import
//   ZIP of Markdown, a folder of Markdown files or a single .md → pages.
// OneNote files (.one) are not imported.

import * as Y from 'yjs'
import type { JSONContent } from '@tiptap/core'
import { getSchema } from '@tiptap/core'
import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap'
import { t } from '../../core/i18n'
import { safeFileName } from '../../core/handin'
import { DEFAULT_PAGE, type DocumentData } from '../writer/formats/types'
import type { ExportFormat } from '../writer/formats'
import { inkPng, inkSvg } from './ink'
import { notebookExtensions } from './extensions'
import {
  addPage,
  addSection,
  allPages,
  inkArray,
  pageFragment,
  pageTitle,
  readPages,
  readSections,
  TAG_PREFIX,
  type Page,
  type Stroke,
  type TagId,
} from './model'

export type Scope = { kind: 'page'; id: string } | { kind: 'section'; id: string } | { kind: 'notebook' }

interface Options {
  // Files as links to their data (Markdown) or as their names only.
  files: 'link' | 'text'
  // The ink as a PNG picture (Word, OpenDocument, PDF), an SVG picture (Markdown) or left out.
  ink: 'png' | 'svg' | 'none'
}

export function notebookTitle(doc: Y.Doc): string {
  return String(doc.getMap('meta').get('title') || '') || t('Untitled notebook')
}

export function scopePages(doc: Y.Doc, scope: Scope): Page[] {
  if (scope.kind === 'page') return allPages(doc).filter((p) => p.id === scope.id)
  if (scope.kind === 'section') return readPages(doc, scope.id)
  return allPages(doc)
}

export function scopeTitle(doc: Y.Doc, scope: Scope): string {
  if (scope.kind === 'page') {
    const page = allPages(doc).find((p) => p.id === scope.id)
    return page ? pageTitle(page) : notebookTitle(doc)
  }
  if (scope.kind === 'section') return readSections(doc).find((s) => s.id === scope.id)?.name || notebookTitle(doc)
  return notebookTitle(doc)
}

// The page text as ProseMirror JSON, with notebook-only nodes turned into what the converters know.
export function pageContent(doc: Y.Doc, id: string, options: Options): JSONContent[] {
  const json = yXmlFragmentToProsemirrorJSON(pageFragment(doc, id)) as JSONContent
  return (json.content ?? []).map((n) => prepare(n, options))
}

function prepare(node: JSONContent, options: Options): JSONContent {
  if (node.type === 'nbFile') {
    const name = String(node.attrs?.name ?? 'file')
    const src = String(node.attrs?.src ?? '')
    return options.files === 'link' && src
      ? { type: 'text', text: name, marks: [{ type: 'link', attrs: { href: src } }] }
      : { type: 'text', text: `📎 ${name}` }
  }
  const out: JSONContent = { ...node }
  if (node.content) out.content = node.content.map((c) => prepare(c, options))
  const tag = node.attrs?.nbTag as TagId | undefined
  if (tag && TAG_PREFIX[tag]) {
    const { nbTag: _drop, ...attrs } = node.attrs!
    out.attrs = attrs
    out.content = [{ type: 'text', text: `${TAG_PREFIX[tag]} ` }, ...(out.content ?? [])]
  }
  return out
}

async function inkParagraph(doc: Y.Doc, id: string, mode: Options['ink']): Promise<JSONContent | null> {
  if (mode === 'none') return null
  const strokes = inkArray(doc, id).toArray()
  if (!strokes.length) return null
  if (mode === 'svg') {
    const svg = inkSvg(strokes)
    return svg ? { type: 'paragraph', content: [{ type: 'image', attrs: { src: `data:image/svg+xml;base64,${toBase64(new TextEncoder().encode(svg))}`, alt: t('Ink') } }] } : null
  }
  const png = await inkPng(strokes)
  return png ? { type: 'paragraph', content: [{ type: 'image', attrs: { src: png.src, alt: t('Ink'), width: Math.min(png.width, 640) } }] } : null
}

// A page or several as one document body (title headings, page breaks between pages).
export async function scopeBody(doc: Y.Doc, scope: Scope, options: Options): Promise<JSONContent> {
  const pages = scopePages(doc, scope)
  const content: JSONContent[] = []
  for (const [i, page] of pages.entries()) {
    if (i > 0) content.push({ type: 'pageBreak' })
    const level = scope.kind === 'page' ? 1 : Math.min(6, 1 + page.level)
    content.push({ type: 'heading', attrs: { level }, content: [{ type: 'text', text: pageTitle(page) }] })
    content.push(...pageContent(doc, page.id, options))
    const ink = await inkParagraph(doc, page.id, options.ink)
    if (ink) content.push(ink)
  }
  if (!content.length) content.push({ type: 'paragraph' })
  return { type: 'doc', content }
}

export async function scopeData(doc: Y.Doc, scope: Scope, options: Options): Promise<DocumentData> {
  return { title: scopeTitle(doc, scope), body: await scopeBody(doc, scope, options), header: null, footer: null, page: DEFAULT_PAGE }
}

// Word, OpenDocument or Markdown of a page, a section or the whole notebook.
export async function exportScope(doc: Y.Doc, scope: Scope, format: Extract<ExportFormat, 'docx' | 'odt' | 'md'>): Promise<Blob> {
  const { exportFile } = await import('../writer/formats')
  const data = await scopeData(doc, scope, format === 'md' ? { files: 'link', ink: 'png' } : { files: 'text', ink: 'png' })
  return exportFile(format, data, '', '')
}

// ---------- ZIP of Markdown ----------

interface Manifest {
  format: 'ofimeo-notebook'
  version: 1
  title: string
  sections: { name: string; color: string; folder: string; pages: { file: string; title: string; level: number; ink?: Stroke[] }[] }[]
}

const EXTS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'application/pdf': 'pdf' }

export async function exportNotebookZip(doc: Y.Doc): Promise<Blob> {
  const [{ default: JSZip }, { exportMarkdown }] = await Promise.all([import('jszip'), import('../writer/formats/markdown')])
  const zip = new JSZip()
  const assets = new Map<string, string>()
  const manifest: Manifest = { format: 'ofimeo-notebook', version: 1, title: notebookTitle(doc), sections: [] }
  const usedFolders = new Set<string>()
  const unique = (used: Set<string>, base: string) => {
    let name = base
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base} (${i})`
    used.add(name.toLowerCase())
    return name
  }
  // data: URLs become files in assets/ (the same data is stored once).
  const extract = (md: string, prefix: string) =>
    md.replace(/\]\((data:([\w.+/-]+)(?:;[\w=.-]+)*;base64,([A-Za-z0-9+/=]+))\)/g, (_m, url: string, mime: string, data: string) => {
      let path = assets.get(url)
      if (!path) {
        const ext = EXTS[mime] ?? mime.split('/')[1]?.replace(/[^a-z0-9]/gi, '').slice(0, 5) ?? 'bin'
        path = `assets/${String(assets.size + 1).padStart(3, '0')}.${ext}`
        assets.set(url, path)
        zip.file(path, data, { base64: true })
      }
      return `](${prefix}${path})`
    })
  for (const section of readSections(doc)) {
    const folder = unique(usedFolders, safeFileName(section.name || t('Section')))
    const entry: Manifest['sections'][number] = { name: section.name, color: section.color, folder, pages: [] }
    const usedFiles = new Set<string>()
    for (const [i, page] of readPages(doc, section.id).entries()) {
      const file = unique(usedFiles, `${String(i + 1).padStart(2, '0')} ${safeFileName(pageTitle(page))}`) + '.md'
      const body: JSONContent = { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: pageTitle(page) }] }, ...pageContent(doc, page.id, { files: 'link', ink: 'none' })] }
      let md = extract(exportMarkdown(body), '../')
      const strokes = inkArray(doc, page.id).toArray()
      const svg = strokes.length ? inkSvg(strokes) : null
      if (svg) {
        const path = `assets/ink-${page.id}.svg`
        zip.file(path, svg)
        md += `\n![${t('Ink')}](../${path})\n`
      }
      zip.file(`${folder}/${file}`, md)
      entry.pages.push({ file, title: page.title, level: page.level, ...(strokes.length ? { ink: strokes } : {}) })
    }
    manifest.sections.push(entry)
  }
  zip.file('notebook.json', JSON.stringify(manifest, null, 1))
  return zip.generateAsync({ type: 'blob', mimeType: 'application/zip' })
}

// ---------- Import ----------

export interface ImportFile {
  // Path inside the ZIP or the chosen folder ("Section/01 Page.md").
  path: string
  read: () => Promise<Uint8Array>
}

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', pdf: 'application/pdf' }
// Pictures and files larger than this are left out of imported pages.
const IMPORT_ASSET_MAX = 5 * 1024 * 1024

export async function filesFromZip(file: Blob): Promise<ImportFile[]> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(file)
  return Object.values(zip.files)
    .filter((f) => !f.dir && !f.name.startsWith('__MACOSX/'))
    .map((f) => ({ path: f.name, read: () => f.async('uint8array') }))
}

export function filesFromList(list: FileList | File[]): ImportFile[] {
  return [...list].map((f) => ({ path: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name, read: async () => new Uint8Array(await f.arrayBuffer()) }))
}

function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

const dirOf = (path: string) => path.slice(0, path.lastIndexOf('/') + 1)
function resolvePath(base: string, rel: string): string {
  const parts = (base + rel).split('/')
  const out: string[] = []
  for (const p of parts) {
    if (p === '..') out.pop()
    else if (p !== '.') out.push(p)
  }
  return out.join('/')
}

interface ParsedPage {
  title: string
  body: JSONContent
  level: number
  ink?: Stroke[]
}

// Markdown text → page title and body (the first "# heading" is the title).
async function parseMarkdown(md: string, fallbackTitle: string, base: string, files: Map<string, ImportFile>): Promise<{ title: string; body: JSONContent }> {
  const { importMarkdown } = await import('../writer/formats/markdown')
  // Local pictures and linked files become data: URLs; our ink pictures are restored from the manifest instead.
  const links = [...md.matchAll(/(!?)\[([^\]]*)\]\(<?([^)\s>]+)>?\)/g)]
  const replacements = new Map<string, string>()
  for (const [, , , target] of links) {
    if (/^[a-z]+:/i.test(target) || replacements.has(target)) continue
    const path = resolvePath(base, decodeURIComponent(target))
    const file = files.get(path.toLowerCase())
    if (!file) continue
    const bytes = await file.read()
    if (bytes.length > IMPORT_ASSET_MAX) continue
    const ext = path.split('.').pop()!.toLowerCase()
    replacements.set(target, `data:${MIME[ext] ?? 'application/octet-stream'};base64,${toBase64(bytes)}`)
  }
  const text = md
    .replace(/\n?!\[[^\]]*\]\(<?[^)\s>]*assets\/ink-[\w]+\.svg>?\)\n?/g, '\n')
    .replace(/(!?\[[^\]]*\]\()<?([^)\s>]+)>?\)/g, (m, head: string, target: string) => (replacements.has(target) ? `${head}${replacements.get(target)})` : m))
  let title = fallbackTitle
  let source = text.replace(/^﻿/, '')
  const heading = /^\s*#\s+(.+?)\s*#*\s*(\n|$)/.exec(source)
  if (heading) {
    title = heading[1].trim()
    source = source.slice(heading[0].length)
  }
  const body = restoreTags(await importMarkdown(source))
  return { title, body }
}

// Paragraphs starting with a tag symbol get the tag back.
function restoreTags(node: JSONContent): JSONContent {
  const out: JSONContent = { ...node, content: node.content?.map(restoreTags) }
  if ((node.type === 'paragraph' || node.type === 'heading') && node.content?.[0]?.type === 'text') {
    const first = node.content[0]
    const entry = (Object.entries(TAG_PREFIX) as [TagId, string][]).find(([, p]) => first.text?.startsWith(`${p} `))
    if (entry) {
      const rest = first.text!.slice(entry[1].length + 1)
      out.attrs = { ...node.attrs, nbTag: entry[0] }
      out.content = [...(rest ? [{ ...first, text: rest }] : []), ...node.content.slice(1).map(restoreTags)]
    }
  }
  return out
}

export interface ImportResult {
  sections: number
  pages: number
}

// Adds the Markdown pages of a ZIP, a folder or single files to the notebook
// (folders become sections; files at the top go to `fallbackSection`).
export async function importMarkdownFiles(doc: Y.Doc, list: ImportFile[], fallbackSection: () => string, origin: unknown): Promise<ImportResult> {
  const files = new Map(list.map((f) => [f.path.toLowerCase(), f]))
  const mdFiles = list.filter((f) => /\.(md|markdown)$/i.test(f.path)).sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }))
  if (!mdFiles.length) throw new Error(t('No Markdown files were found'))
  // A notebook exported from Ofimeo: its manifest keeps colours, levels and ink.
  const manifestFile = list.find((f) => /(^|\/)notebook\.json$/i.test(f.path))
  let manifest: Manifest | null = null
  let root = ''
  if (manifestFile) {
    try {
      const parsed = JSON.parse(new TextDecoder().decode(await manifestFile.read())) as Manifest
      if (parsed?.format === 'ofimeo-notebook') {
        manifest = parsed
        root = dirOf(manifestFile.path)
      }
    } catch {
      // Not ours: plain Markdown import.
    }
  }
  const groups = new Map<string, { name: string; color?: string; pages: ParsedPage[] }>()
  const decoder = new TextDecoder()
  if (manifest) {
    for (const s of manifest.sections) {
      const group = { name: s.name, color: s.color, pages: [] as ParsedPage[] }
      for (const p of s.pages) {
        const path = `${root}${s.folder}/${p.file}`
        const file = files.get(path.toLowerCase())
        if (!file) continue
        const parsed = await parseMarkdown(decoder.decode(await file.read()), p.title, dirOf(path), files)
        group.pages.push({ title: p.title ?? parsed.title, body: parsed.body, level: p.level || 0, ink: Array.isArray(p.ink) ? p.ink : undefined })
      }
      groups.set(`${s.folder}/`, group)
    }
  } else {
    // A chosen folder or a ZIP often has one folder around everything: skip it.
    const tops = new Set(mdFiles.map((f) => f.path.split('/')[0]))
    const strip = tops.size === 1 && mdFiles.every((f) => f.path.includes('/')) && mdFiles.some((f) => f.path.split('/').length > 2)
    for (const f of mdFiles) {
      const parts = f.path.split('/')
      if (strip) parts.shift()
      const folder = parts.length > 1 ? parts.slice(0, -1).join(' / ') : ''
      const name = parts.at(-1)!.replace(/\.(md|markdown)$/i, '').replace(/^\d+\s+/, '')
      const parsed = await parseMarkdown(decoder.decode(await f.read()), name, dirOf(f.path), files)
      if (!groups.has(folder)) groups.set(folder, { name: folder, pages: [] })
      groups.get(folder)!.pages.push({ title: parsed.title, body: parsed.body, level: 0 })
    }
  }
  const schema = getSchema(notebookExtensions())
  let pages = 0
  let sections = 0
  doc.transact(() => {
    for (const group of groups.values()) {
      if (!group.pages.length) continue
      const section = group.name ? addSection(doc, group.name, group.color) : fallbackSection()
      if (group.name) sections++
      let after: string | undefined
      for (const p of group.pages) {
        after = addPage(doc, section, p.title, {
          level: p.level,
          content: (fragment) => {
            try {
              prosemirrorJSONToYXmlFragment(schema, p.body, fragment)
            } catch (err) {
              console.warn('Notebook import: page content skipped', err)
            }
          },
        })
        if (p.ink?.length) inkArray(doc, after).push(p.ink.filter((s) => s && Array.isArray(s.points)))
        pages++
      }
    }
  }, origin)
  return { sections, pages }
}

// A new notebook from Markdown files (home screen ▸ Open, File ▸ Open…).
export async function createNotebookFromFiles(title: string, list: ImportFile[]): Promise<string> {
  const { createLocalDocument } = await import('../../core/session')
  let error: Error | null = null
  let filled: Y.Doc | null = null
  // Parsing is asynchronous: import into a scratch document first, then copy its state.
  const scratch = new Y.Doc()
  try {
    await importMarkdownFiles(scratch, list, () => addSection(scratch, t('Imported')), null)
    filled = scratch
  } catch (err) {
    error = err as Error
  }
  if (error || !filled) throw error ?? new Error(t('No Markdown files were found'))
  const state = Y.encodeStateAsUpdate(filled)
  return createLocalDocument('notebook', title, (doc) => Y.applyUpdate(doc, state))
}
