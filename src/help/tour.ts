// Onboarding: the welcome tour of the home screen (a short modal dialog, shown
// once per browser) and each app's quick start (a small non-blocking panel with
// a few tips, shown the first time the app is opened). Both can be opened again
// from Help ▸ Getting started. Opt-outs for tests and kiosks: prefs.ts.

import { CircleHelp, HardDrive, Send, Share2, WifiOff, X, type IconNode } from 'lucide'
import { appInfo, SUITE } from '../apps/registry'
import { t } from '../core/i18n'
import type { Session } from '../core/session'
import { brandMark } from '../ui/brand'
import { el, icon } from '../ui/widgets'
import { markTipsSeen, markWelcomeSeen, onboardingOff, tipsSeen, welcomeSeen } from './prefs'
import './help.css'

// ---------- Welcome tour ----------

interface Step {
  icon: IconNode | null // null: the Ofimeo mark
  title: string
  text: string
}

const steps = (): Step[] => [
  {
    icon: null,
    title: t('Welcome to {suite}', { suite: SUITE }),
    text: t('Write documents, spreadsheets, presentations, diagrams, drawings, forms and notes, and annotate PDFs, on your own or with others. Designed for schools, useful for anyone: at home, in class or at work. No account is needed: everything runs in your browser.'),
  },
  {
    icon: HardDrive,
    title: t('Your documents live in this browser'),
    text: t('Everything is saved automatically on this device, not on a server. Clearing the browser data deletes your documents, so make a backup from time to time (Storage and backup) or save them to your school’s Nextcloud.'),
  },
  {
    icon: Share2,
    title: t('Share with a link'),
    text: t('Share gives you a link that can edit, comment or only view, or one that gives everyone their own copy. Changes travel directly between browsers, so someone who has the document must be online.'),
  },
  {
    icon: WifiOff,
    title: t('Works offline'),
    text: t('After the first visit every app works without a connection. Install it from the browser menu to open it like any other app.'),
  },
  {
    icon: Send,
    title: t('Hand in your work'),
    text: t('Hand in saves your work as a ZIP file or a PDF for your teacher, or sends it straight to a Nextcloud upload link or to Moodle. If you teach, a copy link gives each student their own worksheet.'),
  },
]

let tourOpen = false

// First visit of the home screen.
export function maybeShowWelcome(): void {
  if (welcomeSeen() || onboardingOff()) return
  void showWelcomeTour()
}

