// Spanish: article–noun agreement for a curated list of nouns, queísmo,
// laísmo, "le lo" → "se lo" and two style notes ("en base a", "a nivel de").

import type { Issue } from '../types'
import { after, before, capitalizedMidSentence, matchCase, patternRule, w, type Rule } from './util'

type Found = Omit<Issue, 'kind' | 'rule'>
type Gender = 'm' | 'f'
type Num = 's' | 'p'

// Nouns whose gender is often mistaken (Greek -ma nouns, -aje nouns, and
// nouns whose Galician counterpart has the other gender: "o leite", "a árbore").
// "v": also a verb form, so "la" / "los" before it may be a pronoun ("que la tema").
const NOUNS: [string, string | null, Gender, boolean?][] = [
  ['problema', 'problemas', 'm'], ['sistema', 'sistemas', 'm'], ['idioma', 'idiomas', 'm'], ['clima', 'climas', 'm'],
  ['poema', 'poemas', 'm'], ['dilema', 'dilemas', 'm'], ['esquema', 'esquemas', 'm'], ['drama', 'dramas', 'm'],
  ['día', 'días', 'm'], ['planeta', 'planetas', 'm'], ['síntoma', 'síntomas', 'm'], ['sofá', 'sofás', 'm'],
  ['tranvía', 'tranvías', 'm'], ['teorema', 'teoremas', 'm'], ['mapa', 'mapas', 'm'], ['crucigrama', 'crucigramas', 'm'],
  ['enigma', 'enigmas', 'm'], ['emblema', 'emblemas', 'm'], ['aroma', 'aromas', 'm'], ['fonema', 'fonemas', 'm'],
  ['morfema', 'morfemas', 'm'], ['lexema', 'lexemas', 'm'], ['trauma', 'traumas', 'm'], ['prisma', 'prismas', 'm'],
  ['panorama', 'panoramas', 'm'], ['telegrama', 'telegramas', 'm'], ['holograma', 'hologramas', 'm'], ['organigrama', 'organigramas', 'm'],
  ['tema', 'temas', 'm', true], ['programa', 'programas', 'm', true], ['diagrama', 'diagramas', 'm', true],
  ['aprendizaje', 'aprendizajes', 'm'], ['viaje', 'viajes', 'm'], ['paisaje', 'paisajes', 'm'], ['mensaje', 'mensajes', 'm'],
  ['lenguaje', 'lenguajes', 'm'], ['personaje', 'personajes', 'm'], ['garaje', 'garajes', 'm'], ['homenaje', 'homenajes', 'm'],
  ['equipaje', 'equipajes', 'm'], ['porcentaje', 'porcentajes', 'm'], ['aterrizaje', 'aterrizajes', 'm'], ['tatuaje', 'tatuajes', 'm'],
  ['oleaje', 'oleajes', 'm'], ['peaje', 'peajes', 'm'], ['reportaje', 'reportajes', 'm'], ['maquillaje', 'maquillajes', 'm'],
  ['árbol', 'árboles', 'm'], ['dolor', 'dolores', 'm'], ['color', 'colores', 'm'], ['origen', 'orígenes', 'm'],
  ['mano', 'manos', 'f'], ['foto', 'fotos', 'f'], ['moto', 'motos', 'f'], ['gente', 'gentes', 'f'], ['clase', 'clases', 'f'],
  ['calle', 'calles', 'f', true], ['noche', 'noches', 'f'], ['leche', 'leches', 'f'], ['nariz', 'narices', 'f'], ['nube', 'nubes', 'f'],
  ['sangre', null, 'f'], ['carne', 'carnes', 'f'], ['llave', 'llaves', 'f'], ['frase', 'frases', 'f'], ['flor', 'flores', 'f'],
  ['piel', 'pieles', 'f'], ['miel', null, 'f'], ['pared', 'paredes', 'f'], ['ciudad', 'ciudades', 'f'], ['vez', 'veces', 'f'],
  ['voz', 'voces', 'f'], ['luz', 'luces', 'f'], ['cruz', 'cruces', 'f'], ['paz', null, 'f'], ['raíz', 'raíces', 'f'], ['tos', null, 'f'],
  ['costumbre', 'costumbres', 'f'], ['muerte', 'muertes', 'f'], ['suerte', 'suertes', 'f'], ['torre', 'torres', 'f'],
  ['nieve', 'nieves', 'f'], ['fiebre', 'fiebres', 'f'], ['razón', 'razones', 'f'], ['imagen', 'imágenes', 'f'], ['ley', 'leyes', 'f'],
  ['sal', null, 'f'], ['cárcel', 'cárceles', 'f'], ['catedral', 'catedrales', 'f'], ['señal', 'señales', 'f'],
  ['crisis', null, 'f'], ['tesis', null, 'f'], ['hipótesis', null, 'f'], ['síntesis', null, 'f'], ['dosis', null, 'f'],
]

