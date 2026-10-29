import { Fragment, useMemo, useState } from 'react';
import { addDays, todayString } from '../lib/dates.js';
import { money } from '../lib/lawns.js';
import { OVERTIME_AFTER, billedInWeek, buildPayroll, fmtHours, weekDates, payHistory } from '../lib/payroll.js';
import PayStub from './PayStub.jsx';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const md = d => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
const shortDate = iso => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** One day's hours: type to change; ↺ goes back to the truck's time. */
function HoursCell({ day, onSet }) {
  const [draft, setDraft] = useState(null);
  const shown = draft ?? (day.hours ? String(day.hours) : '');
  const commit = () => {
    if (draft === null) return;
    const value = draft.trim() === '' ? 0 : Number(draft);
    setDraft(null);
    if (!Number.isFinite(value)) return;
    onSet(value === day.auto ? null : value);
  };
  return (
    <td className={`pay-cell${day.edited ? ' edited' : ''}`}>
      <input
        inputMode="decimal" value={shown} placeholder="—" aria-label={`Hours ${day.date}`}
        onChange={e => setDraft(e.target.value.replace(/[^\d.]/g, ''))}
        onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setDraft(null); e.currentTarget.blur(); } }}
        onFocus={e => e.currentTarget.select()}
      />
      {day.edited && (
        <button type="button" className="pay-reset" title={`Back to truck time (${fmtHours(day.auto)} h)`} onClick={() => onSet(null)}>↺</button>
      )}
    </td>
  );
}

function RateInput({ value, onSave, label }) {
  const [draft, setDraft] = useState(null);
  const commit = () => {
    if (draft === null) return;
    const n = Number(draft);
    setDraft(null);
    if (Number.isFinite(n) && n >= 0 && n !== value) onSave(n);
  };
  return (
    <span className="pay-rate">
      $<input inputMode="decimal" aria-label={label} value={draft ?? String(value)}
        onChange={e => setDraft(e.target.value.replace(/[^\d.]/g, ''))}
        onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} onFocus={e => e.currentTarget.select()} />
    </span>
  );
}

/** Left side: who's on which crew. Add, rename, re-rate, move, remove. */
function Roster({ crews, employees, onAdd, onUpdate }) {
  const [adding, setAdding] = useState({});
  const [editingName, setEditingName] = useState(null);

  return (
    <div className="roster">
      {crews.map(crew => {
        const people = employees.filter(e => e.crewId === crew.id && e.active !== false);
        const foreman = people.find(e => e.role === 'foreman');
        const cutters = people.filter(e => e.role !== 'foreman');
        // Plow trucks: a driver plus shovelers (mowers: a foreman plus cutters).
        const plow = crew.kind === 'plow';
        const helper = plow ? 'shoveler' : 'cutter';
        const form = adding[crew.id] || { name: '', rate: '16' };
        const setForm = patch => setAdding(a => ({ ...a, [crew.id]: { ...form, ...patch } }));
        const submit = async e => {
          e.preventDefault();
          if (!form.name.trim()) return;
          await onAdd({ name: form.name.trim(), rate: Number(form.rate) || 15, crewId: crew.id, role: helper });
          setAdding(a => ({ ...a, [crew.id]: { name: '', rate: form.rate } }));
        };
        return (
          <section key={crew.id} className="roster-crew">
            <header>
              <span className="roster-badge">{crew.name.split(' ').map(n => n[0]).join('')}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="roster-crew-name">{crew.name}'s crew</div>
                <div className="roster-crew-sub">{crew.truckName || 'Truck'} · {people.length} people</div>
              </div>
            </header>
            <ul>
              {[foreman, ...cutters].filter(Boolean).map(e => (
                <li key={e.id}>
                  {editingName === e.id ? (
                    <input className="roster-name-input" defaultValue={e.name} autoFocus aria-label="Name"
                      onBlur={ev => { const v = ev.target.value.trim(); setEditingName(null); if (v && v !== e.name) onUpdate(e.id, { name: v }); }}
                      onKeyDown={ev => { if (ev.key === 'Enter') ev.currentTarget.blur(); if (ev.key === 'Escape') setEditingName(null); }} />
                  ) : (
                    <button type="button" className="roster-name" onClick={() => setEditingName(e.id)} title="Rename">
                      {e.name}{e.role === 'foreman' && <span className="role-chip">{plow ? 'Driver' : 'Foreman'}</span>}
                    </button>
                  )}
                  <RateInput value={e.rate} label={`${e.name} hourly rate`} onSave={rate => onUpdate(e.id, { rate })} />
                  <span className="roster-hr">/hr</span>
                  {e.role !== 'foreman' && (
                    <>
                      <select className="roster-move" value={e.crewId} aria-label={`Move ${e.name} to crew`} onChange={ev => onUpdate(e.id, { crewId: ev.target.value })}>
                        {crews.map(c => <option key={c.id} value={c.id}>{c.name.split(' ')[0]}</option>)}
                      </select>
                      <button type="button" className="roster-remove" aria-label={`Remove ${e.name}`} title="Remove from roster"
                        onClick={() => { if (window.confirm(`Remove ${e.name} from the roster? Past pay stays on record.`)) onUpdate(e.id, { active: false }); }}>✕</button>
                    </>
                  )}
                </li>
              ))}
            </ul>
            <form className="roster-add" onSubmit={submit}>
              <input placeholder={`Add ${helper}…`} value={form.name} onChange={e => setForm({ name: e.target.value })} aria-label={`New ${helper} for ${crew.name}`} />
              <span className="pay-rate">$<input inputMode="decimal" value={form.rate} onChange={e => setForm({ rate: e.target.value.replace(/[^\d.]/g, '') })} aria-label={`New ${helper} rate`} /></span>
              <button type="submit" className="btn-primary" disabled={!form.name.trim()}>Add</button>
            </form>
          </section>
        );
      })}
    </div>
  );
}

