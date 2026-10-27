import { useState } from 'react';
import { quarter, fmtHours } from '../lib/payroll.js';

const toTimeInput = iso => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const fromTimeInput = (date, hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(`${date}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};
const clock = iso => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

/**
 * Foreman's crew hours for today: tap Rolled out / Back at yard (or type the times),
 * then send each person's hours to payroll. Everyone defaults to the truck's day.
 */
export default function CrewHoursCard({ foremanId, date, shift, crew, savedHours, onSaveShift, onSaveHours }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [entries, setEntries] = useState({}); // empId -> { worked, hours } while editing
  const [sentAt, setSentAt] = useState(null);

  const start = shift?.start || null;
  const end = shift?.end || null;
  const dayHours = start && end ? quarter((new Date(end) - new Date(start)) / 3600000) : 0;

  const entryFor = e => {
    const saved = savedHours[`${e.id}@${date}`];
    const base = entries[e.id] || { worked: saved !== 0, hours: saved ?? dayHours };
    return { worked: base.worked, hours: base.worked ? base.hours : 0 };
  };
  const setEntry = (id, patch) => setEntries(all => ({ ...all, [id]: { ...entryFor(crew.find(c => c.id === id)), ...all[id], ...patch } }));

  const stamp = async (which, iso) => {
    setBusy(which); setError('');
    try { await onSaveShift(foremanId, date, { [which]: iso }); }
    catch (err) { setError(err.message); }
    finally { setBusy(''); }
  };

  const send = async () => {
    setBusy('send'); setError('');
    try {
      for (const e of crew) {
        const { worked, hours } = entryFor(e);
        await onSaveHours(e.id, date, worked ? quarter(Number(hours) || 0) : 0);
      }
      setEntries({});
      setSentAt(new Date().toISOString());
    } catch (err) { setError(err.message); }
    finally { setBusy(''); }
  };

  const total = crew.reduce((s, e) => s + (Number(entryFor(e).hours) || 0), 0);

  return (
    <section className="card crew-hours">
      <div className="crew-hours-head">
        <h2>👷 Crew Hours</h2>
        <span>{new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
      </div>

      <div className="crew-hours-times">
        {[
          { key: 'start', label: '🚚 Rolled out', value: start, button: 'Roll out now' },
          { key: 'end', label: '🏁 Back at yard', value: end, button: 'Back at yard now', disabled: !start },
        ].map(t => (
          <div key={t.key} className="crew-time">
            <div className="crew-time-label">{t.label}</div>
            {t.value ? (
              <input type="time" value={toTimeInput(t.value)} aria-label={t.label}
                onChange={e => e.target.value && stamp(t.key, fromTimeInput(date, e.target.value))} />
            ) : (
              <button type="button" className="btn-primary" disabled={t.disabled || busy === t.key} onClick={() => stamp(t.key, new Date().toISOString())}>
                {busy === t.key ? '…' : t.button}
              </button>
            )}
          </div>
        ))}
        <div className="crew-time">
          <div className="crew-time-label">⏱ Day</div>
          <div className="crew-time-total">{dayHours ? `${fmtHours(dayHours)} h` : start ? `since ${clock(start)}` : '—'}</div>
        </div>
      </div>

      {crew.length > 0 && (
        <>
          <ul className="crew-hours-list">
            {crew.map(e => {
              const { worked, hours } = entryFor(e);
              return (
                <li key={e.id} className={worked ? undefined : 'off'}>
                  <label>
                    <input type="checkbox" checked={worked} onChange={ev => setEntry(e.id, { worked: ev.target.checked, hours: ev.target.checked ? (dayHours || hours) : 0 })} />
                    <span>{e.name}{e.role === 'foreman' ? ' (you)' : ''}</span>
                  </label>
                  <input className="crew-hours-input" inputMode="decimal" disabled={!worked} value={worked ? String(hours) : '0'} aria-label={`${e.name} hours`}
                    onChange={ev => setEntry(e.id, { hours: ev.target.value.replace(/[^\d.]/g, '') })} />
                  <span className="crew-hours-unit">h</span>
                </li>
              );
            })}
          </ul>
          <div className="crew-hours-foot">
            <span>{crew.filter(e => entryFor(e).worked).length} worked · {fmtHours(quarter(total))} h total</span>
            <button type="button" className="btn-primary" onClick={send} disabled={busy === 'send' || !start}>
              {busy === 'send' ? 'Sending…' : 'Send hours to payroll'}
            </button>
          </div>
          {sentAt && <div className="crew-hours-sent">✓ Sent {clock(sentAt)} — the owner sees these on Payroll.</div>}
        </>
      )}
      {!crew.length && <p className="crew-hours-empty">No crew on file yet — the owner adds your crew on the Crew & Payroll tab.</p>}
      {error && <div className="crew-hours-error">{error}</div>}
    </section>
  );
}
