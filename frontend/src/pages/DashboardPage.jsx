/**
 * DashboardPage — Civic Intelligence Operations Dashboard
 *
 * Sections:
 *   1. KPI stat row (total, pending, in-progress, high-severity, duplicates)
 *   2. Charts row  (category bar chart + status pie chart via Recharts)
 *   3. Incident table (searchable, filterable by category/severity/status)
 *
 * All data is fetched live from the FastAPI backend. No values are hardcoded.
 */
import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from 'recharts'

import { statsApi, issuesApi, agentsApi } from '../api/issues'
import { useFetch }                        from '../hooks/useFetch'
import {
  StatCard, CategoryBadge, SeverityBadge, StatusBadge,
  FilterSelect, SearchInput, RefreshButton,
  LoadingState, ErrorBanner, EmptyState,
} from '../components/ui/index'
import { CATEGORIES, SEVERITIES, STATUSES, CATEGORY_META, STATUS_META } from '../lib/constants'

// ─── Chart colour maps ────────────────────────────────────────────────────────

const CATEGORY_COLOURS = {
  pothole:     '#f97316',
  garbage:     '#16a34a',
  flooding:    '#0284c7',
  road_damage: '#dc2626',
  other:       '#6b7280',
}

const STATUS_COLOURS = {
  pending:           '#9ca3af',
  classified:        '#0ea5e9',
  dispatched:        '#6366f1',
  awaiting_approval: '#f59e0b',
  in_progress:       '#3b82f6',
  resolved:          '#16a34a',
  rejected:          '#ef4444',
}

// ─── Custom Recharts tooltip ──────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-card px-3 py-2 text-sm">
      {/* label = XAxis value for BarChart, nameKey value for PieChart */}
      {label && <p className="font-medium text-gray-700 mb-1">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color ?? p.fill }} className="font-semibold">
          {/* For BarChart cells, p.name is the dataKey ("value"); use label instead.
              For PieChart slices, p.name is the nameKey value which is meaningful. */}
          {p.name && p.name !== 'value' ? `${p.name}: ` : ''}{p.value}
        </p>
      ))}
    </div>
  )
}

// ─── Incident table row ───────────────────────────────────────────────────────

function IssueRow({ issue, onSelect }) {
  const reported = new Date(issue.reported_at).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
  return (
    <tr
      className="border-b border-gray-100 hover:bg-civic-50 cursor-pointer transition-colors"
      onClick={() => onSelect(issue)}
    >
      <td className="px-4 py-3 text-sm font-mono text-gray-500 whitespace-nowrap">
        #{String(issue.id).padStart(5, '0')}
      </td>
      <td className="px-4 py-3 max-w-xs">
        <p className="text-sm font-medium text-gray-900 truncate">{issue.title}</p>
        {issue.address && (
          <p className="text-xs text-gray-500 truncate mt-0.5">{issue.address}</p>
        )}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <CategoryBadge category={issue.category} />
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <SeverityBadge severity={issue.severity} />
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <StatusBadge status={issue.status} />
      </td>
      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{reported}</td>
      <td className="px-4 py-3 text-center">
        {issue.is_duplicate && (
          <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full">
            Dup
          </span>
        )}
      </td>
    </tr>
  )
}

// ─── AI Pipeline Tab ──────────────────────────────────────────────────────────

const AGENT_LABELS = {
  classifier_agent:   { label: 'Classification',       icon: '🏷️' },
  severity_agent:     { label: 'Severity Assessment',  icon: '⚠️' },
  deduplicator_agent: { label: 'Duplicate Detection',  icon: '🔍' },
  routing_agent:      { label: 'Department Routing',   icon: '🗺️' },
  dispatch_agent:     { label: 'Dispatch',             icon: '📤' },
}

