// Tag summary: every tagged paragraph of the notebook, grouped by tag, with
// its page; choosing one opens the page at that paragraph.

import { t } from '../../core/i18n'
import { el, showDialog } from '../../ui/widgets'
import type { NotebookContext } from './app'
import { allPages, collectTags, pageTitle, readSections, tagLabel, TAG_IDS, type TagId } from './model'

export async function tagSummary(ctx: NotebookContext): Promise<void> {
  const { doc } = ctx
  const items = collectTags(doc)
  const pages = new Map(allPages(doc).map((p) => [p.id, p]))
  const sections = new Map(readSections(doc).map((s) => [s.id, s]))
  const onlyOpen = el('input', { type: 'checkbox' })
  const list = el('div', { class: 'nb-tagsum-list' })
  let dialog: HTMLDialogElement | null = null
  const render = () => {
    const groups = TAG_IDS.map((tag) => ({
      tag,
      items: items.filter((i) => (tag === 'todo' ? i.tag === 'todo' || (!onlyOpen.checked && i.tag === 'done') : i.tag === tag)),
    })).filter((g) => g.items.length)
    if (!groups.length) {
      list.replaceChildren(el('p', { class: 'hint', textContent: items.length ? t('Every to-do is done.') : t('No tagged notes yet. Put the cursor in a paragraph and choose a tag in the toolbar (Tag) or with Ctrl+Shift+1 to 4.') }))
      return
    }
    list.replaceChildren(
      ...groups.map(({ tag, items: group }) =>
        el(
          'section',
          { class: 'nb-tagsum-group' },
          el('h3', { class: 'nb-tagsum-head', dataset: { nbTag: tag } }, el('span', { class: 'nb-tag-icon', dataset: { tag } }), `${tagLabel(tag)} (${group.length})`),
          ...group.map((item) => {
            const page = pages.get(item.page)
            const section = page ? sections.get(page.section) : undefined
            const row = el(
              'button',
              { type: 'button', class: `nb-tagsum-item${item.tag === 'done' ? ' done' : ''}` },
              el('span', { class: 'nb-tag-icon', dataset: { tag: item.tag } }),
              el('span', { class: 'nb-tagsum-text', textContent: item.text || '…' }),
              el('span', { class: 'nb-tagsum-page', textContent: `${section?.name ?? ''} › ${page ? pageTitle(page) : ''}` }),
            )
            row.addEventListener('click', () => {
              dialog?.close()
              ctx.openPage(item.page, { tagIndex: item.index })
            })
            return row
          }),
        ),
      ),
    )
  }
  onlyOpen.addEventListener('change', render)
  render()
  const body = el('div', { class: 'nb-tagsum' }, el('label', { class: 'nb-tagsum-filter' }, onlyOpen, t('Only open to-dos')), list)
  const shown = showDialog(t('Tag summary'), body, [{ label: t('Close'), value: 'close', primary: true }], true, 'notebook')
  dialog = body.closest('dialog')
  await shown
}

export const TAG_KEYS: Record<string, TagId> = { Digit1: 'todo', Digit2: 'important', Digit3: 'question', Digit4: 'remember' }
