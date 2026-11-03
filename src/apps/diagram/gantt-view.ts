import { Plus, Redo2, Undo2 } from 'lucide'
import { locale, t, tn } from '../../core/i18n'
import type { Session } from '../../core/session'
import { confirmDialog, el, icon, showDialog, toast } from '../../ui/widgets'
import { GanttError, HEADER_HEIGHT, MAX_TASKS, ROW_HEIGHT, dateDay, dayDate, ganttLayout, scheduleTasks, todayDate, type GanttScale, type GanttTask, type ScheduledTask } from './gantt-model'
import { GanttStore } from './gantt-state'
import './gantt.css'

const svgNode = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, text?: string): SVGElementTagNameMap[K] => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag)
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value))
  if (text !== undefined) node.textContent = text
  return node
}

export function ganttError(error: unknown): string {
  if (error instanceof GanttError) {
    if (error.code === 'cycle') return t('These dependencies form a cycle. Remove a dependency to continue.')
    if (error.code === 'missing') return t('A predecessor was deleted. Edit the affected task and remove its dependency.')
    if (error.code === 'range') return t('Use up to 200 tasks within a ten-year schedule.')
    if (error.code === 'readonly') return t('This link does not allow editing.')
  }
  return t('Check task names, dates, durations and progress before saving.')
}

export class GanttView {
  readonly element = el('section', { class: 'gantt-workspace', hidden: true })
  private store?: GanttStore
  private readonly stores = new Map<string, GanttStore>()
  private scale: GanttScale = 'weeks'
  private readonly toolbar = el('div', { class: 'gantt-toolbar' })
  private readonly content = el('div', { class: 'gantt-content' })
  private readonly alert = el('p', { class: 'gantt-error', hidden: true })
  private readonly summary = el('p', { class: 'gantt-summary' })
  private readonly undoButton = this.button(t('Undo'), () => this.undo(), Undo2)
  private readonly redoButton = this.button(t('Redo'), () => this.redo(), Redo2)
  private readonly addButton = this.button(t('Add task'), () => void this.editTask(), Plus)
  private queued = false
  private readonly resizeObserver = new ResizeObserver(() => this.onChange())
  private readonly onChange = () => {
    if (this.queued) return
    this.queued = true
    queueMicrotask(() => { this.queued = false; if (this.element.isConnected) this.render() })
  }

  constructor(private readonly session: Session) {
    this.element.setAttribute('aria-label', t('Gantt chart'))
    this.alert.setAttribute('role', 'alert')
    this.summary.setAttribute('aria-live', 'polite')
    const scale = el('select', { class: 'field', value: this.scale })
    scale.setAttribute('aria-label', t('Calendar scale'))
    for (const [value, label] of [['days', t('Days')], ['weeks', t('Weeks')], ['months', t('Months')]]) scale.append(el('option', { value, textContent: label }))
    scale.value = this.scale
    scale.addEventListener('change', () => { this.scale = scale.value as GanttScale; this.render() })
    this.addButton.classList.add('primary')
    this.toolbar.append(el('h1', { textContent: t('Gantt chart') }), this.addButton, this.undoButton, this.redoButton, el('label', { class: 'gantt-scale' }, t('Calendar scale'), scale))
    if (!session.canEdit) {
      this.addButton.hidden = this.undoButton.hidden = this.redoButton.hidden = true
    }
    const help = el('p', { class: 'gantt-help', textContent: session.canEdit
      ? t('Edit a task by its name. Drag a bar to move it; drag its right edge to resize. Arrow keys move a focused bar; Shift+Arrow resizes it.')
      : t('Read-only schedule. Dates follow task dependencies.') })
    this.element.append(this.toolbar, this.summary, help, this.alert, this.content)
    this.resizeObserver.observe(this.element)
    session.doc.on('destroy', () => this.destroy())
  }

  get active(): boolean { return !this.element.hidden }
  show(page: string | null): void {
    this.element.hidden = !page
    if (!page) return
    if (this.store?.page === page) { this.render(); return }
    this.store?.tasks.unobserveDeep(this.onChange)
    this.store = this.forPage(page)
    this.store.tasks.observeDeep(this.onChange)
    this.render()
  }
  undo(): void { if (this.session.canEdit && this.active) this.store?.undo.undo() }
  redo(): void { if (this.session.canEdit && this.active) this.store?.undo.redo() }
  canUndo = (): boolean => !!this.store?.undo.canUndo()
  canRedo = (): boolean => !!this.store?.undo.canRedo()
  forPage(page: string): GanttStore {
    let store = this.stores.get(page)
    if (!store) { store = new GanttStore(this.session.doc, page, this.session.canEdit); this.stores.set(page, store) }
    return store
  }
  addTask = (): void => { if (this.active && this.session.canEdit) void this.editTask() }

