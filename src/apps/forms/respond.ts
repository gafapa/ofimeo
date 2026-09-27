// Respondent view (send link = view access) and the editors' preview.
//
// The respondent fills in the form, which is encrypted in the browser to the
// form's public key and kept in an outbox (IndexedDB) until an editor
// acknowledges it (signed receipt in the form document). While the tab is open
// it is re-sent every few seconds when someone is reachable, so answering
// offline works: it is sent when the connection comes back. A response file
// can also be downloaded (or uploaded to the teacher's Nextcloud drop) and
// imported by the teacher.

import { t, locale } from '../../core/i18n'
import { kvGet, kvSet } from '../../core/idb'
import { downloadBlob, safeFileName } from '../../core/handin'
import { homePath } from '../../core/router'
import { el, toast } from '../../ui/widgets'
import { openResult, sealResponse, type SealedResponse } from './crypto'
import type { ReleasedResult } from './grading'
import { answerText, isAnswered, newId, questionsOf, readItems, readSettings, receiptsMap, resultsMap, type Answer, type Item } from './model'
import { answerControl, pages, questionCard, sectionCard, shuffled } from './render'
import type { FormState } from './state'
import { brandMark } from '../../ui/brand'
import { spellcheckAnswers } from './spell'

interface Mine {
  rid: string
  name: string
  group: string
  submittedAt: number
  answers: Record<string, Answer>
  privateKey: JsonWebKey
  sealed: SealedResponse
  receivedAt?: number
  uploaded?: string
}

const mineKey = (docId: string) => `forms:mine:${docId}`
const draftKey = (docId: string) => `ofimeo:forms-draft:${docId}`
const loadMine = async (docId: string) => ((await kvGet<Mine[]>(mineKey(docId))) ?? []).filter((m) => m && m.rid)
const saveMine = (docId: string, list: Mine[]) => kvSet(mineKey(docId), list)

export const privacyNote = () =>
  t('Only the editors of this form can read your answers: they are encrypted in your browser before they leave it. Other respondents cannot see them.')

export function verifiedBadge(code: string): HTMLElement {
  const badge = el('div', { class: 'fm-verified' }, el('strong', { textContent: t('Verified form') }), ' · ', el('span', { textContent: t('Owner code {code}', { code }) }))
  badge.title = t('This form is signed by its owner. Nobody else can change it. Ask your teacher to confirm the code if in doubt.')
  return badge
}

export interface RespondOptions {
  // Editors' preview: the form cannot be sent.
  preview?: boolean
}

