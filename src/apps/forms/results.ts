// Responses tab (editors): summary charts per question, individual responses,
// grading (quiz), statistics, exports and response file import.

import type * as Y from 'yjs'
import { t, locale } from '../../core/i18n'
import { confirmDialog, el, toast } from '../../ui/widgets'
import { barChart, histogramChart } from './charts'
import { downloadResults, openInSheets, sortedResponses } from './export'
import { histogram, round, scoreResponse, stats } from './grading'
import {
  answerText,
  gradesMap,
  hasOptions,
  isAnswered,
  questionsOf,
  readItems,
  readKey,
  readSettings,
  receiptsMap,
  responsesMap,
  resultsMap,
  settingsMap,
  type FormResponse,
  type Grade,
  type Item,
} from './model'
import { importResponseFiles, keyLookup, LOCAL, releaseGrades, type FormState } from './state'

type View = 'summary' | 'individual' | 'grading' | 'stats'

export interface ResultsView {
  element: HTMLElement
  render(): void
  importFiles(): void
  destroy(): void
}

export const whoSeesResponses = () =>
  t('Who can see the responses: only the editors of this form (people with its edit link). Respondents encrypt their answers in their browser to a key only editors have; other respondents, viewers and the relays that connect browsers cannot read them. Responses are stored in the browsers of the editors who were online (or who synced later with another editor).')