  onKey(event: KeyboardEvent): boolean {
    if (!this.active) return false
    if (event.ctrlKey || event.metaKey) {
      if (event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? this.redo() : this.undo() }
      if (event.key.toLowerCase() === 'y') { event.preventDefault(); this.redo() }
    }
    // The hidden freeform canvas must not receive planner shortcuts.
    return true
  }

  private button(label: string, run: () => void, glyph?: typeof Plus): HTMLButtonElement {
    const button = el('button', { type: 'button', class: 'gantt-button', textContent: label })
    if (glyph) button.prepend(icon(glyph, 16))
    button.addEventListener('click', run)
    return button
  }

  private render(): void {
    if (!this.store || !this.active) return
    const focused = document.activeElement instanceof Element ? document.activeElement.getAttribute('data-gantt-focus') : null
    const oldScroll = this.content.querySelector('.gantt-timeline')?.scrollLeft ?? 0
    this.alert.hidden = true
    let tasks: GanttTask[]
    try { tasks = this.store.read().tasks.sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) }
    catch (error) { this.alert.textContent = ganttError(error); this.alert.hidden = false; this.content.replaceChildren(); return }
    let scheduled: ScheduledTask[] = []
    try { scheduled = scheduleTasks(tasks) }
    catch (error) { this.alert.textContent = ganttError(error); this.alert.hidden = false }
    this.undoButton.disabled = !this.canUndo()
    this.redoButton.disabled = !this.canRedo()
    this.addButton.disabled = tasks.length >= MAX_TASKS
    this.summary.textContent = tn(tasks.length, '{n} task', '{n} tasks')
    if (scheduled.length) {
      const first = Math.min(...scheduled.map((task) => task.startDay))
      const last = Math.max(...scheduled.map((task) => task.milestone ? task.startDay : task.endDay - 1))
      this.summary.textContent += ` · ${this.date(first)} – ${this.date(last)}`
    }
    const table = el('table', { class: 'gantt-tasks' })
    table.append(el('caption', { class: 'sr-only', textContent: t('Project tasks') }))
    const head = el('tr')
    for (const label of [t('Task'), t('Start date'), t('End date'), t('Progress')]) head.append(el('th', { scope: 'col', textContent: label }))
    table.append(el('thead', {}, head))
    const body = el('tbody')
    const byId = new Map(scheduled.map((task) => [task.id, task]))
    for (const task of tasks) {
      const row = el('tr')
      row.dataset.taskId = task.id
      const name = this.session.canEdit ? this.button(task.name, () => void this.editTask(task.id)) : el('span', { textContent: task.name })
      name.classList.add('gantt-row-name')
      name.setAttribute('data-gantt-focus', `task-${task.id}`)
      const cell = el('td', {}, name)
      if (task.owner) cell.append(el('span', { class: 'gantt-owner', textContent: task.owner, title: task.owner }))
      const planned = byId.get(task.id)
      const dateCell = (day: number) => el('td', {}, el('time', { dateTime: dayDate(day), title: this.date(day), textContent: new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${dayDate(day)}T00:00:00Z`)) }))
      row.append(cell, planned ? dateCell(planned.startDay) : el('td', { textContent: task.start }),
        planned ? dateCell(task.milestone ? planned.startDay : planned.endDay - 1) : el('td', { textContent: '—' }),
        el('td', { textContent: task.milestone ? t('Milestone') : `${task.progress}%` }))
      body.append(row)
    }
    table.append(body)
    const timeline = el('div', { class: 'gantt-timeline', tabIndex: 0 })
    timeline.setAttribute('aria-label', t('Project calendar'))
    if (scheduled.length) timeline.append(this.chart(scheduled))
    else timeline.append(el('p', { class: 'gantt-empty', textContent: tasks.length ? t('Resolve the task errors to show the calendar.') : t('Add your first task to start planning.') }))
    this.content.replaceChildren(el('div', { class: 'gantt-table-scroll' }, table), timeline)
    timeline.scrollLeft = oldScroll
    if (focused) this.content.querySelector<HTMLElement | SVGElement>(`[data-gantt-focus="${focused}"]`)?.focus()
  }

  private date(day: number): string {
    return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${dayDate(day)}T00:00:00Z`))
  }

  private chart(tasks: ScheduledTask[]): SVGSVGElement {
    const layout = ganttLayout(tasks, this.scale, Math.max(640, this.content.querySelector('.gantt-timeline')?.clientWidth ?? 640))
    const svg = svgNode('svg', { width: layout.width, height: layout.height, viewBox: `0 0 ${layout.width} ${layout.height}`, class: 'gantt-chart', role: 'group', 'aria-label': t('Project calendar') })
    const defs = svgNode('defs')
    const marker = svgNode('marker', { id: 'gantt-dependency-arrow', markerWidth: 8, markerHeight: 8, refX: 7, refY: 4, orient: 'auto' })
    marker.append(svgNode('path', { d: 'M0 0 L8 4 L0 8 Z', class: 'gantt-arrow' }))
    defs.append(marker)
    svg.append(defs)
    for (let day = layout.start; day < layout.end; day++) {
      const weekday = new Date(`${dayDate(day)}T00:00:00Z`).getUTCDay()
      if (weekday === 0 || weekday === 6) svg.append(svgNode('rect', { x: layout.x(day), y: HEADER_HEIGHT, width: layout.dayWidth, height: layout.height - HEADER_HEIGHT, class: 'gantt-weekend' }))
    }
    for (const tick of layout.ticks) {
      const x = layout.x(tick.day)
      svg.append(svgNode('line', { x1: x, x2: x, y1: 0, y2: layout.height, class: 'gantt-gridline' }))
      const label = new Intl.DateTimeFormat(locale, { ...(this.scale === 'days' ? { day: 'numeric' } : this.scale === 'months' ? { month: 'short', year: 'numeric' } : { month: 'short', day: 'numeric' }), timeZone: 'UTC' }).format(new Date(`${dayDate(tick.day)}T00:00:00Z`))
      svg.append(svgNode('text', { x: x + 6, y: 33, class: 'gantt-tick' }, label))
      if (this.scale === 'days' && (tick.day === layout.start || dayDate(tick.day).endsWith('-01'))) svg.append(svgNode('text', { x: x + 6, y: 15, class: 'gantt-tick' }, new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${dayDate(tick.day)}T00:00:00Z`))))
    }
    const today = dateDay(todayDate())
    if (today >= layout.start && today < layout.end) svg.append(svgNode('line', { x1: layout.x(today), x2: layout.x(today), y1: HEADER_HEIGHT, y2: layout.height, class: 'gantt-today' }), svgNode('text', { x: layout.x(today) + 4, y: 50, class: 'gantt-tick' }, t('Today')))
    const byId = new Map(tasks.map((task, index) => [task.id, { task, index }]))
    tasks.forEach((task, index) => {
      const y = HEADER_HEIGHT + index * ROW_HEIGHT
      svg.append(svgNode('line', { x1: 0, x2: layout.width, y1: y, y2: y, class: 'gantt-gridline' }))
      for (const dependency of task.dependencies) {
        const previous = byId.get(dependency)!
        const x1 = layout.x(previous.task.endDay)
        const y1 = HEADER_HEIGHT + previous.index * ROW_HEIGHT + ROW_HEIGHT / 2
        const x2 = layout.x(task.startDay)
        svg.append(svgNode('path', { d: `M${x1} ${y1} H${x1 + 8} V${y - 4} H${x2 - 8} V${y + ROW_HEIGHT / 2} H${x2}`, class: 'gantt-dependency', 'marker-end': 'url(#gantt-dependency-arrow)' }))
      }
      const x = layout.x(task.startDay)
      const width = task.milestone ? 20 : Math.max(4, (task.endDay - task.startDay) * layout.dayWidth)
      const bar = svgNode('g', { class: 'gantt-bar', 'data-task-id': task.id })
      const shape = task.milestone
        ? svgNode('path', { d: `M${x} ${y + 12} l10 10 l-10 10 l-10 -10 Z`, class: 'gantt-milestone' })
        : svgNode('rect', { x, y: y + 11, width, height: 22, rx: 4, class: 'gantt-bar-shape' })
      const description = `${task.name}: ${this.date(task.startDay)} – ${this.date(task.milestone ? task.startDay : task.endDay - 1)}, ${task.progress}%`
      bar.append(svgNode('title', {}, description), shape)
      if (!task.milestone && task.progress) bar.append(svgNode('rect', { x, y: y + 29, width: width * task.progress / 100, height: 4, class: 'gantt-completed' }))
      const labelFits = !task.milestone && width > 90
      const capacity = Math.max(3, Math.floor((width - 14) / 7))
      const label = labelFits && task.name.length > capacity ? `${task.name.slice(0, capacity - 1)}…` : task.name
      const shortBar = !task.milestone && width < 28
      bar.append(svgNode('text', { x: labelFits ? x + 7 : x + width + (shortBar && this.session.canEdit ? 34 : 7), y: y + 26, class: 'gantt-bar-label', 'pointer-events': 'none' }, label))
      if (this.session.canEdit) {
        bar.setAttribute('role', 'button')
        bar.setAttribute('tabindex', '0')
        bar.setAttribute('aria-label', description)
        bar.setAttribute('data-gantt-focus', `bar-${task.id}`)
        bar.addEventListener('dblclick', () => void this.editTask(task.id))
        bar.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void this.editTask(task.id); return }
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
          event.preventDefault()
          event.stopPropagation()
          const delta = event.key === 'ArrowRight' ? 1 : -1
          this.change(() => this.store!.update(task.id, event.shiftKey && !task.milestone ? { duration: Math.max(1, task.duration + delta) } : { start: dayDate(task.startDay + delta) }))
        })
        if (shortBar) {
          const move = svgNode('rect', { x: x - 10, y: y + 7, width: Math.max(16, width), height: 30, class: 'gantt-move' })
          bar.prepend(move)
          this.drag(move, bar, task, layout.dayWidth, false)
        }
        this.drag(shape, bar, task, layout.dayWidth, false)
        if (!task.milestone) {
          const handleX = shortBar ? x + width + 10 : x + width - 10
          const handle = svgNode('rect', { x: handleX, y: y + 7, width: shortBar ? 16 : 20, height: 30, class: 'gantt-resize' })
          handle.append(svgNode('title', {}, t('Duration (calendar days)')))
          bar.append(handle)
          if (shortBar) bar.append(svgNode('path', { d: `M${handleX + 5} ${y + 16} v12 M${handleX + 10} ${y + 16} v12`, class: 'gantt-resize-grip', 'pointer-events': 'none' }))
          this.drag(handle, bar, task, layout.dayWidth, true)
        }
      }
      svg.append(bar)
    })
    return svg
  }

  private drag(handle: SVGElement, bar: SVGElement, task: ScheduledTask, dayWidth: number, resize: boolean): void {
    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !this.session.canEdit) return
      event.preventDefault()
      bar.focus()
      const startX = event.clientX
      const store = this.store
      const shape = bar.querySelector('.gantt-bar-shape')
      const originalWidth = Number(shape?.getAttribute('width'))
      let delta = 0
      let cancelled = false
      handle.setPointerCapture(event.pointerId)
      const move = (next: PointerEvent) => {
        delta = Math.round((next.clientX - startX) / dayWidth)
        if (!resize) bar.setAttribute('transform', `translate(${delta * dayWidth},0)`)
        else shape?.setAttribute('width', String(Math.max(dayWidth, originalWidth + delta * dayWidth)))
      }
      const cancel = () => { cancelled = true }
      const finish = () => {
        handle.removeEventListener('pointermove', move)
        handle.removeEventListener('pointerup', finish)
        handle.removeEventListener('pointercancel', cancelAndFinish)
        window.removeEventListener('keydown', escape)
        bar.removeAttribute('transform')
        if (resize) shape?.setAttribute('width', String(originalWidth))
        if (!cancelled && delta && this.active && this.store === store && store?.tasks.has(task.id)) this.change(() => store.update(task.id, resize ? { duration: Math.max(1, task.duration + delta) } : { start: dayDate(task.startDay + delta) }))
      }
      const cancelAndFinish = () => { cancel(); finish() }
      const escape = (key: KeyboardEvent) => { if (key.key === 'Escape') cancelAndFinish() }
      handle.addEventListener('pointermove', move)
      handle.addEventListener('pointerup', finish, { once: true })
      handle.addEventListener('pointercancel', cancelAndFinish, { once: true })
      window.addEventListener('keydown', escape)
    })
  }

  private change(action: () => void): void {
    try { action(); this.onChange() } catch (error) { toast(ganttError(error)) }
  }

  private async editTask(id?: string): Promise<void> {
    if (!this.store || !this.active || !this.session.canEdit) return
    const store = this.store
    const tasks = store.read().tasks
    const original = tasks.find((task) => task.id === id)
    if (id && !original) return
    const task: GanttTask = original ?? { id: crypto.randomUUID(), name: t('New task'), start: todayDate(), duration: 3, owner: '', progress: 0, milestone: false, dependencies: [], order: Math.max(-1, ...tasks.map((entry) => entry.order)) + 1 }
    const name = el('input', { class: 'field', value: task.name, required: true, maxLength: 200 })
    const owner = el('input', { class: 'field', value: task.owner, maxLength: 100 })
    const start = el('input', { class: 'field', type: 'date', value: task.start, required: true, min: '1970-01-01', max: '2100-12-31' })
    const duration = el('input', { class: 'field', type: 'number', value: String(task.duration), min: '1', max: '3660', step: '1', required: true, disabled: task.milestone })
    const progress = el('input', { class: 'field', type: 'number', value: String(task.progress), min: '0', max: '100', step: '1', required: true })
    const milestone = el('input', { type: 'checkbox', checked: task.milestone })
    milestone.addEventListener('change', () => { duration.disabled = milestone.checked })
    const field = (label: string, input: HTMLElement) => el('label', { class: 'field-label' }, label, input)
    const dependencies = el('fieldset', { class: 'gantt-dependencies' }, el('legend', { textContent: t('Predecessors') }))
    const options = new Map<string, HTMLInputElement>()
    for (const other of tasks.filter((entry) => entry.id !== task.id)) {
      const checkbox = el('input', { type: 'checkbox', checked: task.dependencies.includes(other.id) })
      options.set(other.id, checkbox)
      dependencies.append(el('label', {}, checkbox, other.name))
    }
    for (const missing of task.dependencies.filter((dependency) => !options.has(dependency))) {
      const checkbox = el('input', { type: 'checkbox', checked: true })
      options.set(missing, checkbox)
      dependencies.append(el('label', {}, checkbox, t('Deleted task')))
    }
    if (!options.size) dependencies.append(el('p', { textContent: t('No other tasks yet.') }))
    const error = el('p', { class: 'gantt-error', hidden: true })
    error.setAttribute('role', 'alert')
    const body = el('div', { class: 'gantt-task-form' }, field(t('Task'), name), field(t('Responsible person'), owner),
      el('div', { class: 'gantt-form-row' }, field(t('Earliest start date'), start), field(t('Duration (calendar days)'), duration), field(t('Progress (%)'), progress)),
      el('label', { class: 'gantt-checkbox' }, milestone, t('Milestone')), dependencies,
      el('p', { class: 'gantt-help', textContent: t('Tasks start after all predecessors finish. Weekends count as calendar days.') }), error)
    const pending = showDialog(original ? t('Edit task') : t('Add task'), body, [
      ...(original ? [{ label: t('Delete task'), value: 'delete', danger: true }] : []),
      { label: t('Cancel'), value: 'cancel' }, { label: t('Save'), value: 'save', primary: true },
    ], true)
    const form = body.closest('form')!
    // Save is the form's only submit action, so Enter saves and Cancel/Delete
    // remain usable even while a required field is incomplete.
    for (const button of form.querySelectorAll<HTMLButtonElement>('.dlg-actions button')) {
      if (button.value === 'save') continue
      button.type = 'button'
      button.addEventListener('click', () => form.closest('dialog')!.close(button.value))
    }
    form.addEventListener('submit', (event) => {
      if ((event.submitter as HTMLButtonElement | null)?.value !== 'save') return
      try {
        if (!this.session.doc.getMap('diagram-pages').has(store.page)) throw new GanttError('missing')
        const next = { ...task, name: name.value.trim(), owner: owner.value.trim(), start: start.value, duration: Number(duration.value), progress: Number(progress.value), milestone: milestone.checked, dependencies: [...options].filter(([, input]) => input.checked).map(([key]) => key) }
        if (original) {
          const patch: Partial<Omit<GanttTask, 'id'>> = {}
          for (const key of ['name', 'owner', 'start', 'duration', 'progress', 'milestone', 'dependencies'] as const) {
            if (JSON.stringify(next[key]) !== JSON.stringify(original[key])) Object.assign(patch, { [key]: next[key] })
          }
          store.update(task.id, patch)
        } else store.add(next)
      } catch (reason) {
        event.preventDefault()
        error.hidden = false
        error.textContent = ganttError(reason)
      }
    })
    const result = await pending
    if (result === 'delete' && await confirmDialog(t('Delete task'), t('Delete this task and its dependency links for everyone?'), { confirmLabel: t('Delete'), danger: true })) this.change(() => store.remove(task.id))
    this.onChange()
  }

  private destroy(): void {
    this.resizeObserver.disconnect()
    this.store?.tasks.unobserveDeep(this.onChange)
    for (const store of this.stores.values()) store.destroy()
  }
}
