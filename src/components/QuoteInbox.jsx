import { useState } from 'react';
import YardMap from './YardMap.jsx';
import { COMPANY_INFO } from '../data/services.js';
import { formatPrice, formatSqFt } from '../lib/zones.js';
import { REPEAT_OPTIONS, addDays, formatDay, todayString } from '../lib/dates.js';

const digits = phone => String(phone || '').replace(/[^\d+]/g, '');

function timeAgo(iso) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? '' : 's'} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function requestedServices(job) {
  if (job.requested?.length) return job.requested;
  return String(job.service || '').replace(/^Quote:\s*/i, '').split(',').map(s => s.trim()).filter(Boolean);
}

function AddCustomerModal({ job, foremen, onSave, onClose }) {
  const requested = requestedServices(job);
  const [price, setPrice] = useState(String(job.quote?.estimate ?? job.earnings ?? ''));
  const [date, setDate] = useState(addDays(todayString(), 1));
  const [repeatDays, setRepeatDays] = useState(requested.includes('Lawn Cutting') ? 7 : 0);
  const [techId, setTechId] = useState(foremen.length === 1 ? foremen[0].id : '');
  const [state, setState] = useState({ saving: false, error: '' });

  const save = async (e) => {
    e.preventDefault();
    if (!date || !techId) { setState({ saving: false, error: 'Pick a cut day and a foreman.' }); return; }
    setState({ saving: true, error: '' });
    try {
      await onSave({
        scheduledDate: date,
        repeatDays,
        price: Number(price) || 0,
        techId,
        service: requested.join(', ') || 'Lawn Service',
      });
    } catch (err) {
      setState({ saving: false, error: err.message || 'Could not save.' });
    }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: '#000000bb', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <form className="card" onClick={e => e.stopPropagation()} onSubmit={save}
        style={{ maxWidth: '460px', width: '100%', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '92vh', overflowY: 'auto' }}>
        <div>
          <h3 style={{ fontWeight: 700, fontSize: '19px', marginBottom: '4px' }}>Add {job.clientName.split(' ')[0]} as a customer</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{requested.join(', ')} · {job.address}</p>
        </div>

        <div>
          <label className="form-label">Price per cut</label>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>$</span>
            <input className="form-input" type="number" min="0" step="1" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} style={{ paddingLeft: '24px' }} />
          </div>
          {job.quote?.estimate != null && Number(price) !== job.quote.estimate && (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Website quoted {formatPrice(job.quote.estimate)}.{' '}
              <button type="button" onClick={() => setPrice(String(job.quote.estimate))} style={{ background: 'none', border: 'none', color: 'var(--accent-teal)', cursor: 'pointer', padding: 0, fontSize: '12px' }}>Reset</button>
            </div>
          )}
        </div>

        <div>
          <label className="form-label">First cut day</label>
          <input className="form-input" type="date" min={todayString()} value={date} onChange={e => setDate(e.target.value)} required />
          {date && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{formatDay(date)}</div>}
        </div>

        <div>
          <label className="form-label">How often</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            {REPEAT_OPTIONS.map(o => {
              const on = repeatDays === o.days;
              return (
                <button key={o.days} type="button" onClick={() => setRepeatDays(o.days)} aria-pressed={on} style={{
                  padding: '10px 6px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
                  border: `2px solid ${on ? 'var(--accent-teal)' : 'var(--border)'}`,
                  background: on ? 'var(--accent-teal)15' : 'var(--bg-elevated)',
                  color: on ? 'var(--accent-teal)' : 'var(--text-primary)',
                }}>{o.label}</button>
              );
            })}
          </div>
          {repeatDays > 0 && date && (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
              Then {formatDay(addDays(date, repeatDays))}, {formatDay(addDays(date, repeatDays * 2))}, … — the next cut schedules itself when this one is marked Cut.
            </div>
          )}
        </div>

        <div>
          <label className="form-label">Foreman</label>
          <select className="form-input" value={techId} onChange={e => setTechId(e.target.value)} required>
            <option value="">Choose a foreman…</option>
            {foremen.map(t => (
              <option key={t.id} value={t.id}>{t.name}{t.truckName ? ` · ${t.truckName}` : ''}</option>
            ))}
          </select>
        </div>

        {state.error && <div style={{ color: '#ff7b72', fontSize: '13px' }}>{state.error}</div>}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={state.saving} style={{ padding: '10px 20px' }}>
            {state.saving ? 'Saving…' : 'Add Customer & Schedule'}
          </button>
        </div>
      </form>
    </div>
  );
}

