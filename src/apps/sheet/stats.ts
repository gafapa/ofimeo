// Statistics for secondary school: Spanish function names as aliases of
// Univer's functions (same executors, so the results are identical), the
// Data ▸ Descriptive statistics… helper and Insert ▸ Function.
//
// Aliases are registered for every language, so a formula typed by a Spanish
// collaborator computes everywhere; files are always written with the English
// names (canonicalFormula), which Excel and LibreOffice translate on opening.
// Univer localizes function descriptions, not names.

import type { FUniver, Univer } from '@univerjs/presets'
import { IFunctionService, type BaseFunction } from '@univerjs/preset-sheets-core'
import { language, t } from '../../core/i18n'
import { el, showDialog, toast } from '../../ui/widgets'
import { detectHeaders, parseA1, toA1, colName, type Cell, type CellRange } from './charts/model'
import { defaultRange } from './charts/dialog'

export const SPANISH_FUNCTIONS: Record<string, string> = {
  MEDIA: 'AVERAGE',
  PROMEDIO: 'AVERAGE',
  MEDIANA: 'MEDIAN',
  'MODA.UNO': 'MODE.SNGL',
  MODA: 'MODE',
  'DESVEST.M': 'STDEV.S',
  'DESVEST.P': 'STDEV.P',
  DESVEST: 'STDEV',
  'CUARTIL.INC': 'QUARTILE.INC',
  CUARTIL: 'QUARTILE',
  'PERCENTIL.INC': 'PERCENTILE.INC',
  PERCENTIL: 'PERCENTILE',
  'COEF.DE.CORREL': 'CORREL',
  'COEFICIENTE.R2': 'RSQ',
  PENDIENTE: 'SLOPE',
  'INTERSECCION.EJE': 'INTERCEPT',
  'PRONOSTICO.LINEAL': 'FORECAST.LINEAR',
  PRONOSTICO: 'FORECAST',
  TENDENCIA: 'TREND',
  'DISTR.NORM.N': 'NORM.DIST',
  'INV.NORM': 'NORM.INV',
  'DISTR.NORM.ESTAND.N': 'NORM.S.DIST',
  'INV.NORM.ESTAND': 'NORM.S.INV',
  NORMALIZACION: 'STANDARDIZE',
  'DISTR.BINOM.N': 'BINOM.DIST',
  'POISSON.DIST': 'POISSON.DIST',
  'DISTR.T.N': 'T.DIST',
  'INV.T': 'T.INV',
  'INV.T.2C': 'T.INV.2T',
  'INTERVALO.CONFIANZA.NORM': 'CONFIDENCE.NORM',
  'COVARIANZA.M': 'COVARIANCE.S',
  'COVARIANZA.P': 'COVARIANCE.P',
  CURTOSIS: 'KURT',
  'COEFICIENTE.ASIMETRIA': 'SKEW',
  DESVPROM: 'AVEDEV',
  'MEDIA.ACOTADA': 'TRIMMEAN',
  'MEDIA.GEOM': 'GEOMEAN',
  'MEDIA.ARMO': 'HARMEAN',
  'K.ESIMO.MAYOR': 'LARGE',
  'K.ESIMO.MENOR': 'SMALL',
  'CONTAR.SI.CONJUNTO': 'COUNTIFS',
  'CONTAR.SI': 'COUNTIF',
  CONTAR: 'COUNT',
  CONTARA: 'COUNTA',
  'CONTAR.BLANCO': 'COUNTBLANK',
  FRECUENCIA: 'FREQUENCY',
  'JERARQUIA.EQV': 'RANK.EQ',
  'JERARQUIA.MEDIA': 'RANK.AVG',
  JERARQUIA: 'RANK',
  COMBINAT: 'COMBIN',
  PERMUTACIONES: 'PERMUT',
  'ALEATORIO.ENTRE': 'RANDBETWEEN',
  ALEATORIO: 'RAND',
  SUMA: 'SUM',
  'SUMAR.SI': 'SUMIF',
  'SUMAR.SI.CONJUNTO': 'SUMIFS',
  SUMAPRODUCTO: 'SUMPRODUCT',
  'PROMEDIO.SI': 'AVERAGEIF',
  'PROMEDIO.SI.CONJUNTO': 'AVERAGEIFS',
  'MAX.SI.CONJUNTO': 'MAXIFS',
  'MIN.SI.CONJUNTO': 'MINIFS',
  SI: 'IF',
  'SI.ERROR': 'IFERROR',
  Y: 'AND',
  O: 'OR',
  REDONDEAR: 'ROUND',
  'REDONDEAR.MAS': 'ROUNDUP',
  'REDONDEAR.MENOS': 'ROUNDDOWN',
  ENTERO: 'INT',
  RESIDUO: 'MOD',
  RAIZ: 'SQRT',
  POTENCIA: 'POWER',
  HOY: 'TODAY',
  AHORA: 'NOW',
  BUSCARV: 'VLOOKUP',
  BUSCARH: 'HLOOKUP',
  CONCATENAR: 'CONCATENATE',
}

