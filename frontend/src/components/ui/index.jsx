/** Reusable UI primitives for the dashboard */

import { CATEGORY_META, SEVERITY_META, STATUS_META } from '../../lib/constants'

/* ── Loading spinner ─────────────────────────────────────────────────────── */
export function Spinner({ size = 'md', className = '' }) {
  const s = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-8 h-8' : 'w-6 h-6'
  return (
    <svg
      className={`animate-spin text-civic-500 ${s} ${className}`}
      fill="none" viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}

/* ── Centred loading state ───────────────────────────────────────────────── */
export function LoadingState({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-gray-500">
      <Spinner />
      <span className="text-sm">{label}</span>
    </div>
  )
}

/* ── Error banner ────────────────────────────────────────────────────────── */
export function ErrorBanner({ message, onRetry }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3">
      <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-red-700 font-medium">Failed to load data</p>
        <p className="text-xs text-red-600 mt-0.5">{message}</p>
      </div>
      {onRetry && (
        <button onClick={onRetry} className="text-xs text-red-600 hover:text-red-800 font-medium flex-shrink-0">
          Retry
        </button>
      )}
    </div>
  )
}

/* ── Empty state ─────────────────────────────────────────────────────────── */
export function EmptyState({ message = 'No incidents found.' }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
      <svg className="w-12 h-12" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
      <p className="text-sm">{message}</p>
    </div>
  )
}

/* ── Stat card ───────────────────────────────────────────────────────────── */
export function StatCard({ label, value, sub, icon, accent = 'civic' }) {
  const accents = {
    civic:  'border-l-civic-500  bg-civic-50',
    amber:  'border-l-amber-500  bg-amber-50',
    green:  'border-l-green-500  bg-green-50',
    red:    'border-l-red-500    bg-red-50',
    purple: 'border-l-purple-500 bg-purple-50',
    gray:   'border-l-gray-400   bg-gray-50',
  }
  return (
    <div className={`rounded-xl border border-gray-200 border-l-4 shadow-card px-5 py-4 ${accents[accent] ?? accents.civic}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1 tabular-nums">{value ?? '—'}</p>
          {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
        </div>
        {icon && (
          <div className="text-2xl leading-none flex-shrink-0 mt-0.5">{icon}</div>
        )}
      </div>
    </div>
  )
}

/* ── Category badge ──────────────────────────────────────────────────────── */
export function CategoryBadge({ category }) {
  const m = CATEGORY_META[category] ?? CATEGORY_META.other
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${m.color}`}>
      {m.icon} {m.label}
    </span>
  )
}

/* ── Severity badge ──────────────────────────────────────────────────────── */
export function SeverityBadge({ severity }) {
  if (!severity) return <span className="text-xs text-gray-400">—</span>
  const m = SEVERITY_META[severity]
  if (!m) return <span className="text-xs text-gray-400">{severity}</span>
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold border ${m.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${m.dot}`} />
      {m.label}
    </span>
  )
}

/* ── Status badge ────────────────────────────────────────────────────────── */
export function StatusBadge({ status }) {
  const m = STATUS_META[status]
  if (!m) return <span className="text-xs text-gray-400">{status}</span>
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${m.color}`}>
      {m.label}
    </span>
  )
}

/* ── Filter select ───────────────────────────────────────────────────────── */
export function FilterSelect({ label, value, onChange, options, placeholder = 'All' }) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      {label && <label className="text-xs font-medium text-gray-500">{label}</label>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-800
          focus:outline-none focus:ring-2 focus:ring-civic-500 focus:border-transparent"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

/* ── Search input ────────────────────────────────────────────────────────── */
export function SearchInput({ value, onChange, placeholder = 'Search incidents…' }) {
  return (
    <div className="relative">
      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
        fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-800
          placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-civic-500 focus:border-transparent"
      />
    </div>
  )
}

/* ── Refresh button ──────────────────────────────────────────────────────── */
export function RefreshButton({ onClick, loading }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      title="Refresh data"
      className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 bg-white rounded-lg text-sm
        text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
    >
      <svg
        className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
        fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
      {loading ? 'Refreshing…' : 'Refresh'}
    </button>
  )
}
