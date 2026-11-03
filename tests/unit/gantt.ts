import assert from 'node:assert/strict'
import * as Y from 'yjs'
import { dateDay, dayDate, ganttLayout, ganttRasterScale, parseGantt, sampleGantt, scheduleTasks } from '../../src/apps/diagram/gantt-model'
import { GanttStore, readGantt, writeGantt } from '../../src/apps/diagram/gantt-state'
import { extractText } from '../../src/core/library-extract'

export async function runGanttTests(): Promise<number> {
  let count = 0
  const check = (name: string, run: () => void) => {
    try { run(); count++ } catch (error) { throw new Error(`Gantt: ${name}`, { cause: error }) }
  }
  check('calendar dates survive DST and validate leap years', () => {
    assert.equal(dayDate(dateDay('2026-03-28') + 2), '2026-03-30')
    assert.equal(dayDate(dateDay('2028-02-28') + 1), '2028-02-29')
    assert.throws(() => dateDay('2026-02-29'))
    assert.throws(() => dateDay('2026-13-01'))
  })
  check('dependencies propagate through chains and zero-duration milestones', () => {
    const tasks = sampleGantt(['Research', 'Build', 'Deliver'], '2026-03-28').tasks
    const plan = scheduleTasks(tasks)
    assert.equal(dayDate(plan[1].startDay), '2026-03-31')
    assert.equal(dayDate(plan[2].startDay), '2026-04-05')
    assert.equal(plan[2].startDay, plan[2].endDay)
    tasks[0].duration = 6
    assert.equal(dayDate(scheduleTasks(tasks)[2].startDay), '2026-04-08')
    assert.equal(tasks[2].start, '2026-03-28')
  })
  check('multiple predecessors wait for the latest finish and respect earliest dates', () => {
    const tasks = sampleGantt(['A', 'B', 'C'], '2026-01-01').tasks
    tasks[1].dependencies = []
    tasks[1].start = '2026-01-10'
    tasks[2].dependencies = [tasks[0].id, tasks[1].id]
    assert.equal(dayDate(scheduleTasks(tasks)[2].startDay), '2026-01-15')
  })
  check('cycles, unknown predecessors and unbounded imported data are rejected', () => {
    const project = sampleGantt(['A', 'B'], '2026-01-01')
    project.tasks[0].dependencies = [project.tasks[1].id]
    assert.throws(() => scheduleTasks(project.tasks), /cycle/)
    project.tasks[0].dependencies = ['missing']
    assert.throws(() => scheduleTasks(project.tasks), /missing/)
    project.tasks[0].dependencies = []
    project.tasks[0].progress = 101
    assert.throws(() => parseGantt(JSON.stringify(project)))
    project.tasks[0].progress = 0
    project.tasks[1].id = project.tasks[0].id
    assert.throws(() => parseGantt(JSON.stringify(project)))
    assert.throws(() => parseGantt('{"version":2,"tasks":[]}'))
    assert.throws(() => parseGantt('x'.repeat(500_001)))
  })
  check('calendar scales and long schedules remain finite and bounded', () => {
    const scale = ganttRasterScale(8420, 9000)
    assert.ok(8420 * scale <= 8000 && 9000 * scale <= 8000)
    assert.ok(8420 * 9000 * scale ** 2 <= 16_000_001)
    const project = sampleGantt(['A', 'B'], '2026-01-01')
    project.tasks[0].duration = 1000
    for (const scale of ['days', 'weeks', 'months'] as const) {
      const layout = ganttLayout(scheduleTasks(project.tasks), scale)
      assert.ok(layout.width <= 8000.01 && layout.width >= 640)
      assert.ok(layout.ticks.length < 250)
      assert.ok(layout.ticks.every((tick) => tick.end > tick.day))
    }
    project.tasks[0].duration = 3660
    project.tasks[1].milestone = false
    assert.throws(() => scheduleTasks(project.tasks), /range/)
  })
  check('concurrent field and task edits merge, and local undo preserves peer edits', () => {
    const a = new Y.Doc()
    const b = new Y.Doc()
    writeGantt(a, 'page', sampleGantt(['A', 'B'], '2026-01-01'))
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
    const first = new GanttStore(a, 'page', true)
    const second = new GanttStore(b, 'page', true)
    first.update('task-1', { name: 'Local name', duration: 8 })
    second.update('task-1', { owner: 'Peer owner' })
    second.update('task-2', { progress: 75 })
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b))
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
    assert.deepEqual(readGantt(a, 'page'), readGantt(b, 'page'))
    assert.equal(first.read().tasks[0].owner, 'Peer owner')
    assert.equal(first.read().tasks[1].progress, 75)
    first.undo.undo()
    assert.equal(first.read().tasks[0].name, 'A')
    assert.equal(first.read().tasks[0].owner, 'Peer owner')
    first.destroy(); second.destroy(); a.destroy(); b.destroy()
  })
  check('deletion removes dependencies and undo restores both without touching other pages', () => {
    const doc = new Y.Doc()
    writeGantt(doc, 'one', sampleGantt(['A', 'B'], '2026-01-01'))
    writeGantt(doc, 'two', sampleGantt(['C', 'D'], '2026-01-01'))
    const store = new GanttStore(doc, 'one', true)
    store.remove('task-1')
    assert.equal(store.read().tasks.length, 1)
    assert.deepEqual(store.read().tasks[0].dependencies, [])
    assert.equal(readGantt(doc, 'two').tasks.length, 2)
    store.undo.undo()
    assert.equal(store.read().tasks.length, 2)
    assert.deepEqual(store.read().tasks.find((task) => task.id === 'task-2')!.dependencies, ['task-1'])
    store.destroy(); doc.destroy()
  })
  check('view and comment stores cannot change task data', () => {
    const doc = new Y.Doc()
    writeGantt(doc, 'page', sampleGantt(['A'], '2026-01-01'))
    const store = new GanttStore(doc, 'page', false)
    const before = Y.encodeStateAsUpdate(doc)
    assert.throws(() => store.update('task-1', { name: 'Changed' }), /readonly/)
    assert.throws(() => store.add({ ...store.read().tasks[0], id: 'new' }), /readonly/)
    assert.throws(() => store.remove('task-1'), /readonly/)
    assert.deepEqual(Y.encodeStateAsUpdate(doc), before)
    store.destroy(); doc.destroy()
  })
  check('invalid local changes do not partially mutate the document', () => {
    const doc = new Y.Doc()
    writeGantt(doc, 'page', sampleGantt(['A', 'B'], '2026-01-01'))
    const store = new GanttStore(doc, 'page', true)
    const before = Y.encodeStateAsUpdate(doc)
    assert.throws(() => store.update('task-1', { dependencies: ['task-2'] }), /cycle/)
    assert.deepEqual(Y.encodeStateAsUpdate(doc), before)
    store.destroy(); doc.destroy()
  })
  check('concurrent dependencies expose a recoverable cycle without discarding tasks', () => {
    const a = new Y.Doc()
    const b = new Y.Doc()
    const project = sampleGantt(['A', 'B'], '2026-01-01')
    project.tasks.forEach((task) => { task.dependencies = [] })
    writeGantt(a, 'page', project)
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
    const first = new GanttStore(a, 'page', true)
    const second = new GanttStore(b, 'page', true)
    first.update('task-1', { dependencies: ['task-2'] })
    second.update('task-2', { dependencies: ['task-1'] })
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b))
    assert.throws(() => scheduleTasks(first.read().tasks), /cycle/)
    assert.equal(first.read().tasks.length, 2)
    first.update('task-1', { dependencies: [] })
    assert.equal(scheduleTasks(first.read().tasks).length, 2)
    first.destroy(); second.destroy(); a.destroy(); b.destroy()
  })
  check('several independent collaborative cycles can be repaired incrementally', () => {
    const doc = new Y.Doc()
    const project = sampleGantt(['A', 'B', 'C', 'D'], '2026-01-01')
    project.tasks.forEach((task) => { task.dependencies = [] })
    writeGantt(doc, 'page', project)
    const store = new GanttStore(doc, 'page', true)
    // Simulate individually valid edits from different replicas arriving together.
    doc.transact(() => {
      store.tasks.get('task-1')!.set('dependencies', '["task-2"]')
      store.tasks.get('task-2')!.set('dependencies', '["task-1"]')
      store.tasks.get('task-3')!.set('dependencies', '["task-4"]')
      store.tasks.get('task-4')!.set('dependencies', '["task-3"]')
    }, 'remote')
    store.update('task-1', { dependencies: [] })
    assert.throws(() => scheduleTasks(store.read().tasks), /cycle/)
    assert.throws(() => store.update('task-1', { dependencies: ['missing'] }))
    store.update('task-3', { dependencies: [] })
    assert.equal(scheduleTasks(store.read().tasks).length, 4)
    store.destroy(); doc.destroy()
  })
  check('concurrent additions above the task limit remain visible and removable', () => {
    const doc = new Y.Doc()
    const template = sampleGantt(['A'], '2026-01-01').tasks[0]
    const project = { version: 1 as const, tasks: Array.from({ length: 200 }, (_, i) => ({ ...template, id: `task-${i}`, milestone: false, order: i })) }
    writeGantt(doc, 'page', project)
    const store = new GanttStore(doc, 'page', true)
    const fields = new Y.Map<string | number | boolean>(Object.entries({ ...template, dependencies: '[]' }))
    store.tasks.set('concurrent', fields)
    assert.equal(store.read().tasks.length, 201)
    assert.throws(() => scheduleTasks(store.read().tasks), /range/)
    store.remove('concurrent')
    assert.equal(scheduleTasks(store.read().tasks).length, 200)
    store.destroy(); doc.destroy()
  })
  check('library search indexes current task data and excludes stale generated shapes', () => {
    const doc = new Y.Doc()
    doc.getMap('diagram-pages').set('page', new Y.Map([['gantt', '1']]))
    writeGantt(doc, 'page', sampleGantt(['Original name'], '2026-01-01'))
    doc.getMap('diagram-cells:page').set('bar', new Y.Map([['value', 'Stale cached label']]))
    const store = new GanttStore(doc, 'page', true)
    store.update('task-1', { name: 'Current task', owner: 'Project owner' })
    const text = extractText('diagram', doc)
    assert.ok(text.includes('Current task') && text.includes('Project owner'))
    assert.ok(!text.includes('Original name') && !text.includes('Stale cached label'))
    doc.getMap('diagram-pages').delete('page')
    assert.ok(!extractText('diagram', doc).includes('Current task'))
    store.destroy(); doc.destroy()
  })
  return count
}
