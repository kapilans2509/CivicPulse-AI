/**
 * Auth API helpers.
 *
 * login()    — POST /auth/token (OAuth2 password flow)
 * register() — POST /auth/register
 * logout()   — clears the stored token
 * getToken() — returns the current token or null
 * getUser()  — returns the stored user object or null
 */
import client from './client'

const TOKEN_KEY = 'access_token'
const USER_KEY  = 'auth_user'

export const authApi = {
  async login(email, password) {
    const params = new URLSearchParams()
    params.append('username', email)
    params.append('password', password)
    const res = await client.post('/auth/token', params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    const { access_token, user } = res.data
    localStorage.setItem(TOKEN_KEY, access_token)
    localStorage.setItem(USER_KEY,  JSON.stringify(user))
    return user
  },

  async register(name, email, password) {
    const res = await client.post('/auth/register', { name, email, password })
    return res.data
  },

  logout() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  },

  getToken() {
    return localStorage.getItem(TOKEN_KEY)
  },

  getUser() {
    try {
      const raw = localStorage.getItem(USER_KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  },

  isAuthenticated() {
    return Boolean(localStorage.getItem(TOKEN_KEY))
  },
}
