import { useState } from 'react';
import { addDays, formatDay, todayString } from '../lib/dates.js';
import { CHECK_SUGGESTIONS, cleanQuestions } from '../lib/siteCheck.js';
import { bestPerDay, fmtMiles } from '../lib/routeFit.js';

const street = a => String(a || '').split(',')[0];

/**
 * Questions for the crew. mode 'site': a quote — pick the day and foreman for a free
 * site-check stop (day chips show where it fits best). mode 'visit': a customer — the
 * questions ride on their next visit (nextVisit: { date, techName }).
 */
export default function AskCrewModal({ job, mode = 'site', foremen = [], planRoutes, nextVisit = null, onSend, onClose, today = todayString() }) {
  const [questions, setQuestions] = useState(['']);
  const [options] = useState(() => (mode === 'site' && planRoutes && job.location?.lat ? planRoutes(job) : []));
  const best = options[0] || null;
  const days = bestPerDay(options);
  const [slotKey, setSlotKey] = useState(best?.key || null);
  const slot = options.find(o => o.key === slotKey) || null;
  const [date, setDate] = useState(best?.date || addDays(today, 1));
  const [techId, setTechId] = useState(best?.techId || foremen[0]?.id || '');
  const [state, setState] = useState({ saving: false, error: '' });
  // People: first name. Businesses (3+ words, e.g. a church): the whole name.
  const words = String(job.clientName || '').trim().split(/\s+/);
  const who = words.length >= 3 ? words.join(' ') : words[0] || 'their';

  const setQ = (i, v) => setQuestions(qs => qs.map((q, n) => (n === i ? v : q)));
  const addQ = text => setQuestions(qs => {
    const blank = qs.findIndex(q => !q.trim());
    return blank >= 0 ? qs.map((q, n) => (n === blank ? text : q)) : [...qs, text].slice(0, 6);
  });
  const used = new Set(questions);
  const pickSlot = o => { setSlotKey(o.key); setDate(o.date); setTechId(o.techId); };
  const sendsTo = mode === 'site'
    ? "A free site-check stop goes on the foreman's route. They answer on site, and you see it on this quote."
    : nextVisit ? `Added to their next visit (${formatDay(nextVisit.date)}${nextVisit.techName ? ` with ${nextVisit.techName}` : ''}).` : 'Added to their next visit.';

  const send = async e => {
    e.preventDefault();
    const qs = cleanQuestions(questions);
    if (!qs.length) { setState({ saving: false, error: 'Add at least one question.' }); return; }
    if (mode === 'site' && (!date || !techId)) { setState({ saving: false, error: 'Pick a day and a foreman.' }); return; }
    setState({ saving: true, error: '' });
    try {
      await onSend(mode === 'site'
        ? { questions: qs, scheduledDate: date, techId, ...(slot && slot.techId === techId ? { slot: { day: slot.day, index: slot.index } } : {}) }
        : { questions: qs });
      onClose();
    } catch (err) {
      setState({ saving: false, error: err.message || 'Could not send.' });
    }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: '#000000bb', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <form className="card ask-crew" onClick={e => e.stopPropagation()} onSubmit={send}
        style={{ maxWidth: '480px', width: '100%', padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '92vh', overflowY: 'auto' }}>
        <div>
          <h3 style={{ fontWeight: 700, fontSize: '19px', marginBottom: '4px' }}>📋 Ask the crew about {who === 'their' ? 'their' : `${who}'s`} yard</h3>
          <p className="cust-dim" style={{ fontSize: '13px' }}>{street(job.address)} · {sendsTo}</p>
        </div>

        <div>
          <label className="form-label">Questions</label>
          <div className="ask-qs">
            {questions.map((q, i) => (
              <div key={i} className="ask-q">
                <input className="form-input" value={q} placeholder="e.g. Does a 36-inch mower fit through the gate?" onChange={e => setQ(i, e.target.value)} aria-label={`Question ${i + 1}`} />
                {questions.length > 1 && <button type="button" className="land-x" onClick={() => setQuestions(qs => qs.filter((_, n) => n !== i))} aria-label="Remove">✕</button>}
              </div>
            ))}
          </div>
          <div className="land-chips">
            {CHECK_SUGGESTIONS.filter(s => !used.has(s)).map(s => <button key={s} type="button" onClick={() => addQ(s)}>+ {s}</button>)}
            {questions.length < 6 && <button type="button" onClick={() => setQuestions(qs => [...qs, ''])}>+ Question</button>}
          </div>
        </div>

        {mode === 'site' && (
          <>
            {days.length > 0 && (
              <div className="fit">
                <label className="form-label">Send them on (where it fits on the route)</label>
                <div className="fit-days" role="group" aria-label="Day">
                  {days.map(o => (
                    <button key={o.day} type="button" aria-pressed={slot?.day === o.day} onClick={() => pickSlot(o)} title={`Best that day: ${o.techName} · +${fmtMiles(o.cost)}`}>
                      <span>{o.key === best.key ? '⭐ ' : ''}{o.dayShort}</span>
                      <small>+{fmtMiles(o.cost)}</small>
                    </button>
                  ))}
                </div>
                {slot && <div className="cust-dim" style={{ fontSize: '12px' }}>{slot.dayLabel} · {slot.truckName ? `${slot.truckName} · ` : ''}{slot.techName} · adds {fmtMiles(slot.cost)} of driving</div>}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label className="form-label">Day</label>
                <input className="form-input" type="date" min={today} value={date} onChange={e => { setDate(e.target.value); setSlotKey(null); }} required />
              </div>
              <div>
                <label className="form-label">Foreman</label>
                <select className="form-input" value={techId} onChange={e => { setTechId(e.target.value); setSlotKey(null); }}>
                  {foremen.map(f => <option key={f.id} value={f.id}>{f.name}{f.truckName ? ` · ${f.truckName}` : ''}</option>)}
                </select>
              </div>
            </div>
          </>
        )}

        {state.error && <div style={{ color: '#ff7b72', fontSize: '13px' }}>{state.error}</div>}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={state.saving}>{state.saving ? 'Sending…' : mode === 'site' ? '📋 Send to the crew' : '📋 Add to next visit'}</button>
        </div>
      </form>
    </div>
  );
}
