// A generated draw.io view accompanies the structured project in exports.
// Other editors see ordinary shapes; Ofimeo reopens the editable task model.
import { t } from '../../core/i18n'
import { HEADER_HEIGHT, ROW_HEIGHT, dayDate, ganttLayout, parseGantt, scheduleTasks } from './gantt-model'
import type { CellRecord, PageRecord } from './model'
import { locale } from '../../core/i18n'

export function ganttRecords(page: PageRecord): PageRecord {
  if (!page.gantt) return page
  const tasks = scheduleTasks(parseGantt(page.gantt).tasks)
  const layout = ganttLayout(tasks, 'weeks')
  const cells: CellRecord[] = [{ id: '0' }, { id: '1', parent: '0' }]
  const left = 420
  const date = (day: number) => new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${dayDate(day)}T00:00:00Z`))
  const vertex = (id: string, value: string, x: number, y: number, width: number, height: number, style = '') => {
    cells.push({ id, parent: '1', previous: cells.at(-1)!.id === '1' ? undefined : cells.at(-1)!.id, vertex: 1, connectable: 0,
      value, style: `html=0;whiteSpace=wrap;fillColor=#ffffff;strokeColor=#dadce0;fontColor=#1f2328;fontSize=12;${style}`,
      geometry: JSON.stringify({ x, y, width, height }) })
  }
  vertex('gantt-heading', t('Task'), 0, 0, left, HEADER_HEIGHT, 'align=left;spacingLeft=12;fontStyle=1;fillColor=#f8f9fa;')
  for (const [index, tick] of layout.ticks.entries()) vertex(`gantt-tick-${index}`, date(tick.day), left + layout.x(tick.day), 0, (tick.end - tick.day) * layout.dayWidth, HEADER_HEIGHT, 'fillColor=#f8f9fa;')
  const ids = new Map(tasks.map((task) => [task.id, `gantt-bar-${task.id}`]))
  tasks.forEach((task, index) => {
    const y = HEADER_HEIGHT + index * ROW_HEIGHT
    const end = task.milestone ? task.startDay : task.endDay - 1
    const detail = [task.owner, `${date(task.startDay)} – ${date(end)}`, `${task.progress}%`].filter(Boolean).join(' · ')
    vertex(`gantt-name-${task.id}`, `${task.name}\n${detail}`, 0, y, left, ROW_HEIGHT, 'align=left;spacingLeft=12;')
    vertex(ids.get(task.id)!, task.milestone ? '' : `${task.name} (${task.progress}%)`, left + layout.x(task.startDay), y + 11,
      task.milestone ? 20 : Math.max(4, (task.endDay - task.startDay) * layout.dayWidth), 22,
      `fillColor=#d3e3fd;strokeColor=#1a73e8;${task.milestone ? 'rhombus;' : 'rounded=1;arcSize=12;'}fontSize=11;`)
    if (!task.milestone && task.progress > 0) vertex(`gantt-progress-${task.id}`, '', left + layout.x(task.startDay), y + 29,
      Math.max(1, (task.endDay - task.startDay) * layout.dayWidth * task.progress / 100), 4, 'fillColor=#1a73e8;strokeColor=none;')
  })
  tasks.forEach((task) => task.dependencies.forEach((dependency, index) => cells.push({
    id: `gantt-edge-${task.id}-${index}`, parent: '1', edge: 1, source: ids.get(dependency), target: ids.get(task.id),
    style: 'edgeStyle=orthogonalEdgeStyle;html=0;strokeColor=#5f6368;endArrow=block;exitX=1;exitY=0.5;entryX=0;entryY=0.5;',
    geometry: JSON.stringify({ x: 0, y: 0, width: 0, height: 0, relative: 1 }),
  })))
  return { ...page, cells, pageWidth: left + layout.width, pageHeight: layout.height, background: '#ffffff' }
}
