// Line differences between two texts (diff_versions, get_changes_since):
// common lines at the start and end are skipped, the rest is compared with a
// longest common subsequence while that stays small, otherwise reported as
// replaced.

export type DiffLine = { op: '+' | '-'; line: string }

// Above this (lines × lines) the middle part is reported as replaced.
const MAX_CELLS = 4_000_000

export function diffLines(before: string[], after: string[]): DiffLine[] {
  let start = 0
  while (start < before.length && start < after.length && before[start] === after[start]) start++
  let endA = before.length
  let endB = after.length
  while (endA > start && endB > start && before[endA - 1] === after[endB - 1]) {
    endA--
    endB--
  }
  const a = before.slice(start, endA)
  const b = after.slice(start, endB)
  if (!a.length) return b.map((line) => ({ op: '+', line }))
  if (!b.length) return a.map((line) => ({ op: '-', line }))
  if (a.length * b.length > MAX_CELLS) return [...a.map((line) => ({ op: '-' as const, line })), ...b.map((line) => ({ op: '+' as const, line }))]
  // lcs[i][j]: length of the common subsequence of a[i..] and b[j..].
  const width = b.length + 1
  const lcs = new Uint32Array((a.length + 1) * width)
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i * width + j] = a[i] === b[j] ? lcs[(i + 1) * width + j + 1] + 1 : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1])
    }
  }
  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++
      j++
    } else if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) out.push({ op: '-', line: a[i++] })
    else out.push({ op: '+', line: b[j++] })
  }
  while (i < a.length) out.push({ op: '-', line: a[i++] })
  while (j < b.length) out.push({ op: '+', line: b[j++] })
  return out
}

// Summary for the assistant: counts and the changed lines ("+ " / "- "), at most `max`.
export function describeDiff(before: string, after: string, max = 400) {
  const changes = diffLines(before.split('\n'), after.split('\n'))
  const lines = changes.slice(0, max).map((c) => `${c.op} ${c.line}`)
  return {
    added: changes.filter((c) => c.op === '+').length,
    removed: changes.filter((c) => c.op === '-').length,
    changes: lines,
    ...(changes.length > max ? { truncated: changes.length - max } : {}),
  }
}
