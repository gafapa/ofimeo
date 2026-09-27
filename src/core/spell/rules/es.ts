// Spanish: frequent confusions in unambiguous contexts, and ¿? ¡! pairs.

import type { Issue } from '../types'
import { patternRule, w, type Rule } from './util'
import { esAccentRules } from './es-accents'
import { esGrammarRules } from './es-grammar'

type Found = Omit<Issue, 'kind' | 'rule'>

const PARTICIPLES =
  'sido|estado|hecho|dicho|visto|puesto|tenido|llegado|venido|podido|querido|sabido|salido|leído|escrito|comido|' +
  'terminado|acabado|entendido|ganado|perdido|pensado|hablado|estudiado|aprobado|suspendido|olvidado|cambiado|' +
  'conseguido|vivido|muerto|roto|vuelto|abierto|ocurrido|habido|dado|traído|oído|creído|jugado|trabajado'

const HABER = 'he|has|ha|hemos|habéis|han|había|habías|habíamos|habíais|habían|haya|hayas|hayamos|hayan|hubiera|hubieras|hubiéramos|hubieran|hubiese|habría|habrías|habríamos|habrían|haber|habiendo'

export const aVerHaber: Rule = {
  id: 'es-a-ver-haber',
  langs: ['es'],
  category: 'confusion',
  kind: 'grammar',
  check: patternRule([
    // "haber si viene" → "a ver si viene"; "haber qué pasa" → "a ver qué pasa".
    { re: w('haber (si|qué|cómo|cuándo|dónde|cuál|cuáles|cuánto|cuánta|cuántos|cuántas)'), fix: (m) => [`a ver ${m[1]}`] },
    // "va haber" → "va a haber".
    {
      re: w('(voy|vas|va|vamos|vais|van|iba|ibas|íbamos|iban) haber'),
      fix: (m) => [`${m[1]} a haber`],
      unless: (m, text) => /^ (?:si|qué|cómo|cuándo|dónde)(?![\p{L}])/u.test(text.slice(m.index + m[0].length)),
    },
    // "puede a ver" → "puede haber"; "a ver sido" → "haber sido".
    { re: w('(puede|pueden|podría|podrían|debe|deben|debería|deberían|suele|suelen|debía|podía) a ver'), fix: (m) => [`${m[1]} haber`] },
    { re: w(`a ver (${PARTICIPLES})`), fix: (m) => [`haber ${m[1]}`] },
  ]),
}

export const echoHecho: Rule = {
  id: 'es-echo-hecho',
  langs: ['es'],
  category: 'confusion',
  kind: 'grammar',
  check: patternRule([
    { re: w('(el|un|este|ese|aquel|del|al|de|mismo) echo'), fix: (m) => [`${m[1]} hecho`] },
    { re: w(`(${HABER}) echo`), fix: (m) => [`${m[1]} hecho`] },
    {
      re: w('hecho de menos'),
      fix: () => ['echo de menos'],
      unless: (m, text) => new RegExp(`(?:^|[^\\p{L}])(?:${HABER})\\s+$`, 'iu').test(text.slice(0, m.index)),
    },
    { re: w(`(${HABER}) hecho de menos`), fix: (m) => [`${m[1]} echado de menos`] },
  ]),
}

export const hallaHaya: Rule = {
  id: 'es-halla-haya',
  langs: ['es'],
  category: 'confusion',
  kind: 'grammar',
  check: patternRule([{ re: w(`halla (${PARTICIPLES})`), fix: (m) => [`haya ${m[1]}`] }]),
}

export const sinoSiNo: Rule = {
  id: 'es-sino-si-no',
  langs: ['es'],
  category: 'confusion',
  kind: 'grammar',
  check: patternRule([
    { re: w('si no que'), fix: () => ['sino que'] },
    {
      re: w('sino (me|te|se|nos|os|lo|la|los|las|le|les|hay|puedo|puedes|puede|podemos|quieres|quiere|queréis|quieren|tienes|tiene|sabes|sabe|vienes|viene|estás|está)'),
      fix: (m) => [`si no ${m[1]}`],
    },
  ]),
}

export const ahiHay: Rule = {
  id: 'es-ahi-hay',
  langs: ['es'],
  category: 'confusion',
  kind: 'grammar',
  check: patternRule([
    { re: w('(?:ahí|ay) que (\\p{L}+(?:ar|er|ir))'), fix: (m) => [`hay que ${m[1]}`] },
    { re: w('por hay'), fix: () => ['por ahí'] },
    { re: w('hay (está|están|estaba|estaban|estará|tienes|tenéis|va|van|viene|vienen)'), fix: (m) => [`ahí ${m[1]}`] },
  ]),
}

export const aHa: Rule = {
  id: 'es-a-ha',
  langs: ['es'],
  category: 'confusion',
  kind: 'grammar',
  check: patternRule([
    { re: w('a (sido|habido)'), fix: (m) => [`ha ${m[1]}`] },
    { re: w('e (sido|hecho|dicho|estado|tenido|visto|podido|querido|comido|venido|llegado|terminado|acabado|leído|escrito|habido)'), fix: (m) => [`he ${m[1]}`] },
  ]),
}

export const tuboTuvo: Rule = {
  id: 'es-tubo-tuvo',
  langs: ['es'],
  category: 'confusion',
  kind: 'grammar',
  check: patternRule([
    { re: w('tubo que'), fix: () => ['tuvo que'] },
    { re: w('un tuvo'), fix: () => ['un tubo'] },
  ]),
}

export const porQue: Rule = {
  id: 'es-por-que',
  langs: ['es'],
  category: 'confusion',
  kind: 'grammar',
  check(text) {
    const out: Found[] = []
    for (const m of text.matchAll(/¿\s*(p)or ?que(?![\p{L}])/giu)) {
      out.push({ from: m.index, to: m.index + m[0].length, replacements: [`¿${m[1]}or qué`], vars: { word: m[0] } })
    }
    return out
  },
}

