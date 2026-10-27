import { createContext, useContext, useState, useCallback } from 'react';
import { FIREBASE_ENABLED, db } from '../lib/firebase.js';
import { mockJobs } from '../data/mockData.js';

const AppContext = createContext(null);
const DEMO_USERNAME = 'youre';
const DEMO_PASSWORD = 'doingawesome';

export function AppProvider({ children }) {
  // Restore session from localStorage
  const savedSession = (() => {
    try {
      const s = localStorage.getItem('ducttales_session');
      return s ? JSON.parse(s) : null;
    } catch { return null; }
  })();

  const [user, setUser]   = useState(savedSession?.user || null);
  const [role, setRole]   = useState(savedSession?.role || null);
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

  const loginDemo = (selectedRole, techId = null, techDisplayName = null) => {
    setRole(selectedRole);
    const userData = {
      uid: `demo-${selectedRole}`,
      displayName: selectedRole === 'technician'
        ? (techDisplayName || 'Marcus Williams')
        : selectedRole === 'manager'
          ? 'Alex Manager'
          : 'Owner',
    };
    setUser(userData);
    const finalTechId = selectedRole === 'technician' ? (techId || 'tech-001') : null;
    if (selectedRole === 'technician') setActiveTechId(finalTechId);
    saveSession(userData, selectedRole, finalTechId);
  };

  const verifyDemoCredentials = (username, password) => {
    return username === DEMO_USERNAME && password === DEMO_PASSWORD;
  };

  const logout = () => {
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
    <AppContext.Provider value={{ user, setUser, role, setRole, demoMode, activeTechId, setActiveTechId, loginDemo, verifyDemoCredentials, logout, jobs, setJobs, createJob, updateJobStatus2, assignJob }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
