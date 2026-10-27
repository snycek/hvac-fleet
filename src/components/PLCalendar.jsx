import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { addDays } from '../lib/dates.js';
import { money, profitAndLoss } from '../lib/lawns.js';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const monthStart = d => `${d.slice(0, 7)}-01`;
const shiftMonth = (d, n) => { const x = new Date(`${monthStart(d)}T12:00:00`); x.setMonth(x.getMonth() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-01`; };
const short = n => (Math.abs(n) >= 1000 ? `$${(Math.abs(n) / 1000).toFixed(1)}k` : `$${Math.round(Math.abs(n))}`);

/**
 * P/L as a month calendar: each day shows money collected, money spent and the net,
 * with week totals on the right. Click a day to see it in the P/L.
 */
export default function PLCalendar({ jobs, expenses, today, initial, onPickDay, onClose }) {
  const [month, setMonth] = useState(monthStart(initial || today));

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const { weeks, totals, maxAbs } = useMemo(() => {
    const first = month;
    const last = addDays(shiftMonth(month, 1), -1);
    const gridStart = addDays(first, -new Date(`${first}T12:00:00`).getDay()); // back to Sunday
    const day = d => {
      const pl = profitAndLoss(jobs, expenses, { from: d, to: d });
      return { date: d, inMonth: d >= first && d <= last, future: d > today, collected: pl.incomeTotal, spent: pl.expenseTotal, net: pl.net, paid: pl.income.length };
    };
    const out = [];
    for (let d = gridStart; d <= last || out.length % 7; d = addDays(d, 1)) out.push(day(d));
    const wk = [];
    for (let i = 0; i < out.length; i += 7) {
      const days = out.slice(i, i + 7);
      const inside = days.filter(x => x.inMonth);
      wk.push({ days, collected: inside.reduce((s, x) => s + x.collected, 0), spent: inside.reduce((s, x) => s + x.spent, 0), net: inside.reduce((s, x) => s + x.net, 0) });
    }
    const m = profitAndLoss(jobs, expenses, { from: first, to: last });
    return {
      weeks: wk,
      totals: { collected: m.incomeTotal, spent: m.expenseTotal, net: m.net, owed: m.owedTotal },
      maxAbs: Math.max(1, ...out.filter(x => x.inMonth).map(x => Math.abs(x.net))),
    };
  }, [jobs, expenses, month, today]);

  const atEnd = month >= monthStart(today);
  const title = new Date(`${month}T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return createPortal(
    <div className="cust-backdrop plcal-backdrop" onClick={onClose}>
      <div className="plcal" role="dialog" aria-label={`P/L calendar, ${title}`} onClick={e => e.stopPropagation()}>
        <header className="plcal-head">
          <button type="button" className="btn-ghost" onClick={() => setMonth(m => shiftMonth(m, -1))} aria-label="Previous month">‹</button>
          <h2>📅 {title}</h2>
          <button type="button" className="btn-ghost" onClick={() => setMonth(m => shiftMonth(m, 1))} disabled={atEnd} aria-label="Next month" style={{ opacity: atEnd ? 0.4 : 1 }}>›</button>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn-ghost" onClick={onClose} aria-label="Close">✕</button>
        </header>

        <div className="plcal-totals">
          <div><b style={{ color: '#3fb950' }}>{money(totals.collected)}</b><span>Collected</span></div>
          <div><b style={{ color: '#ff7b72' }}>{money(totals.spent)}</b><span>Expenses</span></div>
          <div><b style={{ color: totals.net >= 0 ? '#3fb950' : '#ff7b72' }}>{money(totals.net)}</b><span>Net</span></div>
          <div><b style={{ color: '#f0b429' }}>{money(totals.owed)}</b><span>Still owed</span></div>
        </div>

        <div className="plcal-grid" role="grid">
          {DOW.map(d => <div key={d} className="plcal-dow">{d}</div>)}
          <div className="plcal-dow">Week</div>
          {weeks.map((w, wi) => (
            <div key={wi} className="plcal-week" role="row">
              {w.days.map(d => {
                const tint = d.inMonth && !d.future && d.net ? Math.min(0.35, 0.06 + 0.29 * Math.abs(d.net) / maxAbs) : 0;
                const bg = tint ? (d.net > 0 ? `rgba(63,185,80,${tint})` : `rgba(255,123,114,${tint})`) : undefined;
                return (
                  <button key={d.date} type="button" role="gridcell" className={`plcal-day${d.inMonth ? '' : ' out'}${d.date === today ? ' today' : ''}${d.future ? ' future' : ''}`}
                    style={{ background: bg }} disabled={!d.inMonth || d.future} onClick={() => onPickDay(d.date)}
                    title={d.inMonth ? `${d.date}: collected ${money(d.collected)} · expenses ${money(d.spent)} · net ${money(d.net)}` : ''}>
                    <span className="plcal-num">{Number(d.date.slice(8))}</span>
                    {d.inMonth && !d.future && (
                      <>
                        {d.collected > 0 && <span className="plcal-in">+{short(d.collected)}</span>}
                        {d.spent > 0 && <span className="plcal-out">−{short(d.spent)}</span>}
                        {(d.collected > 0 || d.spent > 0) && <span className="plcal-net" style={{ color: d.net >= 0 ? '#3fb950' : '#ff7b72' }}>{d.net >= 0 ? '' : '−'}{short(d.net)}</span>}
                      </>
                    )}
                  </button>
                );
              })}
              <div className="plcal-wk" title="Week total (this month's days)">
                <span className="plcal-in">+{short(w.collected)}</span>
                <span className="plcal-out">−{short(w.spent)}</span>
                <span className="plcal-net" style={{ color: w.net >= 0 ? '#3fb950' : '#ff7b72' }}>{w.net >= 0 ? '' : '−'}{short(w.net)}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="plcal-key cust-dim">Green + = money collected · Red − = expenses (incl. crew labor) · bottom = net · tap a day to see it in the P/L</div>
      </div>
    </div>,
    document.body,
  );
}