export async function mountRespond(state: FormState, container: HTMLElement, options: RespondOptions = {}): Promise<() => void> {
  const { session } = state
  const { doc, docId } = session
  const preview = !!options.preview
  let mine = preview ? [] : await loadMine(docId)
  let view: 'form' | 'status' = !preview && mine.length && readSettings(doc).onePerBrowser ? 'status' : 'form'
  let page = 0
  let draft: { name: string; group: string; answers: Record<string, Answer>; seed: string } = { name: '', group: '', answers: {}, seed: newId() }
  try {
    const saved = !preview && localStorage.getItem(draftKey(docId))
    if (saved) draft = { ...draft, ...JSON.parse(saved) }
  } catch {
    // No storage.
  }
  // Automatic names ("Guest 123") are not used.
  if (!draft.name && !preview && !/\d+$/.test(session.user.name)) draft.name = session.user.name
  const saveDraft = () => {
    try {
      if (!preview) localStorage.setItem(draftKey(docId), JSON.stringify(draft))
    } catch {
      // No storage.
    }
  }

  const root = el('div', { class: 'fm-column' })
  container.replaceChildren(root)
  const stopSpelling = spellcheckAnswers(session, root)

  const render = () => {
    const settings = readSettings(doc)
    const items = readItems(doc)
    const focusId = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-id]')?.dataset.id
    root.replaceChildren()
    if (!items.length && !settings.responseKey) {
      root.append(
        el('section', { class: 'fm-card fm-header' }, el('h1', { textContent: t('Waiting for the form…') }), el('p', { class: 'hint', textContent: t('The form arrives from someone who has it open (for example, the teacher). Keep this page open.') })),
      )
      return
    }
    if (view === 'status') return renderStatus(settings)
    root.append(header(settings, items))
    if (!preview && !settings.accepting) {
      root.append(el('section', { class: 'fm-card' }, el('p', { textContent: t('This form is no longer accepting responses.') })))
      return
    }
    if (!preview && !settings.responseKey) {
      root.append(el('section', { class: 'fm-card' }, el('p', { textContent: t('This form cannot receive responses yet: an editor must open it once.') })))
      return
    }
    // Question order: sections stay in place, questions may be shuffled within them.
    const book = pages(items).map((p) => (settings.shuffleQuestions ? [...p.filter((i) => i.kind === 'section'), ...shuffled(p.filter((i) => i.kind === 'question'), draft.seed)] : p))
    page = Math.min(page, book.length - 1)
    if (page === 0) root.append(identityCard(settings))
    for (const item of book[page]) {
      if (item.kind === 'section') {
        root.append(sectionCard(item))
        continue
      }
      const control = answerControl(item, draft.answers[item.id], (v) => {
        if (v === undefined) delete draft.answers[item.id]
        else draft.answers[item.id] = v
        card.classList.remove('fm-missing')
        saveDraft()
      }, { seed: draft.seed })
      const card = questionCard(item, control)
      root.append(card)
    }
    const nav = el('div', { class: 'fm-nav' })
    if (page > 0) nav.append(button(t('Back'), () => ((page -= 1), render(), scrollTop())))
    if (page < book.length - 1) {
      nav.append(button(t('Next'), () => validate(book[page]) && ((page += 1), render(), scrollTop()), true))
    } else {
      const send = button(preview ? t('Submit (disabled in preview)') : t('Submit'), () => void submit(book, settings), true)
      send.disabled = preview
      nav.append(send)
    }
    if (book.length > 1) nav.append(el('span', { class: 'hint', textContent: t('Page {n} of {m}', { n: page + 1, m: book.length }) }))
    root.append(nav, el('p', { class: 'hint fm-privacy', textContent: privacyNote() }))
    if (focusId) root.querySelector<HTMLElement>(`[data-id="${focusId}"] input, [data-id="${focusId}"] textarea`)?.focus()
  }

  const header = (settings: ReturnType<typeof readSettings>, items: Item[]) => {
    const title = String(doc.getMap('meta').get('title') || t('Untitled form'))
    const card = el('section', { class: 'fm-card fm-header' }, el('h1', { textContent: title }))
    if (settings.description) card.append(el('p', { class: 'fm-desc', textContent: settings.description }))
    if (state.fingerprint) card.append(verifiedBadge(state.fingerprint))
    if (settings.quiz) {
      const total = questionsOf(items).reduce((a, q) => a + q.points, 0)
      card.append(el('p', { class: 'hint', textContent: t('Quiz · {points} points', { points: total }) }))
    }
    if (questionsOf(items).some((q) => q.required)) card.append(el('p', { class: 'hint fm-required-note', textContent: t('* Required') }))
    return card
  }

  const identityCard = (settings: ReturnType<typeof readSettings>) => {
    const name = el('input', { class: 'field', value: draft.name, autocomplete: 'name', id: 'fm-name' })
    name.addEventListener('input', () => ((draft.name = name.value), saveDraft()))
    const card = el('section', { class: 'fm-card fm-identity', dataset: { id: 'identity' } }, el('label', { class: 'field-label' }, `${t('Your name')} *`, name))
    if (settings.collectGroup) {
      const group = el('input', { class: 'field', value: draft.group, id: 'fm-group' })
      group.addEventListener('input', () => ((draft.group = group.value), saveDraft()))
      card.append(el('label', { class: 'field-label' }, t('Class or group'), group))
    }
    return card
  }

  const validate = (list: Item[]): boolean => {
    let first: HTMLElement | null = null
    if (page === 0 && !draft.name.trim()) first = root.querySelector('.fm-identity')
    for (const item of list) {
      if (item.kind !== 'question' || !item.required || isAnswered(draft.answers[item.id])) continue
      const card = root.querySelector<HTMLElement>(`.fm-question[data-id="${item.id}"]`)
      card?.classList.add('fm-missing')
      first ??= card
    }
    if (first) {
      first.classList.add('fm-missing')
      first.scrollIntoView({ block: 'center', behavior: 'smooth' })
      toast(t('Please answer the required questions'))
      return false
    }
    return true
  }

  const submit = async (book: Item[][], settings: ReturnType<typeof readSettings>) => {
    if (!validate(book[page])) return
    const missingPage = book.findIndex((p, i) => i !== page && p.some((q) => q.kind === 'question' && q.required && !isAnswered(draft.answers[q.id])))
    if (missingPage >= 0 || !draft.name.trim()) {
      page = missingPage >= 0 ? missingPage : 0
      render()
      validate(book[page])
      return
    }
    const rid = newId() + newId()
    const payload = { id: rid, form: docId, name: draft.name.trim(), group: draft.group.trim(), submittedAt: Date.now(), answers: draft.answers }
    try {
      const { sealed, privateKey } = await sealResponse(docId, settings.responseKey, payload)
      const entry: Mine = { rid, name: payload.name, group: payload.group, submittedAt: payload.submittedAt, answers: payload.answers, privateKey, sealed }
      mine = [...mine, entry]
      await saveMine(docId, mine)
      draft = { name: draft.name, group: draft.group, answers: {}, seed: newId() }
      saveDraft()
      view = 'status'
      page = 0
      flush()
      render()
      scrollTop()
      if (settings.dropUrl) void uploadToDrop(entry, settings.dropUrl, settings.dropPassword)
    } catch (err) {
      toast(t('Could not encrypt your response: {message}', { message: (err as Error).message }))
    }
  }

  const uploadToDrop = async (entry: Mine, url: string, password: string) => {
    try {
      const { uploadToShare } = await import('../../core/nextcloud')
      entry.uploaded = await uploadToShare(url, password, responseFileName(entry), responseBlob(entry))
      await saveMine(docId, mine)
      render()
    } catch (err) {
      console.warn('Nextcloud upload failed', err)
    }
  }

  const responseFileName = (entry: Mine) => `${safeFileName(`${entry.name} - ${String(doc.getMap('meta').get('title') || t('Form'))}`)}.oresp`
  const responseBlob = (entry: Mine) => new Blob([JSON.stringify({ format: 'ofimeo-form-response', form: docId, sealed: entry.sealed })], { type: 'application/json' })

  // ---------- After sending ----------

  const results = new Map<string, ReleasedResult | null>()
  const renderStatus = (settings: ReturnType<typeof readSettings>) => {
    const items = readItems(doc)
    const title = String(doc.getMap('meta').get('title') || t('Untitled form'))
    root.append(el('section', { class: 'fm-card fm-header' }, el('h1', { textContent: title }), state.fingerprint ? verifiedBadge(state.fingerprint) : null))
    const receipts = receiptsMap(doc)
    for (const entry of [...mine].reverse()) {
      const received = receipts.get(entry.rid)
      const card = el('section', { class: 'fm-card fm-status', dataset: { rid: entry.rid } })
      const when = new Date(entry.submittedAt).toLocaleString(locale)
      card.append(el('h2', { textContent: t('Your response of {date}', { date: when }) }))
      let status: string
      let cls: string
      if (received) {
        status = t('Received by the teacher ({date})', { date: new Date(received).toLocaleString(locale) })
        cls = 'ok'
      } else if (!navigator.onLine) {
        status = t('You are offline. Your response is saved in this browser and will be sent when you are back online.')
        cls = 'warn'
      } else {
        status = t('Sending… waiting for a teacher to be online. Keep this tab open, or download your response file and hand it in.')
        cls = 'warn'
      }
      card.append(el('p', { class: `fm-state ${cls}`, textContent: status, role: 'status' }))
      if (entry.uploaded) card.append(el('p', { class: 'hint', textContent: t('Also uploaded to the teacher’s Nextcloud folder as “{name}”.', { name: entry.uploaded }) }))
      if (received && settings.confirmation) card.append(el('p', { textContent: settings.confirmation }))
      const actions = el('div', { class: 'fm-nav' })
      actions.append(button(t('Download my response'), () => downloadBlob(responseBlob(entry), responseFileName(entry))))
      card.append(actions)
      // Released grade.
      const sealedResult = resultsMap(doc).get(entry.rid)
      if (sealedResult) {
        const result = results.get(entry.rid + sealedResult)
        if (result === undefined) {
          results.set(entry.rid + sealedResult, null)
          void openResult<ReleasedResult>(docId, entry.privateKey, settings.responseKey, sealedResult)
            .then((r) => (results.set(entry.rid + sealedResult, r), render()))
            .catch(() => undefined)
        } else if (result) card.append(resultView(items, entry, result))
      }
      root.append(card)
    }
    if (!settings.onePerBrowser && settings.accepting) root.append(el('div', { class: 'fm-nav' }, button(t('Submit another response'), () => ((view = 'form'), render()))))
    root.append(el('p', { class: 'hint fm-privacy', textContent: privacyNote() }))
  }

  const resultView = (items: Item[], entry: Mine, result: ReleasedResult) => {
    const box = el('div', { class: 'fm-result' }, el('p', { class: 'fm-score', textContent: t('Score: {score} / {max}', { score: fmt(result.score), max: fmt(result.max) }) }))
    for (const item of questionsOf(items)) {
      const q = result.questions[item.id]
      if (!q) continue
      const row = el('div', { class: `fm-result-q ${q.correct === true ? 'ok' : q.correct === false ? 'bad' : ''}` })
      row.append(el('div', { class: 'fm-q-title' }, item.title || t('Untitled question'), el('span', { class: 'fm-points', textContent: ` ${q.points === null ? '–' : fmt(q.points)} / ${fmt(q.max)}` })))
      row.append(el('div', { textContent: `${t('Your answer')}: ${answerText(item, entry.answers[item.id]) || '—'}` }))
      if (q.answer !== undefined && q.correct === false) row.append(el('div', { class: 'hint', textContent: `${t('Correct answer')}: ${answerText(item, q.answer as Answer)}` }))
      if (q.feedback) row.append(el('div', { class: 'fm-feedback', textContent: q.feedback }))
      if (q.comment) row.append(el('div', { class: 'fm-feedback', textContent: `${t('Teacher’s comment')}: ${q.comment}` }))
      box.append(row)
    }
    return box
  }

  // ---------- Outbox ----------

  const flush = () => {
    if (preview || !navigator.onLine || !state.transport.peerCount) return
    const receipts = receiptsMap(doc)
    for (const entry of mine) if (!receipts.has(entry.rid)) state.transport.submit(entry.sealed)
  }
  const timer = preview ? 0 : window.setInterval(flush, 4000)
  if (!preview) {
    state.transport.onPeerJoin(flush)
    window.addEventListener('online', () => (flush(), render()))
    window.addEventListener('offline', render)
  }

  let pending = 0
  const schedule = () => {
    cancelAnimationFrame(pending)
    pending = requestAnimationFrame(() => {
      // Do not rebuild the form under the respondent's fingers; the status view updates freely.
      if (view === 'status' || !root.querySelector('.fm-question') || preview) render()
    })
  }
  doc.on('update', schedule)
  render()
  flush()
  return () => {
    clearInterval(timer)
    stopSpelling()
    doc.off('update', schedule)
  }
}

