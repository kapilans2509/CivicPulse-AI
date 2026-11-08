/**
 * LocationPicker — interactive Leaflet/OSM map for selecting an issue location.
 *
 * Props:
 *   lat       : number | null
 *   lng       : number | null
 *   onChange  : ({ lat, lng, address }) => void
 *   error     : string | null
 *
 * The component:
 *   1. Attempts browser geolocation on mount.
 *   2. Allows click-to-pin anywhere on the map.
 *   3. Offers manual coordinate input as a fallback.
 *   4. Performs reverse geocoding via Nominatim (free, no API key).
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix Leaflet's broken default icon paths when bundled with Vite
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const BENGALURU_CENTER = [12.9716, 77.5946]
const DEFAULT_ZOOM     = 13

/** Inner component that listens to map click events */
function ClickHandler({ onMapClick }) {
  useMapEvents({ click: (e) => onMapClick(e.latlng.lat, e.latlng.lng) })
  return null
}

/** Nominatim reverse geocode — free, no key required */
async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
      { headers: { 'Accept-Language': 'en' } }
    )
    const data = await res.json()
    return data.display_name ?? null
  } catch {
    return null
  }
}

export default function LocationPicker({ lat, lng, onChange, error: externalError }) {
  const mapRef          = useRef(null)
  const [geoLoading, setGeoLoading] = useState(false)
  const [geoError,   setGeoError]   = useState(null)
  const [addrLoading, setAddrLoading] = useState(false)

  // Manual coordinate input state
  const [manualLat, setManualLat] = useState('')
  const [manualLng, setManualLng] = useState('')
  const [manualMode, setManualMode] = useState(false)

  const selected = lat !== null && lng !== null

  /** Pick a location: update state + reverse geocode */
  const pick = useCallback(async (newLat, newLng) => {
    setAddrLoading(true)
    const address = await reverseGeocode(newLat, newLng)
    setAddrLoading(false)
    onChange({ lat: newLat, lng: newLng, address })

    // Pan map to new pin
    if (mapRef.current) {
      mapRef.current.setView([newLat, newLng], Math.max(mapRef.current.getZoom(), 16))
    }
  }, [onChange])

  /** Try browser geolocation */
  const locate = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser.')
      return
    }
    setGeoLoading(true)
    setGeoError(null)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setGeoLoading(false)
        pick(coords.latitude, coords.longitude)
      },
      () => {
        setGeoLoading(false)
        setGeoError('Could not access your location. Please pin it on the map or enter coordinates manually.')
      },
      { timeout: 10000 }
    )
  }, [pick])

  // Auto-locate on first mount
  useEffect(() => { locate() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /** Manual coordinate submit */
  const handleManualSubmit = (e) => {
    e.preventDefault()
    const parsedLat = parseFloat(manualLat)
    const parsedLng = parseFloat(manualLng)
    if (isNaN(parsedLat) || isNaN(parsedLng)) return
    if (parsedLat < -90 || parsedLat > 90 || parsedLng < -180 || parsedLng > 180) return
    pick(parsedLat, parsedLng)
    setManualMode(false)
  }

  const error = geoError ?? externalError

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700">
          Location <span className="text-red-500">*</span>
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={locate}
            disabled={geoLoading}
            className="flex items-center gap-1.5 text-xs text-civic-600 hover:text-civic-800 font-medium disabled:opacity-50"
          >
            {geoLoading ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
              </svg>
            )}
            {geoLoading ? 'Locating…' : 'Use my location'}
          </button>
          <span className="text-gray-300">|</span>
          <button
            type="button"
            onClick={() => setManualMode((m) => !m)}
            className="text-xs text-gray-500 hover:text-gray-700 font-medium"
          >
            Enter coordinates
          </button>
        </div>
      </div>

      {/* Map */}
      <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm" style={{ height: '320px' }}>
        <MapContainer
          center={selected ? [lat, lng] : BENGALURU_CENTER}
          zoom={DEFAULT_ZOOM}
          style={{ height: '100%', width: '100%' }}
          ref={mapRef}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickHandler onMapClick={pick} />
          {selected && <Marker position={[lat, lng]} />}
        </MapContainer>
      </div>

      {/* Instruction banner */}
      {!selected && (
        <p className="text-xs text-gray-500 flex items-center gap-1.5">
          <svg className="w-4 h-4 text-civic-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
          </svg>
          Click anywhere on the map to pin the issue location
        </p>
      )}

      {/* Selected location display */}
      {selected && (
        <div className="flex items-start gap-2 bg-civic-50 border border-civic-200 rounded-lg px-3 py-2 text-sm">
          <svg className="w-4 h-4 text-civic-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
          </svg>
          <div className="min-w-0">
            {addrLoading ? (
              <p className="text-gray-500 italic">Fetching address…</p>
            ) : (
              <p className="text-gray-800 break-words leading-snug">
                {/* address will be passed back via onChange; read from parent */}
                <span className="font-mono text-xs text-gray-500">{lat.toFixed(6)}, {lng.toFixed(6)}</span>
              </p>
            )}
          </div>
        </div>
      )}

      {/* Manual input form */}
      {manualMode && (
        <form onSubmit={handleManualSubmit} className="flex flex-wrap items-end gap-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Latitude</label>
            <input
              type="number"
              step="any"
              placeholder="12.9716"
              value={manualLat}
              onChange={(e) => setManualLat(e.target.value)}
              className="w-36 border border-gray-300 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-civic-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Longitude</label>
            <input
              type="number"
              step="any"
              placeholder="77.5946"
              value={manualLng}
              onChange={(e) => setManualLng(e.target.value)}
              className="w-36 border border-gray-300 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-civic-500 focus:border-transparent"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-1.5 bg-civic-600 text-white text-sm rounded-md hover:bg-civic-700 transition-colors"
          >
            Pin location
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
          <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {error}
        </p>
      )}
    </div>
  )
}
