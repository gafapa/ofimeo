// Neutral diagram model shared by the editor, the Yjs sync and the .drawio
// converters. It mirrors draw.io's mxGraphModel so files round-trip, but it is
// plain data (no maxGraph objects), which keeps converters and sync simple.

import { t } from '../../core/i18n'

export interface GeometryRecord {
  x: number
  y: number
  width: number
  height: number
  // Edge labels and child ports use relative geometry.
  relative?: 1
  // Edge waypoints and dangling end points.
  points?: [number, number][]
  sourcePoint?: [number, number]
  targetPoint?: [number, number]
  offset?: [number, number]
  // Expanded/collapsed size of containers (draw.io's alternateBounds): [x, y, width, height].
  alternateBounds?: [number, number, number, number]
}

export interface CellRecord {
  id: string
  // Parent cell id; absent for the root cell ("0").
  parent?: string
  // Previous sibling id (child order within the parent); absent for the first child.
  previous?: string
  vertex?: 1
  edge?: 1
  // Label; HTML when the style has html=1.
  value?: string
  // draw.io style string, e.g. "rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;".
  style?: string
  // JSON-encoded GeometryRecord.
  geometry?: string
  source?: string
  target?: string
  connectable?: 0
  collapsed?: 1
  visible?: 0
  // JSON-encoded extra attributes of draw.io user objects (link, tooltip, custom data…).
  data?: string
}

// Page settings kept with each page (draw.io's mxGraphModel attributes).
export interface PageAttrs {
  // Page background color ("none" or absent: transparent / white).
  background?: string
  // Page size for the page view and printing, in px (draw.io default 850×1100).
  pageWidth?: number
  pageHeight?: number
}

export const PAGE_ATTRS = ['background', 'pageWidth', 'pageHeight'] as const

export interface PageRecord extends PageAttrs {
  id: string
  name: string
  cells: CellRecord[]
}

// Keys of CellRecord other than id: the per-field unit of collaborative merging.
export const CELL_FIELDS = ['parent', 'previous', 'vertex', 'edge', 'value', 'style', 'geometry', 'source', 'target', 'connectable', 'collapsed', 'visible', 'data'] as const
export type CellField = (typeof CELL_FIELDS)[number]

// A new diagram: one page with the standard root and default layer.
export function emptyPage(id = 'page-1', name = 'Page-1'): PageRecord {
  return { id, name, cells: [{ id: '0' }, { id: '1', parent: '0' }] }
}

// Name shown for a page: the fixed name of the first page of a new diagram
// ("Page-1", stored as is so replicas agree) is shown in the interface language.
export function pageDisplayName(name: string): string {
  return name === 'Page-1' ? t('Page {n}', { n: 1 }) : name
}

// Random cell id in draw.io's style (20 URL-safe characters).
export function newCellId(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  const bytes = crypto.getRandomValues(new Uint8Array(20))
  return Array.from(bytes, (b) => alphabet[b & 63]).join('')
}

export function parseGeometry(json: string | undefined): GeometryRecord | null {
  if (!json) return null
  try {
    return JSON.parse(json) as GeometryRecord
  } catch {
    return null
  }
}

// draw.io style strings: "base1;base2;key=value;..." ↔ ordered key/value list.
export function parseStyle(style: string | undefined): { bases: string[]; values: Map<string, string> } {
  const bases: string[] = []
  const values = new Map<string, string>()
  for (const part of (style ?? '').split(';')) {
    if (!part) continue
    const eq = part.indexOf('=')
    if (eq < 0) bases.push(part)
    else values.set(part.slice(0, eq), part.slice(eq + 1))
  }
  return { bases, values }
}

export function stringifyStyle({ bases, values }: { bases: string[]; values: Map<string, string> }): string {
  const parts = [...bases, ...[...values].map(([k, v]) => `${k}=${v}`)]
  return parts.length ? `${parts.join(';')};` : ''
}

// Sets (or removes, with null) one key in a style string, keeping the rest intact.
export function setStyleValue(style: string | undefined, key: string, value: string | number | null): string {
  const parsed = parseStyle(style)
  if (value === null || value === '') parsed.values.delete(key)
  else parsed.values.set(key, String(value))
  return stringifyStyle(parsed)
}

export function getStyleValue(style: string | undefined, key: string): string | undefined {
  return parseStyle(style).values.get(key)
}
