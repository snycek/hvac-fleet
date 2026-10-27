import { useState } from 'react';
import ExpenseModal from './ExpenseModal.jsx';
import { receiptUrl } from '../hooks/useExpenses.js';
import { expenseType, money, monthLabel, profitAndLoss, shiftMonth, shortDate } from '../lib/lawns.js';
import { todayString } from '../lib/dates.js';

const Stat = ({ label, value, color }) => (
  <div style={{ background: 'var(--bg-primary)', borderRadius: '10px', padding: '14px 10px', textAlign: 'center' }}>
    <div style={{ fontSize: '24px', fontWeight: 800, color }}>{value}</div>
    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
  </div>
);

/** Monthly profit & loss: paid cuts in, logged expenses out. */
export default function ProfitLoss({ jobs, expenses, technicians, addExpense }) {
  const thisMonth = todayString().slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [adding, setAdding] = useState(false);
  const pl = profitAndLoss(jobs, expenses, month);

  const ledger = [
    ...pl.income.map(j => ({ id: j.id, date: j.paidAt, icon: '💵', label: j.clientName, amount: j.earnings || 0 })),
    ...pl.spent.map(e => ({
      id: e.id, date: e.date, icon: expenseType(e.category).icon,
      label: [expenseType(e.category).label, technicians.find(t => t.id === e.techId)?.name.split(' ')[0], e.note].filter(Boolean).join(' · '),
      amount: -e.amount, receipt: e.hasReceipt ? receiptUrl(e.id) : null,
    })),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date)));

  return (
    <section className="card" style={{ padding: '18px', marginBottom: '28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700, marginRight: 'auto' }}>📊 P/L</h2>
        <button type="button" className="btn-ghost" onClick={() => setMonth(m => shiftMonth(m, -1))} aria-label="Previous month" style={{ padding: '6px 12px' }}>‹</button>
        <span style={{ fontWeight: 700, minWidth: '130px', textAlign: 'center' }}>{monthLabel(month)}</span>
        <button type="button" className="btn-ghost" onClick={() => setMonth(m => shiftMonth(m, 1))} disabled={month >= thisMonth} aria-label="Next month" style={{ padding: '6px 12px', opacity: month >= thisMonth ? 0.4 : 1 }}>›</button>
        <button type="button" className="btn-primary" onClick={() => setAdding(true)} style={{ padding: '7px 14px', fontSize: '13px' }}>+ Expense</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px', marginBottom: '12px' }}>
        <Stat label="Income" value={money(pl.incomeTotal)} color="#3fb950" />
        <Stat label="Expenses" value={money(pl.expenseTotal)} color="#ff7b72" />
        <Stat label="Net" value={money(pl.net)} color={pl.net >= 0 ? 'var(--accent-teal)' : '#ff7b72'} />
      </div>

      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', fontSize: '13px', color: 'var(--text-muted)', marginBottom: ledger.length ? '12px' : 0 }}>
        {pl.byType.map(t => <span key={t.id}>{t.icon} {money(t.total)}</span>)}
        <span>💵 {pl.income.length} paid</span>
      </div>

      {ledger.length > 0 && (
        <div style={{ maxHeight: '260px', overflowY: 'auto', borderTop: '1px solid var(--border)' }}>
          {ledger.map(row => (
            <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 2px', borderBottom: '1px solid var(--border)', fontSize: '13px' }}>
              <span style={{ width: '42px', color: 'var(--text-muted)' }}>{shortDate(row.date)}</span>
              <span>{row.icon}</span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.label}</span>
              {row.receipt && <a href={row.receipt} target="_blank" rel="noreferrer" title="Receipt" style={{ textDecoration: 'none' }}>🧾</a>}
              <span style={{ fontWeight: 700, color: row.amount >= 0 ? '#3fb950' : '#ff7b72', width: '80px', textAlign: 'right' }}>
                {row.amount >= 0 ? '+' : ''}{money(row.amount, true)}
              </span>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <ExpenseModal
          title="Add Expense"
          submitLabel="Log Expense"
          onSubmit={async (exp) => { await addExpense({ ...exp, logNow: true }); setAdding(false); }}
          onClose={() => setAdding(false)}
        />
      )}
    </section>
  );
}
