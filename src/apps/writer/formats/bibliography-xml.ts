// Word's bibliography sources (customXml part with b:Sources): export and import.

import { escapeXml } from '../../../core/formats'
import { clean } from '../references/parse'
import { newSourceId, type CiteLang, type CiteSettings, type Person, type Source, type SourceType } from '../references/types'

export const WORD_LCID: Record<CiteLang, number> = { en: 1033, es: 3082, gl: 1110, fr: 1036, de: 1031 }
const B_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/bibliography'

const WORD_TYPES: Record<SourceType, string> = {
  book: 'Book',
  chapter: 'BookSection',
  article: 'JournalArticle',
  web: 'InternetSite',
  report: 'Report',
  thesis: 'Report',
  other: 'Misc',
}

const STYLE_FILES: Record<CiteSettings['style'], [string, string]> = {
  apa: ['\\APASixthEditionOfficeOnline.xsl', 'APA'],
  mla: ['\\MLASeventhEditionOfficeOnline.xsl', 'MLA'],
  chicago: ['\\Chicago.xsl', 'Chicago'],
}

// Unique Word tags (letters, digits and underscores) per source id.
export function sourceTags(sources: Source[]): Map<string, string> {
  const out = new Map<string, string>()
  const used = new Set<string>()
  for (const s of sources) {
    const who = (s.authors[0]?.family ?? s.title).normalize('NFD').replace(/[^A-Za-z0-9]/g, '').slice(0, 8) || 'Src'
    let tag = (s.key ?? '').replace(/[^A-Za-z0-9_]/g, '') || `${who}${(s.date ?? '').slice(2, 4)}`
    const base = tag
    for (let i = 2; used.has(tag.toLowerCase()); i++) tag = `${base}${i}`
    used.add(tag.toLowerCase())
    out.set(s.id, tag)
  }
  return out
}

const el = (name: string, value: string | undefined) => (value ? `<b:${name}>${escapeXml(value)}</b:${name}>` : '')

function nameList(people: Person[] | undefined): string {
  if (!people?.length) return ''
  if (people.length === 1 && people[0].org) return `<b:Corporate>${escapeXml(people[0].family)}</b:Corporate>`
  return `<b:NameList>${people
    .map((p) => {
      const [first, ...middle] = (p.given ?? '').split(/\s+/).filter(Boolean)
      return `<b:Person>${el('Last', p.family)}${el('First', first)}${el('Middle', middle.join(' '))}</b:Person>`
    })
    .join('')}</b:NameList>`
}

function dateParts(prefix: string, value: string | undefined): string {
  const m = /^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/.exec(value ?? '')
  if (!m) return value ? el(`${prefix}Year`, value) : ''
  return el(`${prefix}Year`, m[1]) + el(`${prefix}Month`, m[2] ? String(Number(m[2])) : undefined) + el(`${prefix}Day`, m[3] ? String(Number(m[3])) : undefined)
}

