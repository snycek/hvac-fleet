import { useState } from 'react';
import { NOTE_KINDS, crewMessages, noteKind } from '../lib/crewNotes.js';

const street = a => String(a || '').split(',')[0];
const when = iso => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
};

/** Foreman, on a stop: "💬 Tell the owner" (a quick pick + a note). */
export function TellOwner({ job, by, onSend }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState('missed');
  const [text, setText] = useState('');
  const [state, setState] = useState({ saving: false, msg: '' });
  const send = async e => {
    e.stopPropagation();
    if (kind === 'other' && !text.trim()) { setState({ saving: false, msg: 'Type what happened.' }); return; }
    setState({ saving: true, msg: '' });
    try {
      await onSend(job.id, { kind, text, by });
      setState({ saving: false, msg: '✓ Sent to the owner' });
      setText('');
      setOpen(false);
    } catch (err) {
      setState({ saving: false, msg: err.message || 'Could not send' });
    }
  };
  if (!open) {
    return (
      <span onClick={e => e.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
        <button type="button" className="btn-ghost" onClick={() => setOpen(true)} style={{ padding: '12px 14px', fontSize: '14px' }}>💬 Tell the owner</button>
        {state.msg && <span className="cust-dim" style={{ fontSize: '12px' }}>{state.msg}</span>}
      </span>
    );
  }
  return (
    <div className="tell-owner" onClick={e => e.stopPropagation()}>
      <div className="crew-qs-head">💬 Tell the owner about {street(job.address)}</div>
      <div className="tell-kinds" role="group" aria-label="What's it about">
        {NOTE_KINDS.map(k => (
          <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>{k.icon} {k.label}</button>
        ))}
      </div>
      <textarea className="form-input" rows={2} value={text} onChange={e => setText(e.target.value)}
        placeholder={kind === 'missed' ? 'e.g. The strip behind the shed isn\'t on the outline, about 400 sq ft' : 'What happened?'} />
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button type="button" className="btn-primary" onClick={send} disabled={state.saving} style={{ padding: '10px 16px' }}>{state.saving ? 'Sending…' : 'Send'}</button>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)} style={{ padding: '10px 14px' }}>Cancel</button>
        {state.msg && <span style={{ fontSize: '12px', color: '#ff7b72' }}>{state.msg}</span>}
      </div>
    </div>
  );
}

/** Owner's inbox: messages from the crew, unread first. */
export function CrewMessages({ jobs, technicians = [], onRead, openCustomer, unreadOnly = false }) {
  const [showRead, setShowRead] = useState(false);
  const all = crewMessages(jobs);
  const unread = all.filter(m => !m.read);
  const read = all.filter(m => m.read);
  const name = id => technicians.find(t => t.id === id)?.name?.split(' ')[0];
  const row = m => {
    const k = noteKind(m.kind);
    return (
      <div key={`${m.jobId}-${m.id}`} className={`crew-msg${m.read ? ' read' : ''}`}>
        <div className="crew-msg-head">
          <span>{k.icon} <b>{k.label}</b></span>
          <span className="cust-dim">{when(m.at)}</span>
        </div>
        {m.text && <div className="crew-msg-text">“{m.text}”</div>}
        <div className="crew-msg-foot">
          <span className="cust-dim">{m.by || name(m.techId) || 'Crew'} · {street(m.address)} · {m.clientName}{m.service === 'Site check' ? ' · site check' : ''}</span>
          <span className="crew-msg-btns">
            {openCustomer && <button type="button" className="btn-ghost" onClick={() => openCustomer(m.key)}>Open customer</button>}
            {!m.read && onRead && <button type="button" className="btn-primary" onClick={() => onRead(m.jobId, m.id)}>✓ Got it</button>}
          </span>
        </div>
      </div>
    );
  };
  if (unreadOnly && !unread.length) return null;
  return (
    <div className="crew-msgs">
      {unreadOnly && <h3 className="crew-msgs-title">💬 From the crew · {unread.length}</h3>}
      {unread.map(row)}
      {!unreadOnly && !unread.length && <div className="cust-empty">✓ No new messages. When a foreman taps 💬 Tell the owner on a stop, it shows up here.</div>}
      {!unreadOnly && read.length > 0 && (
        <>
          <button type="button" className="btn-ghost" onClick={() => setShowRead(s => !s)} style={{ padding: '5px 10px', fontSize: '12px', alignSelf: 'flex-start' }}>
            {showRead ? 'Hide' : 'Show'} earlier messages ({read.length})
          </button>
          {showRead && read.map(row)}
        </>
      )}
    </div>
  );
}
