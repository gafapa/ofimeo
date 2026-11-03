import * as Y from 'yjs'
import { GanttError, ganttDependencyErrors, parseGantt, scheduleTasks, validateTasks, type GanttProject, type GanttTask } from './gantt-model'

type TaskField = string | number | boolean
type TaskMap = Y.Map<TaskField>
export const ganttKey = (page: string) => `diagram-gantt:${page}`

export function readGantt(doc: Y.Doc, page: string): GanttProject {
  const tasks = [...doc.getMap<TaskMap>(ganttKey(page)).entries()].map(([id, fields]) => ({
    ...fields.toJSON(), id, dependencies: JSON.parse(String(fields.get('dependencies') ?? '[]')),
  })) as GanttTask[]
  // Independent concurrent additions can exceed the local count limit. Keep
  // those tasks visible so users can remove them rather than hiding their data.
  validateTasks(tasks, false)
  return { version: 1, tasks }
}

export function writeGantt(doc: Y.Doc, page: string, project: GanttProject): void {
  const checked = parseGantt(JSON.stringify(project))
  scheduleTasks(checked.tasks)
  const tasks = doc.getMap<TaskMap>(ganttKey(page))
  tasks.clear()
  for (const task of checked.tasks) {
    const { id, dependencies, ...fields } = task
    tasks.set(id, new Y.Map<TaskField>(Object.entries({ ...fields, dependencies: JSON.stringify(dependencies) })))
  }
}

// Only fields actually changed by the editor are written. Concurrent edits to
// different tasks or fields merge; undo tracks this client rather than peers.
export class GanttStore {
  readonly tasks: Y.Map<TaskMap>
  readonly undo: Y.UndoManager
  constructor(private doc: Y.Doc, readonly page: string, private canEdit: boolean) {
    this.tasks = doc.getMap<TaskMap>(ganttKey(page))
    this.undo = new Y.UndoManager(this.tasks, { trackedOrigins: new Set([this]), captureTimeout: 0 })
  }
  read(): GanttProject { return readGantt(this.doc, this.page) }

  update(id: string, patch: Partial<Omit<GanttTask, 'id'>>): void {
    if (!this.canEdit) throw new GanttError('readonly')
    const current = this.read().tasks
    if (!current.some((task) => task.id === id)) throw new GanttError('missing')
    const next = current.map((task) => task.id === id ? { ...task, ...patch } : task)
    validateTasks(next)
    try { scheduleTasks(next) }
    catch (error) {
      const before = ganttDependencyErrors(current)
      const after = ganttDependencyErrors(next)
      // Removing existing invalid edges cannot delay the schedule. Permit
      // strictly improving dependency-only repairs, never a new bad edge.
      const repair = error instanceof GanttError && (error.code === 'cycle' || error.code === 'missing') &&
        Object.keys(patch).every((key) => key === 'dependencies') && after.size < before.size && [...after].every((issue) => before.has(issue))
      if (!repair) throw error
    }
    this.doc.transact(() => {
      const fields = this.tasks.get(id)!
      for (const [key, value] of Object.entries(patch)) fields.set(key, key === 'dependencies' ? JSON.stringify(value) : value as TaskField)
    }, this)
  }

  add(task: GanttTask): void {
    if (!this.canEdit) throw new GanttError('readonly')
    scheduleTasks([...this.read().tasks, task])
    this.doc.transact(() => {
      const { id, dependencies, ...fields } = task
      this.tasks.set(id, new Y.Map<TaskField>(Object.entries({ ...fields, dependencies: JSON.stringify(dependencies) })))
    }, this)
  }

  remove(id: string): void {
    if (!this.canEdit) throw new GanttError('readonly')
    this.doc.transact(() => {
      this.tasks.delete(id)
      for (const fields of this.tasks.values()) {
        const dependencies = JSON.parse(String(fields.get('dependencies') ?? '[]')) as string[]
        if (dependencies.includes(id)) fields.set('dependencies', JSON.stringify(dependencies.filter((dependency) => dependency !== id)))
      }
    }, this)
  }
  destroy(): void { this.undo.destroy() }
}
