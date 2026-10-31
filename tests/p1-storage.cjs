const assert = require('node:assert/strict')
const createLoader = require('./load-ts.cjs')
const queries = []
const db = {
  query: async statement => {
    if (typeof statement === 'object') { queries.push(statement); return [[], []] }
    return [[], []]
  },
  execute: async () => [[], []],
  end: async () => {},
}
const mysql = { createConnection: async () => db, createPool: () => db }
const load = createLoader({ overrides: { 'mysql2/promise': mysql } })
;(async () => {
  const { listSightings } = load('src/lib/mysql.ts')
  await listSightings({ query: 'Older %_ Target', from: '2020-01-01', to: '2020-12-31', region: 'London', species: 'sheep' })
  const statement = queries[0]
  assert.match(statement.sql, /WHERE.*observed_at >= \?.*observed_at <= \?.*region = \?.*species = \?.*LOCATE\(\?,/s)
  assert.match(statement.sql, /ORDER BY observed_at DESC, id ASC LIMIT 10001/)
  assert(!statement.sql.includes('COUNT(*) OVER'))
  assert.equal(statement.values.at(-1), 'older %_ target', 'LOCATE treats SQL wildcards literally')
  assert.equal(statement.timeout, 5000)
  console.log('P1 SQL adapter checks passed: parameterized filters before limit, literal substring search, bounded query timeout and no unfiltered count weights.')
})().catch(error => { console.error(error); process.exitCode = 1 })
