import { useState } from 'react';
import { COMPANY_INFO } from '../data/services.js';
import { addDays, formatDay, todayString } from '../lib/dates.js';
import { ITEM_SUGGESTIONS, cleanItems, offerTotal, quoteMessage } from '../lib/landscape.js';

const usd = n => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

/**
 * Price a landscaping request and send it to the customer: line items, a start date,
 * the crew, a note. They get it by email (text if there's no email) with a link to
 * accept or decline. job.offer (resending) fills it in.
 */
export default function LandscapeQuoteModal({ job, crews, onSend, onClose, today = todayString() }) {
  const prev = job.offer;
  const [items, setItems] = useState(() => (prev?.items?.length ? prev.items.map(i => ({ label: i.label, amount: String(i.amount) })) : [{ label: '', amount: '' }]));
  const [note, setNote] = useState(prev?.note || '');
  const [startDate, setStartDate] = useState(prev?.startDate && prev.startDate >= today ? prev.startDate : addDays(today, 7));
  const [techId, setTechId] = useState(prev?.techId || crews[0]?.id || '');
  const email = job.clientEmail || job.email || '';
  const [channel, setChannel] = useState(email ? 'email' : 'text');
  const [state, setState] = useState({ saving: false, error: '' });

  const total = offerTotal(items);
  const first = String(job.clientName || '').split(' ')[0];
  const setItem = (i, patch) => setItems(list => list.map((x, n) => (n === i ? { ...x, ...patch } : x)));
  const addItem = label => setItems(list => {
    const blank = list.findIndex(x => !x.label && !x.amount);
    return blank >= 0 ? list.map((x, n) => (n === blank ? { ...x, label } : x)) : [...list, { label, amount: '' }];
  });
  const used = new Set(items.map(i => i.label));
  const preview = quoteMessage(job, { total, startDate }, COMPANY_INFO.name).replace('{quoteLink}', '🔗 (their quote link)');

  const send = async e => {
    e.preventDefault();
    if (!cleanItems(items).length) { setState({ saving: false, error: 'Add at least one line with a price.' }); return; }
    setState({ saving: true, error: '' });
    try {
      await onSend({ items: cleanItems(items), note: note.trim(), startDate, techId, channel });
      onClose();
    } catch (err) {
      setState({ saving: false, error: err.message || 'Could not send.' });
    }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: '#000000bb', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <form className="card land-quote" onClick={e => e.stopPropagation()} onSubmit={send}
        style={{ maxWidth: '500px', width: '100%', padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '92vh', overflowY: 'auto' }}>
        <div>
          <h3 style={{ fontWeight: 700, fontSize: '19px', marginBottom: '4px' }}>🌳 Landscaping quote for {first}</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{job.address}</p>
          {job.notes && <p style={{ fontSize: '13px', marginTop: '6px' }}>📝 {String(job.notes).replace(/^.*Notes: /s, '')}</p>}
        </div>

        <div>
          <label className="form-label">What's in it</label>
          <div className="land-items">
            {items.map((it, i) => (
              <div key={i} className="land-item">
                <input className="form-input" placeholder="e.g. Mulch, 6 yards" value={it.label} onChange={e => setItem(i, { label: e.target.value })} aria-label={`Line ${i + 1}`} />
                <span className="land-amt">
                  <span>$</span>
                  <input className="form-input" inputMode="decimal" placeholder="0" value={it.amount} onChange={e => setItem(i, { amount: e.target.value.replace(/[^\d.]/g, '') })} aria-label={`Line ${i + 1} price`} />
                </span>
                {items.length > 1 && <button type="button" className="land-x" onClick={() => setItems(list => list.filter((_, n) => n !== i))} aria-label={`Remove line ${i + 1}`}>✕</button>}
              </div>
            ))}
          </div>
          <div className="land-chips">
            {ITEM_SUGGESTIONS.filter(s => !used.has(s)).map(s => <button key={s} type="button" onClick={() => addItem(s)}>+ {s}</button>)}
            <button type="button" onClick={() => setItems(list => [...list, { label: '', amount: '' }])}>+ Line</button>
          </div>
          <div className="land-total"><span>Total</span><b>{usd(total)}</b></div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <label className="form-label">Can start</label>
            <input className="form-input" type="date" min={today} value={startDate} onChange={e => setStartDate(e.target.value)} required />
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px' }}>{formatDay(startDate)}</div>
          </div>
          <div>
            <label className="form-label">Crew</label>
            <select className="form-input" value={techId} onChange={e => setTechId(e.target.value)}>
              {crews.map(t => <option key={t.id} value={t.id}>{t.name}{t.truckName ? ` · ${t.truckName}` : ''}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="form-label">Note to {first} (optional)</label>
          <textarea className="form-input" rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Price includes edging and hauling the old shrubs away." />
        </div>

        <div className="notify-arrival">
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <b>Send by</b>
            <span className="seg-mini" role="group" aria-label="Send by">
              <button type="button" aria-pressed={channel === 'email'} disabled={!email} onClick={() => setChannel('email')} title={email || 'No email on file'}>✉️ Email</button>
              <button type="button" aria-pressed={channel === 'text'} disabled={!job.clientPhone} onClick={() => setChannel('text')}>💬 Text</button>
            </span>
            <span className="cust-dim" style={{ fontSize: '12px' }}>{channel === 'email' ? email : job.clientPhone}</span>
          </div>
          <div className="notify-preview">“{preview}”</div>
          <div className="cust-dim" style={{ fontSize: '12px' }}>The link shows every line and the total, with <b>Accept</b> and <b>Decline</b> buttons. Accepted → it's on the crew's schedule for {formatDay(startDate)}.</div>
        </div>

        {state.error && <div style={{ color: '#ff7b72', fontSize: '13px' }}>{state.error}</div>}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary land-send" disabled={state.saving || total <= 0}>{state.saving ? 'Sending…' : `Send quote · ${usd(total)}`}</button>
        </div>
      </form>
    </div>
  );
}
