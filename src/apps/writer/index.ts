// Entry point of the word processor, loaded on demand by the app registry.

import type { JSONContent } from '@tiptap/core'
import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap'
import type { Session, SubmitFile } from '../../core/session'
import { importFileAsDocument, mountWriter, OPEN_ACCEPT } from './app'
import { exportFile } from './formats'
import { DEFAULT_PAGE, langTag, type DocumentData, type PageSettings } from './formats/types'
import { t } from '../../core/i18n'
import { UI_LANG } from '../../core/spell/settings'
import './writer.css'

export const accept = OPEN_ACCEPT

export function mount(session: Session): void {
  mountWriter(session, document.getElementById('root')!)
}

export const importFile = importFileAsDocument

// "Hand in": the document as .odt and .docx, built from the shared state.
export async function submitFiles(session: Session): Promise<SubmitFile[]> {
  const { doc } = session
  const meta = doc.getMap<unknown>('meta')
  const fragment = (name: string): JSONContent | null => {
    const type = doc.getXmlFragment(name)
    if (!type.length) return null
    const json = yXmlFragmentToProsemirrorJSON(type) as JSONContent
    const content = json.content ?? []
    const empty = content.length === 0 || (content.length === 1 && content[0].type === 'paragraph' && !content[0].content?.length)
    return empty ? null : json
  }
  let page: PageSettings = DEFAULT_PAGE
  try {
    if (typeof meta.get('page') === 'string') page = { ...DEFAULT_PAGE, ...JSON.parse(meta.get('page') as string) }
  } catch {
    // Default page settings.
  }
  const title = String(meta.get('title') || t('Untitled document'))
  const data: DocumentData = {
    title,
    body: fragment('body') ?? { type: 'doc', content: [{ type: 'paragraph' }] },
    header: fragment('header'),
    footer: fragment('footer'),
    page,
    lang: langTag(meta.get('lang') ?? UI_LANG),
  }
  const [odt, docx] = await Promise.all([exportFile('odt', data, '', ''), exportFile('docx', data, '', '')])
  return [
    { name: `${title}.odt`, blob: odt },
    { name: `${title}.docx`, blob: docx },
  ]
}
