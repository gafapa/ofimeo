// French: no-break spaces before ; : ! ? and inside « », and frequent
// confusions in unambiguous contexts.

import { OBJECT, type Issue } from '../types'
import { patternRule, w, type Rule } from './util'

type Found = Omit<Issue, 'kind' | 'rule'>

const NNBSP = ' '
const NBSP = ' '

// French typography puts a no-break space before ; : ! ? (a narrow one before
// ; ! ?) and inside guillemets. Missing spaces are reported; an ordinary
// space is a gentle suggestion (it can break the line before the mark).
export const frenchSpaces: Rule = {
  id: 'fr-nbsp',
  langs: ['fr'],
  category: 'typography',
  kind: 'style',
  check(text) {
    const out: Found[] = []
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      if (ch !== ';' && ch !== ':' && ch !== '!' && ch !== '?') continue
      const prev = text[i - 1] ?? ''
      // Only the first mark of "?!" or "!!!", not times (10:30), URLs or smileys.
      if (!prev || prev === NNBSP || prev === NBSP || prev === ' ' || /[;:!?(\n]/.test(prev) || prev === OBJECT) continue
      if (ch === ':' && (/\d/.test(prev) || /[\d/]/.test(text[i + 1] ?? ''))) continue
      if (/[)(\-pPD3]/.test(text[i + 1] ?? '') && /[\s]/.test(prev)) continue
      const space = ch === ':' ? NBSP : NNBSP
      if (prev === ' ') {
        out.push({ from: i - 1, to: i + 1, replacements: [space + ch], vars: { mark: ch } })
      } else if (/[\p{L}\p{N}»”"')\]]/u.test(prev)) {
        out.push({ from: i, to: i + 1, replacements: [space + ch], vars: { mark: ch } })
      }
    }
    for (const m of text.matchAll(/« ?|(?<=\S) ?»/g)) {
      if (m[0].length === 1 && ((m[0] === '«' && /[\s  ]/.test(text[m.index + 1] ?? ' ')) || (m[0] === '»' && /[\s  ]/.test(text[m.index - 1] ?? ' ')))) continue
      const fix = m[0].includes('«') ? `«${NNBSP}` : `${NNBSP}»`
      out.push({ from: m.index, to: m.index + m[0].length, replacements: [fix], vars: { mark: m[0].trim() } })
    }
    return out
  },
}

export const frConfusions: Rule = {
  id: 'fr-confusion',
  langs: ['fr'],
  category: 'confusion',
  kind: 'grammar',
  check: patternRule([
    { re: w('il y à'), fix: () => ['il y a'] },
    { re: w('(il|elle|on) à'), fix: (m) => [`${m[1]} a`] },
    { re: w('a (partir de|cause de|côté de|travers|peu près|l[\'’]égard|condition que|moins que|propos de)'), fix: (m) => [`à ${m[1]}`] },
    {
      re: w('(grâce|face|quant|par rapport|contrairement|conformément) a'),
      fix: (m) => [`${m[1]} à`],
      unless: (m, text) => /(?:^|[^\p{L}])(?:la|sa|une|cette|ta|ma|leur|notre|votre)\s+$/iu.test(text.slice(0, m.index)),
    },
    { re: w('jusqu[\'’]a'), fix: (m) => [`jusqu${m[0][5]}à`] },
    { re: w('sa (va|fait|suffit|dépend|ira|vaut)'), fix: (m) => [`ça ${m[1]}`] },
    { re: /(?<![\p{L}])comme sa(?=\s*[.,;:!?…]|\s*$)/giu, fix: () => ['comme ça'] },
    { re: w('ça (mère|père|sœur|soeur|maison|voiture|famille|vie|femme|fille|tête|main|chambre|copine|amie|tante|grand-mère)'), fix: (m) => [`sa ${m[1]}`] },
    { re: w('quelque fois'), fix: () => ['quelquefois'] },
    { re: w('on a (pas|jamais|rien|personne)'), fix: (m) => [`on n'a ${m[1]}`] },
    { re: w('quand à (moi|toi|lui|elle|nous|vous|eux|elles)'), fix: (m) => [`quant à ${m[1]}`] },
    { re: w('(je|tu|il|elle|on|nous|vous|ils|elles|ne) leurs'), fix: (m) => [`${m[1]} leur`] },
    { re: w('si (il|ils)'), fix: (m) => [`s'${m[1]}`] },
    { re: w('c[\'’]et'), fix: (m) => [`c${m[0][1]}est`] },
    { re: w('(ils|elles) on'), fix: (m) => [`${m[1]} ont`] },
    { re: w('quant (il|ils|elle|elles|on|je|tu|nous|vous|j[\'’])'), fix: (m) => [`quand ${m[1]}`] },
    {
      re: w('tout (les|ces|mes|tes|ses|nos|vos|leurs) (jours|ans|mois|soirs|matins|deux|trois|quatre|élèves|enfants|gens|autres|week-ends|samedis|dimanches|lundis)'),
      fix: (m) => [`tous ${m[1]} ${m[2]}`],
    },
    {
      re: w('toute (les|ces|mes|tes|ses|nos|vos|leurs) (fois|semaines|deux|trois|filles|personnes|autres|années|heures|minutes|classes)'),
      fix: (m) => [`toutes ${m[1]} ${m[2]}`],
    },
  ]),
}

export const frStyle: Rule = {
  id: 'fr-pleonasm',
  langs: ['fr'],
  category: 'style',
  kind: 'style',
  check: patternRule([
    { re: w('au jour d[\'’]aujourd[\'’]hui'), fix: () => ["aujourd'hui"] },
    { re: w('monter en haut'), fix: () => ['monter'] },
    { re: w('descendre en bas'), fix: () => ['descendre'] },
    { re: w('(prévoir|prévu|prévue|prévus|prévues|prévoit|prévoient) à l[\'’]avance'), fix: (m) => [m[1]] },
    { re: w('voire même'), fix: () => ['voire'] },
    { re: w('comme par exemple'), fix: () => ['par exemple', 'comme'] },
    { re: w('(reculer|recule|reculent|recula) en arrière'), fix: (m) => [m[1]] },
    { re: w('puis ensuite'), fix: () => ['puis', 'ensuite'] },
    { re: w('(se réunir|se réunissent|nous réunir|se sont réunis) ensemble'), fix: (m) => [m[1]] },
    { re: w('(collaborer|collaborent|collaborons) ensemble'), fix: (m) => [m[1]] },
  ]),
}

export const frRules: Rule[] = [frenchSpaces, frConfusions, frStyle]
