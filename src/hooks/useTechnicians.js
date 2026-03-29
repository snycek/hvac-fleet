import { useState, useEffect, useCallback } from 'react';
import { mockTechnicians } from '../data/mockData.js';
import { FIREBASE_ENABLED, db } from '../lib/firebase.js';

export function useTechnicians() {
  const [technicians, setTechnicians] = useState([]);

  useEffect(() => {
    if (!FIREBASE_ENABLED) {
      let cancelled = false;
      let intervalId = null;

      const loadTechnicians = async () => {
        try {
          const res = await fetch('/api/technicians');
          if (!res.ok) {
            throw new Error(`Failed to load technicians: ${res.status}`);
          }
          const data = await res.json();
          if (!cancelled) {
            setTechnicians(Array.isArray(data) ? data : []);
          }
        } catch (_err) {
          if (!cancelled) {
            setTechnicians(mockTechnicians.map(t => ({ ...t })));
          }
        }
      };

      loadTechnicians();
      intervalId = setInterval(loadTechnicians, 4000);

      return () => {
        cancelled = true;
        if (intervalId) {
          clearInterval(intervalId);
        }
      };
    }

    let unsubscribe = null;

    import('firebase/firestore').then(({ collection, onSnapshot }) => {
      unsubscribe = onSnapshot(collection(db, 'technicians'), snap => {
        setTechnicians(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  const updateTechStatus = useCallback(async (techId, status) => {
    if (!FIREBASE_ENABLED) {
      try {
        const res = await fetch(`/api/technicians/${techId}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        });

        if (!res.ok) {
          throw new Error(`Failed status update: ${res.status}`);
        }

        const updated = await res.json();
        setTechnicians(prev => prev.map(t => t.id === techId ? updated : t));
      } catch (_err) {
        setTechnicians(prev => prev.map(t => t.id === techId ? { ...t, status } : t));
      }
      return;
    }
    const { doc, updateDoc } = await import('firebase/firestore');
    await updateDoc(doc(db, 'technicians', techId), { status });
  }, []);

  const updateTechLocation = useCallback(async (techId, location) => {
    if (!FIREBASE_ENABLED) {
      try {
        const res = await fetch(`/api/technicians/${techId}/location`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ location }),
        });

        if (!res.ok) {
          throw new Error(`Failed location update: ${res.status}`);
        }

        const updated = await res.json();
        setTechnicians(prev => prev.map(t => t.id === techId ? updated : t));
      } catch (_err) {
        setTechnicians(prev => prev.map(t => t.id === techId ? { ...t, location } : t));
      }
      return;
    }
    const { doc, updateDoc } = await import('firebase/firestore');
    await updateDoc(doc(db, 'technicians', techId), { location });
  }, []);

  const applyTechnician = useCallback(async (applicationData) => {
    if (!FIREBASE_ENABLED) {
      const fallback = {
        id: `tech-${Date.now()}`,
        ...applicationData,
        isSeasoned: (Number(applicationData.yearsExperience) || 0) >= 2,
        status: 'pending_approval',
        location: { lat: 42.2114, lng: -83.1935 },
        currentJobId: null,
        totalEarnings: 0,
        jobsCompleted: 0,
        approvedAt: null,
      };

      try {
        const res = await fetch('/api/technicians/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(applicationData),
        });

        if (!res.ok) {
          throw new Error(`Failed registration: ${res.status}`);
        }

        const created = await res.json();
        setTechnicians(prev => [...prev, created]);
        return created;
      } catch (_err) {
        setTechnicians(prev => [...prev, fallback]);
        return fallback;
      }
    }

    const { collection: col, addDoc } = await import('firebase/firestore');
    const payload = {
      ...applicationData,
      isSeasoned: (Number(applicationData.yearsExperience) || 0) >= 2,
      status: 'pending_approval',
      location: { lat: 42.2114, lng: -83.1935 },
      currentJobId: null,
      totalEarnings: 0,
      jobsCompleted: 0,
      approvedAt: null,
      createdAt: new Date().toISOString(),
    };
    await addDoc(col(db, 'technicians'), payload);
    return payload;
  }, []);

  const approveTechnician = useCallback(async (techId) => {
    if (!FIREBASE_ENABLED) {
      try {
        const res = await fetch(`/api/technicians/${techId}/approve`, { method: 'PUT' });
        if (!res.ok) {
          throw new Error(`Failed approval: ${res.status}`);
        }
        const updated = await res.json();
        setTechnicians(prev => prev.map(t => t.id === techId ? updated : t));
        return updated;
      } catch (_err) {
        const fallback = { status: 'available', approvedAt: new Date().toISOString() };
        setTechnicians(prev => prev.map(t => t.id === techId ? { ...t, ...fallback } : t));
        return fallback;
      }
    }

    const { doc, updateDoc } = await import('firebase/firestore');
    const updated = { status: 'available', approvedAt: new Date().toISOString() };
    await updateDoc(doc(db, 'technicians', techId), updated);
    return updated;
  }, []);

  return { technicians, updateTechStatus, updateTechLocation, applyTechnician, approveTechnician };
}
