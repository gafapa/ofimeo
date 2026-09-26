// Citation and bibliography formatting: APA 7, MLA 9 and Chicago (author-date,
// 17th ed.), with terms in English, Spanish, Galician, French and German.
// Pure functions: used by the editor, the PDF export and the file converters.

import type { CitationRef, CiteLang, CiteSettings, CiteStyle, Person, Run, Source } from './types'

interface Terms {
  and: string
  nd: string
  etAl: string
  p: string
  pp: string
  ed: (n: string) => string
  editor: string
  editors: string
  editedBy: string
  in: string
  accessed: string
  retrieved: string
  vol: string
  no: string
  report: string
  thesis: string
  months: string[]
  monthsShort: string[]
  quote: (s: string) => string
  // Date "17 May 2020" / "May 17, 2020" in running text.
  date: (y: string, m?: number, d?: number, short?: boolean) => string
  references: Record<CiteStyle, string>
}

const ordinal = (n: string) => {
  const v = Number(n)
  if (!Number.isInteger(v)) return n
  const s = v % 100 >= 11 && v % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[v % 10] ?? 'th'
  return `${v}${s}`
}

const TERMS: Record<CiteLang, Terms> = {
  en: {
    and: 'and',
    nd: 'n.d.',
    etAl: 'et al.',
    p: 'p.',
    pp: 'pp.',
    ed: (n) => `${ordinal(n)} ed.`,
    editor: 'Ed.',
    editors: 'Eds.',
    editedBy: 'edited by',
    in: 'In',
    accessed: 'Accessed',
    retrieved: 'Retrieved',
    vol: 'vol.',
    no: 'no.',
    report: 'Report No.',
    thesis: 'Doctoral dissertation',
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    monthsShort: ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'],
    quote: (s) => `“${s}”`,
    date: (y, m, d, short) => (m ? `${d ? `${d} ` : ''}${(short ? TERMS.en.monthsShort : TERMS.en.months)[m - 1]} ${y}` : y),
    references: { apa: 'References', mla: 'Works Cited', chicago: 'References' },
  },
  es: {
    and: 'y',
    nd: 's.f.',
    etAl: 'et al.',
    p: 'p.',
    pp: 'pp.',
    ed: (n) => (Number.isInteger(Number(n)) ? `${n}.ª ed.` : `${n} ed.`),
    editor: 'Ed.',
    editors: 'Eds.',
    editedBy: 'editado por',
    in: 'En',
    accessed: 'Consultado el',
    retrieved: 'Recuperado el',
    vol: 'vol.',
    no: 'n.º',
    report: 'Informe n.º',
    thesis: 'Tesis doctoral',
    months: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
    monthsShort: ['ene.', 'feb.', 'mar.', 'abr.', 'mayo', 'jun.', 'jul.', 'ago.', 'sept.', 'oct.', 'nov.', 'dic.'],
    quote: (s) => `«${s}»`,
    date: (y, m, d, short) => (m ? `${d ? `${d} de ` : ''}${(short ? TERMS.es.monthsShort : TERMS.es.months)[m - 1]} de ${y}` : y),
    references: { apa: 'Referencias', mla: 'Obras citadas', chicago: 'Referencias' },
  },
  gl: {
    and: 'e',
    nd: 's.d.',
    etAl: 'et al.',
    p: 'p.',
    pp: 'pp.',
    ed: (n) => (Number.isInteger(Number(n)) ? `${n}.ª ed.` : `${n} ed.`),
    editor: 'Ed.',
    editors: 'Eds.',
    editedBy: 'editado por',
    in: 'En',
    accessed: 'Consultado o',
    retrieved: 'Recuperado o',
    vol: 'vol.',
    no: 'n.º',
    report: 'Informe n.º',
    thesis: 'Tese de doutoramento',
    months: ['xaneiro', 'febreiro', 'marzo', 'abril', 'maio', 'xuño', 'xullo', 'agosto', 'setembro', 'outubro', 'novembro', 'decembro'],
    monthsShort: ['xan.', 'feb.', 'mar.', 'abr.', 'maio', 'xuño', 'xul.', 'ago.', 'set.', 'out.', 'nov.', 'dec.'],
    quote: (s) => `«${s}»`,
    date: (y, m, d, short) => (m ? `${d ? `${d} de ` : ''}${(short ? TERMS.gl.monthsShort : TERMS.gl.months)[m - 1]} de ${y}` : y),
    references: { apa: 'Referencias', mla: 'Obras citadas', chicago: 'Referencias' },
  },
  fr: {
    and: 'et',
    nd: 's.d.',
    etAl: 'et al.',
    p: 'p.',
    pp: 'p.',
    ed: (n) => (Number.isInteger(Number(n)) ? `${n}e éd.` : `${n} éd.`),
    editor: 'Éd.',
    editors: 'Éds.',
    editedBy: 'édité par',
    in: 'Dans',
    accessed: 'Consulté le',
    retrieved: 'Consulté le',
    vol: 'vol.',
    no: 'no',
    report: 'Rapport no',
    thesis: 'Thèse de doctorat',
    months: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
    monthsShort: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juill.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
    quote: (s) => `« ${s} »`,
    date: (y, m, d, short) => (m ? `${d ? `${d} ` : ''}${(short ? TERMS.fr.monthsShort : TERMS.fr.months)[m - 1]} ${y}` : y),
    references: { apa: 'Références', mla: 'Ouvrages cités', chicago: 'Références' },
  },
  de: {
    and: 'und',
    nd: 'o. J.',
    etAl: 'et al.',
    p: 'S.',
    pp: 'S.',
    ed: (n) => (Number.isInteger(Number(n)) ? `${n}. Aufl.` : `${n} Aufl.`),
    editor: 'Hrsg.',
    editors: 'Hrsg.',
    editedBy: 'hrsg. von',
    in: 'In',
    accessed: 'Zugriff am',
    retrieved: 'Abgerufen am',
    vol: 'Bd.',
    no: 'Nr.',
    report: 'Bericht Nr.',
    thesis: 'Dissertation',
    months: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
    monthsShort: ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'],
    quote: (s) => `„${s}“`,
    date: (y, m, d, short) => (m ? `${d ? `${d}. ` : ''}${(short ? TERMS.de.monthsShort : TERMS.de.months)[m - 1]} ${y}` : y),
    references: { apa: 'Literaturverzeichnis', mla: 'Zitierte Werke', chicago: 'Literaturverzeichnis' },
  },
}

