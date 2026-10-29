import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { lawnKey, money } from '../lib/lawns.js';

const digits = s => String(s || '').replace(/\D/g, '');
const MAX = 8;

/**
 * Quick search: type part of an address, a name, or any digits of a phone number and
 * pick a customer to open their card. Enter opens the top match.
 */
export default function CustomerSearch({ jobs, onPick }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [box, setBox] = useState(null);
  const input = useRef(null);

  // One entry per customer (same address), newest details, with what they owe.
  const customers = useMemo(() => {
    const byKey = new Map();
    for (const j of jobs) {
      if (j.status === 'quote' || j.status === 'declined' || !j.address) continue;
      const k = lawnKey(j);
      const c = byKey.get(k) || { key: k, name: '', address: '', phone: '', owed: 0, latest: '' };
      const when = String(j.completedAt || j.scheduledDate || j.createdAt || '');
      if (when >= c.latest) Object.assign(c, { name: j.clientName || c.name, address: j.address, phone: j.clientPhone || c.phone, latest: when });
      if (j.status === 'completed' && !j.paid) c.owed += j.earnings || 0;
      byKey.set(k, c);
    }
    return [...byKey.values()];
  }, [jobs]);

  const term = q.trim().toLowerCase();
  const num = digits(q);
  const results = useMemo(() => {
    if (term.length < 2) return [];
    return customers
      .filter(c => `${c.address} ${c.name}`.toLowerCase().includes(term) || (num.length >= 3 && digits(c.phone).includes(num)))
      // Addresses that start with what was typed first (house numbers), then A–Z.
      .sort((a, b) => (b.address.toLowerCase().startsWith(term) - a.address.toLowerCase().startsWith(term)) || a.address.localeCompare(b.address))
      .slice(0, MAX);
  }, [customers, term, num]);

  // The list floats over the page (panels clip their contents), right under the box.
  useLayoutEffect(() => {
    if (!open || !input.current) return undefined;
    const place = () => { const r = input.current.getBoundingClientRect(); setBox({ left: r.left, top: r.bottom + 4, width: Math.max(r.width, 300) }); };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, q]);

  const pick = c => { onPick(c.key); setQ(''); setOpen(false); input.current?.blur(); };
  const onKey = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && results[active]) { e.preventDefault(); pick(results[active]); }
    else if (e.key === 'Escape') { setOpen(false); input.current?.blur(); }
  };

  return (
    <div className="cust-search">
      <input ref={input} type="search" inputMode="search" placeholder="🔍 Address, name or phone…" aria-label="Find a customer"
        value={q} onChange={e => { setQ(e.target.value); setActive(0); setOpen(true); }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onKeyDown={onKey} />
      {open && term.length >= 2 && box && createPortal(
        <ul className="cust-search-list" role="listbox" style={{ left: box.left, top: box.top, width: box.width }}>
          {results.length === 0 && <li className="cust-search-none">No customer matches “{q.trim()}”</li>}
          {results.map((c, i) => (
            <li key={c.key} role="option" aria-selected={i === active} onMouseDown={e => { e.preventDefault(); pick(c); }} onMouseEnter={() => setActive(i)}>
              <b>{String(c.address).split(',')[0]}</b>
              <span className="cust-dim"> · {c.name}</span>
              <div className="cust-search-sub">
                {c.phone && <span>📞 {c.phone}</span>}
                {c.owed > 0 ? <span className="cust-warn">owes {money(c.owed)}</span> : <span className="cust-dim">paid up</span>}
              </div>
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </div>
  );
}
