// Conditional formatting between Univer rules and ExcelJS rules (.xlsx).
// Rules Excel has no direct form for (duplicate / unique values, text rules
// on non-literal bounds) are written as formula rules, which Excel and
// LibreOffice evaluate the same way.

import type { IRange, IStyleData } from '@univerjs/presets'
import { toHex } from '../../../core/formats'
import {
  CF_NUMBER_OPERATORS,
  firstLiteral,
  highlight,
  iconConfig,
  newCfId,
  numberRuleFormula,
  rangeA1,
  textRuleFormula,
  TIME_PERIODS,
  cellA1,
  type CfRule,
  type CfValue,
  type CfValueType,
  type HighlightRule,
} from './features'

// ExcelJS rule model (loosely typed: its typings miss several fields).
export type ExcelRule = Record<string, unknown> & { type: string }
type ExcelColor = { argb?: string; theme?: number; indexed?: number; tint?: number }
type ExcelCfvo = { type: string; value?: number | string }

const argb = (c: unknown) => {
  const hex = toHex(c)
  return hex ? 'FF' + hex.slice(1).toUpperCase() : undefined
}

// Differential style (dxf) of a highlight rule.
function dxf(s: IStyleData | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!s) return out
  const font: Record<string, unknown> = {}
  if (s.bl) font.bold = true
  if (s.it) font.italic = true
  if (s.ul?.s) font.underline = true
  if (s.st?.s) font.strike = true
  const cl = argb(s.cl?.rgb)
  if (cl) font.color = { argb: cl }
  if (Object.keys(font).length) out.font = font
  const bg = argb(s.bg?.rgb)
  if (bg) out.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg }, bgColor: { argb: bg } }
  return out
}

function cfvo(v: CfValue | undefined): ExcelCfvo {
  if (!v) return { type: 'min' }
  const type = v.type === 'num' ? 'num' : v.type
  if (type === 'min' || type === 'max') return { type }
  if (type === 'formula') return { type, value: String(v.value ?? '').replace(/^=/, '') }
  return { type, value: Number(v.value) || 0 }
}

// ExcelJS rules for a Univer rule (null when it cannot be written).
export function cfToExcel(cf: CfRule): ExcelRule[] | null {
  const first = cf.ranges[0]
  if (!first) return null
  const tl = cellA1(first.startRow, first.startColumn)
  const rule = cf.rule
  if (rule.type === 'colorScale') {
    const stops = [...rule.config].sort((a, b) => a.index - b.index)
    if (stops.length < 2) return null
    return [{ type: 'colorScale', cfvo: stops.map((s) => cfvo(s.value)), color: stops.map((s) => ({ argb: argb(s.color) ?? 'FF000000' })) }]
  }
  if (rule.type === 'dataBar') {
    return [{ type: 'dataBar', cfvo: [cfvo(rule.config.min), cfvo(rule.config.max)], color: { argb: argb(rule.config.positiveColor) ?? 'FF638EC6' }, gradient: rule.config.isGradient }]
  }
  if (rule.type === 'iconSet') {
    const n = rule.config.length
    if (n < 3) return null
    const iconSet = /^\d[A-Za-z0-9]+$/.test(rule.config[0].iconType) ? rule.config[0].iconType : '3TrafficLights1'
    // Excel lists thresholds from the lowest icon up; Univer from the highest down.
    const thresholds: ExcelCfvo[] = [{ type: 'percent', value: 0 }]
    for (let k = 1; k < n; k++) thresholds.push(cfvo(rule.config[n - 1 - k].value))
    const reverse = rule.config.every((c, i) => c.iconId === String(n - 1 - i))
    return [{ type: 'iconSet', iconSet, cfvo: thresholds, reverse, showValue: rule.isShowValue }]
  }
  const style = dxf(rule.style)
  const op = rule.operator ?? ''
  switch (rule.subType) {
    case 'number': {
      if (!CF_NUMBER_OPERATORS.includes(op)) return null
      const values = Array.isArray(rule.value) ? rule.value : [rule.value]
      if (values.every((v) => typeof v === 'number' && Number.isFinite(v))) return [{ type: 'cellIs', operator: op, formulae: values.slice(0, op.includes('etween') ? 2 : 1), style }]
      return [{ type: 'expression', formulae: [numberRuleFormula(op, rule.value, tl)], style }]
    }
    case 'text': {
      const text = String(rule.value ?? '')
      const formula = textRuleFormula(op, text, tl)
      if (op === 'equal' || op === 'notEqual') return [{ type: 'cellIs', operator: op, formulae: [`"${text.replace(/"/g, '""')}"`], style }]
      if (['containsText', 'notContainsText', 'beginsWith', 'endsWith'].includes(op)) return [{ type: 'containsText', operator: op, text, formulae: [formula], style }]
      if (['containsBlanks', 'notContainsBlanks', 'containsErrors', 'notContainsErrors'].includes(op)) return [{ type: 'containsText', operator: op, formulae: [formula], style }]
      return null
    }
    case 'timePeriod':
      return TIME_PERIODS.includes(op) ? [{ type: 'timePeriod', timePeriod: op, style }] : null
    case 'duplicateValues':
    case 'uniqueValues': {
      const all = cf.ranges.map((r) => rangeA1(r, true)).join(',')
      const count = cf.ranges.length > 1 ? `SUM(${cf.ranges.map((r) => `COUNTIF(${rangeA1(r, true)},${tl})`).join(',')})` : `COUNTIF(${all},${tl})`
      return [{ type: 'expression', formulae: [`AND(${tl}<>"",${count}${rule.subType === 'duplicateValues' ? '>1' : '=1'})`], style }]
    }
    case 'rank':
      return [{ type: 'top10', rank: Math.max(1, Math.round(Number(rule.value) || 10)), percent: !!rule.isPercent, bottom: !!rule.isBottom, style }]
    case 'average':
      return [{ type: 'aboveAverage', aboveAverage: op.startsWith('greater'), style }]
    case 'formula': {
      const f = String(rule.value ?? '').replace(/^=/, '')
      return f ? [{ type: 'expression', formulae: [f], style }] : null
    }
  }
  return null
}

