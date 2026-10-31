// check navigation, sharing, charts, species cards and photo submission
const { chromium } = require('playwright')
const assert = require('node:assert/strict')

const sightings = [
  { id: 'london-latest', observedAt: '2026-02-02T12:00:00Z', locationName: 'London Park', region: 'London', latitude: 51.5, longitude: -0.1, species: 'sheep', severity: 'low', photoMediaId: 'media-photo', photoUrl: '/api/media/file/photo.webp', photoWidth: 1, photoHeight: 1, source: 'community' },
  { id: 'london-march', observedAt: '2025-03-07T12:00:00Z', locationName: 'London Park', region: 'London', latitude: 51.5, longitude: -0.1, species: 'hedgehog', severity: 'moderate', source: 'community' },
  { id: 'london-january', observedAt: '2025-01-15T12:00:00Z', locationName: 'London Park', region: 'London', latitude: 51.5, longitude: -0.1, species: 'unknown', severity: 'low', source: 'community' },
  { id: 'bristol-recent', observedAt: '2026-03-03T12:00:00Z', locationName: 'Bristol', region: 'South West', latitude: 51.4545, longitude: -2.5879, species: 'sheep', severity: 'high', source: 'community' },
]
const seasonalHistory = [
  { id: 'london-feb-history', observedAt: '2024-02-11T12:00:00Z', locationName: 'London Park', region: 'London', latitude: 51.5, longitude: -0.1, species: 'sheep', severity: 'low', source: 'community' },
]

