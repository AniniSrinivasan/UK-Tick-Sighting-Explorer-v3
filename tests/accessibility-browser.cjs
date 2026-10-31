// check display preferences, keyboard access and read-aloud controls
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const speechStub = () => {
  const state = { texts: [], pauses: 0, resumes: 0, cancels: 0, current: null, last: null }
  class Utterance { constructor(text) { this.text = text } }
  const synth = {
    paused: false,
    getVoices: () => [{ lang: 'en-GB', localService: true, name: 'Daniel' }, { lang: 'en-GB', localService: false, name: 'Google UK English Female' }],
    speak: utterance => { state.texts.push(utterance.text); state.last = state.current = utterance; utterance.onstart?.({}) },
    pause: () => { synth.paused = true; state.pauses++ },
    resume: () => { synth.paused = false; state.resumes++ },
    cancel: () => { state.current = null; state.cancels++ },
  }
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth })
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: Utterance })
  window.testSpeech = state
}
const routeFixtures = async page => {
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#b6d6df"/></svg>' }))
  await page.route('**/api/sightings*', route => route.fulfill({ json: { data: [{ id: 'one', observedAt: '2026-01-01T00:00:00Z', locationName: 'London', region: 'London', latitude: 51.5, longitude: 0, species: 'unknown', severity: 'low', source: 'community' }], meta: { localAvailable: true, externalAvailable: true, total: 1, speciesOptions: [{ value: 'unknown', label: 'Unknown', count: 1 }], placeOptions: [{ value: 'London', label: 'London', kind: 'place' }] } } }))
}
;(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(speechStub)
    await routeFixtures(page)
    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' })
    await page.locator('html[data-text-size=standard]').waitFor()
    await page.locator('.report-marker').waitFor()
    const paragraph = page.locator('[data-educational-guide] p').filter({ hasText: /^Ticks can be found/ })
    const fontSize = () => paragraph.evaluate(node => parseFloat(getComputedStyle(node).fontSize))
    const original = await fontSize()
    const trigger = page.getByRole('button', { name: 'Accessibility', exact: true })
    await trigger.focus(); await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Accessibility preferences' })
    await dialog.waitFor()
    await dialog.getByRole('button', { name: 'Larger 112.5%' }).click()
    await page.locator('html[data-text-size=larger]').waitFor()
    assert.equal(await fontSize(), original * 1.125)
    await dialog.getByRole('button', { name: 'Largest 125%' }).click()
    await page.locator('html[data-text-size=largest]').waitFor()
    assert.equal(await fontSize(), original * 1.25)
    await dialog.getByRole('switch', { name: /High contrast/ }).check()
    await page.locator('html[data-contrast=high]').waitFor()
    assert.deepEqual(await paragraph.evaluate(node => ({ color: getComputedStyle(node).color, background: getComputedStyle(node.closest('article')).backgroundColor })), { color: 'rgb(0, 0, 0)', background: 'rgb(255, 255, 255)' })
    const markerStyle = await page.locator('.report-marker').evaluate(node => ({ color: getComputedStyle(node).color, background: getComputedStyle(node).backgroundColor }))
    assert.deepEqual(markerStyle, { color: 'rgb(255, 255, 255)', background: 'rgb(0, 0, 0)' })
    await dialog.getByRole('button', { name: 'Read guide aloud', exact: true }).click()
    await dialog.getByRole('button', { name: 'Pause reading' }).waitFor()
    assert.match(await page.evaluate(() => testSpeech.texts[0]), /Prevent bites and know what to do/)
    assert.equal(await page.evaluate(() => testSpeech.current.voice.name), 'Google UK English Female', 'UK female voice is preferred over the first local male voice')
    assert.equal(await page.evaluate(() => testSpeech.current.rate), 0.95)
    await dialog.getByRole('button', { name: 'Pause reading' }).click()
    assert.equal(await page.evaluate(() => speechSynthesis.paused), true)
    await dialog.getByRole('button', { name: 'Resume reading' }).click()
    assert.equal(await page.evaluate(() => speechSynthesis.paused), false)
    await dialog.getByRole('button', { name: 'Stop reading' }).click()
    const priorCount = await page.evaluate(() => testSpeech.texts.length)
    await page.evaluate(() => testSpeech.last.onend?.({}))
    assert.equal(await page.evaluate(() => testSpeech.texts.length), priorCount, 'Stopping prevents stale completion events from restarting speech')
    await dialog.getByRole('button', { name: 'Read guide aloud' }).click()
    // Exhaust every chunk and verify the complete guide was included.
    await page.evaluate(() => { let guard = 0; while (testSpeech.current && guard++ < 100) { const next = testSpeech.current; testSpeech.current = null; next.onend?.({}) } })
    await dialog.getByText('Finished reading the educational guide.').waitFor()
    assert.match(await page.evaluate(() => testSpeech.texts.join(' ')), /Do not rely on a tick/)
    await page.keyboard.press('Escape')
    await page.waitForFunction(button => button === document.activeElement, await trigger.elementHandle())
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator('html[data-text-size=largest][data-contrast=high]').waitFor()
    assert.equal(await page.evaluate(() => testSpeech.texts.length), 0, 'Reading must never start automatically')
    await page.setViewportSize({ width: 390, height: 844 })
    await trigger.click()
    await dialog.waitFor()
    const box = await dialog.boundingBox()
    assert(box.x >= 0 && box.x + box.width <= 390 && box.y >= 0 && box.y + box.height <= 844)
    await dialog.getByRole('button', { name: 'Done', exact: true }).focus()
    for (let i = 0; i < 14; i++) { await page.keyboard.press('Tab'); assert(await dialog.evaluate(node => node.contains(document.activeElement))) }
    await page.screenshot({ path: '/tmp/tickwatch-accessibility-mobile.png' })
    await dialog.getByRole('button', { name: 'Done', exact: true }).click()
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Largest text must not cause page overflow')
    await page.locator('#learn').getByRole('button', { name: 'Read guide aloud' }).click()
    await page.locator('#learn').getByRole('button', { name: 'Pause reading' }).waitFor()
    await trigger.click()
    await dialog.getByRole('button', { name: 'Pause reading' }).waitFor()
    await dialog.getByRole('button', { name: 'Pause reading' }).click()
    await dialog.getByRole('button', { name: 'Reset preferences' }).click()
    await page.locator('html[data-text-size=standard][data-contrast=standard]').waitFor()
    assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('tickwatch-accessibility-v1')))).textSize, 'standard')
    await dialog.getByRole('button', { name: 'Read guide aloud' }).click()
    assert.equal(await page.evaluate(() => speechSynthesis.paused), false, 'Reading can restart after a paused reset')
    await page.evaluate(() => testSpeech.current.onerror?.({ error: 'synthesis-failed' }))
    await dialog.getByText('Read-aloud could not continue.', { exact: false }).waitFor()
    assert.deepEqual(errors, [])
    const fallback = await browser.newPage({ viewport: { width: 390, height: 844 } })
    await fallback.addInitScript(() => {
      Object.defineProperty(window, 'speechSynthesis', { value: undefined })
      Storage.prototype.getItem = () => { throw new DOMException('Blocked', 'SecurityError') }
      Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'SecurityError') }
    })
    await routeFixtures(fallback)
    await fallback.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' })
    await fallback.getByRole('button', { name: 'Accessibility', exact: true }).click()
    const fallbackDialog = fallback.getByRole('dialog', { name: 'Accessibility preferences' })
    await fallbackDialog.getByText('Browser storage is unavailable.', { exact: false }).waitFor()
    assert.equal(await fallbackDialog.getByRole('button', { name: 'Read guide aloud' }).isDisabled(), true)
    await fallbackDialog.getByRole('button', { name: 'Larger 112.5%' }).click()
    await fallback.locator('html[data-text-size=larger]').waitFor()
    console.log('Accessibility checks passed: actual text scaling, high-contrast text/markers, persistence/reset, full-guide speech/pause/resume/stop/errors, no autoplay, keyboard/focus/Escape, mobile layout and unavailable speech/storage fallbacks.')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
