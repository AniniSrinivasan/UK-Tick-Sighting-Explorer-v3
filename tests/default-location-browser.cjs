// check the initial location and shared sighting selection
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
;(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    const page = await browser.newPage()
    const sightings = ['Richmond Park', 'London'].map((locationName, index) => ({ id: String(index), locationName, region: 'London', observedAt: '2026-05-01', latitude: 51.5 + index / 10, longitude: -0.1, species: 'unknown', severity: 'low', source: 'community' }))
    await page.route('**/api/sightings*', route => route.fulfill({ json: { data: sightings, meta: { total: 2, localAvailable: true, externalAvailable: true, speciesOptions: [], placeOptions: [] } } }))
    const base = process.env.TEST_BASE_URL || 'http://localhost:3000'
    await page.goto(base)
    const locationHeading = page.locator('.seasonality-card--location h2')
    await locationHeading.filter({ hasText: /^London$/ }).waitFor()
    assert.equal(await page.locator('aside h2').innerText(), 'London')
    await page.goto(`${base}/?sighting=0`)
    await locationHeading.filter({ hasText: /^Richmond Park$/ }).waitFor()
    await page.reload()
    await locationHeading.filter({ hasText: /^Richmond Park$/ }).waitFor()
    await page.goto(base)
    await locationHeading.filter({ hasText: /^London$/ }).waitFor()
    await page.reload()
    await locationHeading.filter({ hasText: /^London$/ }).waitFor()
    console.log('Passed: London defaults ahead of Richmond Park, reload retains London default, explicit shared report links still work.')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
