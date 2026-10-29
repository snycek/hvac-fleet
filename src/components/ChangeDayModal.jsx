import { useState } from 'react';
import { addDays, formatDay, todayString } from '../lib/dates.js';
import { weekdayName } from '../lib/lawns.js';
import { bestPerDay, fmtMiles } from '../lib/routeFit.js';

const street = a => String(a || '').split(',')[0];

/**
 * Move a lawn's cut: just the next one (the one after goes back to normal), or their
 * regular day from now on. Day chips show where it fits best on each day's route.
 * lawn: from lawnStats. visit: { date, techId, regularDate, regularTech }.
 * pickDate: show a date box too (live app; the demo runs on its weekly routes only).
 */
export default function ChangeDayModal({ lawn, visit, foremen, planRoutes, onSave, onClose, today = todayString(), pickDate = true }) {
  const [mode, setMode] = useState('once');
  const [options] = useState(() => (planRoutes && lawn.location?.lat
    ? planRoutes({ clientName: lawn.name, address: lawn.address, location: lawn.location }, { exclude: lawn.lawnId || lawn.key })
    : []));
  const best = options[0] || null;
  const days = bestPerDay(options);
  const [slotKey, setSlotKey] = useState(null);
  const slot = options.find(o => o.key === slotKey) || null;
  const [date, setDate] = useState('');
  const [techId, setTechId] = useState(visit.techId || foremen[0]?.id || '');
  const [state, setState] = useState({ saving: false, error: '' });

  const pickSlot = o => { setSlotKey(o.key); setDate(o.date); setTechId(o.techId); };
  const pickTech = id => {
    setTechId(id);
    const o = slot && options.find(x => x.day === slot.day && x.techId === id);
    if (o) pickSlot(o); else setSlotKey(null);
  };

  const regularDay = weekdayName(visit.regularDate || visit.date);
  const regularCrew = foremen.find(f => f.id === (visit.regularTech || visit.techId));
  const nowCrew = foremen.find(f => f.id === visit.techId);
  const newCrew = foremen.find(f => f.id === techId);
  const every = lawn.repeatDays === 14 ? 'Every other' : 'Every';
  const first = String(lawn.name || '').split(' ')[0] || 'them';

  const save = async e => {
    e.preventDefault();
    if (!date || !techId) { setState({ saving: false, error: 'Pick a day.' }); return; }
    setState({ saving: true, error: '' });
    try {
      await onSave({
        mode, scheduledDate: date, techId,
        ...(slot && slot.techId === techId ? { slot: { key: slot.key, day: slot.day, techId: slot.techId, index: slot.index } } : {}),
      });
      onClose();
    } catch (err) {
      setState({ saving: false, error: err.message || 'Could not save.' });
    }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: '#000000bb', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <form className="card move-day" onClick={e => e.stopPropagation()} onSubmit={save}
        style={{ maxWidth: '460px', width: '100%', padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '92vh', overflowY: 'auto' }}>
        <div>
          <h3 style={{ fontWeight: 700, fontSize: '19px', marginBottom: '4px' }}>📅 Change {first}&apos;s cut day</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
            {street(lawn.address)} · usually <b>{regularDay}s</b>{regularCrew ? ` with ${regularCrew.name}` : ''}
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
            Next cut: <b>{formatDay(visit.date)}</b>{nowCrew ? ` · ${nowCrew.truckName || nowCrew.name}` : ''}
            {visit.regularDate && <span className="move-tag">moved once</span>}
          </p>
        </div>

        <div className="move-mode" role="group" aria-label="What to change">
          <button type="button" aria-pressed={mode === 'once'} onClick={() => setMode('once')}>
            Just the next cut<small>then back to {regularDay}s</small>
          </button>
          <button type="button" aria-pressed={mode === 'always'} onClick={() => setMode('always')}>
            Their regular day<small>every week from now on</small>
          </button>
        </div>

        {days.length > 0 && (
          <div className="fit">
            <label className="form-label">Pick a day (where it fits on the route)</label>
            <div className="fit-days" role="group" aria-label="Day of the week">
              {days.map(o => (
                <button key={o.day} type="button" aria-pressed={slot?.day === o.day} onClick={() => pickSlot(o)} title={`Best that day: ${o.techName} · +${fmtMiles(o.cost)}`}>
                  <span>{o.key === best.key ? '⭐ ' : ''}{o.dayShort}</span>
                  <small>+{fmtMiles(o.cost)}</small>
                </button>
              ))}
            </div>
            {slot && (
              <div className={`fit-best${slot.key === best.key ? '' : ' alt'}`}>
                <div><b>{slot.key === best.key ? '⭐ Best fit: ' : ''}{slot.dayLabel} · {slot.truckName ? `${slot.truckName} · ` : ''}{slot.techName}</b></div>
                <div className="fit-sub">
                  {slot.after ? <>after <b>{street(slot.after.label)}</b></> : 'first stop out of the shop'}
                  {slot.before ? <>, before <b>{street(slot.before.label)}</b></> : ', last stop before home'}
                  {' '}· adds <b>{fmtMiles(slot.cost)}</b> of driving
                </div>
              </div>
            )}
          </div>
        )}

        {(pickDate || !days.length) && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label className="form-label">{mode === 'once' ? 'Cut on' : 'First cut on the new day'}</label>
              <input className="form-input" type="date" min={today} max={mode === 'once' ? addDays(today, 60) : undefined} value={date}
                onChange={e => { setDate(e.target.value); if (slot && e.target.value !== slot.date) setSlotKey(null); }} required />
            </div>
            <div>
              <label className="form-label">Foreman</label>
              <select className="form-input" value={techId} onChange={e => pickTech(e.target.value)}>
                {foremen.map(f => <option key={f.id} value={f.id}>{f.name}{f.truckName ? ` · ${f.truckName}` : ''}</option>)}
              </select>
            </div>
          </div>
        )}

        {date && (
          <div className="move-summary">
            {mode === 'once'
              ? <>Next cut moves to <b>{formatDay(date)}</b>{newCrew ? ` with ${newCrew.name}` : ''}. After that, back to <b>{regularDay}s</b>{regularCrew ? ` with ${regularCrew.name}` : ''}.</>
              : <>{every} <b>{weekdayName(date)}</b>{newCrew ? ` with ${newCrew.name}` : ''}, starting <b>{formatDay(date)}</b>.</>}
          </div>
        )}

        {state.error && <div style={{ color: '#ff7b72', fontSize: '13px' }}>{state.error}</div>}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={state.saving || !date}>{state.saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  );
}
