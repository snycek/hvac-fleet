import { useEffect, useState } from 'react';

// Rain delays logged when a foreman puts their route on hold.
// [{ id, techId, date, start, end, minutes }] — open delays have end: null.
export function useDelays({ poll = true } = {}) {
  const [delays, setDelays] = useState([]);
  useEffect(() => {
    if (!poll) return undefined;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/delays');
        if (res.ok && !cancelled) setDelays(await res.json());
      } catch { /* offline: keep what we have */ }
    };
    const first = setTimeout(load, 0);
    const id = setInterval(load, 5000);
    return () => { cancelled = true; clearTimeout(first); clearInterval(id); };
  }, [poll]);
  return delays;
}

