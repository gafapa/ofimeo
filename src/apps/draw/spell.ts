// Spelling and grammar in drawings: text is checked as it is typed (the text
// editor Excalidraw opens) and by Tools ▸ Spelling and grammar… (F7), which
// walks through every text element.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { CaptureUpdateAction, newElementWith, restoreElements } from '@excalidraw/excalidraw'
import { t } from '../../core/i18n'
import type { Session } from '../../core/session'
import { openSpellingDialog, type SpellItem } from '../../ui/spell/dialog'
import { spellcheckFields } from '../../ui/spell/inline'
import { registerSpellingKey, spellingMenuItems } from '../../ui/spell/menu'
import { docLanguage } from '../../ui/spell/service'
import type { MenuEntry } from '../../ui/widgets'

const textOf = (e: any): string => String(e.originalText ?? e.text ?? '')

export function drawSpelling(session: Session, api: () => any, host: HTMLElement): { menu: () => MenuEntry[]; open: () => void } {
  const editable = () => session.canEdit
  const language = docLanguage(session.doc, editable)
  host.lang = language.tag()
  language.onChange(() => (host.lang = language.tag()))
  // Excalidraw's text editor (a textarea it adds while a text is edited).
  if (session.canEdit) spellcheckFields(host, 'textarea.excalidraw-wysiwyg', language.tag)

  const texts = (): any[] => {
    const list = (api()?.getSceneElements() ?? []).filter((e: any) => e.type === 'text' && !e.isDeleted && textOf(e).trim())
    return [...list].sort((a: any, b: any) => a.y - b.y || a.x - b.x)
  }

  const items = (): SpellItem[] => texts().map((e) => ({ key: e.id, label: t('Text'), text: textOf(e) }))

  const start = (list: SpellItem[]) => {
    const selected = Object.keys(api()?.getAppState().selectedElementIds ?? {})
    const at = list.findIndex((i) => selected.includes(i.key))
    return Math.max(0, at)
  }

  const reveal = (item: SpellItem) => {
    const a = api()
    const element = a?.getSceneElements().find((e: any) => e.id === item.key)
    if (!element) return
    a.updateScene({ appState: { selectedElementIds: { [element.id]: true } }, captureUpdate: CaptureUpdateAction.NEVER })
    a.scrollToContent(element, { animate: false })
  }

  const replace = (item: SpellItem, from: number, to: number, text: string): boolean => {
    const a = api()
    if (!a || !editable()) return false
    const all = a.getSceneElementsIncludingDeleted()
    const element = all.find((e: any) => e.id === item.key)
    const current = element ? textOf(element) : ''
    if (!element || current.slice(from, to) !== item.text.slice(from, to)) return false
    const next = current.slice(0, from) + text + current.slice(to)
    const updated = all.map((e: any) => (e.id === element.id ? newElementWith(e, { originalText: next, text: next } as any) : e))
    // Measures the text again (and wraps it in its container).
    const elements = restoreElements(updated, null, { refreshDimensions: true })
    a.updateScene({ elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY })
    return true
  }

  const open = () =>
    openSpellingDialog({ items, start, reveal, replace, editable, language, close: () => host.querySelector<HTMLElement>('.excalidraw')?.focus({ preventScroll: true }) })
  registerSpellingKey(open)
  return { open, menu: () => spellingMenuItems({ open, language, editable }) }
}