interface Entry {
  g: Gender
  // null: the same form in singular and plural ("crisis").
  n: Num | null
  verb: boolean
}

const LEXICON = new Map<string, Entry>()
for (const [sing, plural, g, verb = false] of NOUNS) {
  LEXICON.set(sing, { g, n: plural ? 's' : null, verb })
  if (plural) LEXICON.set(plural, { g, n: 'p', verb })
}

// Known nouns, and the always feminine -ción, -sión, -dad, -tad, -tud.
function lookup(noun: string): Entry | null {
  const lower = noun.toLowerCase()
  const known = LEXICON.get(lower)
  if (known) return known
  if (/^\p{L}{2,}(?:ción|sión|dad|tad|tud)$/u.test(lower)) return { g: 'f', n: 's', verb: false }
  if (/^\p{L}{2,}(?:ciones|siones|dades|tades|tudes)$/u.test(lower)) return { g: 'f', n: 'p', verb: false }
  return null
}

type Forms = Record<`${Gender}${Num}`, string>
const DETERMINERS = new Map<string, { g: Gender; n: Num; forms: Forms }>()
for (const [ms, fs, mp, fp] of [
  ['el', 'la', 'los', 'las'],
  ['un', 'una', 'unos', 'unas'],
  ['este', 'esta', 'estos', 'estas'],
  ['ese', 'esa', 'esos', 'esas'],
  ['aquel', 'aquella', 'aquellos', 'aquellas'],
  ['del', 'de la', 'de los', 'de las'],
  ['al', 'a la', 'a los', 'a las'],
]) {
  const forms: Forms = { ms, fs, mp, fp }
  for (const [key, form] of Object.entries(forms)) if (!form.includes(' ')) DETERMINERS.set(form, { g: key[0] as Gender, n: key[1] as Num, forms })
}

// Feminine nouns starting with stressed a take "el" / "un" but "esta" / "esa".
const STRESSED_A = 'agua|aula|alma|área|hambre|águila|hacha|hada|asma|arpa|ave|haba'

export const esAgreement: Rule = {
  id: 'es-agreement',
  langs: ['es'],
  category: 'grammar',
  kind: 'grammar',
  check(text) {
    const out: Found[] = []
    const re = /(?<![\p{L}'’-])(el|la|los|las|un|una|unos|unas|este|esta|estos|estas|ese|esa|esos|esas|aquel|aquella|aquellos|aquellas|del|al) (\p{L}+)(?![\p{L}'’-])/giu
    for (const m of text.matchAll(re)) {
      const [whole, det, noun] = m
      const d = DETERMINERS.get(det.toLowerCase())
      const e = lookup(noun)
      if (!d || !e) continue
      // Names ("la Mano Negra"), "mano a mano", and pronouns before verbs ("que la tema").
      if (capitalizedMidSentence(noun, text.slice(0, m.index + det.length + 1)) || (noun[0] !== noun[0].toLowerCase() && det[0] === det[0].toLowerCase())) continue
      if (/^ a /iu.test(text.slice(m.index + whole.length)) && /^mano$/i.test(noun)) continue
      if (e.verb && /^(?:la|las|los)$/i.test(det)) continue
      const n = e.n ?? d.n
      if (d.g === e.g && d.n === n) continue
      const fixed = d.forms[`${e.g}${n}`]
      const fix = matchCase(det, fixed)
      out.push({ from: m.index, to: m.index + whole.length, replacements: [`${fix} ${noun}`], vars: { word: whole, fix: `${fix} ${noun}` } })
    }
    for (const m of text.matchAll(new RegExp(`(?<![\\p{L}'’-])(la|este|ese|aquel) (${STRESSED_A})(?![\\p{L}'’-])`, 'giu'))) {
      if (capitalizedMidSentence(m[2], text.slice(0, m.index + m[1].length + 1))) continue
      const fixed = { la: 'el', este: 'esta', ese: 'esa', aquel: 'aquella' }[m[1].toLowerCase()]!
      const fix = `${matchCase(m[1], fixed)} ${m[2]}`
      out.push({ from: m.index, to: m.index + m[0].length, replacements: [fix], vars: { word: m[0], fix } })
    }
    return out
  },
}

