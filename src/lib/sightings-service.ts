import { listSightings } from './mysql'
import { SOURCE_LIMIT, QueryError, aggregate, matches, normalizeRows, parseFilters, regions, species, type Filters } from './sightings-domain'

const UPSTREAM = 'https://dev-task.elancoapps.com/data/tick-sightings'
const BYTE_LIMIT = 5 * 1024 * 1024
const delay = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds))
const speciesLabels: Record<string, string> = {
  sheep: 'Sheep tick',
  hedgehog: 'Hedgehog tick',
  'ornate-cow': 'Ornate cow tick',
  unknown: 'Unknown',
}

// build species filter options from the loaded data
function getSpeciesOptions(data: ReturnType<typeof normalizeRows>['data']) {
  const options = new Map(species.map(value => [value, {
    value,
    label: speciesLabels[value] ?? value,
    count: 0,
  }]))
  for (const item of data) {
    const label = item.originalSpecies?.trim().replace(/\s+/g, ' ')
    const value = label || item.species
    const key = value.toLowerCase()
    const option = options.get(key)
    if (option) option.count++
    else options.set(key, { value, label: value, count: 1 })
  }
  return [...options.values()].sort((left, right) => left.label.localeCompare(right.label))
}

// build place and region search suggestions
function getPlaceOptions(data: ReturnType<typeof normalizeRows>['data']) {
  const options = new Map<string, { value: string; label: string; kind: 'place' | 'region' | 'place & region' }>()
  const addOption = (value: string, kind: 'place' | 'region') => {
    const key = value.toLowerCase()
    const existing = options.get(key)
    if (existing) {
      if (existing.kind !== kind) existing.kind = 'place & region'
      return
    }
    options.set(key, { value, label: value, kind })
  }
  for (const region of [...regions, 'Unknown']) {
    addOption(region, 'region')
  }
  for (const item of data) {
    const place = item.locationName.trim()
    if (place) addOption(place, 'place')
  }
  return [...options.values()].sort((left, right) => left.value.localeCompare(right.value))
}

// load external sightings with response limits and retries
async function readExternal() {
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(UPSTREAM, { signal: AbortSignal.timeout(8000), cache: 'no-store' })
      if (!response.ok) {
        await response.body?.cancel()
        if (response.status !== 429 && response.status < 500) throw new PermanentUpstreamError()
        throw new Error('Upstream temporarily unavailable')
      }
      // Bound bytes before parsing: never call unbounded response.json() on the upstream.
      if (Number(response.headers.get('content-length')) > BYTE_LIMIT) {
        await response.body?.cancel(); throw new PermanentUpstreamError()
      }
      if (!response.body) throw new PermanentUpstreamError()
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let bytes = 0
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          bytes += value.byteLength
          if (bytes > BYTE_LIMIT) { await reader.cancel(); throw new PermanentUpstreamError() }
          chunks.push(value)
        }
      } finally { reader.releaseLock() }
      let json: unknown
      try { json = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new PermanentUpstreamError() }
      const envelope = json as { data?: unknown; next?: unknown; nextCursor?: unknown; meta?: { hasMore?: unknown; next?: unknown; nextCursor?: unknown; total?: unknown } } | null
      const rows = Array.isArray(json) ? json : envelope && Array.isArray(envelope.data) ? envelope.data : null
      if (!rows) throw new PermanentUpstreamError()
      const paged = !Array.isArray(json) && !!(envelope?.next || envelope?.nextCursor || envelope?.meta?.hasMore || envelope?.meta?.next || envelope?.meta?.nextCursor || Number(envelope?.meta?.total) > rows.length)
      return { ...normalizeRows(rows.slice(0, SOURCE_LIMIT), 'external'), available: true, truncated: rows.length > SOURCE_LIMIT || paged, fetchedAt: new Date().toISOString() }
    } catch (error) {
      lastError = error
      if (error instanceof PermanentUpstreamError) break
      if (attempt === 0) await delay(250)
    }
  }
  throw lastError
}
class PermanentUpstreamError extends Error {}
// Per-process cache and single-flight: bounded upstream data only, never local reports.
let externalCache: { expires: number; value: Awaited<ReturnType<typeof readExternal>> } | undefined
let externalFlight: Promise<Awaited<ReturnType<typeof readExternal>>> | undefined
let retryAfter = 0
// reuse cached external data and share requests already running
async function externalData() {
  if (externalCache && externalCache.expires > Date.now()) return externalCache.value
  if (Date.now() < retryAfter) throw new Error('Upstream cooldown')
  externalFlight ??= readExternal().then(value => {
    externalCache = { expires: Date.now() + 900000, value }
    return value
  }).catch(error => { retryAfter = Date.now() + 30000; throw error }).finally(() => { externalFlight = undefined })
  return externalFlight
}
// combine community and external sightings and apply filters
async function dataset(filters: Filters) {
  const empty = () => ({ ...normalizeRows([], 'local'), available: false, truncated: false, fetchedAt: null as string | null })
  const [local, external] = await Promise.all([
    listSightings({ from: filters.from, to: filters.to, region: filters.region }).then(rows => ({ ...normalizeRows(rows.slice(0, SOURCE_LIMIT), 'local'), available: true, truncated: rows.length > SOURCE_LIMIT, fetchedAt: null })).catch(empty),
    externalData().catch(empty),
  ])
  const allData = [...local.data, ...external.data]
  const speciesIndependentFilters = { ...filters, species: '' }
  const matchingWithoutSpecies = allData.filter(item => matches(item, speciesIndependentFilters))
  const matchingWithoutQuery = allData.filter(item => matches(item, { ...filters, query: '' }))
  const data = matchingWithoutSpecies.filter(item => matches(item, filters))
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt) || a.id.localeCompare(b.id))
  return { data, meta: {
    localAvailable: local.available, externalAvailable: external.available,
    total: data.length, locations: new Set(data.map(item => item.locationName.toLowerCase())).size,
    speciesOptions: getSpeciesOptions(matchingWithoutSpecies),
    placeOptions: getPlaceOptions(matchingWithoutQuery),
    truncated: local.truncated || external.truncated,
    sourceLimit: SOURCE_LIMIT, scope: 'combined-matching-records',
    externalFetchedAt: external.fetchedAt,
    diagnostics: { local: local.diagnostics, external: external.diagnostics },
  } }
}
// return sightings or insights with source availability details
export async function sightingsResponse(request: Request, insights = false) {
  try {
    const filters = parseFilters(new URL(request.url).searchParams)
    const result = await dataset(filters)
    if (!result.meta.localAvailable && !result.meta.externalAvailable) {
      return Response.json({ error: 'Sightings could not be loaded. Please try again.', data: [], meta: result.meta }, { status: 503 })
    }
    if (insights) return Response.json({ ...aggregate(result.data), meta: { ...result.meta, zeroMonths: 'omitted' } })
    return Response.json({ data: result.data, meta: { ...result.meta, mapScope: 'all-matching-records' } })
  } catch (error) {
    if (error instanceof QueryError) return Response.json({ error: error.message, errors: error.errors }, { status: 400 })
    return Response.json({ error: 'Sightings could not be loaded. Please try again.' }, { status: 503 })
  }
}