/** One person's pay, week by week (last 26 weeks), with a stub for each week. */
function PayHistory({ employee, data, today, onStub, onPaid }) {
  const weeks = useMemo(() => payHistory(employee, data, today), [employee, data, today]);
  const year = today.slice(0, 4);
  const ytdThrough = ws => weeks.filter(w => w.weekStart.slice(0, 4) === year && w.weekStart <= ws).reduce((s, w) => s + w.gross, 0);
  const ytd = weeks.filter(w => w.weekStart.slice(0, 4) === year).reduce((s, w) => s + w.gross, 0);
  const owed = weeks.filter(w => !w.paidAt).reduce((s, w) => s + w.gross, 0);
  const range = w => `${md(w.weekStart)} – ${md(w.weekEnd)}`;
  if (!weeks.length) return <div className="pay-history-empty">No hours on record yet.</div>;
  return (
    <div className="pay-history">
      <div className="pay-history-head">
        <b>Pay history · {employee.name}</b>
        <span>{year} to date <b>{money(ytd, true)}</b></span>
        {owed > 0 && <span style={{ color: '#f0b429' }}>Owed <b>{money(owed, true)}</b></span>}
        <span className="muted">{weeks.length} week{weeks.length === 1 ? '' : 's'} · gross, before taxes</span>
      </div>
      <table>
        <thead><tr><th className="left">Week</th><th>Hours</th><th>OT</th><th>Gross</th><th>Status</th><th /></tr></thead>
        <tbody>
          {weeks.map(w => (
            <tr key={w.weekStart}>
              <td className="left">{range(w)}</td>
              <td className="num">{fmtHours(w.total)}</td>
              <td className="num" style={{ color: w.overtime ? '#f0b429' : 'var(--text-muted)' }}>{fmtHours(w.overtime)}</td>
              <td className="num strong">{money(w.gross, true)}</td>
              <td>
                {w.paidAt
                  ? <button type="button" className="pay-paid" title="Undo paid" onClick={() => onPaid(w.weekStart, false)}>✓ Paid {shortDate(w.paidAt)}</button>
                  : <button type="button" className="pay-mark" onClick={() => onPaid(w.weekStart, true)}>Mark paid</button>}
              </td>
              <td><button type="button" className="btn-ghost pay-stub-btn" onClick={() => onStub(w, ytdThrough(w.weekStart))}>🧾 Stub</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Crew & Payroll: roster on the left, the week's timesheet + pay on the right. */
export default function PayrollView({ technicians, jobs, shifts, delays, payroll, today = todayString() }) {
  const { employees, settings, addEmployee, updateEmployee, setHours, setPaid } = payroll;
  const [anchor, setAnchor] = useState(null); // null = this week
  const [openPerson, setOpenPerson] = useState(null); // employee id whose pay history is showing
  const [stub, setStub] = useState(null); // { employee, crewName, stub, ytd }
  const week = weekDates(anchor || today);
  const weekStart = week[0];
  const isThisWeek = week.includes(today);
  const crews = technicians.filter(t => t.status !== 'pending_approval');

  const rows = useMemo(
    () => buildPayroll({ employees, week, jobs, shifts, delays, settings }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [employees, weekStart, jobs, shifts, delays, settings],
  );

  const totals = rows.reduce((t, r) => ({
    hours: t.hours + r.total, ot: t.ot + r.overtime, gross: t.gross + r.gross,
    unpaid: t.unpaid + (r.paidAt ? 0 : r.gross), days: week.map((_, i) => t.days[i] + r.days[i].hours),
  }), { hours: 0, ot: 0, gross: 0, unpaid: 0, days: week.map(() => 0) });
  const billed = billedInWeek(jobs, week);
  const laborPct = billed ? Math.round((totals.gross / billed) * 100) : null;
  const unpaidIds = rows.filter(r => !r.paidAt && r.gross > 0).map(r => r.employee.id);
  const weekLabel = `${new Date(`${week[0]}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(`${week[6]}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

  const summary = [
    { label: 'People', value: rows.length },
    { label: 'Hours', value: fmtHours(Math.round(totals.hours * 4) / 4) },
    { label: `Overtime (>${OVERTIME_AFTER}h)`, value: fmtHours(Math.round(totals.ot * 4) / 4), color: totals.ot ? '#f0b429' : undefined },
    { label: 'Gross payroll', value: money(totals.gross), color: 'var(--text-primary)' },
    { label: 'Unpaid', value: money(totals.unpaid), color: totals.unpaid ? '#f0b429' : '#3fb950' },
    { label: 'Labor vs earned', value: laborPct != null ? `${laborPct}%` : '—', sub: billed ? `of ${money(billed)}` : '' },
  ];

  return (
    <div className="payroll">
      {stub && <PayStub {...stub} onClose={() => setStub(null)} />}
      <section className="dash-panel">
        <div className="dash-panel-head">
          <span className="dash-panel-title">👷 Crews</span>
          <span className="dash-head-note">{employees.filter(e => e.active !== false).length} people</span>
        </div>
        <div className="dash-panel-body">
          <Roster crews={crews} employees={employees} onAdd={addEmployee} onUpdate={updateEmployee} />
        </div>
      </section>

      <section className="dash-panel">
        <div className="dash-panel-head">
          <span className="dash-panel-title">💵 Payroll</span>
          <div className="pay-week">
            <button type="button" className="btn-ghost" aria-label="Previous week" onClick={() => setAnchor(addDays(weekStart, -7))}>‹</button>
            <span>{isThisWeek ? 'This week · ' : ''}{weekLabel}</span>
            <button type="button" className="btn-ghost" aria-label="Next week" disabled={isThisWeek} onClick={() => setAnchor(addDays(weekStart, 7))}>›</button>
            {!isThisWeek && <button type="button" className="btn-ghost" onClick={() => setAnchor(null)}>This week</button>}
          </div>
          <button type="button" className="btn-primary" disabled={!unpaidIds.length}
            onClick={() => { if (window.confirm(`Mark ${unpaidIds.length} people paid for ${weekLabel}? (${money(totals.unpaid)})`)) setPaid(weekStart, unpaidIds, true); }}>
            ✓ Mark all paid
          </button>
        </div>

        <div className="pay-summary">
          {summary.map(s => (
            <div key={s.label}>
              <div className="pay-summary-value" style={{ color: s.color }}>{s.value}</div>
              <div className="pay-summary-label">{s.label}{s.sub ? <span> {s.sub}</span> : null}</div>
            </div>
          ))}
        </div>

        <div className="pay-table-wrap">
          <table className="pay-table">
            <thead>
              <tr>
                <th className="left">Employee</th>
                <th>Rate</th>
                {week.map((d, i) => <th key={d} className={d === today ? 'today' : undefined}>{DAY_NAMES[i]}<span>{md(d)}</span></th>)}
                <th>Hours</th>
                <th>OT</th>
                <th>Gross</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {crews.map(crew => {
                const crewRows = rows.filter(r => r.employee.crewId === crew.id)
                  .sort((a, b) => (a.employee.role === 'foreman' ? -1 : b.employee.role === 'foreman' ? 1 : a.employee.name.localeCompare(b.employee.name)));
                if (!crewRows.length) return null;
                const crewGross = crewRows.reduce((s, r) => s + r.gross, 0);
                const crewHours = crewRows.reduce((s, r) => s + r.total, 0);
                return (
                  <Fragment key={crew.id}>
                    <tr className="crew-row">
                      <td colSpan={2}>{crew.kind === 'plow' ? '❄️' : '🚜'} {crew.name}'s crew <span>· {crew.truckName || 'Truck'} · {crewRows.length}</span></td>
                      {week.map(d => <td key={d} />)}
                      <td>{fmtHours(Math.round(crewHours * 4) / 4)}</td>
                      <td />
                      <td>{money(crewGross)}</td>
                      <td />
                    </tr>
                    {crewRows.map(r => {
                      const open = openPerson === r.employee.id;
                      return (
                      <Fragment key={r.employee.id}>
                      <tr className={r.paidAt ? 'is-paid' : undefined}>
                        <td className="left">
                          <button type="button" className="pay-toggle" aria-expanded={open} onClick={() => setOpenPerson(open ? null : r.employee.id)} title="Pay history & stubs">{open ? '▾' : '▸'}</button>
                          <span className="pay-name">{r.employee.name}</span>
                          {r.employee.role === 'foreman' && <span className="role-chip">{crew.kind === 'plow' ? 'Driver' : 'Foreman'}</span>}
                        </td>
                        <td><RateInput value={r.employee.rate} label={`${r.employee.name} rate`} onSave={rate => updateEmployee(r.employee.id, { rate })} /></td>
                        {r.days.map(day => (
                          <HoursCell key={day.date} day={day} onSet={h => setHours(r.employee.id, day.date, h)} />
                        ))}
                        <td className="num strong">{fmtHours(r.total)}</td>
                        <td className="num" style={{ color: r.overtime ? '#f0b429' : 'var(--text-muted)' }}>{fmtHours(r.overtime)}</td>
                        <td className="num strong">{money(r.gross, true)}</td>
                        <td>
                          {r.paidAt ? (
                            <button type="button" className="pay-paid" title="Undo paid" onClick={() => setPaid(weekStart, [r.employee.id], false)}>✓ Paid {shortDate(r.paidAt)}</button>
                          ) : r.gross > 0 ? (
                            <button type="button" className="pay-mark" onClick={() => setPaid(weekStart, [r.employee.id], true)}>Mark paid</button>
                          ) : <span className="muted">—</span>}
                        </td>
                      </tr>
                      {open && (
                        <tr className="pay-history-row">
                          <td colSpan={week.length + 6}>
                            <PayHistory employee={r.employee} crewName={`${crew.name}'s crew`} data={{ jobs, shifts, delays, settings }} today={today}
                              onStub={(s, ytd) => setStub({ employee: r.employee, crewName: `${crew.name}'s crew`, stub: s, ytd })}
                              onPaid={(ws, paid) => setPaid(ws, [r.employee.id], paid)} />
                          </td>
                        </tr>
                      )}
                      </Fragment>
                      );
                    })}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="left" colSpan={2}>Total · {rows.length} people</td>
                {totals.days.map((h, i) => <td key={week[i]} className="num">{fmtHours(Math.round(h * 4) / 4)}</td>)}
                <td className="num">{fmtHours(Math.round(totals.hours * 4) / 4)}</td>
                <td className="num">{fmtHours(Math.round(totals.ot * 4) / 4)}</td>
                <td className="num">{money(totals.gross, true)}</td>
                <td className="num" style={{ color: totals.unpaid ? '#f0b429' : '#3fb950' }}>{totals.unpaid ? `${money(totals.unpaid)} due` : 'All paid'}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="dash-panel-foot pay-foot">
          Hours come from each truck's day (rolled out → back at shop), minus rain delays. Amber cells differ from the truck's day (owner or foreman changed them) — ↺ puts them back. Overtime after {OVERTIME_AFTER} h at 1.5×.
        </div>
      </section>
    </div>
  );
}
