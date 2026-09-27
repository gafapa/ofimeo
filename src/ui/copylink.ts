// Page shown while a template link (…&copy=1) makes a private copy.

import { appInfo } from '../apps/registry'
import { copyFromLink, type CopyLinkRoute } from '../core/copy'
import { t } from '../core/i18n'
import { el } from './widgets'
import './edu.css'

export async function runCopyLink(root: HTMLElement, route: CopyLinkRoute): Promise<void> {
  const info = appInfo(route.type)
  document.title = `${t('Making your copy…')} · Ofimeo`
  const message = el('p', { class: 'copy-message' })
  const box = el(
    'div',
    { class: 'copy-wait', role: 'status' },
    el('h1', { textContent: t('Making your own copy ({kind})', { kind: info.name.toLowerCase() }) }),
    el('div', { class: 'spinner' }),
    message,
    el('p', { class: 'hint', textContent: t('The copy is private: it is saved in this browser and only you can edit it until you share it.') }),
    el('p', {}, el('a', { href: '#', textContent: t('Back to all documents') })),
  )
  root.replaceChildren(box)
  try {
    const path = await copyFromLink(route, (text, stalled) => {
      message.textContent = text
      box.classList.toggle('stalled', stalled)
    })
    location.replace(path)
  } catch (err) {
    box.classList.add('stalled')
    message.textContent = t('Could not make the copy: {message}', { message: (err as Error).message })
  }
}
