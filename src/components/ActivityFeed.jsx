import { memo, useMemo } from 'react';
import { dayOf, expenseType, hoursMins, jobDay, money } from '../lib/lawns.js';
import { METHODS } from '../lib/payments.js';

const street = a => String(a || '').split(',')[0];
const timeOf = iso => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
// Expenses only carry a date; show them at end of day so they sort after the cuts.
const endOfDay = date => `${date}T17:00:00`;

/** Everything that happened today, newest first: cuts, payments, expenses, rain, start/end of day. */
function ActivityFeed({ jobs, expenses, technicians, delays = [], shifts = [], payments = [], today }) {
  const rows = useMemo(() => {
    const first = id => technicians.find(t => t.id === id)?.name.split(' ')[0] || 'Crew';
    const out = [];
    for (const j of jobs) {
      for (const r of j.reminders || []) {
        if (r.kind === 'heads_up' && dayOf(r.at) === today) {
          out.push({ key: `h-${j.id}-${r.id}`, at: r.at, icon: '📲', text: <>On-the-way {r.channel === 'email' ? 'email' : 'text'} to <b>{String(j.clientName || '').split(' ')[0]}</b> · {street(j.address)}</>, amount: '', tone: 'note' });
        }
      }
      if (j.status === 'skipped' && j.skippedAt && jobDay(j, today) === today) {
        out.push({ key: `s-${j.id}`, at: j.skippedAt, icon: '⏭', text: <><b>{first(j.assignedTo)}</b> skipped {street(j.address)}{j.skipReason ? <span style={{ color: 'var(--text-muted)' }}> · {j.skipReason}</span> : null}</>, amount: '', tone: 'skip' });
      }
      if (j.status === 'completed' && j.completedAt && jobDay(j, today) === today) {
        const plowed = j.service === 'Snow Removal';
        const land = /^landscaping/i.test(String(j.service || ''));
        out.push({ key: `c-${j.id}`, at: j.completedAt, icon: plowed ? '❄️' : land ? '🌳' : '✂️', text: <><b>{first(j.assignedTo)}</b> {plowed ? 'plowed' : land ? 'finished landscaping at' : 'cut'} {plowed ? j.clientName : street(j.address)}</>, amount: money(j.earnings || 0), tone: 'cut' });
      }
      if (j.paid && j.paidAt && dayOf(j.paidAt) === today) {
        const m = METHODS[j.paymentMethod] || METHODS.cash;
        out.push({ key: `p-${j.id}`, at: j.paidAt, icon: m.icon, text: <><b>{j.clientName}</b> paid · {m.label.toLowerCase()}</>, amount: `+${money(j.earnings || 0)}`, tone: 'in' });
      }
    }
    for (const e of expenses) {
      if (e.status === 'logged' && e.date === today) {
        out.push({ key: `e-${e.id}`, at: endOfDay(today), icon: expenseType(e.category).icon, text: e.category === 'card_fees' ? <>Card fee · {e.note}</> : <><b>{first(e.techId)}</b> {expenseType(e.category).label.toLowerCase()}{e.note ? ` · ${e.note}` : ''}</>, amount: `−${money(e.amount)}`, tone: 'out' });
      }
    }
    for (const p of payments) {
      if (p.status === 'failed' && dayOf(p.at) === today) {
        out.push({ key: `x-${p.id}`, at: p.at, icon: '❌', text: <><b>{p.clientName}</b> card declined · {p.reason}</>, amount: money(p.amount), tone: 'out' });
      }
    }
    for (const d of delays) {
      if (d.date === today) {
        out.push({ key: `r-${d.id}`, at: d.start, icon: '🌧', text: <><b>{first(d.techId)}</b> rain delay</>, amount: d.minutes ? hoursMins(d.minutes) : 'now', tone: 'rain' });
      }
    }
    for (const s of shifts) {
      if (s.date !== today) continue;
      if (s.start) out.push({ key: `s-${s.techId}`, at: s.start, icon: '🚚', text: <><b>{first(s.techId)}</b> rolled out</>, tone: 'muted' });
      if (s.end) out.push({ key: `f-${s.techId}`, at: s.end, icon: '🏁', text: <><b>{first(s.techId)}</b> back at shop</>, tone: 'muted' });
    }
    return out.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 120);
  }, [jobs, expenses, technicians, delays, shifts, payments, today]);

  if (!rows.length) {
    return <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '18px 4px', textAlign: 'center' }}>Nothing yet today</div>;
  }
  const TONE = { in: '#3fb950', out: '#ff7b72', cut: 'var(--text-primary)', rain: '#58a6ff', muted: 'var(--text-muted)' };
  return (
    <ol className="feed">
      {rows.map(r => (
        <li key={r.key}>
          <span className="feed-time">{timeOf(r.at)}</span>
          <span className="feed-icon" aria-hidden="true">{r.icon}</span>
          <span className="feed-text">{r.text}</span>
          {r.amount && <span className="feed-amount" style={{ color: TONE[r.tone] }}>{r.amount}</span>}
        </li>
      ))}
    </ol>
  );
}

export default memo(ActivityFeed);
