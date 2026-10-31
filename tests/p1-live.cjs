// Read-only integration checks. Start the compatibility proxy with API_PORT=4001 first.
const assert = require('node:assert/strict')
const base = process.env.TEST_BASE_URL || 'http://localhost:3000'
const proxy = process.env.TEST_PROXY_URL || 'http://localhost:4001'
const read = async (url, options) => {
  const response = await fetch(url, options)
  return { status: response.status, body: await response.json() }
}
;(async () => {
  const first = await read(`${base}/api/sightings?pageSize=2`)
  assert.equal(first.status, 200)
  const insights = await read(`${base}/api/insights`)
  assert.equal(insights.status, 200)
  assert.equal(first.body.meta.total, insights.body.total)
  for (const suffix of ['?pageSize=2', '?q=London&pageSize=2', '?from=2026-02-30']) {
    const direct = await read(`${base}/api/sightings${suffix}`)
    const forwarded = await read(`${proxy}/api/sightings${suffix}`)
    assert.deepEqual(forwarded, direct)
  }
  const filteredList = await read(`${base}/api/sightings?q=London`)
  const filteredInsights = await read(`${proxy}/api/sightings/insights?q=London`)
  assert.equal(filteredList.body.meta.total, filteredInsights.body.total)
  const options = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
  assert.deepEqual(await read(`${proxy}/api/sightings`, options), await read(`${base}/api/sightings`, options))
  console.log(JSON.stringify({ liveTotal: insights.body.total, filteredTotal: filteredInsights.body.total, sources: { local: first.body.meta.localAvailable, external: first.body.meta.externalAvailable }, proxyMatches: true, validationMatches: true }))
})().catch(error => { console.error(error); process.exitCode = 1 })
