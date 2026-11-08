/**
 * MyTasksPage — shows issues assigned to the currently logged-in worker.
 * GET /api/issues/mine filters by assigned_to for workers and reporter_id for citizens.
 */
import client from '../api/client'
import { useFetch } from '../hooks/useFetch'
import { useAuth } from '../store/AuthContext'
import {
  LoadingState, ErrorBanner, EmptyState,
  CategoryBadge, SeverityBadge, StatusBadge,
} from '../components/ui/index'

function fetchAssignedTasks() {
  return client.get('/issues/mine', { params: { limit: 200 } })
}

export default function MyTasksPage() {
  const { user } = useAuth()
  const { data: tasks, loading, error, refetch } = useFetch(fetchAssignedTasks, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Assigned Tasks</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Field tasks assigned to you, {user?.name}.
        </p>
      </div>

      {loading && <LoadingState label="Loading your tasks…" />}
      {error   && <ErrorBanner message={error} onRetry={refetch} />}

      {!loading && !error && (
        <>
          {(!tasks || tasks.length === 0) ? (
            <EmptyState message="No tasks currently assigned to you." />
          ) : (
            <div className="space-y-3">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="bg-white rounded-xl border border-gray-200 shadow-card px-5 py-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <span className="text-xs text-gray-400 font-mono">#{task.id}</span>
                      <p className="font-medium text-gray-900 mt-0.5 truncate">{task.title}</p>
                      {task.address && (
                        <p className="text-xs text-gray-500 mt-0.5">📍 {task.address}</p>
                      )}
                    </div>
                    <StatusBadge status={task.status} />
                  </div>

                  <div className="flex flex-wrap gap-2 mt-3">
                    {task.category  && <CategoryBadge category={task.category} />}
                    {task.severity  && <SeverityBadge severity={task.severity} />}
                    {task.department && (
                      <span className="text-xs text-gray-500 bg-gray-100 border border-gray-200
                        rounded-full px-2 py-0.5">
                        {task.department}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
