import { useState } from 'react';
import YardMap from '../components/YardMap.jsx';
import AddressInput from '../components/AddressInput.jsx';
import { COMPANY_INFO } from '../data/services.js';
import { DEFAULT_CENTER, ZONE_NAME_SUGGESTIONS, areaSqFt, estimatePrice, formatPrice, formatSqFt, geocode } from '../lib/zones.js';

// What customers can ask for. id matches the service page id, so a service
// page's "Request a Quote" button can preselect it.
const WANTED_SERVICES = [
  { id: 'lawn-cutting', name: 'Lawn Cutting', icon: '🌱' },
  { id: 'leaf-removal', name: 'Leaf Removal', icon: '🍂' },
  { id: 'landscaping-quote', name: 'Landscaping', icon: '🌳' },
];

const EMPTY_FORM = { name: '', phone: '', email: '', address: '', city: '', zip: '' };

export default function QuoteTool({ setPage, initialServiceId }) {
  const [step, setStep] = useState('details'); // details | map | sent
  const [form, setForm] = useState(EMPTY_FORM);
  const [center, setCenter] = useState(null);
  // Address chosen from the suggestions (has coordinates). Cleared if they keep typing.
  const [picked, setPicked] = useState(null);
  const [lookup, setLookup] = useState({ state: 'idle', msg: '' });
  const [zones, setZones] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [wanted, setWanted] = useState(() => WANTED_SERVICES.filter(s => s.id === initialServiceId).map(s => s.name));
  const [showWantedError, setShowWantedError] = useState(false);
  const [notes, setNotes] = useState('');
  const [submit, setSubmit] = useState({ state: 'idle', msg: '' });

  const fullAddress = [form.address, form.city, form.zip].filter(Boolean).join(', ');
  const totalSqFt = zones.reduce((sum, z) => sum + areaSqFt(z.points), 0);
  const estimate = estimatePrice(totalSqFt);
  const change = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const findProperty = async e => {
    e.preventDefault();
    if (!wanted.length) { setShowWantedError(true); return; }
    if (!form.name || !form.phone || !form.address) return;
    setLookup({ state: 'loading', msg: '' });
    // Exact house from the suggestions: no need to look it up again.
    let found = picked?.exact ? { lat: picked.lat, lng: picked.lng } : await geocode(`${fullAddress}${form.city ? '' : ', Michigan'}`);
    // Only the street was known: start on the street and let them find the house.
    if (!found && picked && Number.isFinite(picked.lat)) found = { lat: picked.lat, lng: picked.lng, approx: true };
    if (found) {
      setCenter(found);
      setLookup({ state: 'idle', msg: '' });
      setStep('map');
      window.scrollTo(0, 0);
    } else {
      setLookup({ state: 'error', msg: "We couldn't find that address on the map. Check the spelling, or find your house on the map yourself." });
    }
  };

  const findOnMapMyself = () => {
    setCenter({ lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1], manual: true });
    setLookup({ state: 'idle', msg: '' });
    setStep('map');
  };

  const renameZone = (id, name) => setZones(zs => zs.map(z => (z.id === id ? { ...z, name } : z)));
  const deleteZone = id => {
    setZones(zs => zs.filter(z => z.id !== id));
    if (selectedId === id) setSelectedId(null);
  };
  const toggleWanted = s => {
    setShowWantedError(false);
    setWanted(w => (w.includes(s) ? w.filter(x => x !== s) : [...w, s]));
  };

  const sendQuote = async () => {
    setSubmit({ state: 'loading', msg: '' });
    const measured = zones.length > 0;
    const zoneSummary = zones.map(z => `${z.name}: ${formatSqFt(areaSqFt(z.points))}`).join('; ');
    const quote = measured && {
      totalSqFt: Math.round(totalSqFt),
      estimate,
      wanted,
      center,
      zones: zones.map(z => ({ name: z.name, color: z.color, sqFt: Math.round(areaSqFt(z.points)), points: z.points })),
    };
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          service: `Quote: ${wanted.join(', ')}`,
          requested: wanted,
          earnings: estimate,
          bestTime: '',
          message: `${measured ? `Measured ${formatSqFt(totalSqFt)} (${zoneSummary}). Estimate ${formatPrice(estimate)}.` : 'Skipped measuring — call to quote.'}${notes ? ` Notes: ${notes}` : ''}`,
          location: center?.manual ? null : center,
          ...(quote ? { quote } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Couldn't send your quote (HTTP ${res.status}).`);
      }
      setSubmit({ state: 'idle', msg: '' });
      setStep('sent');
      window.scrollTo(0, 0);
    } catch (err) {
      setSubmit({ state: 'error', msg: err.message || 'Unable to reach the server.' });
    }
  };

  if (step === 'sent') {
    return (
      <div style={{ maxWidth: '640px', margin: '40px auto', textAlign: 'center' }}>
        <div style={{ fontSize: '56px', marginBottom: '12px' }}>🌳</div>
        <h1 style={{ fontSize: '32px', fontWeight: 800, marginBottom: '10px' }}>Quote request sent!</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '16px', lineHeight: 1.7, marginBottom: '8px' }}>
          Thanks, {form.name.split(' ')[0]}.{' '}
          {zones.length
            ? <>Your quote is <b style={{ color: 'var(--accent-teal)' }}>{formatPrice(estimate)}</b>.</>
            : <>We got your request for {wanted.join(', ').toLowerCase()}.</>}
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: '15px', marginBottom: '28px' }}>
          {COMPANY_INFO.name} will reach out at {form.phone} with your quote.
        </p>
        <button className="btn-primary" onClick={() => { setPage('home'); window.scrollTo(0, 0); }} style={{ padding: '12px 28px' }}>
          Back to Home
        </button>
      </div>
    );
  }

  if (step === 'details') {
    return (
      <div style={{ maxWidth: '720px' }}>
        <h1 style={{ fontSize: '36px', fontWeight: 800, marginBottom: '8px' }}>Request a Quote</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '16px', lineHeight: 1.6, marginBottom: '24px' }}>
          Tell us what you need and where. Then outline your yard on a satellite map and see your price instantly.
        </p>
        <Steps current={1} />
        <form className="card" onSubmit={findProperty} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label className="form-label">What do you need? *</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginTop: '6px' }}>
              {WANTED_SERVICES.map(s => {
                const on = wanted.includes(s.name);
                return (
                  <button key={s.id} type="button" onClick={() => toggleWanted(s.name)} aria-pressed={on} style={{
                    display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', borderRadius: '8px', cursor: 'pointer', textAlign: 'left',
                    border: `2px solid ${on ? 'var(--accent-teal)' : 'var(--border)'}`,
                    background: on ? 'var(--accent-teal)15' : 'var(--bg-elevated)',
                    color: on ? 'var(--accent-teal)' : 'var(--text-primary)', fontWeight: 600, fontSize: '14px',
                  }}>
                    <span style={{ fontSize: '22px' }}>{s.icon}</span>
                    <span style={{ flex: 1 }}>{s.name}</span>
                    {on && <span>✓</span>}
                  </button>
                );
              })}
            </div>
            {showWantedError && <div style={{ color: '#ff7b72', fontSize: '13px', marginTop: '6px' }}>Pick at least one service.</div>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
            <Field label="Full Name *"><input className="form-input" name="name" value={form.name} onChange={change} placeholder="John Smith" autoComplete="name" required /></Field>
            <Field label="Phone *"><input className="form-input" type="tel" name="phone" value={form.phone} onChange={change} placeholder="(313) 555-0000" autoComplete="tel" required /></Field>
          </div>
          <Field label="Email"><input className="form-input" type="email" name="email" value={form.email} onChange={change} placeholder="john@example.com" autoComplete="email" /></Field>
          <Field label="Property Address *">
            <AddressInput
              value={form.address}
              onChange={v => { setForm(f => ({ ...f, address: v })); setPicked(null); }}
              onPick={s => { setForm(f => ({ ...f, address: s.address, city: s.city || f.city, zip: s.zip || f.zip })); setPicked(s); }}
              placeholder="Start typing your address…"
              required
            />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px' }}>
            <Field label="City"><input className="form-input" name="city" value={form.city} onChange={change} placeholder="Wyandotte" autoComplete="address-level2" /></Field>
            <Field label="ZIP Code"><input className="form-input" inputMode="numeric" name="zip" value={form.zip} onChange={change} placeholder="48192" autoComplete="postal-code" /></Field>
          </div>
          {lookup.state === 'error' && (
            <div style={{ background: '#da363322', border: '1px solid #da363355', borderRadius: '8px', padding: '12px 16px', color: '#ff7b72', fontSize: '14px' }}>
              {lookup.msg}{' '}
              <button type="button" onClick={findOnMapMyself} style={{ background: 'none', border: 'none', color: 'var(--accent-teal)', fontWeight: 700, cursor: 'pointer', padding: 0, fontSize: '14px' }}>
                Find it on the map →
              </button>
            </div>
          )}
          <button className="btn-primary" type="submit" disabled={lookup.state === 'loading'} style={{ padding: '13px', fontSize: '15px' }}>
            {lookup.state === 'loading' ? 'Finding your property…' : 'Find My Property →'}
          </button>
        </form>
      </div>
    );
  }

  // step === 'map'
  return (
    <div style={{ maxWidth: '1100px' }}>
      <div style={{ marginBottom: '12px' }}>
        <button className="btn-ghost" onClick={() => setStep('details')} style={{ fontSize: '13px', padding: '6px 12px' }}>
          ← Change Address
        </button>
      </div>
      <h1 style={{ fontSize: '30px', fontWeight: 800, marginBottom: '6px' }}>Outline Your Yard</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '15px', marginBottom: '18px' }}>
        {center?.manual
          ? 'Zoom in to find your property, then '
          : center?.approx
            ? <>📍 We found {form.address.replace(/^\d+\s*/, '')} — drag the map to your house, then </>
            : <>📍 {fullAddress}. Not quite right? Drag the map to your yard. Then </>}
        tap <b>Draw a Zone</b> and tap each corner of an area you want serviced.
      </p>
      <Steps current={2} />

      <div className="quote-layout">
        <div style={{ minWidth: 0 }}>
          <YardMap
            center={center}
            zones={zones}
            onZonesChange={setZones}
            selectedId={selectedId}
            onSelect={setSelectedId}
            showArea={false}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="card" style={{ padding: '20px', textAlign: 'center' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '1px' }}>Your Quote</div>
            <div style={{ fontSize: '40px', fontWeight: 800, color: 'var(--accent-teal)', margin: '4px 0' }}>
              {zones.length ? formatPrice(estimate) : '—'}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              {zones.length ? 'Final price confirmed on-site' : 'Draw a zone to see your price'}
            </div>
          </div>

          <div className="card" style={{ padding: '18px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px' }}>Your Zones</h3>
            {!zones.length && <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Zones you draw show up here. You can rename them.</p>}
            <datalist id="zone-names">{ZONE_NAME_SUGGESTIONS.map(n => <option key={n} value={n} />)}</datalist>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {zones.map(z => (
                <div key={z.id} onClick={() => setSelectedId(z.id)} style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', borderRadius: '8px', cursor: 'pointer',
                  border: `1px solid ${z.id === selectedId ? z.color : 'var(--border)'}`, background: 'var(--bg-elevated)',
                }}>
                  <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: z.color, flexShrink: 0 }} />
                  <input className="form-input" list="zone-names" value={z.name} onChange={e => renameZone(z.id, e.target.value)}
                    onClick={e => e.stopPropagation()} style={{ padding: '5px 8px', fontSize: '13px', minWidth: 0, flex: 1 }} />
                  <button type="button" aria-label={`Delete ${z.name}`} onClick={e => { e.stopPropagation(); deleteZone(z.id); }}
                    style={{ background: 'none', border: 'none', color: '#ff7b72', cursor: 'pointer', fontSize: '16px', padding: '0 4px' }}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700 }}>Anything else?</h3>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Quote for: <b style={{ color: 'var(--text-primary)' }}>{wanted.join(', ')}</b>
            </div>
            <textarea className="form-input" rows={3} value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Anything else? New beds, mulch, gate code, dogs…" style={{ resize: 'vertical' }} />
            {submit.state === 'error' && <div style={{ color: '#ff7b72', fontSize: '13px' }}>{submit.msg}</div>}
            <button className="btn-primary" type="button" onClick={sendQuote} disabled={!zones.length || submit.state === 'loading'}
              style={{ padding: '13px', fontSize: '15px', opacity: zones.length ? 1 : 0.5 }}>
              {submit.state === 'loading' ? 'Sending…' : zones.length ? `Send My Quote Request (${formatPrice(estimate)})` : 'Draw at least one zone'}
            </button>
            {!zones.length && (
              <button type="button" onClick={sendQuote} disabled={submit.state === 'loading'}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '13px', cursor: 'pointer', textDecoration: 'underline' }}>
                Having trouble with the map? Skip it and we'll call you
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="form-label">{label}</label>
      {children}
    </div>
  );
}

function Steps({ current }) {
  const steps = ['Your Info', 'Outline Your Yard', 'Get Your Quote'];
  return (
    <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
      {steps.map((s, i) => {
        const n = i + 1;
        const active = n === current;
        const done = n < current;
        return (
          <div key={s} style={{
            display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600,
            color: active ? 'var(--accent-teal)' : done ? 'var(--text-primary)' : 'var(--text-muted)',
          }}>
            <span style={{
              width: '22px', height: '22px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '12px', border: `2px solid ${active || done ? 'var(--accent-teal)' : 'var(--border)'}`,
              background: done ? 'var(--accent-teal)' : 'transparent', color: done ? '#0d1117' : 'inherit',
            }}>{done ? '✓' : n}</span>
            {s}
            {n < steps.length && <span style={{ color: 'var(--border)', margin: '0 4px' }}>—</span>}
          </div>
        );
      })}
    </div>
  );
}
