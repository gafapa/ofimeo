// Tools ▸ Mail merge…: a panel beside the document to choose the data (an
// Ofimeo spreadsheet of the library or a CSV / XLSX / ODS file), pick the
// sheet and header row, insert fields and conditional text, filter records,
// preview the document record by record and produce the output.

import { ChevronLeft, ChevronRight, X } from 'lucide'
import { t, tn } from '../../../core/i18n'
import { el, icon, showDialog, toast } from '../../../ui/widgets'
import type { WriterContext } from '../app'
import type { MergeOp, MergeRecord } from '../editor/merge'
import { DATA_FILE_ACCEPT, librarySheets, loadLibrarySheet, readDataFile, type SheetTable } from '../../charts/sheets'
import { fieldNames, mergeRecords, readSettings, readTable, tableText, writeSettings, writeTable, type FilterOp, type MergeSettings } from './data'
import { download, mergeToDocument, mergeToDocxZip, mergeToPdf } from './run'
import './merge.css'

let panel: HTMLElement | null = null

export function openMergePanel(ctx: WriterContext): void {
  if (panel?.isConnected) {
    panel.querySelector<HTMLElement>('select, button')?.focus()
    return
  }
  panel = buildPanel(ctx)
  document.body.append(panel)
  panel.querySelector<HTMLElement>('select')?.focus()
}

const FILTER_OPS: [FilterOp, () => string][] = [
  ['=', () => t('is')],
  ['<>', () => t('is not')],
  ['contains', () => t('contains')],
  ['>', () => t('greater than')],
  ['<', () => t('less than')],
  ['empty', () => t('is empty')],
  ['notEmpty', () => t('is not empty')],
]

