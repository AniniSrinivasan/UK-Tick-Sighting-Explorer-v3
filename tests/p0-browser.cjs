// Run with Playwright available: NODE_PATH=/path/to/node_modules node tests/p0-browser.cjs
// Uses mocked API responses to make failure/empty/pending scenarios deterministic.
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
;(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    const row = { id: 'one', observedAt: '2026-01-01T00:00:00Z', locationName: 'Test Park', region: 'London', latitude: 51.5, longitude: -0.1, species: 'unknown', severity: 'low', source: 'community' }
    let data = [row, { ...row, id: 'two', locationName: 'Other Park', latitude: 52 }]
    let meta = { localAvailable: true, externalAvailable: true, speciesOptions: [], placeOptions: [] }
    let getMode = 'ok'
    let postMode = 'errors'
    let posts = 0
    let release
    await page.route('**/api/sightings*', async route => {
      if (route.request().method() === 'GET') {
        if (getMode === 'loading') await new Promise(resolve => { release = resolve })
        if (getMode === 'http') return route.fulfill({ status: 503, json: { data, meta } })
        if (getMode === 'invalid') return route.fulfill({ contentType: 'text/html', body: '<html>Error</html>' })
        if (getMode === 'network') return route.abort()
        return route.fulfill({ json: { data, meta: { speciesOptions: [], placeOptions: [], ...meta } } })
      }
      posts++
      if (postMode === 'pending') await new Promise(resolve => { release = resolve })
      if (postMode === 'errors') return route.fulfill({ status: 400, json: { error: 'Please check the highlighted fields.', errors: { locationName: 'Choose a more specific location.', observedAt: 'Choose another date.', latitude: 'Check latitude.' } } })
      if (postMode === 'invalid') return route.fulfill({ status: 502, body: '<html>Error</html>' })
      if (postMode === 'network') return route.abort()
      return route.fulfill({ status: 201, json: { data: { ...row, id: 'saved' } } })
    })
    const visit = () => page.goto(process.env.TEST_BASE_URL || 'http://localhost:3000/', { waitUntil: 'domcontentloaded' })
    const expectText = text => page.getByText(text, { exact: false }).first().waitFor()
    await visit()
    await page.locator('.report-marker-shell').first().waitFor()
    assert.equal(await page.locator('.report-marker-shell').count(), 2)
    await page.getByRole('button', { name: 'Reported tick density', exact: true }).click()
    await page.locator('.leaflet-heatmap-layer').waitFor()
    await page.getByRole('button', { name: 'Sightings', exact: true }).click()
    await page.locator('.report-marker-shell').first().waitFor()
    await page.getByPlaceholder('Search a place or region').fill('Other')
    await page.locator('aside h2').filter({ hasText: 'Other Park' }).waitFor()
    await page.getByPlaceholder('Search a place or region').fill('no-matches')
    await expectText('No sightings match these filters')
    assert.equal(await page.locator('aside h2').count(), 0)
    assert.equal(await page.locator('.report-marker-shell').count(), 0)
    data = []
    await visit(); await expectText('No sightings are currently available')
    assert.equal(await page.locator('aside h2').count(), 0)
    for (const availability of [
      { localAvailable: true, externalAvailable: false, speciesOptions: [], placeOptions: [] },
      { localAvailable: false, externalAvailable: true, speciesOptions: [], placeOptions: [] },
    ]) {
      meta = availability; await visit(); await expectText('Partial results:')
    }
    meta = { localAvailable: false, externalAvailable: false, speciesOptions: [], placeOptions: [] }
    await visit(); await page.getByRole('button', { name: 'Retry loading' }).waitFor()
    meta = { localAvailable: true, externalAvailable: true, speciesOptions: [], placeOptions: [] }; data = [row]
    await page.getByRole('button', { name: 'Retry loading' }).click()
    await page.locator('aside h2').waitFor()
    for (const mode of ['http', 'invalid', 'network']) {
      getMode = mode; await visit(); await page.getByRole('button', { name: 'Retry loading' }).waitFor()
      assert.equal(await page.locator('aside h2').count(), 0)
    }
    getMode = 'loading'; const loadingRequest = page.waitForRequest('**/api/sightings*'); await visit(); await expectText('Loading live sightings')
    assert.equal(await page.locator('aside h2').count(), 0)
    await loadingRequest;
    while (!release) await new Promise(resolve => setTimeout(resolve, 10))
    getMode = 'ok'; release(); release = undefined; await page.locator('aside h2').waitFor()
    await page.getByRole('button', { name: 'Report a sighting', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByText('Coordinates (optional)', { exact: true }).waitFor()
    await dialog.getByText('You can submit a sighting without coordinates. Your report will still contribute to regional statistics. Providing both latitude and longitude allows the sighting to be displayed at its reported location on the map.', { exact: true }).waitFor()
    await dialog.locator('[name=locationName]').fill('My Test Park')
    await dialog.locator('[name=observedAt]').fill('2026-01-01')
    await dialog.locator('[name=region]').selectOption('London')
    await dialog.locator('[name=latitude]').fill('51.5')
    await dialog.locator('[name=longitude]').fill('0')
    await dialog.locator('[name=notes]').fill('Keep my notes')
    await dialog.getByRole('button', { name: 'Submit for review' }).click()
    await dialog.getByText('Choose a more specific location.').waitFor()
    assert.equal(await dialog.locator('[name=locationName]').getAttribute('aria-invalid'), 'true')
    assert.equal(await dialog.locator('[name=notes]').inputValue(), 'Keep my notes')
    for (const mode of ['invalid', 'network']) {
      postMode = mode
      await dialog.getByRole('button', { name: 'Submit for review' }).click()
      await dialog.getByText('We could not confirm', { exact: false }).waitFor()
      assert.equal(await dialog.locator('[name=locationName]').inputValue(), 'My Test Park')
    }
    postMode = 'pending'
    const before = posts
    await dialog.getByRole('button', { name: 'Submit for review' }).click()
    await dialog.getByRole('button', { name: 'Saving report…' }).waitFor()
    assert.equal(await dialog.getByRole('button', { name: 'Saving report…' }).isDisabled(), true)
    // Programmatic repeat events also hit the synchronous pending guard.
    await dialog.locator('form').evaluate(form => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    while (!release) await new Promise(resolve => setTimeout(resolve, 10))
    assert.equal(posts, before + 1)
    release()
    await expectText('Report saved successfully and awaiting verification.')
    assert.equal(await dialog.count(), 0)
    data = [{ ...row, latitude: null, longitude: null }]
    await visit()
    await expectText('no complete coordinates and cannot be shown on the map')
    await page.locator('aside').getByText('Not provided', { exact: true }).waitFor()
    assert.equal(await page.getByRole('link', { name: 'Get directions' }).count(), 0)
    assert.equal(await page.locator('.report-marker-shell').count(), 0)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: 'Report a sighting', exact: true }).click()
    await dialog.waitFor()
    for (const name of ['latitude', 'longitude']) {
      assert.equal(await dialog.locator(`[name=${name}]`).getAttribute('required'), null)
    }
    for (const name of ['locationName', 'observedAt', 'region', 'species', 'severity']) {
      assert.equal(await dialog.locator(`[name=${name}]`).getAttribute('required'), '')
      assert.match(await dialog.locator(`[name=${name}]`).locator('..').textContent(), /\*/)
    }
    const modalIsAboveMap = await dialog.evaluate(element => {
      const rect = element.querySelector('form').getBoundingClientRect()
      return document.elementsFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2).find(node => node.closest('[role="dialog"]')) !== undefined
    })
    assert(modalIsAboveMap)
    await page.screenshot({ path: '/tmp/tickwatch-p0-mobile.png', fullPage: true })
    await dialog.locator('[name=locationName]').fill('Without coordinates')
    await dialog.locator('[name=observedAt]').fill('2026-01-01')
    await dialog.locator('[name=region]').selectOption('London')
    postMode = 'ok'
    const optionalRequest = page.waitForRequest(request => request.method() === 'POST' && request.url().includes('/api/sightings'))
    await dialog.getByRole('button', { name: 'Submit for review' }).click()
    const optionalRequestDetails = await optionalRequest
    assert.match(optionalRequestDetails.headers()['content-type'], /^multipart\/form-data; boundary=/)
    const optionalBody = optionalRequestDetails.postDataBuffer().toString()
    assert.match(optionalBody, /name="latitude"\r\n\r\n\r\n/)
    assert.match(optionalBody, /name="longitude"\r\n\r\n\r\n/)
    await expectText('Report saved successfully')
    assert.deepEqual(errors, [])
    console.log('P0 browser checks passed: loading/empty/partial/failure/retry, selection, map toggle, inline errors, preserved values, multipart optional coordinates, non-JSON/network failures, repeat-submit guard, success and mobile rendering; no runtime errors.')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
