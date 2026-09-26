// Spanish function names accepted in formulas (aliases of Univer's English
// functions, registered in stats.ts) and their rewriting to the English names
// for files. Pure data: the file formats use it without the Univer runtime.

import type { ICellData, IWorkbookData } from '@univerjs/presets'

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

// A snapshot with every formula written with the English function names.
export function canonicalWorkbook(data: IWorkbookData): IWorkbookData {
  let changed = false
  const sheets: IWorkbookData['sheets'] = {}
  for (const [id, sheet] of Object.entries(data.sheets ?? {})) {
    const cellData: NonNullable<typeof sheet.cellData> = {}
    for (const [r, row] of Object.entries(sheet.cellData ?? {})) {
      const out: Record<number, ICellData> = {}
      for (const [c, cell] of Object.entries(row ?? {}) as [string, ICellData][]) {
        const f = cell?.f
        const g = typeof f === 'string' ? canonicalFormula(f) : f
        if (g !== f) changed = true
        out[Number(c)] = g !== f ? { ...cell, f: g } : cell
      }
      cellData[Number(r)] = out
    }
    sheets[id] = sheet.cellData ? { ...sheet, cellData } : sheet
  }
  return changed ? { ...data, sheets } : data
}
