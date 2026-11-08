/**
 * MyReportsPage — shows a citizen's own reported issues.
 * Uses GET /api/issues/mine — never calls the officer-only GET /api/issues/.
 */
import client from '../api/client'
import { useFetch } from '../hooks/useFetch'
import { useAuth } from '../store/AuthContext'
import { Link } from 'react-router-dom'
import {
  LoadingState, ErrorBanner, EmptyState,
  CategoryBadge, SeverityBadge, StatusBadge,
} from '../components/ui/index'

function fetchMyIssues() {
  return client.get('/issues/mine', { params: { limit: 200 } })
}

export default function MyReportsPage() {
  const { user } = useAuth()
  const { data: issues, loading, error, refetch } = useFetch(fetchMyIssues, [])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Complaints you have submitted, {user?.name}.
          </p>
        </div>
        <Link
          to="/report"
          className="inline-flex items-center gap-2 rounded-lg bg-civic-600 px-4 py-2
            text-sm font-semibold text-white hover:bg-civic-700 transition-colors"
        >
          + Report New Issue
        </Link>
      </div>

      {/* Content */}
      {loading && <LoadingState label="Loading your reports…" />}
      {error   && <ErrorBanner message={error} onRetry={refetch} />}

      {!loading && !error && (
        <>
          {(!issues || issues.length === 0) ? (
            <EmptyState message="You haven't submitted any reports yet." />
          ) : (
            <div className="space-y-3">
              {issues.map((issue) => (
                <div
                  key={issue.id}
                  className="bg-white rounded-xl border border-gray-200 shadow-card px-5 py-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="text-xs text-gray-400 font-mono">#{issue.id}</span>
                        {issue.is_duplicate && (
                          <span className="text-xs bg-orange-100 text-orange-700 border border-orange-200
                            rounded-full px-2 py-0.5 font-medium">
                            ⚠ Duplicate of #{issue.canonical_issue_id}
                          </span>
                        )}
                      </div>
                      <p className="font-medium text-gray-900 truncate">{issue.title}</p>
                      {issue.address && (
                        <p className="text-xs text-gray-500 mt-0.5">📍 {issue.address}</p>
                      )}
                    </div>
                    <StatusBadge status={issue.status} />
                  </div>

                  <div className="flex flex-wrap gap-2 mt-3">
                    {issue.category  && <CategoryBadge category={issue.category} />}
                    {issue.severity  && <SeverityBadge severity={issue.severity} />}
                    {issue.department && (
                      <span className="text-xs text-gray-500 bg-gray-100 border border-gray-200
                        rounded-full px-2 py-0.5">
                        {issue.department}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-gray-400 mt-2">
                    Reported {new Date(issue.reported_at).toLocaleDateString('en-IN', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
