// WebMCP tools of the notebook (see src/core/webmcp). Loaded only while the
// switch is on. Reading needs a view link; adding pages and text needs edit
// access. Text is added directly (no suggestions): each call is one undo step
// (append_text goes through the page's editor and its undo history; add_page
// is one step of the notebook's undo history).

import type { JSONContent } from '@tiptap/core'
import { getSchema } from '@tiptap/core'
import { prosemirrorJSONToYXmlFragment } from '@tiptap/y-tiptap'
import { yUndoPluginKey } from '@tiptap/y-tiptap'
import { t } from '../../core/i18n'
import { groupYUndo } from '../../core/webmcp/undo'
import { imageResult, num, optNum, optStr, str, type AppTools, type OfimeoTool, type TextPart, type ToolArgs } from '../../core/webmcp/types'
import type { NotebookContext } from './app'
import { notebookExtensions } from './extensions'
import { pageContent } from './export'
import { addPage, addSection, allPages, collectTags, deletePage, inkArray, movePage, NB_ORIGIN, notebookText, pageText, pageTitle, readPages, readSections, updatePage, type Page } from './model'

const MAX_TEXT = 100_000

export function notebookTools(ctx: NotebookContext): AppTools {
  const { doc, session } = ctx
  const sections = () => new Map(readSections(doc).map((s) => [s.id, s]))

  // A page by id or (case-insensitive) title; default: the open page.
  const findPage = (args: ToolArgs): Page => {
    const key = optStr(args, 'page')?.trim()
    const pages = allPages(doc)
    const page = key ? pages.find((p) => p.id === key) ?? pages.find((p) => pageTitle(p).toLowerCase() === key.toLowerCase()) : pages.find((p) => p.id === ctx.current())
    if (!page) throw new Error(key ? `No page "${key}" (use list_pages)` : 'No page is open')
    return page
  }
  const markdownOf = async (page: Page): Promise<string> => {
    const { exportMarkdown } = await import('../writer/formats/markdown')
    const md = exportMarkdown({ type: 'doc', content: pageContent(doc, page.id, { files: 'text', ink: 'none' }) })
    // Pictures are stored as data: URLs; the assistant gets a placeholder.
    return md.replace(/\]\(data:[^)]*\)/g, '](embedded-image)')
  }
  const toContent = async (text: string): Promise<JSONContent[]> => {
    if (text.length > MAX_TEXT) throw new Error(`Text is too long (at most ${MAX_TEXT} characters)`)
    const { importMarkdown } = await import('../writer/formats/markdown')
    return (await importMarkdown(text)).content ?? []
  }
  const requireEdit = () => {
    if (!session.canEdit) throw new Error('The notebook is read-only in this tab')
  }

  const tools: OfimeoTool[] = [
    {
      name: 'list_pages',
      description: 'Lists the notebook: sections in order, each with its pages (id, title, subpage level, tagged notes count). The open page is marked.',
      inputSchema: { type: 'object', properties: {} },
      access: 'view',
      execute: () => {
        const tags = collectTags(doc)
        return readSections(doc).map((s) => ({
          section: s.name,
          section_id: s.id,
          pages: readPages(doc, s.id).map((p) => ({
            id: p.id,
            title: pageTitle(p),
            level: p.level,
            ...(p.id === ctx.current() ? { open: true } : {}),
            tags: tags.filter((t) => t.page === p.id).length,
          })),
        }))
      },
    },
    {
      name: 'get_page',
      description: 'Returns a page as Markdown: title, section, created date, text (tags as ☐ To do, ☑ Done, ★ Important, ⁇ Question, ☞ Remember before the paragraph) and whether it has ink drawings. "page" is an id or a title; default: the open page.',
      inputSchema: { type: 'object', properties: { page: { type: 'string' } } },
      access: 'view',
      execute: async (args) => {
        const page = findPage(args)
        return {
          id: page.id,
          title: pageTitle(page),
          section: sections().get(page.section)?.name ?? '',
          created: new Date(page.created).toISOString(),
          markdown: await markdownOf(page),
          ink_strokes: inkArray(doc, page.id).length,
        }
      },
    },
    {
      name: 'add_page',
      description: 'Adds a page at the end of a section (name or id; default: the open page\'s section, or a new section when that name does not exist) with a title and optional Markdown text, and opens it. One undo step.',
      inputSchema: {
        type: 'object',
        properties: { title: { type: 'string' }, section: { type: 'string' }, text: { type: 'string' }, level: { type: 'number', description: '0 page, 1 subpage, 2 sub-subpage' } },
        required: ['title'],
      },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Add the page {name}', { name: String(args.title ?? '') }),
      execute: async (args) => {
        requireEdit()
        const title = str(args, 'title')
        const content = await toContent(optStr(args, 'text') ?? '')
        const wanted = optStr(args, 'section')?.trim()
        const schema = getSchema(notebookExtensions())
        let id = ''
        doc.transact(() => {
          const list = readSections(doc)
          const section = wanted
            ? (list.find((s) => s.id === wanted) ?? list.find((s) => s.name.toLowerCase() === wanted.toLowerCase()))?.id ?? addSection(doc, wanted)
            : ctx.currentSection() ?? addSection(doc, 'Notes')
          id = addPage(doc, section, title, {
            level: optNum(args, 'level') ?? 0,
            content: (fragment) => {
              if (content.length) prosemirrorJSONToYXmlFragment(schema, { type: 'doc', content }, fragment)
            },
          })
        }, NB_ORIGIN)
        ctx.openPage(id)
        return { id, title }
      },
    },
    {
      name: 'rename_page',
      description: 'Renames a page ("page": id or title; default: the open page).',
      inputSchema: { type: 'object', properties: { page: { type: 'string' }, title: { type: 'string' } }, required: ['title'] },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Rename a page to {name}', { name: String(args.title ?? '') }),
      execute: (args) => {
        requireEdit()
        const page = findPage(args)
        const title = str(args, 'title').trim()
        if (!title) throw new Error('Empty title')
        doc.transact(() => updatePage(doc, page.id, { title }), NB_ORIGIN)
        return { id: page.id, title }
      },
    },
    {
      name: 'move_page',
      description: 'Moves a page ("page": id or title) before or after another page ("target", with "place"), or to the end of a section ("section": name or id).',
      inputSchema: {
        type: 'object',
        properties: { page: { type: 'string' }, target: { type: 'string' }, place: { type: 'string', enum: ['before', 'after'] }, section: { type: 'string' } },
        required: ['page'],
      },
      access: 'edit',
      changesDocument: true,
      summary: (args) => t('Move the page {name}', { name: String(args.page ?? '') }),
      execute: (args) => {
        requireEdit()
        const page = findPage(args)
        const section = optStr(args, 'section')?.trim()
        const target = optStr(args, 'target')
        if (section) {
          const s = readSections(doc).find((x) => x.id === section) ?? readSections(doc).find((x) => x.name.toLowerCase() === section.toLowerCase())
          if (!s) throw new Error(`No section "${section}"`)
          doc.transact(() => movePage(doc, page.id, { section: s.id }), NB_ORIGIN)
        } else if (target) {
          const other = findPage({ page: target })
          doc.transact(() => movePage(doc, page.id, { page: other.id, place: optStr(args, 'place') === 'before' ? 'before' : 'after' }), NB_ORIGIN)
        } else throw new Error('Give "target" (a page) or "section"')
        const moved = allPages(doc).find((p) => p.id === page.id)!
        return { id: page.id, section: sections().get(moved.section)?.name ?? '' }
      },
    },
    {
      name: 'delete_page',
      description: 'Deletes a page ("page": id or title) with its text and ink. The user confirms it.',
      inputSchema: { type: 'object', properties: { page: { type: 'string' } }, required: ['page'] },
      access: 'edit',
      changesDocument: true,
      destructive: true,
      summary: (args) => t('Delete the page {name}', { name: String(args.page ?? '') }),
      execute: (args) => {
        requireEdit()
        const page = findPage(args)
        const open = ctx.current() === page.id
        doc.transact(() => deletePage(doc, page.id), NB_ORIGIN)
        if (open) ctx.openPage(allPages(doc)[0]?.id ?? null)
        return { deleted: page.id, title: pageTitle(page) }
      },
    },
    {
      name: 'append_text',
      description: 'Adds Markdown text (paragraphs, "# " headings, "- " lists, "- [ ] " checklists) at the end of a page ("page": id or title; default: the open page), which is opened. Added directly, not as a suggestion; one undo step.',
      inputSchema: { type: 'object', properties: { page: { type: 'string' }, text: { type: 'string' } }, required: ['text'] },
      access: 'edit',
      changesDocument: true,
      summary: (args) => (args.page ? t('Add text to the page {name}', { name: String(args.page) }) : t('Add text to the open page')),
      execute: async (args) => {
        requireEdit()
        const page = findPage(args)
        const content = await toContent(str(args, 'text'))
        if (!content.length) return { appended: false }
        ctx.openPage(page.id)
        const editor = ctx.editor()
        if (!editor) throw new Error('The page could not be opened')
        const undo = () => (yUndoPluginKey.getState(editor.state) as { undoManager?: { stopCapturing(): void } } | undefined)?.undoManager
        undo()?.stopCapturing()
        // An empty last paragraph is replaced instead of kept above the new text.
        const last = editor.state.doc.lastChild
        const end = editor.state.doc.content.size
        const from = last && last.type.name === 'paragraph' && !last.content.size ? end - last.nodeSize : end
        editor.chain().insertContentAt({ from, to: end }, content).run()
        undo()?.stopCapturing()
        return { appended: true, page: page.id, title: pageTitle(page) }
      },
    },
  ]
  return {
    tools,
    group: (fn) => groupYUndo(ctx.undoManagers(), fn),
    // A page as printed (text and ink), part by part when it is long.
    render: async (args) => {
      const page = findPage(args)
      const [{ scopePdf }, { openPdf }, { pdfPageToPng }] = await Promise.all([import('./pdf'), import('../pdf/pdfjs'), import('../../core/webmcp/render')])
      const pdf = await openPdf(new Uint8Array(await (await scopePdf(doc, { kind: 'page', id: page.id })).arrayBuffer()))
      try {
        const n = Math.max(1, Math.min(pdf.numPages, Math.round(num(args, 'part', 1))))
        return imageResult(await pdfPageToPng(await pdf.getPage(n)), `“${pageTitle(page)}”, part ${n} of ${pdf.numPages}`)
      } finally {
        void pdf.loadingTask.destroy()
      }
    },
    renderSchema: { page: { type: 'string', description: 'Page id or title (default: the open page).' }, part: { type: 'integer', minimum: 1, description: 'For long pages: which printed page (default 1).' } },
    serialize: (ydoc) => notebookText(ydoc),
    paragraphs: () =>
      allPages(doc).flatMap((p) =>
        [{ where: `page “${pageTitle(p)}” · title`, text: pageTitle(p), context: 'heading' as const }, ...pageText(doc, p.id)
          .split('\n')
          .filter((line) => line.trim())
          .map((text, i) => ({ where: `page “${pageTitle(p)}” · paragraph ${i + 1}`, text }))] as TextPart[],
      ),
    selection: () => {
      const id = ctx.current()
      const page = id ? allPages(doc).find((p) => p.id === id) : undefined
      if (!page) return { kind: 'none' }
      const editor = ctx.editor()
      const sel = editor?.state.selection
      const text = editor && sel && !sel.empty ? editor.state.doc.textBetween(sel.from, sel.to, String.fromCharCode(10)) : ''
      return { kind: text ? 'text' : 'page', page: page.id, title: pageTitle(page), ...(text ? { text } : {}) }
    },
    show: (args) => {
      const page = findPage(args)
      ctx.openPage(page.id)
      return { shown: true, page: page.id, title: pageTitle(page) }
    },
    showSchema: { page: { type: 'string', description: 'Page id or title (from list_pages).' } },
    info: () => ({ sections: readSections(doc).length, pages: allPages(doc).length, open_page: ctx.current() }),
  }
}
