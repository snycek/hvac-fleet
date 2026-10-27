import { useEffect, useState } from 'react';

// Payments received (or attempted) — see src/lib/payments.js for the shape.
export function usePayments({ poll = true } = {}) {
  const [payments, setPayments] = useState([]);
  useEffect(() => {
    if (!poll) return undefined;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/payments');
        if (res.ok && !cancelled) setPayments(await res.json());
      } catch { /* offline */ }
    };
    const first = setTimeout(load, 0);
    const id = setInterval(load, 5000);
    return () => { cancelled = true; clearTimeout(first); clearInterval(id); };
  }, [poll]);
  return payments;
}
