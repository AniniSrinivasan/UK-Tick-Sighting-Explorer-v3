import mysql from 'mysql2/promise'

const database = process.env.MYSQL_DATABASE || 'dataWatch'
const options = {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
}
const connection = await mysql.createConnection(options)
await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database.replaceAll('`', '')}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
await connection.query(`USE \`${database.replaceAll('`', '')}\``)
await connection.query(`
  CREATE TABLE IF NOT EXISTS sightings (
    id VARCHAR(36) PRIMARY KEY, observed_at DATETIME NOT NULL,
    location_name VARCHAR(120) NOT NULL, region VARCHAR(40) NOT NULL,
    latitude DECIMAL(9,6) NULL, longitude DECIMAL(9,6) NULL,
    species ENUM('sheep','hedgehog','ornate-cow','unknown') NOT NULL,
    severity ENUM('low','moderate','high') NOT NULL, notes TEXT NULL,
    source ENUM('community','elanco') NOT NULL DEFAULT 'community',
    status ENUM('pending','verified','rejected') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_sightings_observed_at (observed_at),
    INDEX idx_sightings_region_species (region, species),
    INDEX idx_sightings_location (location_name)
  ) ENGINE=InnoDB
`)
  // Relax only nullability; keep precision and every existing coordinate unchanged.
  const [coordinateColumns] = await connection.query(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sightings' AND COLUMN_NAME IN ('latitude', 'longitude') AND IS_NULLABLE = 'NO'",
  )
  const coordinateChanges = ['latitude', 'longitude']
    .filter((name) => coordinateColumns.some((column) => column.COLUMN_NAME === name))
    .map((name) => `MODIFY COLUMN ${name} DECIMAL(9,6) NULL`)
  if (coordinateChanges.length) await connection.query(`ALTER TABLE sightings ${coordinateChanges.join(', ')}`)

const samples = [
  ['sample-richmond','2025-05-22 12:00:00','Richmond Park','London',51.44,-0.28,'sheep','high','Found after walking through long grass near the deer enclosure.'],
  ['sample-new-forest','2025-05-18 12:00:00','New Forest','South East',50.87,-1.58,'hedgehog','moderate','Single adult tick reported on a dog.'],
  ['sample-loch-lomond','2025-05-14 12:00:00','Loch Lomond','Scotland',56.1,-4.63,'sheep','high','Multiple ticks seen along a woodland trail.'],
  ['sample-brecon','2025-04-29 12:00:00','Brecon Beacons','Wales',51.88,-3.44,'unknown','low','Reported beside a popular walking route.'],
]
for (const row of samples) {
  await connection.execute(`INSERT IGNORE INTO sightings
    (id, observed_at, location_name, region, latitude, longitude, species, severity, notes, source, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'community', 'verified')`, row)
}
const [[result]] = await connection.query('SELECT COUNT(*) AS count FROM sightings')
console.log(`MySQL ready: ${database}.sightings (${result.count} rows)`)
await connection.end()
