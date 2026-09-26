// Form editor: a column of cards (header, sections, questions) editing the
// shared form definition, and the answer key in the editors' private document.
// Every field is written on input; changes from other editors re-render the
// cards (keeping the focus and the caret).

import * as Y from 'yjs'
import { ArrowDown, ArrowUp, Copy, Image as ImageIcon, Sigma, Trash2, X } from 'lucide'
import { t } from '../../core/i18n'
import { editEquation, renderEquation } from '../../ui/equation'
import { confirmDialog, el, icon, toast } from '../../ui/widgets'
import {
  answersMap,
  hasOptions,
  isOpen,
  itemMap,
  itemsArray,
  newId,
  newQuestion,
  QUESTION_TYPES,
  readItem,
  readItems,
  readKey,
  readSettings,
  settingsMap,
  typeLabel,
  type AnswerKey,
  type Item,
  type Option,
  type QuestionType,
} from './model'
import { LOCAL, type FormState } from './state'

export interface FormEditor {
  element: HTMLElement
  render(): void
  addQuestion(type: QuestionType): void
  addSection(): void
  // Image / equation for the selected item (or the last one).
  addImage(): void
  addEquation(): void
  destroy(): void
}

export function createEditor(state: FormState): FormEditor {
  const { session } = state
  const doc = session.doc
  const priv = state.priv!
  const items = itemsArray(doc)
  const settings = settingsMap(doc)
  const meta = doc.getMap<unknown>('meta')
  const element = el('div', { class: 'fm-column fm-editor' })
  let selected = ''
  const imageInput = el('input', { type: 'file', accept: 'image/*', hidden: true })
  document.body.append(imageInput)

  const change = (fn: () => void) => doc.transact(fn, LOCAL)
  const mapOf = (id: string) => items.toArray().find((m) => m.get('id') === id)
  const indexOf = (id: string) => items.toArray().findIndex((m) => m.get('id') === id)
  const setField = (id: string, key: keyof Item, value: unknown) => change(() => mapOf(id)?.set(key, value))
  const setKey = (id: string, patch: Partial<AnswerKey>) => priv.transact(() => answersMap(priv).set(id, { ...readKey(priv, id), ...patch }), LOCAL)

  // ---------- Rendering ----------

  const render = () => {
    const active = document.activeElement as HTMLInputElement | null
    const focus = active?.dataset?.f
    const range = focus && 'selectionStart' in active! ? [active!.selectionStart, active!.selectionEnd] : null
    const scroll = element.closest('.fm-scroll')?.scrollTop
    const s = readSettings(doc)
    const list = readItems(doc)
    element.replaceChildren(headerCard(s), ...list.map((item, i) => (item.kind === 'section' ? sectionCard(item, i, list.length) : questionCard(item, i, list.length, s.quiz))))
    if (!list.length) element.append(el('p', { class: 'hint fm-empty', textContent: t('Add a question with the toolbar (“Question”).') }))
    if (focus) {
      const target = element.querySelector<HTMLInputElement>(`[data-f="${CSS.escape(focus)}"]`)
      if (target) {
        target.focus({ preventScroll: true })
        if (range && 'setSelectionRange' in target) {
          try {
            target.setSelectionRange(range[0], range[1])
          } catch {
            // Not a text input.
          }
        }
      }
    }
    const scroller = element.closest('.fm-scroll')
    if (scroller && scroll !== undefined) scroller.scrollTop = scroll
    autosize()
  }

  const autosize = () =>
    element.querySelectorAll<HTMLTextAreaElement>('textarea.fm-auto').forEach((ta) => {
      ta.style.height = 'auto'
      ta.style.height = `${ta.scrollHeight + 2}px`
    })

  const text = (f: string, value: string, placeholder: string, onInput: (v: string) => void, options: { multiline?: boolean; class?: string } = {}) => {
    const input = options.multiline ? el('textarea', { rows: 1, class: `field fm-auto ${options.class ?? ''}` }) : el('input', { class: `field ${options.class ?? ''}` })
    input.value = value
    input.placeholder = placeholder
    input.setAttribute('aria-label', placeholder)
    input.dataset.f = f
    input.addEventListener('input', () => {
      onInput(input.value)
      if (options.multiline) autosize()
    })
    return input
  }

  const toggle = (f: string, label: string, checked: boolean, onChange: (v: boolean) => void) => {
    const input = el('input', { type: 'checkbox', checked })
    input.dataset.f = f
    input.addEventListener('change', () => onChange(input.checked))
    return el('label', { class: 'check fm-toggle' }, input, label)
  }

  const iconButton = (node: Parameters<typeof icon>[0], label: string, run: () => void, enabled = true) => {
    const b = el('button', { type: 'button', class: 'fm-icon-btn', title: label, disabled: !enabled }, icon(node, 18))
    b.setAttribute('aria-label', label)
    b.addEventListener('click', run)
    return b
  }

  const headerCard = (s: ReturnType<typeof readSettings>) =>
    el(
      'section',
      { class: 'fm-card fm-header' },
      text('meta:title', String(meta.get('title') ?? ''), t('Form title'), (v) => change(() => meta.set('title', v)), { class: 'fm-title-input' }),
      text('settings:description', s.description, t('Form description'), (v) => change(() => settings.set('description', v)), { multiline: true }),
      s.quiz ? el('p', { class: 'hint', textContent: t('Quiz: mark the correct answers and the points of each question. Answer keys are only kept by the editors.') }) : null,
    )

  const media = (item: Item) => {
    const box = el('div', { class: 'fm-media' })
    if (item.image) {
      box.append(el('div', { class: 'fm-media-item' }, el('img', { src: item.image, alt: '', class: 'fm-image' }), iconButton(X, t('Remove image'), () => setField(item.id, 'image', ''))))
    }
    if (item.equation) {
      const eq = el('div', { class: 'fm-equation', title: t('Edit equation') })
      renderEquation(eq, item.equation, true)
      eq.addEventListener('click', () => void equationFor(item.id))
      box.append(el('div', { class: 'fm-media-item' }, eq, iconButton(X, t('Remove equation'), () => setField(item.id, 'equation', ''))))
    }
    return box.childElementCount ? box : null
  }

  const cardTools = (item: Item, index: number, count: number) =>
    el(
      'div',
      { class: 'fm-card-tools' },
      iconButton(ImageIcon, t('Add image'), () => ((selected = item.id), imageInput.click())),
      iconButton(Sigma, t('Add equation'), () => void equationFor(item.id)),
      iconButton(ArrowUp, t('Move up'), () => move(item.id, -1), index > 0),
      iconButton(ArrowDown, t('Move down'), () => move(item.id, 1), index < count - 1),
      iconButton(Copy, t('Duplicate'), () => duplicate(item.id)),
      iconButton(Trash2, t('Delete'), () => void remove(item.id)),
    )

  const sectionCard = (item: Item, index: number, count: number) => {
    const card = el(
      'section',
      { class: 'fm-card fm-section fm-edit', dataset: { id: item.id } },
      el('div', { class: 'fm-kind', textContent: t('Section') }),
      text(`${item.id}:title`, item.title, t('Section title'), (v) => setField(item.id, 'title', v), { class: 'fm-title-input' }),
      text(`${item.id}:description`, item.description, t('Description (optional)'), (v) => setField(item.id, 'description', v), { multiline: true }),
      media(item),
      el('div', { class: 'fm-card-footer' }, el('span', { class: 'spacer' }), cardTools(item, index, count)),
    )
    card.addEventListener('focusin', () => (selected = item.id))
    return card
  }

  const questionCard = (item: Item, index: number, count: number, quiz: boolean) => {
    const key = readKey(priv, item.id)
    const type = el('select', { class: 'field fm-type' }, ...QUESTION_TYPES.map((q) => el('option', { value: q, textContent: typeLabel(q) })))
    type.value = item.type
    type.dataset.f = `${item.id}:type`
    type.setAttribute('aria-label', t('Question type'))
    type.addEventListener('change', () => changeType(item, type.value as QuestionType))
    const card = el(
      'section',
      { class: `fm-card fm-question fm-edit${selected === item.id ? ' selected' : ''}`, dataset: { id: item.id } },
      el('div', { class: 'fm-q-row' }, text(`${item.id}:title`, item.title, t('Question'), (v) => setField(item.id, 'title', v), { multiline: true, class: 'fm-q-input' }), type),
      text(`${item.id}:description`, item.description, t('Description (optional)'), (v) => setField(item.id, 'description', v), { class: 'fm-desc-input' }),
      media(item),
      body(item, key, quiz),
    )
    if (quiz) card.append(quizFields(item, key))
    const footer = el('div', { class: 'fm-card-footer' })
    if (quiz) {
      const points = el('input', { type: 'number', min: '0', step: '0.25', class: 'field fm-points-input', value: String(item.points) })
      points.dataset.f = `${item.id}:points`
      points.addEventListener('input', () => setField(item.id, 'points', Math.max(0, Number(points.value) || 0)))
      footer.append(el('label', { class: 'fm-inline' }, t('Points'), points))
    }
    footer.append(toggle(`${item.id}:required`, t('Required'), item.required, (v) => setField(item.id, 'required', v)))
    if (hasOptions(item.type)) footer.append(toggle(`${item.id}:shuffle`, t('Shuffle options'), item.shuffle, (v) => setField(item.id, 'shuffle', v)))
    footer.append(el('span', { class: 'spacer' }), cardTools(item, index, count))
    card.append(footer)
    card.addEventListener('focusin', () => {
      if (selected === item.id) return
      selected = item.id
      element.querySelectorAll('.fm-edit.selected').forEach((c) => c.classList.remove('selected'))
      card.classList.add('selected')
    })
    return card
  }

  // Options list (choice types, grid rows and columns).
  const optionList = (item: Item, field: 'options' | 'rows', marker: string, key: AnswerKey | null, quiz: boolean) => {
    const list = item[field]
    const box = el('div', { class: 'fm-opt-list' })
    const write = (next: Option[]) => setField(item.id, field, next)
    list.forEach((o, i) => {
      const row = el('div', { class: 'fm-opt-row' }, el('span', { class: `fm-marker ${marker}`, 'aria-hidden': 'true' } as never))
      row.append(
        text(`${item.id}:${field}:${o.id}`, o.label, field === 'rows' ? t('Row {n}', { n: i + 1 }) : t('Option {n}', { n: i + 1 }), (v) => {
          const next = readItem(mapOf(item.id)!)[field].map((x) => (x.id === o.id ? { ...x, label: v } : x))
          write(next)
        }),
      )
      if (quiz && key && hasOptions(item.type)) {
        const correct = key.correct.includes(o.id)
        const b = el('button', { type: 'button', class: `fm-correct${correct ? ' on' : ''}`, textContent: correct ? t('Correct') : t('Mark correct') })
        b.setAttribute('aria-pressed', String(correct))
        b.addEventListener('click', () => {
          const current = readKey(priv, item.id).correct
          const next = item.type === 'checkbox' ? (current.includes(o.id) ? current.filter((c) => c !== o.id) : [...current, o.id]) : current.includes(o.id) ? [] : [o.id]
          setKey(item.id, { correct: next })
          render()
        })
        row.append(b)
      }
      row.append(
        iconButton(X, t('Remove'), () => {
          write(readItem(mapOf(item.id)!)[field].filter((x) => x.id !== o.id))
          render()
        }),
      )
      box.append(row)
      if (quiz && key && hasOptions(item.type)) {
        const fb = text(`${item.id}:ofb:${o.id}`, key.optionFeedback[o.id] ?? '', t('Feedback when this option is chosen (optional)'), (v) =>
          setKey(item.id, { optionFeedback: { ...readKey(priv, item.id).optionFeedback, [o.id]: v } }),
        )
        box.append(el('div', { class: `fm-opt-feedback${key.optionFeedback[o.id] ? ' filled' : ''}` }, fb))
      }
    })
    const add = el('button', { type: 'button', class: 'fm-link', textContent: field === 'rows' ? t('Add row') : item.type === 'grid' ? t('Add column') : t('Add option') })
    add.addEventListener('click', () => {
      const current = readItem(mapOf(item.id)!)[field]
      const id = newId()
      write([...current, { id, label: field === 'rows' ? t('Row {n}', { n: current.length + 1 }) : item.type === 'grid' ? t('Column {n}', { n: current.length + 1 }) : t('Option {n}', { n: current.length + 1 }) }])
      render()
      element.querySelector<HTMLInputElement>(`[data-f="${CSS.escape(`${item.id}:${field}:${id}`)}"]`)?.select()
    })
    box.append(add)
    return box
  }

  const body = (item: Item, key: AnswerKey, quiz: boolean): HTMLElement => {
    switch (item.type) {
      case 'choice':
      case 'checkbox':
      case 'dropdown':
        return optionList(item, 'options', item.type === 'checkbox' ? 'square' : item.type === 'dropdown' ? 'number' : 'circle', key, quiz)
      case 'grid': {
        const box = el('div', { class: 'fm-grid-edit' }, el('div', {}, el('div', { class: 'fm-sub', textContent: t('Rows') }), optionList(item, 'rows', 'none', null, quiz)), el('div', {}, el('div', { class: 'fm-sub', textContent: t('Columns') }), optionList(item, 'options', 'circle', null, quiz)))
        return box
      }
      case 'scale': {
        const range = (f: 'min' | 'max', values: number[]) => {
          const s = el('select', { class: 'field fm-small' }, ...values.map((v) => el('option', { value: String(v), textContent: String(v) })))
          s.value = String(item[f])
          s.dataset.f = `${item.id}:${f}`
          s.setAttribute('aria-label', f === 'min' ? t('From') : t('To'))
          s.addEventListener('change', () => (setField(item.id, f, Number(s.value)), render()))
          return s
        }
        return el(
          'div',
          { class: 'fm-scale-edit' },
          el('div', { class: 'fm-inline' }, range('min', [0, 1]), t('to'), range('max', [2, 3, 4, 5, 6, 7, 8, 9, 10])),
          text(`${item.id}:minLabel`, item.minLabel, t('Label for {n} (optional)', { n: item.min }), (v) => setField(item.id, 'minLabel', v)),
          text(`${item.id}:maxLabel`, item.maxLabel, t('Label for {n} (optional)', { n: item.max }), (v) => setField(item.id, 'maxLabel', v)),
        )
      }
      case 'short':
        return el('div', { class: 'fm-preview-line', textContent: t('Short answer text') })
      case 'paragraph':
        return el('div', { class: 'fm-preview-line long', textContent: t('Long answer text') })
      case 'date':
        return el('div', { class: 'fm-preview-line', textContent: t('Day, month, year') })
      case 'time':
        return el('div', { class: 'fm-preview-line', textContent: t('Time') })
      case 'number':
        return el('div', { class: 'fm-preview-line', textContent: t('Number') })
    }
  }

  // Answer key and feedback (quiz mode).
  const quizFields = (item: Item, key: AnswerKey) => {
    const box = el('div', { class: 'fm-key' }, el('div', { class: 'fm-sub', textContent: t('Answer key') }))
    const f = (name: string) => `${item.id}:key:${name}`
    switch (item.type) {
      case 'short':
        box.append(
          text(f('correct'), key.correct.join('\n'), t('Accepted answers, one per line (not case-sensitive)'), (v) => setKey(item.id, { correct: v.split('\n').map((x) => x.trim()).filter(Boolean) }), { multiline: true }),
        )
        break
      case 'paragraph':
        box.append(el('p', { class: 'hint', textContent: t('Open answer: graded by hand in Responses → Grading.') }))
        break
      case 'number': {
        const value = el('input', { class: 'field fm-small', inputMode: 'decimal', value: key.value === undefined ? '' : String(key.value), placeholder: t('Correct value') })
        value.dataset.f = f('value')
        value.setAttribute('aria-label', t('Correct value'))
        value.addEventListener('input', () => {
          const n = Number(value.value.replace(',', '.'))
          setKey(item.id, { value: value.value.trim() && !Number.isNaN(n) ? n : undefined })
        })
        const tol = el('input', { class: 'field fm-small', inputMode: 'decimal', value: key.tolerance === undefined ? '' : String(key.tolerance), placeholder: '0' })
        tol.dataset.f = f('tolerance')
        tol.setAttribute('aria-label', t('Tolerance (±)'))
        tol.addEventListener('input', () => setKey(item.id, { tolerance: Math.abs(Number(tol.value.replace(',', '.'))) || 0 }))
        box.append(el('div', { class: 'fm-inline' }, t('Correct value'), value, t('Tolerance (±)'), tol))
        break
      }
      case 'scale':
      case 'date':
      case 'time': {
        const input = el('input', { class: 'field fm-small', type: item.type === 'scale' ? 'number' : item.type, value: key.correct[0] ?? '' })
        input.dataset.f = f('correct')
        input.setAttribute('aria-label', t('Correct answer (optional)'))
        input.addEventListener('input', () => setKey(item.id, { correct: input.value ? [input.value] : [] }))
        box.append(el('label', { class: 'fm-inline' }, t('Correct answer (optional)'), input))
        break
      }
      case 'grid':
        for (const r of item.rows) {
          const s = el('select', { class: 'field fm-small' }, el('option', { value: '', textContent: '—' }), ...item.options.map((c) => el('option', { value: c.id, textContent: c.label })))
          s.value = key.rows[r.id] ?? ''
          s.dataset.f = f(`row:${r.id}`)
          s.addEventListener('change', () => {
            const rows = { ...readKey(priv, item.id).rows }
            if (s.value) rows[r.id] = s.value
            else delete rows[r.id]
            setKey(item.id, { rows })
          })
          box.append(el('label', { class: 'fm-inline' }, r.label || '—', s))
        }
        break
      default:
        if (!key.correct.length) box.append(el('p', { class: 'hint', textContent: t('Mark the correct option(s) above.') }))
    }
    if (!isOpen(item.type)) {
      box.append(
        text(f('fbok'), key.feedbackCorrect, t('Feedback for a correct answer (optional)'), (v) => setKey(item.id, { feedbackCorrect: v })),
        text(f('fbko'), key.feedbackWrong, t('Feedback for an incorrect answer (optional)'), (v) => setKey(item.id, { feedbackWrong: v })),
      )
    }
    return box
  }

  // ---------- Operations ----------

  const insertAt = () => {
    const i = selected ? indexOf(selected) : -1
    return i < 0 ? items.length : i + 1
  }

  const addQuestion = (type: QuestionType) => {
    const map = itemMap(newQuestion(type))
    const id = String(map.get('id'))
    change(() => items.insert(insertAt(), [map]))
    selected = id
    render()
    const input = element.querySelector<HTMLElement>(`[data-f="${CSS.escape(`${id}:title`)}"]`)
    input?.focus()
    input?.scrollIntoView({ block: 'center' })
  }

  const addSection = () => {
    const map = itemMap({ kind: 'section', title: '' })
    const id = String(map.get('id'))
    change(() => items.insert(insertAt(), [map]))
    selected = id
    render()
    element.querySelector<HTMLElement>(`[data-f="${CSS.escape(`${id}:title`)}"]`)?.focus()
  }

  const cloneMap = (map: Y.Map<unknown>, id = String(map.get('id'))) => {
    const out = new Y.Map<unknown>()
    map.forEach((v, k) => out.set(k, k === 'id' ? id : v))
    return out
  }

  const move = (id: string, delta: number) => {
    const i = indexOf(id)
    const j = i + delta
    if (i < 0 || j < 0 || j >= items.length) return
    change(() => {
      const copy = cloneMap(items.get(i))
      items.delete(i, 1)
      items.insert(j, [copy])
    })
    render()
  }

  const duplicate = (id: string) => {
    const i = indexOf(id)
    if (i < 0) return
    const copyId = newId()
    change(() => items.insert(i + 1, [cloneMap(items.get(i), copyId)]))
    const key = answersMap(priv).get(id)
    if (key) priv.transact(() => answersMap(priv).set(copyId, key), LOCAL)
    selected = copyId
    render()
  }

  const remove = async (id: string) => {
    const item = readItem(mapOf(id)!)
    if (item.title && !(await confirmDialog(t('Delete this item?'), item.title, { confirmLabel: t('Delete'), danger: true }))) return
    const i = indexOf(id)
    if (i >= 0) change(() => items.delete(i, 1))
    render()
  }

  const changeType = (item: Item, type: QuestionType) => {
    const map = mapOf(item.id)
    if (!map) return
    change(() => {
      map.set('type', type)
      if (hasOptions(type) && !item.options.length) map.set('options', newQuestion(type).options)
      if (type === 'grid') {
        if (!item.rows.length) map.set('rows', newQuestion('grid').rows)
        if (!item.options.length || hasOptions(item.type)) map.set('options', item.options.length ? item.options : newQuestion('grid').options)
      }
    })
    setKey(item.id, { correct: [], rows: {} })
    render()
  }

  const target = () => selected || String(items.length ? items.get(items.length - 1).get('id') : '')

  const equationFor = async (id: string) => {
    const map = mapOf(id)
    if (!map) return toast(t('Add a question first'))
    const value = await editEquation({ latex: String(map.get('equation') ?? ''), display: true, displayChoice: false })
    if (value) setField(id, 'equation', value.latex)
    render()
  }

  imageInput.addEventListener('change', async () => {
    const file = imageInput.files?.[0]
    imageInput.value = ''
    const id = target()
    if (!file || !mapOf(id)) return
    try {
      setField(id, 'image', await shrinkImage(file))
      render()
    } catch {
      toast(t('This image cannot be used'))
    }
  })

  // Re-render for changes that did not come from this editor's inputs.
  let frame = 0
  const onRemote = (events: Y.YEvent<Y.AbstractType<unknown>>[], tr: Y.Transaction) => {
    if (tr.origin === LOCAL) return
    void events
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(render)
  }
  items.observeDeep(onRemote)
  settings.observeDeep(onRemote)
  meta.observeDeep(onRemote)
  answersMap(priv).observeDeep(onRemote)
  render()

  return {
    element,
    render,
    addQuestion,
    addSection,
    addImage: () => {
      if (!mapOf(target())) return toast(t('Add a question first'))
      selected = target()
      imageInput.click()
    },
    addEquation: () => void equationFor(target()),
    destroy: () => {
      items.unobserveDeep(onRemote)
      settings.unobserveDeep(onRemote)
      meta.unobserveDeep(onRemote)
      answersMap(priv).unobserveDeep(onRemote)
      imageInput.remove()
    },
  }
}

// Scales an image down (max 1000 px) so the shared form stays small.
async function shrinkImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const scale = Math.min(1, 1000 / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    const png = file.type === 'image/png' || file.type === 'image/gif' || file.type === 'image/svg+xml'
    return canvas.toDataURL(png ? 'image/png' : 'image/jpeg', 0.85)
  } finally {
    URL.revokeObjectURL(url)
  }
}
