// Small PDFs for the PDF app tests, made with pdf-lib: two pages of text, the
// second one rotated, and optionally a highlight and a sticky note made by
// another program (to test importing existing annotations).
import { PDFDocument, PDFHexString, PDFName, PDFString, StandardFonts, degrees } from 'pdf-lib'

export async function makeFixturePdf(withAnnotations = false): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const p1 = doc.addPage([595, 842])
  p1.drawText('Exam of Physics', { x: 72, y: 760, size: 24, font })
  p1.drawText('Question 1: The speed of light is 300000 km/s.', { x: 72, y: 700, size: 14, font })
  p1.drawText('Question 2: Water boils at 90 degrees at sea level.', { x: 72, y: 670, size: 14, font })
  const p2 = doc.addPage([595, 842])
  p2.setRotation(degrees(90))
  p2.drawText('Second page, rotated.', { x: 72, y: 760, size: 18, font })
  if (withAnnotations) {
    const ctx = doc.context
    const hl = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Highlight', Rect: [70, 695, 400, 716], QuadPoints: [70, 716, 400, 716, 70, 695, 400, 695], C: [1, 1, 0], T: PDFHexString.fromText('Other reader'), Contents: PDFHexString.fromText('light') }))
    const note = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Text', Rect: [500, 700, 520, 720], Name: 'Comment', C: [1, 0.8, 0], T: PDFHexString.fromText('Other reader'), Contents: PDFString.of('Check units') }))
    const reply = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Text', Rect: [500, 700, 520, 720], IRT: note, RT: 'R', T: PDFHexString.fromText('Student'), Contents: PDFString.of('Fixed') }))
    const link = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Link', Rect: [72, 600, 200, 620], A: { S: 'URI', URI: PDFString.of('https://example.org') } }))
    p1.node.set(PDFName.of('Annots'), ctx.obj([hl, note, reply, link]))
  }
  return doc.save()
}