;(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#b6d6df"/></svg>',
    }))
    const photoPng = await require('sharp')({ create: { width: 1, height: 1, channels: 3, background: '#2a5' } }).png().toBuffer()
    await page.route('**/api/media/file/photo.webp**', route => route.fulfill({ contentType: 'image/png', body: photoPng }))
    const seasonalRequestUrls = []
    await page.route('**/api/sightings*', route => {
      if (route.request().method() === 'POST') {
        assert.match(route.request().headers()['content-type'], /^multipart\/form-data; boundary=/)
        const requestBody = route.request().postDataBuffer().toString('latin1')
        assert.match(requestBody, /name="photo"/)
        assert.match(requestBody, /tick-photo\.png/)
        return route.fulfill({ status: 201, json: { data: { ...sightings[0], id: 'uploaded-report' } } })
      }
      const requestUrl = new URL(route.request().url())
      const params = requestUrl.searchParams
      const isSeasonalRequest = !params.has('from') && !params.has('to') && !params.has('species')
      if (isSeasonalRequest) seasonalRequestUrls.push(requestUrl)
      const data = isSeasonalRequest && params.get('region') === 'London' ? [...sightings, ...seasonalHistory] : sightings
      return route.fulfill({ json: {
        data,
        meta: {
          localAvailable: true,
          externalAvailable: true,
          total: data.length,
          truncated: false,
          speciesOptions: [
            { value: 'Fox/badger tick', label: 'Fox/badger tick', count: 210 },
            { value: 'hedgehog', label: 'Hedgehog tick', count: 1 },
            { value: 'Marsh tick', label: 'Marsh tick', count: 186 },
            { value: 'ornate-cow', label: 'Ornate cow tick', count: 0 },
            { value: 'Passerine tick', label: 'Passerine tick', count: 226 },
            { value: 'sheep', label: 'Sheep tick', count: 2 },
            { value: 'Southern rodent tick', label: 'Southern rodent tick', count: 192 },
            { value: 'Tree-hole tick', label: 'Tree-hole tick', count: 186 },
            { value: 'unknown', label: 'Unknown', count: 1 },
          ],
          placeOptions: [],
        },
      } })
    })

    await page.goto(process.env.TEST_BASE_URL || 'http://localhost:3000/', { waitUntil: 'domcontentloaded' })
    await page.locator('aside h2').filter({ hasText: 'London Park' }).waitFor()
    await page.locator('aside img').waitFor()
    await page.waitForFunction(() => {
      const photo = document.querySelector('aside img')
      return photo?.complete && photo.naturalWidth > 0 && photo.naturalHeight > 0
    })
    await page.getByText('Tick reports through the seasons.', { exact: true }).waitFor()
    const navigation = page.getByRole('navigation', { name: 'Main navigation' })
    assert.equal(await navigation.getByRole('link', { name: 'Sightings Map' }).getAttribute('href'), '#map')
    assert.equal(await navigation.getByRole('link', { name: 'Charts & Trends' }).getAttribute('href'), '#activity')
    assert.equal(await navigation.getByRole('link', { name: 'Field Guide' }).getAttribute('href'), '#learn')
    assert.equal(await navigation.getByRole('link', { name: 'About Ticks' }).getAttribute('href'), '#tick-information')
    assert.equal(await page.getByRole('link', { name: /Anini Pandiyan Sathya/ }).getAttribute('href'), 'https://www.linkedin.com/in/aninisrinivasan/')
    assert.equal(await page.getByRole('link', { name: /Anini Pandiyan Sathya/ }).getAttribute('target'), '_blank')
    await page.getByText('Elanco Placement Program: Technical Task – Full Stack', { exact: true }).waitFor()
    assert.equal(await navigation.isVisible(), true, 'Navigation is available on desktop')
    const fieldGuide = page.locator('#learn')
    await fieldGuide.getByRole('heading', { name: 'Prevent bites and know what to do.' }).waitFor()
    await fieldGuide.getByText(/tuck trousers into socks/).waitFor()
    await fieldGuide.getByText(/fine-tipped tweezers or a tick-removal tool/).waitFor()
    await fieldGuide.getByText(/GP or NHS 111 urgently/).waitFor()
    await fieldGuide.getByRole('link', { name: 'NHS: Lyme disease' }).waitFor()
    const guideNames = async () => page.locator('#species-gallery h3').allTextContents()
    assert.deepEqual(await guideNames(), ['Fox/badger tick', 'Hedgehog tick', 'Marsh tick'])
    assert.equal(await page.locator('.species-gallery-controls [role="status"]').innerText(), 'Showing 1–3 of 8 tick types')
    assert.equal(await page.getByRole('button', { name: 'Previous species' }).isDisabled(), true)
    await page.getByRole('button', { name: 'Next species' }).click()
    assert.deepEqual(await guideNames(), ['Ornate cow tick', 'Passerine tick', 'Sheep tick'])
    await page.getByRole('button', { name: 'Next species' }).click()
    assert.deepEqual(await guideNames(), ['Southern rodent tick', 'Tree-hole tick'])
    assert.equal(await page.getByRole('button', { name: 'Next species' }).isDisabled(), true)
    await page.getByRole('button', { name: 'Previous species' }).click()
    assert.deepEqual(await guideNames(), ['Ornate cow tick', 'Passerine tick', 'Sheep tick'])
    assert.match(await page.locator('section[aria-labelledby="species-guide"]').innerText(), /“Unknown” is a report category, not a species/)
    await page.setViewportSize({ width: 390, height: 844 })
    assert.equal(await navigation.isVisible(), true, 'Navigation remains available on mobile')
    assert.equal(await page.locator('#species-gallery article').count(), 3, 'Mobile also shows the full three-card gallery page')
    assert.equal(await page.getByRole('button', { name: 'Next species' }).isVisible(), true)
    assert.equal(await page.locator('.seasonality-grid .seasonal-bars').count(), 3, 'Mobile also displays location, region, and UK charts')
    assert.equal(await page.locator('.seasonality-card').getByText(/A month with no reports is not evidence/).count(), 0, 'No repeated caveat appears inside each chart')
    await page.setViewportSize({ width: 1440, height: 1000 })

    await page.waitForFunction(() => document.querySelectorAll('.seasonal-bars').length === 3)
    assert.equal(await page.locator('.seasonal-bars').count(), 3, 'Location, region and UK seasonal charts are all shown')
    assert.equal(await page.getByText('A month with no reports is not evidence that ticks are absent. Reporting coverage varies by place and year.').count(), 1, 'Seasonality caveat appears once below all charts')
    assert.equal(await page.locator('.seasonality-grid').evaluate(grid => grid.compareDocumentPosition(grid.parentElement.querySelector('p.mt-5')) & 4), 4, 'Seasonality caveat follows the chart grid')
    for (const chart of await page.locator('.seasonal-bars').all()) {
      assert.equal(await chart.locator(':scope > div').count(), 12, 'Each seasonal graph includes all calendar months')
    }
    assert.match(await page.locator('.seasonal-bars').nth(0).getAttribute('aria-label'), /Jan: 1, Feb: 1, Mar: 2/)
    assert.match(await page.locator('.seasonal-bars').nth(1).getAttribute('aria-label'), /Jan: 1, Feb: 2, Mar: 1/)
    assert.match(await page.locator('.seasonal-bars').nth(2).getAttribute('aria-label'), /Jan: 1, Feb: 2, Mar: 1/)
    assert.match(await page.locator('.seasonal-bars').nth(2).getAttribute('aria-label'), /Nov: 0, Dec: 0/)
    const chartBackgrounds = await page.locator('.seasonality-card').evaluateAll(cards => cards.map(card => getComputedStyle(card).backgroundColor))
    const chartBars = await page.locator('.seasonality-card .seasonal-bars span').evaluateAll(bars => bars.map(bar => getComputedStyle(bar).backgroundColor))
    assert.equal(new Set(chartBackgrounds).size, 3, 'Each chart panel has a distinct color')
    assert.equal(new Set(chartBars).size, 3, 'Each chart uses its own distinct bar color')
    const londonSeasonalRequest = seasonalRequestUrls.find(url => url.searchParams.get('q') === 'London Park')
    assert.ok(londonSeasonalRequest, 'Chart requests all sightings for the selected location')
    assert.equal(londonSeasonalRequest.searchParams.has('from'), false, 'Seasonality is not restricted by date filters')
    assert.equal(londonSeasonalRequest.searchParams.has('species'), false, 'Seasonality includes every reported species')
    assert.ok(seasonalRequestUrls.some(url => url.searchParams.get('region') === 'London' && !url.searchParams.has('q')), 'Region chart requests all sightings for the selected region')
    assert.ok(seasonalRequestUrls.some(url => [...url.searchParams].length === 0), 'UK chart requests all available sightings')

    const londonTimeline = await page.locator('.timeline button').allTextContents()
    assert.equal(londonTimeline.length, 3)
    assert.ok(londonTimeline.every(text => text.includes('London Park')))
    assert.deepEqual(londonTimeline.map(text => text.match(/\d{2}\/\d{2}\/\d{4}/)?.[0]), ['02/02/2026', '07/03/2025', '15/01/2025'])

    await page.locator('.report-marker-shell').nth(1).click()
    await page.locator('aside h2').filter({ hasText: 'Bristol' }).waitFor()
    assert.equal(await page.locator('.timeline button').count(), 1, 'Timeline is scoped to the selected place')
    assert.match(await page.locator('.timeline').innerText(), /Bristol/)
    await page.waitForFunction(() => document.querySelectorAll('.seasonal-bars')[2]?.getAttribute('aria-label')?.includes('Selected location at Bristol') &&
      document.querySelectorAll('.seasonal-bars').length === 3)
    assert.equal(await page.locator('.seasonal-bars').count(), 3)
    assert.equal(await page.locator('.seasonal-bars').nth(2).locator(':scope > div').count(), 12, 'One-month location still gets all twelve seasonal categories')
    assert.match(await page.locator('.seasonal-bars').nth(2).getAttribute('aria-label'), /Mar: 1/)
    assert.match(await page.locator('.seasonal-bars').nth(2).getAttribute('aria-label'), /Jan: 0, Feb: 0/)
    assert.match(await page.locator('.seasonal-bars').nth(1).getAttribute('aria-label'), /Mar: 1/, 'Region chart follows the selected sighting region')

    await page.getByRole('button', { name: 'Copy link' }).click()
    await page.getByRole('status').filter({ hasText: 'Link copied' }).waitFor()
    const copiedUrl = await page.evaluate(() => navigator.clipboard.readText())
    assert.equal(new URL(copiedUrl).searchParams.get('sighting'), 'bristol-recent')
    await page.goto(copiedUrl, { waitUntil: 'domcontentloaded' })
    await page.locator('aside h2').filter({ hasText: 'Bristol' }).waitFor()
    assert.equal(await page.locator('aside dd').nth(1).textContent(), '3 Mar 2026')

    await page.goto(`${process.env.TEST_BASE_URL || 'http://localhost:3000/'}?sighting=missing-record`, { waitUntil: 'domcontentloaded' })
    await page.getByText(/sighting in this link is unavailable/).waitFor()

    await page.getByRole('button', { name: 'Report a sighting', exact: true }).click()
    const dialog = page.getByRole('dialog')
    const photoInput = dialog.locator('input[type="file"][name="photo"]')
    assert.equal(await photoInput.count(), 1)
    assert.equal(await photoInput.getAttribute('accept'), 'image/jpeg,image/png,image/webp')
    await dialog.getByText(/Photos are shown with the report/).waitFor()
    await dialog.locator('[name=locationName]').fill('Photo Test Park')
    await dialog.locator('[name=observedAt]').fill(new Date().toISOString().slice(0, 10))
    await dialog.locator('[name=region]').selectOption('London')
    await photoInput.setInputFiles({
      name: 'tick-photo.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l3sAAAAASUVORK5CYII=', 'base64'),
    })
    await dialog.getByRole('button', { name: 'Submit for review' }).click()
    await page.getByRole('status').filter({ hasText: 'Report saved successfully' }).waitFor()
    assert.deepEqual(errors, [])
    console.log('P2 browser checks passed: responsive navigation/footer, informative field guide, three distinct seasonal charts, all eight species in a navigable gallery, selected-place timeline/sharing, multipart photo submission, and saved photo display.')
  } finally {
    await browser.close()
  }
})().catch(error => {
  console.error(error)
  process.exitCode = 1
})
