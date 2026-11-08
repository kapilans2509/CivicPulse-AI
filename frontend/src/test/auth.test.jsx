/**
 * Frontend unit tests for:
 *  1. AuthContext — login/logout/role state
 *  2. ProtectedRoute — unauthenticated redirect, role guard
 *  3. Navbar — role-based nav items, login/logout buttons
 *  4. LoginPage — form renders, error display
 *  5. RegisterPage — form renders, password mismatch
 *  6. AccessDenied — shows role info
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { vi } from 'vitest'

// ── Mock the auth API to avoid real HTTP calls ────────────────────────────────
vi.mock('../api/auth', () => ({
  authApi: {
    login:           vi.fn(),
    register:        vi.fn(),
    logout:          vi.fn(),
    getToken:        vi.fn(() => null),
    getUser:         vi.fn(() => null),
    isAuthenticated: vi.fn(() => false),
  },
}))

// Mock client.js to prevent interceptor setup
vi.mock('../api/client', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  setUnauthorizedHandler: vi.fn(),
}))

import { authApi } from '../api/auth'
import { AuthProvider, useAuth } from '../store/AuthContext'
import ProtectedRoute from '../components/auth/ProtectedRoute'
import AccessDenied from '../components/auth/AccessDenied'
import Navbar from '../components/layout/Navbar'
import LoginPage from '../pages/LoginPage'
import RegisterPage from '../pages/RegisterPage'

// ── Test utilities ────────────────────────────────────────────────────────────

function renderWithAuth(ui, { initialEntries = ['/'], userOverride = null } = {}) {
  if (userOverride) {
    authApi.getUser.mockReturnValue(userOverride)
    authApi.getToken.mockReturnValue('fake-token')
    authApi.isAuthenticated.mockReturnValue(true)
  } else {
    authApi.getUser.mockReturnValue(null)
    authApi.getToken.mockReturnValue(null)
    authApi.isAuthenticated.mockReturnValue(false)
  }

  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider>
        {ui}
      </AuthProvider>
    </MemoryRouter>
  )
}

const CITIZEN = { id: 1, name: 'Alice', email: 'alice@test.com', role: 'citizen' }
const OFFICER = { id: 2, name: 'Bob',   email: 'bob@test.com',   role: 'officer' }
const WORKER  = { id: 3, name: 'Carol', email: 'carol@test.com', role: 'worker'  }
const ADMIN   = { id: 4, name: 'Dave',  email: 'dave@test.com',  role: 'admin'   }

// ── 1. AuthContext ────────────────────────────────────────────────────────────

describe('AuthContext', () => {
  beforeEach(() => vi.clearAllMocks())

  test('provides null user when not authenticated', () => {
    function Consumer() {
      const { user, isAuthenticated } = useAuth()
      return <div data-testid="state">{isAuthenticated ? user.name : 'unauthenticated'}</div>
    }
    renderWithAuth(<Consumer />)
    expect(screen.getByTestId('state')).toHaveTextContent('unauthenticated')
  })

  test('provides user object when authenticated', () => {
    function Consumer() {
      const { user, isAuthenticated } = useAuth()
      return <div data-testid="state">{isAuthenticated ? user.name : 'unauthenticated'}</div>
    }
    renderWithAuth(<Consumer />, { userOverride: CITIZEN })
    expect(screen.getByTestId('state')).toHaveTextContent('Alice')
  })

  test('hasRole returns true for matching role', () => {
    function Consumer() {
      const { hasRole } = useAuth()
      return <div data-testid="r">{hasRole('officer') ? 'yes' : 'no'}</div>
    }
    renderWithAuth(<Consumer />, { userOverride: OFFICER })
    expect(screen.getByTestId('r')).toHaveTextContent('yes')
  })

  test('hasRole returns false for non-matching role', () => {
    function Consumer() {
      const { hasRole } = useAuth()
      return <div data-testid="r">{hasRole('admin') ? 'yes' : 'no'}</div>
    }
    renderWithAuth(<Consumer />, { userOverride: CITIZEN })
    expect(screen.getByTestId('r')).toHaveTextContent('no')
  })

  test('login stores user and updates state', async () => {
    authApi.login.mockResolvedValue(CITIZEN)
    function Consumer() {
      const { user, login } = useAuth()
      return (
        <div>
          <span data-testid="name">{user?.name ?? 'none'}</span>
          <button onClick={() => login('a@b.com', 'pw')}>login</button>
        </div>
      )
    }
    renderWithAuth(<Consumer />)
    fireEvent.click(screen.getByText('login'))
    await waitFor(() => expect(screen.getByTestId('name')).toHaveTextContent('Alice'))
  })

  test('logout clears user state', async () => {
    authApi.login.mockResolvedValue(CITIZEN)
    function Consumer() {
      const { user, login, logout } = useAuth()
      return (
        <div>
          <span data-testid="name">{user?.name ?? 'none'}</span>
          <button onClick={() => login('a@b.com', 'pw')}>login</button>
          <button onClick={logout}>logout</button>
        </div>
      )
    }
    renderWithAuth(<Consumer />)
    fireEvent.click(screen.getByText('login'))
    await waitFor(() => expect(screen.getByTestId('name')).toHaveTextContent('Alice'))
    fireEvent.click(screen.getByText('logout'))
    await waitFor(() => expect(screen.getByTestId('name')).toHaveTextContent('none'))
  })
})

// ── 2. ProtectedRoute ─────────────────────────────────────────────────────────

describe('ProtectedRoute', () => {
  beforeEach(() => vi.clearAllMocks())

  test('unauthenticated user is redirected to /login', () => {
    renderWithAuth(
      <Routes>
        <Route path="/protected" element={
          <ProtectedRoute><div>secret</div></ProtectedRoute>
        } />
        <Route path="/login" element={<div>login page</div>} />
      </Routes>,
      { initialEntries: ['/protected'] }
    )
    expect(screen.getByText('login page')).toBeInTheDocument()
    expect(screen.queryByText('secret')).not.toBeInTheDocument()
  })

  test('authenticated user with correct role sees content', () => {
    renderWithAuth(
      <Routes>
        <Route path="/" element={
          <ProtectedRoute roles={['officer']}><div>officer content</div></ProtectedRoute>
        } />
      </Routes>,
      { userOverride: OFFICER }
    )
    expect(screen.getByText('officer content')).toBeInTheDocument()
  })

  test('authenticated user with wrong role sees AccessDenied', () => {
    renderWithAuth(
      <Routes>
        <Route path="/" element={
          <ProtectedRoute roles={['admin']}><div>admin only</div></ProtectedRoute>
        } />
      </Routes>,
      { userOverride: CITIZEN }
    )
    expect(screen.getByText('Access Denied')).toBeInTheDocument()
    expect(screen.queryByText('admin only')).not.toBeInTheDocument()
  })

  test('citizen cannot access officer-only route', () => {
    renderWithAuth(
      <Routes>
        <Route path="/dashboard" element={
          <ProtectedRoute roles={['officer', 'admin']}><div>dashboard</div></ProtectedRoute>
        } />
      </Routes>,
      { initialEntries: ['/dashboard'], userOverride: CITIZEN }
    )
    expect(screen.getByText('Access Denied')).toBeInTheDocument()
  })

  test('worker cannot access officer-only route', () => {
    renderWithAuth(
      <Routes>
        <Route path="/dashboard" element={
          <ProtectedRoute roles={['officer', 'admin']}><div>dashboard</div></ProtectedRoute>
        } />
      </Routes>,
      { initialEntries: ['/dashboard'], userOverride: WORKER }
    )
    expect(screen.getByText('Access Denied')).toBeInTheDocument()
  })

  test('admin can access admin route', () => {
    renderWithAuth(
      <Routes>
        <Route path="/" element={
          <ProtectedRoute roles={['admin']}><div>admin panel</div></ProtectedRoute>
        } />
      </Routes>,
      { userOverride: ADMIN }
    )
    expect(screen.getByText('admin panel')).toBeInTheDocument()
  })
})

// ── 3. Navbar — role-based navigation ────────────────────────────────────────

describe('Navbar', () => {
  beforeEach(() => vi.clearAllMocks())

  test('unauthenticated shows Sign in and Register', () => {
    renderWithAuth(<Navbar />)
    expect(screen.getByText('Sign in')).toBeInTheDocument()
    expect(screen.getByText('Register')).toBeInTheDocument()
    expect(screen.queryByText('Sign out')).not.toBeInTheDocument()
  })

  test('citizen sees Report and My Reports, not Dashboard', () => {
    renderWithAuth(<Navbar />, { userOverride: CITIZEN })
    expect(screen.getByText('Report')).toBeInTheDocument()
    expect(screen.getByText('My Reports')).toBeInTheDocument()
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
  })

  test('officer sees Dashboard and Map', () => {
    renderWithAuth(<Navbar />, { userOverride: OFFICER })
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Map')).toBeInTheDocument()
  })

  test('worker sees My Tasks, not Dashboard', () => {
    renderWithAuth(<Navbar />, { userOverride: WORKER })
    expect(screen.getByText('My Tasks')).toBeInTheDocument()
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
  })

  test('admin sees Dashboard and Map', () => {
    renderWithAuth(<Navbar />, { userOverride: ADMIN })
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Map')).toBeInTheDocument()
  })

  test('authenticated user sees Sign out button and their name', () => {
    renderWithAuth(<Navbar />, { userOverride: CITIZEN })
    expect(screen.getByText('Sign out')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  test('sign out button calls logout', async () => {
    renderWithAuth(<Navbar />, { userOverride: CITIZEN })
    fireEvent.click(screen.getByText('Sign out'))
    expect(authApi.logout).toHaveBeenCalled()
  })
})

// ── 4. LoginPage ──────────────────────────────────────────────────────────────

describe('LoginPage', () => {
  beforeEach(() => vi.clearAllMocks())

  test('renders email and password fields', () => {
    renderWithAuth(<LoginPage />)
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  test('shows error on failed login', async () => {
    authApi.login.mockRejectedValue(new Error('Incorrect email or password.'))
    renderWithAuth(<LoginPage />)
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'x@x.com' } })
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'badpassword' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Incorrect email or password.')
    )
  })

  test('has link to register page', () => {
    renderWithAuth(<LoginPage />)
    expect(screen.getByText(/create an account/i)).toBeInTheDocument()
  })
})

// ── 5. RegisterPage ───────────────────────────────────────────────────────────

describe('RegisterPage', () => {
  beforeEach(() => vi.clearAllMocks())

  test('renders all registration fields', () => {
    renderWithAuth(<RegisterPage />)
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument()
  })

  test('shows error when passwords do not match', async () => {
    renderWithAuth(<RegisterPage />)
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Alice' } })
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'Str0ngPass!' } })
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'different' } })
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Passwords do not match.')
    )
  })

  test('shows error for short password', async () => {
    renderWithAuth(<RegisterPage />)
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Alice' } })
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'short' } })
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('at least 8 characters')
    )
  })

  test('has link to login page', () => {
    renderWithAuth(<RegisterPage />)
    expect(screen.getByText(/sign in/i)).toBeInTheDocument()
  })
})

// ── 6. AccessDenied ───────────────────────────────────────────────────────────

describe('AccessDenied', () => {
  test('shows current role and required roles', () => {
    renderWithAuth(<AccessDenied requiredRoles={['admin']} />, { userOverride: CITIZEN })
    expect(screen.getByText('Access Denied')).toBeInTheDocument()
    expect(screen.getByText(/citizen/i)).toBeInTheDocument()
    expect(screen.getByText(/admin/i)).toBeInTheDocument()
  })

  test('has return to home link', () => {
    renderWithAuth(<AccessDenied />, { userOverride: CITIZEN })
    expect(screen.getByText(/return to home/i)).toBeInTheDocument()
  })
})
