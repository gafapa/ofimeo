import { randomBytes } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { RELAYS, trackErrors } from './helpers'

// Records every WebRTC data channel payload a page receives (as text), to check
// that responses never travel in the clear.
async function sniff(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen: string[] = []
    Object.assign(window, { __rtc: seen })
    const dec = new TextDecoder()
    const hook = (ch: RTCDataChannel) =>
      ch.addEventListener('message', (e) => {
        const d = e.data
        if (typeof d === 'string') seen.push(d)
        else if (d instanceof Blob) void d.text().then((x) => seen.push(x))
        else seen.push(dec.decode(d as ArrayBuffer))
      })
    const create = RTCPeerConnection.prototype.createDataChannel
    RTCPeerConnection.prototype.createDataChannel = function (...args: Parameters<typeof create>) {
      const ch = create.apply(this, args)
      hook(ch)
      return ch
    }
    const Base = window.RTCPeerConnection
    window.RTCPeerConnection = class extends Base {
      constructor(...args: ConstructorParameters<typeof Base>) {
        super(...args)
        this.addEventListener('datachannel', (e) => hook(e.channel))
      }
    }
  })
}

const received = (page: Page) => page.evaluate(() => ((window as unknown as { __rtc: string[] }).__rtc ?? []).join('\n'))

// Every value stored in the page's IndexedDB databases, as text.
const storedText = (page: Page) =>
  page.evaluate(async () => {
    const dec = new TextDecoder()
    const out: string[] = []
    const walk = (v: unknown): void => {
      if (v instanceof Uint8Array) out.push(dec.decode(v))
      else if (Array.isArray(v)) v.forEach(walk)
      else if (v && typeof v === 'object') Object.values(v).forEach(walk)
      else if (v !== undefined && v !== null) out.push(String(v))
    }
    for (const info of await indexedDB.databases()) {
      const db = await new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open(info.name!)
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
      for (const name of db.objectStoreNames) {
        const values = await new Promise<unknown[]>((res) => {
          const r = db.transaction(name).objectStore(name).getAll()
          r.onsuccess = () => res(r.result)
          r.onerror = () => res([])
        })
        walk(values)
      }
      db.close()
    }
    return out.join('\n')
  })