export function createResults(state: FormState, onCount: (n: number) => void): ResultsView {
  const { session } = state
  const doc = session.doc
  const priv = state.priv!
  const element = el('div', { class: 'fm-column fm-results' })
  let view: View = 'summary'
  let current = ''
  const fileInput = el('input', { type: 'file', accept: '.oresp,application/json', multiple: true, hidden: true })
  document.body.append(fileInput)
  fileInput.addEventListener('change', async () => {
    const files = [...(fileInput.files ?? [])]
    fileInput.value = ''
    if (!files.length) return
    const { added, failed } = await importResponseFiles(state, files)
    toast(t('{added} responses imported, {failed} files could not be read', { added, failed }))
    render()
  })

  const button = (label: string, run: () => void, primary = false) => {
    const b = el('button', { type: 'button', class: primary ? 'primary' : 'fm-btn', textContent: label })
    b.addEventListener('click', run)
    return b
  }

  const render = () => {
    const settings = readSettings(doc)
    const items = readItems(doc)
    const responses = sortedResponses(priv)
    onCount(responses.length)
    if (view !== 'summary' && view !== 'individual' && !settings.quiz) view = 'summary'
    const scroll = element.closest('.fm-scroll')?.scrollTop
    element.replaceChildren()

    // Header: count, accepting, actions.
    const accepting = el('input', { type: 'checkbox', checked: settings.accepting })
    accepting.addEventListener('change', () => doc.transact(() => settingsMap(doc).set('accepting', accepting.checked), LOCAL))
    const head = el(
      'section',
      { class: 'fm-card fm-results-head' },
      el('h2', { textContent: t('{n} responses', { n: responses.length }) }),
      el('label', { class: 'check fm-toggle' }, accepting, t('Accepting responses')),
      el(
        'div',
        { class: 'fm-nav' },
        button(t('Open in Ofimeo Sheets'), () => void openInSheets(doc, priv).catch((e) => toast((e as Error).message)), true),
        button(t('Download CSV'), () => void downloadResults(doc, priv, 'csv')),
        button(t('Download XLSX'), () => void downloadResults(doc, priv, 'xlsx')),
        button(t('Import response files…'), () => fileInput.click()),
      ),
      el('p', { class: 'hint fm-who', textContent: whoSeesResponses() }),
    )
    element.append(head)

    const tabs = el('div', { class: 'fm-subtabs', role: 'tablist' })
    const views: [View, string][] = [
      ['summary', t('Summary')],
      ['individual', t('Individual')],
    ]
    if (settings.quiz) views.push(['grading', t('Grading')], ['stats', t('Statistics')])
    for (const [v, label] of views) {
      const b = el('button', { type: 'button', class: `fm-subtab${v === view ? ' active' : ''}`, textContent: label, role: 'tab' })
      b.setAttribute('aria-selected', String(v === view))
      b.addEventListener('click', () => ((view = v), render()))
      tabs.append(b)
    }
    element.append(tabs)

    if (!responses.length) {
      element.append(el('section', { class: 'fm-card' }, el('p', { class: 'hint', textContent: t('No responses yet. Send the form with the “Send” button; responses arrive here when you (or another editor) are online.') })))
    } else if (view === 'summary') summary(items, responses)
    else if (view === 'individual') individual(items, responses, false)
    else if (view === 'grading') individual(items, responses, true)
    else statistics(items, responses)
    const scroller = element.closest('.fm-scroll')
    if (scroller && scroll !== undefined) scroller.scrollTop = scroll
  }

  // ---------- Summary ----------

  const summary = (items: Item[], responses: FormResponse[]) => {
    const quiz = readSettings(doc).quiz
    for (const q of questionsOf(items)) {
      const answers = responses.map((r) => r.answers[q.id]).filter(isAnswered)
      const card = el('section', { class: 'fm-card fm-summary', dataset: { id: q.id } }, el('div', { class: 'fm-q-title', textContent: q.title || t('Untitled question') }), el('p', { class: 'hint', textContent: t('{n} answers', { n: answers.length }) }))
      const key = quiz ? readKey(priv, q.id) : null
      if (hasOptions(q.type)) {
        const counts = q.options.map((o) => ({ label: o.label, count: answers.filter((a) => (Array.isArray(a) ? a.includes(o.id) : a === o.id)).length, highlight: !!key?.correct.includes(o.id) }))
        card.append(barChart(counts, answers.length))
      } else if (q.type === 'scale') {
        const rows = []
        for (let v = q.min; v <= q.max; v++) rows.push({ label: String(v), count: answers.filter((a) => a === v).length, highlight: key?.correct[0] === String(v) })
        card.append(barChart(rows, answers.length))
        const s = stats(answers.map(Number))
        card.append(el('p', { class: 'hint', textContent: t('Mean {mean} · median {median}', { mean: s.mean, median: s.median }) }))
      } else if (q.type === 'grid') {
        const table = el('table', { class: 'fm-table' }, el('tr', {}, el('th'), ...q.options.map((c) => el('th', { textContent: c.label }))))
        for (const r of q.rows) {
          table.append(
            el(
              'tr',
              {},
              el('th', { textContent: r.label }),
              ...q.options.map((c) => el('td', { class: key?.rows[r.id] === c.id ? 'correct' : '', textContent: String(answers.filter((a) => typeof a === 'object' && !Array.isArray(a) && a[r.id] === c.id).length) })),
            ),
          )
        }
        card.append(el('div', { class: 'fm-grid-wrap' }, table))
      } else if (q.type === 'number') {
        const values = answers.map(Number).filter((n) => !Number.isNaN(n))
        const s = stats(values)
        card.append(el('p', { textContent: t('Mean {mean} · median {median} · min {min} · max {max}', { mean: s.mean, median: s.median, min: s.min, max: s.max }) }))
        card.append(textList(values.map(String)))
      } else {
        // Text, date and time: the most frequent answers first.
        const freq = new Map<string, number>()
        for (const a of answers) freq.set(String(a).trim(), (freq.get(String(a).trim()) ?? 0) + 1)
        card.append(textList([...freq.entries()].sort((a, b) => b[1] - a[1]).map(([text, n]) => (n > 1 ? `${text} (${n})` : text))))
      }
      element.append(card)
    }
  }

  const textList = (values: string[]) => {
    const list = el('ul', { class: 'fm-text-list' })
    for (const v of values.slice(0, 100)) list.append(el('li', { textContent: v }))
    if (values.length > 100) list.append(el('li', { class: 'hint', textContent: t('…and {n} more', { n: values.length - 100 }) }))
    return list
  }

  // ---------- Individual responses and grading ----------

  const individual = (items: Item[], responses: FormResponse[], grading: boolean) => {
    const settings = readSettings(doc)
    if (!responses.some((r) => r.id === current)) current = responses[0].id
    const index = responses.findIndex((r) => r.id === current)
    const response = responses[index]
    const grade: Grade = gradesMap(priv).get(response.id) ?? { points: {}, comments: {} }
    const sheet = settings.quiz ? scoreResponse(items, keyLookup(priv), response, grade) : null

    const select = el('select', { class: 'field fm-response-select' })
    select.setAttribute('aria-label', t('Response'))
    responses.forEach((r, i) => {
      const s = settings.quiz ? scoreResponse(items, keyLookup(priv), r, gradesMap(priv).get(r.id)) : null
      const mark = s ? ` · ${s.score}/${s.max}${s.pending ? ` · ${t('to grade')}` : ''}${gradesMap(priv).get(r.id)?.released ? ` · ${t('released')}` : ''}` : ''
      select.append(el('option', { value: r.id, textContent: `${i + 1}. ${r.name}${r.group ? ` (${r.group})` : ''}${mark}` }))
    })
    select.value = current
    select.addEventListener('change', () => ((current = select.value), render()))
    const prev = button('‹', () => ((current = responses[Math.max(0, index - 1)].id), render()))
    prev.setAttribute('aria-label', t('Previous response'))
    prev.disabled = index === 0
    const next = button('›', () => ((current = responses[Math.min(responses.length - 1, index + 1)].id), render()))
    next.setAttribute('aria-label', t('Next response'))
    next.disabled = index === responses.length - 1
    const del = button(t('Delete response'), async () => {
      if (!(await confirmDialog(t('Delete this response?'), response.name, { confirmLabel: t('Delete'), danger: true }))) return
      priv.transact(() => {
        responsesMap(priv).delete(response.id)
        gradesMap(priv).delete(response.id)
      }, LOCAL)
      doc.transact(() => resultsMap(doc).delete(response.id), LOCAL)
      render()
    })
    const nav = el('section', { class: 'fm-card fm-response-nav' }, el('div', { class: 'fm-nav' }, prev, select, next, el('span', { class: 'spacer' }), del))
    const received = receiptsMap(doc).get(response.id) ?? response.receivedAt
    nav.append(
      el('p', {
        class: 'hint',
        textContent: t('Submitted {date} · received {received} ({via})', {
          date: new Date(response.submittedAt).toLocaleString(locale),
          received: received ? new Date(received).toLocaleString(locale) : '—',
          via: response.via === 'file' ? t('file') : t('direct'),
        }),
      }),
    )
    if (sheet) {
      nav.append(el('p', { class: 'fm-score', textContent: t('Score: {score} / {max}', { score: sheet.score, max: sheet.max }) }))
      if (sheet.pending) nav.append(el('p', { class: 'fm-state warn', textContent: t('{n} questions need manual grading', { n: sheet.pending }) }))
      const released = grade.released
      nav.append(
        el(
          'div',
          { class: 'fm-nav' },
          button(released ? t('Release again (updated grade)') : t('Release grade to this respondent'), async () => {
            await releaseGrades(state, [response.id])
            toast(t('Grade released'))
            render()
          }, !released),
          button(t('Release all grades'), () => void releaseAll()),
          released ? el('span', { class: 'hint', textContent: t('Released {date}', { date: new Date(released).toLocaleString(locale) }) }) : null,
        ),
      )
    }
    element.append(nav)

    for (const q of questionsOf(items)) {
      const answer = response.answers[q.id]
      const qs = sheet?.questions[q.id]
      const card = el('section', { class: `fm-card fm-answer${qs?.correct === true ? ' ok' : qs?.correct === false ? ' bad' : ''}`, dataset: { id: q.id } }, el('div', { class: 'fm-q-title', textContent: q.title || t('Untitled question') }))
      card.append(el('div', { class: 'fm-answer-text', textContent: answerText(q, answer) || t('(no answer)') }))
      if (qs && grading) {
        const points = el('input', { type: 'number', class: 'field fm-small', min: '0', max: String(q.points), step: '0.25', value: typeof grade.points[q.id] === 'number' ? String(grade.points[q.id]) : '' })
        points.placeholder = qs.auto === null ? '—' : String(qs.auto)
        points.setAttribute('aria-label', t('Points'))
        points.dataset.f = `grade:${q.id}`
        points.addEventListener('change', () => {
          const g = gradesMap(priv).get(response.id) ?? { points: {}, comments: {} }
          const p = { ...g.points }
          if (points.value === '') delete p[q.id]
          else p[q.id] = round(Math.max(0, Number(points.value)))
          priv.transact(() => gradesMap(priv).set(response.id, { ...g, points: p }), LOCAL)
          render()
        })
        const comment = el('input', { class: 'field', value: grade.comments[q.id] ?? '', placeholder: t('Comment for the respondent (optional)') })
        comment.setAttribute('aria-label', t('Comment for the respondent (optional)'))
        comment.addEventListener('change', () => {
          const g = gradesMap(priv).get(response.id) ?? { points: {}, comments: {} }
          priv.transact(() => gradesMap(priv).set(response.id, { ...g, comments: { ...g.comments, [q.id]: comment.value } }), LOCAL)
        })
        const auto = qs.auto === null ? t('no automatic grade') : t('automatic: {points}', { points: qs.auto })
        card.append(el('div', { class: 'fm-inline fm-grade' }, t('Points'), points, el('span', { class: 'hint', textContent: `/ ${q.points} · ${auto}` })), comment)
      } else if (qs) {
        card.append(el('p', { class: 'hint', textContent: `${qs.points === null ? '—' : qs.points} / ${qs.max}` }))
      }
      element.append(card)
    }
  }

  const releaseAll = async () => {
    const items = readItems(doc)
    const responses = sortedResponses(priv)
    const pending = responses.filter((r) => scoreResponse(items, keyLookup(priv), r, gradesMap(priv).get(r.id)).pending).length
    if (pending && !(await confirmDialog(t('Release all grades?'), t('{n} responses still have questions to grade by hand; they are released with what is graded so far.', { n: pending }), { confirmLabel: t('Release') }))) return
    const n = await releaseGrades(state, responses.map((r) => r.id))
    toast(t('{n} grades released', { n }))
    render()
  }

  // ---------- Statistics ----------

  const statistics = (items: Item[], responses: FormResponse[]) => {
    const sheets = responses.map((r) => scoreResponse(items, keyLookup(priv), r, gradesMap(priv).get(r.id)))
    const max = sheets[0]?.max ?? 0
    const scores = sheets.map((s) => s.score)
    const s = stats(scores)
    const card = el('section', { class: 'fm-card fm-stats' }, el('h2', { textContent: t('Scores') }))
    const table = el('table', { class: 'fm-table fm-stats-table' })
    const rows: [string, string][] = [
      [t('Responses'), String(s.count)],
      [t('Mean'), `${s.mean} / ${max}`],
      [t('Median'), `${s.median} / ${max}`],
      [t('Lowest'), String(s.min)],
      [t('Highest'), String(s.max)],
      [t('Standard deviation'), String(s.sd)],
    ]
    for (const [k, v] of rows) table.append(el('tr', {}, el('th', { textContent: k }), el('td', { textContent: v })))
    card.append(table, histogramChart(histogram(scores, max, Math.min(10, Math.max(4, Math.ceil(max)))), t('Score distribution')))
    element.append(card)
    // Share of correct answers per question.
    const per = questionsOf(items)
      .filter((q) => sheets.some((sh) => sh.questions[q.id]?.correct !== null))
      .map((q) => ({ label: q.title || t('Untitled question'), count: sheets.filter((sh) => sh.questions[q.id]?.correct === true).length }))
    if (per.length) element.append(el('section', { class: 'fm-card' }, el('h2', { textContent: t('Correct answers per question') }), barChart(per, responses.length)))
  }

  let frame = 0
  const onChange = (_e: unknown, tr: Y.Transaction) => {
    if (tr.origin === LOCAL && view === 'grading') return
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      // Keep typing in a grading field undisturbed.
      if ((document.activeElement as HTMLElement | null)?.closest('.fm-results') && document.activeElement?.tagName === 'INPUT') return
      render()
    })
  }
  const observed = [responsesMap(priv), gradesMap(priv), settingsMap(doc), receiptsMap(doc)] as Y.AbstractType<unknown>[]
  observed.forEach((o) => o.observeDeep(onChange))

  return {
    element,
    render,
    importFiles: () => fileInput.click(),
    destroy: () => {
      observed.forEach((o) => o.unobserveDeep(onChange))
      fileInput.remove()
    },
  }
}