export function showWelcomeTour(): Promise<void> {
  if (tourOpen) return Promise.resolve()
  tourOpen = true
  const list = steps()
  let index = 0
  return new Promise((resolve) => {
    const dialog = el('dialog', { class: 'dlg tour' })
    const art = el('div', { class: 'tour-art' })
    const heading = el('h2', { id: 'tour-title' })
    const text = el('p', { id: 'tour-text', class: 'tour-text' })
    const counter = el('p', { class: 'tour-counter' })
    const dots = el('div', { class: 'tour-dots' }, ...list.map(() => el('span')))
    dots.setAttribute('aria-hidden', 'true')
    const content = el('div', { class: 'tour-content', role: 'group' }, art, heading, text)
    content.setAttribute('aria-live', 'polite')
    const skip = el('button', { type: 'button', class: 'tour-skip', textContent: t('Skip tour') })
    const back = el('button', { type: 'button', textContent: t('Back') })
    const help = el('button', { type: 'button', textContent: t('Open help center') })
    const next = el('button', { type: 'button', class: 'primary' })
    const note = el('p', { class: 'hint tour-note', textContent: t('You can open this tour and the help center again from the Help button.') })
    dialog.setAttribute('aria-labelledby', heading.id)
    dialog.setAttribute('aria-describedby', text.id)
    dialog.append(content, el('div', { class: 'tour-progress' }, dots, counter), note, el('div', { class: 'dlg-actions tour-actions' }, skip, el('span', { class: 'spacer' }), back, help, next))

    const render = () => {
      const step = list[index]
      const last = index === list.length - 1
      art.replaceChildren(step.icon ? icon(step.icon, 40) : brandMark(48))
      heading.textContent = step.title
      text.textContent = step.text
      counter.textContent = t('Step {n} of {m}', { n: index + 1, m: list.length })
      ;[...dots.children].forEach((d, i) => d.classList.toggle('on', i === index))
      back.hidden = index === 0
      skip.hidden = last
      help.hidden = !last
      note.hidden = !last
      next.textContent = last ? t('Get started') : t('Next')
    }
    const finish = () => {
      markWelcomeSeen()
      dialog.close()
    }
    skip.addEventListener('click', finish)
    back.addEventListener('click', () => {
      index = Math.max(0, index - 1)
      render()
      ;(back.hidden ? next : back).focus()
    })
    next.addEventListener('click', () => {
      if (index === list.length - 1) return finish()
      index++
      render()
      next.focus()
    })
    help.addEventListener('click', () => {
      finish()
      void import('./center').then((m) => m.openHelp('getting-started'))
    })
    dialog.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLButtonElement) {
        if (e.key === 'ArrowRight' && index < list.length - 1) next.click()
        else if (e.key === 'ArrowLeft' && index > 0) back.click()
      }
    })
    dialog.addEventListener('close', () => {
      markWelcomeSeen()
      tourOpen = false
      dialog.remove()
      resolve()
    })
    render()
    document.body.append(dialog)
    dialog.showModal()
    next.focus()
  })
}

// ---------- Quick start per app ----------

// Three or four tips for the app (and access) of a session.
export function quickStartTips(session: Session): string[] {
  if (session.type === 'forms' && !session.canEdit)
    return [
      t('Type your name, answer the questions and press Submit.'),
      t('If you are offline, your response is sent when the connection returns.'),
      t('If nobody who manages the form is online, use “Download my response” and hand the file in.'),
    ]
  if (!session.canEdit)
    return [
      session.access === 'comment' ? t('You can read this document and add comments, but not change it.') : t('You can read this document and follow changes live, but not change it.'),
      t('File ▸ Make a copy gives you your own copy that you can edit.'),
      t('The document is kept in this browser: you find it again on the home screen.'),
    ]
  const tips: Record<string, string[]> = {
    writer: [
      t('Use the menus and the toolbar to format text; right-click for more options.'),
      t('Headings build the table of contents (References ▸ Table of contents).'),
      t('To review a text, switch the mode from Editing to Suggesting, or select text and press Ctrl+Alt+M to comment. Suggestions you receive can be accepted or rejected one by one.'),
      t('Everything is saved in this browser as you type. Share invites others to write with you; Hand in sends your work to your teacher.'),
    ],
    sheet: [
      t('Type = to start a formula, for example =SUM(B2:B30).'),
      t('Insert ▸ Chart… makes a chart from the selected cells.'),
      t('The status bar shows the sum, average and count of the selection.'),
      t('File ▸ Download as saves Excel, OpenDocument or CSV files.'),
    ],
    draw: [
      t('Pick a tool in the tool bar on the canvas and drag to draw.'),
      t('Hold Space and drag to move around; Ctrl and the mouse wheel zoom.'),
      t('Everyone in the drawing sees each other’s pointers and changes live.'),
      t('File ▸ Download as saves PNG, SVG or .excalidraw files.'),
    ],
    diagram: [
      t('Drag shapes from the shape panel onto the canvas, or click one to insert it.'),
      t('Drag from a shape’s connection point to another shape to connect them.'),
      t('Double-click a shape to type its label; the format panel changes its look.'),
      t('View ▸ More shapes… adds libraries such as UML, networks or floor plans.'),
    ],
    slides: [
      t('Right-click a slide thumbnail to add, duplicate or move slides and change their layout.'),
      t('Type the speaker notes under the slide.'),
      t('Present shows the slides full screen; everyone else in the presentation can follow you.'),
      t('File ▸ Download as saves PowerPoint, OpenDocument or PDF files.'),
    ],
    forms: [
      t('Question adds a question of the type you choose; Section makes a new page.'),
      t('Turn on Quiz to set correct answers, points and feedback.'),
      t('Send gives the link and a QR code to pass the form around.'),
      t('Responses arrive while you (or another editor) are online; see them in Responses.'),
    ],
    pdf: [
      t('Choose a tool: highlight, pen, text box, stamps, sticky notes or your signature.'),
      t('Select text to highlight, underline or strike it out.'),
      t('Share the PDF to annotate it together or to give someone your notes.'),
      t('File ▸ Download as saves the PDF with your annotations.'),
    ],
    notebook: [
      t('Sections are the colored tabs; add pages and subpages in the list next to them and drag to reorder.'),
      t('Tag paragraphs as To do, Important, Question or Remember (Ctrl+Shift+1 to 4); Tag summary collects them.'),
      t('Pen, Highlighter and Eraser in the toolbar draw over the page; a stylus follows your pressure.'),
      t('Paste or drop pictures and files onto the page; File ▸ Download as exports a page, a section or the notebook.'),
    ],
  }
  return tips[session.type] ?? []
}

