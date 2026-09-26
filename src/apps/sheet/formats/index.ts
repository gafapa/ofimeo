// Entry points for opening and saving spreadsheets in external formats.
// Converters are loaded on demand.

import type { IWorkbookData } from '@univerjs/presets'
import { t } from '../../../core/i18n'
import { canonicalWorkbook } from '../functions'

export type SheetExportFormat = 'xlsx' | 'ods' | 'csv'

export const SHEET_ACCEPT = '.xlsx,.ods,.csv,.tsv,.xls'

// Lazy loaders keyed by file name ('./xlsx-import.ts', …).
const converters = import.meta.glob(['./xlsx-*.ts', './xls-import.ts', './ods-*.ts', './csv.ts'])

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function load(name: string): Promise<any> {
  const loader = converters[`./${name}.ts`]
  if (!loader) throw new Error(t('This format is not available'))
  return loader()
}

export async function importSheetFile(file: File): Promise<Partial<IWorkbookData>> {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext === 'xlsx') return (await load('xlsx-import')).importXlsx(await file.arrayBuffer())
  if (ext === 'ods') return (await load('ods-import')).importOds(await file.arrayBuffer())
  if (ext === 'csv' || ext === 'tsv') return (await load('csv')).importCsv(await file.text(), ext === 'tsv' ? '\t' : undefined)
  if (ext === 'xls') return (await load('xls-import')).importXls(await file.arrayBuffer())
  throw new Error(t('Unsupported file type'))
}

// `sheetId` selects the sheet for single-sheet formats (CSV).
export async function exportSheetFile(format: SheetExportFormat, snapshot: IWorkbookData, sheetId?: string): Promise<Blob> {
  // Spanish function names typed in formulas are saved with their English names.
  const data = canonicalWorkbook(snapshot)
  switch (format) {
    case 'xlsx':
      return (await load('xlsx-export')).exportXlsx(data)
    case 'ods':
      return (await load('ods-export')).exportOds(data)
    case 'csv':
      return new Blob([(await load('csv')).exportCsv(data, sheetId)], { type: 'text/csv;charset=utf-8' })
  }
}
