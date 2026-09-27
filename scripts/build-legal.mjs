// Builds the legal pages from docs/legal/<lang>/*.md and legal.config.json:
//   public/legal/<lang>/<page>.html   one page per document and language (+ index.html)
//   public/legal/index.html           opens the index in the interface language
//   public/legal/licenses.html        THIRD_PARTY_NOTICES.md (scripts/third-party-notices.mjs)
//   public/.well-known/security.txt   RFC 9116, from the "security" settings
// Static HTML, so the service worker precaches them and they work offline.
//
// In the Markdown, {{key}} is a value of legal.config.json (dotted path);
// {{#if key}} … {{else}} … {{/if}} and {{#if key=value}} keep text conditionally.
// Empty values are shown as highlighted placeholders and listed on the console;
// LEGAL_STRICT=1 makes them an error (use it for the production build).

import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const src = join(root, 'docs/legal')
const out = join(root, 'public/legal')
const strict = process.env.LEGAL_STRICT === '1'
const config = JSON.parse(readFileSync(join(root, 'legal.config.json'), 'utf8'))

export const LANGS = ['es', 'gl', 'en', 'fr', 'de']
export const PAGES = ['notice', 'privacy', 'cookies', 'terms', 'accessibility', 'schools', 'ai']

// Page frame per language.
const UI = {
  es: { name: 'Español', legal: 'Información legal', back: 'Volver a {site}', toc: 'Contenido', licenses: 'Licencias de software de terceros', licensesNote: 'Textos de licencia en su idioma original (inglés).', updated: 'Última actualización', skip: 'Saltar al contenido', langs: 'Idioma', draft: 'Borrador: faltan datos del titular (resaltados). Este texto no debe publicarse hasta completarlos.', intro: 'Textos legales de {site}. La versión en español es la versión de referencia.', translation: '' },
  gl: { name: 'Galego', legal: 'Información legal', back: 'Volver a {site}', toc: 'Contido', licenses: 'Licenzas de software de terceiros', licensesNote: 'Textos de licenza no seu idioma orixinal (inglés).', updated: 'Última actualización', skip: 'Saltar ao contido', langs: 'Idioma', draft: 'Borrador: faltan datos do titular (resaltados). Este texto non debe publicarse ata completalos.', intro: 'Textos legais de {site}.', translation: 'Tradución informativa. En caso de discrepancia prevalece a <a href="../es/{page}.html" hreflang="es">versión en español</a>.' },
  en: { name: 'English', legal: 'Legal information', back: 'Back to {site}', toc: 'Contents', licenses: 'Third-party software licenses', licensesNote: 'License texts in their original language.', updated: 'Last updated', skip: 'Skip to content', langs: 'Language', draft: 'Draft: the owner’s details are missing (highlighted). Do not publish this text until they are completed.', intro: 'Legal texts of {site}.', translation: 'Translation for information purposes. In case of discrepancy, the <a href="../es/{page}.html" hreflang="es">Spanish version</a> prevails.' },
  fr: { name: 'Français', legal: 'Informations légales', back: 'Retour à {site}', toc: 'Sommaire', licenses: 'Licences des logiciels tiers', licensesNote: 'Textes de licence dans leur langue d’origine (anglais).', updated: 'Dernière mise à jour', skip: 'Aller au contenu', langs: 'Langue', draft: 'Brouillon : il manque les données du titulaire (surlignées). Ce texte ne doit pas être publié avant qu’elles soient complétées.', intro: 'Textes juridiques de {site}.', translation: 'Traduction à titre informatif. En cas de divergence, la <a href="../es/{page}.html" hreflang="es">version espagnole</a> fait foi.' },
  de: { name: 'Deutsch', legal: 'Rechtliche Hinweise', back: 'Zurück zu {site}', toc: 'Inhalt', licenses: 'Lizenzen von Drittanbieter-Software', licensesNote: 'Lizenztexte in ihrer Originalsprache (Englisch).', updated: 'Zuletzt aktualisiert', skip: 'Zum Inhalt springen', langs: 'Sprache', draft: 'Entwurf: Angaben des Inhabers fehlen (markiert). Dieser Text darf erst veröffentlicht werden, wenn sie ergänzt sind.', intro: 'Rechtstexte von {site}.', translation: 'Übersetzung zu Informationszwecken. Bei Abweichungen ist die <a href="../es/{page}.html" hreflang="es">spanische Fassung</a> maßgeblich.' },
}