const tipsKey = (session: Session) => `${session.type}:${session.canEdit ? 'edit' : 'read'}`
let panel: HTMLElement | null = null

// First time an app is opened in this browser (called after the app has mounted).
export function maybeQuickStart(session: Session): void {
  if (tipsSeen(tipsKey(session)) || onboardingOff()) return
  setTimeout(() => showQuickStart(session, false), 800)
}

// Help ▸ Getting started. focus: move the keyboard focus into the panel.
export function showQuickStart(session: Session, focus = true): void {
  panel?.remove()
  const tips = quickStartTips(session)
  const key = tipsKey(session)
  if (!tips.length) return
  const info = appInfo(session.type)
  const heading = el('h2', { id: 'quickstart-title', textContent: t('Quick start: {app}', { app: info.product }) })
  const close = el('button', { type: 'button', class: 'quickstart-close', title: t('Close') }, icon(X, 16))
  close.setAttribute('aria-label', t('Close'))
  const more = el('button', { type: 'button', class: 'quickstart-more' }, icon(CircleHelp, 16), t('Help center'))
  const ok = el('button', { type: 'button', class: 'primary', textContent: t('Got it') })
  const node = el(
    'section',
    { class: 'quickstart' },
    el('div', { class: 'quickstart-head' }, heading, close),
    el('ul', {}, ...tips.map((tip) => el('li', { textContent: tip }))),
    el('div', { class: 'quickstart-actions' }, more, ok),
  )
  node.setAttribute('aria-labelledby', heading.id)
  node.style.setProperty('--qs-color', info.color)
  const previous = document.activeElement as HTMLElement | null
  const dismiss = (restore: boolean) => {
    markTipsSeen(key)
    node.remove()
    if (panel === node) panel = null
    if (restore && previous?.isConnected) previous.focus()
  }
  close.addEventListener('click', () => dismiss(true))
  ok.addEventListener('click', () => dismiss(true))
  more.addEventListener('click', () => {
    dismiss(false)
    void import('./center').then((m) => m.openHelp(m.appArticle(session), { session }))
  })
  node.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    e.preventDefault()
    e.stopPropagation()
    dismiss(true)
  })
  panel = node
  markTipsSeen(key) // shown once, even when it is ignored
  document.body.append(node)
  // Phones: stack above the storage notice of a first document (both sit at the bottom).
  const notice = document.querySelector<HTMLElement>('.persist-notice')
  if (notice && innerWidth <= 600) node.style.bottom = `${notice.offsetHeight + 28}px`
  if (focus) ok.focus()
}
