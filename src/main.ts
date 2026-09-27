// Bootstrap: routes by URL fragment to the home screen or to an app, loading
// only the code that is needed.

// First: moves data saved under the former name before other modules read it.
import { migrateLegacyDatabases } from './core/legacy-storage'
import './ui/base.css'
import { appInfo } from './apps/registry'
import { t } from './core/i18n'
import { newDocPath, parseRoute } from './core/router'
import { DOC_TYPES, type DocType } from './core/store'
import { registerServiceWorker } from './core/offline'
import { openSession } from './core/session'
import { onboardingOff } from './help/prefs'

registerServiceWorker()
await migrateLegacyDatabases()

const root = document.getElementById('root')!
// "#new=<app>" (the installed app's shortcuts): a new document of that app.
const fresh = new URLSearchParams(location.hash.replace(/^#/, '')).get('new') as DocType | null
if (fresh && DOC_TYPES.includes(fresh)) history.replaceState(null, '', newDocPath(fresh))
const route = parseRoute()

// Switching documents is done through the URL; a clean reload keeps state simple.
window.addEventListener('hashchange', () => location.reload())

const notice = (title: string, text: string) => {
  root.innerHTML = '<div class="notice"><h1></h1><p class="text"></p><p><a href="#"></a></p></div>'
  root.querySelector('h1')!.textContent = title
  root.querySelector('.text')!.textContent = text
  root.querySelector('a')!.textContent = t('Back to all documents')
}

if (route.kind === 'home') {
  const { mountHome } = await import('./home/home')
  mountHome(root)
} else if (route.copy) {
  // Template link: make a private copy, then open it.
  const { runCopyLink } = await import('./ui/copylink')
  await runCopyLink(root, route)
} else {
  const info = appInfo(route.type)
  if (!info.load) {
    notice(t('{app}: coming soon', { app: info.name }), '')
  } else {
    try {
      const [module, session] = await Promise.all([info.load(), openSession(route.type, route.id, route.key, route.keys)])
      // Normalize the URL (app, key and this browser's own permission keys) without a reload.
      history.replaceState(null, '', session.shareUrl())
      if (module.submitFiles) session.hooks.submitFiles = () => module.submitFiles!(session)
      if (module.restoreVersion) session.hooks.restoreVersion = (state) => module.restoreVersion!(session, state)
      // Handle for automated browser tests in development builds only.
      if (import.meta.env.DEV) Object.assign(window, { session })
      await module.mount(session)
      // First time this app is opened in this browser: its quick start tips (src/help).
      if (!onboardingOff()) void import('./help/tour').then((m) => m.maybeQuickStart(session)).catch(() => {})
    } catch (err) {
      console.error(err)
      notice(t('This document cannot be opened'), (err as Error).message)
    }
  }
}
