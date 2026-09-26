// ECharts option for a chart spec and its data (plain objects: this module
// does not load ECharts, so printing and the dialog preview can share it).

import { equationText, linearRegression, PALETTES, type ChartData, type ChartSpec } from './model'

export interface ChartColors {
  background: string
  text: string
  muted: string
  grid: string
}

export const PAPER_COLORS: ChartColors = { background: '#ffffff', text: '#202124', muted: '#5f6368', grid: '#e0e0e0' }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Option = Record<string, any>

// `width`: the chart's width in pixels (category labels wrap to fit their slot).
export function chartOption(spec: ChartSpec, data: ChartData, colors: ChartColors, format: (n: number) => string, width = 480): Option {
  const palette = PALETTES[spec.palette] ?? PALETTES.ofimeo
  const textStyle = { color: colors.text, fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' }
  const legend =
    spec.legend === 'none'
      ? { show: false }
      : spec.legend === 'right'
        ? { show: true, orient: 'vertical', right: 8, top: 'middle', textStyle }
        : { show: true, [spec.legend === 'top' ? 'top' : 'bottom']: spec.legend === 'top' ? (spec.title ? 30 : 4) : 4, textStyle, type: 'scroll' }
  const base: Option = {
    animation: false,
    backgroundColor: colors.background,
    color: palette,
    textStyle,
    title: spec.title ? { text: spec.title, left: 'center', top: 6, textStyle: { ...textStyle, fontSize: 15, fontWeight: 600 } } : undefined,
    tooltip: { trigger: spec.type === 'pie' || spec.type === 'doughnut' || spec.type === 'scatter' ? 'item' : 'axis', confine: true },
    legend,
  }
  const top = (spec.title ? 38 : 14) + (spec.legend === 'top' ? 26 : 0)
  const horizontal = spec.type === 'bar'
  const grid = {
    left: (horizontal ? 76 : 44) + (spec.yTitle ? 22 : 0),
    right: spec.legend === 'right' ? 130 : 20,
    top,
    bottom: (spec.legend === 'bottom' ? 60 : 40) + (spec.xTitle ? 24 : 0),
  }
  const axisCommon = {
    axisLine: { lineStyle: { color: colors.muted } },
    axisLabel: { color: colors.muted },
    splitLine: { lineStyle: { color: colors.grid } },
    nameTextStyle: { color: colors.text, fontSize: 12 },
  }
  const xName = spec.xTitle ? { name: spec.xTitle, nameLocation: 'middle', nameGap: 28 } : {}
  const yName = spec.yTitle ? { name: spec.yTitle, nameLocation: 'middle', nameGap: horizontal ? 66 : 40 } : {}

  if (spec.type === 'pie' || spec.type === 'doughnut') {
    const s = data.series[0] ?? { name: '', values: [] }
    return {
      ...base,
      series: [
        {
          type: 'pie',
          name: s.name,
          radius: spec.type === 'doughnut' ? ['38%', '66%'] : '66%',
          center: ['50%', spec.legend === 'bottom' ? '50%' : '54%'],
          label: { color: colors.text, formatter: '{b}: {d}%' },
          data: data.categories.map((c, i) => ({ name: c, value: s.values[i] ?? 0 })),
        },
      ],
    }
  }

  if (spec.type === 'scatter') {
    const x = data.x ?? []
    const series: Option[] = data.series.map((s) => ({ type: 'scatter', name: s.name, symbolSize: 8, data: x.map((xi, i) => [xi, s.values[i]]).filter((p) => p[0] !== null && p[1] !== null) }))
    const equations: string[] = []
    if (spec.trendline) {
      const xs = x.filter((v): v is number => v !== null && Number.isFinite(v))
      const [min, max] = [Math.min(...xs), Math.max(...xs)]
      data.series.forEach((s, i) => {
        const reg = linearRegression(x, s.values)
        if (!reg || !xs.length) return
        equations.push((data.series.length > 1 ? `${s.name}: ` : '') + equationText(reg, format))
        series.push({
          type: 'line',
          name: `${s.name} (trend)`,
          showSymbol: false,
          silent: true,
          lineStyle: { type: 'dashed', width: 2, color: palette[i % palette.length] },
          itemStyle: { color: palette[i % palette.length] },
          data: [[min, reg.intercept + reg.slope * min], [max, reg.intercept + reg.slope * max]],
          tooltip: { show: false },
        })
      })
    }
    const eqTop = top
    return {
      ...base,
      legend: { ...legend, data: data.series.map((s) => s.name) },
      grid: { ...grid, top: top + equations.length * 16 },
      xAxis: { type: 'value', scale: true, ...axisCommon, ...xName },
      yAxis: { type: 'value', scale: true, ...axisCommon, ...yName },
      graphic: equations.map((text, i) => ({ type: 'text', left: grid.left, top: eqTop + i * 16 - 6, style: { text, fill: colors.text, font: '12px system-ui, sans-serif' } })),
      series,
    }
  }

  // Every category label is shown, wrapped to its slot on vertical charts.
  const slot = Math.max(40, (width - grid.left - grid.right) / Math.max(1, data.categories.length) - 6)
  const categoryAxis = {
    type: 'category',
    data: data.categories,
    ...axisCommon,
    axisLabel: { color: colors.muted, interval: 0, ...(horizontal ? { width: 70, overflow: 'truncate' } : { width: slot, overflow: 'break' }) },
    splitLine: { show: false },
  }
  const valueAxis = { type: 'value', ...axisCommon }
  return {
    ...base,
    grid,
    xAxis: horizontal ? { ...valueAxis, ...xName } : { ...categoryAxis, ...xName },
    yAxis: horizontal ? { ...categoryAxis, inverse: true, ...yName } : { ...valueAxis, ...yName },
    series: data.series.map((s) => ({
      type: spec.type === 'column' || spec.type === 'bar' ? 'bar' : 'line',
      name: s.name,
      data: s.values,
      ...(spec.type === 'area' ? { areaStyle: { opacity: 0.35 } } : {}),
      ...(spec.type === 'line' || spec.type === 'area' ? { symbolSize: 6, connectNulls: true } : {}),
    })),
  }
}
