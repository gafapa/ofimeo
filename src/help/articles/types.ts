// Help center articles: ids and the shape of a language file (articles/<lang>.ts).
//
// Article bodies use a small markup (rendered by center.ts, never as HTML):
//   blank line          new paragraph
//   ## Heading          sub-heading
//   - item / 1. item    bulleted / numbered list
//   **bold**  `Ctrl+S` (a key)
//   [text](help:id)     link to another article
//   [text](action:name) runs an action: storage, nextcloud, connection, shortcuts, accessibility, tour, admin, moodle
//   [text](legal:name)  opens a legal page (privacy, schools…) in a new tab

export const BASIC_ARTICLES = ['getting-started', 'sharing', 'offline', 'backup', 'nextcloud', 'handin', 'moodle', 'network', 'school-setup', 'privacy', 'shortcuts', 'accessibility', 'spelling'] as const
// One per app, named after the app's DocType.
export const APP_ARTICLES = ['writer', 'sheet', 'draw', 'diagram', 'slides', 'forms', 'pdf', 'notebook'] as const

export type ArticleId = (typeof BASIC_ARTICLES)[number] | (typeof APP_ARTICLES)[number]

export interface Article {
  title: string
  // Extra search words (synonyms) that are not in the text.
  keywords?: string
  body: string
}

// Every language file must have every article (checked by the type).
export type Articles = Record<ArticleId, Article>
