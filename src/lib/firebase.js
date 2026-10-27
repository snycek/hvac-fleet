import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

// Firebase is used for SIGN-IN only. All data goes through the app's server, which checks
// the signed-in user (the database rules block the browser from reading it directly).
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

export let auth = null;
export let AUTH_ENABLED = false;

// Old HVAC code paths read Firestore straight from the browser; keep them off — data
// comes from the server API.
export const FIREBASE_ENABLED = false;
export const db = null;

try {
  if (import.meta.env.VITE_FIREBASE_API_KEY) {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    AUTH_ENABLED = true;
  }
} catch (e) {
  console.warn('Firebase sign-in could not start:', e.message);
}

// Staff sign in with a short ID ("owner"); Firebase stores it as an email on this domain.
export const ID_DOMAIN = 'johnslawn.app';
export const idToEmail = id => (String(id).includes('@') ? String(id).trim() : `${String(id).trim().toLowerCase()}@${ID_DOMAIN}`);
