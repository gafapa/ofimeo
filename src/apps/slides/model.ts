// Presentation model on top of the diagram model: each slide is a diagram page
// whose visible area is a fixed frame at (0, 0). Themes and layouts are plain
// data; placeholders are text cells marked with slidePh=<role> in their style,
// whose font and color come from the theme until someone sets them.

import * as Y from 'yjs'
import { t } from '../../core/i18n'
import { emptyPage, newCellId, type CellRecord, type PageRecord } from '../diagram/model'
import { animationsMap, type Animation } from './animations'

export type Ratio = '16:9' | '4:3'
export const SLIDE_SIZES: Record<Ratio, { width: number; height: number }> = {
  '16:9': { width: 960, height: 540 },
  '4:3': { width: 960, height: 720 },
}

export interface Theme {
  id: string
  name: string
  // CSS color, or two colors for a vertical gradient.
  background: string | [string, string]
  // CSS font lists; exports use the first family.
  titleFont: string
  bodyFont: string
  titleColor: string
  bodyColor: string
  accent: string
}

export const THEMES: Theme[] = [
  { id: 'light', name: t('Light'), background: '#ffffff', titleFont: 'Helvetica', bodyFont: 'Helvetica', titleColor: '#1f2937', bodyColor: '#374151', accent: '#1a73e8' },
  { id: 'dark', name: t('Dark'), background: '#1f2430', titleFont: 'Helvetica', bodyFont: 'Helvetica', titleColor: '#ffffff', bodyColor: '#d7dbe4', accent: '#7cb7ff' },
  { id: 'ocean', name: t('Ocean'), background: ['#0f4c81', '#1d7fb8'], titleFont: 'Trebuchet MS, Helvetica, Arial, sans-serif', bodyFont: 'Trebuchet MS, Helvetica, Arial, sans-serif', titleColor: '#ffffff', bodyColor: '#e3f1fb', accent: '#ffd166' },
  { id: 'paper', name: t('Paper'), background: '#fbf6ec', titleFont: 'Georgia, Times New Roman, serif', bodyFont: 'Georgia, Times New Roman, serif', titleColor: '#9a3412', bodyColor: '#3f3a34', accent: '#b45309' },
  { id: 'chalk', name: t('Chalkboard'), background: '#2e4a3b', titleFont: 'Architects Daughter', bodyFont: 'Architects Daughter', titleColor: '#fdfcf5', bodyColor: '#e9efe6', accent: '#ffe08a' },
  { id: 'fresh', name: t('Fresh'), background: ['#f0fdf4', '#dcfce7'], titleFont: 'Verdana, Helvetica, Arial, sans-serif', bodyFont: 'Verdana, Helvetica, Arial, sans-serif', titleColor: '#166534', bodyColor: '#1f2937', accent: '#16a34a' },
]

// Unknown ids (e.g. "imported": a file with its own theme) look like the first
// theme but keep their id, so the theme picker shows none of them as chosen.
export function themeById(id: unknown): Theme {
  return THEMES.find((th) => th.id === id) ?? (typeof id === 'string' && id ? { ...THEMES[0], id } : THEMES[0])
}

export type LayoutId = 'title' | 'titleContent' | 'twoColumns' | 'section' | 'titleOnly' | 'blank'
export type Role = 'title' | 'subtitle' | 'body' | 'body2'

export const LAYOUTS: { id: LayoutId; name: string }[] = [
  { id: 'title', name: t('Title slide') },
  { id: 'titleContent', name: t('Title and content') },
  { id: 'twoColumns', name: t('Two columns') },
  { id: 'section', name: t('Section header') },
  { id: 'titleOnly', name: t('Title only') },
  { id: 'blank', name: t('Blank') },
]

export const layoutName = (id: LayoutId) => LAYOUTS.find((l) => l.id === id)?.name ?? t('Blank')

export const PLACEHOLDER_HINTS: Record<Role, string> = {
  title: t('Click to add title'),
  subtitle: t('Click to add subtitle'),
  body: t('Click to add text'),
  body2: t('Click to add text'),
}