export function bibliographyTitle(settings: CiteSettings): string {
  return TERMS[settings.lang].references[settings.style]
}

// ---------- Helpers ----------

interface ParsedDate {
  year: string
  month?: number
  day?: number
}

function parseDate(value: string | undefined): ParsedDate | null {
  const m = /^\s*(\d{3,4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?/.exec(value ?? '')
  if (!m) return value?.trim() ? { year: value.trim() } : null
  const month = m[2] ? Number(m[2]) : undefined
  return { year: m[1], month: month && month >= 1 && month <= 12 ? month : undefined, day: m[3] ? Number(m[3]) : undefined }
}

function initials(given: string): string {
  return given
    .split(/\s+/)
    .filter(Boolean)
    .map((part) =>
      part
        .split('-')
        .map((p) => (p ? `${p[0].toUpperCase()}.` : ''))
        .join('-'),
    )
    .join(' ')
}

const familyOf = (p: Person) => p.family.trim()
const invertedFull = (p: Person) => (p.org || !p.given ? familyOf(p) : `${familyOf(p)}, ${p.given.trim()}`)
const directFull = (p: Person) => (p.org || !p.given ? familyOf(p) : `${p.given.trim()} ${familyOf(p)}`)
const apaName = (p: Person) => (p.org || !p.given ? familyOf(p) : `${familyOf(p)}, ${initials(p.given)}`)
const apaEditorName = (p: Person) => (p.org || !p.given ? familyOf(p) : `${initials(p.given)} ${familyOf(p)}`)

// "A, B, and C" with the locale's conjunction; `serial` adds the comma before it (English).
function joinNames(names: string[], and: string, serial: boolean): string {
  if (names.length <= 1) return names.join('')
  if (names.length === 2) return `${names[0]}${serial && and === '&' ? ',' : ''} ${and} ${names[1]}`
  return `${names.slice(0, -1).join(', ')}${serial ? ',' : ''} ${and} ${names[names.length - 1]}`
}

const endPunct = (s: string) => /[.!?…»”"]$/.test(s.trim())
const dot = (s: string) => (endPunct(s) ? s : `${s}.`)
const dash = (pages: string) => pages.replace(/\s*[-–—]+\s*/g, '–')
const doiUrl = (doi: string) => (/^https?:\/\//i.test(doi) ? doi : `https://doi.org/${doi.replace(/^doi:\s*/i, '')}`)
const isRange = (s: string) => /[-–—,]/.test(s)

class Out {
  runs: Run[] = []
  add(text: string | undefined | null, italic = false): this {
    if (!text) return this
    const last = this.runs[this.runs.length - 1]
    if (last && !!last.italic === italic) last.text += text
    else this.runs.push(italic ? { text, italic } : { text })
    return this
  }
  get text(): string {
    return this.runs.map((r) => r.text).join('')
  }
}

// ---------- Disambiguation (2020a, 2020b) ----------

function authorKey(s: Source): string {
  return (s.authors.length ? s.authors : s.editors ?? []).map((p) => `${familyOf(p)}|${p.given ?? ''}`.toLowerCase()).join(';')
}

// Letters for sources with the same authors and year (author-date styles).
export function yearSuffixes(sources: Source[], settings: CiteSettings): Map<string, string> {
  const out = new Map<string, string>()
  if (settings.style === 'mla') return out
  const groups = new Map<string, Source[]>()
  for (const s of sources) {
    const key = `${authorKey(s)}#${parseDate(s.date)?.year ?? ''}`
    groups.set(key, [...(groups.get(key) ?? []), s])
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue
    group.sort((a, b) => a.title.localeCompare(b.title, settings.lang))
    group.forEach((s, i) => out.set(s.id, String.fromCharCode(97 + (i % 26))))
  }
  return out
}

function yearText(s: Source, t: Terms, suffix: string | undefined, style: CiteStyle): string {
  const d = parseDate(s.date)
  if (!d) return suffix ? `${t.nd}${style === 'apa' ? '-' : ' '}${suffix}` : t.nd
  return `${d.year}${suffix ?? ''}`
}

// ---------- In-text citations ----------

export interface CitationParts {
  prefix: string
  items: string[]
  separator: string
  suffix: string
}

function shortTitle(s: Source, t: Terms, style: CiteStyle): string {
  const words = s.title.split(/\s+/).slice(0, 4).join(' ')
  const italic = ['book', 'report', 'thesis', 'web'].includes(s.type)
  return italic || style === 'apa' ? words : t.quote(words)
}

function citationAuthors(s: Source, settings: CiteSettings, t: Terms): string {
  const people = s.authors.length ? s.authors : (s.editors ?? [])
  if (!people.length) return shortTitle(s, t, settings.style)
  const names = people.map(familyOf)
  if (settings.style === 'apa') {
    if (names.length === 1) return names[0]
    if (names.length === 2) return `${names[0]} ${settings.lang === 'en' ? '&' : t.and} ${names[1]}`
    return `${names[0]} ${t.etAl}`
  }
  if (settings.style === 'mla') {
    if (names.length === 1) return names[0]
    if (names.length === 2) return `${names[0]} ${t.and} ${names[1]}`
    return `${names[0]} ${t.etAl}`
  }
  // Chicago author-date: up to three names, then et al.
  if (names.length <= 3) return joinNames(names, t.and, settings.lang === 'en' && names.length > 2)
  return `${names[0]} ${t.etAl}`
}

function locatorText(locator: string, settings: CiteSettings, t: Terms): string {
  const l = locator.trim()
  if (!l) return ''
  // A bare number or range gets p./pp.; anything else ("cap. 3") is kept as typed.
  if (!/^[\d\s–—,-]+$/.test(l)) return l
  if (settings.style !== 'apa') return dash(l)
  return `${isRange(l) ? t.pp : t.p} ${dash(l)}`
}

// Parenthetical citation of one or more sources, as parts (one item per source).
export function citationParts(ref: CitationRef, sources: Map<string, Source>, settings: CiteSettings, suffixes: Map<string, string>): CitationParts {
  const t = TERMS[settings.lang]
  const cited = ref.ids.map((id) => sources.get(id)).filter((s): s is Source => !!s)
  if (settings.style === 'apa') cited.sort((a, b) => sortKey(a).localeCompare(sortKey(b), settings.lang))
  const locator = locatorText(ref.locator ?? '', settings, t)
  const items = cited.map((s, i) => {
    const author = citationAuthors(s, settings, t)
    const last = i === cited.length - 1
    if (settings.style === 'mla') return last && locator ? `${author} ${locator}` : author
    const year = yearText(s, t, suffixes.get(s.id), settings.style)
    const noDate = !parseDate(s.date)
    const base = settings.style === 'apa' || noDate ? `${author}, ${year}` : `${author} ${year}`
    return last && locator ? `${base}, ${locator}` : base
  })
  if (!items.length) items.push('?')
  return { prefix: '(', items, separator: '; ', suffix: ')' }
}

export function citationText(ref: CitationRef, sources: Map<string, Source>, settings: CiteSettings, suffixes: Map<string, string>): string {
  const p = citationParts(ref, sources, settings, suffixes)
  return p.prefix + p.items.join(p.separator) + p.suffix
}

// ---------- Reference list ----------

function sortKey(s: Source): string {
  const people = s.authors.length ? s.authors : (s.editors ?? [])
  const who = people.map((p) => `${familyOf(p)} ${p.given ?? ''}`).join(' ') || s.title
  return `${who} ${parseDate(s.date)?.year ?? '0000'} ${s.title}`.toLowerCase()
}

export function sortSources(sources: Source[], settings: CiteSettings): Source[] {
  return [...sources].sort((a, b) => sortKey(a).localeCompare(sortKey(b), settings.lang))
}

function apaAuthors(people: Person[], t: Terms, lang: CiteLang): string {
  const names = people.map(apaName)
  if (names.length > 20) return `${names.slice(0, 19).join(', ')}, … ${names[names.length - 1]}`
  return joinNames(names, lang === 'en' ? '&' : t.and, lang === 'en')
}

// "(2020, May 17)" / "(2020, 17 de mayo)": the year first, then month and day.
function apaDate(d: ParsedDate, suffix: string | undefined, t: Terms, lang: CiteLang): string {
  const year = `${d.year}${suffix ?? ''}`
  if (!d.month) return year
  const month = t.months[d.month - 1]
  const day = d.day
  const rest =
    lang === 'en' ? `${month}${day ? ` ${day}` : ''}` : lang === 'de' ? `${day ? `${day}. ` : ''}${month}` : lang === 'fr' ? `${day ? `${day} ` : ''}${month}` : `${day ? `${day} de ` : ''}${month}`
  return `${year}, ${rest}`
}

function mlaAuthors(people: Person[], t: Terms): string {
  if (!people.length) return ''
  if (people.length === 1) return invertedFull(people[0])
  if (people.length === 2) return `${invertedFull(people[0])}, ${t.and} ${directFull(people[1])}`
  return `${invertedFull(people[0])}, ${t.etAl}`
}

function chicagoAuthors(people: Person[], t: Terms, lang: CiteLang): string {
  if (!people.length) return ''
  const names = [invertedFull(people[0]), ...people.slice(1, 10).map(directFull)]
  if (people.length > 10) return `${names.slice(0, 7).join(', ')}, ${t.etAl}`
  // The first name is inverted, so English keeps the comma before "and" even for two names.
  if (names.length === 2 && lang === 'en') return `${names[0]}, ${t.and} ${names[1]}`
  return joinNames(names, t.and, lang === 'en')
}

function editorsText(eds: Person[] | undefined, t: Terms, style: CiteStyle, lang: CiteLang): string {
  if (!eds?.length) return ''
  if (style === 'apa') return `${joinNames(eds.map(apaEditorName), lang === 'en' ? '&' : t.and, lang === 'en')} (${eds.length > 1 ? t.editors : t.editor})`
  return joinNames(eds.map(directFull), t.and, lang === 'en')
}

function link(s: Source): string {
  return s.doi ? doiUrl(s.doi) : (s.url ?? '')
}

// One formatted reference list entry.
export function formatReference(s: Source, settings: CiteSettings, suffixes: Map<string, string>): Run[] {
  const t = TERMS[settings.lang]
  const o = new Out()
  const suffix = suffixes.get(s.id)
  const d = parseDate(s.date)
  const edition = s.edition?.trim() && s.edition.trim() !== '1' ? t.ed(s.edition.trim()) : ''
  const pages = s.pages ? dash(s.pages) : ''
  const url = link(s)

  if (settings.style === 'apa') {
    const people = s.authors.length ? s.authors : []
    const byEditors = !people.length && !!s.editors?.length
    const who = people.length ? apaAuthors(people, t, settings.lang) : byEditors ? `${apaAuthors(s.editors!, t, settings.lang)} (${s.editors!.length > 1 ? t.editors : t.editor})` : ''
    const year = !d ? yearText(s, t, suffix, 'apa') : s.type === 'web' ? apaDate(d, suffix, t, settings.lang) : `${d.year}${suffix ?? ''}`
    const title = s.title.trim()
    if (who) o.add(`${dot(who)} (${year}). `)
    // Without authors the title takes the author position.
    const italicTitle = s.type !== 'article' && s.type !== 'chapter'
    const extra = [edition, s.type === 'report' && s.number ? `${t.report} ${s.number}` : ''].filter(Boolean).join(', ')
    if (!who) {
      o.add(title, italicTitle)
      if (extra) o.add(` (${extra})`)
      o.add(`. (${year}). `)
    } else {
      o.add(title, italicTitle)
      if (extra) o.add(` (${extra})`)
      if (s.type === 'thesis') o.add(` [${s.genre || t.thesis}${s.publisher ? `, ${s.publisher}` : ''}]`)
      o.add(endPunct(title) && !extra && s.type !== 'thesis' ? ' ' : '. ')
    }
    switch (s.type) {
      case 'article':
        if (s.container) {
          o.add(s.container, true)
          if (s.volume) o.add(', ').add(s.volume, true)
          if (s.issue) o.add(`(${s.issue})`)
          if (pages) o.add(`, ${pages}`)
          o.add('. ')
        }
        break
      case 'chapter': {
        const eds = editorsText(s.editors, t, 'apa', settings.lang)
        o.add(`${t.in} `)
        if (eds) o.add(`${eds}, `)
        o.add(s.container ?? '', true)
        if (pages) o.add(` (${t.pp} ${pages})`)
        o.add('. ')
        if (s.publisher) o.add(`${dot(s.publisher)} `)
        break
      }
      case 'web':
        if (s.container && s.container !== who) o.add(`${dot(s.container)} `)
        break
      case 'thesis':
        break
      default:
        if (s.publisher && s.publisher !== who) o.add(`${dot(s.publisher)} `)
    }
    if (url) o.add(url)
    return trimRuns(o.runs)
  }

  if (settings.style === 'mla') {
    const who = mlaAuthors(s.authors, t)
    if (who) o.add(`${dot(who)} `)
    const quoted = s.type === 'article' || s.type === 'chapter' || (s.type === 'web' && !!s.container)
    if (quoted) o.add(`${t.quote(settings.lang === 'en' ? dot(s.title.trim()) : s.title.trim())}${settings.lang === 'en' ? '' : '.'} `)
    else o.add(s.title.trim(), true).add(endPunct(s.title) ? ' ' : '. ')
    const parts: { text: string; italic?: boolean }[] = []
    if (quoted && s.container) parts.push({ text: s.container, italic: true })
    if (s.type === 'chapter' && s.editors?.length) parts.push({ text: `${t.editedBy} ${editorsText(s.editors, t, 'mla', settings.lang)}` })
    if (edition) parts.push({ text: edition })
    if (s.volume) parts.push({ text: `${t.vol} ${s.volume}` })
    if (s.issue) parts.push({ text: `${t.no} ${s.issue}` })
    if (s.publisher && s.type !== 'article' && s.type !== 'thesis') parts.push({ text: s.publisher })
    if (d) parts.push({ text: s.type === 'web' || s.type === 'article' ? t.date(d.year, d.month, d.day, true) : d.year })
    if (pages) parts.push({ text: `${isRange(pages) ? t.pp : t.p} ${pages}` })
    if (s.type === 'thesis') parts.push({ text: [s.publisher, s.genre || t.thesis].filter(Boolean).join(', ') })
    if (url) parts.push({ text: url.replace(/^https?:\/\//, s.doi ? 'https://' : '') })
    parts.forEach((p, i) => {
      o.add(p.text, !!p.italic)
      o.add(i < parts.length - 1 ? ', ' : '.')
    })
    const accessed = parseDate(s.accessed)
    if (s.type === 'web' && accessed) o.add(` ${t.accessed} ${t.date(accessed.year, accessed.month, accessed.day, true)}.`)
    return trimRuns(o.runs)
  }

  // Chicago author-date.
  const who = chicagoAuthors(s.authors.length ? s.authors : (s.editors ?? []), t, settings.lang)
  const year = yearText(s, t, suffix, 'chicago')
  if (who) o.add(`${dot(who)} ${year}. `)
  const quoted = s.type === 'article' || s.type === 'chapter' || s.type === 'web' || s.type === 'thesis'
  if (quoted) o.add(`${t.quote(settings.lang === 'en' ? dot(s.title.trim()) : s.title.trim())}${settings.lang === 'en' ? '' : '.'} `)
  else o.add(s.title.trim(), true).add(endPunct(s.title) ? ' ' : '. ')
  if (!who) o.add(`${year}. `)
  const place = [s.place, s.publisher].filter(Boolean).join(': ')
  switch (s.type) {
    case 'article':
      if (s.container) {
        o.add(s.container, true)
        if (s.volume) o.add(` ${s.volume}`)
        if (s.issue) o.add(` (${s.issue})`)
        if (pages) o.add(`: ${pages}`)
        o.add('. ')
      }
      break
    case 'chapter':
      o.add(`${t.in} `).add(s.container ?? '', true)
      if (s.editors?.length) o.add(`, ${t.editedBy} ${editorsText(s.editors, t, 'chicago', settings.lang)}`)
      if (pages) o.add(`, ${pages}`)
      o.add('. ')
      if (place) o.add(`${dot(place)} `)
      break
    case 'web':
      if (s.container) o.add(`${dot(s.container)} `)
      if (d?.month) o.add(`${dot(settings.lang === 'en' ? `${t.months[d.month - 1]}${d.day ? ` ${d.day},` : ''} ${d.year}` : t.date(d.year, d.month, d.day))} `)
      else {
        const accessed = parseDate(s.accessed)
        if (accessed) o.add(`${t.accessed} ${dot(t.date(accessed.year, accessed.month, accessed.day))} `)
      }
      break
    case 'thesis':
      o.add(`${dot([s.genre || t.thesis, s.publisher].filter(Boolean).join(', '))} `)
      break
    case 'report':
      if (s.number) o.add(`${dot(`${t.report} ${s.number}`)} `)
      if (place) o.add(`${dot(place)} `)
      break
    default:
      if (edition) o.add(`${dot(edition)} `)
      if (place) o.add(`${dot(place)} `)
  }
  if (url) o.add(dot(url))
  return trimRuns(o.runs)
}

function trimRuns(runs: Run[]): Run[] {
  const out = runs.map((r) => ({ ...r, text: r.text.replace(/\s{2,}/g, ' ') }))
  if (out.length) out[out.length - 1].text = out[out.length - 1].text.replace(/\s+$/, '')
  if (out.length) out[0].text = out[0].text.replace(/^\s+/, '')
  return out.filter((r) => r.text)
}

// The reference list of the cited sources, sorted.
export function formatBibliography(sources: Source[], settings: CiteSettings): { id: string; runs: Run[] }[] {
  const suffixes = yearSuffixes(sources, settings)
  return sortSources(sources, settings).map((s) => ({ id: s.id, runs: formatReference(s, settings, suffixes) }))
}

// A readable one-line label for lists and pickers.
export function sourceLabel(s: Source): string {
  const people = s.authors.length ? s.authors : (s.editors ?? [])
  const who = people.length ? people.map(familyOf).slice(0, 3).join(', ') + (people.length > 3 ? ' …' : '') : ''
  const year = parseDate(s.date)?.year
  return [who, year && `(${year})`, s.title].filter(Boolean).join(' ')
}

// Citation language from a document language tag ("es-ES" → "es").
export function citeLangOf(tag: unknown): CiteLang {
  const base = String(tag ?? '').slice(0, 2).toLowerCase()
  return (['en', 'es', 'gl', 'fr', 'de'] as CiteLang[]).includes(base as CiteLang) ? (base as CiteLang) : 'en'
}

// Parses "Family, Given" / "Given Family" / "{Organization}" lines into people.
export function parsePeople(text: string): Person[] {
  return text
    .split(/\n|;|\s+and\s+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line): Person => {
      if (/^\{.*\}$/.test(line) || /^=/.test(line)) return { family: line.replace(/^[{=]|\}$/g, '').trim(), org: true }
      const comma = line.indexOf(',')
      if (comma > 0) return { family: line.slice(0, comma).trim(), given: line.slice(comma + 1).trim() || undefined }
      const parts = line.split(/\s+/)
      if (parts.length === 1) return { family: line }
      return { family: parts[parts.length - 1], given: parts.slice(0, -1).join(' ') }
    })
}

export function peopleText(people: Person[] | undefined): string {
  return (people ?? []).map((p) => (p.org ? `{${p.family}}` : p.given ? `${p.family}, ${p.given}` : p.family)).join('\n')
}
