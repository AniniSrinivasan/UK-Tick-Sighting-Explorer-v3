const { chromium } = require('playwright')
const assert = require('node:assert/strict')
;(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    // Deterministic tiles isolate sizing from the external tile server's availability.
    await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#b6d6df"/></svg>' }))
    await page.route('**/api/sightings*', route => route.fulfill({ json: { data: [{ id: 'one', observedAt: '2026-01-01T00:00:00Z', locationName: 'London', region: 'London', latitude: 51.5, longitude: 0, species: 'unknown', severity: 'low', source: 'community' }], meta: { localAvailable: true, externalAvailable: true, total: 1, speciesOptions: [{ value: 'unknown', label: 'Unknown', count: 1 }], placeOptions: [{ value: 'London', label: 'London', kind: 'place' }] } } }))
    await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' })
    await page.locator('.leaflet-tile-loaded').first().waitFor()
    const covered = () => page.waitForFunction(() => {
      const map = document.querySelector('.leaflet-map').getBoundingClientRect()
      const tiles = [...document.querySelectorAll('.leaflet-tile-loaded')].filter(img => img.complete && img.naturalWidth > 0).map(img => img.getBoundingClientRect())
      for (let x = map.left + 5; x < map.right - 5; x += 80) {
        for (const y of [map.top + 5, map.top + map.height / 2, map.bottom - 5]) {
          if (!tiles.some(t => t.left <= x && t.right >= x && t.top <= y && t.bottom >= y)) return false
        }
      }
      return true
    }, null, { timeout: 5000 })
    await covered()
    // Simulate the sidebar increasing grid height after data arrives, without window resize.
    await page.locator('#map').evaluate(el => { el.style.minHeight = '1600px' })
    await covered()
    await page.getByRole('button', { name: 'Reported tick density', exact: true }).click()
    await page.waitForFunction(() => {
      const map = document.querySelector('.leaflet-map')
      const canvas = document.querySelector('.leaflet-heatmap-layer')
      return canvas && canvas.height === map.clientHeight && canvas.width === map.clientWidth
    }, null, { timeout: 5000 })
    await page.locator('#map').evaluate(el => { el.style.minHeight = '' })
    await covered()
    await page.setViewportSize({ width: 390, height: 844 })
    await covered()
    assert.deepEqual(errors, [])
    console.log('Map resize checks passed: loaded tiles cover top/middle/bottom after container growth, shrink and mobile resize; heatmap matches map dimensions; no runtime errors.')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
