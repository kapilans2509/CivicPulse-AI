/**
 * MapPage — City Issue Map
 *
 * Full-height Leaflet/OSM map with:
 *   - Colour-coded markers by issue category
 *   - Click-to-select marker → detail panel
 *   - Category + severity filter toolbar
 *   - Incident count overlay
 *   - Link back to dashboard
 */
import { useState, useCallback, useEffect } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

import { issuesApi }    from '../api/issues'
import { useFetch }     from '../hooks/useFetch'
import {
  CategoryBadge, SeverityBadge, StatusBadge,
  FilterSelect, RefreshButton, LoadingState, ErrorBanner,
} from '../components/ui/index'
import { CATEGORIES, SEVERITIES, CATEGORY_META } from '../lib/constants'

// ─── Constants ────────────────────────────────────────────────────────────────

const BENGALURU_CENTER = [12.9716, 77.5946]
const DEFAULT_ZOOM     = 12

const MARKER_COLOURS = {
  pothole:     '#f97316',
  garbage:     '#16a34a',
  flooding:    '#0284c7',
  road_damage: '#dc2626',
  other:       '#6b7280',
}

const SEVERITY_RADIUS = {
  critical: 14,
  high:     11,
  medium:    8,
  low:       6,
}

// ─── Map auto-fit ─────────────────────────────────────────────────────────────

function AutoFit({ issues }) {
  const map = useMap()
  useEffect(() => {
    if (!issues?.length) return
    const bounds = issues.map((i) => [i.latitude, i.longitude])
    if (bounds.length === 1) {
      map.setView(bounds[0], 15)
    } else {
      // map.fitBounds accepts a raw array of [lat,lng] pairs
      map.fitBounds(bounds, { padding: [40, 40] })
    }
  }, [issues, map])
  return null
}

// ─── Sidebar detail panel ─────────────────────────────────────────────────────

