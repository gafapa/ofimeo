// The document's sources (Y.Map "sources", one entry per source) and citation
// settings (meta "cite"), shared by everyone editing the document.

import * as Y from 'yjs'
import { citeLangOf } from './format'
import { setReferences } from './nodes'
import { CITE_LANGS, CITE_STYLES, type CiteLang, type CiteSettings, type CiteStyle, type Source } from './types'

export class ReferenceStore {
  readonly map: Y.Map<Source>

  constructor(
    private doc: Y.Doc,
    private meta: Y.Map<unknown>,
    private docLang: () => unknown,
  ) {
    this.map = doc.getMap<Source>('sources')
    this.map.observe(() => this.publish())
    meta.observe((e) => {
      if (e.keysChanged.has('cite') || e.keysChanged.has('lang')) this.publish()
    })
    this.publish()
  }

  sources(): Source[] {
    return [...this.map.values()]
  }

  get(id: string): Source | undefined {
    return this.map.get(id)
  }

  save(source: Source): void {
    this.map.set(source.id, source)
  }

  remove(id: string): void {
    this.map.delete(id)
  }

  addAll(sources: Source[]): void {
    this.doc.transact(() => sources.forEach((s) => this.map.set(s.id, s)))
  }

  // Stored choice: style and optional language (automatic follows the document language).
  stored(): { style: CiteStyle; lang?: CiteLang } {
    try {
      const raw = JSON.parse(String(this.meta.get('cite') ?? '{}'))
      return { style: CITE_STYLES.includes(raw.style) ? raw.style : 'apa', lang: CITE_LANGS.includes(raw.lang) ? raw.lang : undefined }
    } catch {
      return { style: 'apa' }
    }
  }

  settings(): CiteSettings {
    const s = this.stored()
    return { style: s.style, lang: s.lang ?? citeLangOf(this.docLang()) }
  }

  setStyle(style: CiteStyle): void {
    this.meta.set('cite', JSON.stringify({ ...this.stored(), style }))
  }

  setLang(lang: CiteLang | undefined): void {
    this.meta.set('cite', JSON.stringify({ ...this.stored(), lang }))
  }

  publish(): void {
    setReferences(this.sources(), this.settings())
  }
}