interface Placeholder {
  role: Role
  x: number
  y: number
  width: number
  height: number
  fontSize: number
  align: 'left' | 'center'
  valign: 'top' | 'middle' | 'bottom'
  bold?: boolean
}

// Placeholder boxes of a layout for a slide size.
export function layoutPlaceholders(layout: LayoutId, width: number, height: number): Placeholder[] {
  const m = 48
  const w = width - 2 * m
  const titleH = 90
  const bodyY = m + titleH + 16
  const bodyH = height - bodyY - m
  switch (layout) {
    case 'title':
      return [
        { role: 'title', x: m, y: height * 0.26, width: w, height: 120, fontSize: 48, align: 'center', valign: 'bottom', bold: true },
        { role: 'subtitle', x: m, y: height * 0.26 + 136, width: w, height: 70, fontSize: 24, align: 'center', valign: 'top' },
      ]
    case 'titleContent':
      return [
        { role: 'title', x: m, y: m, width: w, height: titleH, fontSize: 36, align: 'left', valign: 'middle', bold: true },
        { role: 'body', x: m, y: bodyY, width: w, height: bodyH, fontSize: 24, align: 'left', valign: 'top' },
      ]
    case 'twoColumns': {
      const col = (w - 32) / 2
      return [
        { role: 'title', x: m, y: m, width: w, height: titleH, fontSize: 36, align: 'left', valign: 'middle', bold: true },
        { role: 'body', x: m, y: bodyY, width: col, height: bodyH, fontSize: 22, align: 'left', valign: 'top' },
        { role: 'body2', x: m + col + 32, y: bodyY, width: col, height: bodyH, fontSize: 22, align: 'left', valign: 'top' },
      ]
    }
    case 'section':
      return [
        { role: 'title', x: m, y: height * 0.36, width: w, height: 100, fontSize: 44, align: 'left', valign: 'bottom', bold: true },
        { role: 'subtitle', x: m, y: height * 0.36 + 110, width: w, height: 60, fontSize: 22, align: 'left', valign: 'top' },
      ]
    case 'titleOnly':
      return [{ role: 'title', x: m, y: m, width: w, height: titleH, fontSize: 36, align: 'left', valign: 'middle', bold: true }]
    default:
      return []
  }
}

export function placeholderStyle(p: Placeholder): string {
  return (
    `text;html=1;whiteSpace=wrap;overflow=hidden;strokeColor=none;fillColor=none;spacing=8;` +
    `align=${p.align};verticalAlign=${p.valign};fontSize=${p.fontSize};${p.bold ? 'fontStyle=1;' : ''}slidePh=${p.role};`
  )
}

// Style of a new text box on a slide.
export const TEXT_BOX_STYLE = 'text;html=1;whiteSpace=wrap;overflow=hidden;strokeColor=none;fillColor=none;spacing=8;align=left;verticalAlign=top;fontSize=20;slideText=1;'

// Cells of a new slide: root, layer and the layout's placeholders.
export function slideCells(layout: LayoutId, width: number, height: number, idOf: (role: Role) => string = () => newCellId()): CellRecord[] {
  const cells = emptyPage().cells
  let previous: string | undefined
  for (const p of layoutPlaceholders(layout, width, height)) {
    const id = idOf(p.role)
    cells.push({
      id,
      parent: '1',
      ...(previous ? { previous } : {}),
      vertex: 1,
      style: placeholderStyle(p),
      geometry: JSON.stringify({ x: Math.round(p.x), y: Math.round(p.y), width: Math.round(p.width), height: Math.round(p.height) }),
    })
    previous = id
  }
  return cells
}

// First slide of an empty presentation; fixed ids so that people opening a new
// shared presentation at the same time merge into one slide.
export function blankSlide(id = 'page-1', name = 'Slide 1'): PageRecord {
  const { width, height } = SLIDE_SIZES['16:9']
  return { id, name, cells: slideCells('title', width, height, (role) => `${id}-${role}`) }
}

// ---------- Shared settings in Yjs ----------

