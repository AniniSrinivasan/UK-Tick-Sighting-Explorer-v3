'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Map as LeafletMap, Marker } from 'leaflet'

export type PinnedLocation = { latitude: number; longitude: number }

export function MapPinIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>
}

export default function LocationMapPicker({ initialLocation, onConfirm, onCancel }: {
  initialLocation: PinnedLocation | null
  onConfirm: (location: PinnedLocation | null) => void
  onCancel: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const markerRef = useRef<Marker | null>(null)
  const leafletRef = useRef<typeof import('leaflet') | null>(null)
  const [location, setLocation] = useState(initialLocation)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    let active = true
    let observer: ResizeObserver | undefined
    let frame = 0
    void (async () => {
      const leaflet = (await import('leaflet')).default
      if (!active || !containerRef.current) return
      leafletRef.current = leaflet
      const map = leaflet.map(containerRef.current, {
        center: initialLocation ? [initialLocation.latitude, initialLocation.longitude] : [54.5, -3],
        zoom: initialLocation ? 12 : 5,
        minZoom: 2,
        worldCopyJump: true,
      })
      mapRef.current = map
      leaflet.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map)
      map.on('click', event => setLocation({
        latitude: Math.max(-90, Math.min(90, event.latlng.lat)),
        longitude: ((event.latlng.lng + 180) % 360 + 360) % 360 - 180,
      }))
      observer = new ResizeObserver(() => {
        cancelAnimationFrame(frame)
        frame = requestAnimationFrame(() => {
          if (active) map.invalidateSize({ animate: false, debounceMoveend: true })
        })
      })
      observer.observe(containerRef.current)
      map.invalidateSize()
      setReady(true)
    })().catch(() => { if (active) setError(true) })
    return () => {
      active = false
      observer?.disconnect()
      cancelAnimationFrame(frame)
      mapRef.current?.remove()
      mapRef.current = null
      markerRef.current = null
      dialog?.close()
      document.body.style.overflow = overflow
    }
    // This dialog is mounted fresh on each open; edits are a draft until confirmed.
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const leaflet = leafletRef.current
    if (!ready || !map || !leaflet) return
    if (!location) {
      markerRef.current?.remove()
      markerRef.current = null
      return
    }
    if (markerRef.current) {
      markerRef.current.setLatLng([location.latitude, location.longitude])
    } else {
      markerRef.current = leaflet.marker([location.latitude, location.longitude], {
        icon: leaflet.divIcon({
          className: 'location-picker-pin',
          html: '<svg width="36" height="44" viewBox="0 0 36 44" aria-hidden="true"><path d="M18 42S2 29 2 18a16 16 0 1 1 32 0c0 11-16 24-16 24Z" fill="#173e2b" stroke="white" stroke-width="2"/><circle cx="18" cy="18" r="5" fill="white"/></svg>',
          iconSize: [36, 44], iconAnchor: [18, 42],
        }),
        keyboard: false,
      }).addTo(map)
    }
  }, [location, ready])

  return createPortal(<dialog ref={dialogRef} aria-labelledby="location-picker-title" aria-describedby="location-picker-instructions" onCancel={event => { event.preventDefault(); onCancel() }} onKeyDown={event => {
    if (event.key !== 'Tab') return
    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')]
      .filter(element => element.getClientRects().length > 0)
    const first = controls[0], last = controls[controls.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }}
    className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[760px] overflow-y-auto rounded-[24px] bg-[#f8f8f3] p-5 text-[#18251f] shadow-2xl backdrop:bg-[#0f1d159e] backdrop:backdrop-blur-sm sm:p-7">
    <div className="flex items-start justify-between gap-4">
      <div><p className="mb-2 text-xs font-bold uppercase tracking-[.16em] text-[#718376]">Sighting location</p><h2 id="location-picker-title" className="text-2xl font-semibold tracking-[-.04em]">Pin location on map</h2></div>
      <button type="button" onClick={onCancel} className="close shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#173e2b]" aria-label="Close location picker">×</button>
    </div>
    <p id="location-picker-instructions" className="my-4 text-sm text-[#526159]">Click anywhere on the map to mark where you spotted the tick.</p>
    <div className="relative isolate h-[45dvh] min-h-[220px] max-h-[420px] overflow-hidden rounded-2xl border border-[#d1d7ce] bg-[#dfe9dc]">
      <div ref={containerRef} className="absolute inset-0" tabIndex={0} role="region" aria-label="Location selection map" aria-describedby="location-picker-keyboard" onKeyDown={event => {
        if (event.key === 'Enter' && mapRef.current && event.target === event.currentTarget) {
          event.preventDefault()
          const center = mapRef.current.getCenter().wrap()
          setLocation({ latitude: center.lat, longitude: center.lng })
        }
      }}/>
      {!ready && <p role={error ? 'alert' : 'status'} className="pointer-events-none absolute inset-x-4 top-4 z-[500] rounded-xl bg-white/95 p-3 text-sm">{error ? 'The map could not load. Close this picker to enter coordinates manually.' : 'Loading location map…'}</p>}
    </div>
    <p id="location-picker-keyboard" className="mt-3 text-xs leading-5 text-[#5d6b62]">Keyboard: use arrow keys to pan, + or − to zoom, and Enter to place a pin at the centre. You can also enter coordinates manually in the reporting form.</p>
    <div role="status" aria-live="polite" aria-atomic="true" className="my-4 rounded-xl bg-[#e6ecdf] p-3 text-sm">
      {location ? <dl className="flex flex-wrap gap-x-6 gap-y-1"><div><dt className="inline font-semibold">Latitude: </dt><dd className="inline">{location.latitude.toFixed(6)}</dd></div><div><dt className="inline font-semibold">Longitude: </dt><dd className="inline">{location.longitude.toFixed(6)}</dd></div></dl> : 'No pin selected.'}
    </div>
    <div className="flex flex-wrap justify-end gap-2">
      <button type="button" className="action" onClick={onCancel}>Cancel</button>
      <button type="button" className="action disabled:opacity-50" disabled={!location} onClick={() => setLocation(null)}>Clear pin</button>
      <button type="button" className="rounded-full bg-[#173e2b] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#28573e] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#173e2b]" disabled={!ready || (!location && !initialLocation)} onClick={() => onConfirm(location)}>Confirm location</button>
    </div>
  </dialog>, document.body)
}