function buildPanel(ctx: WriterContext): HTMLElement {
  const { editor, meta } = ctx
  const storage = editor.storage.mergeField
  // Tables of the file chosen in this session (files are not stored, only the chosen sheet's text).
  let fileTables: SheetTable[] | null = null
  let tables: SheetTable[] = []
  let index = 0

  const settings = () => readSettings(meta)
  const save = (patch: Partial<MergeSettings>) => writeSettings(meta, { ...settings(), ...patch })

  // ---------- Data source ----------
  const sourceSelect = el('select', { class: 'field' })
  sourceSelect.setAttribute('aria-label', t('Data source'))
  const fileInput = el('input', { type: 'file', accept: DATA_FILE_ACCEPT, hidden: true })
  const sheetSelect = el('select', { class: 'field' })
  sheetSelect.setAttribute('aria-label', t('Sheet'))
  const headerRow = el('input', { class: 'field merge-num', type: 'number', min: '1', value: '1' })
  const sourceInfo = el('p', { class: 'merge-note' })

  const fillSources = () => {
    const s = settings().source
    const options = [
      el('option', { value: '', textContent: t('Choose the data…') }),
      ...librarySheets().map((d) => el('option', { value: `sheet:${d.id}`, textContent: d.title || t('Untitled spreadsheet') })),
      el('option', { value: 'file', textContent: t('File (CSV, Excel, OpenDocument)…') }),
    ]
    if (s?.kind === 'sheet' && !options.some((o) => o.value === `sheet:${s.docId}`)) options.splice(1, 0, el('option', { value: `sheet:${s.docId}`, textContent: s.title || t('Untitled spreadsheet') }))
    if (s?.kind === 'file') options.splice(options.length - 1, 0, el('option', { value: 'current-file', textContent: s.name }))
    sourceSelect.replaceChildren(...options)
    sourceSelect.value = s?.kind === 'sheet' ? `sheet:${s.docId}` : s?.kind === 'file' ? 'current-file' : ''
  }

  const useTables = (list: SheetTable[], keep?: string) => {
    tables = list
    sheetSelect.replaceChildren(...list.map((tb) => el('option', { value: tb.id, textContent: tb.name })))
    const id = keep && list.some((tb) => tb.id === keep) ? keep : (list.find((tb) => tb.rows.length)?.id ?? list[0]?.id ?? '')
    sheetSelect.value = id
    sheetSelect.parentElement!.hidden = list.length < 2
    const tb = list.find((x) => x.id === id)
    if (tb) {
      writeTable(meta, tableText(tb))
      save({ sheet: tb.id, sheetName: tb.name })
    }
  }

  sourceSelect.addEventListener('change', async () => {
    const v = sourceSelect.value
    if (v === 'file') {
      fileInput.click()
      fillSources()
      return
    }
    if (v === 'current-file') {
      if (fileTables) useTables(fileTables, settings().sheet)
      return
    }
    if (!v.startsWith('sheet:')) return
    const docId = v.slice(6)
    const loaded = await loadLibrarySheet(docId).catch(() => null)
    if (!loaded) return toast(t('This spreadsheet is not available in this browser'))
    fileTables = null
    save({ source: { kind: 'sheet', docId, title: loaded.entry.title }, headerRow: 1, filter: null })
    useTables(loaded.tables, settings().sheet)
    index = 0
    refresh()
  })
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0]
    fileInput.value = ''
    if (!file) return
    try {
      fileTables = await readDataFile(file)
    } catch (err) {
      return toast(t('Could not open the file: {message}', { message: (err as Error).message }))
    }
    save({ source: { kind: 'file', name: file.name }, headerRow: 1, filter: null })
    useTables(fileTables)
    index = 0
    fillSources()
    refresh()
  })
  sheetSelect.addEventListener('change', () => {
    const tb = tables.find((x) => x.id === sheetSelect.value)
    if (!tb) return
    writeTable(meta, tableText(tb))
    save({ sheet: tb.id, sheetName: tb.name, filter: null })
    index = 0
    refresh()
  })
  headerRow.addEventListener('change', () => {
    save({ headerRow: Math.max(1, Math.round(Number(headerRow.value) || 1)), filter: null })
    index = 0
    refresh()
  })
  // Reload a library spreadsheet: its data may have changed since it was chosen.
  const reloadButton = el('button', { type: 'button', class: 'merge-link', textContent: t('Reload the data') })
  reloadButton.addEventListener('click', async () => {
    const s = settings().source
    if (s?.kind !== 'sheet') return
    const loaded = await loadLibrarySheet(s.docId).catch(() => null)
    if (!loaded) return toast(t('This spreadsheet is not available in this browser'))
    useTables(loaded.tables, settings().sheet)
    refresh()
    toast(t('Data reloaded'))
  })

  // ---------- Fields ----------
  const fieldList = el('div', { class: 'merge-fields' })
  const conditionButton = el('button', { type: 'button', class: 'merge-link', textContent: t('Conditional text…') })
  conditionButton.addEventListener('click', () => void conditionDialog(ctx, currentFields()))

  // ---------- Filter ----------
  const filterField = el('select', { class: 'field' })
  filterField.setAttribute('aria-label', t('Filter field'))
  const filterOp = el('select', { class: 'field' }, ...FILTER_OPS.map(([v, l]) => el('option', { value: v, textContent: l() })))
  filterOp.setAttribute('aria-label', t('Condition'))
  const filterValue = el('input', { class: 'field', placeholder: t('Value') })
  filterValue.setAttribute('aria-label', t('Value'))
  const applyFilter = () => {
    const field = filterField.value
    save({ filter: field ? { field, op: filterOp.value as FilterOp, value: filterValue.value } : null })
    index = 0
    refresh()
  }
  filterField.addEventListener('change', applyFilter)
  filterOp.addEventListener('change', applyFilter)
  filterValue.addEventListener('input', applyFilter)

  // ---------- Preview ----------
  const previewToggle = el('input', { type: 'checkbox' })
  const prev = el('button', { type: 'button', class: 'merge-icon', title: t('Previous record') }, icon(ChevronLeft, 16))
  const next = el('button', { type: 'button', class: 'merge-icon', title: t('Next record') }, icon(ChevronRight, 16))
  prev.setAttribute('aria-label', t('Previous record'))
  next.setAttribute('aria-label', t('Next record'))
  const position = el('span', { class: 'merge-position', role: 'status' })
  previewToggle.addEventListener('change', () => showPreview())
  prev.addEventListener('click', () => ((index = Math.max(0, index - 1)), showPreview()))
  next.addEventListener('click', () => ((index += 1), showPreview()))

  // ---------- Output ----------
  const nameField = el('select', { class: 'field' })
  nameField.setAttribute('aria-label', t('Name files after'))
  nameField.addEventListener('change', () => save({ nameField: nameField.value }))
  const outButton = (label: string, run: (records: MergeRecord[]) => Promise<void>) => {
    const b = el('button', { type: 'button', class: 'merge-out', textContent: label })
    b.addEventListener('click', async () => {
      const { records } = mergeRecords(meta)
      if (!records.length) return toast(t('There are no records to merge'))
      const buttons = [...panelEl.querySelectorAll<HTMLButtonElement>('.merge-out')]
      buttons.forEach((x) => (x.disabled = true))
      panelEl.classList.add('busy')
      toast(t('Merging {n} records…', { n: records.length }), 60_000)
      try {
        await run(records)
      } catch (err) {
        toast(t('Mail merge failed: {message}', { message: (err as Error).message }), 6000)
      } finally {
        buttons.forEach((x) => (x.disabled = false))
        panelEl.classList.remove('busy')
      }
    })
    return b
  }
  const title = () => String(meta.get('title') || t('Untitled document'))
  const outputs = el(
    'div',
    { class: 'merge-outputs' },
    outButton(t('New document'), async (records) => {
      const path = await mergeToDocument(ctx, records)
      toast(t('Merged document created'))
      if (!window.open(path, '_blank')) location.assign(path)
    }),
    outButton(t('PDF'), async (records) => {
      download(await mergeToPdf(ctx, records, false), `${title()}.pdf`)
      toast(t('PDF ready'))
    }),
    outButton(t('ZIP of Word files'), async (records) => {
      download(await mergeToDocxZip(ctx, records, settings().nameField), `${title()}.zip`)
      toast(t('ZIP ready'))
    }),
    outButton(t('ZIP of PDF files'), async (records) => {
      download(await mergeToPdf(ctx, records, true, settings().nameField), `${title()}.zip`)
      toast(t('ZIP ready'))
    }),
  )

  // ---------- Layout ----------
  const close = el('button', { type: 'button', class: 'merge-icon', title: t('Close') }, icon(X, 16))
  close.setAttribute('aria-label', t('Close'))
  const section = (label: string, ...content: (HTMLElement | null)[]) => el('section', { class: 'merge-section' }, el('h3', { textContent: label }), ...content)
  const panelEl = el(
    'aside',
    { class: 'merge-panel' },
    el('div', { class: 'merge-head' }, el('h2', { textContent: t('Mail merge') }), close),
    section(
      t('1. Data'),
      sourceSelect,
      fileInput,
      el('label', { class: 'field-label' }, t('Sheet'), sheetSelect),
      el('label', { class: 'field-label merge-inline' }, t('Field names in row'), headerRow),
      sourceInfo,
      reloadButton,
    ),
    section(t('2. Fields'), el('p', { class: 'merge-note', textContent: t('Click a field to insert it at the cursor.') }), fieldList, conditionButton),
    section(t('3. Filter'), filterField, el('div', { class: 'merge-row' }, filterOp, filterValue)),
    section(t('4. Preview'), el('label', { class: 'check-label' }, previewToggle, t('Show the data of a record')), el('div', { class: 'merge-row merge-nav' }, prev, position, next)),
    section(t('5. Merge'), el('label', { class: 'field-label' }, t('Name files after'), nameField), outputs),
  )
  panelEl.setAttribute('aria-label', t('Mail merge'))
  const stop = () => {
    storage.preview = null
    storage.views.forEach((v) => v())
    meta.unobserve(onMeta)
    panelEl.remove()
    panel = null
  }
  close.addEventListener('click', stop)
  panelEl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      stop()
      editor.commands.focus()
    }
  })

  const currentFields = () => fieldNames(readTable(meta), settings().headerRow)

  function showPreview() {
    const { records } = mergeRecords(meta)
    index = Math.max(0, Math.min(index, records.length - 1))
    storage.preview = previewToggle.checked && records.length ? records[index] : null
    storage.views.forEach((v) => v())
    position.textContent = records.length ? t('Record {n} of {total}', { n: index + 1, total: records.length }) : t('No records')
    prev.disabled = !previewToggle.checked || index <= 0
    next.disabled = !previewToggle.checked || index >= records.length - 1
  }

  function refresh() {
    const s = settings()
    const fields = currentFields()
    const { records, total } = mergeRecords(meta)
    if (document.activeElement !== headerRow) headerRow.value = String(s.headerRow)
    sourceInfo.textContent = s.source
      ? `${s.source.kind === 'sheet' ? s.source.title || t('Untitled spreadsheet') : s.source.name}${s.sheetName ? ` › ${s.sheetName}` : ''} · ${tn(total, '{n} record', '{n} records')}`
      : t('Choose a spreadsheet of your library or a file with a header row.')
    reloadButton.hidden = s.source?.kind !== 'sheet'
    if (!tables.length) sheetSelect.parentElement!.hidden = true
    fieldList.replaceChildren(
      ...(fields.length
        ? fields.map((name) => {
            const b = el('button', { type: 'button', class: 'merge-chip merge-field', textContent: name })
            b.addEventListener('mousedown', (e) => e.preventDefault())
            b.addEventListener('click', () => editor.isEditable && editor.chain().focus().insertMergeField(name).run())
            return b
          })
        : [el('span', { class: 'merge-note', textContent: t('No fields yet') })]),
    )
    conditionButton.disabled = !fields.length
    const fieldOptions = (empty: string) => [el('option', { value: '', textContent: empty }), ...fields.map((f) => el('option', { value: f, textContent: f }))]
    filterField.replaceChildren(...fieldOptions(t('No filter')))
    filterField.value = s.filter?.field && fields.includes(s.filter.field) ? s.filter.field : ''
    filterOp.value = s.filter?.op ?? '='
    if (document.activeElement !== filterValue) filterValue.value = s.filter?.value ?? ''
    filterOp.disabled = filterValue.disabled = !filterField.value
    filterValue.hidden = filterOp.value === 'empty' || filterOp.value === 'notEmpty'
    nameField.replaceChildren(...fieldOptions(t('Numbered')))
    nameField.value = fields.includes(s.nameField) ? s.nameField : ''
    outputs.title = tn(records.length, '{n} record will be merged', '{n} records will be merged')
    showPreview()
  }
  // Other editors may change the settings or data.
  const onMeta = (e: { keysChanged: Set<string> }) => {
    if (e.keysChanged.has('mailMerge') || e.keysChanged.has('mailMergeData')) refresh()
  }
  meta.observe(onMeta)
  fillSources()
  refresh()
  // A library source is loaded again to offer its sheets.
  const s = settings()
  if (s.source?.kind === 'sheet') {
    void loadLibrarySheet(s.source.docId)
      .then((loaded) => {
        if (!loaded) return
        tables = loaded.tables
        sheetSelect.replaceChildren(...tables.map((tb) => el('option', { value: tb.id, textContent: tb.name })))
        sheetSelect.value = s.sheet
        sheetSelect.parentElement!.hidden = tables.length < 2
      })
      .catch(() => undefined)
  }
  return panelEl
}

