import { expect, test } from '@playwright/test'
import { openApp, trackErrors } from './helpers'

// Read aloud and dictation: enabled in the accessibility panel, used from quick
// buttons in the app bar. The browser's speech services are replaced by fakes.
test('read aloud and dictation quick buttons', async ({ page }) => {
  const errors = trackErrors(page)
  await page.addInitScript(() => {
    localStorage.setItem('ofimeo:language', 'en')
    const w = window as unknown as Record<string, unknown>
    w.__spoken = [] as string[]
    speechSynthesis.speak = (u: SpeechSynthesisUtterance) => void (w.__spoken as string[]).push(u.text)
    speechSynthesis.cancel = () => {}
    w.SpeechRecognition = w.webkitSpeechRecognition = class {
      onend: (() => void) | null = null
      start() {
        w.__recognition = this
      }
      stop() {
        this.onend?.()
      }
    }
  })
  await openApp(page, 'writer')
  const read = page.getByRole('button', { name: 'Read aloud (Alt+Shift+R)' })
  const dictate = page.getByRole('button', { name: 'Dictation (Alt+Shift+D)' })
  // Off by default.
  await expect(read).toBeHidden()
  await expect(dictate).toBeHidden()

  await page.keyboard.press('Alt+Shift+A')
  await page.getByLabel('Show a read aloud button in the apps').check()
  await page.getByLabel('Show a dictation button in the apps').check()
  await page.keyboard.press('Escape')
  await expect(read).toBeVisible()
  await expect(dictate).toBeVisible()

  // Read aloud: the paragraph with the cursor; the button turns into Stop.
  const editor = page.locator('.ProseMirror').first()
  await editor.click()
  await page.keyboard.type('Plants make their own food.')
  await read.click()
  expect(await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken.join(' '))).toContain('Plants make their own food.')
  const stop = page.getByRole('button', { name: 'Stop reading' })
  await expect(stop).toHaveAttribute('aria-pressed', 'true')
  await stop.click()
  await expect(read).toHaveAttribute('aria-pressed', 'false')

  // Dictation writes at the cursor and stays pressed while listening.
  await editor.press('End')
  await dictate.click()
  await expect(page.getByRole('button', { name: 'Stop dictation' })).toHaveAttribute('aria-pressed', 'true')
  await page.evaluate(() => {
    const rec = (window as unknown as { __recognition: { onresult: (e: unknown) => void } }).__recognition
    rec.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'They use sunlight.' }], { isFinal: true })] })
  })
  await expect(editor).toContainText('Plants make their own food. They use sunlight.')
  await page.getByRole('button', { name: 'Stop dictation' }).click()
  await expect(dictate).toHaveAttribute('aria-pressed', 'false')

  // The choice is remembered in this browser.
  await page.reload()
  await expect(page.getByRole('button', { name: 'Read aloud (Alt+Shift+R)' })).toBeVisible()

  // The school configuration generator is on the home screen only, not in the apps' Help menu.
  await page.getByRole('menuitem', { name: 'Help' }).click()
  await expect(page.getByRole('menuitem', { name: 'Keyboard shortcuts' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'For administrators…' })).toHaveCount(0)
  expect(errors).toEqual([])
})
