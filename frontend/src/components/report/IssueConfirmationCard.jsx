/**
 * IssueConfirmationCard — displayed after successful submission.
 * Shows the classified result from the agent pipeline.
 *
 * Props:
 *   issue : IssueRead object from API
 */

const CATEGORY_META = {
  pothole:     { label: 'Pothole',       icon: '🕳️', color: 'bg-orange-100 text-orange-800 border-orange-200' },
  garbage:     { label: 'Garbage Dump',  icon: '🗑️', color: 'bg-green-100 text-green-800 border-green-200'  },
  flooding:    { label: 'Flooding',      icon: '🌊', color: 'bg-blue-100 text-blue-800 border-blue-200'     },
  road_damage: { label: 'Road Damage',   icon: '🚧', color: 'bg-red-100 text-red-800 border-red-200'        },
  other:       { label: 'Other Issue',   icon: '📍', color: 'bg-gray-100 text-gray-700 border-gray-200'     },
}

const SEVERITY_META = {
  low:      { label: 'Low',      dot: 'bg-green-500'  },
  medium:   { label: 'Medium',   dot: 'bg-amber-500'  },
  high:     { label: 'High',     dot: 'bg-red-500'    },
  critical: { label: 'Critical', dot: 'bg-purple-600' },
}

const STATUS_LABELS = {
  pending:           'Pending',
  classified:        'Classified',
  dispatched:        'Dispatched',
  awaiting_approval: 'Awaiting Approval',
  in_progress:       'In Progress',
  resolved:          'Resolved',
  rejected:          'Rejected',
}

function InfoRow({ label, value, mono = false }) {
  return (
    <div className="flex justify-between items-baseline gap-4 py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500 flex-shrink-0">{label}</span>
      <span className={`text-sm text-gray-900 text-right ${mono ? 'font-mono' : 'font-medium'}`}>{value ?? '—'}</span>
    </div>
  )
}

export default function IssueConfirmationCard({ issue }) {
  const cat = CATEGORY_META[issue.category] ?? CATEGORY_META.other
  const sev = SEVERITY_META[issue.severity]
  const reportedAt = new Date(issue.reported_at).toLocaleString('en-IN', {
    dateStyle: 'medium', timeStyle: 'short',
  })

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-card overflow-hidden">
      {/* Success banner */}
      <div className="bg-gradient-to-r from-civic-700 to-civic-600 px-6 py-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
          <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <p className="text-white font-semibold text-lg leading-tight">Report submitted</p>
          <p className="text-civic-100 text-sm mt-0.5">Your issue has been received and processed by our AI agents</p>
        </div>
      </div>

      <div className="px-6 py-5 space-y-5">
        {/* Incident ID */}
        <div className="flex items-center justify-between bg-civic-50 border border-civic-200 rounded-xl px-4 py-3">
          <div>
            <p className="text-xs text-civic-600 font-medium uppercase tracking-wide">Incident ID</p>
            <p className="text-2xl font-bold text-civic-800 mt-0.5 font-mono">#{String(issue.id).padStart(6, '0')}</p>
          </div>
          <div className="text-3xl">{cat.icon}</div>
        </div>

        {/* Classification badges */}
        <div className="flex flex-wrap gap-2">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${cat.color}`}>
            {cat.icon} {cat.label}
          </span>
          {sev && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border border-gray-200 bg-gray-50 text-gray-700">
              <span className={`w-2 h-2 rounded-full ${sev.dot}`} />
              {sev.label} severity
            </span>
          )}
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border
            ${issue.status === 'in_progress' || issue.status === 'dispatched'
              ? 'bg-blue-50 text-blue-700 border-blue-200'
              : issue.status === 'awaiting_approval'
              ? 'bg-amber-50 text-amber-700 border-amber-200'
              : 'bg-gray-50 text-gray-600 border-gray-200'
            }`}
          >
            {STATUS_LABELS[issue.status] ?? issue.status}
          </span>

          {issue.is_duplicate && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border border-amber-200 bg-amber-50 text-amber-700">
              ⚠ Duplicate of #{issue.canonical_issue_id}
            </span>
          )}
        </div>

        {/* Detail rows */}
        <div className="divide-y divide-gray-100">
          <InfoRow label="Title"       value={issue.title} />
          <InfoRow label="Reported at" value={reportedAt} />
          <InfoRow label="Coordinates" value={`${issue.latitude.toFixed(5)}, ${issue.longitude.toFixed(5)}`} mono />
          {issue.address && <InfoRow label="Address" value={issue.address} />}
        </div>

        {/* Photo thumbnail */}
        {issue.photo_path && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Attached photo</p>
            <img
              src={issue.photo_path}
              alt="Issue photo"
              className="rounded-xl w-full object-cover border border-gray-200"
              style={{ maxHeight: '180px' }}
            />
          </div>
        )}

        {/* Agent pipeline note */}
        <div className="bg-gray-50 rounded-xl border border-gray-100 p-3 text-xs text-gray-500 flex items-start gap-2">
          <svg className="w-4 h-4 text-civic-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.847.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          Your report was automatically classified and prioritised by the CivicPulse AI agent pipeline and dispatched to the appropriate BBMP department.
        </div>
      </div>
    </div>
  )
}