function PipelineTab({ issueId }) {
  const { data: pipeline, loading, error, refetch } = useFetch(
    () => agentsApi.pipeline(issueId),
    [issueId]
  )

  if (loading) return (
    <div className="flex items-center justify-center py-10 gap-2 text-gray-400 text-sm">
      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
      </svg>
      Loading agent pipeline…
    </div>
  )

  if (error) return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {error}
      <button onClick={refetch} className="ml-2 underline text-xs">Retry</button>
    </div>
  )

  if (!pipeline) return null

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Steps', value: pipeline.total_steps },
          { label: 'Success', value: pipeline.success_count, ok: true },
          { label: 'Errors', value: pipeline.error_count, warn: pipeline.error_count > 0 },
        ].map(({ label, value, ok, warn }) => (
          <div key={label} className={`rounded-lg border px-3 py-2 text-center ${
            ok   ? 'border-green-200 bg-green-50'  :
            warn && value > 0 ? 'border-red-200 bg-red-50'    :
            'border-gray-200 bg-gray-50'
          }`}>
            <p className={`text-lg font-bold tabular-nums ${
              ok ? 'text-green-700' : warn && value > 0 ? 'text-red-700' : 'text-gray-800'
            }`}>{value}</p>
            <p className="text-xs text-gray-500">{label}</p>
          </div>
        ))}
      </div>

      {/* Routing summary */}
      {(pipeline.department || pipeline.zone) && (
        <div className="bg-civic-50 border border-civic-200 rounded-xl px-4 py-3 space-y-1">
          {pipeline.department && (
            <p className="text-xs text-gray-700">
              <span className="font-medium">Department:</span> {pipeline.department}
            </p>
          )}
          {pipeline.zone && (
            <p className="text-xs text-gray-700">
              <span className="font-medium">Zone:</span> {pipeline.zone}
            </p>
          )}
          {pipeline.sla_days && (
            <p className="text-xs text-gray-700">
              <span className="font-medium">SLA:</span> {pipeline.sla_days} day(s)
            </p>
          )}
          {pipeline.approval_decision && (
            <p className="text-xs text-gray-700">
              <span className="font-medium">Approval:</span>{' '}
              <span className={pipeline.approval_decision === 'approved'
                ? 'text-green-700' : pipeline.approval_decision === 'rejected'
                ? 'text-red-700' : 'text-amber-700'}>
                {pipeline.approval_decision}
              </span>
            </p>
          )}
        </div>
      )}

      {/* Step timeline */}
      <div className="space-y-2">
        {pipeline.steps.map((step, idx) => {
          const meta = AGENT_LABELS[step.agent_name] ?? { label: step.agent_name, icon: '🤖' }
          const isOk = step.status === 'success'
          const ts   = new Date(step.timestamp).toLocaleTimeString('en-IN', { timeStyle: 'medium' })
          return (
            <div key={idx} className={`rounded-xl border p-3 space-y-1.5 ${
              isOk ? 'border-gray-100 bg-white' : 'border-red-200 bg-red-50'
            }`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-base leading-none flex-shrink-0">{meta.icon}</span>
                  <span className="text-xs font-semibold text-gray-800 truncate">{meta.label}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${
                    isOk ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {step.status}
                  </span>
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">
                  {step.duration_ms != null ? `${step.duration_ms}ms` : ''}
                </span>
              </div>

              {step.reason && (
                <p className="text-xs text-gray-600 leading-snug">{step.reason}</p>
              )}

              {step.confidence != null && (
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-civic-500"
                      style={{ width: `${Math.round(step.confidence * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 flex-shrink-0">
                    {Math.round(step.confidence * 100)}%
                  </span>
                </div>
              )}

              {step.error_detail && (
                <p className="text-xs text-red-600 font-mono">{step.error_detail}</p>
              )}

              <p className="text-xs text-gray-400">{ts}</p>
            </div>
          )
        })}
      </div>

      {pipeline.steps.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-6">
          No agent pipeline data for this issue.
        </p>
      )}
    </div>
  )
}

// ─── Slide-out detail panel ───────────────────────────────────────────────────

const UPDATABLE_STATUSES = [
  { value: 'pending',           label: 'Pending'           },
  { value: 'in_progress',       label: 'In Progress'       },
  { value: 'resolved',          label: 'Resolved'          },
  { value: 'rejected',          label: 'Rejected'          },
  { value: 'awaiting_approval', label: 'Awaiting Approval' },
]

const PANEL_TABS = ['Details', 'AI Pipeline', 'Actions']

function DetailPanel({ issue, onClose, onStatusUpdated }) {
  const [tab,        setTab]        = useState('Details')
  const [newStatus,  setNewStatus]  = useState(issue.status)
  const [saving,     setSaving]     = useState(false)
  const [saveError,  setSaveError]  = useState(null)
  const [saveOk,     setSaveOk]     = useState(false)
  const [workers, setWorkers] = useState([])
  const [selectedWorker, setSelectedWorker] = useState(issue.assigned_to ? String(issue.assigned_to) : '')
  const [workersLoading, setWorkersLoading] = useState(false)
  const [assignmentSaving, setAssignmentSaving] = useState(false)
  const [assignmentError, setAssignmentError] = useState(null)
  const [assignmentOk, setAssignmentOk] = useState(false)

  useEffect(() => {
    setTab('Details')
    setNewStatus(issue.status)
    setSaveError(null)
    setSaveOk(false)
    setSelectedWorker(issue.assigned_to ? String(issue.assigned_to) : '')
    setAssignmentError(null)
    setAssignmentOk(false)
  }, [issue.id, issue.status, issue.assigned_to])

  useEffect(() => {
    let active = true
    setWorkersLoading(true)
    issuesApi.workers()
      .then((response) => { if (active) setWorkers(response.data) })
      .catch((err) => { if (active) setAssignmentError(err.message ?? 'Could not load workers.') })
      .finally(() => { if (active) setWorkersLoading(false) })
    return () => { active = false }
  }, [])

  const handleAssignmentSave = async () => {
    setAssignmentSaving(true)
    setAssignmentError(null)
    setAssignmentOk(false)
    try {
      await issuesApi.update(issue.id, { assigned_to: selectedWorker ? Number(selectedWorker) : null })
      setAssignmentOk(true)
      onStatusUpdated()
    } catch (err) {
      setAssignmentError(err.message ?? 'Assignment failed.')
    } finally {
      setAssignmentSaving(false)
    }
  }

  const handleStatusSave = async () => {
    if (newStatus === issue.status) return
    setSaving(true)
    setSaveError(null)
    setSaveOk(false)
    try {
      await issuesApi.update(issue.id, { status: newStatus })
      setSaveOk(true)
      onStatusUpdated()
    } catch (err) {
      setSaveError(err.message ?? 'Update failed.')
    } finally {
      setSaving(false)
    }
  }

  const reported = new Date(issue.reported_at).toLocaleString('en-IN', {
    dateStyle: 'medium', timeStyle: 'short',
  })

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ backgroundColor: 'rgba(0,0,0,0.35)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-civic-700 px-5 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <p className="text-xs text-civic-200 font-medium uppercase tracking-wide">Incident</p>
            <p className="text-white font-bold text-lg font-mono">
              #{String(issue.id).padStart(5, '0')}
            </p>
          </div>
          <button onClick={onClose} className="text-civic-200 hover:text-white transition-colors p-1">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-gray-200 px-5 flex-shrink-0 bg-white">
          {PANEL_TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-3 text-xs font-medium border-b-2 transition-colors ${
                tab === t
                  ? 'border-civic-600 text-civic-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'Details' && (
            <div className="space-y-5">
              {/* Badges */}
              <div className="flex flex-wrap gap-2">
                <CategoryBadge category={issue.category} />
                <SeverityBadge severity={issue.severity} />
                <StatusBadge status={issue.status} />
                {issue.is_duplicate && (
                  <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
                    ⚠ Duplicate of #{issue.canonical_issue_id}
                  </span>
                )}
              </div>

              {/* Title & description */}
              <div>
                <p className="text-base font-semibold text-gray-900">{issue.title}</p>
                <p className="text-sm text-gray-600 mt-2 leading-relaxed">{issue.description}</p>
              </div>

              {/* Meta rows */}
              <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden">
                {[
                  { label: 'Reported',    value: reported },
                  { label: 'Address',     value: issue.address ?? '—' },
                  { label: 'Coordinates', value: `${issue.latitude.toFixed(5)}, ${issue.longitude.toFixed(5)}` },
                  { label: 'Department',  value: issue.department ?? '—' },
                  { label: 'Ward/Zone',   value: issue.ward ?? '—' },
                  { label: 'Reporter',    value: issue.reporter_id ? `#${issue.reporter_id}` : 'Anonymous' },
                ].map(({ label, value }) => (
                  <div key={label} className="flex gap-4 px-4 py-2.5 bg-gray-50">
                    <span className="text-xs font-medium text-gray-500 w-24 flex-shrink-0 pt-0.5">{label}</span>
                    <span className="text-xs text-gray-800 break-words min-w-0">{value}</span>
                  </div>
                ))}
              </div>

              {issue.photo_path && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">Attached photo</p>
                  <img
                    src={issue.photo_path}
                    alt="Issue"
                    className="w-full rounded-xl border border-gray-200 object-cover"
                    style={{ maxHeight: '200px' }}
                  />
                </div>
              )}
            </div>
          )}

          {tab === 'AI Pipeline' && <PipelineTab issueId={issue.id} />}

          {tab === 'Actions' && (
            <div className="space-y-4">
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Assign Worker</p>
                <div className="flex gap-2 items-center">
                  <select
                    value={selectedWorker}
                    onChange={(e) => { setSelectedWorker(e.target.value); setAssignmentOk(false); setAssignmentError(null) }}
                    disabled={workersLoading}
                    className="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-civic-500"
                  >
                    <option value="">Unassigned</option>
                    {workers.map((worker) => (
                      <option key={worker.id} value={String(worker.id)}>
                        {worker.name} ({worker.email})
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleAssignmentSave}
                    disabled={assignmentSaving || workersLoading || selectedWorker === (issue.assigned_to ? String(issue.assigned_to) : '')}
                    className="px-4 py-2 bg-civic-600 text-white text-sm font-medium rounded-lg hover:bg-civic-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {assignmentSaving ? 'Saving…' : 'Assign'}
                  </button>
                </div>
                {workers.length === 0 && !workersLoading && (
                  <p className="text-xs text-amber-700">No worker accounts found. Register a worker account and set its role to worker first.</p>
                )}
                {assignmentOk && <p className="text-xs text-green-700">Worker assignment saved.</p>}
                {assignmentError && <p className="text-xs text-red-600">{assignmentError}</p>}
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Update Status</p>
                <div className="flex gap-2 items-center">
                  <select
                    value={newStatus}
                    onChange={(e) => { setNewStatus(e.target.value); setSaveOk(false); setSaveError(null) }}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white
                      focus:outline-none focus:ring-2 focus:ring-civic-500 focus:border-transparent"
                  >
                    {UPDATABLE_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleStatusSave}
                    disabled={saving || newStatus === issue.status}
                    className="px-4 py-2 bg-civic-600 text-white text-sm font-medium rounded-lg
                      hover:bg-civic-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
                {saveOk && (
                  <p className="text-xs text-green-700 flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Status updated successfully
                  </p>
                )}
                {saveError && (
                  <p className="text-xs text-red-600">{saveError}</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main DashboardPage ───────────────────────────────────────────────────────

export default function DashboardPage() {
  const navigate = useNavigate()

  // ── Filters state ──
  const [search,   setSearch]   = useState('')
  const [catFilter,  setCat]    = useState('')
  const [sevFilter,  setSev]    = useState('')
  const [statFilter, setStat]   = useState('')
  const [selected, setSelected] = useState(null)

  // ── Stats fetch ──
  const {
    data: stats, loading: statsLoading, error: statsError, refetch: refetchStats,
  } = useFetch(() => statsApi.dashboard(), [])

  // ── Issues fetch — re-runs whenever any filter changes ──
  const issuesFetcher = useCallback(
    () => issuesApi.list({
      limit: 500,
      ...(search    ? { search }           : {}),
      ...(catFilter ? { category: catFilter } : {}),
      ...(sevFilter ? { severity: sevFilter } : {}),
      ...(statFilter? { status: statFilter }  : {}),
    }),
    [search, catFilter, sevFilter, statFilter]
  )
  const {
    data: issues, loading: issuesLoading, error: issuesError, refetch: refetchIssues,
  } = useFetch(issuesFetcher, [issuesFetcher])

  const refetchAll = () => { refetchStats(); refetchIssues() }

  // ── Keep selected panel in sync with refreshed issues data ──
  // When the issues list is re-fetched after a status update, update the
  // selected object so the DetailPanel reflects the new state immediately.
  useEffect(() => {
    if (selected && issues) {
      const refreshed = issues.find((i) => i.id === selected.id)
      if (refreshed && (refreshed.status !== selected.status || refreshed.assigned_to !== selected.assigned_to)) {
        setSelected(refreshed)
      }
    }
  }, [issues]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Chart data derived from stats ──
  const categoryChartData = (stats?.by_category ?? []).map((c) => ({
    name: CATEGORY_META[c.category]?.label ?? c.category,
    value: c.count,
    fill: CATEGORY_COLOURS[c.category] ?? '#6b7280',
  }))

  const statusChartData = (stats?.by_status ?? []).map((s) => ({
    name: STATUS_META[s.status]?.label ?? s.status,
    value: s.count,
    fill: STATUS_COLOURS[s.status] ?? '#9ca3af',
  }))

  const isLoading = statsLoading || issuesLoading

  return (
    <div className="space-y-6">
      {/* ── Page header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Operations Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Live civic intelligence data — all metrics derived from submitted incidents
          </p>
        </div>
        <div className="flex gap-2">
          <RefreshButton onClick={refetchAll} loading={isLoading} />
          <button
            onClick={() => navigate('/map')}
            className="flex items-center gap-1.5 px-3 py-2 bg-civic-600 text-white rounded-lg text-sm font-medium hover:bg-civic-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            City Map
          </button>
        </div>
      </div>

      {statsError && <ErrorBanner message={statsError} onRetry={refetchStats} />}

      {/* ── KPI row ── */}
      {statsLoading ? (
        <LoadingState label="Loading statistics…" />
      ) : stats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <StatCard
            label="Total Incidents"
            value={stats.total}
            icon="📋"
            accent="civic"
          />
          <StatCard
            label="Pending"
            value={stats.pending}
            icon="⏳"
            accent="gray"
          />
          <StatCard
            label="Awaiting Approval"
            value={stats.awaiting_approval}
            icon="🔐"
            accent="amber"
            sub="needs human decision"
          />
          <StatCard
            label="In Progress"
            value={stats.in_progress}
            icon="🔧"
            accent="civic"
          />
          <StatCard
            label="Resolved"
            value={stats.resolved}
            icon="✅"
            accent="green"
          />
          <StatCard
            label="High Severity"
            value={stats.high_severity}
            icon="🚨"
            accent="red"
            sub="high + critical"
          />
          <StatCard
            label="Duplicates"
            value={stats.duplicates}
            icon="🔁"
            accent="gray"
            sub="auto-detected"
          />
        </div>
      ) : null}

      {/* ── Charts row ── */}
      {stats && (stats.by_category.length > 0 || stats.by_status.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Category bar chart */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-card p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Incidents by Category</h2>
            {categoryChartData.length === 0 ? (
              <EmptyState message="No classified incidents yet." />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={categoryChartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {categoryChartData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Status pie chart */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-card p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Incidents by Status</h2>
            {statusChartData.length === 0 ? (
              <EmptyState message="No incidents yet." />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={statusChartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {statusChartData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {/* ── Incident table ── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-card overflow-hidden">
        {/* Table toolbar */}
        <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-48">
            <SearchInput value={search} onChange={setSearch} placeholder="Search title, description or address…" />
          </div>
          <FilterSelect
            label="Category"
            value={catFilter}
            onChange={setCat}
            options={CATEGORIES}
            placeholder="All categories"
          />
          <FilterSelect
            label="Severity"
            value={sevFilter}
            onChange={setSev}
            options={SEVERITIES}
            placeholder="All severities"
          />
          <FilterSelect
            label="Status"
            value={statFilter}
            onChange={setStat}
            options={STATUSES}
            placeholder="All statuses"
          />
          {(catFilter || sevFilter || statFilter || search) && (
            <button
              onClick={() => { setCat(''); setSev(''); setStat(''); setSearch('') }}
              className="text-xs text-civic-600 hover:text-civic-800 font-medium self-end pb-2"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Table */}
        {issuesLoading ? (
          <LoadingState label="Loading incidents…" />
        ) : issuesError ? (
          <div className="p-5"><ErrorBanner message={issuesError} onRetry={refetchIssues} /></div>
        ) : !issues?.length ? (
          <EmptyState message={
            (catFilter || sevFilter || statFilter || search)
              ? 'No incidents match the current filters.'
              : 'No incidents have been reported yet.'
          } />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['ID', 'Title / Address', 'Category', 'Severity', 'Status', 'Reported', 'Flags'].map((h) => (
                    <th key={h} className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {issues.map((issue) => (
                  <IssueRow key={issue.id} issue={issue} onSelect={setSelected} />
                ))}
              </tbody>
            </table>
            <p className="text-xs text-gray-400 text-right px-5 py-3 border-t border-gray-100">
              {issues.length} incident{issues.length !== 1 ? 's' : ''} shown
            </p>
          </div>
        )}
      </div>

      {/* ── Detail panel — only mount when an issue is selected ── */}
      {selected && (
        <DetailPanel
          issue={selected}
          onClose={() => setSelected(null)}
          onStatusUpdated={refetchAll}
        />
      )}
    </div>
  )
}
