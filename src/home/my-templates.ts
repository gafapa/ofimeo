// "My templates" in the template gallery: own templates saved with File ▸
// Save as template… (core/library-templates.ts). Click to create a document;
// rename, export as a .ofimeo-template file, share to the Nextcloud folder
// "Plantillas", import files, delete.

import { appInfo } from '../apps/registry'
import { downloadBlob } from '../core/handin'
import { t } from '../core/i18n'
import * as tpls from '../core/library-templates'
import { confirmDialog, el, showContextMenu, showDialog, toast, uiZoom, type MenuEntry } from '../ui/widgets'
import './storage.css'

export function mountMyTemplates(container: HTMLElement): void {
  let busy = false
  const grid = el('div', { class: 'tpl-grid my-tpl-grid', role: 'list' })
  grid.setAttribute('aria-label', t('My templates'))

  const fileInput = el('input', { type: 'file', accept: `${tpls.TEMPLATE_EXT},.json`, hidden: true, multiple: true })
  fileInput.addEventListener('change', async () => {
    const files = [...(fileInput.files ?? [])]
    fileInput.value = ''
    let count = 0
    for (const file of files) {
      try {
        await tpls.importTemplateFile(file)
        count++
      } catch (err) {
        toast(`${file.name}: ${(err as Error).message}`)
      }
    }
    if (count) toast(t('Templates imported: {n}', { n: count }))
    void render()
  })
  const importButton = el('button', { type: 'button', class: 'storage-btn', textContent: t('Import template…') })
  importButton.addEventListener('click', () => fileInput.click())
  const cloudButton = el('button', { type: 'button', class: 'storage-btn', textContent: t('From Nextcloud…') })
  cloudButton.addEventListener('click', () => void fromNextcloud().then(render))
  const hasAccount = () => import('../core/nextcloud').then((m) => !!m.currentAccount())
  void hasAccount().then((yes) => (cloudButton.hidden = !yes))

  const card = (tpl: tpls.OwnTemplate): HTMLElement => {
    const app = appInfo(tpl.app)
    const thumb = el('span', { class: 'tpl-thumb' }, el('img', { src: tpl.thumb, alt: '' }))
    const badge = el('span', { class: 'tpl-app' }, el('span', { class: 'app-icon small', textContent: app.letter }), el('span', { textContent: app.name }))
    ;(badge.firstChild as HTMLElement).style.background = app.color
    const open = el(
      'button',
      { type: 'button', class: 'tpl-card', title: tpl.description || tpl.name },
      thumb,
      el('span', { class: 'tpl-name', textContent: tpl.name }),
      el('span', { class: 'tpl-desc', textContent: tpl.description }),
      badge,
    )
    open.addEventListener('click', async () => {
      if (busy) return
      busy = true
      open.classList.add('busy')
      toast(t('Creating “{name}”…', { name: tpl.name }))
      try {
        location.href = await tpls.useOwnTemplate(tpl)
      } catch (err) {
        toast(t('Could not create the document: {error}', { error: (err as Error).message }))
        open.classList.remove('busy')
        busy = false
      }
    })
    const more = el('button', { type: 'button', class: 'row-more my-tpl-more', textContent: '⋮', title: t('More actions') })
    more.setAttribute('aria-label', t('More actions for {name}', { name: tpl.name }))
    const menu = (): MenuEntry[] => [
      { label: t('Rename…'), run: () => void edit(tpl) },
      {
        label: t('Export as file'),
        run: () => {
          const file = tpls.templateFile(tpl)
          downloadBlob(file.blob, file.name)
        },
      },
      { label: t('Share to Nextcloud (Plantillas)'), visible: () => !cloudButton.hidden, run: () => void share(tpl) },
      '-',
      { label: t('Delete…'), run: () => void remove(tpl) },
    ]
    more.addEventListener('click', (e) => {
      e.stopPropagation()
      const rect = more.getBoundingClientRect()
      showContextMenu(rect.right - 200 * uiZoom(), rect.bottom, menu())
    })
    open.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      showContextMenu(e.clientX, e.clientY, menu())
    })
    const wrap = el('div', { class: 'my-tpl' }, open, more)
    wrap.setAttribute('role', 'listitem')
    return wrap
  }

  const edit = async (tpl: tpls.OwnTemplate) => {
    const name = el('input', { class: 'field', value: tpl.name })
    const description = el('textarea', { class: 'field', rows: 3, value: tpl.description })
    const body = el('div', { class: 'storage-dialog' }, el('label', { class: 'field-label' }, t('Template name'), name), el('label', { class: 'field-label' }, t('Description (optional)'), description))
    const answer = await showDialog(t('Edit template'), body, [
      { label: t('Cancel'), value: 'cancel' },
      { label: t('Save'), value: 'ok', primary: true },
    ])
    if (answer !== 'ok') return
    await tpls.updateOwnTemplate(tpl.id, { name: name.value.trim() || tpl.name, description: description.value.trim() })
    void render()
  }

  const remove = async (tpl: tpls.OwnTemplate) => {
    if (!(await confirmDialog(t('Delete template'), t('Delete the template “{name}”? Documents created from it are kept.', { name: tpl.name }), { confirmLabel: t('Delete'), danger: true }))) return
    await tpls.deleteOwnTemplate(tpl.id)
    void render()
  }

  const share = async (tpl: tpls.OwnTemplate) => {
    try {
      const path = await tpls.shareToNextcloud(tpl)
      toast(t('Saved to Nextcloud: {path}', { path }))
    } catch (err) {
      toast((err as Error).message)
    }
  }

  const render = async () => {
    const list = await tpls.listOwnTemplates()
    grid.replaceChildren(...list.map(card))
    if (!list.length) grid.replaceChildren(el('p', { class: 'hint my-tpl-empty', textContent: t('Save any document as a template with File ▸ Save as template…, or import a template file.') }))
  }

  container.replaceChildren(
    el('div', { class: 'home-section-title my-tpl-title' }, el('h3', { textContent: t('My templates') }), el('span', { class: 'home-open-buttons' }, importButton, cloudButton, fileInput)),
    grid,
  )
  void render()
}