// Verbs and phrases that take "de que" ("me acuerdo de que", "a pesar de que").
export const esQueismo: Rule = {
  id: 'es-queismo',
  langs: ['es'],
  category: 'grammar',
  kind: 'grammar',
  check: patternRule([
    // Not "se acordó que" (= it was agreed that).
    { re: w('(me acuerdo|te acuerdas|nos acordamos|os acordáis|me acordé|te acordaste|nos acordamos|me acordaba|te acordabas|nos acordábamos) que'), fix: (m) => [`${m[1]} de que`] },
    { re: w('((?:me|te|se|nos|os) (?:di|diste|dio|dimos|disteis|dieron|doy|das|da|damos|dais|dan|daba|dabas|daban|daré|darás|dará)) cuenta que'), fix: (m) => [`${m[1]} cuenta de que`] },
    { re: w('((?:me|te|se|nos|os) (?:enteré|enteraste|enteró|enteramos|enterasteis|enteraron|entero|enteras|entera|enteran)) que'), fix: (m) => [`${m[1]} de que`] },
    { re: w('(me alegro|te alegras|se alegra|nos alegramos|os alegráis|se alegran|me alegré|te alegraste|se alegró|se alegraron) que'), fix: (m) => [`${m[1]} de que`] },
    { re: w('((?:me|te|se|nos|os) (?:olvidé|olvidaste|olvidó|olvidamos|olvidaron|olvido|olvidas|olvida)) que'), fix: (m) => [`${m[1]} de que`] },
    { re: w('((?:estoy|estás|está|estamos|estáis|están|estaba|estabas|estaban|estaré|estarás|estará|estoy muy|está muy) (?:seguro|segura|seguros|seguras|convencido|convencida|convencidos|convencidas)) que'), fix: (m) => [`${m[1]} de que`] },
    { re: w('(a pesar|a fin|en caso|no cabe duda|no hay duda|se trata|con el fin) que'), fix: (m) => [`${m[1]} de que`] },
  ]),
}

// Laísmo: "la" / "las" as the indirect object of verbs of saying and giving.
export const esLaismo: Rule = {
  id: 'es-laismo',
  langs: ['es'],
  category: 'grammar',
  kind: 'grammar',
  check: patternRule([
    {
      re: w('(la|las) ((?:dije|dijo|dijimos|dijeron|dijiste|dice|dicen|decía|decían|diré|dirá|conté|contó|contamos|contaron|expliqué|explicó|explicamos|explicaron|pedí|pidió|pedimos|pidieron|mandé|mandó|ordené|ordenó|aconsejé|aconsejó|recomendé|recomendó) que)'),
      fix: (m) => [`${m[1].length === 2 ? 'le' : 'les'} ${m[2]}`],
    },
    {
      re: w('(la|las) ((?:pregunté|preguntó|preguntamos|preguntaron|preguntaste) (?:si|qué|por qué|cómo|dónde|cuándo|quién|cuál))'),
      fix: (m) => [`${m[1].length === 2 ? 'le' : 'les'} ${m[2]}`],
    },
    {
      re: w('(la|las) ((?:di|dio|dimos|dieron|diste|daba|daban|doy|regalé|regaló|regalamos|regalaron|compré|compró|envié|envió|mandé|mandó|enseñé|enseñó|pedí|pidió) (?:un|una|unos|unas|mi|mis|tu|tus|su|sus|dos|tres))'),
      fix: (m) => [`${m[1].length === 2 ? 'le' : 'les'} ${m[2]}`],
      unless: (m, text) => /(?:^|[^\p{L}])(?:a|de|en|con|por|para|toda|todas)\s*$/iu.test(before(m, text)),
    },
  ]),
}

// "le lo" / "les la": the indirect object pronoun is "se" before lo, la, los, las.
export const esCliticSe: Rule = {
  id: 'es-le-lo',
  langs: ['es'],
  category: 'grammar',
  kind: 'grammar',
  check: patternRule([{ re: w('(le|les) (lo|la|los|las)(?= \\p{L})'), fix: (m) => [`se ${m[2]}`], unless: (m, text) => /^ (?:que|de|del|cual|cuales)(?![\p{L}])/iu.test(after(m, text)) }]),
}

export const esStyle: Rule = {
  id: 'es-en-base-a',
  langs: ['es'],
  category: 'style',
  kind: 'style',
  check: patternRule([{ re: w('en base a'), fix: () => ['con base en', 'sobre la base de', 'según'] }]),
}

// "a nivel de" is right for levels ("a nivel del mar"); elsewhere it is jargon
// (optional advice: schools often use it for "a nivel de centro").
export const esNivel: Rule = {
  id: 'es-a-nivel-de',
  langs: ['es'],
  category: 'style',
  kind: 'style',
  optional: true,
  check: patternRule([
    {
      re: w('a nivel (?:de|del)'),
      fix: () => ['en cuanto a', 'en el ámbito de'],
      unless: (m, text) => /^\s+(?:la |los |las |el )?(?:mar|suelo|calle|agua|superficie|ojos|rodilla|rodillas|cintura|pecho|hombros|tierra|techo|piso|planta|mesa)(?![\p{L}])/iu.test(after(m, text)),
    },
  ]),
}

export const esGrammarRules: Rule[] = [esAgreement, esQueismo, esLaismo, esCliticSe, esStyle, esNivel]
