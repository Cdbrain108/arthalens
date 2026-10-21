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

export function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Listen to remote Firebase Auth state changes
  useEffect(() => {
    let active = true

    const unsubscribe = onAuthStateChange((firebaseUser) => {
      if (!active) return

      if (firebaseUser) {
        const u = {
          uid: firebaseUser.uid,
          name: extractDisplayName(firebaseUser),
          email: firebaseUser.email || '',
          photoURL: firebaseUser.photoURL || null,
          guest: false,
          isFirebase: true,
          ts: Date.now(),
        }
        setUser(u)
      } else {
        setUser(null)
      }
      setLoading(false)
    })

    return () => {
      active = false
      unsubscribe?.()
    }
  }, [])

  // Email / Password Login
  const login = useCallback(async (email, password) => {
    if (!isFirebaseConfigured) {
      const u = {
        uid: `guest_${Date.now()}`,
        name: email.split('@')[0],
        email: email.trim(),
        guest: false,
        ts: Date.now(),
      }
      try {
        localStorage.setItem(GUEST_KEY, JSON.stringify(u))
      } catch {}
      setUser(u)
      return { user: u, error: null }
    }

    const { user: firebaseUser, error } = await loginUser(email, password)
    if (firebaseUser) {
      const u = {
        uid: firebaseUser.uid,
        name: extractDisplayName(firebaseUser),
        email: firebaseUser.email || '',
        photoURL: firebaseUser.photoURL || null,
        guest: false,
        isFirebase: true,
        ts: Date.now(),
      }
      setUser(u)
      return { user: u, error: null }
    }
    return { user: null, error }
  }, [])

  // Email / Password / Name Registration
  const signup = useCallback(async (name, email, password) => {
    if (!isFirebaseConfigured) {
      const u = {
        uid: `guest_${Date.now()}`,
        name: name.trim() || '',
        email: email.trim(),
        guest: false,
        ts: Date.now(),
      }
      setUser(u)
      return { user: u, error: null }
    }

    const { user: firebaseUser, error } = await registerUser(name, email, password)
    if (firebaseUser) {
      const u = {
        uid: firebaseUser.uid,
        name: name.trim() || extractDisplayName(firebaseUser),
        email: firebaseUser.email || '',
        photoURL: firebaseUser.photoURL || null,
        guest: false,
        isFirebase: true,
        ts: Date.now(),
      }
      setUser(u)
      return { user: u, error: null }
    }
    return { user: null, error }
  }, [])

  // Google Sign-In
  const loginWithGoogle = useCallback(async () => {
    const { user: firebaseUser, error } = await signInWithGoogle()
    if (firebaseUser) {
      const u = {
        uid: firebaseUser.uid,
        name: extractDisplayName(firebaseUser),
        email: firebaseUser.email || '',
        photoURL: firebaseUser.photoURL || null,
        guest: false,
        isFirebase: true,
        ts: Date.now(),
      }
      setUser(u)
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
      email: email.trim(),
      guest: true,
      ts: Date.now(),
    }
    try {
      localStorage.setItem(GUEST_KEY, JSON.stringify(u))
    } catch {}
    setUser(u)
    return u
  }, [])

  // Logout
  const logout = useCallback(async () => {
    try {
      localStorage.removeItem(GUEST_KEY)
      await logoutUser()
    } catch {}
    setUser(null)
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
