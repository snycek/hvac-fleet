import { memo } from 'react';
import { TECH_STATUS, statusOf } from '../lib/constants.js';
import { todayString } from '../lib/dates.js';
import { dayShift, hoursMins, jobDay, money, rainMinutes } from '../lib/lawns.js';

const STOP_COLORS = { completed: '#3fb950', in_progress: '#e67e22', en_route: '#9c55f7' };
const street = a => String(a || '').split(',')[0];
const timeOf = iso => (iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—');
const mins = j => (j.startedAt && j.completedAt ? (new Date(j.completedAt) - new Date(j.startedAt)) / 60000 : null);

function routeFor(tech, jobs, today, shifts, delays) {
  const stops = jobs.filter(j => j.assignedTo === tech.id && jobDay(j, today) === today && !['quote', 'declined'].includes(j.status));
  const done = stops.filter(j => j.status === 'completed');
  const timed = done.map(mins).filter(m => m != null && m >= 3 && m < 600);
  const current = stops.find(j => j.status === 'in_progress') || stops.find(j => j.status === 'en_route');
  const upNext = stops.filter(j => j.status !== 'completed' && j !== current).slice(0, 3);
  const shift = dayShift(tech.id, today, jobs, shifts);
  return {
    start: shift.start,
    end: shift.end,
    rain: rainMinutes(delays, tech.id, today, today),
    stops,
    done: done.length,
    left: stops.length - done.length,
    billed: done.reduce((s, j) => s + (j.earnings || 0), 0),
    toBill: stops.filter(j => j.status !== 'completed').reduce((s, j) => s + (j.earnings || 0), 0),
    avg: timed.length ? Math.round(timed.reduce((s, m) => s + m, 0) / timed.length) : null,
    cutting: Math.round(timed.reduce((s, m) => s + m, 0)),
    current,
    upNext,
  };
}

const Num = ({ value, label, color }) => (
  <div style={{ textAlign: 'center', minWidth: 0 }}>
    <div className="truck-num" style={{ fontWeight: 800, color: color || 'var(--text-primary)', lineHeight: 1.1 }}>{value}</div>
    <div className="truck-num-label" style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</div>
  </div>
);

function TruckCard({ tech, route, selected, onSelect }) {
  const st = statusOf(tech) || TECH_STATUS[tech.status] || { label: tech.status, color: '#8b949e' };
  const plow = tech.kind === 'plow';
  const initials = tech.name.split(' ').map(n => n[0]).join('');
  const pct = route.stops.length ? Math.round((route.done / route.stops.length) * 100) : 0;
  const now = route.current;

  return (
    <button type="button" onClick={() => onSelect(selected ? null : tech.id)} aria-pressed={selected}
      style={{
        textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '7px', padding: '9px 10px',
        background: selected ? `${st.color}14` : 'var(--bg-primary)', border: `1px solid ${selected ? st.color : 'var(--border)'}`,
        borderRadius: '10px', color: 'var(--text-primary)', minWidth: 0,
      }}>
      {/* Who + status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
        <span style={{ width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '12px', color: st.color, background: `${st.color}22`, border: `2px solid ${st.color}66` }}>{initials}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: '13.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tech.name}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{tech.truckName || 'Truck'} · Start {timeOf(route.start)} · End {route.end ? timeOf(route.end) : (route.start ? 'still out' : '—')}</div>
        </div>
        <span style={{ fontSize: '11px', fontWeight: 700, color: st.color, background: `${st.color}1f`, border: `1px solid ${st.color}55`, borderRadius: '999px', padding: '2px 8px', whiteSpace: 'nowrap' }}>{st.label}</span>
      </div>

      {/* Two numbers: lawns cut of today's total, and what's been billed (avg cut lives in Crew Report) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
        <Num value={`${route.done}/${route.left}`} label={plow ? 'Plowed/Left' : 'Cut/Left'} color={route.left ? 'var(--text-primary)' : '#3fb950'} />
        <Num value={money(route.billed)} label="Billed" color="#3fb950" />
      </div>

      {/* Progress bar + one dot per stop in route order */}
      <div>
        <div style={{ height: '6px', borderRadius: '999px', background: 'var(--bg-elevated)', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: '#3fb950', transition: 'width 0.4s' }} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginTop: '5px' }} aria-label={`${route.done} of ${route.stops.length} stops done`}>
          {route.stops.map(j => (
            <span key={j.id} title={`${street(j.address)} · ${j.clientName}`} style={{ width: '9px', height: '9px', borderRadius: '50%', background: STOP_COLORS[j.status] || 'var(--border)', outline: j === now ? '2px solid #fff' : 'none' }} />
          ))}
        </div>
      </div>

      {/* Now + up next */}
      <div style={{ fontSize: '12px', lineHeight: 1.45, minWidth: 0 }}>
        {now ? (
          <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <b style={{ color: STOP_COLORS[now.status] }}>{now.status === 'in_progress' ? (plow ? '❄️ Plowing' : '✂️ Cutting') : '🚚 Heading to'}</b>{' '}
            {street(now.address)} <span style={{ color: 'var(--text-muted)' }}>· {now.clientName} · {money(now.earnings || 0)}</span>
          </div>
        ) : (
          <div style={{ color: 'var(--text-muted)' }}>{route.left ? 'Not started' : route.stops.length ? '✅ Route done' : plow ? 'Parked · no snow' : 'No lawns today'}</div>
        )}
        {route.upNext.length > 0 && (
          <div style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Next: {route.upNext.map(j => `${street(j.address)} (${money(j.earnings || 0)})`).join(' → ')}
          </div>
        )}
        <div style={{ color: 'var(--text-muted)' }}>
          ⏱ {hoursMins(route.cutting)} {plow ? 'plowing' : 'cutting'} · {money(route.toBill)} still to {plow ? 'plow' : 'cut'}
          {route.rain > 0 && <span style={{ color: '#58a6ff', fontWeight: 600 }}> · 🌧 {hoursMins(route.rain)} rain delay</span>}
        </div>
      </div>
    </button>
  );
}

/** Today's route for every foreman: lawns left, progress, where they are, what's next. */
function TruckRoutes({ jobs, technicians, today = todayString(), selectedTechId, onSelect, shifts = [], delays = [] }) {
  const crew = technicians.filter(t => t.status !== 'pending_approval');
  // Fixed order (crew list order) so cards don't jump around while you read them.
  const rows = crew.map(t => ({ tech: t, route: routeFor(t, jobs, today, shifts, delays) }));
  return (
    <div className="dash-trucks">
      {rows.map(({ tech, route }) => (
        <TruckCard key={tech.id} tech={tech} route={route} selected={selectedTechId === tech.id} onSelect={onSelect} />
      ))}
    </div>
  );
}

export default memo(TruckRoutes);