export function sourcesXml(sources: Source[], settings: CiteSettings): string {
  const tags = sourceTags(sources)
  const [file, name] = STYLE_FILES[settings.style]
  const items = sources.map((s, i) => {
    const authors = nameList(s.authors)
    const editors = nameList(s.editors)
    const container =
      s.type === 'article' ? el('JournalName', s.container) : s.type === 'chapter' ? el('BookTitle', s.container) : s.type === 'web' ? el('InternetSiteTitle', s.container) : el('PeriodicalTitle', s.container)
    return (
      `<b:Source><b:Tag>${escapeXml(tags.get(s.id)!)}</b:Tag><b:SourceType>${WORD_TYPES[s.type]}</b:SourceType><b:Guid>{${crypto.randomUUID().toUpperCase()}}</b:Guid>` +
      (authors || editors ? `<b:Author>${authors ? `<b:Author>${authors}</b:Author>` : ''}${editors ? `<b:Editor>${editors}</b:Editor>` : ''}</b:Author>` : '') +
      el('Title', s.title) +
      container +
      dateParts('', s.date) +
      el('Publisher', s.type === 'thesis' || s.type === 'report' ? undefined : s.publisher) +
      el('Institution', s.type === 'thesis' || s.type === 'report' ? s.publisher : undefined) +
      el('City', s.place) +
      el('Edition', s.edition) +
      el('Volume', s.volume) +
      el('Issue', s.issue) +
      el('Pages', s.pages) +
      el('StandardNumber', s.number) +
      el('ThesisType', s.type === 'thesis' ? s.genre || 'Doctoral dissertation' : undefined) +
      el('URL', s.url) +
      el('DOI', s.doi) +
      dateParts('Accessed', s.accessed).replace(/<b:AccessedYear>/, '<b:YearAccessed>').replace(/<\/b:AccessedYear>/, '</b:YearAccessed>').replace(/AccessedMonth/g, 'MonthAccessed').replace(/AccessedDay/g, 'DayAccessed') +
      `<b:RefOrder>${i + 1}</b:RefOrder></b:Source>`
    )
  })
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?><b:Sources SelectedStyle="${escapeXml(file)}" StyleName="${name}" Version="6" xmlns:b="${B_NS}" xmlns="${B_NS}">${items.join('')}</b:Sources>`
}

// ---------- Import ----------

const FROM_WORD: Record<string, SourceType> = {
  Book: 'book',
  BookSection: 'chapter',
  JournalArticle: 'article',
  ArticleInAPeriodical: 'article',
  ConferenceProceedings: 'chapter',
  Report: 'report',
  InternetSite: 'web',
  DocumentFromInternetSite: 'web',
  ElectronicSource: 'web',
}

const text = (parent: Element | null | undefined, name: string): string | undefined => {
  if (!parent) return undefined
  const found = [...parent.children].find((c) => c.localName === name)
  return found?.textContent?.trim() || undefined
}

function people(parent: Element | undefined): Person[] {
  if (!parent) return []
  const corporate = text(parent, 'Corporate')
  if (corporate) return [{ family: corporate, org: true }]
  return [...parent.getElementsByTagNameNS('*', 'Person')].map((p) => ({
    family: text(p, 'Last') ?? '',
    given: [text(p, 'First'), text(p, 'Middle')].filter(Boolean).join(' ') || undefined,
  }))
}

// Sources of a b:Sources document; `tags` maps Word tags to the new ids.
export function parseSourcesXml(root: Element): { sources: Source[]; tags: Map<string, string> } {
  const sources: Source[] = []
  const tags = new Map<string, string>()
  for (const src of [...root.children].filter((c) => c.localName === 'Source')) {
    const kind = text(src, 'SourceType') ?? 'Misc'
    const tag = text(src, 'Tag') ?? ''
    const authorBox = [...src.children].find((c) => c.localName === 'Author')
    const role = (name: string) => [...(authorBox?.children ?? [])].find((c) => c.localName === name)
    const date = (prefix: string, year = `${prefix}Year`, month = `${prefix}Month`, day = `${prefix}Day`) => {
      const y = text(src, year)
      if (!y) return undefined
      const m = Number(text(src, month)) || 0
      const d = Number(text(src, day)) || 0
      return m ? `${y}-${String(m).padStart(2, '0')}${d ? `-${String(d).padStart(2, '0')}` : ''}` : y
    }
    let type = FROM_WORD[kind] ?? 'other'
    if (kind === 'Report' && text(src, 'ThesisType') && /thes|diss|tesis|tese|thèse/i.test(text(src, 'ThesisType')!)) type = 'thesis'
    const id = newSourceId() + sources.length
    if (tag) tags.set(tag, id)
    sources.push(
      clean({
        id,
        key: tag || undefined,
        type,
        authors: people(role('Author')),
        editors: people(role('Editor')),
        title: text(src, 'Title') ?? '',
        container: text(src, 'JournalName') ?? text(src, 'BookTitle') ?? text(src, 'InternetSiteTitle') ?? text(src, 'PeriodicalTitle') ?? text(src, 'ConferenceName'),
        date: date(''),
        publisher: text(src, 'Publisher') ?? text(src, 'Institution'),
        place: text(src, 'City'),
        edition: text(src, 'Edition'),
        volume: text(src, 'Volume'),
        issue: text(src, 'Issue'),
        pages: text(src, 'Pages'),
        number: text(src, 'StandardNumber'),
        genre: type === 'thesis' ? text(src, 'ThesisType') : undefined,
        url: text(src, 'URL'),
        doi: text(src, 'DOI'),
        accessed: date('', 'YearAccessed', 'MonthAccessed', 'DayAccessed'),
      }),
    )
  }
  return { sources, tags }
}
