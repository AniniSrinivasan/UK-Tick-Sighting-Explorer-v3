import { createHash } from 'node:crypto'
import type { DatabaseSighting } from './mysql'

export type Sighting = DatabaseSighting & { originalSpecies?: string }
// maximum records to load from each data source
export const SOURCE_LIMIT = 10000
export const regions = ['Scotland', 'North East', 'North West', 'Yorkshire', 'Midlands', 'Wales', 'East of England', 'London', 'South East', 'South West', 'Northern Ireland']
export const species = ['sheep', 'hedgehog', 'ornate-cow', 'unknown']
export const severity = ['low', 'moderate', 'high']

const cityLocations: Record<string, { latitude: number; longitude: number; region: string }> = {
  Birmingham: { latitude: 52.4862, longitude: -1.8904, region: 'Midlands' },
  Bristol: { latitude: 51.4545, longitude: -2.5879, region: 'South West' },
  Cardiff: { latitude: 51.4816, longitude: -3.1791, region: 'Wales' },
  Edinburgh: { latitude: 55.9533, longitude: -3.1883, region: 'Scotland' },
  Glasgow: { latitude: 55.8642, longitude: -4.2518, region: 'Scotland' },
  Leeds: { latitude: 53.8008, longitude: -1.5491, region: 'Yorkshire' },
  Leicester: { latitude: 52.6369, longitude: -1.1398, region: 'Midlands' },
  Liverpool: { latitude: 53.4084, longitude: -2.9916, region: 'North West' },
  London: { latitude: 51.5074, longitude: -0.1278, region: 'London' },
  Manchester: { latitude: 53.4808, longitude: -2.2426, region: 'North West' },
  Newcastle: { latitude: 54.9783, longitude: -1.6178, region: 'North East' },
  Nottingham: { latitude: 52.9548, longitude: -1.1581, region: 'Midlands' },
  Sheffield: { latitude: 53.3811, longitude: -1.4701, region: 'Yorkshire' },
  Southampton: { latitude: 50.9097, longitude: -1.4044, region: 'South East' },
}
const cityLocationLookup = Object.fromEntries(
  Object.entries(cityLocations).map(([name, location]) => [name.toLowerCase(), location]),
)

