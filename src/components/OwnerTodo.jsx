import { memo, useState } from 'react';
import QuoteInbox from './QuoteInbox.jsx';
import { receiptUrl } from '../hooks/useExpenses.js';
import { MANUAL_EXPENSE_TYPES, PAST_DUE_DAYS, daysSinceCut, expenseType, isPastDue, money, reminderMessage, shortDate } from '../lib/lawns.js';
import { COMPANY_INFO } from '../data/services.js';
import { METHODS, TEST_CARDS } from '../lib/payments.js';
import { REMIND_GAP_DAYS, pastDueCustomers } from '../lib/customers.js';

// Approving cards first, then the ones that decline.
const TEST_CARD_ORDER = ['4242', '4444', '0005', '1117', '9995', '0002', '0069'];
import { todayString } from '../lib/dates.js';

const sectionTitle = { fontSize: '14px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' };

function ExpenseToLog({ exp, foreman, onLog, onReject }) {
  const [category, setCategory] = useState(exp.category);
  const [amount, setAmount] = useState(String(exp.amount));
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(false);
  const type = expenseType(category);

  const act = async (fn) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };

  return (
    <div className="card" style={{ padding: '14px', display: 'flex', gap: '14px', alignItems: 'stretch', flexWrap: 'wrap' }}>
      {exp.hasReceipt ? (
        <button type="button" onClick={() => setZoom(true)} title="View receipt" style={{ padding: 0, border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', background: '#000', cursor: 'zoom-in', width: '84px', height: '110px', flexShrink: 0 }}>
          <img src={receiptUrl(exp.id)} alt="Receipt" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </button>
      ) : (
        <div style={{ width: '84px', height: '110px', borderRadius: '8px', border: '1px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', flexShrink: 0 }}>{type.icon}</div>
      )}

      <div style={{ flex: '1 1 200px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          <b style={{ color: 'var(--text-primary)' }}>{foreman?.name || 'Foreman'}</b> · {shortDate(exp.date)}{exp.note ? ` · ${exp.note}` : ''}
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {MANUAL_EXPENSE_TYPES.map(t => (
            <button key={t.id} type="button" onClick={() => setCategory(t.id)} aria-pressed={category === t.id} style={{
              padding: '5px 10px', borderRadius: '14px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${category === t.id ? 'var(--accent-teal)' : 'var(--border)'}`,
              background: category === t.id ? 'var(--accent-teal)22' : 'transparent',
              color: category === t.id ? 'var(--accent-teal)' : 'var(--text-muted)',
            }}>{t.icon} {t.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', width: '120px' }}>
            <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>$</span>
            <input className="form-input" type="number" inputMode="decimal" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} aria-label="Amount" style={{ paddingLeft: '22px', padding: '7px 8px 7px 22px' }} />
          </div>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => act(() => onReject(exp.id))} style={{ padding: '8px 12px', fontSize: '13px', color: '#ff7b72' }}>Reject</button>
          <button type="button" className="btn-primary" disabled={busy || !(Number(amount) > 0)} onClick={() => act(() => onLog(exp.id, { category, amount: Number(amount) }))} style={{ padding: '8px 16px', fontSize: '13px' }}>
            ✓ Log {money(Number(amount) || 0, true)}
          </button>
        </div>
      </div>

      {zoom && (
        <div onClick={() => setZoom(false)} style={{ position: 'fixed', inset: 0, background: '#000000e0', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', cursor: 'zoom-out' }}>
          <img src={receiptUrl(exp.id)} alt="Receipt" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: '8px' }} />
        </div>
      )}
    </div>
  );
}

/** Owner's To-Do: new quotes, foreman expenses to log, and finished cuts not yet paid. */
// bare: no title row (the hub panel shows its own) and tighter spacing.
function OwnerTodo({ jobs, technicians, expenses, scheduleJob, declineJob, markPaid, logExpense, rejectExpense, remindCustomer, printInvoice, remindAccounts, openCustomer, today = todayString(), bare = false }) {
  const [paying, setPaying] = useState(null);
  const [showAllUnpaid, setShowAllUnpaid] = useState(false);
  const UNPAID_PREVIEW = 5;
  const quotes = jobs.filter(j => j.status === 'quote');
  const toLog = expenses.filter(e => e.status === 'pending');
  // Oldest first, so anything 30+ days past due is at the top.
  const unpaid = jobs.filter(j => j.status === 'completed' && !j.paid).sort((a, b) => String(a.completedAt).localeCompare(String(b.completedAt)));
  const pastDue = unpaid.filter(j => isPastDue(j, today));
  // Card payments that came back declined.
  const problems = unpaid.filter(j => j.paymentIssue);
  const [choosing, setChoosing] = useState(null); // job id whose "Mark paid" menu is open
  const [testCard, setTestCard] = useState('4242');
  const record = async (job, method, last4) => {
    setPaying(job.id);
    try { await markPaid(job.id, true, method, last4); } finally { setPaying(null); setChoosing(null); }
  };
  const [reminding, setReminding] = useState(null);
  // "Remind all 30+ days": one reminder per customer, skipping anyone reminded this week.
  // Days-late filter (All / 30+ / 45+ / 60+ / 90+ / any number): narrows the Unpaid
  // list and picks who "Remind all" goes to (All = the usual 30+ past-due rule).
  const [lateMin, setLateMin] = useState(0);
  const [customLate, setCustomLate] = useState('');
  const [includeRecent, setIncludeRecent] = useState(false);
  const threshold = lateMin || PAST_DUE_DAYS;
  // Address / name search: narrows the list and who "Remind all" goes to.
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const matches = x => !q || `${x.address || ''} ${x.clientName || x.name || ''}`.toLowerCase().includes(q);
  const shownUnpaid = unpaid.filter(j => (!lateMin || daysSinceCut(j, today) >= lateMin) && matches(j));
  const behind = pastDueCustomers(jobs, today, threshold).filter(matches);
  const toRemind = includeRecent ? behind : behind.filter(c => !c.recentlyReminded);
  const [bulk, setBulk] = useState({ open: false, busy: false, done: '' });
  const remindAll = async () => {
    setBulk(b => ({ ...b, busy: true }));
    try {
      await remindAccounts(toRemind);
      setBulk({ open: false, busy: false, done: `✓ Reminded ${toRemind.length} customer${toRemind.length === 1 ? '' : 's'} — logged in each one's contact history` });
    } catch (e) { setBulk({ open: true, busy: false, done: e.message }); }
  };
  const Addr = ({ job }) => (openCustomer
    ? <button type="button" className="addr-link" onClick={() => openCustomer(job)} title="Payment & contact history">{String(job.address || '').split(',')[0]}</button>
    : <span style={{ fontWeight: 600 }}>{String(job.address || '').split(',')[0]}</span>);
  const remind = async (job) => {
    setReminding(job.id);
    try { await remindCustomer(job.id, reminderMessage(job, COMPANY_INFO.name)); } finally { setReminding(null); }
  };
  const unpaidTotal = unpaid.reduce((s, j) => s + (j.earnings || 0), 0);
  const total = quotes.length + toLog.length + unpaid.length;


  return (
    <section style={{ marginBottom: bare ? 0 : '28px' }}>
      {!bare && <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700 }}>📥 To-Do</h2>
        <span style={{ background: total ? '#f0b42922' : 'var(--bg-elevated)', color: total ? '#f0b429' : 'var(--text-muted)', border: `1px solid ${total ? '#f0b42955' : 'var(--border)'}`, borderRadius: '12px', padding: '2px 10px', fontSize: '12px', fontWeight: 700 }}>
          {total}
        </span>
        {quotes.length > 0 && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>📝 {quotes.length}</span>}
        {toLog.length > 0 && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>🧾 {toLog.length}</span>}
        {unpaid.length > 0 && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>💵 {money(unpaidTotal)}</span>}
      </div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: bare ? '14px' : '22px' }}>
        <QuoteInbox jobs={jobs} technicians={technicians} scheduleJob={scheduleJob} declineJob={declineJob} />

        {toLog.length > 0 && (
          <div>
            <h3 style={sectionTitle}>Expenses to Log · {toLog.length}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 440px), 1fr))', gap: '12px' }}>
              {toLog.map(exp => (
                <ExpenseToLog key={exp.id} exp={exp} foreman={technicians.find(t => t.id === exp.techId)} onLog={logExpense} onReject={rejectExpense} />
              ))}
            </div>
          </div>
        )}

        {problems.length > 0 && (
          <div>
            <h3 style={{ ...sectionTitle, color: '#ff7b72' }}>Payment problems · {problems.length}</h3>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {problems.map((job, i) => (
                <div key={job.id} className="unpaid-row problem" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderTop: i ? '1px solid var(--border)' : 'none', fontSize: '13px', flexWrap: 'wrap' }}>
                  <span style={{ flex: '1 1 170px', minWidth: 0 }}>
                    <span aria-hidden="true">❌ </span>
                    <Addr job={job} />
                    <span style={{ color: 'var(--text-muted)' }}> · {job.clientName}</span>
                    <div style={{ fontSize: '12px', color: '#ff7b72' }}>
                      {job.paymentIssue.brand || 'Card'} ••{job.paymentIssue.last4 || '----'} · {job.paymentIssue.reason} · {shortDate(job.paymentIssue.at)}
                    </div>
                  </span>
                  <span style={{ fontWeight: 700, width: '60px', textAlign: 'right' }}>{money(job.earnings || 0)}</span>
                  <span className="row-actions">
                    <button type="button" className="btn-ghost remind-btn" disabled={paying === job.id} onClick={() => record(job, 'card', '4242')} title="Try the charge again">↻ Retry card</button>
                    {remindCustomer && <button type="button" className="btn-ghost remind-btn" disabled={reminding === job.id} onClick={() => remind(job)}>🔔 Remind</button>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {unpaid.length > 0 && (
          <div>
            <h3 style={sectionTitle}>
              Unpaid · {unpaid.length} · {money(unpaidTotal)}
              {pastDue.length > 0 && <span className="past-due-count" title={`${pastDue.length} cut${pastDue.length === 1 ? '' : 's'} unpaid ${PAST_DUE_DAYS}+ days`}> · ⚠️ {pastDue.length} past {PAST_DUE_DAYS} days</span>}
            </h3>
            <div className="late-filter" role="group" aria-label="Days late">
              <span className="cust-dim">Days late</span>
              {[0, 30, 45, 60, 90].map(d => (
                <button key={d} type="button" aria-pressed={lateMin === d && !customLate} onClick={() => { setLateMin(d); setCustomLate(''); setBulk({ open: false, busy: false, done: '' }); }}>
                  {d ? `${d}+` : 'All'}
                </button>
              ))}
              <input inputMode="numeric" placeholder="Custom" aria-label="Custom days late" value={customLate}
                onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 3); setCustomLate(v); setLateMin(Number(v) || 0); setBulk({ open: false, busy: false, done: '' }); }} />
              {(lateMin > 0 || q) && <span className="cust-dim">{shownUnpaid.length} cut{shownUnpaid.length === 1 ? '' : 's'} · {behind.length} customer{behind.length === 1 ? '' : 's'}</span>}
            </div>
            <div className="late-filter">
              <span className="cust-dim">Address</span>
              <input className="addr-search" type="search" placeholder="Search address or name…" aria-label="Search unpaid by address or name" value={search}
                onChange={e => { setSearch(e.target.value); setBulk({ open: false, busy: false, done: '' }); }} />
              {q && <button type="button" onClick={() => setSearch('')}>Clear</button>}
            </div>
            {remindAccounts && behind.length > 0 && (
              <div className="remind-all">
                <button type="button" className="btn-ghost remind-btn" disabled={!toRemind.length || bulk.busy} onClick={() => setBulk({ open: !bulk.open, busy: false, done: '' })}
                  title={toRemind.length ? 'One reminder per customer, with their pay link' : `Everyone ${threshold}+ days behind was reminded in the last ${REMIND_GAP_DAYS} days`}>
                  🔔 Remind all {threshold}+ days ({toRemind.length})
                </button>
                {behind.some(c => c.recentlyReminded) && (
                  <label className="cust-dim remind-include">
                    <input type="checkbox" checked={includeRecent} onChange={e => setIncludeRecent(e.target.checked)} />
                    Include {behind.filter(c => c.recentlyReminded).length} already reminded in the last {REMIND_GAP_DAYS} days
                  </label>
                )}
                {bulk.done && <span className="remind-done">{bulk.done}</span>}
                {bulk.open && toRemind.length > 0 && (
                  <div className="remind-confirm">
                    <div><b>Send a payment reminder to {toRemind.length} customer{toRemind.length === 1 ? '' : 's'}</b> ({money(toRemind.reduce((s, c) => s + c.balance, 0))} owed)?</div>
                    <div className="cust-dim">{toRemind.slice(0, 6).map(c => `${c.name} (${money(c.balance)})`).join(' · ')}{toRemind.length > 6 ? ` · +${toRemind.length - 6} more` : ''}</div>
                    <div className="remind-preview">Each gets their own total and pay link, e.g.: “Hi {String(toRemind[0].name).split(' ')[0]}, … your account has {money(toRemind[0].balance)} open … Pay anytime here: [their link]”</div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button type="button" className="btn-primary" disabled={bulk.busy} onClick={remindAll} style={{ padding: '5px 14px', fontSize: '12px' }}>{bulk.busy ? 'Sending…' : `Send ${toRemind.length} reminder${toRemind.length === 1 ? '' : 's'}`}</button>
                      <button type="button" className="btn-ghost" onClick={() => setBulk({ open: false, busy: false, done: '' })} style={{ padding: '5px 12px', fontSize: '12px' }}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {(showAllUnpaid ? shownUnpaid : shownUnpaid.slice(0, UNPAID_PREVIEW)).map((job, i) => {
                const days = daysSinceCut(job, today);
                const late = days >= PAST_DUE_DAYS;
                const lastReminder = job.reminders?.[job.reminders.length - 1];
                return (
                <div key={job.id} className={late ? 'unpaid-row past-due' : 'unpaid-row'} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderTop: i ? '1px solid var(--border)' : 'none', fontSize: '13px', flexWrap: 'wrap' }}>
                  <span style={{ flex: '1 1 170px', minWidth: 0 }}>
                    {late && <span className="yield" role="img" aria-label={`${days} days past due`} title={`${days} days past due`}>⚠️</span>}
                    <Addr job={job} />
                    <span style={{ color: 'var(--text-muted)' }}> · {job.clientName}</span>
                    {lastReminder && (
                      <span className="reminded" title={lastReminder.message}> · 🔔 {shortDate(lastReminder.at)}{job.reminders.length > 1 ? ` ×${job.reminders.length}` : ''}</span>
                    )}
                  </span>
                  <span style={{ color: late ? '#f0b429' : 'var(--text-muted)', width: '84px', whiteSpace: 'nowrap', fontWeight: late ? 700 : 400 }} title={`Cut ${shortDate(job.completedAt)}`}>✂️ {shortDate(job.completedAt)} · {days}d</span>
                  <span style={{ fontWeight: 700, width: '70px', textAlign: 'right' }}>{money(job.earnings || 0)}</span>
                  <span className="row-actions">
                  {printInvoice && (
                    <button type="button" className="btn-ghost remind-btn" onClick={() => printInvoice(job)} title="Print a paper invoice with a pay QR code" aria-label={`Print invoice for ${job.clientName}`}>🖨</button>
                  )}
                  {remindCustomer && (
                    <button type="button" className="btn-ghost remind-btn" disabled={reminding === job.id} onClick={() => remind(job)}
                      title={`Send ${job.clientName.split(' ')[0]} a payment reminder`}>
                      {reminding === job.id ? '…' : '🔔 Remind'}
                    </button>
                  )}
                  <button type="button" className={bare ? 'btn-ghost' : 'btn-primary'} disabled={paying === job.id} onClick={() => setChoosing(choosing === job.id ? null : job.id)}
                    aria-expanded={choosing === job.id} style={bare ? { padding: '3px 10px', fontSize: '12px', color: '#3fb950', borderColor: '#3fb95055' } : { padding: '6px 14px', fontSize: '12px' }}>
                    {paying === job.id ? '…' : bare ? 'Mark paid' : '💵 Mark Paid'}
                  </button>
                  </span>
                  {choosing === job.id && (
                    <div className="pay-choose">
                      <span>Paid by</span>
                      <button type="button" onClick={() => record(job, 'cash')}>{METHODS.cash.icon} Cash</button>
                      <button type="button" onClick={() => record(job, 'check')}>{METHODS.check.icon} Check</button>
                      <span className="pay-choose-card">
                        <select value={testCard} onChange={e => setTestCard(e.target.value)} aria-label="Test card" title="Test card processor — pick a card that approves or declines">
                          {TEST_CARD_ORDER.map(l4 => [l4, TEST_CARDS[l4]]).map(([l4, c]) => <option key={l4} value={l4}>{c.brand} ••{l4}{c.ok ? '' : ` (${c.reason.toLowerCase()})`}</option>)}
                        </select>
                        <button type="button" onClick={() => record(job, 'card', testCard)}>{METHODS.card.icon} Charge card</button>
                      </span>
                    </div>
                  )}
                </div>
                );
              })}
            </div>
            {shownUnpaid.length > UNPAID_PREVIEW && (
              <button type="button" className="btn-ghost" onClick={() => setShowAllUnpaid(s => !s)} style={{ marginTop: '8px', padding: '6px 12px', fontSize: '12px' }}>
                {showAllUnpaid ? 'Show less' : `Show ${shownUnpaid.length - UNPAID_PREVIEW} more`}
              </button>
            )}
          </div>
        )}

        {total === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '14px' }}>
            ✓ All caught up
          </div>
        )}
      </div>
    </section>
  );
}

export default memo(OwnerTodo);
