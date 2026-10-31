'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import heroPets from '../../../img/dogcat3.jpeg'
import woodlandPets from '../../../img/dogscats2.jpeg'
import LeafletSightingsMap from './LeafletSightingsMap'
import { AccessibilityProvider, AccessibilityPanel, GuideReadAloud } from './AccessibilityPreferences'
import LocationMapPicker, { MapPinIcon, type PinnedLocation } from './LocationMapPicker'

export type Sighting = { id: string; observedAt: string; locationName: string; region: string; latitude: number | null; longitude: number | null; species: string; originalSpecies?: string; severity: string; notes?: string; photoMediaId?: string; photoUrl?: string; photoWidth?: number; photoHeight?: number; source: string; reportCount?: number }

export type MappedSighting = Sighting & { latitude: number; longitude: number }
type SpeciesOption = { value: string; label: string; count: number }
type PlaceOption = { value: string; label: string; kind: 'place' | 'region' | 'place & region' }
type SpeciesGuideDetails = { scientificName: string; description: string; details: [string, string, string]; illustration: string }
type SeasonalLoadState = 'idle' | 'loading' | 'ready' | 'error'
type SeasonalSeries = {
  sightings: Sighting[]
  state: SeasonalLoadState
  truncated: boolean
  sourceAvailability: { localAvailable: boolean; externalAvailable: boolean } | null
}
type SeasonalTone = 'uk' | 'region' | 'location'
export function hasCoordinates(item: Sighting): item is MappedSighting {
  return typeof item.latitude === 'number' && Number.isFinite(item.latitude) && typeof item.longitude === 'number' && Number.isFinite(item.longitude)
}

const speciesLabel: Record<string, string> = { sheep: 'Sheep tick', hedgehog: 'Hedgehog tick', 'ornate-cow': 'Ornate cow tick', unknown: 'Unknown species' }
const defaultSpeciesOptions = [
  { value: 'Fox/badger tick', label: 'Fox/badger tick', count: 0 },
  { value: 'hedgehog', label: 'Hedgehog tick', count: 0 },
  { value: 'Marsh tick', label: 'Marsh tick', count: 0 },
  { value: 'ornate-cow', label: 'Ornate cow tick', count: 0 },
  { value: 'Passerine tick', label: 'Passerine tick', count: 0 },
  { value: 'sheep', label: 'Sheep tick', count: 0 },
  { value: 'Southern rodent tick', label: 'Southern rodent tick', count: 0 },
  { value: 'Tree-hole tick', label: 'Tree-hole tick', count: 0 },
  { value: 'unknown', label: 'Unknown', count: 0 },
].sort((left, right) => left.label.localeCompare(right.label))
const speciesGuideDetails: Record<string, SpeciesGuideDetails> = {
  'fox/badger tick': {
    scientificName: 'Ixodes canisuga',
    description: 'A dark, nest-associated tick recorded from foxes and badgers. It can be difficult to distinguish from other brown ticks without close examination.',
    details: ['Associated with foxes, badgers and other carnivores', 'Often found around dens and resting places', 'Record the host and location if known'],
    illustration: 'fox-badger',
  },
  'hedgehog tick': {
    scientificName: 'Ixodes hexagonus',
    description: 'Similar to a sheep tick, but with a more angular body and legs concentrated toward the front.',
    details: ['Often found on hedgehogs and pets', 'Gardens, nests and animal shelters', 'Dark reddish-brown appearance'],
    illustration: 'hedgehog',
  },
  'marsh tick': {
    scientificName: 'Dermacentor reticulatus',
    description: 'A patterned tick associated with marshes and wet grassland. This name is also used for the ornate cow tick.',
    details: ['Pale markings contrast with a dark shield', 'Associated with wet grassland and marsh habitats', 'The common names marsh tick and ornate cow tick can refer to the same species'],
    illustration: 'marsh',
  },
  'ornate cow tick': {
    scientificName: 'Dermacentor reticulatus',
    description: 'A distinctive tick with pale markings across its dark dorsal shield; also known as the marsh tick.',
    details: ['Often around 4–5 mm when unfed', 'Associated with grassland and marsh habitats', 'The common names ornate cow tick and marsh tick can refer to the same species'],
    illustration: 'ornate',
  },
  'passerine tick': {
    scientificName: 'Ixodes frontalis',
    description: 'A bird-associated tick most often linked with passerine birds. Identification can be difficult without magnification.',
    details: ['Usually associated with birds and their nests', 'Record the bird host if it is known', 'Avoid handling a specimen with bare hands'],
    illustration: 'passerine',
  },
  'sheep tick': {
    scientificName: 'Ixodes ricinus',
    description: 'The UK’s most common tick. Adults have a dark shield near the head and a reddish-brown, oval body.',
    details: ['Around 3–5 mm when unfed', 'Woodland, heath and long grass', 'Can attach to people and animals'],
    illustration: 'sheep',
  },
  'southern rodent tick': {
    scientificName: 'Small-mammal-associated tick',
    description: 'A sightings-data label for a tick associated with rodents and other small mammals. The common name alone is not enough to confirm a specimen’s species.',
    details: ['Associated with small-mammal hosts', 'A host record can help an expert identify it', 'Use a specialist for confirmation'],
    illustration: 'rodent',
  },
  'tree-hole tick': {
    scientificName: 'Ixodes arboricola',
    description: 'A bird-associated tick linked with tree cavities and nest sites, where it may remain close to its hosts.',
    details: ['Associated with cavity-nesting birds', 'May be found in tree holes and nest material', 'Close examination is needed for identification'],
    illustration: 'tree-hole',
  },
}
const regions = ['All regions', 'Scotland', 'North East', 'North West', 'Yorkshire', 'Midlands', 'Wales', 'East of England', 'London', 'South East', 'South West', 'Northern Ireland']
const calendarMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function isSpeciesOption(option: unknown): option is SpeciesOption {
  return typeof option === 'object' && option !== null && 'value' in option && 'label' in option &&
    typeof option.value === 'string' && typeof option.label === 'string' && 'count' in option &&
    typeof option.count === 'number' && Number.isInteger(option.count) && option.count >= 0
}
function isPlaceOption(option: unknown): option is PlaceOption {
  return typeof option === 'object' && option !== null && 'value' in option && 'label' in option &&
    typeof option.value === 'string' && typeof option.label === 'string' && 'kind' in option &&
    (option.kind === 'place' || option.kind === 'region' || option.kind === 'place & region')
}

