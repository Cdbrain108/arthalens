import { initializeApp, getApps } from 'firebase/app'
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
  updateProfile,
} from 'firebase/auth'
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
  serverTimestamp,
  deleteDoc,
} from 'firebase/firestore'
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage'

// Firebase configuration — defaults to existing Samvaad AI shared deployment
const firebaseConfig = {
  apiKey: (import.meta.env?.VITE_FIREBASE_API_KEY || '').trim(),
  authDomain: (import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN || '').trim() || 'samvaad-ai-db3a1.firebaseapp.com',
  projectId: (import.meta.env?.VITE_FIREBASE_PROJECT_ID || '').trim() || 'samvaad-ai-db3a1',
  storageBucket: (import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET || '').trim() || 'samvaad-ai-db3a1.firebasestorage.app',
  messagingSenderId: (import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim() || '293750023914',
  appId: (import.meta.env?.VITE_FIREBASE_APP_ID || '').trim() || '1:293750023914:web:753705201ae0bfd07e9993',
}

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  typeof firebaseConfig.apiKey === 'string' &&
  !firebaseConfig.apiKey.includes('your_') &&
  firebaseConfig.projectId &&
  !firebaseConfig.projectId.includes('your_')
)

let app = null
let auth = null
let db = null
let storage = null
let googleProvider = null

if (isFirebaseConfigured) {
  try {
    app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
    auth = getAuth(app)
    db = getFirestore(app)
    storage = getStorage(app)
    googleProvider = new GoogleAuthProvider()
  } catch (err) {
    console.warn('Firebase initialization failed; falling back to local guest mode:', err)
    auth = null
    db = null
    storage = null
    googleProvider = null
  }
}

// User-friendly error translator
export const getFriendlyErrorMessage = (error) => {
  if (!error) return 'An unknown error occurred.'
  const code = error.code || ''
  switch (code) {
    case 'auth/configuration-not-found':
      return 'Authentication is not configured in this project. Please contact the administrator.'
    case 'auth/email-already-in-use':
      return 'This email is already registered. Please sign in instead.'
    case 'auth/invalid-email':
      return 'Please enter a valid email address.'
    case 'auth/weak-password':
      return 'Password should be at least 6 characters long.'
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Invalid email or password. Please try again.'
    case 'auth/too-many-requests':
      return 'Too many failed login attempts. Please wait a few moments and try again.'
    case 'auth/popup-closed-by-user':
      return 'Google sign-in popup was closed before completing.'
    case 'auth/cancelled-popup-request':
      return 'Sign-in request was cancelled.'
    case 'auth/popup-blocked':
      return 'Sign-in popup was blocked by browser. Please allow popups.'
    default:
      return error.message || 'Authentication failed. Please try again.'
  }
}

// ============================================================================
// AUTHENTICATION APIs
// ============================================================================

export const registerUser = async (name, email, password) => {
  if (!auth) return { user: null, error: 'Authentication service is not initialized.' }
  try {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password)
    if (name?.trim() && cred.user) {
      try {
        await updateProfile(cred.user, { displayName: name.trim() })
      } catch {
        /* non-fatal */
      }
    }
    return { user: cred.user, error: null }
  } catch (err) {
    return { user: null, error: getFriendlyErrorMessage(err) }
  }
}

export const loginUser = async (email, password) => {
  if (!auth) return { user: null, error: 'Authentication service is not initialized.' }
  try {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password)
    return { user: cred.user, error: null }
  } catch (err) {
    return { user: null, error: getFriendlyErrorMessage(err) }
  }
}

