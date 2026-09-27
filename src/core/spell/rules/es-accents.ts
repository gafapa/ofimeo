// Spanish diacritic accents (él/el, tú/tu, mí/mi, sé/se, té/te, más/mas,
// sí/si, aún/aun, está/esta) and accents of question and exclamation words,
// only in contexts where one reading is impossible.

import type { Issue } from '../types'
import { after, before, capitalizedMidSentence, matchCase, patternRule, w, type Pattern, type Rule } from './util'

type Found = Omit<Issue, 'kind' | 'rule'>

// Followed by punctuation (not by the end of the paragraph: the word may still be being typed).
const PUNCT = '(?=\\s*[.,;:!?…)»"”])'

// Closed-class words that are listed or quoted when talking about grammar
// ("los artículos el, la, los"; "do, re, mi"; «tu»): those mentions are skipped.
const CLOSED = 'el|la|lo|los|las|un|una|mi|tu|su|mis|tus|sus|se|te|me|le|si|do|re|fa|sol|él|tú|mí|sé|té|sí|más|mas|aún|aun'
const LISTED_BEFORE = new RegExp(`(?:^|[^\\p{L}])(?:${CLOSED})\\s*(?:,|\\s[yoe])\\s*$`, 'iu')
const LISTED_AFTER = new RegExp(`^\\s*(?:,|\\s[yoe]\\s)\\s*(?:${CLOSED})(?![\\p{L}])`, 'iu')