function SeasonalityChart({ title, scope, series, tone }: { title: string; scope: string; series: SeasonalSeries; tone: SeasonalTone }) {
  const [requestedYear, setRequestedYear] = useState<number | null>(null)
  const years = series.sightings.map(item => Number(item.observedAt.slice(0, 4))).filter(year => Number.isInteger(year) && year > 0)
  const firstYear = years.length ? Math.min(...years) : null
  const lastYear = years.length ? Math.max(...years) : null
  const selectedYear = firstYear !== null && lastYear !== null
    ? Math.max(firstYear, Math.min(requestedYear ?? lastYear, lastYear)) : null
  const chartSightings = series.sightings.filter(item => Number(item.observedAt.slice(0, 4)) === selectedYear)
  const yearLabel = tone === 'uk' ? 'UK' : tone === 'region' ? 'regional' : 'location'
  const chartScope = selectedYear !== null ? `${scope} in ${selectedYear}` : scope
  const monthlyActivity = calendarMonths.map((label, index) => {
    const month = index + 1
    return {
      label,
      count: chartSightings.filter((item) => Number(item.observedAt.slice(5, 7)) === month).length,
    }
  })
  const maxMonthlyCount = Math.max(1, ...monthlyActivity.map(({ count }) => count))
  const linePoints = monthlyActivity.map(({ count }, index) => ({
    x: 16 + index * (328 / 11), y: 150 - count / maxMonthlyCount * 125,
  }))

  return <article className={`seasonality-card seasonality-card--${tone} rounded-2xl p-6 text-white sm:p-8`}>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <p className="eyebrow !mb-0">{title}</p>
      <div className={`ml-auto flex items-center gap-2 ${tone === 'uk' ? 'text-[#92d9b5]' : tone === 'region' ? 'text-[#8fc7f0]' : 'text-[#edc17d]'}`} role="group" aria-label={`${yearLabel} report year`}>
        <button type="button" aria-label={`Previous ${yearLabel} report year`} disabled={series.state !== 'ready' || selectedYear === null || selectedYear === firstYear} onClick={() => selectedYear !== null && setRequestedYear(selectedYear - 1)} className="grid h-9 w-9 place-items-center rounded-lg border border-current/30 text-lg hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35">&lt;</button>
        <span role="status" aria-live="polite" aria-atomic="true" className="min-w-10 text-center text-sm font-semibold tabular-nums">{selectedYear ?? '—'}</span>
        <button type="button" aria-label={`Next ${yearLabel} report year`} disabled={series.state !== 'ready' || selectedYear === null || selectedYear === lastYear} onClick={() => selectedYear !== null && setRequestedYear(selectedYear + 1)} className="grid h-9 w-9 place-items-center rounded-lg border border-current/30 text-lg hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35">&gt;</button>
      </div>
    </div>
    <h2 className="text-2xl font-semibold tracking-[-.04em]">{scope}</h2>
    <p className="mt-3 min-h-[3.25rem] text-sm leading-6 text-[#c8d7cd]">Reported sightings grouped by calendar month {selectedYear !== null ? `in ${selectedYear}` : 'for the selected year'}. All reported species are included; these are report counts, not estimated tick abundance.</p>
    {series.state === 'loading' && <p role="status" className="mt-8 rounded-xl bg-white/10 p-4 text-sm text-[#e2ece4]">Loading seasonal reports for {scope}…</p>}
    {series.state === 'error' && <p role="alert" className="mt-8 rounded-xl bg-white/10 p-4 text-sm text-[#e2ece4]">Seasonal reports for {scope} could not be loaded. Please try again later.</p>}
    {series.state === 'idle' && <p role="status" className="mt-8 rounded-xl bg-white/10 p-4 text-sm text-[#e2ece4]">Select a sighting to load seasonal reports.</p>}
    {series.state === 'ready' && <>
      {tone === 'region' ? <svg className="mt-3 h-[180px] w-full overflow-visible text-[#8fc7f0]" viewBox="0 0 360 180" role="img" aria-label={`${title} at ${chartScope}: ${monthlyActivity.map(({ label, count }) => `${label}: ${count}`).join(', ')}`}>
        <title>Monthly tick reports for {scope}</title>
        {[25, 87.5, 150].map(y => <line key={y} x1="16" x2="344" y1={y} y2={y} stroke="currentColor" strokeOpacity="0.15"/>)}
        <polyline points={linePoints.map(({ x, y }) => `${x},${y}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
        {linePoints.map(({ x, y }, index) => <g key={monthlyActivity[index].label}>
          <circle cx={x} cy={y} r="3.5" fill="currentColor"><title>{monthlyActivity[index].label}: {monthlyActivity[index].count} reports</title></circle>
          <text x={x} y={y - 10} textAnchor="middle" fill="currentColor" fontSize="10">{monthlyActivity[index].count}</text>
          <text x={x} y="174" textAnchor="middle" fill="currentColor" fontSize="9">{monthlyActivity[index].label}</text>
        </g>)}
      </svg> : <div className="bars seasonal-bars" role="img" aria-label={`${title} at ${chartScope}: ${monthlyActivity.map(({ label, count }) => `${label}: ${count}`).join(', ')}`}>
        {monthlyActivity.map(({ label, count }) => <div key={label} title={`${label}: ${count} ${count === 1 ? 'report' : 'reports'}`}><b>{count}</b><span style={{ height: count ? `${Math.max(8, count / maxMonthlyCount * 100)}%` : '0%', minHeight: count ? 4 : 0 }}/><small>{label}</small></div>)}
      </div>}
      {chartSightings.length === 0 && <p role="status" className="mt-4 rounded-xl bg-white/10 p-4 text-sm text-[#e2ece4]">{selectedYear !== null ? `No ${yearLabel} sightings are available for ${selectedYear}.` : 'No sightings have been reported for this scope yet.'}</p>}
      {series.truncated && <p role="status" className="mt-4 rounded-xl bg-white/10 p-4 text-sm text-[#e2ece4]">This chart uses a bounded set of reports; some older sightings may not be included.</p>}
      {series.sourceAvailability && (!series.sourceAvailability.localAvailable || !series.sourceAvailability.externalAvailable) && <p role="status" className="mt-4 rounded-xl bg-white/10 p-4 text-sm text-[#e2ece4]">One data source was unavailable, so these seasonal counts may be incomplete.</p>}
    </>}
  </article>
}

export default function TickWatch() {
  const [sightings, setSightings] = useState<Sighting[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sharedSightingId, setSharedSightingId] = useState<string | null>(null)
  const [shareMessage, setShareMessage] = useState('')
  const setSelected = (item: Sighting) => {
    setSelectedId(item.id)
    setSharedSightingId(null)
    setShareMessage('')
  }
  const [region, setRegion] = useState('All regions')
  const [kind, setKind] = useState('All species')
  const [speciesOptions, setSpeciesOptions] = useState(defaultSpeciesOptions)
  const [speciesGuidePage, setSpeciesGuidePage] = useState(0)
  const speciesFilterRef = useRef<HTMLDetailsElement>(null)
  const placeSearchRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [placeOptions, setPlaceOptions] = useState<PlaceOption[]>([])
  const [placeSearchFocused, setPlaceSearchFocused] = useState(false)
  const [activePlaceSuggestion, setActivePlaceSuggestion] = useState(-1)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [reporting, setReporting] = useState(false)
  const [pickingLocation, setPickingLocation] = useState(false)
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [pinMessage, setPinMessage] = useState('')
  const pinButtonRef = useRef<HTMLButtonElement>(null)
  const validLocation: PinnedLocation | null = latitude.trim() && longitude.trim() &&
    Number.isFinite(Number(latitude)) && Number(latitude) >= -90 && Number(latitude) <= 90 &&
    Number.isFinite(Number(longitude)) && Number(longitude) >= -180 && Number(longitude) <= 180
    ? { latitude: Number(latitude), longitude: Number(longitude) } : null
  const coordinatePairError = Boolean(latitude.trim()) !== Boolean(longitude.trim()) ? 'Provide both latitude and longitude, or leave both blank.' : ''
  function editCoordinate(name: 'latitude' | 'longitude', value: string) {
    if (name === 'latitude') setLatitude(value)
    else setLongitude(value)
    setPinMessage('')
    setFieldErrors(errors => { const next = { ...errors }; delete next.latitude; delete next.longitude; return next })
  }
  function closeLocationPicker() {
    setPickingLocation(false)
    requestAnimationFrame(() => pinButtonRef.current?.focus())
  }
  function confirmLocation(location: PinnedLocation | null) {
    setLatitude(location ? location.latitude.toFixed(6) : '')
    setLongitude(location ? location.longitude.toFixed(6) : '')
    setFieldErrors(errors => { const next = { ...errors }; delete next.latitude; delete next.longitude; return next })
    setPinMessage(location ? 'Location pinned successfully.' : 'Location pin cleared.')
    closeLocationPicker()
  }
  useEffect(() => {
    if (!reporting) { setLatitude(''); setLongitude(''); setPinMessage(''); setPickingLocation(false) }
  }, [reporting])
  const [status, setStatus] = useState('')

  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [availability, setAvailability] = useState<{ localAvailable: boolean; externalAvailable: boolean } | null>(null)
  const filterKey = useMemo(() => {
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (region !== 'All regions') params.set('region', region)
    if (kind !== 'All species') params.set('species', kind)
    if (query.trim()) params.set('q', query.trim())
    return params.toString()
  }, [from, to, region, kind, query])
  const [resultMeta, setResultMeta] = useState({ total: 0, truncated: false })
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  const [locationSeasonality, setLocationSeasonality] = useState<SeasonalSeries>({ sightings: [], state: 'idle', truncated: false, sourceAvailability: null })
  const [regionSeasonality, setRegionSeasonality] = useState<SeasonalSeries>({ sightings: [], state: 'idle', truncated: false, sourceAvailability: null })
  const [ukSeasonality, setUkSeasonality] = useState<SeasonalSeries>({ sightings: [], state: 'loading', truncated: false, sourceAvailability: null })
  const requestKey = JSON.stringify([filterKey, reload])
  const [loadedKey, setLoadedKey] = useState('')
  const viewState = loadedKey === requestKey ? loadState : 'loading'
  const [pending, setPending] = useState(false)
  const submitting = useRef(false)
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    const sightingId = new URLSearchParams(window.location.search).get('sighting')
    if (sightingId) {
      setSharedSightingId(sightingId)
      setSelectedId(sightingId)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void fetch('/api/sightings', { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok || !Array.isArray(result?.data) ||
          typeof result.meta?.localAvailable !== 'boolean' ||
          typeof result.meta?.externalAvailable !== 'boolean' ||
          (!result.meta.localAvailable && !result.meta.externalAvailable)) {
          throw new Error('UK seasonal sightings unavailable')
        }
        if (controller.signal.aborted) return
        setUkSeasonality({
          sightings: result.data as Sighting[],
          state: 'ready',
          truncated: result.meta.truncated === true,
          sourceAvailability: {
            localAvailable: result.meta.localAvailable,
            externalAvailable: result.meta.externalAvailable,
          },
        })
      })
      .catch(() => {
        if (!controller.signal.aborted) setUkSeasonality({ sightings: [], state: 'error', truncated: false, sourceAvailability: null })
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setLoadState('loading')
    setSightings([])
    setAvailability(null)
    setLoadError('')
    const timer = setTimeout(() => { void (async () => {
      try {
        const params = new URLSearchParams(filterKey)
        const response = await fetch(`/api/sightings?${params}`, { signal: controller.signal })
        const result = await response.json()
        if (controller.signal.aborted) return
        if (!response.ok) {
          if (response.status === 400 && result?.errors) setLoadError(Object.values(result.errors).join(' '))
          throw new Error('Sightings unavailable')
        }
        if (!Array.isArray(result?.data) || typeof result.meta?.localAvailable !== 'boolean' || typeof result.meta?.externalAvailable !== 'boolean') throw new Error('Invalid response')
        if (!Array.isArray(result.meta.speciesOptions) || !result.meta.speciesOptions.every(isSpeciesOption)) throw new Error('Invalid species options')
        if (!Array.isArray(result.meta.placeOptions) || !result.meta.placeOptions.every(isPlaceOption)) throw new Error('Invalid place options')
        if (!result.meta.localAvailable && !result.meta.externalAvailable) throw new Error('All sources unavailable')
        if (controller.signal.aborted) return
        setSpeciesOptions(result.meta.speciesOptions)
        setPlaceOptions(result.meta.placeOptions)
        setResultMeta({ total: result.meta.total ?? result.data.length, truncated: result.meta.truncated ?? false })
        setSightings(result.data)
        setAvailability(result.meta)
        setLoadedKey(requestKey)
        setLoadState('ready')
      } catch {
        if (!controller.signal.aborted) {
          setSightings([])
          setLoadedKey(requestKey)
          setLoadState('error')
        }
      }
    })() }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [reload, filterKey, requestKey])

  const filtered = useMemo(() => viewState !== 'ready' ? [] : sightings.filter((item) => {
    const observed = item.observedAt.slice(0, 10)
    const matchesLocation = `${item.locationName} ${item.region}`.toLowerCase().includes(query.trim().replace(/\s+/g, ' ').toLowerCase())
    return matchesLocation && (!from || observed >= from) && (!to || observed <= to) &&
      (region === 'All regions' || item.region === region) &&
      (kind === 'All species' || item.species === kind || item.originalSpecies?.toLowerCase() === kind.toLowerCase())
  }), [sightings, region, kind, query, from, to, viewState])
  const mapped = filtered.filter(hasCoordinates)
  const unmappedCount = filtered.length - mapped.length
  const defaultSighting = filtered.find((item) => item.locationName.trim().toLowerCase() === 'london') ?? filtered[0] ?? null
  const selected = filtered.find((item) => item.id === sharedSightingId) ?? filtered.find((item) => item.id === selectedId) ?? defaultSighting
  const selectedLocationName = selected?.locationName ?? ''
  const selectedRegion = selected?.region ?? ''
  useEffect(() => {
    if (!selectedLocationName) {
      setLocationSeasonality({ sightings: [], state: 'idle', truncated: false, sourceAvailability: null })
      setRegionSeasonality({ sightings: [], state: 'idle', truncated: false, sourceAvailability: null })
      return
    }

    const controller = new AbortController()
    setLocationSeasonality({ sightings: [], state: 'loading', truncated: false, sourceAvailability: null })
    setRegionSeasonality({ sightings: [], state: 'loading', truncated: false, sourceAvailability: null })
    const fetchSeries = async (params: URLSearchParams, exactLocation?: string): Promise<SeasonalSeries> => {
      try {
        const response = await fetch(`/api/sightings?${params}`, { signal: controller.signal })
        const result = await response.json()
        if (!response.ok || !Array.isArray(result?.data) ||
          typeof result.meta?.localAvailable !== 'boolean' ||
          typeof result.meta?.externalAvailable !== 'boolean' ||
          (!result.meta.localAvailable && !result.meta.externalAvailable)) {
          throw new Error('Seasonal sightings unavailable')
        }
        const scopeSightings = (result.data as Sighting[]).filter((item) =>
          item.region === selectedRegion &&
          (!exactLocation || item.locationName.toLowerCase() === exactLocation.toLowerCase()),
        )
        return {
          sightings: scopeSightings,
          state: 'ready',
          truncated: result.meta.truncated === true,
          sourceAvailability: {
            localAvailable: result.meta.localAvailable,
            externalAvailable: result.meta.externalAvailable,
          },
        }
      } catch {
        return { sightings: [], state: 'error', truncated: false, sourceAvailability: null }
      }
    }

    const locationParams = new URLSearchParams({ q: selectedLocationName, region: selectedRegion })
    const regionParams = new URLSearchParams({ region: selectedRegion })
    void Promise.all([
      fetchSeries(locationParams, selectedLocationName),
      fetchSeries(regionParams),
    ]).then(([location, regionResult]) => {
      if (controller.signal.aborted) return
      setLocationSeasonality(location)
      setRegionSeasonality(regionResult)
    })

    return () => controller.abort()
  }, [selectedLocationName, selectedRegion])
  const sharedSightingUnavailable = Boolean(sharedSightingId && viewState === 'ready' && !filtered.some((item) => item.id === sharedSightingId))
  const areaSightings = selected ? filtered.filter((item) => item.locationName === selected.locationName && item.region === selected.region) : []
  const timelineSightings = [...areaSightings]
    .sort((left, right) => right.observedAt.localeCompare(left.observedAt))
    .slice(0, 4)
  const placeSuggestions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return placeOptions
      .filter(option => !normalizedQuery || option.value.toLowerCase().includes(normalizedQuery))
      .slice(0, 8)
  }, [placeOptions, query])
  const showPlaceSuggestions = placeSearchFocused && placeSuggestions.length > 0
  const selectedSpeciesOption = speciesOptions.find((option) => option.value === kind)
  const totalSpeciesSightings = speciesOptions.reduce((sum, option) => sum + option.count, 0)
  const guideSpecies = speciesOptions
    .filter((option) => option.value.toLowerCase() !== 'unknown' && option.label.toLowerCase() !== 'unknown' && option.label.toLowerCase() !== 'unknown species')
    .map((option) => ({
      name: option.label,
      ...(speciesGuideDetails[option.label.toLowerCase()] ?? {
        scientificName: 'Identification details unavailable',
        description: `“${option.label}” appears as a species label in the sightings data, but a reliable field profile is not available yet.`,
        details: ['Do not treat the data label as a confirmed identification', 'Record the host and location if known', 'Ask a trained identifier to confirm the species'],
        illustration: 'unlisted',
      }),
    }))
    .sort((left, right) => left.name.localeCompare(right.name))
  const speciesPerPage = 4
  const speciesGuidePageCount = Math.ceil(guideSpecies.length / speciesPerPage)
  const activeSpeciesGuidePage = Math.min(speciesGuidePage, Math.max(speciesGuidePageCount - 1, 0))
  const visibleGuideSpecies = guideSpecies.slice(activeSpeciesGuidePage * speciesPerPage, activeSpeciesGuidePage * speciesPerPage + speciesPerPage)
  const firstGuideSpecies = guideSpecies.length ? activeSpeciesGuidePage * speciesPerPage + 1 : 0
  const lastGuideSpecies = Math.min(activeSpeciesGuidePage * speciesPerPage + speciesPerPage, guideSpecies.length)
  const selectedCount = selected ? filtered.filter((item) =>
    item.locationName === selected.locationName &&
    item.latitude === selected.latitude &&
    item.longitude === selected.longitude,
  ).length : 0
  const emptyMessage = viewState === 'loading' ? 'Loading live sightings…' : viewState === 'error' ? loadError || 'Live sightings could not be loaded. Please retry.' : filterKey ? 'No sightings match these filters. Try another area or clear your filters.' : 'No sightings are currently available from the connected sources.'

  async function copySightingLink() {
    if (!selected) return
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable.')
      const url = new URL(window.location.href)
      url.searchParams.set('sighting', selected.id)
      await navigator.clipboard.writeText(url.toString())
      setShareMessage('Link copied. It opens this selected sighting.')
    } catch {
      setShareMessage('Could not access the clipboard. Allow clipboard access and try again.')
    }
  }

  async function submit(formData: FormData) {
    if (coordinatePairError) {
      setFieldErrors(errors => ({ ...errors, [latitude.trim() ? 'longitude' : 'latitude']: coordinatePairError }))
      setFormError('Please check the highlighted fields.')
      return
    }
    if (submitting.current) return
    submitting.current = true
    setPending(true)
    setFormError('')
    setFieldErrors({})
    try {
      const response = await fetch('/api/sightings', { method: 'POST', body: formData, signal: AbortSignal.timeout(30000) })
      const result = await response.json()
      if (!response.ok) {
        setFormError(typeof result?.error === 'string' ? result.error : 'We could not save your report. Please try again.')
        if (result?.errors && typeof result.errors === 'object') {
          setFieldErrors(Object.fromEntries(Object.entries(result.errors).filter((entry): entry is [string, string] => typeof entry[1] === 'string')))
        }
        return
      }
      if (!result?.data?.id) throw new Error('Invalid save response')
      setStatus('Report saved successfully and awaiting verification.')
      setReporting(false)
      setReload((value) => value + 1)
    } catch {
      setFormError('We could not confirm that your report was saved. Your entries have been kept. Check your connection before trying again.')
    } finally {
      submitting.current = false
      setPending(false)
    }
  }

  function fieldError(name: string) {
    return fieldErrors[name] ? <small id={`${name}-error`} className="text-red-300">{fieldErrors[name]}</small> : null
  }
  function fieldProps(name: string) {
    const paired = (name === 'latitude' || name === 'longitude') && coordinatePairError
    return { 'aria-invalid': !!fieldErrors[name] || !!paired, 'aria-describedby': [fieldErrors[name] ? `${name}-error` : '', paired ? 'coordinate-pair-error' : ''].filter(Boolean).join(' ') || undefined }
  }

  return (
    <AccessibilityProvider><main className="tickwatch-app min-h-screen bg-[#101917] text-[#f5f8f6]">
      <header className="border-b border-[#30443c] bg-[#172420]">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-5 py-4 lg:px-10">
          <div className="flex items-center gap-3"><span className="logo-mark" aria-hidden="true" /><div><p className="text-[0.6875rem] font-bold uppercase tracking-[.22em] text-[#9db9aa]">UK field network</p><p className="text-xl font-semibold tracking-[-.03em]">TickWatch</p></div></div>
          <nav aria-label="Main navigation" className="site-nav order-3 flex w-full items-center justify-between gap-4 overflow-x-auto text-xs font-medium sm:gap-6 sm:text-sm lg:order-none lg:w-auto">
            <a href="#map">Sightings Map</a><a href="#activity">Charts &amp; Trends</a><a href="#learn">Field Guide</a><a href="#tick-information">About Ticks</a>
          </nav>
          <div className="flex flex-wrap items-center gap-2"><AccessibilityPanel/><button onClick={() => { setReporting(true); setFormError(''); setFieldErrors({}); setStatus('') }} className="rounded-lg bg-[#92d9b5] px-3 py-2.5 text-xs font-semibold text-[#172420] hover:bg-[#b0e9cb] sm:px-5 sm:text-sm">Report a sighting</button></div>
        </div>
      </header>

      <section className="mx-auto max-w-[1500px] px-5 pb-8 pt-9 lg:px-10">
        <div className="mb-10 grid items-center overflow-hidden border-b border-[#30443c] pb-8 lg:grid-cols-[1fr_1fr]">
          <div className="relative z-10 flex flex-col justify-center py-5 sm:py-8">
            <p className="mb-5 text-xs font-medium uppercase tracking-[.12em] text-[#9db9aa]">Small sightings. A shared responsibility.</p>
            <h1 className="max-w-xl text-[2.5rem] font-semibold leading-[1.1] tracking-[-.045em] sm:text-[3.5rem]">Track ticks.<br/>Protect people,<br/><span className="text-[#92d9b5]">pets &amp; wildlife.</span></h1>
            <p className="mt-5 max-w-md text-base leading-7 text-[#bccac3]">A UK-wide community for tick sightings and awareness. Help look after the places—and companions—you love.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <button onClick={() => { setReporting(true); setFormError(''); setFieldErrors({}); setStatus('') }} className="rounded-lg bg-[#92d9b5] px-6 py-3 text-sm font-bold text-[#172420] hover:bg-[#b0e9cb]">Report a tick <span aria-hidden="true">↗</span></button>
              <a href="#map" className="rounded-lg border border-[#4b6658] px-6 py-3 text-sm font-semibold text-[#f5f8f6] hover:bg-[#243a31]">Explore the map <span aria-hidden="true">↓</span></a>
            </div>
          </div>
          <div className="relative min-h-[280px] sm:min-h-[360px] lg:-ml-20 lg:min-h-[460px]">
            <Image src={heroPets} alt="A golden retriever and a kitten together in a sunlit meadow" fill preload sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover object-center"/>
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,#101917_0%,transparent_25%,transparent_85%,#101917_100%)] lg:bg-[linear-gradient(to_right,#101917_0%,#10191799_12%,transparent_45%),linear-gradient(to_top,#101917_0%,transparent_20%)]"/>
          </div>
        </div>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div><p className="mb-2 text-xs font-bold uppercase tracking-[.2em] text-[#9db9aa]">Sighting explorer</p><h2 className="text-2xl font-semibold tracking-tight">Know before you go.</h2></div>
          <p className="max-w-lg text-sm leading-6 text-[#aabbb2]">Explore community reports alongside Elanco educational task data. Inferred city-centre map positions are approximate.</p>
        </div>

        <div className="mb-3 flex flex-wrap gap-2" aria-label="Map filters">
          <div ref={placeSearchRef} className="search-control relative">
            <label><span className="sr-only">Search a place or region</span><input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setPlaceSearchFocused(true)
                setActivePlaceSuggestion(-1)
              }}
              onFocus={() => setPlaceSearchFocused(true)}
              onBlur={(event) => {
                if (!placeSearchRef.current?.contains(event.relatedTarget as Node | null)) setPlaceSearchFocused(false)
              }}
              onKeyDown={(event) => {
                if (!showPlaceSuggestions) return
                if (event.key === 'ArrowDown') {
                  event.preventDefault()
                  setActivePlaceSuggestion(index => index < 0 ? 0 : (index + 1) % placeSuggestions.length)
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault()
                  setActivePlaceSuggestion(index => index < 0 ? placeSuggestions.length - 1 : (index - 1 + placeSuggestions.length) % placeSuggestions.length)
                } else if (event.key === 'Enter' && activePlaceSuggestion >= 0 && placeSuggestions[activePlaceSuggestion]) {
                  event.preventDefault()
                  setQuery(placeSuggestions[activePlaceSuggestion].value)
                  setPlaceSearchFocused(false)
                } else if (event.key === 'Escape') {
                  setPlaceSearchFocused(false)
                }
              }}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={showPlaceSuggestions}
              aria-controls="place-suggestions"
              aria-activedescendant={showPlaceSuggestions && activePlaceSuggestion >= 0 ? `place-suggestion-${activePlaceSuggestion}` : undefined}
              placeholder="Search a place or region"
              autoComplete="off"
            /></label>
            {showPlaceSuggestions && <div id="place-suggestions" role="listbox" className="absolute left-0 right-0 top-full z-40 mt-2 max-h-72 overflow-y-auto rounded-2xl border border-[#30443c] bg-[#172420] p-2 shadow-xl">
              {placeSuggestions.map((option, index) => <button
                key={`${option.kind}:${option.value}`}
                id={`place-suggestion-${index}`}
                type="button"
                role="option"
                aria-selected={index === activePlaceSuggestion}
                onClick={() => { setQuery(option.value); setPlaceSearchFocused(false) }}
                className={`flex w-full items-center justify-between gap-4 rounded-xl px-3 py-2 text-left text-sm ${index === activePlaceSuggestion ? 'bg-[#243a31]' : 'hover:bg-[#243a31]'}`}
              >
                <span>{option.value}</span><span className="text-xs text-[#a5b9ae]">{option.kind}</span>
              </button>)}
            </div>}
          </div>
          <label className="date-control"><span>From</span><input type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)}/></label>
          <label className="date-control"><span>To</span><input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)}/></label>
          <select value={region} onChange={(event) => setRegion(event.target.value)} className="control">{regions.map((item) => <option key={item}>{item}</option>)}</select>
          <details ref={speciesFilterRef} className="relative" onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) event.currentTarget.open = false
          }}>
            <summary className="control flex min-w-[220px] list-none items-center justify-between gap-5" aria-label="Filter by species">
              <span>{kind === 'All species' ? 'All species' : selectedSpeciesOption?.label ?? kind}</span>
              <span className="text-right tabular-nums">[{kind === 'All species' ? totalSpeciesSightings : selectedSpeciesOption?.count ?? 0}]</span>
            </summary>
            <div className="absolute right-0 top-full z-30 mt-2 max-h-72 min-w-full overflow-y-auto rounded-2xl border border-[#30443c] bg-[#172420] p-2 shadow-xl" aria-label="Species options">
              <button type="button" aria-pressed={kind === 'All species'} onClick={() => {
                setKind('All species')
                if (speciesFilterRef.current) speciesFilterRef.current.open = false
              }} className="flex w-full items-center justify-between gap-6 rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-[#243a31]">
                <span>All species</span><span className="tabular-nums">[{totalSpeciesSightings}]</span>
              </button>
              {speciesOptions.map((option) => <button key={option.value} type="button" aria-pressed={kind === option.value} onClick={() => {
                setKind(option.value)
                if (speciesFilterRef.current) speciesFilterRef.current.open = false
              }} className="flex w-full items-center justify-between gap-6 rounded-xl px-3 py-2 text-left text-sm hover:bg-[#243a31]">
                <span>{option.label}</span><span className="tabular-nums">[{option.count}]</span>
              </button>)}
            </div>
          </details>
          {(query || from || to || region !== 'All regions' || kind !== 'All species') && <button className="clear-filter" onClick={() => { setQuery(''); setFrom(''); setTo(''); setRegion('All regions'); setKind('All species') }}>Clear filters</button>}
          <span className="ml-auto self-center text-sm text-[#aabbb2]">{viewState === 'ready' ? `${resultMeta.total}${resultMeta.truncated ? '+' : ''} matching reports` : viewState === 'loading' ? 'Loading reports…' : 'Reports unavailable'}</span>
        </div>

        {viewState === 'error' && <p role="alert" className="mb-3 rounded-xl bg-[#482822] px-4 py-3 text-sm">{emptyMessage} <button className="underline" onClick={() => setReload((value) => value + 1)}>Retry loading</button></p>}
        {availability && (!availability.localAvailable || !availability.externalAvailable) && <p role="status" className="mb-3 rounded-xl bg-[#443919] px-4 py-3 text-sm">Partial results: {availability.localAvailable ? 'Elanco field data is unavailable. Showing community reports only.' : 'Community reports are unavailable. Showing Elanco field data only.'}</p>}
        {resultMeta.truncated && viewState === 'ready' && <p role="status" className="mb-3 rounded-xl bg-[#443919] p-3 text-sm">Results reached the source limit. Totals cover the retrieved subset; narrow your dates or location for more complete results.</p>}
        {unmappedCount > 0 && <p role="status" className="mb-3 text-sm text-[#aabbb2]">{unmappedCount} {unmappedCount === 1 ? 'report has' : 'reports have'} no complete coordinates and cannot be shown on the map.</p>}
        {status && <p className="mb-3 rounded-xl bg-[#243a31] px-4 py-3 text-sm" role="status">{status}</p>}
        <div id="map" className="isolate grid min-h-[610px] overflow-hidden rounded-2xl border border-[#30443c] bg-[#172420] lg:grid-cols-[1fr_390px]">
          <LeafletSightingsMap sightings={mapped} selectedId={selected?.id ?? ''} emptyMessage={filtered.length && !mapped.length ? 'These reports have no complete coordinates to display on the map.' : emptyMessage} onSelect={setSelected}/>
          <aside className="border-l border-[#e2e5de] p-6 lg:p-8">
            {sharedSightingUnavailable && <p role="status" className="mb-4 rounded-xl bg-[#443919] p-3 text-sm text-[#aabbb2]">The sighting in this link is unavailable in the current results{selected ? '; showing the latest available report instead.' : '.'}</p>}
            {selected ? <>
            <div className="mb-8 flex items-start justify-between"><div><p className="mb-2 text-xs font-bold uppercase tracking-[.16em] text-[#9db9aa]">Selected report</p><h2 className="text-2xl font-semibold tracking-[-.04em]">{selected?.locationName ?? 'UK'}</h2><p className="mt-1 text-sm text-[#a5b9ae]">{selected?.region ?? 'the UK'}</p></div></div>
            <p className="mb-6 text-sm leading-6 text-[#aabbb2]"><strong className="text-[#f5f8f6]">{selectedCount} {selectedCount === 1 ? 'sighting' : 'sightings'}</strong> reported at {selected?.locationName ?? 'UK'}. Showing the latest report.</p>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-y border-[#e5e7e1] py-6 text-sm"><div><dt>Species</dt><dd>{selected.originalSpecies ?? speciesLabel[selected.species] ?? 'Unknown'}</dd></div><div><dt>Observed</dt><dd>{new Date(selected.observedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</dd></div><div><dt>Source</dt><dd className="capitalize">{selected.source}</dd></div><div><dt>Coordinates</dt><dd>{hasCoordinates(selected) ? `${selected.latitude.toFixed(2)}, ${selected.longitude.toFixed(2)}` : 'Not provided'}</dd></div></dl>
            <p className="my-6 text-sm leading-6 text-[#bccac3]">{selected.notes ?? 'No additional field notes were provided.'}</p>
            {selected.photoUrl && selected.photoWidth && selected.photoHeight && <Image className="mb-6 h-auto max-h-80 w-full rounded-xl object-contain" src={selected.photoUrl} width={selected.photoWidth} height={selected.photoHeight} alt={`Photo submitted with the ${selected.locationName} tick sighting`} />}
            <div className="flex gap-2">{hasCoordinates(selected) && <a className="action" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${selected.latitude},${selected.longitude}`}>Get directions</a>}<button className="action" onClick={() => void copySightingLink()}>Copy link</button></div>
            {shareMessage && <p role="status" className="mt-3 text-sm text-[#bccac3]">{shareMessage}</p>}
            <div className="mt-8"><p className="mb-4 text-xs font-bold uppercase tracking-[.16em] text-[#9db9aa]">Recent activity · {selected.locationName}</p>{timelineSightings.length ? <div className="timeline">{timelineSightings.map((item) => <button key={item.id} aria-label={`Select ${item.locationName} sighting from ${new Date(item.observedAt).toLocaleDateString('en-GB')}`} onClick={() => setSelected(item)}><span/><div><strong>{item.locationName}</strong><small>{new Date(item.observedAt).toLocaleDateString('en-GB')}</small></div></button>)}</div> : <p role="status" className="text-sm text-[#aabbb2]">No recent reports are available for this location.</p>}</div>
            </> : <p role="status" className="text-sm text-[#aabbb2]">{emptyMessage}</p>}
          </aside>
        </div>
      </section>

      <section id="activity" className="mx-auto max-w-[1500px] px-5 py-12 lg:px-10" aria-label="Seasonal tick activity charts">
        <div className="mb-7 max-w-3xl"><p className="eyebrow text-[#9db9aa]">Educational insights</p><h2 className="section-title">Tick reports through the seasons.</h2><p className="mt-3 text-sm leading-6 text-[#aabbb2]">Compare reported sightings for this location, its region and the UK. Use the year arrows on each chart to browse monthly reports for that year.</p></div>
        <div className="seasonality-grid">
          <SeasonalityChart title="UK-wide tick reports" scope="United Kingdom" series={ukSeasonality} tone="uk"/>
          <SeasonalityChart title="Region-wide tick reports" scope={selectedRegion || 'select a sighting'} series={regionSeasonality} tone="region"/>
          <SeasonalityChart title="Location-based tick reports" scope={selectedLocationName || 'select a sighting'} series={locationSeasonality} tone="location"/>
        </div>
        <p className="mt-5 text-sm leading-6 text-[#aabbb2]">A month with no reports is not evidence that ticks are absent. Reporting coverage varies by place and year.</p>
      </section>

      <section id="learn" className="mx-auto max-w-[1500px] px-5 pb-12 lg:px-10">
        <article data-educational-guide className="rounded-2xl border border-[#30443c] bg-[#172420] p-7 sm:p-10">
          <div className="grid items-center gap-6 overflow-hidden lg:grid-cols-2 lg:gap-0">
            <div className="relative z-10 lg:pr-8">
              <p className="eyebrow text-[#9db9aa]">Field guide</p>
              <h2 className="section-title">Prevent bites and know what to do.</h2>
              <p className="mt-4 text-sm leading-6 text-[#aabbb2]">Ticks can be found in woodland, long grass and gardens. A few simple checks can help reduce bites and make it easier to spot and remove a tick promptly.</p>
              <div className="mt-6">
                <p className="eyebrow text-[#92d9b5]">For every outdoor companion</p>
                <h3 className="text-2xl font-semibold tracking-tight">A little check after every adventure.</h3>
                <p className="mt-3 text-sm leading-6 text-[#bccac3]">Check yourself and your pets after time outdoors. Small habits help make your next walk a safer one.</p>
              </div>
              <GuideReadAloud/>
            </div>
            <div className="relative lg:-ml-10">
              <Image src={woodlandPets} alt="Two dogs and two cats together on a mossy log in woodland" sizes="(min-width: 1024px) 50vw, 100vw" className="h-auto w-full object-cover"/>
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,#172420_0%,transparent_25%,transparent_85%,#172420_100%)] lg:bg-[linear-gradient(to_left,transparent_55%,#172420_100%),linear-gradient(to_top,#172420_0%,transparent_18%)]"/>
            </div>
          </div>
          <div className="field-guide-grid">
            <section><p className="field-guide-number">01 · BEFORE YOU GO</p><h3>Reduce exposed skin</h3><ul><li>Wear long sleeves and trousers; tuck trousers into socks when walking through grass or woodland.</li><li>Light-coloured clothing can make ticks easier to see.</li><li>Stay on clear paths where possible and use an insect repellent according to its label.</li></ul></section>
            <section><p className="field-guide-number">02 · AFTER TIME OUTDOORS</p><h3>Check yourself, children and pets</h3><ul><li>Check clothing and skin promptly, including behind knees, underarms, waistbands, scalp and skin folds.</li><li>Check children and pets too; ticks can be tiny and bites may not hurt.</li><li>Remove any attached tick as soon as possible.</li></ul></section>
            <section><p className="field-guide-number">03 · IF YOU FIND A TICK</p><h3>Remove it carefully</h3><ul><li>Use fine-tipped tweezers or a tick-removal tool and grasp as close to the skin as possible.</li><li>Pull upwards slowly and steadily. Avoid squeezing or crushing the tick.</li><li>Clean the bite with antiseptic or soap and water, and note the date of the bite.</li></ul></section>
            <section><p className="field-guide-number">04 · WATCH FOR SYMPTOMS</p><h3>Know when to seek advice</h3><ul><li>Watch for a spreading circular or oval rash or flu-like symptoms after a tick bite.</li><li>Contact your GP or NHS 111 urgently if a rash develops or you feel unwell.</li><li>Do not rely on a tick’s appearance to tell whether it carries infection.</li></ul></section>
          </div>
          <p className="field-guide-source">For NHS guidance on tick removal and Lyme disease symptoms, visit <a href="https://www.nhs.uk/conditions/lyme-disease/" target="_blank" rel="noreferrer">NHS: Lyme disease</a>.</p>
        </article>
      </section>

      <section id="tick-information" className="mx-auto max-w-[1500px] px-5 pb-16 lg:px-10" aria-labelledby="species-guide">
        <div className="mb-7 max-w-2xl"><p className="eyebrow text-[#9db9aa]">Identification guide</p><h2 id="species-guide" className="section-title">Know what to look for.</h2><p className="mt-3 text-sm leading-6 text-[#aabbb2]">Browse the tick types listed in sightings. Ticks can be difficult to identify without magnification; these cues are a starting point, not a confirmed identification.</p></div>
        <div className="species-gallery-controls">
          <p role="status" aria-live="polite">Showing {firstGuideSpecies}–{lastGuideSpecies} of {guideSpecies.length} tick types</p>
          <div className="species-gallery-nav">
            <button type="button" aria-label="Previous species" aria-controls="species-gallery" disabled={activeSpeciesGuidePage === 0} onClick={() => setSpeciesGuidePage(activeSpeciesGuidePage - 1)}>←</button>
            <button type="button" aria-label="Next species" aria-controls="species-gallery" disabled={activeSpeciesGuidePage >= speciesGuidePageCount - 1} onClick={() => setSpeciesGuidePage(activeSpeciesGuidePage + 1)}>→</button>
          </div>
        </div>
        <div id="species-gallery" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-live="polite">
          {visibleGuideSpecies.map((species) => <article className="species-card" key={species.name}>
            <div className={`tick-illustration ${species.illustration}`} aria-hidden="true"><i/><span/><b/></div>
            <p className="species-kicker">{species.scientificName}</p>
            <h3>{species.name}</h3>
            <p>{species.description}</p>
            <ul>{species.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>
          </article>)}
        </div>
        <div className="guide-note"><strong>Not sure what you found?</strong><span>“Unknown” is a report category, not a species. Select “Not sure” when reporting and describe what you observed in the field notes.</span></div>
      </section>

      {reporting && <div className="modal-backdrop" role="dialog" aria-modal={!pickingLocation} aria-hidden={pickingLocation || undefined} inert={pickingLocation} aria-labelledby="report-title"><form onSubmit={(event) => { event.preventDefault(); void submit(new FormData(event.currentTarget)) }} className="modal" aria-busy={pending}>
        <div className="flex items-start justify-between"><div><p className="eyebrow text-[#9db9aa]">Community report</p><h2 id="report-title" className="text-3xl font-semibold tracking-[-.04em]">Report a sighting</h2></div><button type="button" disabled={pending} onClick={() => setReporting(false)} className="close" aria-label="Close">×</button></div>
        <p className="mt-4 text-sm text-[#aabbb2]">Fields marked * are required.</p>
        {formError && <p role="alert" className="my-4 rounded-lg bg-[#482822] p-3 text-sm text-red-200">{formError}</p>}
        {pending && <p role="status" className="my-3 text-sm">Saving your report…</p>}
        <fieldset disabled={pending} className="form-grid">
          <label className="col-span-2"><span>Location name <span aria-hidden="true">*</span></span><input required minLength={2} maxLength={120} name="locationName" {...fieldProps('locationName')} placeholder="e.g. Richmond Park"/>{fieldError('locationName')}</label>
          <label><span>Date observed <span aria-hidden="true">*</span></span><input required type="date" name="observedAt" {...fieldProps('observedAt')} max={new Date().toISOString().slice(0,10)}/>{fieldError('observedAt')}</label>
          <label><span>Region <span aria-hidden="true">*</span></span><select required name="region" {...fieldProps('region')}><option value="">Choose region</option>{regions.slice(1).map((item) => <option key={item}>{item}</option>)}</select>{fieldError('region')}</label>
          <label><span>Species <span aria-hidden="true">*</span></span><select required name="species" {...fieldProps('species')}><option value="unknown">Not sure</option><option value="sheep">Sheep tick</option><option value="hedgehog">Hedgehog tick</option><option value="ornate-cow">Ornate cow tick</option></select>{fieldError('species')}</label>
          <label><span>Activity <span aria-hidden="true">*</span></span><select required name="severity" {...fieldProps('severity')}><option value="low">Low — one tick</option><option value="moderate">Moderate — several</option><option value="high">High — cluster</option></select>{fieldError('severity')}</label>
          <div className="col-span-2 text-sm text-[#aabbb2]"><strong className="block font-semibold text-[#f5f8f6]">Coordinates (optional)</strong><span>You can submit a sighting without coordinates. Your report will still contribute to regional statistics. Providing both latitude and longitude allows the sighting to be displayed at its reported location on the map.</span></div>
          <label><span>Latitude</span><input min={-90} max={90} value={latitude} onChange={event => editCoordinate('latitude', event.target.value)} name="latitude" {...fieldProps('latitude')} type="number" step="any" placeholder="51.507"/>{fieldError('latitude')}</label>
          <label><span>Longitude</span><input min={-180} max={180} value={longitude} onChange={event => editCoordinate('longitude', event.target.value)} name="longitude" {...fieldProps('longitude')} type="number" step="any" placeholder="-0.127"/>{fieldError('longitude')}</label>
          <div className="col-span-2">
            {coordinatePairError && <p id="coordinate-pair-error" className="mb-3 text-sm text-red-300" role="status">{coordinatePairError}</p>}
            <button ref={pinButtonRef} type="button" onClick={() => { setPinMessage(''); setPickingLocation(true) }} aria-haspopup="dialog" className="inline-flex items-center gap-2 rounded-lg border border-[#a8b5aa] bg-[#243a31] px-4 py-2.5 text-sm font-semibold text-[#92d9b5] hover:bg-[#30443c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#92d9b5]">
              <MapPinIcon/>{validLocation ? 'Edit pinned location' : 'Pin location on map'}
            </button>
            {pinMessage && <p role="status" className="mt-3 text-sm text-[#92d9b5]">{pinMessage}</p>}
          </div>
          <label className="col-span-2">Field notes<textarea maxLength={1000} name="notes" {...fieldProps('notes')} rows={3} placeholder="Where was it found? Was it attached?"/>{fieldError('notes')}</label>
          <label className="col-span-2"><span>Photo <span className="optional">optional · JPEG, PNG or WebP, up to 5 MB</span></span><input name="photo" type="file" accept="image/jpeg,image/png,image/webp" aria-invalid={!!fieldErrors.photo} aria-describedby={fieldErrors.photo ? 'photo-error photo-privacy' : 'photo-privacy'}/>{fieldError('photo')}</label>
          <p id="photo-privacy" className="col-span-2 text-sm text-[#aabbb2]">Photos are shown with the report and may be publicly accessible. Avoid including faces, personal details or identifying information.</p>
        </fieldset>
        <button disabled={pending} className="submit disabled:opacity-60" type="submit">{pending ? 'Saving report…' : 'Submit for review'}</button>
      </form></div>}
      {reporting && pickingLocation && <LocationMapPicker initialLocation={validLocation} onCancel={closeLocationPicker} onConfirm={confirmLocation}/>}
      <footer className="site-footer border-t border-[#30443c] bg-[#172420]">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-1 px-5 py-6 text-sm sm:flex-row sm:items-center sm:justify-between lg:px-10">
          <a className="font-semibold text-[#f5f8f6] underline decoration-[#a8b5aa] underline-offset-4 hover:text-[#92d9b5]" href="https://www.linkedin.com/in/aninisrinivasan/" target="_blank" rel="noreferrer">Anini Pandiyan Sathya <span className="sr-only">(opens LinkedIn in a new tab)</span></a>
          <p className="text-[#aabbb2]">Elanco Placement Program: Technical Task – Full Stack</p>
        </div>
      </footer>
    </main></AccessibilityProvider>
  )
}
