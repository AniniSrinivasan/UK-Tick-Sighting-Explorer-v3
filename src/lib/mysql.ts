import { randomUUID } from 'node:crypto'
import { SOURCE_LIMIT } from './sightings-domain'
import mysql, { type Pool, type RowDataPacket } from 'mysql2/promise'

const database = process.env.MYSQL_DATABASE || 'dataWatch'
// database connection settings
const connectionOptions = {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  connectTimeout: 1000,
}

let pool: Pool | undefined
let initialized: Promise<Pool> | undefined

// starter sightings for the demo
const sampleSightings = [
  ['sample-richmond', '2025-05-22 12:00:00', 'Richmond Park', 'London', 51.44, -0.28, 'sheep', 'high', 'Found after walking through long grass near the deer enclosure.'],
  ['sample-new-forest', '2025-05-18 12:00:00', 'New Forest', 'South East', 50.87, -1.58, 'hedgehog', 'moderate', 'Single adult tick reported on a dog.'],
  ['sample-loch-lomond', '2025-05-14 12:00:00', 'Loch Lomond', 'Scotland', 56.1, -4.63, 'sheep', 'high', 'Multiple ticks seen along a woodland trail.'],
  ['sample-brecon', '2025-04-29 12:00:00', 'Brecon Beacons', 'Wales', 51.88, -3.44, 'unknown', 'low', 'Reported beside a popular walking route.'],
]

// create the database and prepare the sightings table
async function initialize(): Promise<Pool> {
  const connection = await mysql.createConnection(connectionOptions)
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database.replaceAll('`', '')}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
  await connection.end()

  pool = mysql.createPool({
    ...connectionOptions,
    database,
    connectionLimit: 10,
    waitForConnections: true,
    dateStrings: true,
    decimalNumbers: true,
  })
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sightings (
      id VARCHAR(36) PRIMARY KEY,
      observed_at DATETIME NOT NULL,
      location_name VARCHAR(120) NOT NULL,
      region VARCHAR(40) NOT NULL,
      latitude DECIMAL(9,6) NULL,
      longitude DECIMAL(9,6) NULL,
      species ENUM('sheep','hedgehog','ornate-cow','unknown') NOT NULL,
      severity ENUM('low','moderate','high') NOT NULL,
      notes TEXT NULL,
      photo_url TEXT NULL,
      photo_width INT NULL,
      photo_height INT NULL,
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
  const [coordinateColumns] = await pool.query<RowDataPacket[]>(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sightings' AND COLUMN_NAME IN ('latitude', 'longitude') AND IS_NULLABLE = 'NO'",
  )
  const coordinateChanges = ['latitude', 'longitude']
    .filter((name) => coordinateColumns.some((column) => column.COLUMN_NAME === name))
    .map((name) => `MODIFY COLUMN ${name} DECIMAL(9,6) NULL`)
  if (coordinateChanges.length) await pool.query(`ALTER TABLE sightings ${coordinateChanges.join(', ')}`)

  const photoColumns = [
    ['photo_url', 'TEXT NULL'],
    ['photo_width', 'INT NULL'],
    ['photo_height', 'INT NULL'],
  ] as const
  const [existingPhotoColumns] = await pool.query<RowDataPacket[]>(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sightings' AND COLUMN_NAME IN ('photo_url', 'photo_width', 'photo_height')",
  )
  const existingPhotoColumnNames = new Set(existingPhotoColumns.map((column) => column.COLUMN_NAME))
  const missingPhotoColumns = photoColumns.filter(([name]) => !existingPhotoColumnNames.has(name))
  if (missingPhotoColumns.length) {
    await pool.query(`ALTER TABLE sightings ${missingPhotoColumns.map(([name, definition]) => `ADD COLUMN ${name} ${definition}`).join(', ')}`)
  }

  for (const row of sampleSightings) {
    await pool.execute(
      `INSERT IGNORE INTO sightings
       (id, observed_at, location_name, region, latitude, longitude, species, severity, notes, source, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'community', 'verified')`,
      row,
    )
  }
  return pool
}

// reuse the database connection and retry failed setup
export function getDatabase(): Promise<Pool> {
  initialized ??= initialize().catch(async error => {
    await pool?.end().catch(() => undefined)
    pool = undefined
    initialized = undefined
    throw error
  })
  return initialized
}

export type DatabaseSighting = {
  id: string
  observedAt: string
  locationName: string
  region: string
  latitude: number | null
  longitude: number | null
  species: string
  severity: string
  notes?: string
  photoUrl?: string
  photoWidth?: number
  photoHeight?: number
  source: 'community' | 'elanco'
  reportCount?: number
}

// load community sightings using search filters
export async function listSightings(filters: {
  from?: string | null
  to?: string | null
  region?: string | null
  species?: string | null
  query?: string | null
} = {}): Promise<DatabaseSighting[]> {
  const db = await getDatabase()
  const clauses: string[] = []
  const values: (string | number)[] = []
  if (filters.from) { clauses.push('observed_at >= ?'); values.push(`${filters.from} 00:00:00`) }
  if (filters.to) { clauses.push('observed_at <= ?'); values.push(`${filters.to} 23:59:59`) }
  if (filters.region && filters.region !== 'All regions') { clauses.push('region = ?'); values.push(filters.region) }
  if (filters.species && filters.species !== 'All species') { clauses.push('species = ?'); values.push(filters.species) }
  if (filters.query) {
    clauses.push("LOCATE(?, LOWER(CONCAT(location_name, ' ', region))) > 0")
    values.push(filters.query.toLowerCase())
  }
  const [rows] = await db.query<RowDataPacket[]>({ sql: `SELECT id, DATE_FORMAT(observed_at, '%Y-%m-%dT%H:%i:%sZ') AS observedAt,
      location_name AS locationName, region, latitude, longitude, species, severity, notes,
      photo_url AS photoUrl, photo_width AS photoWidth, photo_height AS photoHeight, source
     FROM sightings ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
     ORDER BY observed_at DESC, id ASC LIMIT ${SOURCE_LIMIT + 1}`,
    values, timeout: 5000 },
  )
  return rows as DatabaseSighting[]
}

// save a community report with pending status
export async function insertSighting(input: Omit<DatabaseSighting, 'id' | 'source'>): Promise<DatabaseSighting> {
  const db = await getDatabase()
  const id = randomUUID()
  await db.execute(
    `INSERT INTO sightings
     (id, observed_at, location_name, region, latitude, longitude, species, severity, notes, photo_url, photo_width, photo_height, source, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'community', 'pending')`,
    [id, input.observedAt.slice(0, 19).replace('T', ' '), input.locationName, input.region, input.latitude, input.longitude, input.species, input.severity, input.notes ?? null, input.photoUrl ?? null, input.photoWidth ?? null, input.photoHeight ?? null],
  )
  return { id, ...input, source: 'community' }
}