function MapDetailPanel({ issue, onClose }) {
  if (!issue) return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400 p-8">
      <svg className="w-12 h-12" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
      </svg>
      <p className="text-sm text-center">Click a marker on the map to view incident details</p>
    </div>
  )

  const reported = new Date(issue.reported_at).toLocaleString('en-IN', {
    dateStyle: 'medium', timeStyle: 'short',
  })

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Panel header */}
      <div className="bg-civic-700 px-4 py-4 flex items-center justify-between flex-shrink-0">
        <div>
          <p className="text-xs text-civic-200 font-medium uppercase tracking-wide">Incident</p>
          <p className="text-white font-bold text-lg font-mono">
            #{String(issue.id).padStart(5, '0')}
          </p>
        </div>
        <button onClick={onClose} className="text-civic-200 hover:text-white transition-colors p-1">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 p-4 space-y-4">
        {/* Badges row */}
        <div className="flex flex-wrap gap-1.5">
          <CategoryBadge category={issue.category} />
          <SeverityBadge severity={issue.severity} />
          <StatusBadge status={issue.status} />
        </div>

        {/* Title */}
        <div>
          <p className="font-semibold text-gray-900 text-sm leading-snug">{issue.title}</p>
          <p className="text-xs text-gray-600 mt-2 leading-relaxed">{issue.description}</p>
        </div>

        {/* Meta */}
        <div className="space-y-1.5">
          {[
            { label: '📍 Location', value: issue.address ?? `${issue.latitude.toFixed(4)}, ${issue.longitude.toFixed(4)}` },
            { label: '🕐 Reported', value: reported },
            ...(issue.is_duplicate ? [{ label: '⚠ Duplicate of', value: `Incident #${issue.canonical_issue_id}` }] : []),
          ].map(({ label, value }) => (
            <div key={label} className="bg-gray-50 rounded-lg px-3 py-2">
              <p className="text-xs font-medium text-gray-500">{label}</p>
              <p className="text-xs text-gray-800 mt-0.5 break-words">{value}</p>
            </div>
          ))}
        </div>

        {/* Photo */}
        {issue.photo_path && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Attached photo</p>
            <img
              src={issue.photo_path}
              alt="Issue"
              className="w-full rounded-xl border border-gray-200 object-cover"
              style={{ maxHeight: '180px' }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function MapLegend() {
  return (
    <div className="absolute bottom-6 left-3 z-10 bg-white/95 border border-gray-200 rounded-xl shadow-card px-3 py-2.5 text-xs space-y-1.5">
      <p className="font-semibold text-gray-600 text-xs uppercase tracking-wide mb-1.5">Category</p>
      {Object.entries(CATEGORY_META).map(([key, { label, icon }]) => (
        <div key={key} className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: MARKER_COLOURS[key] }}
          />
          <span className="text-gray-700">{icon} {label}</span>
        </div>
      ))}
      <div className="border-t border-gray-100 pt-1.5 mt-1.5">
        <p className="font-semibold text-gray-600 text-xs uppercase tracking-wide mb-1.5">Severity (size)</p>
        {Object.entries(SEVERITY_RADIUS).map(([sev, r]) => (
          <div key={sev} className="flex items-center gap-2">
            <span
              className="rounded-full flex-shrink-0 bg-gray-400"
              style={{ width: r * 1.5, height: r * 1.5 }}
            />
            <span className="text-gray-700 capitalize">{sev}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main MapPage ─────────────────────────────────────────────────────────────

export default function MapPage() {
  const [catFilter, setCat] = useState('')
  const [sevFilter, setSev] = useState('')
  const [selected,  setSelected] = useState(null)

  const fetcher = useCallback(
    () => issuesApi.list({ limit: 500, ...(catFilter ? { category: catFilter } : {}), ...(sevFilter ? { severity: sevFilter } : {}) }),
    [catFilter, sevFilter]
  )
  const { data: issues, loading, error, refetch } = useFetch(fetcher, [fetcher])

  // Filter out issues without valid coordinates
  const mappable = (issues ?? []).filter(
    (i) => typeof i.latitude === 'number' && typeof i.longitude === 'number'
  )

  return (
    /* Full-height layout: toolbar + map side-by-side */
    <div className="flex flex-col" style={{ height: 'calc(100vh - 120px)' }}>
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">City Issue Map</h1>
          {!loading && !error && (
            <p className="text-xs text-gray-500">
              {mappable.length} incident{mappable.length !== 1 ? 's' : ''} plotted on OpenStreetMap
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 ml-auto items-end">
          <FilterSelect
            value={catFilter}
            onChange={setCat}
            options={CATEGORIES}
            placeholder="All categories"
          />
          <FilterSelect
            value={sevFilter}
            onChange={setSev}
            options={SEVERITIES}
            placeholder="All severities"
          />
          {(catFilter || sevFilter) && (
            <button
              onClick={() => { setCat(''); setSev('') }}
              className="text-xs text-civic-600 hover:text-civic-800 font-medium self-end pb-2"
            >
              Clear
            </button>
          )}
          <RefreshButton onClick={refetch} loading={loading} />
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={refetch} />}

      {/* ── Map + panel layout ── */}
      <div className="flex flex-1 gap-0 rounded-2xl overflow-hidden border border-gray-200 shadow-card min-h-0">

        {/* Map area */}
        <div className="flex-1 relative min-w-0">
          {loading && (
            <div className="absolute inset-0 bg-white/70 z-20 flex items-center justify-center">
              <LoadingState label="Loading incidents…" />
            </div>
          )}

          <MapContainer
            center={BENGALURU_CENTER}
            zoom={DEFAULT_ZOOM}
            style={{ height: '100%', width: '100%' }}
            zoomControl={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {!loading && mappable.length > 0 && <AutoFit issues={mappable} />}

            {mappable.map((issue) => {
              const colour = MARKER_COLOURS[issue.category] ?? '#6b7280'
              const radius = SEVERITY_RADIUS[issue.severity] ?? 8
              const isSelected = selected?.id === issue.id

              return (
                <CircleMarker
                  key={issue.id}
                  center={[issue.latitude, issue.longitude]}
                  radius={radius}
                  pathOptions={{
                    color:       isSelected ? '#0369a1' : colour,
                    fillColor:   colour,
                    fillOpacity: isSelected ? 1 : 0.75,
                    weight:      isSelected ? 3 : 1.5,
                  }}
                  eventHandlers={{
                    click: () => setSelected(issue),
                  }}
                >
                  <Popup>
                    <div className="text-xs space-y-1 min-w-40">
                      <p className="font-semibold text-gray-900 text-sm">
                        #{String(issue.id).padStart(5, '0')}
                      </p>
                      <p className="text-gray-700 line-clamp-2">{issue.title}</p>
                      <div className="flex flex-wrap gap-1 pt-1">
                        <CategoryBadge category={issue.category} />
                        <SeverityBadge severity={issue.severity} />
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              )
            })}
          </MapContainer>

          <MapLegend />

          {/* Incident count pill */}
          <div className="absolute top-3 right-3 z-10 bg-civic-700/90 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow">
            {mappable.length} incident{mappable.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Side panel */}
        <div
          className={`bg-white border-l border-gray-200 flex-shrink-0 transition-all duration-200 ${
            selected ? 'w-80' : 'w-64'
          } hidden md:flex flex-col`}
        >
          <MapDetailPanel issue={selected} onClose={() => setSelected(null)} />
        </div>
      </div>

      {/* Mobile detail panel — full screen overlay */}
      {selected && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white md:hidden">
          <MapDetailPanel issue={selected} onClose={() => setSelected(null)} />
        </div>
      )}
    </div>
  )
}
