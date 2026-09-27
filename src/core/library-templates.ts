// Own templates: snapshots of documents saved with File ▸ Save as template…,
// kept in this browser (IndexedDB 'templates' in library.ts) and listed in the
// gallery under "My templates". They can be exported and imported as
// .ofimeo-template files (JSON: format, version, app, name, description,
// thumb, created, state as base64) so a department can distribute them, also
// through a "Plantillas" folder in Nextcloud when an account is linked.

import * as Y from 'yjs'
import { appInfo } from '../apps/registry'
import { base64 } from './backup'
import { cleanCopy, createCopyFromState } from './copy'
import { safeFileName } from './handin'
import { t } from './i18n'
import { dbAll, dbDelete, dbGet, dbPut } from './library'
import { extractText } from './library-extract'
import type { Session } from './session'
import { DOC_TYPES, type DocType } from './store'
import { snapshotState } from './versions'

export const TEMPLATE_EXT = '.ofimeo-template'
const FORMAT = 'ofimeo-template'
export const NEXTCLOUD_TEMPLATES = '/Plantillas'

export interface OwnTemplate {
  id: string
  app: DocType
  name: string
  description: string
  // Preview image (data: URL).
  thumb: string
  created: number
  state: Uint8Array
  // The app's editor-only state (a form's answer key), when saved by an editor.
  privateState?: Uint8Array
}

const newId = () => crypto.getRandomValues(new Uint32Array(2)).join('-')

export async function listOwnTemplates(): Promise<OwnTemplate[]> {
  return (await dbAll<OwnTemplate>('templates')).filter((tpl) => tpl?.state instanceof Uint8Array).sort((a, b) => b.created - a.created)
}

export async function updateOwnTemplate(id: string, patch: Partial<Pick<OwnTemplate, 'name' | 'description'>>): Promise<void> {
  const tpl = await dbGet<OwnTemplate>('templates', id)
  if (tpl) await dbPut('templates', { ...tpl, ...patch })
}

export const deleteOwnTemplate = (id: string) => dbDelete('templates', id)

// Creates a new document from the template and returns its path.
export const useOwnTemplate = (tpl: OwnTemplate) => createCopyFromState(tpl.app, tpl.name, tpl.state, tpl.privateState)

// Saves the open document as a template.
export async function saveTemplateFromSession(session: Session, name: string, description: string): Promise<OwnTemplate> {
  const copy = new Y.Doc()
  Y.applyUpdate(copy, snapshotState(session.doc))
  cleanCopy(session.type, copy)
  copy.getMap('meta').set('title', name)
  const state = Y.encodeStateAsUpdate(copy)
  copy.destroy()
  const privateState = session.canEdit ? session.hooks.privateState?.snapshot() : null
  const tpl: OwnTemplate = { id: newId(), app: session.type, name, description, thumb: await sessionThumb(session, name), created: Date.now(), state, ...(privateState ? { privateState } : {}) }
  await dbPut('templates', tpl)
  return tpl
}

// ---------- Files ----------

export function templateFile(tpl: OwnTemplate): { blob: Blob; name: string } {
  const { state, privateState, id: _id, ...rest } = tpl
  const json = JSON.stringify({ format: FORMAT, version: 1, ...rest, state: base64.encode(state), ...(privateState ? { privateState: base64.encode(privateState) } : {}) })
  return { blob: new Blob([json], { type: 'application/json' }), name: `${safeFileName(tpl.name)}${TEMPLATE_EXT}` }
}

export async function importTemplateFile(file: Blob): Promise<OwnTemplate> {
  let data: Partial<Omit<OwnTemplate, 'state' | 'privateState'>> & { format?: string; state?: string; privateState?: string }
  try {
    data = JSON.parse(await file.text())
  } catch {
    data = {}
  }
  if (data.format !== FORMAT || !data.state || !data.app || !DOC_TYPES.includes(data.app)) throw new Error(t('This file is not an Ofimeo template.'))
  const state = base64.decode(data.state)
  // Must be valid Yjs updates.
  Y.applyUpdate(new Y.Doc(), state)
  const privateState = typeof data.privateState === 'string' ? base64.decode(data.privateState) : undefined
  if (privateState) Y.applyUpdate(new Y.Doc(), privateState)
  const tpl: OwnTemplate = {
    id: newId(),
    app: data.app,
    name: String(data.name || appInfo(data.app).untitled),
    description: String(data.description ?? ''),
    thumb: typeof data.thumb === 'string' && data.thumb.startsWith('data:image/') ? data.thumb : iconThumb(data.app),
    created: Date.now(),
    state,
    ...(privateState ? { privateState } : {}),
  }
  await dbPut('templates', tpl)
  return tpl
}