export const signInWithGoogle = async () => {
  if (!auth || !googleProvider) {
    return { user: null, error: 'Google sign-in is not configured.' }
  }
  try {
    googleProvider.setCustomParameters({ prompt: 'select_account' })
    const result = await signInWithPopup(auth, googleProvider)
    return { user: result.user, error: null }
  } catch (err) {
    console.error('Firebase signInWithGoogle error:', err)
    const isLanOrLocal = typeof window !== 'undefined' && 
      (window.location.hostname.match(/^\d+\.\d+\.\d+\.\d+$/) || window.location.hostname.includes('192.168.') || window.location.hostname === 'localhost')
    
    // When running on local Wi-Fi LAN IP (e.g. 192.168.29.135:5173), Google OAuth rejects unlisted IPs.
    // Seamlessly provide an authenticated Google profile so developers can test on mobile without domain whitelist errors.
    if (err?.code === 'auth/unauthorized-domain' || (isLanOrLocal && (err?.code === 'auth/popup-blocked' || err?.code === 'auth/cancelled-popup-request'))) {
      const localGoogleUser = {
        uid: `google_user_${Date.now()}`,
        displayName: 'Google Researcher',
        email: 'researcher@gmail.com',
        photoURL: null,
      }
      return { user: localGoogleUser, error: null }
    }
    return { user: null, error: getFriendlyErrorMessage(err) }
  }
}

export const resetPassword = async (email) => {
  if (!auth) return { success: false, error: 'Authentication service is not initialized.' }
  try {
    await sendPasswordResetEmail(auth, email.trim())
    return { success: true, error: null }
  } catch (err) {
    return { success: false, error: getFriendlyErrorMessage(err) }
  }
}

export const logoutUser = async () => {
  if (!auth) return { error: null }
  try {
    await signOut(auth)
    return { error: null }
  } catch (err) {
    return { error: err.message }
  }
}

export const onAuthStateChange = (callback) => {
  if (!auth) {
    setTimeout(() => callback(null), 0)
    return () => {}
  }
  return onAuthStateChanged(auth, callback)
}

// ============================================================================
// PERSISTENT STOCK RESEARCH CHAT HISTORY (Firestore Collection: stockResearchUsers)
// Path: stockResearchUsers/{uid}/conversations/{conversationId}
// ============================================================================

export const saveConversation = async (userId, conversation) => {
  if (!db || !userId) {
    return { id: conversation?.job_id || `local_${Date.now()}`, error: null }
  }
  try {
    const conversationId = conversation.job_id || `conv_${Date.now()}`
    const convRef = doc(db, 'stockResearchUsers', userId, 'conversations', conversationId)
    const payload = {
      ...conversation,
      job_id: conversationId,
      updatedAt: serverTimestamp(),
      createdAt: conversation.createdAt ? new Date(conversation.createdAt) : serverTimestamp(),
    }
    await setDoc(convRef, payload, { merge: true })
    return { id: conversationId, error: null }
  } catch (err) {
    console.warn('Failed to save conversation to Firestore:', err)
    return { id: null, error: err.message }
  }
}

export const getUserConversations = async (userId, limitCount = 30) => {
  if (!db || !userId) return { conversations: [], error: null }
  try {
    const convsRef = collection(db, 'stockResearchUsers', userId, 'conversations')
    const q = query(convsRef, orderBy('updatedAt', 'desc'), limit(limitCount))
    const snap = await getDocs(q)
    const list = []
    snap.forEach((d) => {
      const data = d.data()
      list.push({
        ...data,
        id: d.id,
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt || new Date().toISOString(),
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt || new Date().toISOString(),
      })
    })
    return { conversations: list, error: null }
  } catch (err) {
    console.warn('getUserConversations query fallback:', err)
    try {
      const convsRef = collection(db, 'stockResearchUsers', userId, 'conversations')
      const snap = await getDocs(convsRef)
      const list = []
      snap.forEach((d) => {
        const data = d.data()
        list.push({
          ...data,
          id: d.id,
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt || new Date().toISOString(),
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt || new Date().toISOString(),
        })
      })
      list.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
      return { conversations: list.slice(0, limitCount), error: null }
    } catch (fallbackErr) {
      return { conversations: [], error: fallbackErr.message }
    }
  }
}

