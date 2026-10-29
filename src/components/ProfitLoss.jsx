import { memo, useEffect, useRef, useState } from 'react';
import ExpenseModal from './ExpenseModal.jsx';
import { receiptUrl } from '../hooks/useExpenses.js';
import { METHODS } from '../lib/payments.js';
import PeriodPicker from './PeriodPicker.jsx';
import PLCalendar from './PLCalendar.jsx';
import CollapseButton from './CollapseButton.jsx';
import LawnBreakdown from './LawnBreakdown.jsx';
import { expenseType, money, periodRange, profitAndLoss, shortDate, effectiveAnchor } from '../lib/lawns.js';
import { todayString } from '../lib/dates.js';

// Big number that flashes whenever it changes (money coming in).
function Stat({ label, value, color, compact }) {
  const [flash, setFlash] = useState(0);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current === value) return undefined;
    prev.current = value;
    const id = setTimeout(() => setFlash(f => f + 1), 0);
    return () => clearTimeout(id);
  }, [value]);
  return (
  <div style={{ background: 'var(--bg-primary)', borderRadius: '8px', padding: compact ? '7px 6px' : '14px 10px', textAlign: 'center', minWidth: 0 }}>
    <div key={flash} className={flash ? 'pl-flash' : undefined} style={{ fontSize: compact ? '18px' : '24px', fontWeight: 800, color, display: 'inline-block' }}>{value}</div>
    <div style={{ fontSize: compact ? '10px' : '11px', color: 'var(--text-muted)', marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
  </div>
  );
}

/** Profit & loss for a day, week, or month: paid cuts in, logged expenses out. */
// costRates / fixedCosts / onSaveFixedCosts: the per-lawn breakdown (📊 By lawn).
function ProfitLoss({ jobs, expenses, technicians, addExpense, today = todayString(), compact = false, collapsed = false, onToggleCollapse, payments = [], costRates = null, fixedCosts = [], onSaveFixedCosts, actualFor = null }) {
  const [byLawn, setByLawn] = useState(false);
  const [period, setPeriod] = useState({ mode: 'month', anchor: today, pinned: false });
  const [calendar, setCalendar] = useState(false); // month calendar view
  const [adding, setAdding] = useState(false);
  const pl = profitAndLoss(jobs, expenses, periodRange(period.mode, effectiveAnchor(period, today)));

  // Money in and out only (unpaid cuts show as Owed and in To-Do). Who cut what lives in the Crew Report.
  const ledger = [
    ...pl.income.map(j => {
      // How the money came in: card (brand ••last4), cash, or check.
      const p = j.paymentId ? payments.find(x => x.id === j.paymentId) : null;
      const method = METHODS[p?.method || j.paymentMethod] || METHODS.cash;
      const how = p?.method === 'card' ? `${p.brand} ••${p.last4}` : method.label.toLowerCase();
      return { id: j.id, date: j.paidAt, icon: method.icon, label: `${j.clientName} · ${how}`, amount: j.earnings || 0 };
    }),
    ...pl.spent.map(e => ({
      id: e.id, date: e.date, icon: expenseType(e.category).icon,
      label: [expenseType(e.category).label, technicians.find(t => t.id === e.techId)?.name.split(' ')[0], e.note].filter(Boolean).join(' · '),
      amount: -e.amount, receipt: e.hasReceipt ? receiptUrl(e.id) : null,
    })),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date)));

  return (
    <section className={compact ? `dash-panel${collapsed ? ' collapsed' : ''}` : 'card'} style={compact ? undefined : { padding: '18px', marginBottom: '28px' }}>
      <div className={compact ? 'dash-panel-head' : undefined} style={compact ? undefined : { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        {compact && onToggleCollapse && <CollapseButton collapsed={collapsed} onToggle={onToggleCollapse} label="P/L" />}
        <h2 className={compact ? 'dash-panel-title' : undefined} style={compact ? undefined : { fontSize: '18px', fontWeight: 700, marginRight: 'auto' }}>📊 P/L</h2>
        {!collapsed && <PeriodPicker value={period} onChange={setPeriod} today={today} compact={compact} />}
        {!collapsed && costRates && <button type="button" className="btn-ghost pl-by-lawn" onClick={() => setByLawn(true)} title="Cost, revenue and net for every lawn, plus the next 30 days" style={{ padding: compact ? '2px 8px' : '6px 10px', fontSize: '12px' }}>📊 By lawn</button>}
        {byLawn && <LawnBreakdown jobs={jobs} rates={costRates} actualFor={actualFor} today={today} fixedCosts={fixedCosts} onSaveFixed={list => onSaveFixedCosts?.({ fixedCosts: list })} onClose={() => setByLawn(false)} />}
        {!collapsed && <button type="button" className="btn-ghost" onClick={() => setCalendar(true)} title="P/L calendar: each day's money in and out for the month" aria-label="Open P/L calendar" style={{ padding: compact ? '2px 7px' : '6px 10px' }}>📅</button>}
        {calendar && (
          <PLCalendar jobs={jobs} expenses={expenses} today={today} initial={effectiveAnchor(period, today)}
            onClose={() => setCalendar(false)}
            onPickDay={d => { setPeriod({ mode: 'day', anchor: d, pinned: d !== today }); setCalendar(false); }} />
        )}
        {!collapsed && <button type="button" className="btn-primary" onClick={() => setAdding(true)} style={{ padding: compact ? '4px 10px' : '7px 14px', fontSize: compact ? '12px' : '13px' }}>+ Expense</button>}
      </div>

      {!collapsed && <div className={compact ? 'dash-panel-body' : undefined} style={compact ? { display: 'flex', flexDirection: 'column', overflow: 'hidden' } : undefined}>
      <div style={{ display: 'grid', gridTemplateColumns: compact ? 'repeat(4, minmax(0, 1fr))' : 'repeat(auto-fit, minmax(110px, 1fr))', gap: compact ? '6px' : '10px', marginBottom: compact ? '8px' : '12px' }}>
        <Stat compact={compact} label="Income" value={money(pl.incomeTotal)} color="#3fb950" />
        <Stat compact={compact} label="Owed" value={money(pl.owedTotal)} color="#f0b429" />
        <Stat compact={compact} label="Expenses" value={money(pl.expenseTotal)} color="#ff7b72" />
        <Stat compact={compact} label="Net" value={money(pl.net)} color={pl.net >= 0 ? 'var(--accent-teal)' : '#ff7b72'} />
      </div>

      <div style={{ display: 'flex', gap: compact ? '10px' : '14px', flexWrap: 'wrap', fontSize: compact ? '12px' : '13px', color: 'var(--text-muted)', marginBottom: ledger.length ? (compact ? '6px' : '12px') : 0 }}>
        {pl.byType.map(t => <span key={t.id}>{t.icon} {money(t.total)}</span>)}
        <span>💵 {pl.income.length} received</span>
        <span>✂️ {pl.owed.length} unpaid</span>
      </div>

      {ledger.length > 0 && (
        <div style={compact ? { flex: 1, minHeight: 0, overflowY: 'auto', borderTop: '1px solid var(--border)' } : { maxHeight: '260px', overflowY: 'auto', borderTop: '1px solid var(--border)' }}>
          {ledger.map(row => (
            <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: compact ? '4px 2px' : '7px 2px', borderBottom: '1px solid var(--border)', fontSize: compact ? '12px' : '13px' }}>
              <span style={{ width: '42px', color: 'var(--text-muted)' }}>{shortDate(row.date)}</span>
              <span>{row.icon}</span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.label}</span>
              {row.receipt && <a href={row.receipt} target="_blank" rel="noreferrer" title="Receipt" style={{ textDecoration: 'none' }}>🧾</a>}
              <span style={{ fontWeight: 700, color: row.owed ? '#f0b429' : row.amount >= 0 ? '#3fb950' : '#ff7b72', width: '80px', textAlign: 'right' }}>
                {row.amount >= 0 ? '+' : ''}{money(row.amount, true)}
              </span>
            </div>
          ))}
        </div>
      )}

      </div>}

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

export default memo(ProfitLoss);
