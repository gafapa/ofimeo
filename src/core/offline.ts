// Offline support: service worker registration. Every app is precached, so
// once the service worker is active the whole suite works without network.

import { registerSW } from 'virtual:pwa-register'
import { t } from './i18n'
import { el, showDialog } from '../ui/widgets'

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return
  let pending = false
  let offered = false
  let reloadPending = false
  const atHome = () => !location.hash.includes('app=') && !document.querySelector('dialog[open]')
  const reloadWhenReady = () => {
    // A different tab can activate the worker: never reload an active editor.
    if (reloadPending && atHome()) location.reload()
  }
  const offerUpdate = async () => {
    if (!pending || offered || !atHome()) return
    offered = true
    const result = await showDialog(t('Update available'), el('p', { textContent: t('A new version of Ofimeo is ready. Update from the home screen when you have finished editing.') }), [
      { label: t('Later'), value: 'later' },
      { label: t('Update now'), value: 'update', primary: true },
    ])
    if (result === 'update' && !location.hash.includes('app=')) await update(true)
  }
  const update = registerSW({ immediate: true, onNeedReload: () => {
    reloadPending = true
    reloadWhenReady()
  }, onNeedRefresh: () => {
    pending = true
    void offerUpdate()
  } })
  window.addEventListener('hashchange', () => {
    reloadWhenReady()
    void offerUpdate()
  })
}

export function isOfflineCapable(): boolean {
  return 'serviceWorker' in navigator && !import.meta.env.DEV
}

// Resolves once the service worker has cached the suite.
export async function whenOfflineReady(): Promise<void> {
  await navigator.serviceWorker.ready
}