// What each placeholder stands for, shown while it is empty.
const LABELS = {
  'owner.name': ['titular (nombre o razón social)', 'titular (nome ou razón social)', 'owner (name or company name)', 'titulaire (nom ou raison sociale)', 'Inhaber (Name oder Firma)'],
  'owner.nif': ['NIF/CIF', 'NIF/CIF', 'tax ID (NIF/CIF)', 'n° d’identification fiscale (NIF/CIF)', 'Steuer-ID (NIF/CIF)'],
  'owner.address': ['domicilio', 'domicilio', 'address', 'adresse', 'Anschrift'],
  'owner.email': ['correo electrónico de contacto', 'correo electrónico de contacto', 'contact email', 'e-mail de contact', 'Kontakt-E-Mail'],
  'owner.phone': ['teléfono (opcional)', 'teléfono (opcional)', 'phone (optional)', 'téléphone (facultatif)', 'Telefon (optional)'],
  'owner.registry': ['datos registrales, si procede', 'datos rexistrais, se procede', 'registry details, if any', 'données d’immatriculation, le cas échéant', 'Registerangaben, falls vorhanden'],
  'dpo.name': ['Delegado de Protección de Datos', 'Delegado de Protección de Datos', 'Data Protection Officer', 'délégué à la protection des données', 'Datenschutzbeauftragter'],
  'dpo.email': ['correo del DPD', 'correo do DPD', 'DPO email', 'e-mail du DPD', 'E-Mail des DSB'],
  privacyEmail: ['correo para ejercer derechos', 'correo para exercer dereitos', 'email for data protection requests', 'e-mail pour exercer vos droits', 'E-Mail für Betroffenenanfragen'],
  jurisdiction: ['juzgados y tribunales competentes', 'xulgados e tribunais competentes', 'competent courts', 'tribunaux compétents', 'zuständige Gerichte'],
  siteUrl: ['dirección del sitio', 'enderezo do sitio', 'site address', 'adresse du site', 'Adresse der Website'],
  lastUpdated: ['fecha', 'data', 'date', 'date', 'Datum'],
  'accessibility.preparedOn': ['fecha de la declaración', 'data da declaración', 'date of the statement', 'date de la déclaration', 'Datum der Erklärung'],
  'accessibility.reviewedOn': ['fecha de la última revisión', 'data da última revisión', 'date of the last review', 'date du dernier réexamen', 'Datum der letzten Überprüfung'],
  'accessibility.method': ['método de evaluación', 'método de avaliación', 'assessment method', 'méthode d’évaluation', 'Bewertungsmethode'],
  'accessibility.contactEmail': ['correo de accesibilidad', 'correo de accesibilidade', 'accessibility email', 'e-mail accessibilité', 'E-Mail für Barrierefreiheit'],
  'accessibility.complaintBody': ['órgano competente para reclamaciones', 'órgano competente para reclamacións', 'body handling complaints', 'organisme compétent pour les réclamations', 'zuständige Beschwerdestelle'],
}

// Values that fall back to another one when empty.
const FALLBACK = { privacyEmail: 'owner.email', 'accessibility.contactEmail': 'owner.email' }
const LOCALES = { es: 'es-ES', gl: 'gl-ES', en: 'en-GB', fr: 'fr-FR', de: 'de-DE' }
// A value may be one per language ({ "es": …, "en": … }); ISO dates are written out in the page's language.
const get = (key, lang = 'es') => {
  let v = key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), config)
  if (v && typeof v === 'object') v = v[lang] ?? v.es ?? v.en
  const s = v == null ? '' : String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T12:00:00Z`).toLocaleDateString(LOCALES[lang], { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  return s || (FALLBACK[key] ? get(FALLBACK[key], lang) : '')
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/<[^>]+>/g, '').replace(/&\w+;/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// {{#if}} blocks (not nested), before anything else.
function conditionals(text) {
  return text.replace(/\{\{#if ([\w.]+)(?:=([\w-]+))?\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g, (_, key, value, yes, no = '') => {
    const v = get(key)
    return (value === undefined ? !!v : v === value) ? yes : no
  })
}

// French typography: no-break space before a colon and inside « », narrow one before ; ! ? (not in code blocks).
function typography(lang, text) {
  if (lang !== 'fr') return text
  let code = false
  return text
    .split('\n')
    .map((line) => {
      if (/^(```|~~~)/.test(line)) code = !code
      if (code) return line
      return line.replace(/ :(?=\s|$)/g, '\u00a0:').replace(/ ([;!?])(?=\s|$)/g, '\u202f$1').replace(/« /g, '«\u00a0').replace(/ »/g, '\u00a0»')
    })
    .join('\n')
}

