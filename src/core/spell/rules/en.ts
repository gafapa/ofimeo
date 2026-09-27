// English: a few unambiguous confusions (Harper covers most of English grammar).

import { patternRule, w, type Rule } from './util'

export const enConfusions: Rule = {
  id: 'en-confusion',
  langs: ['en'],
  category: 'confusion',
  kind: 'grammar',
  check: patternRule([
    { re: w("(could|should|would|must|might)(n['’]t)? of"), fix: (m) => [`${m[1]}${m[2] ?? ''} have`] },
    { re: w('alot'), fix: () => ['a lot'] },
    // At the start of a sentence ("Thanks for your welcome." is right).
    { re: w('(?<=(?:^|[.!?"“]\\s*))your welcome(?=\\s*[.!,]|\\s*$)'), fix: () => ["you're welcome"] },
    { re: w('(more|less|better|worse|rather|other|bigger|smaller|greater|fewer) then'), fix: (m) => [`${m[1]} than`] },
  ]),
}

// its / it's, your / you're, their / there where only one reading is possible
// (Harper covers most other cases once it has loaded).
export const enItsYour: Rule = {
  id: 'en-its-your',
  langs: ['en'],
  category: 'confusion',
  kind: 'grammar',
  check: patternRule([
    { re: w('its(?= (?:a|an|the|not|been|going to|getting|raining|snowing)(?![\\p{L}\'’-]))'), fix: () => ["it's"] },
    { re: w('its(?= (?:important|possible|impossible|true|clear|easy|hard|difficult|necessary|likely|obvious|nice|good|great|fine|okay|better) (?:to|that)(?![\\p{L}]))'), fix: () => ["it's"] },
    { re: w('your(?= (?:a|an|going to|not|probably|definitely|actually|already|kidding|joking|gonna)(?![\\p{L}\'’-]))'), fix: () => ["you're"] },
    { re: w('their(?= (?:is|are|was|were)(?![\\p{L}\'’-]))'), fix: () => ['there'] },
    { re: w('there(?= own(?![\\p{L}]))'), fix: () => ['their'] },
  ]),
}

export const enRules: Rule[] = [enConfusions, enItsYour]
