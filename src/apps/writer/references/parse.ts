// Source import: BibTeX (.bib), RIS (.ris) and CSL-JSON (Zotero, Mendeley).

import { newSourceId, type Person, type Source, type SourceType } from './types'

export function parseSources(text: string, name = ''): Source[] {
  const trimmed = text.trim()
  if (/\.ris$/i.test(name) || /^TY {2}- /m.test(trimmed)) return parseRis(trimmed)
  if (/^[[{]/.test(trimmed) && !/^@/.test(trimmed)) {
    try {
      const json = JSON.parse(trimmed)
      return (Array.isArray(json) ? json : [json]).map(fromCsl).filter((s): s is Source => !!s)
    } catch {
      // Not JSON: try BibTeX.
    }
  }
  return parseBibtex(trimmed)
}

// ---------- BibTeX ----------

const LATEX_ACCENTS: Record<string, string> = { "'": '́', '`': '̀', '^': '̂', '"': '̈', '~': '̃', '=': '̄', '.': '̇', c: '̧', v: '̌', u: '̆', H: '̋', k: '̨' }
const LATEX_SYMBOLS: Record<string, string> = { ss: 'ß', o: 'ø', O: 'Ø', ae: 'æ', AE: 'Æ', oe: 'œ', OE: 'Œ', aa: 'å', AA: 'Å', l: 'ł', L: 'Ł', i: 'ı', '&': '&', '%': '%', $: '$', _: '_', '#': '#' }

export function latexToText(s: string): string {
  let out = s
    .replace(/\\([`'^"~=.])\s*\{?\\?([A-Za-z])\}?/g, (_m, acc: string, ch: string) => (ch + LATEX_ACCENTS[acc]).normalize('NFC'))
    .replace(/\\([cvuHk])\s*\{?([A-Za-z])\}?/g, (_m, acc: string, ch: string) => (ch + LATEX_ACCENTS[acc]).normalize('NFC'))
    .replace(/\\(ss|ae|AE|oe|OE|aa|AA|o|O|l|L|i)(?![A-Za-z])\s?/g, (_m, sym: string) => LATEX_SYMBOLS[sym])
    .replace(/\\([&%$_#])/g, '$1')
    .replace(/\\(?:textit|emph|textbf|textsc|mbox|url)\{([^{}]*)\}/g, '$1')
    .replace(/---/g, '—')
    .replace(/--/g, '–')
    .replace(/~/g, ' ')
  out = out.replace(/[{}]/g, '')
  return out.replace(/\s+/g, ' ').trim()
}

function bibFields(body: string): Record<string, string> {
  const fields: Record<string, string> = {}
  let i = 0
  const skip = () => {
    while (i < body.length && /[\s,]/.test(body[i])) i++
  }
  while (i < body.length) {
    skip()
    const m = /^([A-Za-z][\w-]*)\s*=\s*/.exec(body.slice(i))
    if (!m) break
    i += m[0].length
    let value = ''
    // Values: {…} with nesting, "…", numbers or macros joined with #.
    for (;;) {
      if (body[i] === '{') {
        let depth = 0
        const start = i
        for (; i < body.length; i++) {
          if (body[i] === '{') depth++
          else if (body[i] === '}' && --depth === 0) break
        }
        value += body.slice(start + 1, i)
        i++
      } else if (body[i] === '"') {
        const start = ++i
        let depth = 0
        for (; i < body.length; i++) {
          if (body[i] === '{') depth++
          else if (body[i] === '}') depth--
          else if (body[i] === '"' && depth === 0) break
        }
        value += body.slice(start, i)
        i++
      } else {
        const w = /^[\w.:-]+/.exec(body.slice(i))
        if (w) {
          value += w[0]
          i += w[0].length
        }
      }
      while (i < body.length && /\s/.test(body[i])) i++
      if (body[i] === '#') {
        i++
        while (i < body.length && /\s/.test(body[i])) i++
        continue
      }
      break
    }
    fields[m[1].toLowerCase()] = value
  }
  return fields
}

function bibPeople(value: string | undefined): Person[] {
  if (!value) return []
  return value
    .split(/\s+and\s+/i)
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw): Person => {
      // {Organization Name} stays one family name.
      if (/^\{.*\}$/.test(raw)) return { family: latexToText(raw), org: true }
      const parts = raw.split(',').map((p) => p.trim())
      if (parts.length >= 2) return { family: latexToText(parts[0]), given: latexToText(parts.slice(1).join(' ')) || undefined }
      const words = latexToText(raw).split(' ')
      if (words.length === 1) return { family: words[0] }
      // "Ludwig van Beethoven": lowercase particles belong to the family name.
      let k = words.length - 1
      while (k > 1 && /^[a-z]/.test(words[k - 1])) k--
      return { family: words.slice(k).join(' '), given: words.slice(0, k).join(' ') }
    })
}

const BIB_TYPES: Record<string, SourceType> = {
  book: 'book',
  booklet: 'book',
  manual: 'book',
  proceedings: 'book',
  inbook: 'chapter',
  incollection: 'chapter',
  inproceedings: 'chapter',
  conference: 'chapter',
  article: 'article',
  techreport: 'report',
  report: 'report',
  phdthesis: 'thesis',
  mastersthesis: 'thesis',
  thesis: 'thesis',
  online: 'web',
  electronic: 'web',
  www: 'web',
  webpage: 'web',
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

function bibDate(f: Record<string, string>): string | undefined {
  if (f.date) return f.date.trim()
  if (!f.year) return undefined
  const m = f.month ? (Number(f.month) || MONTHS.indexOf(f.month.toLowerCase().slice(0, 3)) + 1) : 0
  return m > 0 ? `${f.year.trim()}-${String(m).padStart(2, '0')}` : f.year.trim()
}

export function parseBibtex(text: string): Source[] {
  const out: Source[] = []
  const re = /@(\w+)\s*[{(]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const kind = m[1].toLowerCase()
    // The entry ends at the matching brace.
    let depth = 1
    let i = re.lastIndex
    for (; i < text.length && depth > 0; i++) {
      if (text[i] === '{' || text[i] === '(') depth++
      else if (text[i] === '}' || text[i] === ')') depth--
    }
    const body = text.slice(re.lastIndex, i - 1)
    re.lastIndex = i
    if (kind === 'comment' || kind === 'string' || kind === 'preamble') continue
    const comma = body.indexOf(',')
    const key = comma > 0 ? body.slice(0, comma).trim() : ''
    const f = bibFields(comma > 0 ? body.slice(comma + 1) : body)
    const tx = (k: string) => (f[k] ? latexToText(f[k]) : undefined)
    let type: SourceType = BIB_TYPES[kind] ?? (f.url ? 'web' : 'other')
    if (kind === 'misc' && f.url && !f.publisher) type = 'web'
    const source: Source = {
      id: newSourceId(),
      key: key || undefined,
      type,
      authors: bibPeople(f.author),
      editors: bibPeople(f.editor),
      title: tx('title') ?? '',
      container: tx('journal') ?? tx('journaltitle') ?? tx('booktitle') ?? tx('series') ?? (type === 'web' ? tx('organization') ?? tx('howpublished') : undefined),
      date: bibDate(f),
      publisher: tx('publisher') ?? tx('school') ?? tx('institution') ?? tx('organization'),
      place: tx('address') ?? tx('location'),
      edition: tx('edition'),
      volume: tx('volume'),
      issue: tx('number') && type !== 'report' ? tx('number') : tx('issue'),
      pages: tx('pages'),
      number: type === 'report' ? tx('number') : undefined,
      genre: kind === 'mastersthesis' ? tx('type') ?? "Master's thesis" : tx('type'),
      url: f.url?.trim() || undefined,
      doi: f.doi?.trim() || undefined,
      accessed: tx('urldate'),
    }
    out.push(clean(source))
  }
  return out
}

// ---------- RIS ----------

const RIS_TYPES: Record<string, SourceType> = {
  BOOK: 'book',
  EBOOK: 'book',
  EDBOOK: 'book',
  CHAP: 'chapter',
  ECHAP: 'chapter',
  CPAPER: 'chapter',
  JOUR: 'article',
  EJOUR: 'article',
  MGZN: 'article',
  NEWS: 'article',
  ELEC: 'web',
  WEB: 'web',
  BLOG: 'web',
  RPRT: 'report',
  GOVDOC: 'report',
  THES: 'thesis',
}

function risPerson(value: string): Person {
  const [family, given] = value.split(',').map((p) => p.trim())
  return given ? { family, given } : { family }
}

export function parseRis(text: string): Source[] {
  const out: Source[] = []
  let cur: Record<string, string[]> | null = null
  const finish = () => {
    if (!cur) return
    const g = (...tags: string[]) => tags.map((tag) => cur![tag]?.[0]).find(Boolean)?.trim()
    const type = RIS_TYPES[g('TY') ?? ''] ?? 'other'
    const sp = g('SP')
    const ep = g('EP')
    const date = g('PY', 'Y1', 'DA')?.replace(/\//g, '-').replace(/-+$/, '')
    out.push(
      clean({
        id: newSourceId(),
        key: g('ID'),
        type,
        authors: [...(cur.AU ?? []), ...(cur.A1 ?? [])].map(risPerson),
        editors: [...(cur.ED ?? []), ...(cur.A2 ?? [])].filter(() => type === 'chapter').map(risPerson),
        title: g('TI', 'T1', 'CT') ?? '',
        container: g('JO', 'JF', 'T2', 'BT', 'JA'),
        date: date?.match(/^\d{4}(-\d{1,2}(-\d{1,2})?)?/)?.[0],
        publisher: g('PB'),
        place: g('CY', 'PP'),
        edition: g('ET'),
        volume: g('VL'),
        issue: type === 'report' ? undefined : g('IS'),
        number: type === 'report' ? g('IS', 'SN') : undefined,
        pages: sp && ep ? `${sp}–${ep}` : sp,
        url: g('UR', 'L2'),
        doi: g('DO'),
        genre: type === 'thesis' ? g('M3') : undefined,
        accessed: g('Y2')?.replace(/\//g, '-'),
      }),
    )
    cur = null
  }
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Z][A-Z0-9])  -( (.*))?$/.exec(line)
    if (!m) continue
    const [, tag, , value = ''] = m
    if (tag === 'TY') {
      finish()
      cur = { TY: [value] }
    } else if (tag === 'ER') finish()
    else if (cur) (cur[tag] ??= []).push(value)
  }
  finish()
  return out
}

// ---------- CSL-JSON (Zotero / Mendeley fields in Word files) ----------

const CSL_TYPES: Record<string, SourceType> = {
  book: 'book',
  chapter: 'chapter',
  'paper-conference': 'chapter',
  'article-journal': 'article',
  'article-magazine': 'article',
  'article-newspaper': 'article',
  article: 'article',
  webpage: 'web',
  'post-weblog': 'web',
  report: 'report',
  thesis: 'thesis',
}

interface CslName {
  family?: string
  given?: string
  literal?: string
}

export function fromCsl(item: Record<string, any>): Source | null {
  if (!item || typeof item !== 'object') return null
  const people = (list: CslName[] | undefined): Person[] =>
    (list ?? []).map((n) => (n.literal ? { family: n.literal, org: true } : { family: n.family ?? '', given: n.given || undefined })).filter((p) => p.family)
  const parts = (d: any): string | undefined => {
    const p = d?.['date-parts']?.[0]
    if (Array.isArray(p) && p.length) return p.map((v: number, i: number) => (i ? String(v).padStart(2, '0') : String(v))).join('-')
    return d?.raw ?? d?.literal
  }
  const type = CSL_TYPES[item.type] ?? 'other'
  return clean({
    id: newSourceId(),
    key: typeof item.id === 'string' ? item.id : item['citation-key'],
    type,
    authors: people(item.author),
    editors: people(item.editor),
    title: String(item.title ?? ''),
    container: item['container-title'],
    date: parts(item.issued),
    publisher: item.publisher,
    place: item['publisher-place'],
    edition: item.edition != null ? String(item.edition) : undefined,
    volume: item.volume != null ? String(item.volume) : undefined,
    issue: item.issue != null ? String(item.issue) : undefined,
    pages: item.page,
    number: type === 'report' ? item.number : undefined,
    genre: item.genre,
    url: item.URL,
    doi: item.DOI,
    accessed: parts(item.accessed),
  })
}

// Drops empty optional fields.
export function clean(s: Source): Source {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(s)) {
    if (v === undefined || v === null || v === '') continue
    if (Array.isArray(v) && !v.length && k !== 'authors') continue
    out[k] = typeof v === 'string' ? v.trim() : v
  }
  return out as unknown as Source
}

// BibTeX export of the sources (Manage sources ▸ Export).
export function toBibtex(sources: Source[]): string {
  const kind: Record<SourceType, string> = { book: 'book', chapter: 'incollection', article: 'article', web: 'online', report: 'techreport', thesis: 'phdthesis', other: 'misc' }
  const names = (people: Person[] | undefined) => (people ?? []).map((p) => (p.org ? `{${p.family}}` : p.given ? `${p.family}, ${p.given}` : p.family)).join(' and ')
  return sources
    .map((s) => {
      const year = s.date?.slice(0, 4)
      const fields: [string, string | undefined][] = [
        ['author', names(s.authors)],
        ['editor', names(s.editors)],
        ['title', s.title],
        [s.type === 'article' ? 'journal' : s.type === 'web' ? 'organization' : 'booktitle', s.container],
        ['year', year],
        ['date', s.date],
        ['publisher', s.type === 'thesis' ? undefined : s.publisher],
        ['school', s.type === 'thesis' ? s.publisher : undefined],
        ['address', s.place],
        ['edition', s.edition],
        ['volume', s.volume],
        ['number', s.issue ?? s.number],
        ['pages', s.pages],
        ['url', s.url],
        ['doi', s.doi],
        ['urldate', s.accessed],
      ]
      const key = s.key || s.id
      return `@${kind[s.type]}{${key},\n${fields
        .filter(([, v]) => v)
        .map(([k, v]) => `  ${k} = {${v}}`)
        .join(',\n')}\n}`
    })
    .join('\n\n')
}
