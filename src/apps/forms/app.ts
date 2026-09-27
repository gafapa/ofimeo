// Ofimeo Forms: forms and quizzes without a server.
//
// Editors (edit link) get the frame with three tabs: Questions (editor.ts),
// Responses (results.ts) and Settings, plus a preview. Everyone else (the
// "Send" link, which is the view link) gets the respondent page (respond.ts).
// See model.ts for the data, crypto.ts and transport.ts for how responses reach
// the editors encrypted.

import * as Y from 'yjs'
import QRCode from 'qrcode'
import { Eye, Heading, Image as ImageIcon, ListPlus, Redo2, Send, Sigma, Undo2 } from 'lucide'
import { appInfo } from '../registry'
import { t } from '../../core/i18n'
import { downloadBlob, safeFileName } from '../../core/handin'
import type { ExportOption, Session } from '../../core/session'
import { copyText, setupChrome } from '../../ui/chrome'
import { mountFrame } from '../../ui/frame'
import { renderShell } from '../../ui/shell'
import { mod } from '../../ui/shortcuts'
import { el, openPopover, closePopover, showDialog, toast } from '../../ui/widgets'
import { x25519Available } from './crypto'
import { createEditor } from './editor'
import { resultsTable, toCsv, toXlsx } from './export'
import { formFile, itemsArray, parseFormFile, createForm, QUESTION_TYPES, readSettings, settingsMap, typeLabel, type QuestionType } from './model'
import { mountRespond, mountRespondentPage, privacyNote, verifiedBadge } from './respond'
import { setupPaperPrint } from './paper'
import { createFindBar } from './find'
import { zoomMenuItems, type ZoomTarget } from '../../ui/zoom'
import { formSpelling, respondentSpellingSetting, spellcheckEditor } from './spell'
import { provideWebMcpTools } from '../../core/webmcp'
import { createResults, whoSeesResponses } from './results'
import { LOCAL, openFormState, type FormState } from './state'

export const FORMS_ACCEPT = '.oform'

type Tab = 'questions' | 'responses' | 'settings' | 'preview'

export async function mountForms(session: Session, root: HTMLElement): Promise<void> {
  const info = appInfo('forms')
  const protectedLink = session.isProtected
  if (!protectedLink || !(await x25519Available())) {
    root.innerHTML = '<div class="notice"><h1></h1><p class="text"></p><p><a href="#"></a></p></div>'
    root.querySelector('h1')!.textContent = t('This form cannot be opened here')
    // A link without the permission keys (cut off, or an old kind of link) versus a browser without the needed cryptography.
    root.querySelector('.text')!.textContent = protectedLink || !window.isSecureContext || !crypto.subtle
      ? t('Forms need a secure (https) connection and a recent browser, because responses are encrypted.')
      : t('This link is incomplete: it does not include the keys of the form. Ask the person who sent it for the whole link.')
    root.querySelector('a')!.textContent = t('Back to all documents')
    return
  }
  const state = await openFormState(session)
  if (!session.canEdit) return mountRespondentPage(state, root, info.color)
  mountEditorApp(state, root)
}

