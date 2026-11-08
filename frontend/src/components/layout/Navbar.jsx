import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../store/AuthContext'

const ROLE_BADGE = {
  citizen: { label: 'Citizen', cls: 'bg-civic-100  text-civic-800' },
  officer: { label: 'Officer', cls: 'bg-amber-100  text-amber-800' },
  worker:  { label: 'Worker',  cls: 'bg-green-100  text-green-800' },
  admin:   { label: 'Admin',   cls: 'bg-purple-100 text-purple-800' },
}

/**
 * Returns the nav items visible to the given role.
 *
 * citizen  → Home, Report, My Reports
 * officer  → Home, Report, Dashboard, Map
 * worker   → Home, My Tasks
 * admin    → Home, Dashboard, Map (everything)
 */
function navItemsForRole(role) {
  const home     = { to: '/',          label: 'Home',       end: true }
  const report   = { to: '/report',    label: 'Report'               }
  const dash     = { to: '/dashboard', label: 'Dashboard'            }
  const map      = { to: '/map',       label: 'Map'                  }
  const myIssues = { to: '/my-reports',label: 'My Reports'           }
  const myTasks  = { to: '/my-tasks',  label: 'My Tasks'             }

  switch (role) {
    case 'officer': return [home, report, dash, map]
    case 'admin':   return [home, dash, map]
    case 'worker':  return [home, myTasks]
    case 'citizen':
    default:        return [home, report, myIssues]
  }
}

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuth()
  const navigate = useNavigate()

  const navItems = isAuthenticated ? navItemsForRole(user?.role) : [
    { to: '/', label: 'Home', end: true },
  ]

  const badge = user ? (ROLE_BADGE[user.role] ?? ROLE_BADGE.citizen) : null

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <nav className="bg-civic-700 text-white shadow-md">
      <div className="container mx-auto px-4 max-w-7xl flex items-center justify-between h-16 gap-4">
        {/* Brand */}
        <NavLink to="/" className="font-bold text-xl tracking-tight flex-shrink-0">
          🏙️ CivicPulse <span className="text-civic-100 font-light">AI</span>
        </NavLink>

        {/* Nav links */}
        <ul className="flex gap-1 flex-1">
          {navItems.map(({ to, label, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  `px-3 py-2 rounded text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-civic-500 text-white'
                      : 'hover:bg-civic-600 text-civic-100'
                  }`
                }
              >
                {label}
              </NavLink>
            </li>
          ))}
        </ul>

        {/* Auth section */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {isAuthenticated ? (
            <>
              <div className="hidden sm:flex flex-col items-end leading-tight">
                <span className="text-sm font-medium text-white truncate max-w-[120px]">{user.name}</span>
                {badge && (
                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded mt-0.5 ${badge.cls}`}>
                    {badge.label}
                  </span>
                )}
              </div>
              <button
                onClick={handleLogout}
                className="px-3 py-1.5 rounded text-sm font-medium bg-civic-800
                  hover:bg-civic-900 text-civic-100 transition-colors"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <NavLink
                to="/login"
                className={({ isActive }) =>
                  `px-3 py-2 rounded text-sm font-medium transition-colors ${
                    isActive ? 'bg-civic-500 text-white' : 'hover:bg-civic-600 text-civic-100'
                  }`
                }
              >
                Sign in
              </NavLink>
              <NavLink
                to="/register"
                className="px-3 py-2 rounded text-sm font-medium bg-white text-civic-700
                  hover:bg-civic-50 transition-colors"
              >
                Register
              </NavLink>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
