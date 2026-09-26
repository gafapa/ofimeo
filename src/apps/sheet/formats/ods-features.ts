// Conditional formatting (LibreOffice's calcext elements), notes
// (office:annotation), named ranges and expressions, and auto filters
// (table:database-range) between Univer resources and OpenDocument.
// Formula conversion is passed in by ods-export / ods-import.

import type { IRange, IStyleData } from '@univerjs/presets'
import { attr, child, children, escapeXml, toHex } from '../../../core/formats'
import {
  CF_NUMBER_OPERATORS,
  cellA1,
  highlight,
  iconConfig,
  isThemeTextColor,
  newCfId,
  numberRuleFormula,
  quoteText,
  textRuleFormula,
  type CfRule,
  type CfValue,
  type DefinedName,
  type FilterColumn,
  type HighlightRule,
  type SheetFilter,
  type SheetNote,
} from './features'

const PX_PER_IN = 96
const inches = (px: number) => `${Math.round((px / PX_PER_IN) * 10000) / 10000}in`

export function odsSheetName(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`
}

// "Sheet1.A1:Sheet1.B5" (absolute with `abs`: "$Sheet1.$A$1:.$B$5").
export function odsRange(sheet: string, r: IRange, abs = false): string {
  const s = odsSheetName(sheet)
  const a = cellA1(r.startRow, r.startColumn, abs)
  const b = cellA1(r.endRow, r.endColumn, abs)
  return abs ? `$${s}.${a}${a === b ? '' : `:.${b}`}` : `${s}.${a}${a === b ? '' : `:${s}.${b}`}`
}

// Parses "Sheet1.A1:Sheet1.B5 $'My sheet'.$C$1:.$D$2" into ranges (sheet names dropped).
export function parseOdsRanges(address: string): IRange[] {
  const parts: string[] = []
  let cur = ''
  let quoted = false
  for (const ch of address) {
    if (ch === "'") quoted = !quoted
    if (ch === ' ' && !quoted) {
      if (cur) parts.push(cur)
      cur = ''
    } else cur += ch
  }
  if (cur) parts.push(cur)
  const cell = (s: string) => {
    const m = /\.\$?([A-Z]{1,3})\$?(\d+)$/i.exec(s)
    if (!m) return undefined
    let col = 0
    for (const c of m[1].toUpperCase()) col = col * 26 + c.charCodeAt(0) - 64
    return { row: Number(m[2]) - 1, col: col - 1 }
  }
  const out: IRange[] = []
  for (const p of parts) {
    // Split on the ':' that is outside quotes.
    let split = -1
    let q = false
    for (let i = 0; i < p.length; i++) {
      if (p[i] === "'") q = !q
      else if (p[i] === ':' && !q) split = i
    }
    const a = cell(split < 0 ? p : p.slice(0, split))
    const b = split < 0 ? a : cell(p.slice(split + 1))
    if (a && b) out.push({ startRow: Math.min(a.row, b.row), endRow: Math.max(a.row, b.row), startColumn: Math.min(a.col, b.col), endColumn: Math.max(a.col, b.col) })
  }
  return out
}

// ---------------------------------------------------------------------------
// Export

const ENTRY_TYPE: Record<string, string> = { num: 'number', min: 'minimum', max: 'maximum', percent: 'percent', percentile: 'percentile', formula: 'formula' }
const DATE_IS: Record<string, string> = {
  today: 'today',
  yesterday: 'yesterday',
  tomorrow: 'tomorrow',
  last7Days: 'last-7-days',
  thisWeek: 'this-week',
  lastWeek: 'last-week',
  nextWeek: 'next-week',
  thisMonth: 'this-month',
  lastMonth: 'last-month',
  nextMonth: 'next-month',
}

type ToOdf = (excelFormula: string) => string

export class OdsFeatureWriter {
  private styleXml: string[] = []
  private styleNames = new Map<string, string>()

  constructor(private readonly toOdf: ToOdf) {}

  // Named cell styles used by conditions (office:styles in styles.xml).
  styles(): string {
    return this.styleXml.join('')
  }

  private styleName(s: IStyleData): string {
    const key = JSON.stringify(s)
    let name = this.styleNames.get(key)
    if (name) return name
    name = `OfimeoCF${this.styleNames.size + 1}`
    this.styleNames.set(key, name)
    const text: string[] = []
    if (s.bl) text.push('fo:font-weight="bold" style:font-weight-asian="bold" style:font-weight-complex="bold"')
    if (s.it) text.push('fo:font-style="italic" style:font-style-asian="italic" style:font-style-complex="italic"')
    if (s.ul?.s) text.push('style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"')
    if (s.st?.s) text.push('style:text-line-through-style="solid" style:text-line-through-type="single"')
    const cl = toHex(s.cl?.rgb)
    if (cl && !isThemeTextColor(cl)) text.push(`fo:color="${cl}"`)
    const bg = toHex(s.bg?.rgb)
    this.styleXml.push(
      `<style:style style:name="${name}" style:family="table-cell" style:parent-style-name="Default">` +
        (bg ? `<style:table-cell-properties fo:background-color="${bg}"/>` : '') +
        (text.length ? `<style:text-properties ${text.join(' ')}/>` : '') +
        `</style:style>`,
    )
    return name
  }

  private formula(expr: string): string {
    return this.toOdf('=' + expr.replace(/^=/, '')).replace(/^=/, '')
  }

  private entry(tag: string, v: CfValue, color?: string): string {
    const type = ENTRY_TYPE[v.type] ?? 'number'
    const value = v.type === 'formula' ? this.formula(String(v.value ?? '0')) : v.type === 'min' || v.type === 'max' ? '0' : String(Number(v.value) || 0)
    return `<calcext:${tag} calcext:value="${escapeXml(value)}" calcext:type="${type}"${color ? ` calcext:color="${toHex(color) ?? '#000000'}"` : ''}/>`
  }

  // The condition value of a highlight rule ("<5", "between(1,5)", "formula-is(…)").
  private condition(rule: HighlightRule, tl: string): string | null {
    const op = rule.operator ?? ''
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? String(v) : null)
    switch (rule.subType) {
      case 'number': {
        if (!CF_NUMBER_OPERATORS.includes(op)) return null
        if (op === 'between' || op === 'notBetween') {
          const [a, b] = Array.isArray(rule.value) ? rule.value : []
          if (num(a) !== null && num(b) !== null) return `${op === 'between' ? 'between' : 'not-between'}(${a},${b})`
        } else if (num(rule.value) !== null) {
          return `${{ greaterThan: '>', greaterThanOrEqual: '>=', lessThan: '<', lessThanOrEqual: '<=', equal: '=', notEqual: '!=' }[op]}${rule.value}`
        }
        return `formula-is(${this.formula(numberRuleFormula(op, rule.value, tl))})`
      }
      case 'text': {
        const text = String(rule.value ?? '')
        const fn = { containsText: 'contains-text', notContainsText: 'not-contains-text', beginsWith: 'begins-with', endsWith: 'ends-with' }[op]
        if (fn) return `${fn}(${quoteText(text)})`
        if (op === 'equal') return `=${quoteText(text)}`
        if (op === 'notEqual') return `!=${quoteText(text)}`
        if (op === 'containsErrors') return 'is-error'
        if (op === 'notContainsErrors') return 'is-no-error'
        return `formula-is(${this.formula(textRuleFormula(op, text, tl))})`
      }
      case 'duplicateValues':
        return 'duplicate'
      case 'uniqueValues':
        return 'unique'
      case 'rank': {
        const n = Math.max(1, Math.round(Number(rule.value) || 10))
        return `${rule.isBottom ? 'bottom' : 'top'}-${rule.isPercent ? 'percent' : 'elements'}(${n})`
      }
      case 'average':
        return { greaterThan: 'above-average', greaterThanOrEqual: 'above-equal-average', lessThan: 'below-average', lessThanOrEqual: 'below-equal-average' }[op] ?? null
      case 'formula': {
        const f = String(rule.value ?? '').replace(/^=/, '')
        return f ? `formula-is(${this.formula(f)})` : null
      }
    }
    return null
  }

  // <calcext:conditional-formats> of a sheet ('' without rules).
  conditionalFormats(rules: CfRule[], sheet: string): string {
    let xml = ''
    for (const cf of rules) {
      const first = cf.ranges[0]
      if (!first) continue
      const target = cf.ranges.map((r) => odsRange(sheet, r)).join(' ')
      const tl = cellA1(first.startRow, first.startColumn)
      const base = `${odsSheetName(sheet)}.${tl}`
      const rule = cf.rule
      let inner = ''
      if (rule.type === 'colorScale') {
        const stops = [...rule.config].sort((a, b) => a.index - b.index)
        if (stops.length >= 2) inner = `<calcext:color-scale>${stops.map((s) => this.entry('color-scale-entry', s.value, s.color)).join('')}</calcext:color-scale>`
      } else if (rule.type === 'dataBar') {
        const c = rule.config
        inner =
          `<calcext:data-bar calcext:positive-color="${toHex(c.positiveColor) ?? '#638ec6'}" calcext:negative-color="${toHex(c.nativeColor) ?? '#ff0000'}" calcext:gradient="${c.isGradient ? 'true' : 'false'}"${rule.isShowValue === false ? ' calcext:show-value="false"' : ''}>` +
          this.entry('formatting-entry', c.min) +
          this.entry('formatting-entry', c.max) +
          `</calcext:data-bar>`
      } else if (rule.type === 'iconSet') {
        const n = rule.config.length
        if (n >= 3) {
          const entries = [`<calcext:formatting-entry calcext:value="0" calcext:type="percent"/>`]
          for (let k = 1; k < n; k++) entries.push(this.entry('formatting-entry', rule.config[n - 1 - k].value))
          const type = /^\d[A-Za-z0-9]+$/.test(rule.config[0].iconType) ? rule.config[0].iconType : '3TrafficLights1'
          inner = `<calcext:icon-set calcext:icon-set-type="${type}"${rule.isShowValue === false ? ' calcext:show-value="false"' : ''}>${entries.join('')}</calcext:icon-set>`
        }
      } else if (rule.subType === 'timePeriod') {
        const date = DATE_IS[rule.operator ?? '']
        if (date) inner = `<calcext:date-is calcext:style="${this.styleName(rule.style ?? {})}" calcext:date="${date}"/>`
      } else {
        const value = this.condition(rule, tl)
        if (value) inner = `<calcext:condition calcext:apply-style-name="${this.styleName(rule.style ?? {})}" calcext:value="${escapeXml(value)}" calcext:base-cell-address="${escapeXml(base)}"/>`
      }
      if (inner) xml += `<calcext:conditional-format calcext:target-range-address="${escapeXml(target)}">${inner}</calcext:conditional-format>`
    }
    return xml ? `<calcext:conditional-formats>${xml}</calcext:conditional-formats>` : ''
  }

  // <table:named-expressions> for the names of one scope.
  namedExpressions(names: DefinedName[], baseSheet: string): string {
    const base = `$${odsSheetName(baseSheet)}.$A$1`
    let xml = ''
    for (const n of names) {
      if (!/^[A-Za-z_\\][\w.\\]*$/.test(n.name)) continue
      const odf = this.toOdf('=' + n.formulaOrRefString.replace(/^=/, ''))
      const ref = /^=\[([^\]]+)\]$/.exec(odf)
      xml += ref
        ? `<table:named-range table:name="${escapeXml(n.name)}" table:base-cell-address="${escapeXml(base)}" table:cell-range-address="${escapeXml(ref[1])}"/>`
        : `<table:named-expression table:name="${escapeXml(n.name)}" table:base-cell-address="${escapeXml(base)}" table:expression="${escapeXml('of:' + odf)}"/>`
    }
    return xml ? `<table:named-expressions>${xml}</table:named-expressions>` : ''
  }
}

// <table:database-ranges> holding the sheets' auto filters.
export function odsDatabaseRanges(filters: { sheet: string; filter: SheetFilter }[]): string {
  const ranges = filters.map(({ sheet, filter }, i) => {
    const conditions: string[] = []
    for (const c of filter.filterColumns ?? []) {
      const field = c.colId - filter.ref.startColumn
      if (field < 0) continue
      const values = c.filters?.filters ?? []
      if (c.filters) {
        const all = [...values, ...(c.filters.blank ? [''] : [])]
        if (all.length === 1) conditions.push(`<table:filter-condition table:field-number="${field}" table:value="${escapeXml(all[0])}" table:operator="="/>`)
        else if (all.length > 1)
          conditions.push(
            `<table:filter-condition table:field-number="${field}" table:value="${escapeXml(all[0])}" table:operator="=">${all.map((v) => `<table:filter-set-item table:value="${escapeXml(v)}"/>`).join('')}</table:filter-condition>`,
          )
      } else if (c.customFilters?.customFilters.length) {
        const op = { equal: '=', notEqual: '!=', greaterThan: '>', greaterThanOrEqual: '>=', lessThan: '<', lessThanOrEqual: '<=' }
        const parts = c.customFilters.customFilters.map((f) => {
          const numeric = typeof f.val === 'number'
          return `<table:filter-condition table:field-number="${field}" table:value="${escapeXml(String(f.val))}"${numeric ? ' table:data-type="number"' : ''} table:operator="${escapeXml(op[(f.operator ?? 'equal') as keyof typeof op] ?? '=')}"/>`
        })
        conditions.push(parts.length > 1 && !c.customFilters.and ? `<table:filter-or>${parts.join('')}</table:filter-or>` : parts.join(''))
      }
    }
    const filterXml = conditions.length ? `<table:filter>${conditions.length > 1 ? `<table:filter-and>${conditions.join('')}</table:filter-and>` : conditions[0]}</table:filter>` : ''
    return `<table:database-range table:name="__Anonymous_Sheet_DB__${i}" table:target-range-address="${escapeXml(odsRange(sheet, filter.ref))}" table:display-filter-buttons="true">${filterXml}</table:database-range>`
  })
  return ranges.length ? `<table:database-ranges>${ranges.join('')}</table:database-ranges>` : ''
}

export function odsAnnotation(note: SheetNote): string {
  const paragraphs = note.note
    .split(/\r\n|\r|\n/)
    .map((line) => `<text:p>${escapeXml(line)}</text:p>`)
    .join('')
  return `<office:annotation office:display="false" svg:width="${inches(note.width ?? 160)}" svg:height="${inches(note.height ?? 72)}">${paragraphs}</office:annotation>`
}

// ---------------------------------------------------------------------------
// Import

type ToExcel = (odfFormula: string) => string

const VALUE_TYPE: Record<string, CfValue['type']> = {
  number: 'num',
  minimum: 'min',
  maximum: 'max',
  'auto-minimum': 'min',
  'auto-maximum': 'max',
  percent: 'percent',
  percentile: 'percentile',
  formula: 'formula',
}

function splitArgs(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let quoted = false
  let cur = ''
  for (const ch of s) {
    if (ch === '"') quoted = !quoted
    if (!quoted && ch === '(') depth++
    if (!quoted && ch === ')') depth--
    if (!quoted && depth === 0 && ch === ',') {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out.map((x) => x.trim())
}

const unquote = (s: string) => (/^"(.*)"$/s.test(s) ? s.slice(1, -1).replace(/""/g, '"') : undefined)

// Conditional formats of a table (LibreOffice's calcext elements).
export function readOdsConditionalFormats(table: Element, styleOf: (name: string | null) => IStyleData, toExcel: ToExcel): CfRule[] {
  const out: CfRule[] = []
  const formula = (expr: string) => toExcel('of:=' + expr)
  for (const group of children(table, 'conditional-formats')) {
    for (const format of children(group, 'conditional-format')) {
      const ranges = parseOdsRanges(attr(format, 'target-range-address') ?? '')
      if (!ranges.length) continue
      const tl = cellA1(ranges[0].startRow, ranges[0].startColumn)
      const push = (rule: CfRule['rule']) => out.push({ cfId: newCfId(), ranges, stopIfTrue: false, rule })
      const entryValue = (e: Element): CfValue => {
        const type = VALUE_TYPE[attr(e, 'type') ?? 'number'] ?? 'num'
        const v = attr(e, 'value') ?? '0'
        if (type === 'min' || type === 'max') return { type }
        if (type === 'formula') return { type, value: formula(v) }
        return { type, value: Number(v) || 0 }
      }
      for (const el of children(format)) {
        try {
          if (el.localName === 'color-scale') {
            const entries = children(el, 'color-scale-entry')
            if (entries.length >= 2) push({ type: 'colorScale', config: entries.map((e, index) => ({ index, color: toHex(attr(e, 'color')) ?? '#000000', value: entryValue(e) })) })
          } else if (el.localName === 'data-bar') {
            const entries = children(el, 'formatting-entry')
            push({
              type: 'dataBar',
              isShowValue: attr(el, 'show-value') !== 'false',
              config: {
                min: entries[0] ? entryValue(entries[0]) : { type: 'min' },
                max: entries[1] ? entryValue(entries[1]) : { type: 'max' },
                isGradient: attr(el, 'gradient') !== 'false',
                positiveColor: toHex(attr(el, 'positive-color')) ?? '#638ec6',
                nativeColor: toHex(attr(el, 'negative-color')) ?? '#ff0000',
              },
            })
          } else if (el.localName === 'icon-set') {
            const entries = children(el, 'formatting-entry')
            const type = attr(el, 'icon-set-type') ?? '3TrafficLights1'
            const n = Math.max(3, entries.length)
            push({ type: 'iconSet', isShowValue: attr(el, 'show-value') !== 'false', config: iconConfig(type, n, false, (k) => (entries[k] ? entryValue(entries[k]) : { type: 'num', value: 0 })) })
          } else if (el.localName === 'date-is') {
            const date = Object.entries(DATE_IS).find(([, v]) => v === attr(el, 'date'))?.[0]
            if (date) push(highlight('timePeriod', styleOf(attr(el, 'style')), { operator: date }))
          } else if (el.localName === 'condition') {
            const rule = conditionRule(attr(el, 'value') ?? '', styleOf(attr(el, 'apply-style-name')), tl, formula)
            if (rule) push(rule)
          }
        } catch (err) {
          console.warn('Could not read a conditional format', err)
        }
      }
    }
  }
  return out
}

function conditionRule(value: string, style: IStyleData, tl: string, formula: (expr: string) => string): HighlightRule | null {
  const v = value.trim()
  const call = /^([a-z-]+)\((.*)\)$/s.exec(v)
  const fn = call?.[1]
  const args = call ? splitArgs(call[2]) : []
  const num = (s: string | undefined) => (s !== undefined && s.trim() !== '' && Number.isFinite(Number(s)) ? Number(s) : undefined)
  if (fn === 'between' || fn === 'not-between') {
    const operator = fn === 'between' ? 'between' : 'notBetween'
    const [a, b] = [num(args[0]), num(args[1])]
    if (a !== undefined && b !== undefined) return highlight('number', style, { operator, value: [a, b] })
    return highlight('formula', style, { value: '=' + numberRuleFormula(operator, [formula(args[0] ?? '0').slice(1), formula(args[1] ?? '0').slice(1)], tl) })
  }
  const textOps: Record<string, string> = { 'contains-text': 'containsText', 'not-contains-text': 'notContainsText', 'begins-with': 'beginsWith', 'ends-with': 'endsWith' }
  if (fn && textOps[fn]) {
    const text = unquote(args[0] ?? '')
    if (text !== undefined) return highlight('text', style, { operator: textOps[fn], value: text })
    return highlight('formula', style, { value: '=' + textRuleFormula(textOps[fn], '', tl) })
  }
  if (fn === 'formula-is') return highlight('formula', style, { value: formula(call![2]) })
  const rank = /^(top|bottom)-(elements|percent)$/.exec(fn ?? '')
  if (rank) return highlight('rank', style, { value: num(args[0]) ?? 10, isBottom: rank[1] === 'bottom', isPercent: rank[2] === 'percent' })
  const simple: Record<string, () => HighlightRule> = {
    duplicate: () => highlight('duplicateValues', style),
    unique: () => highlight('uniqueValues', style),
    'above-average': () => highlight('average', style, { operator: 'greaterThan' }),
    'below-average': () => highlight('average', style, { operator: 'lessThan' }),
    'above-equal-average': () => highlight('average', style, { operator: 'greaterThanOrEqual' }),
    'below-equal-average': () => highlight('average', style, { operator: 'lessThanOrEqual' }),
    'is-error': () => highlight('text', style, { operator: 'containsErrors' }),
    'is-no-error': () => highlight('text', style, { operator: 'notContainsErrors' }),
  }
  if (simple[v]) return simple[v]()
  const cmp = /^(<=|>=|!=|<|>|=)(.*)$/s.exec(v)
  if (cmp) {
    const operator = { '<=': 'lessThanOrEqual', '>=': 'greaterThanOrEqual', '!=': 'notEqual', '<': 'lessThan', '>': 'greaterThan', '=': 'equal' }[cmp[1]]!
    const n = num(cmp[2])
    if (n !== undefined) return highlight('number', style, { operator, value: n })
    const text = unquote(cmp[2].trim())
    if (text !== undefined && (operator === 'equal' || operator === 'notEqual')) return highlight('text', style, { operator, value: text })
    return highlight('formula', style, { value: `=${tl}${cmp[1] === '!=' ? '<>' : cmp[1]}${formula(cmp[2]).slice(1)}` })
  }
  return null
}

// Notes of a cell (office:annotation, the first child of the cell).
export function readOdsNote(cell: Element): Pick<SheetNote, 'note' | 'width' | 'height'> | null {
  const a = child(cell, 'annotation')
  if (!a) return null
  const text = children(a, 'p')
    .map((p) => p.textContent ?? '')
    .join('\n')
  if (!text) return null
  const px = (v: string | null) => {
    const m = /^([\d.]+)(in|cm|mm|pt)$/.exec(v ?? '')
    return m ? Math.round(Number(m[1]) * { in: 96, cm: 96 / 2.54, mm: 96 / 25.4, pt: 96 / 72 }[m[2] as 'in']) : undefined
  }
  return { note: text, ...(px(attr(a, 'width')) ? { width: px(attr(a, 'width')) } : {}), ...(px(attr(a, 'height')) ? { height: px(attr(a, 'height')) } : {}) }
}

// Named ranges and expressions of a <table:named-expressions> element.
export function readOdsNames(el: Element | null, scope: string, toExcel: ToExcel, startId: number): DefinedName[] {
  const out: DefinedName[] = []
  if (!el) return out
  for (const n of children(el)) {
    const name = attr(n, 'name')
    if (!name) continue
    let formula: string | null = null
    if (n.localName === 'named-range') {
      const address = attr(n, 'cell-range-address')
      if (address) formula = toExcel(`of:=[${address}]`)
    } else if (n.localName === 'named-expression') {
      const expression = attr(n, 'expression')
      if (expression) formula = toExcel(expression.startsWith('of:') ? expression : `of:=${expression}`)
    }
    if (formula && !/#REF!/.test(formula)) out.push({ id: `name-${startId + out.length + 1}`, name, formulaOrRefString: formula.replace(/^=/, ''), localSheetId: scope })
  }
  return out
}

// Auto filters (database ranges with filter buttons), by sheet name.
export function readOdsFilters(spreadsheet: Element): Map<string, SheetFilter> {
  const out = new Map<string, SheetFilter>()
  for (const group of children(spreadsheet, 'database-ranges')) {
    for (const db of children(group, 'database-range')) {
      if (attr(db, 'display-filter-buttons') !== 'true') continue
      const address = attr(db, 'target-range-address') ?? ''
      const sheet = /^\$?('(?:[^']|'')*'|[^.]*)\./.exec(address)?.[1]?.replace(/^'|'$/g, '').replace(/''/g, "'")
      const ref = parseOdsRanges(address)[0]
      if (!sheet || !ref || out.has(sheet)) continue
      const columns = new Map<number, FilterColumn>()
      const filter = child(db, 'filter')
      const conditions = filter ? [...filter.getElementsByTagNameNS('*', 'filter-condition')] : []
      const ors = new Set(filter ? [...filter.getElementsByTagNameNS('*', 'filter-or')] : [])
      for (const c of conditions) {
        const field = Number(attr(c, 'field-number'))
        if (!Number.isFinite(field)) continue
        const colId = ref.startColumn + field
        const operator = attr(c, 'operator') ?? '='
        const items = children(c, 'filter-set-item').map((i) => attr(i, 'value') ?? '')
        const value = attr(c, 'value') ?? ''
        if (operator === '=' && attr(c, 'data-type') !== 'number') {
          const col = columns.get(colId) ?? { colId, filters: { filters: [] } }
          const values = items.length ? items : [value]
          for (const v of values) {
            if (v === '') col.filters!.blank = true
            else col.filters!.filters!.push(v)
          }
          columns.set(colId, col)
        } else {
          const op = { '=': 'equal', '!=': 'notEqual', '>': 'greaterThan', '>=': 'greaterThanOrEqual', '<': 'lessThan', '<=': 'lessThanOrEqual' }[operator]
          if (!op) continue
          const col = columns.get(colId) ?? { colId, customFilters: { customFilters: [] as never } }
          if (!col.customFilters) continue
          const numeric = value !== '' && Number.isFinite(Number(value))
          ;(col.customFilters.customFilters as { val: string | number; operator?: string }[]).push({ val: numeric ? Number(value) : value, operator: op })
          if (!c.parentElement || !ors.has(c.parentElement)) col.customFilters.and = 1
          columns.set(colId, col)
        }
      }
      out.set(sheet, { ref, filterColumns: [...columns.values()].map((c) => (c.customFilters ? { ...c, customFilters: { ...c.customFilters, customFilters: c.customFilters.customFilters.slice(0, 2) as never } } : c)) })
    }
  }
  return out
}