// Presentation settings (theme, size) live in the meta map; per slide
// settings (layout, background) in their own map; notes in one Y.Text per slide.
export const META_THEME = 'slides-theme'
export const META_RATIO = 'slides-ratio'
const SLIDE_META = 'slides-meta'
const notesKey = (pageId: string) => `slides-notes:${pageId}`

export interface SlideMeta {
  layout?: LayoutId
  background?: string
  // Transition when presenting: none, fade, push or wipe (animations.ts), and its length in ms.
  transition?: string
  transitionDuration?: string
}

export function slideMetaMap(doc: Y.Doc): Y.Map<Y.Map<string>> {
  return doc.getMap<Y.Map<string>>(SLIDE_META)
}

export function readSlideMeta(doc: Y.Doc, pageId: string): SlideMeta {
  const m = slideMetaMap(doc).get(pageId)
  return m ? (Object.fromEntries(m.entries()) as SlideMeta) : {}
}

export function writeSlideMeta(doc: Y.Doc, pageId: string, values: Partial<Record<keyof SlideMeta, string | null>>, origin?: unknown): void {
  doc.transact(() => {
    const all = slideMetaMap(doc)
    let m = all.get(pageId)
    if (!m) {
      m = new Y.Map<string>()
      all.set(pageId, m)
    }
    for (const [k, v] of Object.entries(values)) {
      if (v === null || v === undefined || v === '') m.delete(k)
      else m.set(k, v)
    }
  }, origin)
}

export function notesText(doc: Y.Doc, pageId: string): Y.Text {
  return doc.getText(notesKey(pageId))
}

export function presentationSize(doc: Y.Doc): { width: number; height: number; ratio: Ratio } {
  const ratio = doc.getMap<unknown>('meta').get(META_RATIO) === '4:3' ? '4:3' : '16:9'
  return { ...SLIDE_SIZES[ratio], ratio }
}

export function presentationTheme(doc: Y.Doc): Theme {
  return themeById(doc.getMap<unknown>('meta').get(META_THEME))
}

// Everything export and import need about a presentation.
export interface SlideData {
  id: string
  name: string
  cells: CellRecord[]
  notes: string
  background?: string
  layout?: LayoutId
  animations?: Animation[]
  transition?: string
  transitionDuration?: number
}

export interface PresentationData {
  width: number
  height: number
  ratio: Ratio
  theme: Theme
  slides: SlideData[]
}

// Writes a whole presentation into an empty document (import).
export function writePresentation(doc: Y.Doc, data: { ratio: Ratio; themeId?: string; slides: SlideData[] }, setPages: (doc: Y.Doc, pages: PageRecord[]) => void): void {
  doc.transact(() => {
    const meta = doc.getMap<unknown>('meta')
    meta.set(META_RATIO, data.ratio)
    if (data.themeId) meta.set(META_THEME, data.themeId)
    setPages(doc, data.slides.map((s) => ({ id: s.id, name: s.name, cells: s.cells })))
    for (const s of data.slides) {
      if (s.notes) notesText(doc, s.id).insert(0, s.notes)
      if (s.background || s.layout || s.transition) {
        writeSlideMeta(doc, s.id, {
          background: s.background ?? null,
          layout: s.layout ?? null,
          transition: s.transition && s.transition !== 'none' ? s.transition : null,
          transitionDuration: s.transition && s.transitionDuration ? String(s.transitionDuration) : null,
        })
      }
      for (const { id, ...a } of s.animations ?? []) {
        const m = new Y.Map<string | number>()
        animationsMap(doc, s.id).set(id, m)
        for (const [k, v] of Object.entries(a)) m.set(k, v)
      }
    }
  })
}

// CSS background of a slide.
export function backgroundCss(bg: string | [string, string]): string {
  return Array.isArray(bg) ? `linear-gradient(to bottom, ${bg[0]}, ${bg[1]})` : bg
}

// A slide background stored as text: "#rrggbb" or "#a,#b" (gradient).
export function parseBackground(stored: string | undefined, theme: Theme): string | [string, string] {
  if (!stored) return theme.background
  const parts = stored.split(',')
  return parts.length === 2 ? [parts[0], parts[1]] : stored
}