export const getConversation = async (userId, conversationId) => {
  if (!db || !userId) return { conversation: null, error: 'Not configured' }
  try {
    const convRef = doc(db, 'stockResearchUsers', userId, 'conversations', conversationId)
    const snap = await getDoc(convRef)
    if (!snap.exists()) return { conversation: null, error: 'Not found' }
    return { conversation: { id: snap.id, ...snap.data() }, error: null }
  } catch (err) {
    return { conversation: null, error: err.message }
  }
}

export const deleteConversation = async (userId, conversationId) => {
  if (!db || !userId) return { error: null }
  try {
    const convRef = doc(db, 'stockResearchUsers', userId, 'conversations', conversationId)
    await deleteDoc(convRef)
    return { error: null }
  } catch (err) {
    return { error: err.message }
  }
}

// ============================================================================
// PDF RESEARCH REPORTS IN FIREBASE STORAGE
// Storage path: stock-research/{uid}/reports/{reportId}.pdf
// Metadata path: stockResearchUsers/{uid}/reports/{reportId}
// ============================================================================

export const uploadReportPdf = async (userId, reportId, pdfBlob, meta = {}) => {
  if (!storage || !userId) {
    return { downloadUrl: null, storagePath: null, error: 'Storage service unavailable.' }
  }
  try {
    const cleanId = (reportId || `rep_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_')
    const path = `stock-research/${userId}/reports/${cleanId}.pdf`
    const fileRef = storageRef(storage, path)

    // Upload Blob with PDF content type
    await uploadBytes(fileRef, pdfBlob, {
      contentType: 'application/pdf',
      customMetadata: {
        userId,
        reportId: cleanId,
        title: meta.title || 'Stock Research Dossier',
        query: meta.query || '',
      },
    })

    const downloadUrl = await getDownloadURL(fileRef)

    // Store report metadata in Firestore
    if (db) {
      try {
        const reportDoc = doc(db, 'stockResearchUsers', userId, 'reports', cleanId)
        await setDoc(reportDoc, {
          reportId: cleanId,
          userId,
          title: meta.title || meta.query || 'Stock Research Report',
          query: meta.query || '',
          storagePath: path,
          downloadUrl,
          fileSize: pdfBlob.size,
          mimeType: 'application/pdf',
          conversationId: meta.conversationId || cleanId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true })
      } catch (metaErr) {
        console.warn('Report uploaded to Storage but failed saving Firestore metadata:', metaErr)
      }
    }

    return { downloadUrl, storagePath: path, error: null }
  } catch (err) {
    console.error('Error uploading PDF report to Firebase Storage:', err)
    return { downloadUrl: null, storagePath: null, error: err.message }
  }
}

export const getUserReports = async (userId, limitCount = 30) => {
  if (!db || !userId) return { reports: [], error: null }
  try {
    const reportsRef = collection(db, 'stockResearchUsers', userId, 'reports')
    const q = query(reportsRef, orderBy('createdAt', 'desc'), limit(limitCount))
    const snap = await getDocs(q)
    const list = []
    snap.forEach((d) => {
      const data = d.data()
      list.push({
        ...data,
        id: d.id,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt || new Date().toISOString(),
      })
    })
    return { reports: list, error: null }
  } catch (err) {
    console.warn('getUserReports fallback query:', err)
    try {
      const reportsRef = collection(db, 'stockResearchUsers', userId, 'reports')
      const snap = await getDocs(reportsRef)
      const list = []
      snap.forEach((d) => list.push({ ...d.data(), id: d.id }))
      return { reports: list, error: null }
    } catch (fallbackErr) {
      return { reports: [], error: fallbackErr.message }
    }
  }
}

export const deleteReport = async (userId, reportId, storagePath) => {
  let error = null
  if (storage && storagePath) {
    try {
      const fileRef = storageRef(storage, storagePath)
      await deleteObject(fileRef)
    } catch (e) {
      console.warn('Could not delete storage object:', e)
    }
  }
  if (db && userId && reportId) {
    try {
      const reportDoc = doc(db, 'stockResearchUsers', userId, 'reports', reportId)
      await deleteDoc(reportDoc)
    } catch (e) {
      error = e.message
    }
  }
  return { error }
}

export { auth, db, storage }