async function conditionDialog(ctx: WriterContext, fields: string[]): Promise<void> {
  const field = el('select', { class: 'field' }, ...fields.map((f) => el('option', { value: f, textContent: f })))
  const op = el('select', { class: 'field' }, el('option', { value: '=', textContent: t('is') }), el('option', { value: '<>', textContent: t('is not') }))
  const value = el('input', { class: 'field' })
  const then = el('input', { class: 'field' })
  const otherwise = el('input', { class: 'field' })
  const label = (text: string, input: HTMLElement) => el('label', { class: 'field-label' }, text, input)
  const body = el(
    'div',
    { class: 'merge-condition' },
    el('div', { class: 'merge-row' }, label(t('If the field'), field), label(t('Condition'), op)),
    label(t('Value'), value),
    label(t('Insert this text'), then),
    label(t('Otherwise insert'), otherwise),
  )
  const result = await showDialog(t('Conditional text'), body, [
    { label: t('Cancel'), value: 'cancel' },
    { label: t('Insert'), value: 'ok', primary: true },
  ])
  if (result !== 'ok' || !ctx.editor.isEditable) return
  ctx.editor.chain().focus().insertMergeIf({ field: field.value, op: op.value as MergeOp, value: value.value, then: then.value, otherwise: otherwise.value }).run()
}
