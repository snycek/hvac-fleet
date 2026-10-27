import { useCallback, useEffect, useState } from 'react';

// Truck days as foremen log them: rolled out → back at the yard.
// [{ techId, date, start, end }] (ISO times; null until tapped).
export function useShifts({ poll = true } = {}) {
  const [shifts, setShifts] = useState([]);

  useEffect(() => {
    if (!poll) return undefined;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/shifts');
        if (res.ok && !cancelled) setShifts(await res.json());
      } catch { /* offline */ }
    };
    const first = setTimeout(load, 0);
    const id = setInterval(load, 10000);
    return () => { cancelled = true; clearTimeout(first); clearInterval(id); };
  }, [poll]);

  // patch: { start?: ISO|null, end?: ISO|null }
  const saveShift = useCallback(async (techId, date, patch) => {
    const res = await fetch('/api/shifts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ techId, date, ...patch }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Couldn't save (HTTP ${res.status})`);
    setShifts(list => [data, ...list.filter(s => !(s.techId === techId && s.date === date))]);
    return data;
  }, []);

  return { shifts, saveShift };
}
