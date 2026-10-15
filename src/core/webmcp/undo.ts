// Grouping several changes of the assistant (apply_batch) into one step of a
// Yjs undo history: while the group runs, the undo managers merge every
// change into the same stack item.

import type * as Y from 'yjs'

const GROUPING = 1e9

export async function groupYUndo<T>(managers: (Y.UndoManager | null | undefined)[], fn: () => Promise<T>): Promise<T> {
  const list = managers.filter((m): m is Y.UndoManager => !!m)
  const saved = list.map((m) => m.captureTimeout)
  for (const m of list) {
    m.stopCapturing()
    m.captureTimeout = GROUPING
  }
  try {
    return await fn()
  } finally {
    list.forEach((m, i) => {
      m.captureTimeout = saved[i]
      m.stopCapturing()
    })
  }
}
