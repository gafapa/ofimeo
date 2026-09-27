// Results as a table: CSV and XLSX downloads, and "Open in Ofimeo Sheets"
// (an .xlsx imported by the spreadsheet app as a new local document).

import type * as Y from 'yjs'
import { t, locale } from '../../core/i18n'
import { downloadBlob, safeFileName } from '../../core/handin'
import { scoreResponse } from './grading'
import { answerText, gradesMap, questionsOf, readItems, readSettings, responsesMap, type FormResponse } from './model'
import { keyLookup } from './state'

export type Cell = string | number | Date

export function resultsTable(doc: Y.Doc, priv: Y.Doc): { header: string[]; rows: Cell[][] } {
  const items = readItems(doc)
  const questions = questionsOf(items)
  const quiz = readSettings(doc).quiz
  const responses = sortedResponses(priv)
  const header = [t('Submitted'), t('Name'), t('Class or group')]
  if (quiz) header.push(t('Score'), t('Maximum'))
  header.push(...questions.map((q) => q.title || t('Untitled question')))
  if (quiz) header.push(...questions.map((q) => `${t('Points')}: ${q.title || t('Untitled question')}`))
  const rows = responses.map((r) => {
    const sheet = quiz ? scoreResponse(items, keyLookup(priv), r, gradesMap(priv).get(r.id)) : null
    const row: Cell[] = [new Date(r.submittedAt), r.name, r.group]
    if (sheet) row.push(sheet.score, sheet.max)
    row.push(...questions.map((q) => (q.type === 'number' && typeof r.answers[q.id] === 'number' ? (r.answers[q.id] as number) : answerText(q, r.answers[q.id]))))
    if (sheet) row.push(...questions.map((q) => sheet.questions[q.id].points ?? ''))
    return row
  })
  return { header, rows }
}

export const sortedResponses = (priv: Y.Doc): FormResponse[] => [...responsesMap(priv).values()].sort((a, b) => a.submittedAt - b.submittedAt)

const csvCell = (c: Cell) => {
  const s = c instanceof Date ? c.toLocaleString(locale) : String(c)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(table: { header: string[]; rows: Cell[][] }): Blob {
  const lines = [table.header, ...table.rows].map((r) => r.map(csvCell).join(','))
  return new Blob([`﻿${lines.join('\r\n')}\r\n`], { type: 'text/csv' })
}

export async function toXlsx(table: { header: string[]; rows: Cell[][] }, title: string): Promise<Blob> {
  const { ExcelJS } = await import('../sheet/formats/xlsx-import')
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(safeFileName(title).slice(0, 31) || 'Results')
  ws.addRow(table.header).font = { bold: true }
  for (const row of table.rows) ws.addRow(row)
  ws.getColumn(1).numFmt = 'yyyy-mm-dd hh:mm'
  ws.columns.forEach((c, i) => (c.width = i === 0 ? 18 : Math.min(40, Math.max(12, String(table.header[i] ?? '').length + 2))))
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  const buffer = await wb.xlsx.writeBuffer()
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

const titleOf = (doc: Y.Doc) => String(doc.getMap('meta').get('title') || t('Untitled form'))

export async function downloadResults(doc: Y.Doc, priv: Y.Doc, format: 'csv' | 'xlsx'): Promise<void> {
  const table = resultsTable(doc, priv)
  const name = `${safeFileName(`${titleOf(doc)} - ${t('Responses')}`)}.${format}`
  downloadBlob(format === 'csv' ? toCsv(table) : await toXlsx(table, titleOf(doc)), name)
}

// Creates a spreadsheet with the results and opens it in a new tab.
export async function openInSheets(doc: Y.Doc, priv: Y.Doc): Promise<string> {
  const title = `${titleOf(doc)} - ${t('Responses')}`
  const blob = await toXlsx(resultsTable(doc, priv), titleOf(doc))
  const [{ importSheetFile }, { SheetSync }, { createLocalDocument }] = await Promise.all([import('../sheet/formats'), import('../sheet/sync'), import('../../core/session')])
  const data = await importSheetFile(new File([blob], `${safeFileName(title)}.xlsx`))
  const path = await createLocalDocument('sheet', title, (d) => SheetSync.setBase(d, data))
  window.open(path, '_blank')
  return path
}
