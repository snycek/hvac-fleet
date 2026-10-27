import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { AUTH_ENABLED, FIREBASE_ENABLED, auth, db, idToEmail } from '../lib/firebase.js';
import { mockJobs } from '../data/mockData.js';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  // Restore session from localStorage
  const savedSession = (() => {
    try {
      const s = localStorage.getItem('ducttales_session');
      return s ? JSON.parse(s) : null;
    } catch { return null; }
  })();

  // With real sign-in, who you are comes from Firebase — never from saved browser data.
  const [user, setUser]   = useState(AUTH_ENABLED ? null : savedSession?.user || null);
  const [role, setRole]   = useState(AUTH_ENABLED ? null : savedSession?.role || null);
  const [authReady, setAuthReady] = useState(!AUTH_ENABLED);

  // Signed in with Firebase → ask our server who that is (it checks the token).
  useEffect(() => {
    if (!AUTH_ENABLED) return undefined;
    return onAuthStateChanged(auth, async fbUser => {
      if (!fbUser) { setUser(null); setRole(null); setAuthReady(true); return; }
      try {
        const res = await fetch('/api/me');
        const me = await res.json();
        if (!res.ok) throw new Error(me.error || 'Not allowed');
        setUser({ uid: fbUser.uid, displayName: me.id, email: me.email });
        setRole(me.role);
      } catch {
        await signOut(auth);
        setUser(null); setRole(null);
      } finally {
        setAuthReady(true);
      }
    });
  }, []);

  // Real sign-in: an ID like "owner" (or an email) and a password.
  const signIn = async (id, password) => {
    await signInWithEmailAndPassword(auth, idToEmail(id), password);
  };
  const [activeTechId, setActiveTechId] = useState(savedSession?.activeTechId || null);
  const [jobs, setJobs] = useState(mockJobs.map(j => ({ ...j })));

  const demoMode = !FIREBASE_ENABLED;

  const saveSession = (userData, roleData, techId) => {
    try {
      localStorage.setItem('ducttales_session', JSON.stringify({
        user: userData, role: roleData, activeTechId: techId
      }));
    } catch {}
  };

  const loginDemo = (selectedRole, techId = null, techDisplayName = null, ownerName = null) => {
    setRole(selectedRole);
    const userData = {
      uid: `demo-${selectedRole}`,
      displayName: selectedRole === 'technician'
        ? (techDisplayName || 'Marcus Williams')
        : selectedRole === 'manager'
          ? 'Alex Manager'
          : (ownerName || 'Owner'),
    };
    setUser(userData);
    const finalTechId = selectedRole === 'technician' ? (techId || 'tech-001') : null;
    if (selectedRole === 'technician') setActiveTechId(finalTechId);
    saveSession(userData, selectedRole, finalTechId);
  };


  const logout = () => {
    if (AUTH_ENABLED) signOut(auth).catch(() => {});
    setUser(null);
    setRole(null);
    setActiveTechId(null);
    localStorage.removeItem('ducttales_session');
  };

  const createJob = useCallback(async (jobData) => {
    const newJob = { ...jobData, id: `job-${Date.now()}`, status: 'pending', assignedTo: null, createdAt: new Date().toISOString() };
    if (!FIREBASE_ENABLED) {
      setJobs(prev => [newJob, ...prev]);
      return;
    }
    const { collection: col, addDoc } = await import('firebase/firestore');
    await addDoc(col(db, 'jobs'), jobData);
  }, []);

  const updateJobStatus2 = useCallback(async (jobId, status) => {
    if (!FIREBASE_ENABLED) {
      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status } : j));
      return;
    }
    const { doc, updateDoc } = await import('firebase/firestore');
    await updateDoc(doc(db, 'jobs', jobId), { status });
  }, []);

  const assignJob = useCallback(async (jobId, techId) => {
    if (!FIREBASE_ENABLED) {
      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'assigned', assignedTo: techId } : j));
      return;
    }
    const { doc, updateDoc } = await import('firebase/firestore');
    await updateDoc(doc(db, 'jobs', jobId), { status: 'assigned', assignedTo: techId });
  }, []);

  return (
    <AppContext.Provider value={{ user, setUser, role, setRole, demoMode, activeTechId, setActiveTechId, loginDemo, signIn, authReady, logout, jobs, setJobs, createJob, updateJobStatus2, assignJob }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