export function mention(m: RegExpExecArray, text: string): boolean {
  const b = before(m, text)
  const a = after(m, text)
  return /[«"“'‘]\s*$/u.test(b) || /^\s*[»"”'’]/u.test(a) || LISTED_BEFORE.test(b) || LISTED_AFTER.test(a) || /(?:^|[^\p{L}])(?:palabra|pronombre|artículo|posesivo|monosílabo|nota)s?\s*$/iu.test(b)
}

// "Mas" or "Julio" mid-sentence are names.
const named = (m: RegExpExecArray, text: string) => capitalizedMidSentence(m[0], before(m, text))

// A pattern whose match is one word to replace, with context around it given by lookarounds.
const word = (re: RegExp, fix: string, unless?: Pattern['unless']): Pattern => ({
  re,
  fix: () => [fix],
  vars: (m) => ({ word: m[0], fix }),
  unless: (m, text) => mention(m, text) || named(m, text) || !!unless?.(m, text),
})

const EL_VERBS =
  'es|era|fue|será|sería|está|estaba|estuvo|estará|tiene|tenía|tuvo|tendrá|dijo|dice|decía|hizo|hace|hacía|puede|podía|pudo|podrá|' +
  'quiere|quería|quiso|sabe|sabía|supo|vive|vivía|viene|venía|va|iba|ha|había|habrá|habría|cree|creía|piensa|pensaba|llegó|llega|' +
  'estudia|trabaja|trabajaba|juega|hablaba|vio|ve|sigue|necesita|conoce|prefiere|parece|dijera|debía|' +
  'me|se|lo|le|les|los|las|nos|también|tampoco'
const TU_VERBS =
  'eres|estás|tienes|sabes|puedes|quieres|has|vas|dices|crees|piensas|haces|serás|fuiste|estabas|tenías|eras|podrías|deberías|debes|' +
  'también|tampoco|me|te|lo|la|le|nos|les|los|las|ya|sí'

export const esDiacritic: Rule = {
  id: 'es-diacritic',
  langs: ['es'],
  category: 'confusion',
  kind: 'grammar',
  check: patternRule([
    // él: an article is never followed by a verb, a pronoun or punctuation.
    word(w(`el${PUNCT}`, 'gu'), 'él'),
    word(w(`[Ee]l(?= (?:${EL_VERBS})(?![\\p{L}'’-]))`, 'gu'), 'él'),
    word(w('(?<=(?:^|[^\\p{L}])(?:con|para|por|sin|contra|según|entre|hacia|sobre|ante|tras|desde|hasta) )el(?= (?:y|o|ni|pero|porque|mientras|también|tampoco)(?![\\p{L}]))', 'giu'), 'él'),
    // tú
    word(w(`tu${PUNCT}`, 'giu'), 'tú'),
    word(w(`tu(?= (?:${TU_VERBS})(?![\\p{L}'’-]))`, 'giu'), 'tú'),
    word(w('tu(?= (?:mismo|misma)(?:\\s*[.,;:!?]| (?:lo|la|los|las|le|les|te|me|has|puedes|sabes|dices|eres|debes|tienes)(?![\\p{L}])))', 'giu'), 'tú'),
    word(w('(?<=(?:^|[^\\p{L}])entre )tu(?= y (?:yo|él|ella)(?![\\p{L}]))', 'giu'), 'tú'),
    // mí
    word(w(`mi${PUNCT}`, 'giu'), 'mí', (m, text) => /(?:^|[^\p{L}])(?:do|re|fa|sol|la|si)\s*,?\s*$/iu.test(before(m, text)) || /^\s*,?\s*(?:fa|sol|re|do)(?![\p{L}])/iu.test(after(m, text)) || /(?:^|[^\p{L}])nota\s*$/iu.test(before(m, text))),
    word(w('(?<=(?:^|[^\\p{L}])(?:a|para|de|por|sin|contra|ante|hacia|según|sobre|entre|tras) )mi(?= (?:me|también|tampoco|no me|no nos|no)(?![\\p{L}]))', 'giu'), 'mí'),
    word(w('(?<=(?:^|[^\\p{L}])(?:a|para|de|por|sin|contra|ante|hacia|según|sobre|entre|tras) )mi(?= (?:mismo|misma)(?:\\s*[.,;:!?]| me(?![\\p{L}])))', 'giu'), 'mí'),
    // sé (from saber)
    word(w(`(?<=(?:^|[^\\p{L}])(?:no|yo|lo|ya|bien|tampoco) )se${PUNCT}`, 'giu'), 'sé'),
    word(w('(?<=(?:^|[^\\p{L}])(?:no|yo|ya|lo) )se(?= (?:que|si|qué|cómo|dónde|cuándo|quién|quiénes|cuál|cuáles|cuánto|cuánta|cuántos|cuántas|por qué|mucho)(?![\\p{L}]))', 'giu'), 'sé'),
    word(w('(?<=(?:^|[^\\p{L}])(?:no|yo) )se(?= \\p{Ll}+(?:ar|er|ir)(?![\\p{L}]))', 'giu'),
      'sé',
      (m, text) => /^ (?:mujer|lugar|mar|placer|hogar|ayer|azar|bar|par|militar|popular|particular|familiar|ser)(?![\p{L}])/iu.test(after(m, text)),
    ),
    // té (the drink)
    word(w('(?<=(?:^|[^\\p{L}])(?:taza|tazas|bolsita|bolsitas|hoja|hojas|tetera|teteras) de )te', 'giu'), 'té'),
    word(w('te(?= (?:verde|negro|rojo|blanco|helado|chai|matcha|con leche|con limón|de menta|de manzanilla)(?![\\p{L}]))', 'giu'), 'té'),
    word(w(`(?<=(?:^|[^\\p{L}])(?:un|del) )te(?=\\s*[.,;!?]| (?:verde|negro|rojo|blanco|caliente|frío|helado|con limón|con leche)(?![\\p{L}]))`, 'giu'), 'té'),
    // más
    word(w('(?<=(?:^|[^\\p{L}])(?:lo|los|las|la|el|sin|de|cada vez|mucho|mucha|muchos|muchas|poco|algo|nada|aún|todavía|es|son|cuanto|qué|uno|una|nadie|alguien|ya no|no|un poco|bastante|cada día) )mas', 'giu'),
      'más',
      (m) => !m[0].endsWith('mas'),
    ),
    word(w('mas(?= (?:o menos|que nunca|tarde|temprano|pronto|bien|allá|adelante|arriba|abajo|lejos|cerca|grande|pequeño|pequeña|importante|de lo que|de la cuenta|veces|que nada|información|datos)(?![\\p{L}]))', 'giu'), 'más'),
    // sí
    word(w('(?<=(?:^|[^\\p{L}])(?:eso|esto|claro que|ya lo creo que|a que) )si(?=\\s*[.,;!?…])', 'giu'), 'sí'),
    word(w('(?<=(?:^|[^\\p{L}])(?:creo que|dijo que|dice que|decir que|contestó que|respondió que|parece que|pienso que|digo que) )si(?=\\s*[.!?…])', 'giu'), 'sí'),
    {
      re: w('(de|en|por|para|entre|sobre|a|consigo) si (mismo|misma|mismos|mismas)', 'giu'),
      fix: (m) => (m[1].toLowerCase() === 'a' ? [`${m[1]} sí ${m[2]}`, 'asimismo'] : [`${m[1]} sí ${m[2]}`]),
      vars: () => ({ word: 'si', fix: 'sí' }),
    },
    word(w(`(?<=(?:^|[^\\p{L}])(?:volver|volvió|volvía|volvieron|vuelve|vuelven) en )si${PUNCT}`, 'giu'), 'sí'),
    // aun (= incluso) / aún (= todavía)
    { re: w('aún así(?=\\s*,)', 'giu'), fix: () => ['aun así'], vars: () => ({ word: 'aún', fix: 'aun' }) },
    { re: w('aún cuando', 'giu'), fix: () => ['aun cuando'], vars: () => ({ word: 'aún', fix: 'aun' }) },
    { re: w('ni aún', 'giu'), fix: () => ['ni aun'], vars: () => ({ word: 'aún', fix: 'aun' }) },
    word(w('aun(?= no(?![\\p{L}]))', 'giu'), 'aún', (m, text) => /^ no \p{L}+(?:ando|iendo|yendo)(?![\p{L}])/u.test(after(m, text))),
    word(w(`aun${PUNCT}`, 'giu'), 'aún'),
    word(w('aun(?= (?:está|están|estaba|estaban|estamos|queda|quedan|quedaba|sigue|siguen|seguía|faltan|falta)(?![\\p{L}]))', 'giu'), 'aún'),
    // está (verb) / esta (this)
    word(
      w('esta(?= (?:aquí|allí|ahí|allá|bien|mal|muy|lejos|cerca|bastante|demasiado|claro|seguro|segura|hecho|hecha|abierto|abierta|cerrado|cerrada|lleno|llena|vacío|vacía|enfermo|contento|contenta|cansado|cansada|listo|preocupado|preocupada|equivocado|equivocada|prohibido|prohibida)(?![\\p{L}]))', 'giu'),
      'está',
    ),
  ]),
}

// Question and exclamation words right after ¿ or ¡ (also "¿Y …", "¿Pero …").
// "que", "como" and "cuando" also start echo questions ("¿Que no vienes?")
// and subordinate clauses, so they are only corrected before typical words.
const QUE_NEXT = 'hora|día|tal|tipo|clase|color|número|edad|pasa|pasó|ocurre|ocurrió|sucede|sucedió|significa|opinas|opina|piensas|prefieres|necesitas|buscas|haces|hacéis|hacemos|hago|hace|hacen|es eso|es esto|son esos|son estas|son esas|es lo que|quieres|queréis|quiere|dices|dice|te parece|os parece|le parece'
const COMO_NEXT = 'estás|está|estáis|están|estamos|te llamas|se llama|se llaman|os llamáis|se dice|se escribe|se hace|se pronuncia|funciona|funcionan|sabes|lo sabes|puedo|podemos|puede|es posible|te fue|te va|os va|le va|así|lo hiciste|lo haces|lo hago|ha sido|fue'
const CUANDO_NEXT = 'es|será|fue|empieza|empiezan|empezamos|termina|terminan|acaba|acaban|vienes|viene|venís|vienen|llega|llegas|llegan|llegamos|nos vemos|sales|sale|salen|salimos|vuelves|vuelve|vuelven|abre|cierra|comemos|cenamos'
const QUE_EXCLAIM = 'bonito|bonita|bonitos|bonitas|bien|mal|pena|suerte|raro|rara|horror|asco|guay|lástima|rico|rica|bueno|buena|grande|guapo|guapa|lindo|linda|frío|calor|hambre|miedo|alegría|ilusión|sorpresa|casualidad|susto|vergüenza|tontería|maravilla|barbaridad|interesante|divertido|divertida|difícil|fácil|bonito día|emoción|precioso|preciosa'

const ACCENTED: Record<string, string> = {
  que: 'qué', como: 'cómo', donde: 'dónde', cuando: 'cuándo', quien: 'quién', quienes: 'quiénes', cual: 'cuál', cuales: 'cuáles',
  cuanto: 'cuánto', cuanta: 'cuánta', cuantos: 'cuántos', cuantas: 'cuántas', adonde: 'adónde',
}

export const esInterrogative: Rule = {
  id: 'es-interrogative',
  langs: ['es'],
  category: 'confusion',
  kind: 'grammar',
  check(text) {
    const out: Found[] = []
    const re = /([¿¡])\s*(?:(?:y|pero|entonces|e|o|a ver|bueno|oye|y entonces),?\s+)?(que|como|donde|cuando|quienes|quien|cuales|cual|cuantos|cuantas|cuanto|cuanta|adonde)(?![\p{L}'’-])/giu
    for (const m of text.matchAll(re)) {
      const mark = m[1]
      const found = m[2]
      const lower = found.toLowerCase()
      const rest = text.slice(m.index + m[0].length)
      const next = (list: string) => new RegExp(`^\\s+(?:${list})(?![\\p{L}])`, 'iu').test(rest) || /^\s*[?!]/.test(rest)
      let ok: boolean
      if (mark === '¡') ok = lower === 'que' ? new RegExp(`^\\s+(?:${QUE_EXCLAIM})(?![\\p{L}])`, 'iu').test(rest) : lower.startsWith('cuant') && !/^\s+(?:antes|más|menos)(?![\p{L}])/iu.test(rest)
      else if (lower === 'que') ok = next(QUE_NEXT)
      else if (lower === 'como') ok = next(COMO_NEXT)
      else if (lower === 'cuando') ok = next(CUANDO_NEXT)
      else if (lower.startsWith('cuant')) ok = !/^\s+(?:antes|más|menos|mayor|menor|mejor|peor)(?![\p{L}])/iu.test(rest)
      else ok = true
      if (!ok) continue
      const from = m.index + m[0].length - found.length
      const fix = matchCase(found, ACCENTED[lower])
      out.push({ from, to: from + found.length, replacements: [fix], vars: { word: found, fix } })
    }
    // Indirect questions: "no sé donde vive" → "dónde"; "no sé que hacer" → "qué".
    const indirect = /(?<![\p{L}])(?:no sé|no sabe|no sabes|no sabía|no sabemos|no saben|no sabían|me pregunto|se pregunta|te preguntas|nos preguntamos|no tengo ni idea de|no tengo claro) (como|donde|cuando|quien|quienes|cual|cuales|cuanto|cuanta|cuantos|cuantas|adonde|que(?= \p{Ll}+(?:ar|er|ir)(?:[.,;:!?\s]|$)))(?![\p{L}'’-])/giu
    for (const m of text.matchAll(indirect)) {
      const found = m[1]
      const from = m.index + m[0].length - found.length
      if (found.toLowerCase() === 'que' && /^\s+(?:ser|estar|haber)(?![\p{L}])/iu.test(text.slice(from + 3))) continue
      const fix = matchCase(found, ACCENTED[found.toLowerCase()])
      out.push({ from, to: from + found.length, replacements: [fix], vars: { word: found, fix } })
    }
    return out
  },
}

// "de el" / "a el" contract ("del", "al"), unless "el" is the pronoun "él".
export const esContraction: Rule = {
  id: 'es-contraction',
  langs: ['es'],
  category: 'grammar',
  kind: 'grammar',
  check(text) {
    const out: Found[] = []
    for (const m of text.matchAll(/(?<![\p{L}'’-])(de|a) el(?![\p{L}'’-])/giu)) {
      // "de El Salvador": capitalized names keep the article ("el" must be lowercase).
      if (text.slice(m.index + m[1].length + 1, m.index + m[0].length) !== 'el') continue
      const rest = text.slice(m.index + m[0].length)
      const pronoun = /^\s*(?:[.,;:!?…)»"”]|$)|^\s+(?:le|les|lo|la|los|las|me|te|se|nos|os|no|mismo|misma|solo|sólo|también|tampoco|y|o|ni|que|cuando|porque|pero|sí|le|es|era|fue|está|estaba|tiene|tenía|dijo|dice|hizo|hace|puede|quiere|sabe|va|iba|ha|había)(?![\p{L}])/iu.test(rest)
      const contracted = m[1].toLowerCase() === 'de' ? 'del' : 'al'
      const withPronoun = `${m[1]} él`
      const replacements = (pronoun ? [withPronoun, contracted] : [contracted, withPronoun]).map((r) => matchCase(m[0], r))
      out.push({ from: m.index, to: m.index + m[0].length, replacements, vars: { word: m[0], fix: replacements[0] } })
    }
    return out
  },
}

export const esAccentRules: Rule[] = [esDiacritic, esInterrogative, esContraction]