// Registers the aliases in the formula engine (descriptions only in Spanish and Galician).
export function registerFunctionAliases(univer: Univer): string[] {
  const functions = univer.__getInjector().get(IFunctionService)
  const added: string[] = []
  const describe = language === 'es' || language === 'gl'
  for (const [alias, name] of Object.entries(SPANISH_FUNCTIONS)) {
    if (alias === name || functions.hasExecutor(alias)) continue
    const executor = functions.getExecutor(name)
    if (!executor) continue
    const Executor = executor.constructor as new (name: string) => BaseFunction
    functions.registerExecutors(new Executor(alias))
    const description = functions.getDescription(name)
    if (describe && description) functions.registerDescriptions({ ...description, functionName: alias })
    added.push(alias)
  }
  return added
}

// Rewrites Spanish aliases to the English names (outside string literals).
const ALIAS_RE = new RegExp(
  `(^|[^A-Za-z0-9_.\\u00C0-\\u024F])(${Object.keys(SPANISH_FUNCTIONS)
    .sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/\./g, '\\.'))
    .join('|')})(?=\\s*\\()`,
  'gi',
)
export function canonicalFormula(formula: string): string {
  return formula
    .split(/("(?:[^"]|"")*")/)
    .map((part, i) => (i % 2 ? part : part.replace(ALIAS_RE, (_, pre: string, name: string) => pre + (SPANISH_FUNCTIONS[name.toUpperCase()] ?? name))))
    .join('')
}

// ---------- Helpers shared with the pivot table ----------

export const quoteSheet = (name: string) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`)
export const absRange = (r: CellRange, sheetName?: string) =>
  `${sheetName ? `${quoteSheet(sheetName)}!` : ''}$${colName(r.startColumn)}$${r.startRow + 1}:$${colName(r.endColumn)}$${r.endRow + 1}`

// A sheet name that is not used yet: "Statistics", "Statistics 2", …
export function uniqueSheetName(univerAPI: FUniver, base: string): string {
  const names = new Set(univerAPI.getActiveWorkbook()!.getSheets().map((s) => s.getSheetName().toLowerCase()))
  if (!names.has(base.toLowerCase())) return base
  for (let n = 2; ; n++) if (!names.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`
}

// ---------- Insert ▸ Function ----------

// Puts =NAME(selection) below a column selection (right of a row selection),
// or opens the cell for editing with "=NAME(" when a single cell is selected.
export function insertFunction(univerAPI: FUniver, name: string): void {
  const sheet = univerAPI.getActiveWorkbook()!.getActiveSheet()
  const r = sheet.getSelection()?.getActiveRange()?.getRange()
  if (!r) return
  const single = r.startRow === r.endRow && r.startColumn === r.endColumn
  if (single) {
    sheet.getRange(r.startRow, r.startColumn).setValue(`=${name}(${colName(r.startColumn)}1:${colName(r.startColumn)}${Math.max(1, r.startRow)})`)
    return
  }
  const row = r.startRow === r.endRow
  const out = row ? sheet.getRange(r.startRow, r.endColumn + 1) : sheet.getRange(r.endRow + 1, r.startColumn)
  if (row) out.setValue(`=${name}(${toA1(r)})`)
  else for (let c = r.startColumn; c <= r.endColumn; c++) sheet.getRange(r.endRow + 1, c).setValue(`=${name}(${toA1({ ...r, startColumn: c, endColumn: c })})`)
  sheet.setActiveRange(out)
}

// ---------- Data ▸ Descriptive statistics… ----------

