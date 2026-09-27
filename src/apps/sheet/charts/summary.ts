// Text alternatives of charts for screen readers: a one-paragraph summary
// (type, title, series and their range of values) and the chart's data as an
// HTML table (Edit ▸ Chart data as table, the chart's context menu and the
// accessible table view).

import { t } from '../../../core/i18n'
import { el, showDialog } from '../../../ui/widgets'
import type { ChartData, ChartSpec, ChartType } from './model'

const typeName = (type: ChartType): string =>
  ({
    column: t('Column chart'),
    bar: t('Bar chart'),
    line: t('Line chart'),
    area: t('Area chart'),
    pie: t('Pie chart'),
    doughnut: t('Doughnut chart'),
    scatter: t('Scatter chart'),
  })[type]

// Values listed one by one up to this many points; longer series get minimum and maximum.
const LIST_MAX = 8

export function chartSummary(spec: ChartSpec, data: ChartData, format: (n: number) => string): string {
  const parts = [spec.title ? `${typeName(spec.type)}: ${spec.title}.` : `${typeName(spec.type)}.`]
  const labels = data.x ? data.x.map((x) => format(x)) : data.categories
  if (data.series.length) parts.push(t('{count} series, {points} points.', { count: data.series.length, points: labels.length }))
  for (const s of data.series.slice(0, 6)) {
    const pts = s.values.map((v, i) => [labels[i] ?? String(i + 1), v] as const).filter((p): p is readonly [string, number] => p[1] !== null)
    if (!pts.length) {
      parts.push(`${s.name}: ${t('no values')}.`)
    } else if (pts.length <= LIST_MAX) {
      parts.push(`${s.name}: ${pts.map(([l, v]) => `${l} ${format(v)}`).join(', ')}.`)
    } else {
      const min = pts.reduce((a, b) => (b[1] < a[1] ? b : a))
      const max = pts.reduce((a, b) => (b[1] > a[1] ? b : a))
      parts.push(t('{name}: from {first} to {last}; minimum {min} ({minAt}), maximum {max} ({maxAt}).', {
        name: s.name,
        first: format(pts[0][1]),
        last: format(pts[pts.length - 1][1]),
        min: format(min[1]),
        minAt: min[0],
        max: format(max[1]),
        maxAt: max[0],
      }))
    }
  }
  if (data.series.length > 6) parts.push(t('And {count} more series.', { count: data.series.length - 6 }))
  return parts.join(' ')
}

// The chart's data as a table: one row per category (or x value), one column per series.
export function chartDataTable(spec: ChartSpec, data: ChartData, format: (n: number) => string): HTMLTableElement {
  const table = el('table', { class: 'chart-data-table' })
  table.append(el('caption', { textContent: spec.title || typeName(spec.type) }))
  const head = el('tr', {}, el('th', { scope: 'col', textContent: data.x ? spec.xTitle || 'x' : spec.xTitle || t('Category') }))
  for (const s of data.series) head.append(el('th', { scope: 'col', textContent: s.name }))
  table.append(el('thead', {}, head))
  const body = el('tbody')
  const labels = data.x ? data.x.map((x) => format(x)) : data.categories
  labels.forEach((label, i) => {
    const row = el('tr', {}, el('th', { scope: 'row', textContent: label }))
    for (const s of data.series) row.append(el('td', { textContent: s.values[i] === null || s.values[i] === undefined ? '' : format(s.values[i]!) }))
    body.append(row)
  })
  table.append(body)
  return table
}

export async function chartDataDialog(spec: ChartSpec, data: ChartData, format: (n: number) => string): Promise<void> {
  const body = el(
    'div',
    { class: 'shortcut-scroll chart-data' },
    el('p', { textContent: chartSummary(spec, data, format) }),
    el('p', { class: 'dialog-note', textContent: t('Source cells: {range}', { range: spec.range }) }),
    chartDataTable(spec, data, format),
  )
  await showDialog(t('Chart data'), body, [{ label: t('Close'), value: 'ok', primary: true }], true)
}