// ---------- Import ----------

function valueOf(c: ExcelCfvo | undefined): CfValue {
  const types: Record<string, CfValueType> = { num: 'num', number: 'num', min: 'min', max: 'max', percent: 'percent', percentile: 'percentile', formula: 'formula', autoMin: 'min', autoMax: 'max' }
  const type = types[c?.type ?? 'min'] ?? 'num'
  if (type === 'min' || type === 'max') return { type }
  if (type === 'formula') return { type, value: '=' + String(c?.value ?? '0') }
  return { type, value: Number(c?.value) || 0 }
}

function styleOf(st: Record<string, unknown> | undefined, color: (c: ExcelColor | undefined) => string | undefined): IStyleData {
  const s: IStyleData = {}
  const font = st?.font as { bold?: boolean; italic?: boolean; underline?: unknown; strike?: boolean; color?: ExcelColor } | undefined
  if (font?.bold) s.bl = 1
  if (font?.italic) s.it = 1
  if (font?.underline && font.underline !== 'none') s.ul = { s: 1 }
  if (font?.strike) s.st = { s: 1 }
  const cl = color(font?.color)
  if (cl) s.cl = { rgb: cl }
  const fill = st?.fill as { type?: string; pattern?: string; fgColor?: ExcelColor; bgColor?: ExcelColor } | undefined
  if (fill?.type === 'pattern' && fill.pattern !== 'none') {
    // Differential fills keep the solid color in bgColor.
    const bg = color(fill.bgColor) ?? color(fill.fgColor)
    if (bg) s.bg = { rgb: bg }
  }
  return s
}

const numberOf = (f: unknown) => {
  const s = String(f ?? '').trim()
  return s !== '' && Number.isFinite(Number(s)) ? Number(s) : undefined
}

