import { useCallback, useEffect, useState } from 'react';
import { BILLING_DEFAULTS, billingSettings } from '../lib/invoices.js';

/**
 * Billing settings (billing day, payment terms). Live: saved on the server. Demo: kept
 * in the page only, so trying settings in the demo never touches the real books.
 */
export function useBilling(demo) {
  const [live, setLive] = useState(BILLING_DEFAULTS);
  const [demoSettings, setDemoSettings] = useState(BILLING_DEFAULTS);

  useEffect(() => {
    let off = false;
    fetch('/api/billing').then(r => (r.ok ? r.json() : null)).then(s => { if (s && !off) setLive(billingSettings(s)); }).catch(() => {});
    return () => { off = true; };
  }, []);

  const save = useCallback(async patch => {
    if (demo) { setDemoSettings(s => billingSettings({ ...s, ...patch })); return; }
    const res = await fetch('/api/billing', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Couldn't save (HTTP ${res.status})`);
    setLive(billingSettings(data));
  }, [demo]);

  return { settings: demo ? demoSettings : live, save };
}

/** Signed account links for customers (live only): { key: token }. */
export async function fetchPayLinks(keys) {
  const res = await fetch('/api/pay-links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keys }) });
  return res.ok ? res.json() : {};
}
