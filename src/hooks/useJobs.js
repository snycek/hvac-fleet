import { useState, useEffect, useCallback } from 'react';
import { mockJobs } from '../data/mockData.js';
import { FIREBASE_ENABLED, db } from '../lib/firebase.js';

export function useJobs() {
  const [jobs, setJobs] = useState([]);

  useEffect(() => {
    if (!FIREBASE_ENABLED) {
      let cancelled = false;
      let intervalId = null;

      const loadJobs = async () => {
        try {
          const res = await fetch('/api/jobs');
          if (!res.ok) {
            throw new Error(`Failed to load jobs: ${res.status}`);
          }
          const data = await res.json();
          if (!cancelled) {
            setJobs(Array.isArray(data) ? data : []);
          }
        } catch (_err) {
          if (!cancelled) {
            setJobs(mockJobs.map(j => ({ ...j })));
          }
        }
      };

      loadJobs();
      intervalId = setInterval(loadJobs, 4000);

      return () => {
        cancelled = true;
        if (intervalId) {
          clearInterval(intervalId);
        }
      };
    }

    let unsubscribe = null;

    // Firestore real-time listener
    import('firebase/firestore').then(({ collection, onSnapshot, orderBy, query }) => {
      const q = query(collection(db, 'jobs'), orderBy('createdAt', 'desc'));
      unsubscribe = onSnapshot(q, snap => {
        setJobs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  const updateJobStatus = useCallback(async (jobId, status) => {
    if (!FIREBASE_ENABLED) {
      const completionPayload = status === 'completed' ? { completedAt: new Date().toISOString() } : {};
      try {
        const res = await fetch(`/api/jobs/${jobId}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status, ...completionPayload }),
        });

        if (!res.ok) {
          throw new Error(`Failed status update: ${res.status}`);
        }

        const updated = await res.json();
        setJobs(prev => prev.map(j => j.id === jobId ? updated : j));
      } catch (_err) {
        setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status, ...completionPayload } : j));
      }
      return;
    }
    const { doc, updateDoc } = await import('firebase/firestore');
    await updateDoc(doc(db, 'jobs', jobId), { status });
  }, []);

  const assignJob = useCallback(async (jobId, techId) => {
    if (!FIREBASE_ENABLED) {
      try {
        const res = await fetch(`/api/jobs/${jobId}/assign`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ techId }),
        });

        if (!res.ok) {
          throw new Error(`Failed assignment: ${res.status}`);
        }

        const updated = await res.json();
        setJobs(prev => prev.map(j => j.id === jobId ? updated : j));
      } catch (_err) {
        setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'assigned', assignedTo: techId } : j));
      }
      return;
    }
    const { doc, updateDoc } = await import('firebase/firestore');
    await updateDoc(doc(db, 'jobs', jobId), { status: 'assigned', assignedTo: techId });
  }, []);

  const createJob = useCallback(async (jobData) => {
    const newJob = { ...jobData, id: `job-${Date.now()}`, status: 'pending', assignedTo: null, createdAt: new Date().toISOString() };
    if (!FIREBASE_ENABLED) {
      try {
        const res = await fetch('/api/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(jobData),
        });

        if (!res.ok) {
          throw new Error(`Failed create: ${res.status}`);
        }

        const created = await res.json();
        setJobs(prev => [created, ...prev]);
      } catch (_err) {
        setJobs(prev => [newJob, ...prev]);
      }
      return;
    }
    const { collection: col, addDoc } = await import('firebase/firestore');
    await addDoc(col(db, 'jobs'), jobData);
  }, []);

  return { jobs, updateJobStatus, assignJob, createJob };
}