export const dequeismo: Rule = {
  id: 'es-dequeismo',
  langs: ['es'],
  category: 'grammar',
  kind: 'grammar',
  check: patternRule([
    {
      re: w(
        '(pienso|piensas|piensa|pensamos|pensáis|piensan|pensaba|pensé|pensó|creo|crees|cree|creemos|creéis|creen|creía|creí|creyó|opino|opinas|opina|opinamos|opinan|opinaba|' +
          'considero|consideras|considera|consideramos|consideran|consideró|supongo|supones|supone|suponemos|suponen|imagino|imaginas|imagina|' +
          'dijo|dije|dijeron|dijimos|digo|dice|dicen|decía|comentó|comenté|comentaron|afirmó|afirma|afirman|explicó|expliqué|explicaron|anunció|anunciaron|' +
          'reconoció|reconozco|reconoce|mencionó|confesó|sugirió|sugiero|parece|parecía|es posible|es probable|es necesario|es importante|es seguro|es evidente|es obvio|es verdad|es cierto) de que',
      ),
      fix: (m) => [`${m[1]} que`],
      // "¿Qué piensas de que venga?": "pensar de" asks for an opinion.
      unless: (m, text) => /(?:^|[^\p{L}])qu[ée]\s+$/iu.test(text.slice(0, m.index)),
    },
  ]),
}

// Words written together or apart by mistake.
export const joined: Rule = {
  id: 'es-joined',
  langs: ['es'],
  category: 'confusion',
  kind: 'grammar',
  check: patternRule([
    { re: w('osea'), fix: () => ['o sea'] },
    { re: w('enserio'), fix: () => ['en serio'] },
    { re: w('aveces'), fix: () => ['a veces'] },
    { re: w('porfavor'), fix: () => ['por favor'] },
    { re: w('derrepente'), fix: () => ['de repente'] },
    { re: w('atravez|através|a travez'), fix: () => ['a través'] },
    { re: w('encambio'), fix: () => ['en cambio'] },
    { re: w('sinembargo'), fix: () => ['sin embargo'] },
    { re: w('almenos'), fix: () => ['al menos'] },
    { re: w('apesar'), fix: () => ['a pesar'] },
    { re: w('nose'), fix: () => ['no sé', 'no se'] },
    {
      re: w('sobretodo'),
      fix: () => ['sobre todo'],
      unless: (m, text) => /(?:^|[^\p{L}])(?:un|el|mi|tu|su|este|ese|aquel|del|al)\s+$/iu.test(text.slice(0, m.index)),
    },
  ]),
}

// "dijistes" → "dijiste".
export const preteriteS: Rule = {
  id: 'es-preterite-s',
  langs: ['es'],
  category: 'grammar',
  kind: 'grammar',
  check: patternRule([
    {
      re: w('(fuiste|dijiste|hiciste|viniste|estuviste|tuviste|pudiste|quisiste|viste|diste|comiste|llegaste|hablaste|pasaste|dejaste|llamaste|miraste|estudiaste|cogiste|saliste|trajiste|supiste|pusiste|compraste|jugaste)s'),
      fix: (m) => [m[1]],
    },
  ]),
}

// ¿…? and ¡…!: Spanish needs both marks. Galician makes the opening mark
// optional, so only an opening mark without its closing one is reported there.
function pairs(text: string, strict: boolean): Found[] {
  const out: Found[] = []
  const OPEN: Record<string, string> = { '?': '¿', '!': '¡' }
  const CLOSE: Record<string, string> = { '¿': '?', '¡': '!' }
  const boundary = (c: string) => c === '.' || c === '…' || c === '?' || c === '!' || c === '\n'
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (strict && (ch === '?' || ch === '!')) {
      // One group of closing marks ("?", "?!", "!!!") at a time.
      if (text[i - 1] === '?' || text[i - 1] === '!') continue
      if (text[i - 1] === '(' && text[i + 1] === ')') continue
      let end = i
      while (text[end + 1] === '?' || text[end + 1] === '!') end++
      const group = text.slice(i, end + 1)
      let k = i - 1
      while (k >= 0 && !boundary(text[k]) && !(group.includes('?') && text[k] === '¿') && !(group.includes('!') && text[k] === '¡')) k--
      if (k >= 0 && (text[k] === '¿' || text[k] === '¡')) continue
      // Suggest the opening mark at the start of the sentence.
      let start = k + 1
      while (start < i && /[\s"'«“—–-]/u.test(text[start])) start++
      if (start >= i) continue
      out.push({ from: i, to: end + 1, span: [start, end + 1], replacements: [OPEN[ch] + text.slice(start, end + 1)], vars: { mark: OPEN[ch] } })
    } else if (ch === '¿' || ch === '¡') {
      let k = i + 1
      while (k < text.length && !boundary(text[k])) k++
      let end = k
      while (text[end] === '?' || text[end] === '!') end++
      if (text.slice(k, end).includes(CLOSE[ch])) continue
      out.push({ from: i, to: i + 1, replacements: [], vars: { mark: CLOSE[ch] } })
    }
  }
  return out
}

export const questionMarks: Rule = {
  id: 'es-question-exclamation',
  langs: ['es', 'gl'],
  category: 'punctuation',
  kind: 'grammar',
  check(text, p) {
    return pairs(text, p.lang === 'es')
  },
}

export const esRules: Rule[] = [aVerHaber, echoHecho, hallaHaya, sinoSiNo, ahiHay, aHa, tuboTuvo, porQue, dequeismo, joined, preteriteS, questionMarks, ...esAccentRules, ...esGrammarRules]
