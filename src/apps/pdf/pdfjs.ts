// pdf.js, loaded on demand. Its worker is bundled as a module worker chunk (a
// .js file, so the offline cache includes it).

import type * as PdfJs from 'pdfjs-dist'

let loading: Promise<typeof PdfJs> | null = null

export function pdfjs(): Promise<typeof PdfJs> {
  loading ??= (async () => {
    const [lib, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?worker')])
    lib.GlobalWorkerOptions.workerPort = new worker.default()
    return lib
  })()
  return loading
}

export async function openPdf(bytes: Uint8Array): Promise<PdfJs.PDFDocumentProxy> {
  const lib = await pdfjs()
  // pdf.js takes ownership of the buffer it is given: pass a copy.
  return lib.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise
}
