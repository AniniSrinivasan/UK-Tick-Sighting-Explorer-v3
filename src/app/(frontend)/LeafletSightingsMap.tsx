'use client'

import { useEffect, useRef, useState } from 'react'
import type { Map as LeafletMap, LayerGroup } from 'leaflet'
import type { MappedSighting as Sighting } from './TickWatch'

const countColor = (count: number) =>
  count > 75 ? '#9f332d' : count > 50 ? '#cf6427' : count > 25 ? '#e5b53f' : '#2f6a50'

function groupByLocation(sightings: Sighting[]) {
  return Array.from(sightings.reduce((groups, sighting) => {
    const key = `${sighting.locationName}:${sighting.latitude}:${sighting.longitude}`
    const group = groups.get(key)
    if (group) group.push(sighting)
    else groups.set(key, [sighting])
    return groups
  }, new Map<string, Sighting[]>()).values())
}

export default function LeafletSightingsMap({
  sightings,
  selectedId,
  onSelect,
  emptyMessage,
}: {
  sightings: Sighting[]
  selectedId: string
  emptyMessage: string
  onSelect: (sighting: Sighting) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const layerRef = useRef<LayerGroup | null>(null)
  const leafletRef = useRef<typeof import('leaflet') | null>(null)
  const boundsSignature = useRef('')
  const [ready, setReady] = useState(false)
  const [mode, setMode] = useState<'sightings' | 'density'>('sightings')
  const [loadError, setLoadError] = useState(false)
  const locations = groupByLocation(sightings)

  useEffect(() => {
    let active = true
    let resizeObserver: ResizeObserver | undefined
    let resizeFrame = 0
    void (async () => {
      const leaflet = (await import('leaflet')).default
      // Leaflet.heat registers itself on the browser's Leaflet instance.
      ;(window as Window & { L: typeof leaflet }).L = leaflet
      await import('leaflet.heat')
      if (!active || !containerRef.current || mapRef.current) return
      leafletRef.current = leaflet
      const map = leaflet.map(containerRef.current, {
        center: [54.5, -3],
        zoom: 5.25,
        zoomSnap: 0.25,
        minZoom: 2,
        maxZoom: 15,
        worldCopyJump: true,
        zoomControl: false,
      })
      leaflet.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map)
      leaflet.control.zoom({ position: 'bottomright' }).addTo(map)
      mapRef.current = map
      layerRef.current = leaflet.layerGroup().addTo(map)
      // Data and sidebar content can resize the grid without a window resize.
      // Tell Leaflet to request tiles for the entire new container, including its bottom edge.
      resizeObserver = new ResizeObserver(() => {
        cancelAnimationFrame(resizeFrame)
        resizeFrame = requestAnimationFrame(() => {
          if (active) map.invalidateSize({ animate: false, debounceMoveend: true })
        })
      })
      resizeObserver.observe(containerRef.current)
      setReady(true)
    })().catch(() => { if (active) setLoadError(true) })
    return () => {
      active = false
      resizeObserver?.disconnect()
      cancelAnimationFrame(resizeFrame)
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const leaflet = leafletRef.current
    const map = mapRef.current
    const layer = layerRef.current
    if (!ready || !leaflet || !map || !layer) return
    layer.clearLayers()

    const locations = groupByLocation(sightings)

    if (mode === 'density' && locations.length) {
      leaflet.heatLayer(locations.map((group) => [
        group[0].latitude,
        group[0].longitude,
        group.length,
      ] as [number, number, number]), {
        radius: 28,
        blur: 24,
        minOpacity: 0.15,
        max: Math.max(1, ...locations.map((group) => group.length)),
        maxZoom: 4,
        gradient: { 0.2: '#2f6a50', 0.45: '#e5b53f', 0.7: '#cf6427', 1: '#9f332d' },
      }).addTo(layer)
    }

    if (mode === 'sightings') locations.forEach((group) => {
      const sighting = group[0]
      const count = group.length
      const selected = group.some((item) => item.id === selectedId)
      const marker = leaflet.marker([sighting.latitude, sighting.longitude], {
        icon: leaflet.divIcon({
          className: 'report-marker-shell',
          html: `<span class="report-marker${selected ? ' is-selected' : ''}" style="background:${countColor(count)}">${count}</span>`,
          iconSize: [selected ? 42 : 36, selected ? 42 : 36],
          iconAnchor: [selected ? 21 : 18, selected ? 21 : 18],
        }),
        zIndexOffset: selected ? 1000 : count,
      })
      const tooltip = document.createElement('div')
      const title = document.createElement('strong')
      const detail = document.createElement('span')
      title.textContent = sighting.locationName
      detail.textContent = `${count} ${count === 1 ? 'report' : 'reports'} · ${sighting.region}`
      tooltip.className = 'map-tooltip'
      tooltip.append(title, detail)
      marker.bindTooltip(tooltip, { direction: 'top', offset: [0, -8] })
      marker.on('click', () => onSelect(sighting))
      marker.addTo(layer)
    })

    const signature = sightings.map((item) => item.id).sort().join('|')
    if (signature !== boundsSignature.current) {
      boundsSignature.current = signature
      if (sightings.length) {
        const bounds = leaflet.latLngBounds(sightings.map((item) => [item.latitude, item.longitude]))
        map.fitBounds(bounds.pad(0.18), { maxZoom: 7, animate: true })
      } else {
        map.setView([54.5, -3], 5)
      }
    }
  }, [ready, selectedId, sightings, onSelect, mode])

  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d7dbd2] bg-[#f8f8f3] px-4 py-3">
        <span className="text-sm font-semibold">Map view</span>
        <div className="flex rounded-full bg-[#e6ecdf] p-1" role="group" aria-label="Map view">
          {(['sightings', 'density'] as const).map((view) => (
            <button key={view} type="button" aria-pressed={mode === view} onClick={() => setMode(view)}
              className={`rounded-full px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#173e2b] sm:px-4 sm:text-sm ${mode === view ? 'bg-[#173e2b] text-white shadow-sm' : 'text-[#526159] hover:bg-white/70'}`}>
              {view === 'sightings' ? 'Sightings' : 'Reported tick density'}
            </button>
          ))}
        </div>
      </div>
      <div className="relative min-h-[520px] flex-1 overflow-hidden bg-[#dfe9dc]">
        <div ref={containerRef} className="leaflet-map" aria-label={mode === 'density' ? 'Heatmap of reported UK tick sightings' : 'Interactive map of UK tick sightings'} />
        <div className="pointer-events-none absolute left-4 top-4 z-[500] rounded-full bg-white/95 px-4 py-2 text-xs font-bold shadow-sm backdrop-blur" role="status">{locations.reduce((sum, group) => sum + (group.length), 0)} reports · {locations.length} locations</div>
        {(loadError || !sightings.length) && (
          <div className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center p-6">
            <p className="rounded-2xl bg-white/95 p-5 text-center text-sm shadow-lg" role="status">
              {loadError ? 'The map could not load. Please refresh to try again.' : emptyMessage}
            </p>
          </div>
        )}
        {mode === 'density' ? (
          <div className="pointer-events-none absolute bottom-6 left-4 z-[500] w-[230px] max-w-[calc(100%-80px)] rounded-2xl bg-white/95 p-4 text-[0.6875rem] shadow-lg backdrop-blur">
            <strong className="block text-xs">Reported tick density</strong>
            <div className="my-2 h-2 rounded-full bg-gradient-to-r from-[#2f6a50] via-[#e5b53f] to-[#9f332d]" />
            <div className="flex justify-between"><span>Lower</span><span>Higher</span></div>
            <p className="mt-2 leading-relaxed text-[#59675f]">Relative concentration of matching reports. Not a measure of tick population.</p>
          </div>
        ) : (
          <div className="map-count-legend pointer-events-none absolute bottom-6 left-4 z-[500] rounded-2xl bg-white/95 p-3 text-[0.6875rem] shadow-lg backdrop-blur"><strong>Reports per location</strong><div><span className="count-dot count-low"/>1–25 <span className="count-dot count-mid"/>26–50 <span className="count-dot count-high"/>51–75 <span className="count-dot count-peak"/>76+</div></div>
        )}
      </div>
    </div>
  )
}