const fmt = (n: number) => String(Math.round(n * 100) / 100)

function button(label: string, run: () => void, primary = false): HTMLButtonElement {
  const b = el('button', { type: 'button', class: primary ? 'primary' : 'fm-btn', textContent: label })
  b.addEventListener('click', run)
  return b
}

const scrollTop = () => document.querySelector('.fm-scroll')?.scrollTo({ top: 0 })

// Full-page respondent layout (no editor frame).
export async function mountRespondentPage(state: FormState, root: HTMLElement, color: string): Promise<void> {
  const logo = el('a', { class: 'fm-logo', href: homePath(), title: t('All documents') }, brandMark(28))
  const status = el('span', { class: 'status offline', role: 'status' })
  const renderStatus = () => {
    const peers = state.session.room.peerCount
    status.textContent = !navigator.onLine ? t('Offline') : peers ? t('Connected') : t('Waiting for connection')
    status.className = `status ${navigator.onLine && peers ? 'online' : 'offline'}`
  }
  state.session.room.onPeersChange(renderStatus)
  window.addEventListener('online', renderStatus)
  window.addEventListener('offline', renderStatus)
  renderStatus()
  const bar = el('header', { class: 'fm-topbar' }, logo, el('span', { class: 'fm-product', textContent: t('Ofimeo Forms') }), el('span', { class: 'spacer' }), status)
  const body = el('main', { class: 'fm-scroll' })
  const app = el('div', { class: 'app app-forms fm-respondent' }, bar, body)
  app.style.setProperty('--app-color', color)
  root.replaceChildren(app)
  // Respondents stay anonymous to each other: no presence.
  state.session.awareness.setLocalState(null)
  const syncTitle = () => (document.title = `${String(state.session.doc.getMap('meta').get('title') || t('Untitled form'))} · ${t('Ofimeo Forms')}`)
  state.session.doc.getMap('meta').observe(syncTitle)
  syncTitle()
  await mountRespond(state, body)
}
