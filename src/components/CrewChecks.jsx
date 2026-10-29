import { useState } from 'react';
import { ANSWERS, answerLabel, answeredCount } from '../lib/siteCheck.js';
import { formatDay } from '../lib/dates.js';

/** Owner's view: the questions asked at this address and what the crew said. */
export function CrewAnswers({ checks, title, techName, date }) {
  if (!checks?.length) return null;
  const done = answeredCount(checks);
  return (
    <div className={`crew-answers${done === checks.length ? ' done' : ''}`}>
      <div className="crew-answers-head">
        📋 {title || 'Crew check'}{date ? ` · ${formatDay(date)}` : ''}{techName ? ` with ${techName}` : ''} · <b>{done} of {checks.length} answered</b>
      </div>
      <ul>
        {checks.map(c => (
          <li key={c.id}>
            <span>{c.q}</span>
            {c.answer
              ? <b className={`crew-a ${c.answer}`}>{answerLabel(c.answer)}{c.note ? `: ${c.note}` : ''}</b>
              : <i className="cust-dim">waiting for the crew</i>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Foreman's view on the stop: answer each question (Yes / No / Not sure + a note). */
export function CrewQuestions({ job, onSave }) {
  const [draft, setDraft] = useState(() => Object.fromEntries((job.checks || []).map(c => [c.id, { answer: c.answer, note: c.note || '' }])));
  const [state, setState] = useState({ saving: false, msg: '' });
  const set = (id, patch) => setDraft(d => ({ ...d, [id]: { ...d[id], ...patch } }));
  const changed = (job.checks || []).some(c => draft[c.id]?.answer !== c.answer || (draft[c.id]?.note || '') !== (c.note || ''));
  const save = async e => {
    e.stopPropagation();
    setState({ saving: true, msg: '' });
    try {
      await onSave(job.id, Object.entries(draft).filter(([, v]) => v.answer).map(([id, v]) => ({ id, answer: v.answer, note: v.note })));
      setState({ saving: false, msg: '✓ Sent to the owner' });
    } catch (err) {
      setState({ saving: false, msg: err.message || 'Could not save' });
    }
  };
  if (!job.checks?.length) return null;
  return (
    <div className="crew-qs" onClick={e => e.stopPropagation()}>
      <div className="crew-qs-head">📋 The owner asked{job.service === 'Site check' ? ' (site check, no mowing)' : ''}:</div>
      {job.checks.map(c => (
        <div key={c.id} className="crew-q">
          <div className="crew-q-text">{c.q}</div>
          <div className="crew-q-btns" role="group" aria-label={c.q}>
            {ANSWERS.map(a => (
              <button key={a.id} type="button" aria-pressed={draft[c.id]?.answer === a.id} onClick={() => set(c.id, { answer: a.id })}>{a.label}</button>
            ))}
          </div>
          <input className="form-input" placeholder="Add a note (optional)" value={draft[c.id]?.note || ''} onChange={e => set(c.id, { note: e.target.value })} aria-label={`Note: ${c.q}`} />
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button type="button" className="btn-primary" onClick={save} disabled={state.saving || !changed} style={{ padding: '9px 16px' }}>{state.saving ? 'Sending…' : 'Send answers'}</button>
        {state.msg && <span className="cust-dim" style={{ fontSize: '13px' }}>{state.msg}</span>}
      </div>
    </div>
  );
}