export type Filters = { from: string; to: string; region: string; species: string; query: string }
export class QueryError extends Error {
  constructor(public errors: Record<string, string>) { super('Please check the search filters.') }
}
// check that a date is a valid calendar date
export function validDate(value: string) {
  const date = new Date(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= '1000-01-01' && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}
// validate search filters from the request URL
export function parseFilters(params: URLSearchParams): Filters {
  const errors: Record<string, string> = {}
  const from = params.get('from') || '', to = params.get('to') || ''
  if (from && !validDate(from)) errors.from = 'From must be a valid date (YYYY-MM-DD).'
  if (to && !validDate(to)) errors.to = 'To must be a valid date (YYYY-MM-DD).'
  if (from && to && from > to) errors.to = 'To must be on or after From.'
  const region = params.get('region') === 'All regions' ? '' : (params.get('region') || '')
  const kind = params.get('species') === 'All species' ? '' : (params.get('species') || '').trim().replace(/\s+/g, ' ')
  if (region && ![...regions, 'Unknown'].includes(region)) errors.region = 'Choose a supported UK region.'
  if (kind.length > 120) errors.species = 'Species must be at most 120 characters.'
  const query = (params.get('q') || '').trim().replace(/\s+/g, ' ').toLowerCase()
  if (query.length > 120) errors.q = 'Search must be at most 120 characters.'
  if (Object.keys(errors).length) throw new QueryError(errors)
  return { from, to, region, species: kind, query }
}

const text = (value: unknown) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
const decimal = (value: unknown, min: number, max: number) => {
  const number = typeof value === 'number' ? value : typeof value === 'string' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()) ? Number(value) : NaN
  return Number.isFinite(number) && number >= min && number <= max ? number : null
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
export type Diagnostics = { received: number; discarded: number; duplicates: number; conflictingIds: number; inferredCoordinates: number; missingCoordinates: number; unknownSpecies: number; unknownSeverity: number; unknownRegion: number; assumedUtc: number }
// process source data into a shared sighting format
export function normalizeRows(rows: unknown[], origin: 'local' | 'external') {
  const diagnostics: Diagnostics = { received: rows.length, discarded: 0, duplicates: 0, conflictingIds: 0, inferredCoordinates: 0, missingCoordinates: 0, unknownSpecies: 0, unknownSeverity: 0, unknownRegion: 0, assumedUtc: 0 }
  const records = new Map<string, Sighting>()
  for (const value of rows) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) { diagnostics.discarded++; continue }
    const row = value as Record<string, unknown>
    const locationName = text(row.locationName ?? row.location ?? row.city)
    const date = text(row.observedAt ?? row.date ?? row.createdAt)
    // The upstream documents zone-less timestamps. Interpret these explicitly as UTC, never host-local time.
    if (!locationName || locationName.length > 120 || !validDate(date.slice(0, 10)) ||
      !/^\d{4}-\d{2}-\d{2}(?:T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(date) || !Number.isFinite(Date.parse(date.length > 10 && !/(Z|[+-]\d{2}:\d{2})$/.test(date) ? `${date}Z` : date))) {
      diagnostics.discarded++; continue
    }
    const assumedUtc = date.length > 10 && !/(Z|[+-]\d{2}:\d{2})$/.test(date)
    if (assumedUtc) diagnostics.assumedUtc++
    const known = cityLocationLookup[locationName.toLowerCase()]
    let latitude = decimal(row.latitude ?? row.lat, -90, 90)
    let longitude = decimal(row.longitude ?? row.lng ?? row.lon, -180, 180)
    // Only infer a complete city-centre pair when neither coordinate was supplied.
    const supplied = [row.latitude ?? row.lat, row.longitude ?? row.lng ?? row.lon]
    if (origin === 'external' && known && supplied.every(value => value == null || value === '')) {
      latitude = known.latitude; longitude = known.longitude; diagnostics.inferredCoordinates++
    }
    if (latitude === null || longitude === null) diagnostics.missingCoordinates++
    const rawSpecies = text(row.species).toLowerCase()
    const kind = ({ 'sheep tick': 'sheep', 'ixodes ricinus': 'sheep', 'hedgehog tick': 'hedgehog', 'ixodes hexagonus': 'hedgehog', 'ornate cow tick': 'ornate-cow', 'dermacentor reticulatus': 'ornate-cow' } as Record<string, string>)[rawSpecies] ?? rawSpecies
    const normalizedSpecies = species.includes(kind) ? kind : 'unknown'
    if (normalizedSpecies === 'unknown') diagnostics.unknownSpecies++
    const rawSeverity = text(row.severity).toLowerCase()
    const normalizedSeverity = severity.includes(rawSeverity) ? rawSeverity : 'unknown'
    if (normalizedSeverity === 'unknown') diagnostics.unknownSeverity++
    const rawRegion = text(row.region)
    const region = regions.find(region => region.toLowerCase() === rawRegion.toLowerCase()) ?? (!rawRegion ? known?.region : undefined) ?? 'Unknown'
    if (region === 'Unknown') diagnostics.unknownRegion++
    const record = {
      observedAt: new Date(assumedUtc ? `${date}Z` : date).toISOString(), locationName, region, latitude, longitude,
      species: normalizedSpecies, severity: normalizedSeverity,
      originalSpecies: normalizedSpecies === 'unknown' && rawSpecies && rawSpecies !== 'unknown' ? text(row.species) : undefined,
      notes: text(row.notes).slice(0, 1000) || undefined,
      photoMediaId: origin === 'local' ? text(row.photoMediaId) || undefined : undefined,
      photoUrl: origin === 'local' ? text(row.photoUrl) || undefined : undefined,
      photoWidth: origin === 'local' ? decimal(row.photoWidth, 1, 100000) ?? undefined : undefined,
      photoHeight: origin === 'local' ? decimal(row.photoHeight, 1, 100000) ?? undefined : undefined,
      source: origin === 'external' ? 'elanco' as const : row.source === 'elanco' ? 'elanco' as const : 'community' as const,
    }
    const upstreamId = typeof row.id === 'string' ? row.id.trim() : typeof row.id === 'number' && Number.isFinite(row.id) ? String(row.id) : ''
    const id = `${origin}-${upstreamId ? `id-${upstreamId}` : `hash-${hash(JSON.stringify({ ...record, sourceSpecies: rawSpecies, latinName: text(row.latinName).toLowerCase(), sourceSeverity: rawSeverity }))}`}`
    const item: Sighting = { id, ...record }
    const previous = records.get(id)
    if (previous) {
      diagnostics.duplicates++
      if (JSON.stringify(previous) !== JSON.stringify(item)) diagnostics.conflictingIds++
      // Deterministic winner for conflicting source IDs, independent of array order.
      if (JSON.stringify(previous) <= JSON.stringify(item)) continue
    }
    records.set(id, item)
  }
  return { data: [...records.values()], diagnostics }
}
// check whether a sighting matches the selected filters
export function matches(item: Sighting, filters: Filters) {
  const day = item.observedAt.slice(0, 10)
  return (!filters.from || day >= filters.from) && (!filters.to || day <= filters.to) &&
    (!filters.region || item.region === filters.region) &&
    (!filters.species || item.species === filters.species || item.originalSpecies?.toLowerCase() === filters.species.toLowerCase()) &&
    (!filters.query || `${item.locationName} ${item.region}`.toLowerCase().includes(filters.query))
}
// calculate totals and reporting trends
export function aggregate(data: Sighting[]) {
  const byRegion: Record<string, number> = Object.create(null)
  const months: Record<string, number> = Object.create(null)
  for (const item of data) {
    byRegion[item.region] = (byRegion[item.region] || 0) + 1
    const period = item.observedAt.slice(0, 7)
    months[period] = (months[period] || 0) + 1
  }
  return { total: data.length, byRegion, trend: Object.keys(months).sort().map(period => ({ period, count: months[period] })) }
}
