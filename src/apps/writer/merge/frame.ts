// PDF output of a mail merge. The PDF export draws the paged layout on screen,
// so the combined document is stored as a temporary local document and opened
// in a hidden frame (same origin) whose writer lays it out, exports it and
// posts the file back; the temporary document is then deleted. For a ZIP the
// frame splits the PDF at the first page of each record.

import { t } from '../../../core/i18n'
import { deleteDoc } from '../../../core/store'
import type { WriterContext } from '../app'
import type { DocumentData } from '../formats/types'
import { createDocument } from './run'

const PREFIX = 'ofimeo-merge-export:'
const TIMEOUT_MS = 120_000

interface FrameJob {
  id: string
  // ZIP of one PDF per record: index of each record's first top-level node, and file names.
  split: { starts: number[]; names: string[] } | null
}

interface FrameReply {
  ofimeoMergeExport: string
  blob?: Blob
  error?: string
}

export async function exportInFrame(data: DocumentData, split: FrameJob['split']): Promise<Blob> {
  const path = await createDocument(data, `${data.title} ${t('(temporary)')}`)
  const docId = new URLSearchParams(path.split('#')[1] ?? '').get('doc') ?? ''
  const job: FrameJob = { id: crypto.getRandomValues(new Uint32Array(2)).join('-'), split }
  const frame = document.createElement('iframe')
  frame.name = PREFIX + JSON.stringify(job)
  frame.setAttribute('aria-hidden', 'true')
  frame.tabIndex = -1
  frame.style.cssText = 'position:fixed;left:-20000px;top:0;width:1200px;height:900px;border:0;opacity:0;pointer-events:none'
  try {
    return await new Promise<Blob>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(t('The PDF took too long to prepare'))), TIMEOUT_MS)
      const onMessage = (e: MessageEvent<FrameReply>) => {
        if (e.source !== frame.contentWindow || e.data?.ofimeoMergeExport !== job.id) return
        clearTimeout(timer)
        window.removeEventListener('message', onMessage)
        if (e.data.blob) resolve(e.data.blob)
        else reject(new Error(e.data.error || t('The PDF could not be created')))
      }
      window.addEventListener('message', onMessage)
      frame.src = path
      document.body.append(frame)
    })
  } finally {
    frame.remove()
    if (docId) await deleteDoc(docId).catch(() => undefined)
  }
}

// In the frame: is this window an export job?
export const isExportFrame = () => window.name.startsWith(PREFIX) && window.parent !== window

export async function runExportFrame(ctx: WriterContext): Promise<void> {
  let job: FrameJob
  try {
    job = JSON.parse(window.name.slice(PREFIX.length)) as FrameJob
  } catch {
    return
  }
  const reply = (r: Omit<FrameReply, 'ofimeoMergeExport'>) => window.parent.postMessage({ ofimeoMergeExport: job.id, ...r }, location.origin)
  try {
    await settle(ctx)
    const { exportPdf } = await import('../pdf')
    const pdf = await exportPdf(ctx)
    reply({ blob: job.split ? await splitPdf(ctx, pdf, job.split) : pdf })
  } catch (err) {
    reply({ error: (err as Error).message })
  }
}

const frames = (n = 2) => new Promise<void>((r) => {
  const step = (k: number) => (k ? requestAnimationFrame(() => step(k - 1)) : r())
  step(n)
})

// Fonts loaded, charts drawn and the page layout stable.
async function settle(ctx: WriterContext): Promise<void> {
  await document.fonts.ready
  const end = Date.now() + 20_000
  while (Date.now() < end && document.querySelector('.chart-figure[data-pending]')) await new Promise((r) => setTimeout(r, 100))
  let last = ''
  for (let i = 0; i < 50; i++) {
    await frames()
    await new Promise((r) => setTimeout(r, 120))
    const layout = ctx.layout()
    const key = `${layout.pages.length}:${layout.height}`
    if (key === last) break
    last = key
  }
}

// Page index where each record starts (from the laid-out position of its first block).
function recordPages(ctx: WriterContext, starts: number[]): number[] {
  const { editor } = ctx
  const layout = ctx.layout()
  const paper = document.getElementById('paper')!
  const rect = paper.getBoundingClientRect()
  const zoom = rect.width / (paper.offsetWidth || 1) || 1
  const positions: number[] = []
  editor.state.doc.forEach((_node, offset, index) => {
    if (starts.includes(index)) positions[starts.indexOf(index)] = offset
  })
  return positions.map((pos) => {
    const dom = editor.view.nodeDOM(pos) as HTMLElement | null
    if (!dom?.getBoundingClientRect) return 0
    const y = (dom.getBoundingClientRect().top - rect.top) / zoom + 1
    const page = [...layout.pages].reverse().find((p) => p.y <= y)
    return page ? page.index : 0
  })
}

async function splitPdf(ctx: WriterContext, pdf: Blob, split: NonNullable<FrameJob['split']>): Promise<Blob> {
  const { PDFDocument } = await import('pdf-lib')
  const JSZip = (await import('jszip')).default
  const source = await PDFDocument.load(await pdf.arrayBuffer())
  const total = source.getPageCount()
  const firsts = recordPages(ctx, split.starts)
  const zip = new JSZip()
  for (const [i, first] of firsts.entries()) {
    const last = i + 1 < firsts.length ? Math.max(first, firsts[i + 1] - 1) : total - 1
    const out = await PDFDocument.create()
    out.setTitle(split.names[i].replace(/\.pdf$/, ''))
    const pages = await out.copyPages(source, Array.from({ length: Math.max(1, last - first + 1) }, (_, k) => Math.min(total - 1, first + k)))
    pages.forEach((p) => out.addPage(p))
    zip.file(split.names[i], await out.save())
  }
  return zip.generateAsync({ type: 'blob', mimeType: 'application/zip' })
}
