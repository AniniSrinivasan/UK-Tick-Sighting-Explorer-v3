const { chromium } = require('playwright')
const assert = require('node:assert/strict')

;(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/sightings*', route => route.fulfill({ json: {
      data: ['2026-05-01', '2026-05-02', '2024-01-01'].map((observedAt, index) => ({
        id: String(index), observedAt, locationName: 'Cardiff', region: 'Wales',
        latitude: 51.48, longitude: -3.18, species: 'unknown', severity: 'low', source: 'community',
      })),
      meta: { total: 3, localAvailable: true, externalAvailable: true, speciesOptions: [], placeOptions: [] },
    } }))
    await page.goto(process.env.TEST_BASE_URL || 'http://localhost:3000')
    const chart = page.locator('.seasonality-card--uk')
    const previous = chart.getByRole('button', { name: 'Previous UK report year' })
    const next = chart.getByRole('button', { name: 'Next UK report year' })
    await chart.getByRole('status').filter({ hasText: '2026' }).waitFor()
    assert.equal(await next.isDisabled(), true)
    assert.match(await chart.getByRole('img').getAttribute('aria-label'), /in 2026: Jan: 0.*May: 2/)
    await previous.click()
    await chart.getByText('No UK sightings are available for 2025.', { exact: true }).waitFor()
    assert.equal(await chart.locator('.seasonal-bars > div').count(), 12)
    await previous.click()
    assert.match(await chart.getByRole('img').getAttribute('aria-label'), /in 2024: Jan: 1.*May: 0/)
    assert.equal(await previous.isDisabled(), true)
    await next.click()
    await next.click()
    assert.equal(await next.isDisabled(), true)
    await page.locator('.seasonality-card--region svg').waitFor()
    assert.match(await page.locator('.seasonality-card--region svg').getAttribute('aria-label'), /in 2026: Jan: 0.*May: 2/)
    for (const [tone, label] of [['region', 'regional'], ['location', 'location']]) {
      const otherChart = page.locator(`.seasonality-card--${tone}`)
      await otherChart.getByRole('button', { name: `Previous ${label} report year` }).click()
      await otherChart.getByText(`No ${label} sightings are available for 2025.`, { exact: true }).waitFor()
      await otherChart.getByRole('button', { name: `Previous ${label} report year` }).click()
      assert.match(await otherChart.getByRole('img').getAttribute('aria-label'), /in 2024: Jan: 1.*May: 0/)
      assert.equal(await otherChart.getByRole('button', { name: `Previous ${label} report year` }).isDisabled(), true)
      assert.match(await chart.getByRole('img').getAttribute('aria-label'), /in 2026: Jan: 0.*May: 2/, 'UK selection stays independent')
      await otherChart.getByRole('button', { name: `Next ${label} report year` }).click()
      await otherChart.getByRole('button', { name: `Next ${label} report year` }).click()
      assert.equal(await otherChart.getByRole('button', { name: `Next ${label} report year` }).isDisabled(), true)
    }
    await page.setViewportSize({ width: 390, height: 844 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    assert.deepEqual(errors, [])
    console.log('Passed: latest-year default, yearly counts, empty year, boundary arrows, independent UK/regional/location navigation, mobile layout.')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
