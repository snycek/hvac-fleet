import { Fragment, memo, useState } from 'react';
import PeriodPicker from './PeriodPicker.jsx';
import CollapseButton from './CollapseButton.jsx';
import { formatDay, todayString } from '../lib/dates.js';
import { WEEKDAYS, averageClock, dayOf, dayShift, effectiveAnchor, hoursMins, money, periodRange, rainMinutes, weekdayIndex } from '../lib/lawns.js';

const th = { padding: '7px 8px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '12px', whiteSpace: 'nowrap' };
const td = { padding: '6px 8px', whiteSpace: 'nowrap' };
const BAR = '#4ade80'; // single series: one hue, no legend

const minutes = j => (j.startedAt && j.completedAt ? Math.round((new Date(j.completedAt) - new Date(j.startedAt)) / 60000) : null);
const timeOf = iso => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

// Lawns cut per weekday (Mon–Sun) for the chosen week or month.
function WeekdayBars({ cuts, compact }) {
  const [hover, setHover] = useState(null);
  const days = WEEKDAYS.map((label, i) => {
    const mine = cuts.filter(j => weekdayIndex(dayOf(j.completedAt)) === i);
    return { label, lawns: mine.length, billed: mine.reduce((s, j) => s + (j.earnings || 0), 0) };
  });
  const max = Math.max(1, ...days.map(d => d.lawns));
  // Every weekday tied for the most lawns (e.g. "Mon, Tue").
  const busiest = max > 0 && days.some(d => d.lawns) ? days.filter(d => d.lawns === max).map(d => d.label).join(', ') : '';
  const PLOT = compact ? 46 : 90;

  return (
    <div style={{ marginTop: compact ? '10px' : '18px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 700 }}>By weekday</h3>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>lawns cut{busiest ? ` · busiest: ${busiest}` : ''}</span>
      </div>
      <div role="table" aria-label="Lawns cut by weekday" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '6px' }}>
        {days.map((d, i) => {
          const h = d.lawns ? Math.max(4, Math.round((d.lawns / max) * PLOT)) : 0;
          return (
            <div key={d.label} role="row" style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0}
              aria-label={`${d.label}: ${d.lawns} lawns, ${money(d.billed)} earned`}>
              {/* Hover target is the whole column, bigger than the bar */}
              <div style={{ height: `${PLOT}px`, width: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', borderBottom: '1px solid var(--border)' }}>
                <div style={{
                  width: 'min(28px, 70%)', height: `${h}px`, background: BAR, borderRadius: '4px 4px 0 0',
                  opacity: hover == null || hover === i ? 1 : 0.45, transition: 'opacity 0.15s',
                }} />
              </div>
              <div role="cell" style={{ fontSize: '12px', fontWeight: 600, marginTop: '4px', color: 'var(--text-muted)' }}>{d.label}</div>
              <div role="cell" style={{ fontSize: compact ? '12px' : '14px', fontWeight: 700 }}>{d.lawns}</div>
              <div role="cell" style={{ fontSize: compact ? '10px' : '11px', color: 'var(--text-muted)' }}>{d.billed ? money(d.billed) : '—'}</div>
              {hover === i && (
                <div role="tooltip" style={{
                  position: 'absolute', bottom: `${h + 52}px`, left: '50%', transform: 'translateX(-50%)', zIndex: 5,
                  background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '6px',
                  padding: '6px 9px', fontSize: '12px', whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(0,0,0,0.4)', pointerEvents: 'none',
                }}>
                  <b>{d.label}</b> · {d.lawns} lawn{d.lawns === 1 ? '' : 's'} · {money(d.billed)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Who cut what: per foreman, for a day, week, or month. Numbers first. */
function CrewReport({ jobs, technicians, today = todayString(), compact = false, collapsed = false, onToggleCollapse, shifts = [], delays = [] }) {
  const [period, setPeriod] = useState({ mode: 'day', anchor: today, pinned: false });
  const [open, setOpen] = useState(null);
  const { mode } = period;
  const range = periodRange(mode, effectiveAnchor(period, today));

  const cuts = jobs
    .filter(j => j.status === 'completed' && j.completedAt)
    .filter(j => { const d = dayOf(j.completedAt); return d >= range.from && d <= range.to; })
    .sort((a, b) => String(a.completedAt).localeCompare(String(b.completedAt)));

  const rows = technicians
    .map(t => {
      const mine = cuts.filter(j => j.assignedTo === t.id);
      const timed = mine.map(minutes).filter(m => m != null && m >= 3 && m < 600);
      // Start/end of each day they worked in the period (Day view: that day; else the average).
      const days = [...new Set(mine.map(j => dayOf(j.completedAt)))];
      const dayTimes = days.map(d => dayShift(t.id, d, jobs, shifts));
      return {
        tech: t,
        start: averageClock(dayTimes.map(s => s.start)),
        end: averageClock(dayTimes.map(s => s.end)),
        rain: rainMinutes(delays, t.id, range.from, range.to),
        cuts: mine,
        billed: mine.reduce((s, j) => s + (j.earnings || 0), 0),
        avg: timed.length ? Math.round(timed.reduce((s, m) => s + m, 0) / timed.length) : null,
        mins: timed.reduce((s, m) => s + m, 0),
      };
    })
    .filter(r => r.cuts.length)
    .sort((a, b) => b.cuts.length - a.cuts.length);

  const totalBilled = cuts.reduce((s, j) => s + (j.earnings || 0), 0);

  return (
    <section className={compact ? `dash-panel${collapsed ? ' collapsed' : ''}` : 'card'} style={compact ? undefined : { padding: '18px', marginBottom: '28px' }}>
      <div className={compact ? 'dash-panel-head' : undefined} style={compact ? undefined : { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        {compact && onToggleCollapse && <CollapseButton collapsed={collapsed} onToggle={onToggleCollapse} label="Crew Report" />}
        <h2 className={compact ? 'dash-panel-title' : undefined} style={compact ? undefined : { fontSize: '18px', fontWeight: 700, marginRight: 'auto' }}>🚜 Crew Report</h2>
        {!collapsed && <PeriodPicker value={period} onChange={p => { setPeriod(p); setOpen(null); }} today={today} compact={compact} />}
      </div>

      {!collapsed && <div className={compact ? 'dash-panel-body' : undefined}>
      <div style={{ display: 'flex', gap: compact ? '10px' : '16px', fontSize: compact ? '12px' : '13px', color: 'var(--text-muted)', marginBottom: compact ? '6px' : '10px', flexWrap: 'wrap' }}>
        <span>✂️ <b style={{ color: 'var(--text-primary)' }}>{cuts.length}</b> lawns</span>
        <span>🚜 <b style={{ color: 'var(--text-primary)' }}>{rows.length}</b> foremen</span>
        <span>💲 <b style={{ color: 'var(--text-primary)' }}>{money(totalBilled)}</b> earned</span>
        {rainMinutes(delays, null, range.from, range.to) > 0 && (
          <span style={{ color: '#58a6ff' }}>🌧 <b>{hoursMins(rainMinutes(delays, null, range.from, range.to))}</b> rain</span>
        )}
      </div>

      {rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '18px', color: 'var(--text-muted)', fontSize: '13px' }}>No lawns cut in this {mode}</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: compact ? '12px' : '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Foreman', 'Lawns', 'Avg', 'Time', mode === 'day' ? 'Start' : 'Avg start', mode === 'day' ? 'End' : 'Avg end', '🌧 Rain', 'Earned'].map(h => <th key={h} style={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const isOpen = open === r.tech.id;
                return (
                  <Fragment key={r.tech.id}>
                    <tr onClick={() => setOpen(isOpen ? null : r.tech.id)} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', background: isOpen ? 'var(--bg-elevated)' : 'transparent' }}>
                      <td style={{ ...td, fontWeight: 600 }}>{isOpen ? '▾' : '▸'} {r.tech.name}</td>
                      <td style={{ ...td, fontWeight: 700, fontSize: '15px' }}>{r.cuts.length}</td>
                      <td style={td}>{r.avg != null ? `${r.avg}m` : '—'}</td>
                      <td style={td}>{r.mins ? hoursMins(r.mins) : '—'}</td>
                      <td style={td}>{r.start || '—'}</td>
                      <td style={td}>{r.end || (mode === 'day' && r.start ? 'out' : '—')}</td>
                      <td style={{ ...td, color: r.rain ? '#58a6ff' : 'var(--text-muted)' }}>{r.rain ? hoursMins(r.rain) : '—'}</td>
                      <td style={{ ...td, color: 'var(--accent-teal)', fontWeight: 600 }}>{money(r.billed)}</td>
                    </tr>
                    {isOpen && r.cuts.map(j => (
                      <tr key={j.id} style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)', fontSize: '12px' }}>
                        <td style={{ ...td, paddingLeft: '28px', color: 'var(--text-muted)' }}>
                          {mode === 'day' ? timeOf(j.completedAt) : `${formatDay(dayOf(j.completedAt))} ${timeOf(j.completedAt)}`}
                        </td>
                        <td colSpan={5} style={{ ...td, whiteSpace: 'normal' }}>
                          <b>{String(j.address || '').split(',')[0]}</b>
                          <span style={{ color: 'var(--text-muted)' }}> · {j.clientName}</span>
                        </td>
                        <td style={td}>{minutes(j) != null ? `${minutes(j)}m` : '—'}</td>
                        <td style={td}>{money(j.earnings || 0)}</td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {mode !== 'day' && <WeekdayBars cuts={cuts} compact={compact} />}
      </div>}
    </section>
  );
}

export default memo(CrewReport);
