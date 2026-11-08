/**
 * AccessDenied — shown when an authenticated user lacks the required role.
 * Does NOT log out the user. Shows their current role and what was needed.
 */
import { Link } from 'react-router-dom'
import { useAuth } from '../../store/AuthContext'

const ROLE_LABELS = {
  citizen: 'Citizen',
  officer: 'Officer',
  worker:  'Worker',
  admin:   'Admin',
}

export default function AccessDenied({ requiredRoles = [] }) {
  const { user } = useAuth()

  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
      <div className="text-5xl">🔒</div>
      <h1 className="text-xl font-bold text-gray-900">Access Denied</h1>
      <p className="text-sm text-gray-600 max-w-xs">
        Your account <strong>({ROLE_LABELS[user?.role] ?? user?.role ?? 'unknown'})</strong> does
        not have permission to view this page.
        {requiredRoles.length > 0 && (
          <span>
            {' '}Required role{requiredRoles.length > 1 ? 's' : ''}:{' '}
            <strong>{requiredRoles.map((r) => ROLE_LABELS[r] ?? r).join(' or ')}</strong>.
          </span>
        )}
      </p>
      <Link
        to="/"
        className="mt-2 inline-flex items-center gap-2 rounded-lg bg-civic-600 px-4 py-2
          text-sm font-semibold text-white hover:bg-civic-700 transition-colors"
      >
        ← Return to home
      </Link>
    </div>
  )
}
