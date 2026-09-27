// Messages for spelling and grammar issues, shared by every app.

import { languages, t } from '../../core/i18n'
import type { Issue, Lang } from '../../core/spell/types'

export const langName = (lang: Lang): string => languages.find((l) => l.code === lang)?.name ?? lang

// An issue with the text it was found on.
export interface IssueInfo {
  issue: Issue
  text: string
}

// Explanation of an issue in the interface language (Harper and LanguageTool
// give their own messages).
export function describe(found: IssueInfo): string {
  const { issue } = found
  const v = { word: found.text, mark: issue.vars?.mark ?? '', fix: issue.replacements[0] ?? '' }
  if (issue.message) return issue.message
  switch (issue.rule) {
    case 'spelling': return t('“{word}” is not in the dictionary', v)
    case 'repeated-word': return t('Repeated word: “{word}”', v)
    case 'double-space': return t('Two or more spaces between words')
    case 'space-before-punctuation': return t('No space is needed before “{mark}”', v)
    case 'missing-space-after-punctuation': return t('Add a space after “{mark}”', v)
    case 'sentence-capital': return t('Sentences start with a capital letter')
    case 'es-a-ver-haber': return t('Confusion between “a ver” (to see) and “haber” (to have)')
    case 'es-echo-hecho': return t('Confusion between “echo” (from echar) and “hecho” (from hacer)')
    case 'es-halla-haya': return t('Use “haya” (from haber), not “halla” (from hallar)')
    case 'es-sino-si-no': return t('“sino” (but rather) and “si no” (if not) are different')
    case 'es-ahi-hay': return t('Confusion between “ahí” (there), “hay” (there is) and “ay” (ouch)')
    case 'es-a-ha': return t('The verb “haber” is written with h: “ha”, “he”')
    case 'es-tubo-tuvo': return t('“tuvo” (from tener) and “tubo” (a pipe) are different')
    case 'es-por-que': return t('In questions, “why” is written “por qué”')
    case 'es-dequeismo': return t('This verb takes “que” without “de”')
    case 'es-joined': return t('Write it as: “{fix}”', v)
    case 'es-preterite-s': return t('The past tense for “tú” has no final “s”')
    case 'es-question-exclamation': return t('Question and exclamation marks go in pairs: “{mark}” is missing', v)
    case 'gl-castelanismo': return t('Castilianism: in Galician, use “{fix}”', v)
    case 'gl-pero-mais': return t('Style: in formal Galician, “mais” is often preferred to “pero”')
    case 'fr-nbsp': return t('French typography: use a no-break space with “{mark}”', v)
    case 'fr-pleonasm': return t('Pleonasm: the extra words repeat the meaning')
    case 'de-das-dass': return t('After this verb, “dass” introduces the clause')
    case 'de-seit-seid': return t('“seit” (since) and “seid” (you are) are different')
    case 'de-als-wie': return t('After a comparative, use “als”')
    case 'de-fixed': return t('Standard spelling: “{fix}”', v)
    case 'es-diacritic':
    case 'gl-diacritic': return t('Diacritic accent: “{word}” and “{fix}” are different words', v)
    case 'es-interrogative': return t('Question and exclamation words take an accent: “{fix}”', v)
    case 'es-contraction': return t('“de el” and “a el” are written “del” and “al” (“de él”, “a él” for the pronoun)')
    case 'es-agreement': return t('The article does not agree with the noun: “{fix}”', v)
    case 'es-queismo': return t('This construction takes “de que”')
    case 'es-laismo': return t('Laísmo: the indirect object is “le” / “les”')
    case 'es-le-lo': return t('Before “lo”, “la”, “los” and “las”, the indirect object is “se”')
    case 'es-en-base-a': return t('Style: “en base a” is better written “con base en”, “sobre la base de” or “según”')
    case 'es-a-nivel-de': return t('Style: “a nivel de” is right for levels (“a nivel del mar”); elsewhere, try “en cuanto a” or “en el ámbito de”')
    case 'lowercase-month-day': return t('Months and days of the week are written in lowercase')
    case 'en-capital-month-day': return t('In English, days and months start with a capital letter')
    case 'en-its-your': return t('Commonly confused: “its” / “it’s”, “your” / “you’re”, “their” / “there”')
    case 'gl-contraction': return t('In Galician, the preposition and the article contract: “{fix}”', v)
    case 'de-einzigste': return t('“einzig” has no superlative: “{fix}”', v)
    case 'de-wider-wieder': return t('“wider” (against) and “wieder” (again) are different')
    default: return t('Commonly confused words: check the suggestion')
  }
}

export function kindLabel(found: IssueInfo): string {
  return found.issue.kind === 'spelling' ? t('Spelling') : found.issue.kind === 'style' ? t('Style') : t('Grammar')
}

// Visible form of a replacement (spaces and deletions are hard to see).
export function showReplacement(text: string): string {
  if (!text) return t('(delete)')
  return text.replace(/ /g, '⍽').replace(/ /g, '⍽').replace(/^ $/, '␣')
}

