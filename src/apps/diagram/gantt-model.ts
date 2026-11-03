// Calendar-day scheduling, independent of the browser's timezone and DST.
export interface GanttTask {
  id: string
  name: string
  start: string
  duration: number
  owner: string
  progress: number
  milestone: boolean
  dependencies: string[]
  order: number
}

export interface GanttProject {
  version: 1
  tasks: GanttTask[]
}

export interface ScheduledTask extends GanttTask {
  startDay: number
  endDay: number // Exclusive; milestones have zero duration.
}

export type GanttErrorCode = 'invalid' | 'cycle' | 'missing' | 'range' | 'readonly'
export class GanttError extends Error {
  constructor(readonly code: GanttErrorCode) { super(`Gantt: ${code}`) }
}

export const MAX_TASKS = 200
const DAY = 86_400_000

export function dateDay(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new GanttError('invalid')
  const time = Date.parse(`${value}T00:00:00Z`)
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value || value < '1970-01-01' || value > '2100-12-31') throw new GanttError('invalid')
  return time / DAY
}

export const dayDate = (day: number): string => new Date(day * DAY).toISOString().slice(0, 10)
export const todayDate = (): string => {
  const now = new Date()
  return dayDate(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY)
}

export function parseGantt(value: string): GanttProject {
  if (value.length > 500_000) throw new GanttError('invalid')
  let project: unknown
  try { project = JSON.parse(value) } catch { throw new GanttError('invalid') }
  if (!project || typeof project !== 'object' || (project as GanttProject).version !== 1 || !Array.isArray((project as GanttProject).tasks)) throw new GanttError('invalid')
  const tasks = (project as GanttProject).tasks
  validateTasks(tasks)
  return { version: 1, tasks }
}

export function validateTasks(tasks: GanttTask[], enforceTaskLimit = true): void {
  if (enforceTaskLimit && tasks.length > MAX_TASKS) throw new GanttError('range')
  const ids = new Set<string>()
  for (const task of tasks) {
    if (!task || typeof task !== 'object' || typeof task.id !== 'string' || !/^[\w-]{1,80}$/.test(task.id) || ids.has(task.id) ||
      typeof task.name !== 'string' || !task.name.trim() || task.name.length > 200 || typeof task.owner !== 'string' || task.owner.length > 100 ||
      typeof task.start !== 'string' || typeof task.milestone !== 'boolean' || !Number.isInteger(task.duration) || task.duration < 1 || task.duration > 3660 ||
      !Number.isInteger(task.progress) || task.progress < 0 || task.progress > 100 || !Number.isFinite(task.order) ||
      !Array.isArray(task.dependencies) || task.dependencies.length > MAX_TASKS || task.dependencies.some((id) => typeof id !== 'string' || !/^[\w-]{1,80}$/.test(id))) throw new GanttError('invalid')
    dateDay(task.start)
    ids.add(task.id)
  }
}

// Enumerate all invalid dependency edges so a conflicted collaborative graph
// can be repaired one task at a time, even when several cycles coexist.
export function ganttDependencyErrors(tasks: GanttTask[]): Set<string> {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const reaches = new Map<string, Set<string>>()
  for (const task of tasks) {
    const visited = new Set<string>()
    const pending = [...task.dependencies]
    while (pending.length) {
      const id = pending.pop()!
      if (visited.has(id)) continue
      visited.add(id)
      pending.push(...(byId.get(id)?.dependencies ?? []))
    }
    reaches.set(task.id, visited)
  }
  const errors = new Set<string>()
  for (const task of tasks) for (const predecessor of task.dependencies) {
    if (!byId.has(predecessor)) errors.add(`missing:${task.id}:${predecessor}`)
    else if (reaches.get(predecessor)?.has(task.id)) errors.add(`cycle:${task.id}:${predecessor}`)
  }
  return errors
}

// Start is an earliest requested date. Finish-to-start constraints propagate
// through the DAG without rewriting requested dates, so replicas derive the
// same schedule even when independent edits arrive in a different order.
export function scheduleTasks(tasks: GanttTask[]): ScheduledTask[] {
  validateTasks(tasks)
  const input = new Map(tasks.map((task) => [task.id, task]))
  const result = new Map<string, ScheduledTask>()
  const visiting = new Set<string>()
  const visit = (id: string): ScheduledTask => {
    const done = result.get(id)
    if (done) return done
    if (visiting.has(id)) throw new GanttError('cycle')
    const task = input.get(id)
    if (!task) throw new GanttError('missing')
    visiting.add(id)
    const startDay = Math.max(dateDay(task.start), ...task.dependencies.map((dependency) => visit(dependency).endDay))
    const endDay = startDay + (task.milestone ? 0 : task.duration)
    if (endDay > dateDay('2100-12-31') + 1) throw new GanttError('range')
    const scheduled = { ...task, startDay, endDay }
    visiting.delete(id)
    result.set(id, scheduled)
    return scheduled
  }
  const ordered = [...tasks].sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map((task) => visit(task.id))
  if (ordered.length && Math.max(...ordered.map((task) => Math.max(task.endDay, task.startDay + 1))) - Math.min(...ordered.map((task) => task.startDay)) > 3660) throw new GanttError('range')
  return ordered
}

export type GanttScale = 'days' | 'weeks' | 'months'
export const ROW_HEIGHT = 44
export const HEADER_HEIGHT = 56

// Keep large schedules exportable within common browser canvas limits.
export const ganttRasterScale = (width: number, height: number): number => Math.min(2, 8000 / Math.max(1, width, height), Math.sqrt(16_000_000 / Math.max(1, width * height)))

export function ganttLayout(tasks: ScheduledTask[], scale: GanttScale, minimumWidth = 640) {
  const start = (tasks.length ? Math.min(...tasks.map((task) => task.startDay)) : dateDay(todayDate())) - 2
  const end = Math.max(start + 30, ...tasks.map((task) => Math.max(task.endDay, task.startDay + 1) + 3))
  const span = end - start
  const dayWidth = Math.min(8000 / span, Math.max(minimumWidth / span, scale === 'days' ? 28 : scale === 'weeks' ? 12 : 4))
  const ticks: { day: number; end: number }[] = []
  const step = scale === 'days' ? Math.max(1, Math.ceil(span / 240)) : scale === 'weeks' ? 7 * Math.max(1, Math.ceil(span / 1120)) : 0
  for (let day = start; day < end;) {
    const current = new Date(day * DAY)
    const next = step ? Math.min(end, day + step) : Math.min(end, Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 1) / DAY)
    ticks.push({ day, end: next })
    day = next
  }
  return { start, end, dayWidth, width: span * dayWidth, height: HEADER_HEIGHT + Math.max(1, tasks.length) * ROW_HEIGHT, ticks, x: (day: number) => (day - start) * dayWidth }
}

export function sampleGantt(names: string[], start = todayDate()): GanttProject {
  const first = dateDay(start)
  return { version: 1, tasks: names.map((name, index) => ({
    id: `task-${index + 1}`, name, start: dayDate(first), duration: index === 0 ? 3 : index === names.length - 1 ? 1 : 5,
    owner: '', progress: 0, milestone: index === names.length - 1, dependencies: index ? [`task-${index}`] : [], order: index,
  })) }
}
