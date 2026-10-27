import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { customerHistory, methodLabel } from '../lib/customers.js';
import { METHODS } from '../lib/payments.js';

const usd = n => `$${Number(n || 0).toFixed(2)}`;
const day = iso => (iso ? new Date(String(iso).length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const stamp = iso => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
const CHANNEL = { text: '💬 Text', email: '✉️ Email' };

/**
 * Everything about one customer (by service address): balance, payments (incl. declined
 * cards), every reminder sent with its exact wording (audit trail), and all visits.
 */
export default function CustomerCard({ customerKey, jobs, payments, today, onClose, onRemind, onPrint }) {
  const h = useMemo(() => customerHistory({ jobs, payments, key: customerKey, today }), [jobs, payments, customerKey, today]);
  const [tab, setTab] = useState('payments');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const remind = async () => {
    setBusy(true);
    try { await onRemind(h); setNote('Reminder logged — see Contact history.'); setTab('contacts'); }
    catch (e) { setNote(e.message || 'Could not send.'); }
    finally { setBusy(false); }
  };

  const firstVisit = h.visits[h.visits.length - 1];
  const tabs = [
    ['payments', `💵 Payments · ${h.payments.length}`],
    ['contacts', `📨 Contact history · ${h.contacts.length}`],
    ['visits', `✂️ Visits · ${h.visits.length}`],
  ];

  return createPortal(
    <div className="cust-backdrop" onClick={onClose}>
      <aside className="cust-card" role="dialog" aria-label={`Customer: ${h.name}`} onClick={e => e.stopPropagation()}>
        <header className="cust-head">
          <div style={{ minWidth: 0 }}>
            <div className="cust-name">📇 {h.name}</div>
            <div className="cust-sub">{h.address}</div>
            <div className="cust-sub">
              {h.phone && <a href={`tel:${h.phone.replace(/\D/g, '')}`}>📞 {h.phone}</a>}
              {h.email && <> · <a href={`mailto:${h.email}`}>✉️ {h.email}</a></>}
            </div>
          </div>
          <button type="button" className="btn-ghost cust-x" onClick={onClose} aria-label="Close">✕</button>
        </header>

        <div className="cust-stats">
          <div><b style={{ color: h.balance ? '#f0b429' : '#3fb950' }}>{usd(h.balance)}</b><span>Balance</span></div>
          <div><b>{h.oldestOpen ? `${h.oldestOpen.age}d` : '—'}</b><span>Oldest open</span></div>
          <div><b style={{ color: '#3fb950' }}>{usd(h.paidTotal)}</b><span>Paid to date</span></div>
          <div><b>{firstVisit ? day(firstVisit.date) : '—'}</b><span>Customer since</span></div>
        </div>

        <div className="cust-actions">
          {h.balance > 0 && onRemind && <button type="button" className="btn-ghost" disabled={busy} onClick={remind}>🔔 {busy ? 'Sending…' : 'Remind'}</button>}
          {h.balance > 0 && onPrint && <button type="button" className="btn-ghost" onClick={() => onPrint(h)}>🖨 Print invoice</button>}
          {note && <span className="cust-note">{note}</span>}
        </div>

        <div className="cust-tabs" role="tablist">
          {tabs.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>

        <div className="cust-body">
          {tab === 'payments' && (h.payments.length ? (
            <table className="cust-table">
              <thead><tr><th>Date</th><th>Amount</th><th>How</th><th>Result</th></tr></thead>
              <tbody>
                {h.payments.map(p => (
                  <tr key={p.id}>
                    <td>{stamp(p.at)}</td>
                    <td><b>{usd(p.amount)}</b>{p.visits > 1 ? <span className="cust-dim"> · {p.visits} visits</span> : ''}</td>
                    <td>{p.card ? '💳' : (METHODS[p.method]?.icon || '')} {methodLabel(p)}</td>
                    <td>{p.status === 'paid' ? <span className="cust-ok">✓ Received</span> : <span className="cust-bad">❌ Declined · {p.reason}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="cust-empty">No payments yet.</div>)}

          {tab === 'contacts' && (h.contacts.length ? (
            <ol className="cust-log">
              {h.contacts.map(c => (
                <li key={c.id}>
                  <div className="cust-log-head">
                    <b>{stamp(c.at)}</b>
                    <span>{CHANNEL[c.channel] || c.channel}{c.to ? ` → ${c.to}` : ''}</span>
                    <span className="cust-dim">by {c.by || 'Owner'} · {c.scope === 'account' ? `account reminder (${c.jobIds.length} visit${c.jobIds.length === 1 ? '' : 's'})` : 'payment reminder'}</span>
                  </div>
                  <div className="cust-msg">{c.message}</div>
                  <div className={c.delivered ? 'cust-ok' : 'cust-dim'}>{c.delivered ? '✓ Delivered' : 'Logged · not sent — texting/email isn\'t connected yet'}</div>
                </li>
              ))}
            </ol>
          ) : <div className="cust-empty">No reminders or messages sent yet.</div>)}

          {tab === 'visits' && (
            <table className="cust-table">
              <thead><tr><th>Date</th><th>Service</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody>
                {h.visits.map(v => (
                  <tr key={v.id}>
                    <td>{day(v.date)}</td>
                    <td>{v.service}<div className="cust-dim">{v.invoiceNo}</div></td>
                    <td>{usd(v.amount)}</td>
                    <td>
                      {v.status === 'paid' && <span className="cust-ok">✓ Paid {day(v.paidAt)}{v.method ? ` · ${METHODS[v.method]?.label.toLowerCase() || v.method}` : ''}</span>}
                      {v.status === 'open' && <span className={v.age >= 30 ? 'cust-bad' : 'cust-warn'}>{v.age >= 30 ? '⚠️ ' : ''}Open · {v.age}d</span>}
                      {v.status === 'upcoming' && <span className="cust-dim">Scheduled</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
