import { useState } from 'react';
import YardMap from './YardMap.jsx';
import { COMPANY_INFO } from '../data/services.js';
import { addressFor, remindBy } from '../lib/billing.js';
import { arrivalMessage } from '../lib/notify.js';
import { formatPrice, formatSqFt } from '../lib/zones.js';
import { REPEAT_OPTIONS, addDays, formatDay, todayString } from '../lib/dates.js';
import { bestPerDay, fmtMiles } from '../lib/routeFit.js';
import { crewKind, isLandscapingJob, wantsLandscaping } from '../lib/crews.js';
import LandscapeQuoteModal from './LandscapeQuoteModal.jsx';
import { directionsLinks, driveEstimate, fmtDrive, metersBetween, nearestTruck } from '../lib/distance.js';

// How far the address is: nearest truck out now (for landscaping, the nearest landscaping
// crew too) and the shop. Plus Waze / Google Maps and "Show on map".
function QuoteDistance({ job, trucks, shop, onShowOnMap }) {
  const spot = job.location;
  const near = nearestTruck(spot, trucks);
  const land = isLandscapingJob(job) || wantsLandscaping(job) ? nearestTruck(spot, trucks, 'landscape') : null;
  const fromShop = shop && spot?.lat ? driveEstimate(metersBetween(shop, spot)) : null;
  const go = directionsLinks(spot, job.address);
  const first = t => String(t.name || '').split(' ')[0];
  return (
    <div className="quote-dist">
      <div className="quote-dist-lines">
        {near && <span>🚚 <b>{fmtDrive(near)}</b> from {first(near.tech)}{near.tech.truckName ? ` (${near.tech.truckName})` : ''}</span>}
        {land && land.tech.id !== near?.tech.id && <span>🌳 <b>{fmtDrive(land)}</b> from {first(land.tech)}'s landscaping crew</span>}
        {fromShop && <span>🏠 <b>{fmtDrive(fromShop)}</b> from the yard</span>}
        {!near && !fromShop && <span className="cust-dim">No trucks out right now.</span>}
      </div>
      <div className="quote-dist-go">
        <a className="btn-ghost" href={go.waze} target="_blank" rel="noreferrer">🧭 Waze</a>
        <a className="btn-ghost" href={go.google} target="_blank" rel="noreferrer">Google Maps</a>
        {onShowOnMap && spot?.lat && <button type="button" className="btn-ghost quote-on-map" onClick={() => onShowOnMap(job)}>📍 Show on map</button>}
      </div>
    </div>
  );
}

const street = a => String(a || '').split(',')[0];

const digits = phone => String(phone || '').replace(/[^\d+]/g, '');

// now: the demo passes its own clock so ages match its calendar.
function timeAgo(iso, now = Date.now()) {
  const mins = Math.round((now - new Date(iso).getTime()) / 60000);
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

const isSnow = job => requestedServices(job).includes('Snow Removal');
// Snow jobs go to plow drivers; mowing etc. to lawn foremen (landscaping is priced separately).
const crewFor = (job, techs) => techs.filter(t => crewKind(t) === (isSnow(job) ? 'plow' : 'lawn'));
const usd = n => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

function AddCustomerModal({ job, foremen: allForemen, onSave, onClose, planRoutes, today = todayString() }) {
  const requested = requestedServices(job);
  const snow = isSnow(job);
  const foremen = crewFor(job, allForemen).length ? crewFor(job, allForemen) : allForemen;
  // Route options for this address, cheapest first (lawn quotes only).
  const [options] = useState(() => (!snow && planRoutes && job.location ? planRoutes(job) : []));
  const best = options[0] || null;
  const [slotKey, setSlotKey] = useState(best?.key || null);
  const slot = options.find(o => o.key === slotKey) || null;
  const days = bestPerDay(options);
  const [price, setPrice] = useState(String(job.quote?.estimate ?? job.earnings ?? ''));
  const [date, setDate] = useState(best?.date || addDays(today, 1));
  // Snow: dispatched every time it snows, not on a fixed repeat.
  const [repeatDays, setRepeatDays] = useState(requested.includes('Lawn Cutting') && !snow ? 7 : 0);
  // Text/email them when the crew heads to their lawn (right after the stop before).
  const [notifyArrival, setNotifyArrival] = useState(false);
  const notifyBy = remindBy(job);
  const [techId, setTechId] = useState(best?.techId || (foremen.length === 1 ? foremen[0].id : ''));
  const pickSlot = o => { setSlotKey(o.key); setDate(o.date); setTechId(o.techId); };
  // Picking a foreman keeps the day and moves to that foreman's best spot that day.
  const pickTech = id => {
    setTechId(id);
    const o = slot && options.find(x => x.day === slot.day && x.techId === id);
    if (o) pickSlot(o); else setSlotKey(null);
  };
  const [state, setState] = useState({ saving: false, error: '' });

  const save = async (e) => {
    e.preventDefault();
    if (!date || !techId) { setState({ saving: false, error: snow ? 'Pick a start date and a plow driver.' : 'Pick a cut day and a foreman.' }); return; }
    if (snow && !(Number(price) > 0)) { setState({ saving: false, error: 'Enter your price per push.' }); return; }
    setState({ saving: true, error: '' });
    try {
      await onSave({
        scheduledDate: date,
        repeatDays: snow ? 0 : repeatDays,
        ...(snow ? { perSnowfall: true } : {}),
        price: Number(price) || 0,
        techId,
        service: requested.join(', ') || 'Lawn Service',
        notifyArrival,
        ...(slot && slot.techId === techId ? { slot: { key: slot.key, day: slot.day, techId: slot.techId, index: slot.index } } : {}),
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
          <label className="form-label">{snow ? 'Price per push' : 'Price per cut'}</label>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>$</span>
            <input className="form-input" type="number" min="0" step="1" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} style={{ paddingLeft: '24px' }} />
          </div>
          {snow && job.quote?.totalSqFt > 0 && (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
              They outlined {formatSqFt(job.quote.totalSqFt)} to plow.
            </div>
          )}
          {job.quote?.estimate != null && Number(price) !== job.quote.estimate && (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Website quoted {formatPrice(job.quote.estimate)}.{' '}
              <button type="button" onClick={() => setPrice(String(job.quote.estimate))} style={{ background: 'none', border: 'none', color: 'var(--accent-teal)', cursor: 'pointer', padding: 0, fontSize: '12px' }}>Reset</button>
            </div>
          )}
        </div>

        {options.length > 0 && (
          <div className="fit">
            <label className="form-label">Where it fits on the route</label>
            {slot && (
              <div className={`fit-best${slot.key === best.key ? '' : ' alt'}`}>
                <div><b>{slot.key === best.key ? '⭐ Best fit: ' : 'Your pick: '}{slot.dayLabel} · {slot.truckName ? `${slot.truckName} · ` : ''}{slot.techName}</b></div>
                <div className="fit-sub">
                  {slot.after ? <>after <b>{street(slot.after.label)}</b></> : 'first stop out of the shop'}
                  {slot.before ? <>, before <b>{street(slot.before.label)}</b></> : ', last stop before home'}
                  {' '}· stop {slot.index + 1} of {slot.stopsCount + 1} · adds <b>{fmtMiles(slot.cost)}</b> of driving
                </div>
              </div>
            )}
            <div className="fit-days" role="group" aria-label="Day of the week">
              {days.map(o => (
                <button key={o.day} type="button" aria-pressed={slot?.day === o.day} onClick={() => pickSlot(o)} title={`Best that day: ${o.techName} · +${fmtMiles(o.cost)}`}>
                  <span>{o.key === best.key ? '⭐ ' : ''}{o.dayShort}</span>
                  <small>+{fmtMiles(o.cost)}</small>
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="form-label">{snow ? 'Plow from' : 'First cut day'}</label>
          <input className="form-input" type="date" min={today} value={date} onChange={e => { setDate(e.target.value); if (slot && e.target.value !== slot.date) setSlotKey(null); }} required />
          {date && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{formatDay(date)}</div>}
        </div>

        {snow ? (
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', background: 'var(--bg-elevated)', borderRadius: '8px', padding: '10px 12px' }}>
            ❄️ <b style={{ color: 'var(--text-primary)' }}>Every snowfall</b> — they go on the plow route and get pushed each time it snows.
          </div>
        ) : (
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
        )}

        <div>
          <label className="form-label">{snow ? 'Plow driver' : 'Foreman'}</label>
          <select className="form-input" value={techId} onChange={e => pickTech(e.target.value)} required>
            <option value="">{snow ? 'Choose a plow…' : 'Choose a foreman…'}</option>
            {foremen.map(t => {
              const o = slot && options.find(x => x.day === slot.day && x.techId === t.id);
              return <option key={t.id} value={t.id}>{t.name}{t.truckName ? ` · ${t.truckName}` : ''}{o ? ` — +${fmtMiles(o.cost)}` : ''}</option>;
            })}
          </select>
        </div>

        <div className="notify-arrival">
          <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', cursor: notifyBy ? 'pointer' : 'not-allowed' }}>
            <input type="checkbox" checked={notifyArrival} disabled={!notifyBy} onChange={e => setNotifyArrival(e.target.checked)} style={{ marginTop: '3px' }} />
            <span>
              <b>📲 Text before arrival</b>
              <span className="cust-dim" style={{ display: 'block', fontSize: '12px' }}>
                {notifyBy ? `Sent by ${notifyBy} to ${addressFor(job, notifyBy)} when the crew finishes the lawn before theirs.` : 'No phone or email on file.'}
              </span>
            </span>
          </label>
          {notifyArrival && <div className="notify-preview">“{arrivalMessage({ ...job, perSnowfall: snow }, COMPANY_INFO.name)}”</div>}
        </div>
        {state.error && <div style={{ color: '#ff7b72', fontSize: '13px' }}>{state.error}</div>}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary quote-approve" disabled={state.saving} style={{ padding: '10px 20px' }}>
            {state.saving ? 'Saving…' : 'Add Customer & Schedule'}
          </button>
        </div>
      </form>
    </div>
  );
}

function QuoteCard({ job, onAdd, onDecline, onPriceLand, now, trucks, shop, onShowOnMap }) {
  const requested = requestedServices(job);
  // Landscaping: John prices it and it goes back to the customer to accept.
  const land = wantsLandscaping(job);
  const landOnly = isLandscapingJob(job);
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
          <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--accent-teal)' }}>{landOnly ? '🌳 You price it' : quote ? (quote.estimate == null ? '❄️ You price it' : formatPrice(quote.estimate)) : '—'}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{quote ? `${formatSqFt(quote.totalSqFt)} · quoted ${timeAgo(job.createdAt, now)}` : `Not measured · ${timeAgo(job.createdAt, now)}`}</div>
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

      <QuoteDistance job={job} trucks={trucks} shop={shop} onShowOnMap={onShowOnMap} />

      {zones.length > 0 ? (
        <div className="quote-yard"><YardMap zones={zones} readOnly height="240px" /></div>
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
        {land && (
          <button type="button" className={`${landOnly ? 'btn-primary' : 'btn-ghost'} land-price`} onClick={onPriceLand} style={{ padding: '9px 16px', fontSize: '13px' }}
            title="Price the landscaping and send it to them to accept">🌳 Price & send quote</button>
        )}
        {!landOnly && <button type="button" className="btn-primary quote-add" onClick={onAdd} style={{ padding: '9px 18px', fontSize: '13px' }} title={land ? `Add them for ${requested.filter(s => !/^landscaping/i.test(s)).join(', ')}` : undefined}>✓ Add Customer</button>}
      </div>
    </div>
  );
}

/** New quotes waiting for a yes/no (part of the owner's To-Do). */
// trucks: with live locations (for "how far"). shop: { lat, lng } or null. onShowOnMap(job).
export default function QuoteInbox({ jobs, technicians, scheduleJob, declineJob, planRoutes, today, sendLandscapeQuote, acceptLandscapeQuote, trucks = technicians, shop = null, onShowOnMap = null }) {
  const [adding, setAdding] = useState(null);
  const [pricing, setPricing] = useState(null); // landscaping request being priced
  const sent = jobs.filter(j => j.status === 'quote_sent').sort((a, b) => String(b.offer?.sentAt).localeCompare(String(a.offer?.sentAt)));
  const landCrews = technicians.filter(t => crewKind(t) === 'landscape' && t.status !== 'pending_approval');
  const [toast, setToast] = useState('');
  const quotes = jobs.filter(j => j.status === 'quote').sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const foremen = technicians.filter(t => t.status !== 'pending_approval');
  // "Now" on the hub's calendar (the demo runs on its own dates).
  const [clock] = useState(() => new Date());
  const now = today ? new Date(`${today}T${clock.toTimeString().slice(0, 8)}`).getTime() : clock.getTime();

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
    flash(`${job.clientName} added — first cut ${formatDay(plan.scheduledDate)} with ${foreman?.name || 'your foreman'}${plan.slot ? ', slotted into the route' : ''}.`);
  };

  const handleSendLand = async plan => {
    const job = pricing;
    await sendLandscapeQuote(job.id, plan);
    flash(`Quote sent to ${job.clientName} by ${plan.channel === 'email' ? 'email' : 'text'} · ${usd(plan.items.reduce((s, i) => s + i.amount, 0))}. You'll see it here until they answer.`);
  };
  const handleAccepted = async job => {
    if (!window.confirm(`Mark ${job.clientName}'s quote accepted? It goes on the landscaping schedule for ${formatDay(job.offer?.startDate)}.`)) return;
    await acceptLandscapeQuote(job.id);
    flash(`${job.clientName} accepted · on the schedule ${formatDay(job.offer?.startDate)}.`);
  };
  const handleWithdraw = async job => {
    if (!window.confirm(`Withdraw ${job.clientName}'s quote? Their link will say it's no longer available.`)) return;
    await declineJob(job.id);
    flash(`Withdrew ${job.clientName}'s quote.`);
  };

  if (!quotes.length && !sent.length && !toast && !adding && !pricing) return null;

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
            <QuoteCard key={job.id} job={job} now={now} onAdd={() => setAdding(job)} onDecline={() => handleDecline(job)} onPriceLand={() => setPricing(job)} trucks={trucks} shop={shop} onShowOnMap={onShowOnMap} />
          ))}
        </div>
      )}

      {sent.length > 0 && (
        <div className="quotes-sent">
          <h3>🌳 Quotes sent · waiting on the customer · {sent.length}</h3>
          {sent.map(job => (
            <div key={job.id} className="quote-sent-row">
              <div style={{ minWidth: 0, flex: '1 1 200px' }}>
                <div><b>{job.clientName}</b> · {String(job.address || '').split(',')[0]}</div>
                <div className="cust-dim" style={{ fontSize: '12px' }}>
                  {(job.offer?.items || []).map(i => i.label).join(', ')} · sent by {job.offer?.channel === 'email' ? 'email' : 'text'} {timeAgo(job.offer?.sentAt, now)} · start {formatDay(job.offer?.startDate)}
                </div>
              </div>
              <b className="quote-sent-amt">{usd(job.offer?.total)}</b>
              <div className="quote-sent-actions">
                <button type="button" className="btn-ghost" onClick={() => handleAccepted(job)} title="They said yes on the phone">✓ They said yes</button>
                <button type="button" className="btn-ghost" onClick={() => setPricing(job)}>Edit & resend</button>
                <button type="button" className="btn-ghost" onClick={() => handleWithdraw(job)} style={{ color: '#ff7b72' }}>Withdraw</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {pricing && (
        <LandscapeQuoteModal job={pricing} crews={landCrews} onSend={handleSendLand} onClose={() => setPricing(null)} today={today} />
      )}

      {adding && (
        <AddCustomerModal job={adding} foremen={foremen} onSave={handleSave} onClose={() => setAdding(null)} planRoutes={planRoutes} today={today} />
      )}
    </div>
  );
}
