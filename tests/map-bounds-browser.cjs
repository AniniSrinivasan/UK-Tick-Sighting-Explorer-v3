// check UK map bounds and the reset view control
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
;(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(() => {
      let leaflet
      Object.defineProperty(window, 'L', { configurable: true, get: () => leaflet, set: value => {
        leaflet = value
        value.Map.addInitHook(function () { window.testMap = this })
      } })
    })
    await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#b6d6df"/></svg>' }))
    await page.route('**/api/sightings*', route => route.fulfill({ json: { data: [{ id: 'one', observedAt: '2026-01-01', locationName: 'London', region: 'London', latitude: 51.5, longitude: 0, species: 'unknown', severity: 'low', source: 'community' }], meta: { localAvailable: true, externalAvailable: true, total: 1, speciesOptions: [], placeOptions: [] } } }))
    await page.goto(process.env.TEST_BASE_URL || 'http://localhost:3000')
    await page.locator('.report-marker').waitFor()
    const reset = page.getByRole('button', { name: 'Reset map to UK view' })
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      await reset.click()
      const original = await page.evaluate(() => ({ zoom: testMap.getZoom(), center: testMap.getCenter(), ukVisible: testMap.getBounds().contains([[49.8, -8.7], [61, 2]]) }))
      assert.ok(original.ukVisible, 'The full UK fits in the default view')
      await page.evaluate(() => testMap.setZoom(1, { animate: false }))
      assert.equal(await page.evaluate(() => testMap.getZoom()), original.zoom, 'Cannot zoom out to world view')
      await page.evaluate(() => { testMap.setZoom(9, { animate: false }); testMap.panTo([0, 120], { animate: false }) })
      await page.waitForFunction(() => testMap.options.maxBounds.contains(testMap.getCenter()))
      await reset.click()
      const restored = await page.evaluate(() => ({ zoom: testMap.getZoom(), center: testMap.getCenter() }))
      assert.equal(restored.zoom, original.zoom)
      // Leaflet rounds the centre to pixels during container resizing.
      const offset = await page.evaluate(({ original, restored }) => testMap.project(original.center, original.zoom).distanceTo(testMap.project(restored.center, restored.zoom)), { original, restored })
      assert.ok(offset < 1.5, 'Reset restores the default centre within pixel rounding')

      // A running Leaflet zoom previously swallowed the reset and left the map zoomed in.
      for (const mode of ['Reported tick density', 'Sightings']) {
        await page.getByRole('button', { name: mode, exact: true }).click()
        await page.evaluate(zoom => testMap.setView([51.5, -0.1], zoom + 2, { animate: true }), original.zoom)
        await page.waitForFunction(() => testMap._animatingZoom === true)
        await reset.click()
        await page.waitForFunction(zoom => !testMap._animatingZoom && testMap.getZoom() === zoom, original.zoom)
        const resetAfterZoom = await page.evaluate(() => ({ center: testMap.getCenter(), ukVisible: testMap.getBounds().contains([[49.8, -8.7], [61, 2]]) }))
        assert.ok(resetAfterZoom.ukVisible, 'Reset during an animated zoom restores the full UK')
        const resetOffset = await page.evaluate(({ original, center }) => testMap.project(original.center, original.zoom).distanceTo(testMap.project(center, original.zoom)), { original, center: resetAfterZoom.center })
        assert.ok(resetOffset < 1.5, 'Reset during an animated zoom restores the UK centre')
        // Resetting an already restored map must not interfere with the next user zoom.
        await reset.click()
        await page.evaluate(zoom => testMap.setZoom(zoom + 1, { animate: false }), original.zoom)
        assert.equal(await page.evaluate(() => testMap.getZoom()), original.zoom + 1)
        await reset.click()
      }
    }
    const photo = page.getByAltText('Two dogs and two cats together on a mossy log in woodland')
    await photo.scrollIntoViewIfNeeded()
    await photo.evaluate(img => img.decode())
    assert.ok(await photo.evaluate(img => img.naturalWidth > 0 && img.naturalHeight > 0))
    assert.deepEqual(errors, [])
    console.log('Passed: UK bounds and zoom limits, reset after zoom/pan and during animated zooms in both modes, repeated reset, desktop/mobile, woodland pet image, no runtime errors.')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
