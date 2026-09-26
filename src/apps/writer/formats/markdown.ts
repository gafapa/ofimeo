// Markdown (CommonMark + GitHub tables and task lists).
//   import: marked turns the text into HTML, then the editor schema reads it
//           (headings, lists, emphasis, links, code, block quotes, tables,
//           images by URL). Raw HTML the schema does not know is dropped.
//   export: the document JSON written back as Markdown; what Markdown cannot
//           express (colours, fonts, alignment, comments) is left out.

import { generateJSON, type JSONContent } from '@tiptap/core'
import { marked } from 'marked'
import { allExtensions } from '../editor/extensions'

export async function importMarkdown(text: string): Promise<JSONContent> {
  const html = await marked.parse(text.replace(/^\uFEFF/, ''), { gfm: true, breaks: false })
  // GitHub task lists: <li><input type="checkbox" checked> text → the editor's task items.
  const tasks = html.replace(/<ul>\s*((?:<li><input[^>]*type="checkbox"[^>]*>[\s\S]*?<\/li>\s*)+)<\/ul>/g, (_m, items: string) =>
    `<ul data-type="taskList">${items.replace(/<li><input([^>]*)>\s*/g, (_i, attrs: string) => `<li data-type="taskItem" data-checked="${/checked/.test(attrs)}">`)}</ul>`,
  )
  return generateJSON(tasks, allExtensions())
}

// ---------- Export ----------

const escapeText = (s: string) => s.replace(/([\\`*_[\]<>#|])/g, '\\$1').replace(/^(\d+)\. /, '$1\\. ').replace(/^([-+]) /, '\\$1 ')

function inline(nodes: JSONContent[] | undefined): string {
  let out = ''
  for (const n of nodes ?? []) {
    if (n.type === 'hardBreak') {
      out += '  \n'
      continue
    }
    if (n.type === 'image') {
      out += `![${String(n.attrs?.alt ?? '')}](${String(n.attrs?.src ?? '')})`
      continue
    }
    if (n.type === 'footnote') {
      out += ` (${String(n.attrs?.content ?? '')})`
      continue
    }
    if (n.type === 'equation') {
      out += `$${String(n.attrs?.latex ?? '')}$`
      continue
    }
    if (n.type !== 'text') {
      out += inline(n.content)
      continue
    }
    const marks = new Set((n.marks ?? []).map((m) => m.type))
    // Deleted suggestions are not part of the text.
    if (marks.has('deletion')) continue
    let text = marks.has('code') ? `\`${n.text ?? ''}\`` : escapeText(n.text ?? '')
    const lead = /^\s*/.exec(text)![0]
    const trail = /\s*$/.exec(text)![0]
    let core = text.trim()
    if (core) {
      if (marks.has('bold')) core = `**${core}**`
      if (marks.has('italic')) core = `*${core}*`
      if (marks.has('strike')) core = `~~${core}~~`
      const link = n.marks?.find((m) => m.type === 'link')
      if (link) core = `[${core}](${String(link.attrs?.href ?? '')})`
      text = lead + core + trail
    }
    out += text
  }
  return out
}

function cellText(cell: JSONContent): string {
  return (cell.content ?? []).map((b) => inline(b.content)).join(' ').replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

function blocks(nodes: JSONContent[] | undefined, indent = ''): string[] {
  const out: string[] = []
  for (const n of nodes ?? []) {
    switch (n.type) {
      case 'heading':
        out.push(`${'#'.repeat(Number(n.attrs?.level ?? 1))} ${inline(n.content)}`)
        break
      case 'paragraph':
        out.push(indent + inline(n.content))
        break
      case 'blockquote':
        out.push(blocks(n.content).join('\n\n').split('\n').map((l) => `> ${l}`).join('\n'))
        break
      case 'codeBlock': {
        const lang = String(n.attrs?.language ?? '')
        out.push(`\`\`\`${lang}\n${(n.content ?? []).map((c) => c.text ?? '').join('')}\n\`\`\``)
        break
      }
      case 'horizontalRule':
      case 'pageBreak':
        out.push('---')
        break
      case 'bulletList':
      case 'orderedList':
      case 'taskList': {
        const items: string[] = []
        ;(n.content ?? []).forEach((item, i) => {
          const marker = n.type === 'orderedList' ? `${Number(n.attrs?.start ?? 1) + i}.` : n.type === 'taskList' ? `- [${item.attrs?.checked ? 'x' : ' '}]` : '-'
          const pad = ' '.repeat(marker.length + 1)
          const [first, ...rest] = blocks(item.content)
          const body = [first ?? '', ...rest].join('\n\n').split('\n').map((l, k) => (k === 0 ? `${marker} ${l}` : l ? pad + l : l))
          items.push(body.join('\n'))
        })
        out.push(items.join('\n'))
        break
      }
      case 'table': {
        const rows = (n.content ?? []).map((r) => (r.content ?? []).map(cellText))
        if (!rows.length) break
        const cols = Math.max(...rows.map((r) => r.length))
        const line = (r: string[]) => `| ${Array.from({ length: cols }, (_, i) => r[i] ?? '').join(' | ')} |`
        out.push([line(rows[0]), `|${' --- |'.repeat(cols)}`, ...rows.slice(1).map(line)].join('\n'))
        break
      }
      case 'image':
        out.push(inline([n]))
        break
      case 'tableOfContents':
      case 'sectionBreak':
        break
      default:
        if (n.content) out.push(...blocks(n.content, indent))
    }
  }
  return out
}

export function exportMarkdown(doc: JSONContent): string {
  return `${blocks(doc.content).join('\n\n').replace(/\n{3,}/g, '\n\n').trim()}\n`
}
