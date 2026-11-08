/**
 * ProtectedRoute — guards a route by authentication and optional role.
 *
 * Usage:
 *   <ProtectedRoute>                     — any authenticated user
 *   <ProtectedRoute roles={['officer']}>  — officer or admin
 *   <ProtectedRoute roles={['officer','admin']}> — same
 *
 * Unauthenticated: redirects to /login, preserving the intended path.
 * Wrong role:       renders <AccessDenied> inline (does NOT log out).
 */
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../store/AuthContext'
import AccessDenied from './AccessDenied'

export default function ProtectedRoute({ children, roles }) {
  const { isAuthenticated, hasRole } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (roles && roles.length > 0 && !hasRole(...roles)) {
    return <AccessDenied requiredRoles={roles} />
  }

  return children
}
