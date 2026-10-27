import { useState } from 'react';
import QuoteInbox from './QuoteInbox.jsx';
import { receiptUrl } from '../hooks/useExpenses.js';
import { EXPENSE_TYPES, expenseType, money, shortDate } from '../lib/lawns.js';

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
          {EXPENSE_TYPES.map(t => (
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
export default function OwnerTodo({ jobs, technicians, expenses, scheduleJob, declineJob, markPaid, logExpense, rejectExpense }) {
  const [paying, setPaying] = useState(null);
  const quotes = jobs.filter(j => j.status === 'quote');
  const toLog = expenses.filter(e => e.status === 'pending');
  const unpaid = jobs.filter(j => j.status === 'completed' && !j.paid).sort((a, b) => String(a.completedAt).localeCompare(String(b.completedAt)));
  const unpaidTotal = unpaid.reduce((s, j) => s + (j.earnings || 0), 0);
  const total = quotes.length + toLog.length + unpaid.length;

  const pay = async (id) => { setPaying(id); try { await markPaid(id, true); } finally { setPaying(null); } };

  return (
    <section style={{ marginBottom: '28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700 }}>📥 To-Do</h2>
        <span style={{ background: total ? '#f0b42922' : 'var(--bg-elevated)', color: total ? '#f0b429' : 'var(--text-muted)', border: `1px solid ${total ? '#f0b42955' : 'var(--border)'}`, borderRadius: '12px', padding: '2px 10px', fontSize: '12px', fontWeight: 700 }}>
          {total}
        </span>
        {quotes.length > 0 && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>📝 {quotes.length}</span>}
        {toLog.length > 0 && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>🧾 {toLog.length}</span>}
        {unpaid.length > 0 && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>💵 {money(unpaidTotal)}</span>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
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

        {unpaid.length > 0 && (
          <div>
            <h3 style={sectionTitle}>Unpaid · {unpaid.length} · {money(unpaidTotal)}</h3>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {unpaid.map((job, i) => (
                <div key={job.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderTop: i ? '1px solid var(--border)' : 'none', fontSize: '13px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, flex: '1 1 140px', minWidth: 0 }}>{job.clientName}</span>
                  <span style={{ color: 'var(--text-muted)', width: '70px' }}>✂️ {shortDate(job.completedAt)}</span>
                  <span style={{ fontWeight: 700, width: '70px', textAlign: 'right' }}>{money(job.earnings || 0)}</span>
                  <button type="button" className="btn-primary" disabled={paying === job.id} onClick={() => pay(job.id)} style={{ padding: '6px 14px', fontSize: '12px' }}>
                    {paying === job.id ? '…' : '💵 Mark Paid'}
                  </button>
                </div>
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