function mountEditorApp(state: FormState, root: HTMLElement): void {
  const { session } = state
  const doc = session.doc
  const priv = state.priv!
  const info = appInfo('forms')
  const shell = renderShell(info, root)
  setupChrome(session, info.untitled)

  const scroll = el('div', { class: 'fm-scroll' })
  const tabs = el('div', { class: 'fm-tabs', role: 'tablist' })
  const find = createFindBar(scroll)
  shell.main.append(tabs, find.element, scroll)
  shell.main.classList.add('fm-main')

  const editor = createEditor(state)
  spellcheckEditor(session, editor.element)
  let count = 0
  const results = createResults(state, (n) => {
    if (n !== count) {
      count = n
      renderTabs()
    }
  })
  let tab: Tab = 'questions'
  let stopPreview: (() => void) | null = null

  const undo = new Y.UndoManager([itemsArray(doc), settingsMap(doc), doc.getMap('meta')], { trackedOrigins: new Set([LOCAL]) })

  const renderTabs = () => {
    const list: [Tab, string][] = [
      ['questions', t('Questions')],
      ['responses', count ? t('Responses ({n})', { n: count }) : t('Responses')],
      ['settings', t('Settings')],
      ['preview', t('Preview')],
    ]
    tabs.replaceChildren(
      ...list.map(([value, label]) => {
        const b = el('button', { type: 'button', class: `fm-tab${value === tab ? ' active' : ''}`, textContent: label, role: 'tab', dataset: { tab: value } })
        b.setAttribute('aria-selected', String(value === tab))
        b.addEventListener('click', () => show(value))
        return b
      }),
    )
  }

  const show = (value: Tab) => {
    tab = value
    stopPreview?.()
    stopPreview = null
    renderTabs()
    scroll.scrollTop = 0
    if (value === 'questions') {
      scroll.replaceChildren(editor.element)
      editor.render()
    } else if (value === 'responses') {
      scroll.replaceChildren(results.element)
      results.render()
    } else if (value === 'settings') {
      scroll.replaceChildren(settingsView(state))
    } else {
      const box = el('div', { class: 'fm-preview' })
      scroll.replaceChildren(el('p', { class: 'hint fm-preview-note', textContent: t('Preview: this is what respondents see. Nothing is sent.') }), box)
      void mountRespond(state, box, { preview: true }).then((stop) => (stopPreview = stop))
    }
    frame.toolbar.refresh()
  }

  // ---------- Files ----------

  const fileInput = el('input', { type: 'file', accept: FORMS_ACCEPT, hidden: true })
  document.body.append(fileInput)
  setupPaperPrint(doc)
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0]
    fileInput.value = ''
    if (!file) return
    try {
      window.open(await createForm(parseFormFile(await file.text())), '_blank')
    } catch (err) {
      toast((err as Error).message)
    }
  })
  const title = () => String(doc.getMap('meta').get('title') || info.untitled)
  const formats = (): ExportOption[] => [
    { ext: 'oform', label: t('Ofimeo form (.oform)'), build: async () => new Blob([JSON.stringify(formFile(doc, priv), null, 1)], { type: 'application/json' }) },
    // Named like the Responses tab's downloads: "<title> - Responses.csv".
    { ext: 'csv', label: t('Responses (.csv)'), suffix: ` - ${t('Responses')}`, build: async () => toCsv(resultsTable(doc, priv)) },
    { ext: 'xlsx', label: t('Responses (.xlsx)'), suffix: ` - ${t('Responses')}`, build: () => toXlsx(resultsTable(doc, priv), title()) },
  ]
  session.hooks.exportFormats = formats

  const addMenu = (anchor: HTMLElement) => {
    const list = el('div', { class: 'menu-list fm-type-menu', role: 'menu' })
    for (const type of QUESTION_TYPES) {
      const b = el('button', { type: 'button', class: 'menu-row', textContent: typeLabel(type), role: 'menuitem' })
      b.addEventListener('click', () => {
        closePopover()
        addQuestion(type)
      })
      list.append(b)
    }
    openPopover(anchor, list)
  }
  const addQuestion = (type: QuestionType) => {
    if (tab !== 'questions') show('questions')
    editor.addQuestion(type)
  }
  const onQuestions = (fn: () => void) => () => {
    if (tab !== 'questions') show('questions')
    fn()
  }

  let zoomLevel = 1
  const zoom: ZoomTarget = {
    get: () => zoomLevel,
    set: (z) => {
      zoomLevel = Math.round(z * 100) / 100
      scroll.style.zoom = String(zoomLevel)
      frame.status?.zoom?.update()
    },
    min: 0.5,
    max: 2,
    presets: [0.5, 0.75, 0.9, 1, 1.25, 1.5, 2],
    keys: true,
  }
  const spelling = formSpelling(session, () => editor.element, () => tab !== 'questions' && show('questions'))
  const frame = mountFrame({
    session,
    shell,
    file: {
      openFile: () => fileInput.click(),
      print: () => window.print(),
      slots: { save: [{ label: t('Import response files…'), run: () => (show('responses'), results.importFiles()) }] },
      details: () => [
        [t('Questions'), String(itemsArray(doc).toArray().filter((m) => m.get('kind') !== 'section').length)],
        [t('Responses'), String(count)],
        [t('Owner code'), state.fingerprint],
      ],
    },
    edit: {
      undo: () => undo.undo(),
      redo: () => undo.redo(),
      canUndo: () => undo.canUndo(),
      canRedo: () => undo.canRedo(),
      // The form's text fields: the browser's clipboard commands on the focused field.
      cut: () => document.execCommand('cut'),
      copy: () => document.execCommand('copy'),
      paste: () => void pasteText(),
      selectAll: () => selectAllText(scroll),
      find: find.open,
    },
    zoom,
    menus: {
      view: {
        label: t('View'),
        items: [
          { label: t('Questions'), run: () => show('questions'), active: () => tab === 'questions' },
          { label: t('Responses'), run: () => show('responses'), active: () => tab === 'responses' },
          { label: t('Settings'), run: () => show('settings'), active: () => tab === 'settings' },
          { label: t('Preview'), run: () => show('preview'), active: () => tab === 'preview' },
          '-',
          { label: t('Zoom'), submenu: zoomMenuItems(zoom) },
        ],
      },
      insert: {
        label: t('Insert'),
        items: [
          { label: t('Question'), submenu: QUESTION_TYPES.map((type) => ({ label: typeLabel(type), run: () => addQuestion(type) })) },
          { label: t('Section'), run: onQuestions(() => editor.addSection()) },
          '-',
          { label: t('Image…'), run: onQuestions(() => editor.addImage()) },
          { label: t('Equation…'), run: onQuestions(() => editor.addEquation()) },
        ],
      },
      tools: {
        label: t('Tools'),
        items: [
          { label: t('Send…'), run: () => void sendDialog(state) },
          { label: t('Quiz mode'), active: () => readSettings(doc).quiz, run: () => doc.transact(() => settingsMap(doc).set('quiz', !readSettings(doc).quiz), LOCAL) },
          { label: t('Import response files…'), run: () => (show('responses'), results.importFiles()) },
          '-',
          ...spelling.menu(),
        ],
      },
    },
    help: { extra: [{ label: t('Who can see the responses?'), run: () => void showDialog(t('Who can see the responses?'), el('div', {}, el('p', { textContent: whoSeesResponses() }), el('p', { textContent: t('Owner code of this form: {code}', { code: state.fingerprint }) })), [{ label: t('OK'), value: 'ok', primary: true }]) }] },
  })
  const tb = frame.toolbar
  // AI assistants (WebMCP, off by default; editors only): the tool module loads only when turned on.
  provideWebMcpTools(session, () => import('./webmcp').then((m) => m.formsTools(session, state)))
  tb.group(
    tb.button(Undo2, t('Undo'), () => undo.undo(), { shortcut: mod('Z'), enabled: () => undo.canUndo() }),
    tb.button(Redo2, t('Redo'), () => undo.redo(), { shortcut: mod('Y'), enabled: () => undo.canRedo() }),
  )
  const addBtn = tb.button(ListPlus, t('Add question'), () => addMenu(addBtn), { text: t('Question') })
  addBtn.classList.add('fm-add-question')
  tb.group(addBtn, tb.button(Heading, t('Add section'), onQuestions(() => editor.addSection()), { text: t('Section') }))
  tb.group(tb.button(ImageIcon, t('Add image'), onQuestions(() => editor.addImage())), tb.button(Sigma, t('Add equation'), onQuestions(() => editor.addEquation())))
  const quiz = tb.button(null, t('Quiz mode'), () => doc.transact(() => settingsMap(doc).set('quiz', !readSettings(doc).quiz), LOCAL), { text: t('Quiz'), active: () => readSettings(doc).quiz })
  tb.group(quiz)
  const send = tb.button(Send, t('Send'), () => void sendDialog(state), { text: t('Send'), class: 'fm-send' })
  tb.group(tb.button(Eye, t('Preview'), () => show('preview'), { active: () => tab === 'preview' }), send, { pinned: true })
  undo.on('stack-item-added', tb.refresh)
  undo.on('stack-item-popped', tb.refresh)
  settingsMap(doc).observe(() => {
    tb.refresh()
    if (tab === 'settings' && !scroll.contains(document.activeElement)) scroll.replaceChildren(settingsView(state))
  })
  frame.status?.setInfo(t('Owner code {code}', { code: state.fingerprint }))

  renderTabs()
  show('questions')
  if (import.meta.env.DEV) Object.assign(window, { formsApp: { show, editor, results } })
}