const STATISTICS: [() => string, (ref: string) => string][] = [
  [() => t('Count (n)'), (x) => `=COUNT(${x})`],
  [() => t('Mean'), (x) => `=AVERAGE(${x})`],
  [() => t('Median'), (x) => `=MEDIAN(${x})`],
  [() => t('Mode'), (x) => `=IFERROR(MODE.SNGL(${x}),"—")`],
  [() => t('Standard deviation (sample)'), (x) => `=STDEV.S(${x})`],
  [() => t('Standard deviation (population)'), (x) => `=STDEV.P(${x})`],
  [() => t('Variance (sample)'), (x) => `=VAR.S(${x})`],
  [() => t('Variance (population)'), (x) => `=VAR.P(${x})`],
  [() => t('Minimum'), (x) => `=MIN(${x})`],
  [() => t('First quartile (Q1)'), (x) => `=QUARTILE.INC(${x},1)`],
  [() => t('Third quartile (Q3)'), (x) => `=QUARTILE.INC(${x},3)`],
  [() => t('Maximum'), (x) => `=MAX(${x})`],
  [() => t('Range'), (x) => `=MAX(${x})-MIN(${x})`],
]

export async function descriptiveStatistics(univerAPI: FUniver): Promise<void> {
  const wb = univerAPI.getActiveWorkbook()!
  const sheet = wb.getActiveSheet()
  const range = el('input', { class: 'field', value: defaultRange(univerAPI), spellcheck: false })
  const labels = el('input', { type: 'checkbox' })
  const where = el(
    'select',
    { class: 'field' },
    el('option', { value: 'sheet', textContent: t('New sheet') }),
    el('option', { value: 'right', textContent: t('Next to the data') }),
    el('option', { value: 'cell', textContent: t('At a cell…') }),
  )
  const cell = el('input', { class: 'field', value: '', placeholder: 'H1', hidden: true, spellcheck: false })
  where.addEventListener('change', () => (cell.hidden = where.value !== 'cell'))
  const detect = () => {
    const r = parseA1(range.value)
    if (r) labels.checked = detectHeaders(sheet.getRange(r.startRow, r.startColumn, r.endRow - r.startRow + 1, r.endColumn - r.startColumn + 1).getValues() as Cell[][]).headerRow
  }
  range.addEventListener('input', detect)
  detect()
  const body = el(
    'div',
    { class: 'form' },
    el('label', { class: 'field-label' }, t('Data range (one variable per column)'), range),
    el('label', { class: 'check-label' }, labels, t('First row contains labels')),
    el('label', { class: 'field-label' }, t('Output'), where, cell),
    el('p', { class: 'dialog-note', textContent: t('The summary uses formulas, so it updates when the data change.') }),
  )
  if ((await showDialog(t('Descriptive statistics'), body, [{ label: t('Cancel'), value: 'cancel' }, { label: t('Create'), value: 'ok', primary: true }])) !== 'ok') return
  const r = parseA1(range.value)
  if (!r) return toast(t('Enter a range such as A1:C6'))
  const dataRows = labels.checked ? { ...r, startRow: r.startRow + 1 } : r
  if (dataRows.startRow > dataRows.endRow) return toast(t('The range has no data'))

  let target = sheet
  let top = 0
  let left = 0
  let sourceName: string | undefined
  if (where.value === 'sheet') {
    sourceName = sheet.getSheetName()
    target = wb.insertSheet(uniqueSheetName(univerAPI, t('Statistics')))
  } else if (where.value === 'right') {
    top = r.startRow
    left = r.endColumn + 2
  } else {
    const c = parseA1(cell.value)
    if (!c) return toast(t('Enter a cell such as H1'))
    top = c.startRow
    left = c.startColumn
  }
  const header = sheet.getRange(r.startRow, r.startColumn, 1, r.endColumn - r.startColumn + 1).getValues()[0] as Cell[]
  const columns = []
  for (let c = r.startColumn; c <= r.endColumn; c++) {
    const name = labels.checked && header[c - r.startColumn] !== null && header[c - r.startColumn] !== '' ? String(header[c - r.startColumn]) : `${colName(c)}`
    columns.push({ name, ref: absRange({ ...dataRows, startColumn: c, endColumn: c }, sourceName) })
  }
  const rows: (string | number)[][] = [[t('Statistic'), ...columns.map((c) => c.name)]]
  for (const [label, formula] of STATISTICS) rows.push([label(), ...columns.map((c) => formula(c.ref))])
  const out = target.getRange(top, left, rows.length, rows[0].length)
  out.setValues(rows as never)
  target.getRange(top, left, 1, rows[0].length).setFontWeight('bold')
  target.getRange(top, left, rows.length, 1).setFontWeight('bold')
  target.getRange(top + 2, left + 1, rows.length - 2, rows[0].length - 1).setNumberFormat('0.00')
  target.setColumnWidth(left, 220)
  target.activate()
  target.setActiveRange(out)
}
