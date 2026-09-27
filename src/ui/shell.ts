// Common frame for every app: app bar (logo, title, menu bar, presence,
// share, user), toolbar row, main area and status bar.

import type { AppInfo } from '../apps/registry'
import { t } from '../core/i18n'
import { homePath } from '../core/router'
import { loadUser } from '../core/store'
import { accessibilityButton } from './accessibility'
import { el, icon, promptText } from './widgets'
import { Cloud, Inbox, Share2, UserRoundPen } from 'lucide'

export interface Shell {
  menubar: HTMLElement
  toolbar: HTMLElement
  main: HTMLElement
  statusbar: HTMLElement
}

export function renderShell(app: AppInfo, root: HTMLElement): Shell {
  root.innerHTML = `
    <div class="app app-${app.type}" style="--app-color:${app.color}">
      <header class="appbar">
        <div class="appbar-main">
          <a class="app-logo" href="${homePath()}">${app.letter}</a>
          <div class="title-block">
            <div class="title-row">
              <input id="doc-title" class="doc-title" aria-label="${t('Title')}" spellcheck="false" />
              <span id="access-badge" class="access-badge" hidden></span>
              <span class="save-indicator"><span id="save-state" class="save-state"></span></span>
            </div>
            <nav id="menubar" class="menubar" aria-label="${t('Menu')}"></nav>
          </div>
          <div class="appbar-actions">
            <span id="presence" class="presence" title="${t('People in this document')}"></span>
            <span id="peer-status" class="status offline">${t('Connecting…')}</span>
            <button id="btn-handin" class="handin-btn" title="${t('Download your work to hand it in')}"></button>
            <button id="btn-share" class="primary share-btn" title="${t('Share')}"></button>
            <input id="user-name" class="user-name" aria-label="${t('Your name')}" title="${t('Your name, as others see it')}" />
          </div>
        </div>
        <div id="toolbar" class="toolbar" role="toolbar" aria-label="${t('Formatting')}"></div>
      </header>
      <main id="app-main" class="app-main"></main>
      <footer id="statusbar" class="statusbar"></footer>
    </div>`
  root.querySelector('.appbar-actions')!.prepend(accessibilityButton())
  const nameInput = root.querySelector<HTMLInputElement>('#user-name')!
  nameInput.after(nameButton(nameInput))
  // The logo leads to the home screen; its tooltip names the app of the suite.
  const logo = root.querySelector<HTMLAnchorElement>('.app-logo')!
  logo.title = `${app.product} · ${t('All documents')}`
  logo.setAttribute('aria-label', logo.title)
  // Save state: an icon (the only part shown on phones) and a label (#save-state).
  root.querySelector('.save-indicator')!.prepend(icon(Cloud, 16))
  // Icon and label; on phones only the icon is shown (the label stays for screen readers).
  root.querySelector('#btn-handin')!.append(icon(Inbox, 18), el('span', { class: 'btn-label', textContent: t('Hand in') }))
  root.querySelector('#btn-share')!.append(icon(Share2, 18), el('span', { class: 'btn-label', textContent: t('Share') }))
  return {
    menubar: root.querySelector('#menubar')!,
    toolbar: root.querySelector('#toolbar')!,
    main: root.querySelector('#app-main')!,
    statusbar: root.querySelector('#statusbar')!,
  }
}

// On narrow screens (≤760 px) the "Your name" field is hidden; this button
// takes its place and edits the same field in a small dialog. The field's
// own change handler saves the name and tells collaborators.
export function nameButton(input: HTMLInputElement): HTMLButtonElement {
  const button = el('button', { type: 'button', class: 'user-name-btn' }, icon(UserRoundPen, 18))
  const refresh = () => {
    const name = input.value || loadUser().name
    button.title = `${t('Your name')}: ${name}`
    button.setAttribute('aria-label', button.title)
    button.style.borderColor = loadUser().color
  }
  input.addEventListener('change', refresh)
  button.addEventListener('focus', refresh)
  button.addEventListener('pointerenter', refresh)
  button.addEventListener('click', async () => {
    const name = await promptText(t('Your name'), t('Your name, as others see it'), input.value || loadUser().name)
    if (name === null || !name.trim()) return button.focus()
    input.value = name.trim()
    input.dispatchEvent(new Event('change'))
    button.focus()
  })
  queueMicrotask(refresh)
  return button
}