// Lists the .ofimeo-template files in the Nextcloud folder "Plantillas" and imports the chosen ones.
async function fromNextcloud(): Promise<void> {
  let found: Awaited<ReturnType<typeof tpls.nextcloudTemplates>>
  try {
    found = await tpls.nextcloudTemplates()
  } catch (err) {
    toast((err as Error).message)
    return
  }
  if (!found) return
  if (!found.files.length) {
    toast(t('There are no templates in the Nextcloud folder {folder}', { folder: tpls.NEXTCLOUD_TEMPLATES }))
    return
  }
  const boxes = found.files.map((f) => ({ f, box: el('input', { type: 'checkbox', checked: true }) }))
  const body = el(
    'div',
    { class: 'storage-dialog' },
    el('p', { textContent: t('Templates in the Nextcloud folder {folder}:', { folder: tpls.NEXTCLOUD_TEMPLATES }) }),
    ...boxes.map(({ f, box }) => el('label', { class: 'storage-row' }, box, f.name.replace(tpls.TEMPLATE_EXT, ''))),
  )
  const answer = await showDialog(t('Templates from Nextcloud'), body, [
    { label: t('Cancel'), value: 'cancel' },
    { label: t('Import'), value: 'ok', primary: true },
  ])
  if (answer !== 'ok') return
  let count = 0
  for (const { f, box } of boxes) {
    if (!box.checked) continue
    try {
      await tpls.importFromNextcloud(f.path)
      count++
    } catch (err) {
      toast(`${f.name}: ${(err as Error).message}`)
    }
  }
  if (count) toast(t('Templates imported: {n}', { n: count }))
}
