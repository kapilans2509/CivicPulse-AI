/**
 * AuthContext — application-wide authentication state.
 *
 * Provides:
 *   user        — { id, name, email, role } or null
 *   login(email, password) — authenticates and stores token
 *   logout()               — clears token and user state
 *   isAuthenticated        — boolean
 *   hasRole(...roles)      — true if user.role is in the given set
 */
import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../api/auth'
import { setUnauthorizedHandler } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => authApi.getUser())
  const navigate = useNavigate()

  // Register the 401 handler once so the axios interceptor can trigger logout
  // without importing React context directly.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      authApi.logout()
      setUser(null)
      navigate('/login', { replace: true })
    })
    return () => setUnauthorizedHandler(null)
  }, [navigate])

  const login = useCallback(async (email, password) => {
    const u = await authApi.login(email, password)
    setUser(u)
    return u
  }, [])

  const logout = useCallback(() => {
    authApi.logout()
    setUser(null)
  }, [])

  const hasRole = useCallback(
    (...roles) => user != null && roles.includes(user.role),
    [user],
  )

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: user != null,
      login,
      logout,
      hasRole,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