function QuoteCard({ job, onAdd, onDecline }) {
  const requested = requestedServices(job);
  const first = job.clientName.split(' ')[0];
  const smsBody = encodeURIComponent(`Hi ${first}, this is ${COMPANY_INFO.name} about your quote for ${requested.join(', ').toLowerCase() || 'lawn service'}.`);
  const quote = job.quote;
  const zones = quote?.zones?.map((z, i) => ({ ...z, id: `${job.id}-z${i}` })) || [];

  return (
    <div className="card" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '17px' }}>{job.clientName}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
            {requested.map(s => (
              <span key={s} style={{ background: 'var(--accent-teal)18', color: 'var(--accent-teal)', border: '1px solid var(--accent-teal)44', borderRadius: '12px', padding: '2px 10px', fontSize: '12px', fontWeight: 600 }}>{s}</span>
            ))}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--accent-teal)' }}>{quote ? formatPrice(quote.estimate) : '—'}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{quote ? `${formatSqFt(quote.totalSqFt)} · quoted ${timeAgo(job.createdAt)}` : `Not measured · ${timeAgo(job.createdAt)}`}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: '4px', fontSize: '13px', color: 'var(--text-muted)' }}>
        <div>📞 <a href={`tel:${digits(job.clientPhone)}`} style={{ color: 'var(--text-primary)' }}>{job.clientPhone}</a>{job.clientEmail || job.email ? <> · ✉️ <a href={`mailto:${job.clientEmail || job.email}`} style={{ color: 'var(--text-primary)' }}>{job.clientEmail || job.email}</a></> : null}</div>
        <div>📍 {job.address}</div>
        {quote?.zones?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {quote.zones.map((z, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: z.color }} />{z.name}: {formatSqFt(z.sqFt)}
              </span>
            ))}
          </div>
        )}
        {job.notes && !/^Measured |^Skipped measuring/.test(job.notes) && <div>📝 {job.notes}</div>}
        {job.notes && /Notes: /.test(job.notes) && <div>📝 {job.notes.split('Notes: ').slice(1).join('Notes: ')}</div>}
      </div>

      {zones.length > 0 ? (
        <YardMap zones={zones} readOnly height="240px" />
      ) : (
        <div style={{ padding: '18px', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: '10px', color: 'var(--text-muted)', fontSize: '13px' }}>
          Customer skipped the map — call to measure.
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <a className="btn-ghost" href={`tel:${digits(job.clientPhone)}`} style={{ textDecoration: 'none', padding: '9px 14px', fontSize: '13px' }}>📞 Call</a>
        <a className="btn-ghost" href={`sms:${digits(job.clientPhone)}?&body=${smsBody}`} style={{ textDecoration: 'none', padding: '9px 14px', fontSize: '13px' }}>💬 Text</a>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn-ghost" onClick={onDecline} style={{ padding: '9px 14px', fontSize: '13px', color: '#ff7b72' }}>Decline</button>
        <button type="button" className="btn-primary" onClick={onAdd} style={{ padding: '9px 18px', fontSize: '13px' }}>✓ Add Customer</button>
      </div>
    </div>
  );
}

/** New quotes waiting for a yes/no (part of the owner's To-Do). */
export default function QuoteInbox({ jobs, technicians, scheduleJob, declineJob }) {
  const [adding, setAdding] = useState(null);
  const [toast, setToast] = useState('');
  const quotes = jobs.filter(j => j.status === 'quote').sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const foremen = technicians.filter(t => t.status !== 'pending_approval');

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(''), 4000); };

  const handleDecline = async (job) => {
    if (!window.confirm(`Decline ${job.clientName}'s quote? It will be removed from To-Do.`)) return;
    await declineJob(job.id);
    flash(`Declined ${job.clientName}'s quote.`);
  };

  const handleSave = async (plan) => {
    const job = adding;
    await scheduleJob(job.id, plan);
    const foreman = foremen.find(t => t.id === plan.techId);
    setAdding(null);
    flash(`${job.clientName} added — first cut ${formatDay(plan.scheduledDate)} with ${foreman?.name || 'your foreman'}.`);
  };

  if (!quotes.length && !toast && !adding) return null;

  return (
    <div>
      <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>
        New Quotes · {quotes.length}
      </h3>

      {toast && (
        <div role="status" style={{ background: '#3fb95022', border: '1px solid #3fb95055', color: '#3fb950', borderRadius: '8px', padding: '10px 14px', fontSize: '14px', marginBottom: '12px' }}>
          ✓ {toast}
        </div>
      )}

      {quotes.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 440px), 1fr))', gap: '16px' }}>
          {quotes.map(job => (
            <QuoteCard key={job.id} job={job} onAdd={() => setAdding(job)} onDecline={() => handleDecline(job)} />
          ))}
        </div>
      )}

      {adding && (
        <AddCustomerModal job={adding} foremen={foremen} onSave={handleSave} onClose={() => setAdding(null)} />
      )}
    </div>
  );
}
