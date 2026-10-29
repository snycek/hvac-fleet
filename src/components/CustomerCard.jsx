import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { customerHistory, methodLabel, nextReminderDate } from '../lib/customers.js';
import { CONTACT_METHODS } from '../lib/billing.js';
import { lastPaymentContact } from '../lib/notify.js';
import { METHODS } from '../lib/payments.js';
import { formatPrice, formatSqFt } from '../lib/zones.js';
import { repeatLabel } from '../lib/dates.js';
import YardMap from './YardMap.jsx';

const usd = n => `$${Number(n || 0).toFixed(2)}`;
const day = iso => (iso ? new Date(String(iso).length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const stamp = iso => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
const CHANNEL = { text: '💬 Text', email: '✉️ Email', paper: '📄 Paper' };
const contactKind = c => (c.kind === 'heads_up' ? 'on-the-way text (automatic)' : c.kind === 'statement' ? `${c.periodLabel || 'monthly'} statement`
  : c.scope === 'account' ? `account reminder (${c.jobIds.length} visit${c.jobIds.length === 1 ? '' : 's'})` : 'payment reminder');

/**
 * Everything about one customer (by service address): balance, payments (incl. declined
 * cards), every reminder sent with its exact wording (audit trail), and all visits.
 */
export default function CustomerCard({ customerKey, jobs, payments, today, settings, onClose, onRemind, onPrint, onUpdate }) {
  const h = useMemo(() => customerHistory({ jobs, payments, key: customerKey, today, settings }), [jobs, payments, customerKey, today, settings]);
  const [tab, setTab] = useState('payments');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  // How they get bills (text / email / paper) and how often (monthly / each visit).
  const update = async patch => {
    setSaving(true);
    try { await onUpdate(customerKey, patch); } catch (e) { setNote(e.message || 'Could not save.'); } finally { setSaving(false); }
  };

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
    ['property', '🗺️ Property'],
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
          <div><b style={{ color: h.daysLate ? '#ff7b72' : undefined }}>{h.daysLate ? `${h.daysLate}d` : h.balance ? 'Not yet' : '—'}</b><span>Past due</span></div>
          <div><b style={{ color: '#3fb950' }}>{usd(h.paidTotal)}</b><span>Paid to date</span></div>
          <div><b>{firstVisit ? day(firstVisit.date) : '—'}</b><span>Customer since</span></div>
        </div>

        {onUpdate && (
          <div className="cust-prefs">
            <span className="cust-dim">Bills by</span>
            <span className="seg-mini" role="group" aria-label="Preferred contact">
              {Object.entries(CONTACT_METHODS).map(([id, m]) => (
                <button key={id} type="button" aria-pressed={h.contactPref === id} disabled={saving}
                  title={id === 'text' && !h.phone ? 'No phone number on file' : id === 'email' && !h.email ? 'No email on file' : `${m.label}: statements and reminders`}
                  onClick={() => update({ contactPref: id })}>{m.icon} {m.label}</button>
              ))}
            </span>
            <span className="seg-mini" role="group" aria-label="How often they're billed">
              <button type="button" aria-pressed={h.billing === 'monthly'} disabled={saving} onClick={() => update({ billing: 'monthly' })} title="One statement a month covering every visit">Monthly</button>
              <button type="button" aria-pressed={h.billing === 'visit'} disabled={saving} onClick={() => update({ billing: 'visit' })} title="An invoice after each visit">Each visit</button>
            </span>
            <span className="seg-mini" role="group" aria-label="Text before arrival">
              <button type="button" aria-pressed={h.notifyArrival} disabled={saving} onClick={() => update({ notifyArrival: !h.notifyArrival })}
                title="Text or email them when the crew heads to their lawn">📲 On-the-way text: {h.notifyArrival ? 'On' : 'Off'}</button>
            </span>
            {((h.contactPref === 'text' && !h.phone) || (h.contactPref === 'email' && !h.email)) && (
              <span className="cust-warn">No {h.contactPref === 'text' ? 'phone' : 'email'} on file, so we'll use what we have</span>
            )}
          </div>
        )}

        <div className="cust-actions">
          {h.balance > 0 && onRemind && (() => {
            const wait = nextReminderDate(lastPaymentContact(h.contacts), today);
            return <button type="button" className="btn-ghost" disabled={busy || !!wait} onClick={remind} title={wait ? 'One reminder per week' : 'Send one reminder for the whole balance'}>🔔 {busy ? 'Sending…' : wait ? `Next reminder ${new Date(`${wait}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Remind'}</button>;
          })()}
          {h.balance > 0 && onPrint && <button type="button" className="btn-ghost" onClick={() => onPrint(h)}>🖨 Print {h.billing === 'monthly' ? 'statement' : 'invoice'}</button>}
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
                    <td>{p.card && p.method === 'card' ? '💳' : (METHODS[p.method]?.icon || '')} {methodLabel(p)}</td>
                    <td>{p.status === 'paid' ? <span className="cust-ok">✓ Received</span> : <span className="cust-bad">❌ {p.method === 'check' ? 'Bounced' : `Declined · ${p.reason}`}</span>}</td>
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
                    <span className="cust-dim">by {c.by || 'Owner'} · {contactKind(c)}</span>
                  </div>
                  {c.message && <div className="cust-msg">{c.message}</div>}
                  <div className={c.delivered ? 'cust-ok' : 'cust-dim'}>{c.delivered ? '✓ Delivered' : c.channel === 'paper' ? 'Printed to mail or hand over' : 'Logged · not sent — texting/email isn\'t connected yet'}</div>
                </li>
              ))}
            </ol>
          ) : <div className="cust-empty">No reminders or messages sent yet.</div>)}

          {tab === 'property' && (() => {
            const p = h.property;
            return (
              <div className="cust-prop">
                {p.center ? <YardMap center={p.center} zones={p.zones} readOnly height="280px" /> : <div className="cust-empty">No map location on file.</div>}
                {p.zones.length > 0 ? (
                  <>
                    <div className="cust-prop-total"><b>{formatSqFt(p.totalSqFt)}</b> outlined{p.quotedPrice != null ? <> · website quoted <b>{formatPrice(p.quotedPrice)}</b></> : p.requested.includes('Snow Removal') ? ' · snow priced by you' : ''}</div>
                    <ul className="cust-prop-zones">
                      {p.zones.map(z => (
                        <li key={z.id}><span style={{ background: z.color }} />{z.name}<b>{formatSqFt(z.sqFt)}</b></li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <div className="cust-dim" style={{ margin: '8px 0' }}>No outline on file — this customer was added before online quotes (or skipped the map).</div>
                )}
                <table className="cust-table">
                  <tbody>
                    <tr><th>Service</th><td>{p.service}</td></tr>
                    {p.requested.length > 0 && <tr><th>Asked for</th><td>{p.requested.join(', ')}</td></tr>}
                    <tr><th>Price</th><td>{formatPrice(p.price)} {p.perSnowfall ? 'per push' : 'per visit'}</td></tr>
                    <tr><th>Schedule</th><td>{p.perSnowfall ? 'Every snowfall' : repeatLabel(p.repeatDays)}</td></tr>
                    {p.notes && <tr><th>Their notes</th><td>📝 {p.notes}</td></tr>}
                  </tbody>
                </table>
              </div>
            );
          })()}

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
                      {v.status === 'open' && v.checkPending && <span className="check-badge">📨 Check coming · {v.checkPending.how === 'crew' ? 'to crew' : 'mailed'} {day(v.checkPending.at)}</span>}
                      {v.status === 'open' && !v.checkPending && (v.late > 0
                        ? <span className="cust-bad">⚠️ {v.late}d past due</span>
                        : <span className="cust-warn">Open · due {day(v.due)}</span>)}
                      {v.status === 'upcoming' && <span className="cust-dim">Scheduled</span>}
                      {v.status === 'skipped' && <span className="cust-dim">⏭ Skipped{v.skipReason ? ` · ${v.skipReason}` : ''} · no charge</span>}
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