// ---------- Markdown (the subset the legal texts use) ----------

function inline(text, ctx) {
  const codes = []
  let s = text.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`)
  s = s.replace(/\\([\\`*_{}[\]()#+\-.!<>|])/g, (_, c) => `\u0001${c.charCodeAt(0)}\u0001`)
  s = esc(s)
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => `<a href="${esc(ctx.link(href.replace(/&amp;/g, '&')))}">${label}</a>`)
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+[^\s<).,;:])/g, (_, pre, url) => `${pre}<a href="${url}">${url}</a>`)
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^\w*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
  s = s.replace(/\{\{([\w.]+)\}\}/g, (_, key) => ctx.value(key))
  s = s.replace(/\u0001(\d+)\u0001/g, (_, n) => esc(String.fromCharCode(+n)))
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[+i]).replace(/\{\{([\w.]+)\}\}/g, (m, key) => ctx.value(key))}</code>`)
}

function markdown(source, ctx) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const html = []
  const headings = []
  let i = 0
  const isBlock = (l) => /^(#{1,4} |```|~~~|> ?|[-*] |\d+\. |\|)/.test(l) || /^---+$/.test(l)
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim() || /^<!--.*-->$/.test(line.trim())) { i++; continue }
    let m
    if ((m = /^(`{3,}|~{3,})/.exec(line))) {
      const fence = m[1]
      const body = []
      for (i++; i < lines.length && !lines[i].startsWith(fence); i++) body.push(lines[i])
      i++
      html.push(`<pre><code>${esc(body.join('\n'))}</code></pre>`)
    } else if ((m = /^(#{1,4}) (.*)$/.exec(line))) {
      const level = m[1].length
      const content = inline(m[2], ctx)
      const id = slug(content)
      if (level === 2) headings.push({ id, content })
      html.push(`<h${level} id="${id}">${content}</h${level}>`)
      i++
    } else if (/^---+$/.test(line)) {
      html.push('<hr>')
      i++
    } else if (/^> ?/.test(line)) {
      const body = []
      for (; i < lines.length && /^> ?/.test(lines[i]); i++) body.push(lines[i].replace(/^> ?/, ''))
      html.push(`<blockquote>${markdown(body.join('\n'), ctx).html}</blockquote>`)
    } else if (/^\|/.test(line) && /^\|?\s*:?-{3,}/.test(lines[i + 1] ?? '')) {
      const cells = (l) => l.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => inline(c.trim(), ctx))
      const head = cells(line)
      const rows = []
      for (i += 2; i < lines.length && /^\|/.test(lines[i]); i++) rows.push(cells(lines[i]))
      html.push(`<table><thead><tr>${head.map((c) => `<th scope="col">${c}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`)
    } else if ((m = /^([-*]|\d+\.) /.exec(line))) {
      const ordered = /\d/.test(m[1])
      const items = []
      while (i < lines.length && (ordered ? /^\d+\. / : /^[-*] /).test(lines[i])) {
        let item = lines[i].replace(/^([-*]|\d+\.) /, '')
        for (i++; i < lines.length && /^ {2,}\S/.test(lines[i]); i++) item += ' ' + lines[i].trim()
        items.push(`<li>${inline(item, ctx)}</li>`)
      }
      html.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`)
    } else {
      const body = []
      for (; i < lines.length && lines[i].trim() && !isBlock(lines[i]); i++) body.push(lines[i].trim())
      html.push(`<p>${inline(body.join(' '), ctx)}</p>`)
    }
  }
  return { html: html.join('\n'), headings }
}

// ---------- Pages ----------

const BRAND = '<svg viewBox="0 0 512 512" width="28" height="28" aria-hidden="true"><circle cx="256" cy="256" r="138" fill="none" stroke="currentColor" stroke-width="76"/></svg>'
// Theme and text size from the suite's accessibility preferences (same origin).
const THEME = `<script>try{var p=JSON.parse(localStorage.getItem('words-online:a11y')||'{}'),t=p.theme==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):p.theme,r=document.documentElement;if(t&&t!=='light')r.setAttribute('data-a11y-theme',t);if(p.zoom)r.style.setProperty('--a11y-ui-zoom',p.zoom/100)}catch(e){}</script>`
const site = get('siteName') || 'Ofimeo'
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m))

function frame({ lang, page, title, body, nav, draft, updated, css = '../' }) {
  const ui = UI[lang]
  const langs = nav
    ? `<ul class="langs" aria-label="${ui.langs}">${LANGS.map((l) => `<li><a href="../${l}/${page}.html" hreflang="${l}" lang="${l}"${l === lang ? ' aria-current="true"' : ''}>${UI[l].name}</a></li>`).join('')}</ul>`
    : ''
  const pages = nav
    ? `<nav class="pages" aria-label="${ui.legal}"><h2>${ui.legal}</h2><ul>${nav.map((n) => `<li><a href="${n.page}.html"${n.page === page ? ' aria-current="page"' : ''}>${n.title}</a></li>`).join('')}<li><a href="../licenses.html">${ui.licenses}</a></li></ul></nav>`
    : ''
  const notes = [
    ui.translation && nav && page !== 'index' ? `<p class="notice translation">${fill(ui.translation, { page })}</p>` : '',
    draft ? `<p class="notice draft" role="note">${ui.draft}</p>` : '',
  ].join('')
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title.replace(/<[^>]+>/g, ''))} · ${esc(site)}</title>
<meta name="robots" content="index, follow">
<link rel="icon" href="${css}../icons/icon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${css}tokens.css">
<link rel="stylesheet" href="${css}legal.css">
${nav && page !== 'index' ? LANGS.map((l) => `<link rel="alternate" hreflang="${l}" href="../${l}/${page}.html">`).join('\n') + '\n' : ''}${THEME}
</head>
<body>
<a class="skip" href="#content">${ui.skip}</a>
<header class="bar">
<a class="brand" href="${css}../">${BRAND}<span>${esc(site)}</span></a>
<a href="${css}../">${fill(ui.back, { site: esc(site) })}</a>
${nav ? '' : `<a href="index.html">${ui.legal}</a>\n`}<span class="spacer"></span>
${langs}
</header>
<div class="layout${nav ? '' : ' single'}">
${pages}
<main id="content" tabindex="-1">
${notes}${body}
</main>
</div>
<footer class="page">${updated ? `${ui.updated}: ${updated}` : ''}</footer>
</body>
</html>
`
}

const missing = new Map() // key -> pages
function context(lang, page) {
  return {
    value(key) {
      const v = get(key, lang)
      if (v) return esc(v)
      if (!missing.has(key)) missing.set(key, new Set())
      missing.get(key).add(`${lang}/${page}`)
      const label = LABELS[key]?.[LANGS.indexOf(lang)] ?? key
      return `<mark class="ph" title="legal.config.json: ${key}">[${esc(label)}]</mark>`
    },
    link(href) {
      if (/^[a-z]+:|^#/.test(href)) return href
      const [path, hash = ''] = href.split('#')
      const name = path.split('/').pop()
      if (name === 'THIRD_PARTY_NOTICES.md') return '../licenses.html'
      if (name.endsWith('.md')) return `${name.replace(/\.md$/, '.html')}${hash ? '#' + hash : ''}`
      return href
    },
  }
}

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
copyFileSync(join(root, 'src/ui/tokens.css'), join(out, 'tokens.css'))
copyFileSync(join(root, 'src/legal/pages.css'), join(out, 'legal.css'))

let pageCount = 0
for (const lang of LANGS) {
  mkdirSync(join(out, lang), { recursive: true })
  const docs = PAGES.map((page) => {
    const file = join(src, lang, `${page}.md`)
    if (!existsSync(file)) throw new Error(`build-legal: missing ${file}`)
    const ctx = context(lang, page)
    const text = typography(lang, conditionals(readFileSync(file, 'utf8')))
    const { html, headings } = markdown(text, ctx)
    const title = (/<h1[^>]*>(.*?)<\/h1>/.exec(html) ?? [, page])[1]
    const lead = (/<p>(.*?)<\/p>/.exec(html) ?? [, ''])[1]
    const draft = [...missing.values()].some((pages) => pages.has(`${lang}/${page}`))
    return { page, title, lead, html, headings, draft }
  })
  const nav = docs.map(({ page, title }) => ({ page, title }))
  const updated = context(lang, 'index').value('lastUpdated')
  for (const d of docs) {
    // A table of contents for the long documents.
    const toc = d.headings.length >= 4 ? `<details class="toc" open><summary>${UI[lang].toc}</summary><ul>${d.headings.map((h) => `<li><a href="#${h.id}">${h.content}</a></li>`).join('')}</ul></details>` : ''
    const body = d.html.replace(/(<\/h1>)/, `$1\n${toc}`)
    writeFileSync(join(out, lang, `${d.page}.html`), frame({ lang, page: d.page, title: d.title, body, nav, draft: d.draft, updated }))
    pageCount++
  }
  const list = docs.map((d) => `<li><a href="${d.page}.html">${d.title}</a><p>${d.lead.replace(/<a [^>]*>|<\/a>/g, '')}</p></li>`).join('')
  const index = `<h1>${UI[lang].legal}</h1><p>${fill(UI[lang].intro, { site: esc(site) })}</p><ul class="index-list">${list}<li><a href="../licenses.html">${UI[lang].licenses}</a><p>${UI[lang].licensesNote}</p></li></ul>`
  writeFileSync(join(out, lang, 'index.html'), frame({ lang, page: 'index', title: UI[lang].legal, body: index, nav, draft: docs.some((d) => d.draft), updated }))
}

// legal/index.html: the index in the interface language (same rule as src/core/i18n.ts).
writeFileSync(
  join(out, 'index.html'),
  `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(site)} · ${UI.es.legal}</title>
<script>(function(){var L=${JSON.stringify(LANGS)},l=null;try{l=localStorage.getItem('words-online:language')}catch(e){}if(L.indexOf(l)<0){l='en';var n=navigator.languages||[navigator.language||'en'];for(var i=0;i<n.length;i++){var c=String(n[i]).toLowerCase().split(/[-_]/)[0];if(c==='gl'){l='gl';break}if(['es','ca','eu','ast','an'].indexOf(c)>=0){l='es';break}if(['fr','de','en'].indexOf(c)>=0){l=c;break}}}location.replace(l+'/index.html'+location.hash)})()</script>
</head>
<body>
<ul>${LANGS.map((l) => `<li><a href="${l}/index.html" hreflang="${l}" lang="${l}">${UI[l].legal} (${UI[l].name})</a></li>`).join('')}</ul>
</body>
</html>
`,
)

// legal/licenses.html from THIRD_PARTY_NOTICES.md (English: the license texts are).
const notices = join(root, 'THIRD_PARTY_NOTICES.md')
if (existsSync(notices)) {
  const { html } = markdown(readFileSync(notices, 'utf8'), { value: (k) => `{{${k}}}`, link: (h) => h })
  const body = `${html}`
  writeFileSync(join(out, 'licenses.html'), frame({ lang: 'en', page: 'licenses', title: 'Third-party notices', body, nav: null, css: '' }))
} else console.warn('build-legal: THIRD_PARTY_NOTICES.md not found; run scripts/third-party-notices.mjs first')

// /.well-known/security.txt (RFC 9116).
{
  const contact = get('security.contact') || (get('owner.email') ? `mailto:${get('owner.email')}` : '')
  const expires = get('security.expires') ? new Date(get('security.expires')) : new Date(Date.now() + 180 * 864e5)
  const base = get('siteUrl').replace(/\/+$/, '')
  const lines = [
    `# security.txt for ${site} (RFC 9116). Generated by scripts/build-legal.mjs from legal.config.json.`,
    contact ? `Contact: ${contact}` : '# Contact: [pending: set security.contact or owner.email in legal.config.json]',
    `Expires: ${expires.toISOString().replace(/\.\d{3}Z$/, 'Z')}`,
    get('security.languages') ? `Preferred-Languages: ${get('security.languages')}` : '',
    base ? `Canonical: ${base}/.well-known/security.txt` : '',
    get('security.policy') ? `Policy: ${get('security.policy')}` : '',
  ].filter(Boolean)
  if (!contact) {
    if (!missing.has('security.contact')) missing.set('security.contact', new Set())
    missing.get('security.contact').add('.well-known/security.txt')
  }
  mkdirSync(join(root, 'public/.well-known'), { recursive: true })
  writeFileSync(join(root, 'public/.well-known/security.txt'), lines.join('\n') + '\n')
}

console.log(`build-legal: ${pageCount} pages in ${LANGS.length} languages → public/legal/, security.txt → public/.well-known/`)
if (missing.size) {
  const msg = `build-legal: ${missing.size} values of legal.config.json are empty (shown as placeholders): ${[...missing.keys()].join(', ')}`
  if (strict) {
    console.error(msg)
    process.exit(1)
  }
  console.warn(msg)
}
