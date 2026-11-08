import axios from 'axios'

const client = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
})

// ── 401 logout callback ───────────────────────────────────────────────────────
// AuthProvider registers itself here so the axios interceptor can trigger
// logout without a direct import dependency on the React context.
let _onUnauthorized = null
export function setUnauthorizedHandler(fn) { _onUnauthorized = fn }

// ── Request interceptor — attach JWT bearer token if available ────────────────
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers = config.headers ?? {}
    config.headers['Authorization'] = `Bearer ${token}`
  }
  return config
})

// ── Response interceptor — normalise errors, handle 401/403 ──────────────────
client.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status
    if (status === 401) {
      // Token missing, expired or invalid — clear session and redirect to login
      if (_onUnauthorized) _onUnauthorized()
    }
    const message =
      error.response?.data?.detail ?? error.message ?? 'Unknown error'
    return Promise.reject(new Error(message))
  },
)

export default client
