// Demo auth — persisted to this browser only (localStorage).
// Swap `login` for a real JWT call later; the App contract stays the same.
import { useCallback, useState } from 'react'

const KEY = 'bullseye_user'

const DEFAULT_USER = { name: 'Researcher', email: 'researcher@bullseye.ai', guest: true }

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : DEFAULT_USER
  } catch {
    return DEFAULT_USER
  }
}

export function useAuth() {
  const [user, setUser] = useState(load)

  const login = useCallback((u) => {
    const v = { name: u.name.trim(), email: u.email.trim(), guest: !!u.guest, ts: Date.now() }
    try {
      localStorage.setItem(KEY, JSON.stringify(v))
    } catch {
      /* private mode — session-only */
    }
    setUser(v)
  }, [])

  const logout = useCallback(() => {
    try {
      localStorage.removeItem(KEY)
    } catch {
      /* noop */
    }
    setUser(null)
  }, [])

  return { user, login, logout }
}
