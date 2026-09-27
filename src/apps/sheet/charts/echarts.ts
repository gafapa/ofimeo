// The parts of Apache ECharts the charts use (loaded on demand, only when a
// sheet shows, prints or previews a chart).

import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart, ScatterChart } from 'echarts/charts'
import { GraphicComponent, GridComponent, LegendComponent, TitleComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer, SVGRenderer } from 'echarts/renderers'

echarts.use([BarChart, LineChart, PieChart, ScatterChart, GraphicComponent, GridComponent, LegendComponent, TitleComponent, TooltipComponent, CanvasRenderer, SVGRenderer])

export { echarts }

// Server-side style SVG rendering (printing, exports).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function renderSvg(option: Record<string, any>, width: number, height: number): string {
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width, height })
  chart.setOption(option)
  const svg = chart.renderToSVGString()
  chart.dispose()
  return svg
}
