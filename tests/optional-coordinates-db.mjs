// Verifies the approved schema update without creating or changing report records.
import mysql from 'mysql2/promise'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
const db = await mysql.createConnection({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'dataWatch',
})
try {
  const snapshot = async () => {
    const [rows] = await db.query('SELECT id, latitude, longitude FROM sightings ORDER BY id')
    return createHash('sha256').update(JSON.stringify(rows)).digest('hex')
  }
  const before = await snapshot()
  const response = await fetch(`${process.env.TEST_BASE_URL || 'http://localhost:3000'}/api/sightings`)
  assert.equal(response.status, 200)
  assert.equal((await response.json()).meta.localAvailable, true)
  const [columns] = await db.query("SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sightings' AND COLUMN_NAME IN ('latitude', 'longitude')")
  assert.equal(columns.length, 2)
  for (const column of columns) {
    assert.equal(column.IS_NULLABLE, 'YES')
    assert.equal(column.COLUMN_TYPE, 'decimal(9,6)')
  }
  assert.equal(await snapshot(), before, 'Existing report IDs and coordinates must be unchanged')
  console.log('Both coordinate columns allow NULL; precision and all existing IDs/coordinate values are unchanged.')
} finally { await db.end() }
