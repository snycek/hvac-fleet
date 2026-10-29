import { useState, useEffect, useCallback } from 'react';
import { mockJobs } from '../data/mockData.js';
import { FIREBASE_ENABLED, db } from '../lib/firebase.js';

// live=false: no server calls (the public /demo page runs on demo data only).
export function useJobs({ live = true } = {}) {
  const [jobs, setJobs] = useState([]);

  useEffect(() => {
    if (!live) return undefined;
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
  }, [live]);

  // extra: e.g. { reason } when skipping a lawn.
  const updateJobStatus2 = useCallback(async (jobId, status, extra = {}) => {
    if (!FIREBASE_ENABLED) {
      const completionPayload = status === 'completed' ? { completedAt: new Date().toISOString() } : {};
      try {
        const res = await fetch(`/api/jobs/${jobId}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status, ...completionPayload, ...extra }),
        });

        if (!res.ok) {
          throw new Error(`Failed status update: ${res.status}`);
        }

        const { nextJob, ...updated } = await res.json();
        // A repeating cut comes back with its next visit already scheduled.
        setJobs(prev => [...(nextJob ? [nextJob] : []), ...prev.map(j => j.id === jobId ? updated : j)]);
        return { ...updated, nextJob };
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

  // Owner accepts a quote: { scheduledDate, repeatDays, price, techId, service }
  const scheduleJob = useCallback(async (jobId, plan) => {
    const optimistic = {
      status: 'assigned', assignedTo: plan.techId, scheduledDate: plan.scheduledDate,
      repeatDays: plan.repeatDays, earnings: plan.price, service: plan.service, acceptedAt: new Date().toISOString(),
    };
    if (!FIREBASE_ENABLED) {
      const res = await fetch(`/api/jobs/${jobId}/schedule`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(plan),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Couldn't schedule (HTTP ${res.status})`);
      setJobs(prev => prev.map(j => (j.id === jobId ? data : j)));
      return data;
    }
    const { doc, updateDoc } = await import('firebase/firestore');
    await updateDoc(doc(db, 'jobs', jobId), optimistic);
  }, []);

  const declineJob = useCallback(async (jobId) => {
    const patch = { status: 'declined', declinedAt: new Date().toISOString() };
    if (!FIREBASE_ENABLED) {
      try {
        const res = await fetch(`/api/jobs/${jobId}/decline`, { method: 'PUT' });
        if (!res.ok) throw new Error(`Failed decline: ${res.status}`);
        const updated = await res.json();
        setJobs(prev => prev.map(j => (j.id === jobId ? updated : j)));
      } catch {
        setJobs(prev => prev.map(j => (j.id === jobId ? { ...j, ...patch } : j)));
      }
      return;
    }
    const { doc, updateDoc } = await import('firebase/firestore');
    await updateDoc(doc(db, 'jobs', jobId), patch);
  }, []);

  // Owner marks a finished cut paid (paid=false undoes it).
  // Owner records a payment: method 'cash' | 'check' | 'card' (card runs a test charge,
  // which can be declined). paid=false undoes it.
  const markPaid = useCallback(async (jobId, paid = true, method = 'cash', last4) => {
    const res = await fetch(`/api/jobs/${jobId}/paid`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paid, method, last4 }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Couldn't record payment (HTTP ${res.status})`);
    const { payment, ...job } = data;
    setJobs(prev => prev.map(j => (j.id === jobId ? job : j)));
    return payment;
  }, []);

  // Payment reminder for an unpaid cut (logged on the job; texting not connected yet).
  const remindCustomer = useCallback(async (jobId, message) => {
    const res = await fetch(`/api/jobs/${jobId}/remind`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: 'text', message }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Couldn't send reminder (HTTP ${res.status})`);
    setJobs(prev => prev.map(j => (j.id === jobId ? data : j)));
  }, []);

  // "Remind all": one account reminder per customer; the server fills in each pay link
  // and records it on every cut it covers. Then reload so the history shows it.
  const remindCustomers = useCallback(async (items) => {
    const res = await fetch('/api/reminders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Couldn't send reminders (HTTP ${res.status})`);
    const fresh = await fetch('/api/jobs').then(r => r.json()).catch(() => null);
    if (Array.isArray(fresh)) setJobs(fresh);
    return data;
  }, []);

  // Monthly statements: items [{ jobIds, period, periodLabel, channel, message }].
  const sendStatements = useCallback(async (items) => {
    const res = await fetch('/api/statements/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Couldn't send statements (HTTP ${res.status})`);
    const fresh = await fetch('/api/jobs').then(r => r.json()).catch(() => null);
    if (Array.isArray(fresh)) setJobs(fresh);
    return data;
  }, []);

  // A customer's billing preferences (contactPref, billing), saved on all their visits.
  const updateCustomer = useCallback(async (key, patch) => {
    const res = await fetch('/api/customers', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, ...patch }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Couldn't save (HTTP ${res.status})`);
    const fresh = await fetch('/api/jobs').then(r => r.json()).catch(() => null);
    if (Array.isArray(fresh)) setJobs(fresh);
  }, []);

  // Landscaping: price a request and send it to the customer ({ items, startDate, techId, note, channel }).
  const sendLandscapeQuote = useCallback(async (jobId, plan) => {
    const res = await fetch(`/api/jobs/${jobId}/landscape-quote`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(plan) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Couldn't send it (HTTP ${res.status})`);
    const fresh = await fetch('/api/jobs').then(r => r.json()).catch(() => null);
    if (Array.isArray(fresh)) setJobs(fresh);
    return data;
  }, []);
  // The customer said yes on the phone.
  const acceptLandscapeQuote = useCallback(async jobId => {
    const res = await fetch(`/api/jobs/${jobId}/landscape-quote/accept`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Couldn't save (HTTP ${res.status})`);
    setJobs(prev => prev.map(j => (j.id === jobId ? data : j)));
    return data;
  }, []);

  // Questions for the crew: a site-check stop for a quote, or onto a customer's next visit;
  // the foreman's answers.
  const postJson = async (url, method, body) => {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Couldn't save (HTTP ${res.status})`);
    const fresh = await fetch('/api/jobs').then(r => r.json()).catch(() => null);
    if (Array.isArray(fresh)) setJobs(fresh);
    return data;
  };
  const askCrewSiteCheck = useCallback((quoteId, plan) => postJson(`/api/jobs/${quoteId}/site-check`, 'POST', plan), []);
  const askCrewNextVisit = useCallback((key, questions) => postJson('/api/customers/questions', 'POST', { key, questions }), []);
  const answerChecks = useCallback((jobId, answers) => postJson(`/api/jobs/${jobId}/checks`, 'PUT', { answers }), []);

  // Owner moves a lawn's next cut: { scheduledDate, techId, mode: 'once' | 'always' }.
  const rescheduleJob = useCallback(async (jobId, plan) => {
    const res = await fetch(`/api/jobs/${jobId}/reschedule`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(plan) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Couldn't move it (HTTP ${res.status})`);
    setJobs(prev => prev.map(j => (j.id === jobId ? data : j)));
    return data;
  }, []);

  // Checks on the way: the owner notes one (customer called), then marks it received or bounced.
  const reloadJobs = useCallback(async () => {
    const fresh = await fetch('/api/jobs').then(r => r.json()).catch(() => null);
    if (Array.isArray(fresh)) setJobs(fresh);
  }, []);
  const promiseCheck = useCallback(async (jobIds, how = 'mail', number = '') => {
    const res = await fetch('/api/checks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobIds, how, number }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Couldn't save (HTTP ${res.status})`);
    await reloadJobs();
  }, [reloadJobs]);
  const settleCheck = useCallback(async (checkId, received) => {
    const res = await fetch(`/api/checks/${encodeURIComponent(checkId)}/${received ? 'received' : 'bounced'}`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Couldn't save (HTTP ${res.status})`);
    await reloadJobs();
  }, [reloadJobs]);

  // Foreman: the customer paid at the door (kind 'check' | 'cash'); covers their unpaid balance.
  const crewCollect = useCallback(async (jobId, kind, number = '') => {
    const res = await fetch('/api/crew/collect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId, kind, number }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Couldn't save (HTTP ${res.status})`);
    await reloadJobs();
    return data;
  }, [reloadJobs]);

  return { jobs, updateJobStatus2, assignJob, createJob, scheduleJob, rescheduleJob, askCrewSiteCheck, askCrewNextVisit, answerChecks, sendLandscapeQuote, acceptLandscapeQuote, declineJob, markPaid, remindCustomer, remindCustomers, sendStatements, updateCustomer, promiseCheck, settleCheck, crewCollect };
}
