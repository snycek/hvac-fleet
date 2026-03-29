import { createContext, useContext, useState, useCallback } from 'react';
import { FIREBASE_ENABLED, db } from '../lib/firebase.js';
import { mockJobs } from '../data/mockData.js';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [user, setUser]   = useState(null);
  const [role, setRole]   = useState(null); // 'technician' | 'manager' | 'owner'
  const [activeTechId, setActiveTechId] = useState(null);
  const [jobs, setJobs] = useState(mockJobs.map(j => ({ ...j })));

  const demoMode = !FIREBASE_ENABLED;

  const loginDemo = (selectedRole, techId = null, techDisplayName = null) => {
    setRole(selectedRole);
    setUser({
      uid: `demo-${selectedRole}`,
      displayName: selectedRole === 'technician'
        ? (techDisplayName || 'Marcus Williams')
        : selectedRole === 'manager'
          ? 'Alex Manager'
          : 'Owner',
    });
    if (selectedRole === 'technician') setActiveTechId(techId || 'tech-001');
  };

  const logout = () => {
    setUser(null);
    setRole(null);
    setActiveTechId(null);
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

  const updateJobStatus = useCallback(async (jobId, status) => {
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
    <AppContext.Provider value={{ user, setUser, role, setRole, demoMode, activeTechId, setActiveTechId, loginDemo, logout, jobs, setJobs, createJob, updateJobStatus, assignJob }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
