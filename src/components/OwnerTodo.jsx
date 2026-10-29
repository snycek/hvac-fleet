import { memo, useState } from 'react';
import QuoteInbox from './QuoteInbox.jsx';
import { receiptUrl } from '../hooks/useExpenses.js';
import { MANUAL_EXPENSE_TYPES, lawnKey, expenseType, money, reminderMessage, shortDate } from '../lib/lawns.js';
import { COMPANY_INFO } from '../data/services.js';
import { CHECK_HOW, METHODS, TEST_CARDS, pendingChecks } from '../lib/payments.js';
import { REMIND_GAP_DAYS, contactsFor, nextReminderDate, pastDueCustomers } from '../lib/customers.js';
import { daysPastDue, dueDateFor } from '../lib/invoices.js';
import { monthName } from '../lib/billing.js';
import { housekeepingItems, todoCount } from '../lib/todo.js';
import { notPayment, lastPaymentContact } from '../lib/notify.js';

// Approving cards first, then the ones that decline.
const TEST_CARD_ORDER = ['4242', '4444', '0005', '1117', '9995', '0002', '0069'];
import { addDays, todayString } from '../lib/dates.js';

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
function OwnerTodo({ jobs, technicians, expenses, scheduleJob, declineJob, markPaid, logExpense, rejectExpense, remindCustomer, printInvoice, remindAccounts, openCustomer, planRoutes, hideQuotes = false, today = todayString(), bare = false, settings, statementsReady, onOpenBilling, onOpenQuotes, promiseCheck, settleCheck, sendLandscapeQuote, acceptLandscapeQuote, trucks, shop, onShowOnMap, payDue = [], onOpenPayroll, costRates, fixedCosts, askCrewSiteCheck }) {
  // Checks customers said are on the way: John marks each received (paid) or bounced.
  const checks = pendingChecks(jobs);
  const [settling, setSettling] = useState(null);
  const [checkNote, setCheckNote] = useState('');
  const [showAllChecks, setShowAllChecks] = useState(false);
  const settle = async (check, received) => {
    if (!received && !window.confirm(`Mark ${check.clientName}'s check for ${money(check.amount)} as bounced? It moves to Payment problems.`)) return;
    setSettling(check.id); setCheckNote('');
    try {
      await settleCheck(check.id, received);
      setCheckNote(received ? `✓ ${check.clientName}: ${money(check.amount)} paid by ${check.kind === 'cash' ? 'cash' : 'check'}` : `${check.clientName}'s check marked bounced`);
    } catch (e) { setCheckNote(e.message); } finally { setSettling(null); }
  };
  // "Mike collected 10/2 · #1042" once the crew has it; otherwise how the customer said they'd pay.
  const checkWhen = c => (c.collectedBy
    ? `${String(c.collectedBy).split(' ')[0]} collected ${shortDate(c.collectedAt)}${c.number ? ` · #${c.number}` : ''}`
    : `${c.how === 'crew' ? 'giving to crew' : 'mailed'} ${shortDate(c.at)}${c.number ? ` · #${c.number}` : ''}`);
  const anyCash = checks.some(c => c.kind === 'cash');
  const [paying, setPaying] = useState(null);
  const [showAllUnpaid, setShowAllUnpaid] = useState(false);
  const UNPAID_PREVIEW = 5;
  const quotes = jobs.filter(j => j.status === 'quote');
  const toLog = expenses.filter(e => e.status === 'pending');
  // Oldest first.
  const unpaid = jobs.filter(j => j.status === 'completed' && !j.paid).sort((a, b) => String(a.completedAt).localeCompare(String(b.completedAt)));
  const lateBy = j => daysPastDue(j, today, settings);
  // Card payments that came back declined.
  const problems = unpaid.filter(j => j.paymentIssue);
  const chores = housekeepingItems(jobs, today);
  const [choosing, setChoosing] = useState(null); // job id whose "Mark paid" menu is open
  const [testCard, setTestCard] = useState('4242');
  // Pay every open cut on an account (one tap for the whole balance).
  const recordAll = async (acct, method, last4) => {
    setPaying(acct.key);
    try { for (const j of acct.jobs) await markPaid(j.id, true, method, last4); } finally { setPaying(null); setChoosing(null); }
  };
  const [openAcct, setOpenAcct] = useState(null); // account whose cuts are showing
  const record = async (job, method, last4) => {
    setPaying(job.id);
    try { await markPaid(job.id, true, method, last4); } finally { setPaying(null); setChoosing(null); }
  };
  const [reminding, setReminding] = useState(null);
  // Past due = something on the account is past its due date (statement or invoice).
  // Days-late filter (Any / 30+ / 60+ / 90+ / any number): narrows the list and picks
  // who "Remind all" goes to. One reminder per customer, skipping anyone reminded this week.
  const [lateMin, setLateMin] = useState(0);
  const [customLate, setCustomLate] = useState('');
  const threshold = Math.max(1, lateMin);
  // Address / name search: narrows the list and who "Remind all" goes to.
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const matches = x => !q || `${x.address || ''} ${x.clientName || x.name || ''}`.toLowerCase().includes(q);
  const behind = pastDueCustomers(jobs, today, threshold, settings).filter(matches);
  const accounts = behind.map(c => {
    const contacts = contactsFor(jobs.filter(j => lawnKey(j) === c.key));
    const pay = contacts.filter(x => !notPayment(x)); // on-the-way texts and quotes aren't reminders
    return { ...c, latest: c.jobs[c.jobs.length - 1], lastReminder: pay[0] || null, reminders: pay.length };
  });
  const shownUnpaid = accounts.flatMap(a => a.jobs);
  // Reminded this week, or a check/cash on the way: nothing for John to do yet, so they
  // wait in a folded group and come back up when the week is up.
  const isWaiting = a => a.recentlyReminded || !!a.check;
  const needsAction = accounts.filter(a => !isWaiting(a));
  const waitingAccts = accounts.filter(isWaiting);
  const [showWaiting, setShowWaiting] = useState(false);
  const pastDueAll = pastDueCustomers(jobs, today, 1, settings);
  const pastDueTotal = pastDueAll.reduce((s, c) => s + c.overdue, 0);
  // Testing helper: mark every bill in the (filtered) list paid by cash, one tap.
  const [payingAll, setPayingAll] = useState('');
  const markAllPaid = async () => {
    const list = shownUnpaid;
    const total = list.reduce((s, j) => s + (j.earnings || 0), 0);
    if (!list.length || !window.confirm(`Mark all ${accounts.length} account${accounts.length === 1 ? '' : 's'} paid (${list.length} bills, ${money(total)}) as cash?`)) return;
    setPayingAll(`Marking 0 of ${list.length} paid…`);
    let n = 0;
    for (const j of list) {
      await markPaid(j.id, true, 'cash');
      n += 1;
      if (n % 5 === 0) setPayingAll(`Marking ${n} of ${list.length} paid…`);
    }
    setPayingAll(`✓ Marked ${n} bills paid (${money(total)})`);
  };
  const remindOne = async acct => {
    setReminding(acct.key);
    try { await (remindAccounts ? remindAccounts([acct]) : remindCustomer(acct.latest.id, reminderMessage(acct.latest, COMPANY_INFO.name))); } finally { setReminding(null); }
  };
  // One reminder per customer per week — anyone reminded in the last 7 days waits.
  // Nobody with a check on the way gets reminded.
  const toRemind = behind.filter(c => !c.recentlyReminded && !c.check);
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
  const total = todoCount({ jobs, expenses, today, settings, statementsReady, hideQuotes, payDue });


  // One past-due account row (used by both "needs action" and "reminded, waiting").
  const renderAcct = (acct, i) => {
    const late = acct.oldestDays >= 30;
    const open = openAcct === acct.key;
    const n = acct.jobs.length;
    // Plow customers get pushes, not cuts.
    const snow = acct.latest.service === 'Snow Removal';
    const unit = snow ? (n === 1 ? 'push' : 'pushes') : (n === 1 ? 'cut' : 'cuts');
    const icon = snow ? '❄️' : '✂️';
    return (
    <div key={acct.key} className={late ? 'unpaid-row past-due' : 'unpaid-row'} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderTop: i ? '1px solid var(--border)' : 'none', fontSize: '13px', flexWrap: 'wrap' }}>
      <span style={{ flex: '1 1 170px', minWidth: 0 }}>
        {late && <span className="yield" role="img" aria-label={`${acct.oldestDays} days past due`} title={`${acct.oldestDays} days past the due date`}>⚠️</span>}
        <Addr job={acct.latest} />
        <span style={{ color: 'var(--text-muted)' }}> · {acct.name}</span>
        {acct.lastReminder && (
          <span className="reminded" title={acct.lastReminder.message}> · 🔔 {shortDate(acct.lastReminder.at)}{acct.reminders > 1 ? ` ×${acct.reminders}` : ''}</span>
        )}
        {acct.check && (
          <div className="check-badge">📨 {acct.check.kind === 'cash' ? 'Cash with the crew' : acct.check.collectedBy ? 'Check with the crew' : 'Check coming'} · {checkWhen(acct.check)}{acct.checkCoversAll ? '' : ` · covers ${money(acct.check.amount)}`}</div>
        )}
      </span>
      <button type="button" className="acct-cuts" onClick={() => setOpenAcct(open ? null : acct.key)} aria-expanded={open}
        style={{ color: late ? '#f0b429' : 'var(--text-muted)', fontWeight: late ? 700 : 400 }} title={n > 1 ? `Show each ${snow ? 'push' : 'cut'}` : `${snow ? 'Plowed' : 'Cut'} ${shortDate(acct.jobs[0].completedAt)}`}>
        {n > 1 ? (open ? '▾' : '▸') : icon} {n > 1 ? `${n} ${unit} · ` : `${shortDate(acct.jobs[0].completedAt)} · `}{acct.oldestDays}d late
      </button>
      <span style={{ fontWeight: 700, width: '62px', textAlign: 'right' }}>{money(acct.balance)}</span>
      <span className="row-actions">
      {printInvoice && (
        <button type="button" className="btn-ghost remind-btn" onClick={() => printInvoice(acct.latest)} title="Print a paper invoice with a pay QR code" aria-label={`Print invoice for ${acct.name}`}>🖨</button>
      )}
      {(remindAccounts || remindCustomer) && !acct.check && (
        (() => {
          const wait = nextReminderDate(acct.lastReminder, today);
          return (
            <button type="button" className="btn-ghost remind-btn" disabled={!!wait || reminding === acct.key} onClick={() => remindOne(acct)}
              title={wait ? `Reminded ${shortDate(acct.lastReminder.at)} — one reminder per week. Next on ${shortDate(wait)}.` : `Send ${String(acct.name).split(' ')[0]} one reminder for the whole balance`}>
              {reminding === acct.key ? '…' : wait ? `🔔 ${shortDate(wait)}` : '🔔 Remind'}
            </button>
          );
        })()
      )}
      {acct.check && settleCheck ? (
        // Their check is on the way: one tap when it shows up (paid by check).
        <button type="button" className="btn-ghost" disabled={settling === acct.check.id} onClick={() => settle({ ...acct.check, clientName: acct.name }, true)}
          style={{ padding: '3px 10px', fontSize: '12px', color: '#a371f7', borderColor: '#a371f755' }}
          title={`Got their check: mark ${money(acct.check.amount)} paid by check`}>
          {settling === acct.check.id ? '…' : `✓ Acknowledge ${acct.check.kind === 'cash' ? 'cash' : 'check'}`}
        </button>
      ) : (
      <button type="button" className={bare ? 'btn-ghost' : 'btn-primary'} disabled={paying === acct.key} onClick={() => setChoosing(choosing === acct.key ? null : acct.key)}
        aria-expanded={choosing === acct.key} style={bare ? { padding: '3px 10px', fontSize: '12px', color: '#3fb950', borderColor: '#3fb95055' } : { padding: '6px 14px', fontSize: '12px' }}
        title={n > 1 ? `Mark all ${n} ${unit} paid (${money(acct.balance)})` : 'Mark paid'}>
        {paying === acct.key ? '…' : n > 1 ? 'Mark all paid' : 'Mark paid'}
      </button>
      )}
      </span>
      {choosing === acct.key && (
        <div className="pay-choose">
          <span>{n > 1 ? `All ${n} ${unit} · ${money(acct.balance)} paid by` : 'Paid by'}</span>
          <button type="button" onClick={() => recordAll(acct, 'cash')}>{METHODS.cash.icon} Cash</button>
          <button type="button" onClick={() => recordAll(acct, 'check')}>{METHODS.check.icon} Check</button>
          {promiseCheck && (
            <button type="button" title="They called to say a check is coming: hold reminders and list it under Checks to clear"
              onClick={async () => { setChoosing(null); try { await promiseCheck(acct.jobs.map(j => j.id), 'mail', ''); } catch (e) { setCheckNote(e.message); } }}>📨 Check coming</button>
          )}
          <span className="pay-choose-card">
            <select value={testCard} onChange={e => setTestCard(e.target.value)} aria-label="Test card" title="Test card processor — pick a card that approves or declines">
              {TEST_CARD_ORDER.map(l4 => [l4, TEST_CARDS[l4]]).map(([l4, c]) => <option key={l4} value={l4}>{c.brand} ••{l4}{c.ok ? '' : ` (${c.reason.toLowerCase()})`}</option>)}
            </select>
            <button type="button" onClick={() => recordAll(acct, 'card', testCard)}>{METHODS.card.icon} Charge card</button>
          </span>
        </div>
      )}
      {open && n > 1 && (
        <div className="acct-cut-list">
          {acct.jobs.map(job => {
            const d = lateBy(job);
            return (
              <div key={job.id} className="acct-cut">
                <span className={d > 0 ? 'cust-warn' : 'cust-dim'}>{icon} {shortDate(job.completedAt)} · {d > 0 ? `${d}d late` : `due ${shortDate(dueDateFor(job, settings))}`}</span>
                <span style={{ fontWeight: 600 }}>{money(job.earnings || 0)}</span>
                <span className="acct-cut-pay">
                  <span className="cust-dim">Paid:</span>
                  <button type="button" disabled={paying === job.id} onClick={() => record(job, 'cash')}>{METHODS.cash.icon} Cash</button>
                  <button type="button" disabled={paying === job.id} onClick={() => record(job, 'check')}>{METHODS.check.icon} Check</button>
                  <button type="button" disabled={paying === job.id} onClick={() => record(job, 'card', testCard)}>{METHODS.card.icon} Card</button>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
    );
  };

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
        {/* Payday: John pays the crew every Friday. */}
        {payDue.length > 0 && (
          <div>
            <h3 style={{ ...sectionTitle, color: '#3fb950' }}>👷 Payday</h3>
            <div className="card todo-pay-card">
              {payDue.map(p => (
                <div key={p.weekStart} className="todo-pay-row">
                  <div style={{ minWidth: 0, flex: '1 1 180px' }}>
                    <div><b>{p.late ? '⚠️ Crew pay is late' : 'Pay the crew today'}</b> · week of {shortDate(p.weekStart)}–{shortDate(addDays(p.weekStart, 6))}</div>
                    <div className="cust-dim">{p.people} {p.people === 1 ? 'person' : 'people'} · {money(p.total)}{p.late ? ` · was due ${shortDate(p.payday)}` : ''}</div>
                  </div>
                  {onOpenPayroll && <button type="button" className="btn-primary" onClick={() => onOpenPayroll(p.weekStart)} style={{ padding: '6px 14px', fontSize: '12px' }}>Run payroll →</button>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Billing: this month's statements to send, then anyone past due. */}
        {statementsReady && (
          <div>
            <h3 style={sectionTitle}>Billing</h3>
            <div className="card todo-bill-card">
              <div><b>{monthName(statementsReady.period)} statements are ready</b></div>
              <div className="cust-dim">{statementsReady.count} customer{statementsReady.count === 1 ? '' : 's'} · {money(statementsReady.total)} · each sent their way (text, email or paper)</div>
              {onOpenBilling && <button type="button" className="btn-primary" onClick={onOpenBilling} style={{ padding: '6px 14px', fontSize: '12px', marginTop: '8px' }}>Review &amp; send →</button>}
            </div>
          </div>
        )}

        {checks.length > 0 && (
          <div>
            <h3 style={{ ...sectionTitle, color: '#a371f7' }}>📨 Checks{anyCash ? ' & cash' : ''} to clear · {checks.length} · {money(checks.reduce((s, c) => s + c.amount, 0))}</h3>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {(showAllChecks ? checks : checks.slice(0, 5)).map(c => (
                <div key={c.id} className="check-row">
                  <span style={{ flex: '1 1 170px', minWidth: 0 }}>
                    <Addr job={c.jobs[0]} />
                    <span className="cust-dim"> · {c.clientName}</span>
                    <div className="cust-dim" style={{ fontSize: '12px' }} title={CHECK_HOW[c.how]}>
                      {c.kind === 'cash' ? '💵 Cash · ' : '🧾 '}{checkWhen(c)} · {c.jobs.length} visit{c.jobs.length === 1 ? '' : 's'}{c.by === 'owner' ? ' · noted by you' : ''}
                    </div>
                  </span>
                  <b style={{ width: '58px', textAlign: 'right' }}>{money(c.amount)}</b>
                  <span className="row-actions">
                    {c.kind !== 'cash' && <button type="button" className="btn-ghost remind-btn" disabled={settling === c.id} onClick={() => settle(c, false)} title="The check bounced">Bounced</button>}
                    <button type="button" className="btn-ghost remind-btn" disabled={settling === c.id} onClick={() => settle(c, true)}
                      style={{ color: '#3fb950', borderColor: '#3fb95055' }} title={`Got it: mark these visits paid by ${c.kind === 'cash' ? 'cash' : 'check'}`}>{settling === c.id ? '…' : '✓ Received'}</button>
                  </span>
                </div>
              ))}
            </div>
            {checks.length > 5 && (
              <button type="button" className="btn-ghost" onClick={() => setShowAllChecks(s => !s)} style={{ marginTop: '8px', padding: '6px 12px', fontSize: '12px' }}>
                {showAllChecks ? 'Show less' : `Show ${checks.length - 5} more`}
              </button>
            )}
          </div>
        )}
        {/* Stays after the last check is cleared (the list above is gone by then). */}
        {checkNote && <div className={/^✓/.test(checkNote) ? 'remind-done' : 'cust-dim'} style={{ fontSize: '12px', marginTop: checks.length ? '-6px' : 0 }}>{checkNote}</div>}

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
                      {job.paymentIssue.method === 'check'
                        ? `Check${job.paymentIssue.last4 ? ` #${job.paymentIssue.last4}` : ''} bounced`
                        : `${job.paymentIssue.brand || 'Card'} ••${job.paymentIssue.last4 || '----'} · ${job.paymentIssue.reason}`} · {shortDate(job.paymentIssue.at)}
                    </div>
                  </span>
                  <span style={{ fontWeight: 700, width: '60px', textAlign: 'right' }}>{money(job.earnings || 0)}</span>
                  <span className="row-actions">
                    {job.paymentIssue.method !== 'check' && <button type="button" className="btn-ghost remind-btn" disabled={paying === job.id} onClick={() => record(job, 'card', '4242')} title="Try the charge again">↻ Retry card</button>}
                    {remindCustomer && (() => {
                      const wait = nextReminderDate(lastPaymentContact(contactsFor(jobs.filter(j => lawnKey(j) === lawnKey(job)))), today);
                      return <button type="button" className="btn-ghost remind-btn" disabled={!!wait || reminding === job.id} onClick={() => remind(job)} title={wait ? `One reminder per week. Next on ${shortDate(wait)}.` : 'Send a payment reminder'}>{wait ? `🔔 ${shortDate(wait)}` : '🔔 Remind'}</button>;
                    })()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {pastDueAll.length > 0 && (
          <div>
            <h3 style={{ ...sectionTitle, color: '#f0b429' }}>
              ⚠️ Past due · {needsAction.length} need{needsAction.length === 1 ? 's' : ''} action{waitingAccts.length ? ` · ${waitingAccts.length} waiting` : ''} · {money(pastDueTotal)}
            </h3>
            <div className="cust-dim" style={{ fontSize: '11.5px', marginTop: '-6px', marginBottom: '8px' }}>Late = past the due date on their statement or invoice. Everything else is in Billing.</div>
            <div className="late-filter" role="group" aria-label="Days past due">
              <span className="cust-dim">Days late</span>
              {[0, 30, 60, 90].map(d => (
                <button key={d} type="button" aria-pressed={lateMin === d && !customLate} onClick={() => { setLateMin(d); setCustomLate(''); setBulk({ open: false, busy: false, done: '' }); }}>
                  {d ? `${d}+` : 'Any'}
                </button>
              ))}
              <input inputMode="numeric" placeholder="Custom" aria-label="Custom days late" value={customLate}
                onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 3); setCustomLate(v); setLateMin(Number(v) || 0); setBulk({ open: false, busy: false, done: '' }); }} />
              {(lateMin > 0 || q) && <span className="cust-dim">{accounts.length} account{accounts.length === 1 ? '' : 's'} · {shownUnpaid.length} visit{shownUnpaid.length === 1 ? '' : 's'}</span>}
            </div>
            <div className="late-filter">
              <span className="cust-dim">Address</span>
              <input className="addr-search" type="search" placeholder="Search address or name…" aria-label="Search unpaid by address or name" value={search}
                onChange={e => { setSearch(e.target.value); setBulk({ open: false, busy: false, done: '' }); }} />
              {q && <button type="button" onClick={() => setSearch('')}>Clear</button>}
            </div>
            <div className="remind-all">
              <button type="button" className="btn-ghost remind-btn mark-all-btn" disabled={!shownUnpaid.length || /^Marking/.test(payingAll)} onClick={markAllPaid}
                title="Mark every bill in this list paid (cash) — handy for testing">✓ Mark all paid ({accounts.length})</button>
              {payingAll && <span className={/^✓/.test(payingAll) ? 'remind-done' : 'cust-dim'}>{payingAll}</span>}
            </div>
            {remindAccounts && behind.length > 0 && (
              <div className="remind-all">
                <button type="button" className="btn-ghost remind-btn" disabled={!toRemind.length || bulk.busy} onClick={() => setBulk({ open: !bulk.open, busy: false, done: '' })}
                  title={toRemind.length ? 'One reminder per customer, with their pay link, sent the way they prefer' : `Everyone in this list was reminded in the last ${REMIND_GAP_DAYS} days`}>
                  🔔 Remind all{lateMin ? ` ${lateMin}+ days late` : ''} ({toRemind.length})
                </button>
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
              {(showAllUnpaid ? needsAction : needsAction.slice(0, UNPAID_PREVIEW)).map(renderAcct)}
              {needsAction.length === 0 && <div className="cust-empty" style={{ padding: '12px' }}>✓ Everyone here has been reminded this week (or has a payment on the way).</div>}
            </div>
            {needsAction.length > UNPAID_PREVIEW && (
              <button type="button" className="btn-ghost" onClick={() => setShowAllUnpaid(s => !s)} style={{ marginTop: '8px', padding: '6px 12px', fontSize: '12px' }}>
                {showAllUnpaid ? 'Show less' : `Show ${needsAction.length - UNPAID_PREVIEW} more`}
              </button>
            )}
            {waitingAccts.length > 0 && (
              <div className="waiting-group">
                <button type="button" className="waiting-toggle" aria-expanded={showWaiting} onClick={() => setShowWaiting(s => !s)}
                  title="Reminded in the last 7 days, or a check/cash is on the way. They move back up if still unpaid when the week is up.">
                  {showWaiting ? '▾' : '▸'} 🔔 {waitingAccts.length} reminded, waiting to pay · {money(waitingAccts.reduce((s, a) => s + a.overdue, 0))} past due
                </button>
                {showWaiting && <div className="card" style={{ padding: 0, overflow: 'hidden', marginTop: '6px' }}>{waitingAccts.map(renderAcct)}</div>}
              </div>
            )}
          </div>
        )}

        {/* Quotes: the inbox itself, or (on the hub, where Quotes has its own tab) a pointer to it. */}
        {!hideQuotes ? (
          <QuoteInbox jobs={jobs} technicians={technicians} scheduleJob={scheduleJob} declineJob={declineJob} planRoutes={planRoutes} today={today}
            sendLandscapeQuote={sendLandscapeQuote} acceptLandscapeQuote={acceptLandscapeQuote} trucks={trucks} shop={shop} onShowOnMap={onShowOnMap} costRates={costRates} fixedCosts={fixedCosts} askCrewSiteCheck={askCrewSiteCheck} />
        ) : quotes.length > 0 && (
          <div>
            <h3 style={sectionTitle}>Quotes</h3>
            <button type="button" className="card todo-link" onClick={onOpenQuotes}>
              📝 <b>{quotes.length} new quote request{quotes.length === 1 ? '' : 's'}</b> <span className="cust-dim">· open Quotes →</span>
            </button>
          </div>
        )}

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

        {(chores.noContact.length > 0 || chores.staleQuotes.length > 0) && (
          <div>
            <h3 style={sectionTitle}>Housekeeping</h3>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {chores.staleQuotes.length > 0 && (
                <button type="button" className="chore-row" onClick={onOpenQuotes}>
                  ⏳ <span><b>{chores.staleQuotes.length} quote{chores.staleQuotes.length === 1 ? '' : 's'}</b> waiting over a week for an answer</span>
                </button>
              )}
              {chores.noContact.map(j => (
                <button key={lawnKey(j)} type="button" className="chore-row" onClick={() => openCustomer?.(j)}>
                  📇 <span><b>{String(j.address || '').split(',')[0]}</b> · {j.clientName}: no phone or email, so bills go on paper</span>
                </button>
              ))}
            </div>
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
