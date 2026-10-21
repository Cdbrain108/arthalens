import { useCallback, useEffect, useState } from 'react'
import {
  auth,
  loginUser,
  registerUser,
  signInWithGoogle,
  logoutUser,
  onAuthStateChange,
  resetPassword,
  isFirebaseConfigured,
} from '../services/firebase'

const GUEST_KEY = 'stock_research_user_guest'

function extractDisplayName(firebaseUser) {
  if (!firebaseUser) return ''
  if (firebaseUser.displayName && firebaseUser.displayName.trim()) {
    return firebaseUser.displayName.trim()
  }
  if (Array.isArray(firebaseUser.providerData)) {
    for (const p of firebaseUser.providerData) {
      if (p?.displayName && p.displayName.trim()) {
        return p.displayName.trim()
      }
    }
  }
  return ''
}

// Module-level global state and subscriber pool to keep all hook instances in sync across the entire app
let globalUser = (() => {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(GUEST_KEY) : null
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
})()

const listeners = new Set()

export function broadcastUser(nextUser) {
  globalUser = nextUser
  try {
    if (typeof localStorage !== 'undefined') {
      if (nextUser) {
        localStorage.setItem(GUEST_KEY, JSON.stringify(nextUser))
      } else {
        localStorage.removeItem(GUEST_KEY)
      }
    }
  } catch {}
  listeners.forEach((listener) => {
    try {
      listener(nextUser)
    } catch {}
  })
}

// Setup remote auth state change listener once at module level
let authListenerInitialized = false
function initAuthListenerOnce() {
  if (authListenerInitialized) return
  authListenerInitialized = true

  onAuthStateChange((firebaseUser) => {
    if (firebaseUser) {
      const dispName =
        extractDisplayName(firebaseUser) ||
        firebaseUser.displayName ||
        firebaseUser.email?.split('@')[0] ||
        'Researcher'
      const u = {
        uid: firebaseUser.uid,
        name: dispName,
        displayName: dispName,
        email: firebaseUser.email || '',
        photoURL: firebaseUser.photoURL || null,
        guest: false,
        isFirebase: true,
        isFirebaseRemote: true,
        ts: Date.now(),
      }
      broadcastUser(u)
    } else {
      // Only clear user if the active session was a remote Firebase session that logged out
      if (globalUser?.isFirebaseRemote) {
        broadcastUser(null)
      }
    }
  })
}

if (typeof window !== 'undefined') {
  initAuthListenerOnce()
  window.addEventListener('storage', (e) => {
    if (e.key === GUEST_KEY) {
      try {
        const parsed = e.newValue ? JSON.parse(e.newValue) : null
        globalUser = parsed
        listeners.forEach((fn) => fn(parsed))
      } catch {
        globalUser = null
        listeners.forEach((fn) => fn(null))
      }
    }
  })
}

export function useAuth() {
  const [user, setUser] = useState(globalUser)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setUser(globalUser)
    const listener = (next) => setUser(next)
    listeners.add(listener)
    return () => listeners.delete(listener)
  }, [])

  // Email / Password Login
  const login = useCallback(async (email, password) => {
    if (!isFirebaseConfigured) {
      const name = (typeof localStorage !== 'undefined' && localStorage.getItem('saved_researcher_name')) || email.split('@')[0]
      const u = {
        uid: `user_${Date.now()}`,
        name,
        displayName: name,
        email: email.trim(),
        guest: false,
        ts: Date.now(),
      }
      broadcastUser(u)
      return { user: u, error: null }
    }

    const { user: firebaseUser, error } = await loginUser(email, password)
    if (firebaseUser) {
      const name = extractDisplayName(firebaseUser) || firebaseUser.displayName || email.split('@')[0]
      const u = {
        uid: firebaseUser.uid,
        name,
        displayName: name,
        email: firebaseUser.email || '',
        photoURL: firebaseUser.photoURL || null,
        guest: false,
        isFirebase: true,
        isFirebaseRemote: true,
        ts: Date.now(),
      }
      broadcastUser(u)
      return { user: u, error: null }
    }
    return { user: null, error }
  }, [])

  // Email / Password / Name Registration
  const signup = useCallback(async (name, email, password) => {
    if (!isFirebaseConfigured) {
      const uName = name.trim() || email.split('@')[0]
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('saved_researcher_name', uName)
          localStorage.setItem('saved_researcher_email', email.trim())
        }
      } catch {}
      const u = {
        uid: `user_${Date.now()}`,
        name: uName,
        displayName: uName,
        email: email.trim(),
        guest: false,
        ts: Date.now(),
      }
      broadcastUser(u)
      return { user: u, error: null }
    }

    const { user: firebaseUser, error } = await registerUser(name, email, password)
    if (firebaseUser) {
      const uName = name.trim() || extractDisplayName(firebaseUser) || firebaseUser.displayName || email.split('@')[0]
      const u = {
        uid: firebaseUser.uid,
        name: uName,
        displayName: uName,
        email: firebaseUser.email || '',
        photoURL: firebaseUser.photoURL || null,
        guest: false,
        isFirebase: true,
        isFirebaseRemote: true,
        ts: Date.now(),
      }
      broadcastUser(u)
      return { user: u, error: null }
    }
    return { user: null, error }
  }, [])

  // Google Sign-In
  const loginWithGoogle = useCallback(async () => {
    const { user: firebaseUser, error } = await signInWithGoogle()
    if (firebaseUser) {
      const savedName = (typeof localStorage !== 'undefined' && localStorage.getItem('saved_researcher_name')) || ''
      const name = extractDisplayName(firebaseUser) || firebaseUser.displayName || firebaseUser.name || savedName || 'Anuj Kesharwani'
      const email = firebaseUser.email || (typeof localStorage !== 'undefined' && localStorage.getItem('saved_researcher_email')) || 'anuj@arthalens.ai'
      const u = {
        uid: firebaseUser.uid || `user_${Date.now()}`,
        name,
        displayName: name,
        email,
        photoURL: firebaseUser.photoURL || null,
        guest: false,
        isFirebase: Boolean(firebaseUser.getIdToken),
        isFirebaseRemote: Boolean(firebaseUser.getIdToken),
        ts: Date.now(),
      }
      broadcastUser(u)
      return { user: u, error: null }
    }
    return { user: null, error }
  }, [])

  // Password Recovery
  const sendPasswordReset = useCallback(async (email) => {
    return await resetPassword(email)
  }, [])

  // Guest exploration
  const loginAsGuest = useCallback((name = 'Guest Researcher', email = 'guest@local') => {
    const u = {
      uid: `guest_${Date.now()}`,
      name: name.trim(),
      displayName: name.trim(),
      email: email.trim(),
      guest: true,
      ts: Date.now(),
    }
    broadcastUser(u)
    return u
  }, [])

  // Logout
  const logout = useCallback(async () => {
    broadcastUser(null)
    try {
      await logoutUser()
    } catch {}
  }, [])

  return {
    user,
    loading,
    login,
    signup,
    loginWithGoogle,
    sendPasswordReset,
    loginAsGuest,
    logout,
    isFirebaseConfigured,
  }
}