// A Univer rule for an ExcelJS rule over `ranges` (null for unsupported rules).
export function cfFromExcel(x: ExcelRule, ranges: IRange[], color: (c: ExcelColor | undefined) => string | undefined): CfRule | null {
  const first = ranges[0]
  if (!first) return null
  const tl = cellA1(first.startRow, first.startColumn)
  const formulae = ((x.formulae as unknown[] | undefined) ?? []).map((f) => String(f))
  const style = () => styleOf(x.style as Record<string, unknown> | undefined, color)
  const wrap = (rule: CfRule['rule']): CfRule => ({ cfId: newCfId(), ranges, stopIfTrue: false, rule })
  const cfvos = (x.cfvo as ExcelCfvo[] | undefined) ?? []
  switch (x.type) {
    case 'cellIs': {
      const op = String(x.operator ?? '')
      if (!CF_NUMBER_OPERATORS.includes(op)) return null
      const nums = formulae.map(numberOf)
      if (op.includes('etween') && nums.length >= 2 && nums[0] !== undefined && nums[1] !== undefined) return wrap(highlight('number', style(), { operator: op, value: [nums[0], nums[1]] }))
      if (!op.includes('etween') && nums[0] !== undefined) return wrap(highlight('number', style(), { operator: op, value: nums[0] }))
      const literal = /^"((?:[^"]|"")*)"$/.exec(formulae[0] ?? '')
      if ((op === 'equal' || op === 'notEqual') && literal) return wrap(highlight('text', style(), { operator: op, value: literal[1].replace(/""/g, '"') }))
      return wrap(highlight('formula', style(), { value: '=' + numberRuleFormula(op, op.includes('etween') ? formulae : formulae[0], tl) }))
    }
    case 'expression':
      return formulae[0] ? wrap(highlight('formula', style(), { value: '=' + formulae[0].replace(/^=/, '') })) : null
    case 'containsText':
    case 'notContainsText':
    case 'beginsWith':
    case 'endsWith': {
      const op = x.type === 'containsText' ? String(x.operator ?? 'containsText') : x.type
      const known = ['containsText', 'notContainsText', 'notContains', 'beginsWith', 'endsWith', 'containsBlanks', 'notContainsBlanks', 'containsErrors', 'notContainsErrors']
      if (!known.includes(op)) return null
      const operator = op === 'notContains' ? 'notContainsText' : op
      const text = typeof x.text === 'string' ? x.text : firstLiteral(formulae[0] ?? '')
      if (['containsText', 'notContainsText', 'beginsWith', 'endsWith'].includes(operator) && text === undefined) {
        return formulae[0] ? wrap(highlight('formula', style(), { value: '=' + formulae[0] })) : null
      }
      return wrap(highlight('text', style(), { operator, ...(text !== undefined ? { value: text } : {}) } as Partial<HighlightRule>))
    }
    case 'timePeriod': {
      const op = String(x.timePeriod ?? '')
      return TIME_PERIODS.includes(op) ? wrap(highlight('timePeriod', style(), { operator: op })) : null
    }
    case 'duplicateValues':
    case 'uniqueValues':
      return wrap(highlight(x.type, style()))
    case 'top10':
      return wrap(highlight('rank', style(), { value: Number(x.rank) || 10, isPercent: !!x.percent, isBottom: !!x.bottom }))
    case 'aboveAverage':
      return wrap(highlight('average', style(), { operator: x.aboveAverage === false ? 'lessThan' : 'greaterThan' }))
    case 'colorScale': {
      const colors = (x.color as ExcelColor[] | undefined) ?? []
      if (cfvos.length < 2) return null
      return wrap({ type: 'colorScale', config: cfvos.map((c, index) => ({ index, color: color(colors[index]) ?? '#000000', value: valueOf(c) })) })
    }
    case 'dataBar': {
      const positive = color(x.color as ExcelColor | undefined) ?? '#638ec6'
      return wrap({ type: 'dataBar', isShowValue: x.showValue !== false, config: { min: valueOf(cfvos[0]), max: valueOf(cfvos[1] ?? { type: 'max' }), isGradient: x.gradient !== false, positiveColor: positive, nativeColor: '#ff0000' } })
    }
    case 'iconSet': {
      const iconType = String(x.iconSet ?? '3TrafficLights1')
      const n = Math.max(3, cfvos.length || Number(iconType[0]) || 3)
      const reverse = !!x.reverse
      return wrap({ type: 'iconSet', isShowValue: x.showValue !== false, config: iconConfig(iconType, n, reverse, (k) => valueOf(cfvos[k])) })
    }
  }
  return null
}

// ExcelJS writes text rules without their `text` attribute and with the rule
// type as operator; Excel needs both, as in <cfRule type="notContainsText"
// operator="notContains" text="…">.
export function fixTextRules(xml: string): string {
  return xml.replace(/<cfRule\b[^>]*\btype="(containsText|notContainsText|beginsWith|endsWith)"[^>]*>([\s\S]*?)<\/cfRule>/g, (tag, type: string, inner: string) => {
    let open = tag.slice(0, tag.indexOf('>') + 1)
    if (/\stext="/.test(open)) return tag
    const formula = /<formula>([\s\S]*?)<\/formula>/.exec(inner)?.[1]
    const text = formula && firstLiteral(formula.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))
    const operator = { containsText: 'containsText', notContainsText: 'notContains', beginsWith: 'beginsWith', endsWith: 'endsWith' }[type]!
    open = open.replace(/\soperator="[^"]*"/, '').replace(/^<cfRule\b/, `<cfRule operator="${operator}"`)
    if (text !== undefined) open = open.replace(/^<cfRule\b/, `<cfRule text="${text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}"`)
    return open + tag.slice(tag.indexOf('>') + 1)
  })
}
