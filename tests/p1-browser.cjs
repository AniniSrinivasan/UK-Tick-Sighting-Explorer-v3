const { chromium } = require('playwright')
const assert = require('node:assert/strict')
;(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    const queries = []
    const rows = Array.from({ length: 650 }, (_, i) => ({ id: String(i), observedAt: i === 649 ? '2020-01-01T00:00:00Z' : '2026-01-01T00:00:00Z', locationName: i === 649 ? 'Older Target Park' : 'London Park', region: 'London', latitude: 51.5, longitude: 0, species: i % 2 ? 'sheep' : 'unknown', severity: 'low', source: 'community', reportCount: 999 }))
    await page.route('**/api/sightings*', async route => {
      const params = new URL(route.request().url()).searchParams
      queries.push(params)
      const q = params.get('q') || ''
      const from = params.get('from') || '', to = params.get('to') || ''
      if (from && to && from > to) return route.fulfill({ status: 400, json: { error: 'Please check the search filters.', errors: { to: 'To must be on or after From.' } } })
      const matches = rows.filter(row => (!q || row.locationName.toLowerCase().includes(q.toLowerCase())) && (!from || row.observedAt >= from) && (!to || row.observedAt.slice(0,10) <= to) && (!params.get('species') || params.get('species') === row.species))
      await route.fulfill({ json: { data: matches, meta: {
        localAvailable: true, externalAvailable: true, total: matches.length, truncated: false,
        speciesOptions: [], placeOptions: [],
      } } })
    })
    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' })
    await page.getByText('650 matching reports', { exact: true }).waitFor()
    await page.locator('.report-marker').first().waitFor()
    assert.equal((await page.locator('.report-marker').allTextContents()).reduce((sum, count) => sum + Number(count), 0), 650, 'Map must count all matches and ignore broad reportCount')
    assert.equal(await page.getByRole('navigation', { name: 'Report pages' }).count(), 0)
    assert.equal(queries.at(-1).has('page'), false)
    assert.equal(queries.at(-1).has('pageSize'), false)
    await page.getByPlaceholder('Search a place or region').fill('Older Target')
    await page.getByText('1 matching reports', { exact: true }).waitFor()
    await page.locator('aside h2').filter({ hasText: 'Older Target Park' }).waitFor()
    const olderTargetQuery = queries.findLast(params => params.get('q') === 'Older Target' && !params.has('region'))
    assert.ok(olderTargetQuery, 'Search request includes the exact place query')
    assert.equal(olderTargetQuery.has('page'), false)
    assert.equal(await page.locator('.report-marker').textContent(), '1')
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
    await page.getByText('650 matching reports', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Reported tick density', exact: true }).click()
    await page.locator('.leaflet-heatmap-layer').waitFor()
    await page.locator('.date-control input').nth(0).fill('2026-01-01')
    await page.locator('.date-control input').nth(1).fill('2025-01-01')
    await page.getByText('To must be on or after From.', { exact: false }).first().waitFor()
    assert.equal(await page.locator('.leaflet-heatmap-layer').count(), 0)
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
    await page.getByText('650 matching reports', { exact: true }).waitFor()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.locator('#map').scrollIntoViewIfNeeded()
    await page.screenshot({ path: '/tmp/tickwatch-p1-mobile.png', fullPage: true })
    assert.deepEqual(errors, [])
    console.log('P1 browser checks passed: query requests, single-view totals, finding an older report beyond 500, full-result marker counts, density, visible date errors and mobile rendering.')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