test('quiz: two students answer (one offline), the teacher receives encrypted responses, grades and exports', async ({ browser }) => {
  test.setTimeout(240_000)
  const teacher = await (await browser.newContext()).newPage()
  const errors = trackErrors(teacher)
  await sniff(teacher)
  const b64 = (n: number) => randomBytes(n).toString('base64url')
  await teacher.goto(`/${RELAYS}#app=forms&doc=quiz-${Date.now()}&key=${b64(18)}&edit=${b64(32)}`)
  await teacher.locator('.fm-editor').waitFor({ timeout: 60_000 })

  // The teacher builds a quiz: multiple choice (2 points), number with tolerance, open question.
  await teacher.locator('[data-f="meta:title"]').fill('Repaso de ciencias')
  await teacher.getByRole('button', { name: 'Quiz mode' }).click()
  const add = async (type: string) => {
    await teacher.locator('.fm-add-question').click()
    await teacher.getByRole('menuitem', { name: type, exact: true }).click()
  }
  await add('Multiple choice')
  let card = teacher.locator('.fm-question').last()
  await card.locator('textarea.fm-q-input').fill('Capital de Portugal')
  await card.locator('.fm-opt-row input.field').first().fill('Oporto')
  await card.getByText('Add option').click()
  await card.locator('.fm-opt-row input.field').nth(1).fill('Lisboa')
  await card.locator('.fm-opt-row').nth(1).getByRole('button', { name: 'Mark correct' }).click()
  await card.locator('input.fm-points-input').fill('2')
  await add('Number')
  card = teacher.locator('.fm-question').last()
  await card.locator('textarea.fm-q-input').fill('3/4 + 1/2 = ?')
  await card.locator('[data-f$=":key:value"]').fill('1.25')
  await card.locator('[data-f$=":key:tolerance"]').fill('0.01')
  await add('Paragraph')
  await teacher.locator('.fm-question').last().locator('textarea.fm-q-input').fill('Explica la fotosíntesis')

  // Send link: view access (respond only).
  await teacher.locator('.fm-send').click()
  const link = await teacher.locator('#fm-send-link').inputValue()
  expect(link).not.toContain('edit=')
  await teacher.keyboard.press('Escape')

  // Student A answers online.
  const a = await (await browser.newContext()).newPage()
  await a.goto(link)
  await a.locator('.fm-respondent .fm-question').first().waitFor({ timeout: 60_000 })
  await expect(a.locator('.fm-verified')).toBeVisible()
  await a.locator('#fm-name').fill('Ana')
  await a.locator('.fm-question').nth(0).getByText('Lisboa').click()
  await a.locator('.fm-question').nth(1).locator('input').fill('1,25')
  await a.locator('.fm-question').nth(2).locator('textarea').fill('SECRETO-ANA la luz')
  await a.getByRole('button', { name: 'Submit', exact: true }).click()
  await expect(a.locator('.fm-state.ok')).toContainText('Received by the teacher', { timeout: 60_000 })

  // Student B loads the form, goes offline, answers: the response waits in the outbox.
  const bContext = await browser.newContext()
  const b = await bContext.newPage()
  await sniff(b)
  await b.goto(link)
  await b.locator('.fm-respondent .fm-question').first().waitFor({ timeout: 60_000 })
  await bContext.setOffline(true)
  await b.locator('#fm-name').fill('Bruno')
  await b.locator('.fm-question').nth(0).getByText('Oporto').click()
  await b.locator('.fm-question').nth(1).locator('input').fill('2')
  await b.locator('.fm-question').nth(2).locator('textarea').fill('SECRETO-BRUNO no lo sé')
  await b.getByRole('button', { name: 'Submit', exact: true }).click()
  await expect(b.locator('.fm-state.warn')).toContainText('offline')
  await b.waitForTimeout(5000)
  await expect(b.locator('.fm-state.ok')).toHaveCount(0)
  await bContext.setOffline(false)
  await expect(b.locator('.fm-state.ok')).toContainText('Received by the teacher', { timeout: 90_000 })

  // The teacher has both responses, graded automatically.
  await teacher.locator('.fm-tab[data-tab="responses"]').click()
  await expect(teacher.getByText('2 responses')).toBeVisible()
  await teacher.locator('.fm-subtab', { hasText: 'Grading' }).click()
  await expect(teacher.locator('.fm-response-select option').first()).toContainText('Ana · 3/4')
  await expect(teacher.locator('.fm-response-select option').nth(1)).toContainText('Bruno · 0/4')
  // Manual grade for the open question, then release: Ana sees her grade.
  const open = teacher.locator('.fm-answer', { hasText: 'Explica' })
  await open.locator('input[type=number]').fill('1')
  await open.locator('input[type=number]').press('Tab')
  await expect(teacher.getByText('Score: 4 / 4')).toBeVisible()
  await teacher.getByRole('button', { name: 'Release grade to this respondent' }).click()
  await expect(a.locator('.fm-score')).toHaveText('Score: 4 / 4', { timeout: 60_000 })

  // Privacy: B received the form in the clear but never A's answers, nor stored them.
  const bSaw = await received(b)
  expect(bSaw).toContain('Capital de Portugal')
  expect(bSaw).not.toContain('SECRETO-ANA')
  const bStored = await storedText(b)
  expect(bStored).toContain('Capital de Portugal')
  expect(bStored).not.toContain('SECRETO-ANA')
  // Responses reached the teacher encrypted (the teacher shows them after decrypting).
  expect(await received(teacher)).not.toContain('SECRETO-')

  // Exports: CSV download and the results opened in Ofimeo Sheets.
  const [download] = await Promise.all([teacher.waitForEvent('download'), teacher.getByRole('button', { name: 'Download CSV' }).click()])
  const csv = await (await download.createReadStream()).toArray()
  const text = Buffer.concat(csv).toString('utf8')
  expect(text).toContain('Ana')
  expect(text).toContain('SECRETO-BRUNO')
  const [sheet] = await Promise.all([teacher.context().waitForEvent('page'), teacher.getByRole('button', { name: 'Open in Ofimeo Sheets' }).click()])
  await sheet.locator('.app-sheet canvas').first().waitFor({ timeout: 60_000 })
  await expect(sheet).toHaveTitle(/Repaso de ciencias - Responses/)
  expect(errors).toEqual([])
})