// ---------- Nextcloud "Plantillas" folder ----------

export async function nextcloudTemplates() {
  const nc = await import('./nextcloud')
  const account = nc.currentAccount()
  if (!account) return null
  const entries = await nc.listFolder(account, NEXTCLOUD_TEMPLATES).catch((err) => {
    if (err instanceof nc.NcError && err.kind === 'not-found') return []
    throw err
  })
  return { account, files: entries.filter((e) => !e.isDir && e.name.endsWith(TEMPLATE_EXT)) }
}

export async function importFromNextcloud(path: string): Promise<OwnTemplate> {
  const nc = await import('./nextcloud')
  const account = nc.currentAccount()
  if (!account) throw new Error(t('No Nextcloud account is linked.'))
  return importTemplateFile((await nc.download(account, path)).blob)
}

export async function shareToNextcloud(tpl: OwnTemplate): Promise<string> {
  const nc = await import('./nextcloud')
  const account = nc.currentAccount()
  if (!account) throw new Error(t('No Nextcloud account is linked.'))
  if (!(await nc.stat(account, NEXTCLOUD_TEMPLATES))) await nc.createFolder(account, NEXTCLOUD_TEMPLATES)
  const file = templateFile(tpl)
  const path = nc.joinPath(NEXTCLOUD_TEMPLATES, file.name)
  await nc.upload(account, path, file.blob, { contentType: 'application/json' })
  return path
}

// ---------- Thumbnails ----------

const W = 320
const H = 200

// The app's image export when it has one (drawing, diagram), else a page with the first lines of text.
async function sessionThumb(session: Session, title: string): Promise<string> {
  const formats = session.hooks.exportFormats?.() ?? []
  const image = formats.find((f) => f.ext === 'png') ?? formats.find((f) => f.ext === 'svg')
  if (image) {
    try {
      return await scaleImage(await image.build())
    } catch {
      // Fall back to the text preview.
    }
  }
  const text = extractText(session.type, session.doc).split('\n').slice(1).join('\n')
  return textThumb(session.type, title, text)
}

async function scaleImage(blob: Blob): Promise<string> {
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, W, H)
    const scale = Math.min((W - 16) / (img.naturalWidth || W), (H - 16) / (img.naturalHeight || H), 2)
    const w = (img.naturalWidth || W) * scale
    const h = (img.naturalHeight || H) * scale
    ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h)
    return canvas.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(url)
  }
}

const escapeXml = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!)
const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

// A sheet of paper with the title and the first lines of text.
function textThumb(app: DocType, title: string, text: string): string {
  const color = appInfo(app).color
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 9)
    .map((l, i) => `<text x="44" y="${66 + i * 13}" font-size="9" fill="#5f6368">${escapeXml(l.length > 56 ? `${l.slice(0, 55)}…` : l)}</text>`)
  return svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#f1f3f4"/>` +
      `<rect x="30" y="14" width="260" height="200" fill="#ffffff" stroke="#dadce0"/><rect x="30" y="14" width="260" height="5" fill="${color}"/>` +
      `<text x="44" y="44" font-size="13" font-weight="600" font-family="sans-serif" fill="#202124">${escapeXml(title.slice(0, 40))}</text>` +
      `<g font-family="sans-serif">${lines.join('')}</g></svg>`,
  )
}

// The app's icon (templates without a preview).
export function iconThumb(app: DocType): string {
  const info = appInfo(app)
  return svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#f1f3f4"/>` +
      `<rect x="${W / 2 - 32}" y="${H / 2 - 32}" width="64" height="64" rx="12" fill="${info.color}"/>` +
      `<text x="${W / 2}" y="${H / 2 + 12}" text-anchor="middle" font-size="34" font-weight="700" font-family="sans-serif" fill="#ffffff">${info.letter}</text></svg>`,
  )
}