// ---------- Clipboard ----------

// Edit ▸ Paste: the clipboard text into the focused field (browsers without
// clipboard access explain Ctrl+V instead).
async function pasteText(): Promise<void> {
  const field = document.activeElement
  let text: string | null = null
  try {
    text = await navigator.clipboard.readText()
  } catch {
    text = null
  }
  if (text === null || !(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) {
    toast(t('Use Ctrl+V to paste into a field'))
    return
  }
  field.focus()
  document.execCommand('insertText', false, text)
}

// Edit ▸ Select all: the focused field's text, else the text of the open tab.
function selectAllText(scope: HTMLElement): void {
  const field = document.activeElement
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
    field.select()
    return
  }
  const range = document.createRange()
  range.selectNodeContents(scope)
  const selection = getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

// ---------- Settings ----------

function settingsView(state: FormState): HTMLElement {
  const doc = state.session.doc
  const s = readSettings(doc)
  const set = (key: string, value: unknown) => doc.transact(() => settingsMap(doc).set(key, value), LOCAL)
  const check = (key: keyof typeof s, label: string, hint?: string) => {
    const input = el('input', { type: 'checkbox', checked: !!s[key], dataset: { setting: key } })
    input.addEventListener('change', () => set(key, input.checked))
    return el('div', { class: 'fm-setting' }, el('label', { class: 'check' }, input, label), hint ? el('p', { class: 'hint', textContent: hint }) : null)
  }
  const field = (key: keyof typeof s, label: string, multiline = false, type = 'text') => {
    const input = multiline ? el('textarea', { class: 'field', rows: 2 }) : el('input', { class: 'field', type })
    input.value = String(s[key] ?? '')
    input.dataset.setting = key
    input.addEventListener('change', () => set(key, input.value.trim()))
    return el('label', { class: 'field-label' }, label, input)
  }
  const release = el('select', { class: 'field' }, el('option', { value: 'immediate', textContent: t('Right after an editor receives the response (automatic grading only)') }), el('option', { value: 'manual', textContent: t('Later, when I release them') }))
  release.value = s.release
  release.addEventListener('change', () => set('release', release.value))
  return el(
    'div',
    { class: 'fm-column fm-settings' },
    el(
      'section',
      { class: 'fm-card' },
      el('h2', { textContent: t('Responses') }),
      check('accepting', t('Accepting responses')),
      check('collectGroup', t('Ask for the class or group')),
      check('onePerBrowser', t('Only one response per browser'), t('A convenience, not a guarantee: another browser or device can answer again.')),
      check('shuffleQuestions', t('Shuffle question order (within each section)')),
      respondentSpellingSetting(state.session, (value) => set('respondentSpelling', value)),
      field('confirmation', t('Message after the response is received'), true),
    ),
    el(
      'section',
      { class: 'fm-card' },
      el('h2', { textContent: t('Quiz') }),
      check('quiz', t('Make this a quiz'), t('Set correct answers and points; answers are graded automatically, open answers by hand.')),
      s.quiz ? el('label', { class: 'field-label' }, t('Release grades'), release) : null,
      s.quiz ? check('showCorrect', t('Show the correct answers in released grades')) : null,
    ),
    el(
      'section',
      { class: 'fm-card' },
      el('h2', { textContent: t('Nextcloud collection (optional)') }),
      el('p', { class: 'hint', textContent: t('Paste the link of a Nextcloud “File drop” share: every response is also uploaded there as an encrypted .oresp file (only this form’s editors can open it). Import them in Responses → Import response files. Respondents can see this link, so use an upload-only share.') }),
      field('dropUrl', t('File drop link'), false, 'url'),
      field('dropPassword', t('Share password (if any)')),
    ),
    el(
      'section',
      { class: 'fm-card' },
      el('h2', { textContent: t('Privacy and security') }),
      el('p', { textContent: whoSeesResponses() }),
      el('p', { textContent: t('Respondents see this owner code on the form. Only edit links can change the form: it is signed, so nobody else can alter it or impersonate you.') }),
      verifiedBadge(state.fingerprint),
    ),
  )
}

// ---------- Send ----------

export async function sendDialog(state: FormState): Promise<void> {
  const { session } = state
  const url = session.shareUrl('view')
  const input = el('input', { readOnly: true, class: 'field mono', value: url, id: 'fm-send-link' })
  const copy = el('button', { type: 'button', textContent: t('Copy link') })
  copy.addEventListener('click', () => void copyText(input))
  const canvas = el('canvas', { class: 'qr' })
  void QRCode.toCanvas(canvas, url, { width: 200, margin: 1 }).catch(() => {})
  const settings = readSettings(session.doc)
  const body = el(
    'div',
    { class: 'fm-send-body' },
    el('p', { textContent: t('Anyone with this link can answer the form. They cannot see the other responses or change the form.') }),
    el('div', { class: 'code-row' }, input, copy),
    canvas,
    verifiedBadge(state.fingerprint),
    el('p', { class: 'hint', textContent: privacyNote() }),
    el('p', { class: 'hint', textContent: t('Responses reach you while this form is open in your browser (or another editor’s). Students who answer while nobody is online keep retrying while their tab is open, and can download their response as a file for you to import.') }),
    !settings.accepting ? el('p', { class: 'fm-state warn', textContent: t('This form is not accepting responses (see Settings).') }) : null,
  )
  const choice = await showDialog(t('Send form'), body, [
    { label: t('Download link as file'), value: 'file' },
    { label: t('Done'), value: 'ok', primary: true },
  ])
  if (choice === 'file') {
    const title = String(session.doc.getMap('meta').get('title') || t('Untitled form'))
    downloadBlob(new Blob([`[InternetShortcut]\r\nURL=${url}\r\n`], { type: 'text/plain' }), `${safeFileName(title)}.url`)
  }
}

export { createForm, parseFormFile }
