import { useEffect, useRef, useState } from 'react';
import YardMap from '../components/YardMap.jsx';
import MowProgress from '../components/MowProgress.jsx';
import AddressInput from '../components/AddressInput.jsx';
import { COMPANY_INFO } from '../data/services.js';
import { DEFAULT_CENTER, ZONE_COLORS, ZONE_NAME_SUGGESTIONS, areaSqFt, estimatePrice, formatPrice, formatSqFt, geocode } from '../lib/zones.js';

// What customers can ask for. id matches the service page id, so a service
// page's "Request a Quote" button can preselect it.
const WANTED_SERVICES = [
  { id: 'lawn-cutting', name: 'Lawn Cutting', icon: '🌱' },
  { id: 'leaf-removal', name: 'Leaf Removal', icon: '🍂' },
  { id: 'landscaping-quote', name: 'Landscaping', icon: '🌳' },
  { id: 'snow-removal', name: 'Snow Removal', icon: '❄️' },
];
// Snow is priced by John per push (lots vary: islands, curbs, where the snow can go),
// so a quote that includes it shows no instant price.
const SNOW = 'Snow Removal';
const SNOW_ZONE_NAMES = ['Parking Lot', 'Driveway', 'Sidewalks', 'Loading Area', 'Other'];

const EMPTY_FORM = { name: '', phone: '', email: '', address: '', city: '', zip: '' };

export default function QuoteTool({ setPage, initialServiceId }) {
  // Address first (one field), then the yard and price, then where to send it.
  const [step, setStep] = useState('details'); // details (address) | map | contact | sent
  const [form, setForm] = useState(EMPTY_FORM);
  const [center, setCenter] = useState(null);
  // Address chosen from the suggestions (has coordinates). Cleared if they keep typing.
  const [picked, setPicked] = useState(null);
  const [lookup, setLookup] = useState({ state: 'idle', msg: '' });
  const [zones, setZones] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  // Lawn Cutting is picked to start (most quotes), unless they came from another service page.
  const [wanted, setWanted] = useState(() => {
    const from = WANTED_SERVICES.filter(s => s.id === initialServiceId).map(s => s.name);
    return from.length ? from : ['Lawn Cutting'];
  });
  const [showWantedError, setShowWantedError] = useState(false);
  const [notes, setNotes] = useState('');
  const [submit, setSubmit] = useState({ state: 'idle', msg: '' });

  const fullAddress = [form.address, form.city, form.zip].filter(Boolean).join(', ');
  const totalSqFt = zones.reduce((sum, z) => sum + areaSqFt(z.points), 0);
  const snow = wanted.includes(SNOW);
  const snowOnly = snow && wanted.length === 1;
  const estimate = snow ? null : estimatePrice(totalSqFt);
  const what = snowOnly ? 'Parking Lot' : snow ? 'Property' : 'Yard';
  const change = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const findProperty = async e => {
    e.preventDefault();
    advance();
  };
  const advance = async () => {
    if (!wanted.length) { setShowWantedError(true); return; }
    if (!form.address) return;
    setLookup({ state: 'loading', msg: '' });
    // Exact house from the suggestions: no need to look it up again.
    let found = picked?.exact ? { lat: picked.lat, lng: picked.lng } : await geocode(`${fullAddress}${form.city ? '' : ', Michigan'}`);
    // Only the street was known: start on the street and let them find the house.
    if (!found && picked && Number.isFinite(picked.lat)) found = { lat: picked.lat, lng: picked.lng, approx: true };
    if (found) {
      // Already found their roof in the background (address picked earlier)? Start there.
      const early = earlyHouse.current;
      setCenter(early && early.from === `${found.lat},${found.lng}` ? { lat: early.lat, lng: early.lng } : found);
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

  // ✨ Outline my yard: the server traces the grass from the satellite photo. The shapes
  // land on the map like hand-drawn zones, so the customer can drag corners or delete them.
  const [outline, setOutline] = useState({ state: 'idle', msg: '' });
  const [outlineOn, setOutlineOn] = useState(false); // server has it set up
  const [fitSignal, setFitSignal] = useState(0); // bump → the map zooms to show all zones
  const fitMove = useRef(false);
  useEffect(() => {
    let off = false;
    fetch('/api/yard-outline').then(r => (r.ok ? r.json() : null)).then(d => { if (!off) setOutlineOn(Boolean(d?.ready)); }).catch(() => {});
    return () => { off = true; };
  }, []);
  // Runs by itself from the typed address as soon as the map opens. Addresses can land
  // on the street or a neighbor's lot, so "Wrong house?" lets them tap their own roof.
  // An automatic run never replaces zones they've started drawing themselves.
  const runId = useRef(0); // only the newest outline's result is used (they may change the address)
  const autoOutline = async (house, { tapped = true, from = null } = {}) => {
    if (!house?.lat) return;
    const run = ++runId.current;
    lastOutlined.current = { lat: house.lat, lng: house.lng };
    setOutline({ state: 'busy', msg: '', tapped });
    try {
      const res = await fetch('/api/yard-outline', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lat: house.lat, lng: house.lng, tapped }) });
      const data = await res.json().catch(() => ({}));
      if (run !== runId.current) return; // a newer outline was started
      if (!res.ok) throw new Error(data.error || 'Could not outline it automatically.');
      if (!data.zones?.length) throw new Error(data.note || "We couldn't spot your lawn in the photo. Tap Draw a Zone to outline it yourself.");
      const stamp = Date.now();
      const auto = data.zones.map((z, i) => ({ id: `auto-${stamp}-${i}`, name: z.name, color: ZONE_COLORS[i % ZONE_COLORS.length], points: z.points }));
      // The AI found the roof the address belongs to: put the ✛ and the pin on it.
      if (data.house?.lat) {
        lastOutlined.current = data.house;
        autoRan.current = `${data.house.lat},${data.house.lng}`;
        if (from) earlyHouse.current = { from, lat: data.house.lat, lng: data.house.lng };
        // On the map already: move the ✛ there. (Still on the form: advance() starts there.)
        setCenter(c => (c ? { ...c, lat: data.house.lat, lng: data.house.lng } : c));
      }
      setZones(cur => {
        if (!tapped && cur.some(z => !String(z.id).startsWith('auto-'))) return cur;
        autoShapes.current = JSON.stringify(auto);
        autoWarnings.current = Array.isArray(data.warnings) ? data.warnings : [];
        return auto;
      });
      setSelectedId(null);
      // Zoom out to show everything it outlined. That zoom isn't the customer moving the map.
      fitMove.current = true;
      setTimeout(() => { fitMove.current = false; }, 1500); // in case the map didn't need to move
      setFitSignal(n => n + 1);
      setOutline({ state: 'done', tapped, msg: data.note || 'Outlined your lawn. Tap a zone to drag its corners.' });
    } catch (err) {
      if (run === runId.current) setOutline({ state: 'error', msg: err.message });
    }
  };

  // Outline from the typed address as soon as the map opens (once per address). Skipped
  // when only the street was found or they're finding the house on the map themselves.
  const autoRan = useRef('');
  useEffect(() => {
    if (step !== 'map' || !outlineOn || snow || !center?.lat || center.manual || center.approx) return;
    const at = `${center.lat},${center.lng}`;
    if (autoRan.current === at || zones.length) return;
    autoRan.current = at;
    autoOutline(center, { tapped: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, outlineOn, snow, center?.lat, center?.lng]);

  // Picking their address from the suggestions goes straight to the map: no button.
  const earlyHouse = useRef(null); // { from: 'lat,lng' of the picked address, lat, lng } once the roof is found
  useEffect(() => {
    if (!picked?.exact || !Number.isFinite(picked.lat) || !wanted.length) return;
    advance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked?.lat, picked?.lng]);

  // Moving the map: when it stops (~2 s) with the ✛ somewhere new (15 m+ from the last
  // outline), outline the house under the ✛. Their own hand-drawn zones are never replaced.
  const lastOutlined = useRef(null);
  const lastMapCenter = useRef(null);
  const autoShapes = useRef(''); // the zones as the last outline returned them
  const autoWarnings = useRef([]); // what the AI says John should double-check
  const moveTimer = useRef(null);
  const metersApart = (a, b) => Math.hypot((a.lat - b.lat) * 111320, (a.lng - b.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180));
  const onMapMoved = c => {
    // Our own zoom-to-fit: not the customer moving the map (and the ✛ isn't on the roof now).
    if (fitMove.current) { fitMove.current = false; return; }
    lastMapCenter.current = { lat: c.lat, lng: c.lng };
    clearTimeout(moveTimer.current);
    if (!outlineOn || snow || outline.state === 'busy' || c.zoom < 18) return;
    if (zones.some(z => !String(z.id).startsWith('auto-'))) return; // they're drawing their own
    if (autoShapes.current && JSON.stringify(zones) !== autoShapes.current) return; // they've adjusted corners
    const ref = lastOutlined.current || center;
    if (ref && metersApart(ref, c) < 15) return;
    moveTimer.current = setTimeout(() => autoOutline({ lat: c.lat, lng: c.lng }, { tapped: true }), 2000);
  };
  useEffect(() => () => clearTimeout(moveTimer.current), []);

  const renameZone = (id, name) => setZones(zs => zs.map(z => (z.id === id ? { ...z, name } : z)));
  const deleteZone = id => {
    setZones(zs => zs.filter(z => z.id !== id));
    if (selectedId === id) setSelectedId(null);
  };
  const toggleWanted = s => {
    setShowWantedError(false);
    setWanted(w => (w.includes(s) ? w.filter(x => x !== s) : [...w, s]));
  };

  const sendQuote = async e => {
    e?.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) { setSubmit({ state: 'error', msg: 'Add your name and phone so John can reach you.' }); return; }
    setSubmit({ state: 'loading', msg: '' });
    const measured = zones.length > 0;
    const zoneSummary = zones.map(z => `${z.name}: ${formatSqFt(areaSqFt(z.points))}`).join('; ');
    const quote = measured && {
      totalSqFt: Math.round(totalSqFt),
      estimate,
      wanted,
      center,
      zones: zones.map(z => ({ name: z.name, color: z.color, sqFt: Math.round(areaSqFt(z.points)), points: z.points })),
      // ✨ outlined automatically? (and what the AI flagged for John)
      ...(zones.some(z => String(z.id).startsWith('auto-')) ? {
        outline: { auto: true, edited: JSON.stringify(zones) !== autoShapes.current, warnings: autoWarnings.current },
      } : {}),
    };
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          service: `Quote: ${wanted.join(', ')}`,
          requested: wanted,
          ...(estimate != null ? { earnings: estimate } : {}),
          bestTime: '',
          message: `${measured ? `Measured ${formatSqFt(totalSqFt)} (${zoneSummary}).${estimate != null ? ` Estimate ${formatPrice(estimate)}.` : ' John to price it.'}` : 'Skipped measuring — call to quote.'}${notes ? ` Notes: ${notes}` : ''}`,
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
        <div style={{ fontSize: '56px', marginBottom: '12px' }}>{snowOnly ? '❄️' : '🌳'}</div>
        <h1 style={{ fontSize: '32px', fontWeight: 800, marginBottom: '10px' }}>Quote request sent!</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '16px', lineHeight: 1.7, marginBottom: '8px' }}>
          Thanks, {form.name.split(' ')[0]}.{' '}
          {zones.length && estimate != null
            ? <>Your quote is <b style={{ color: 'var(--accent-teal)' }}>{formatPrice(estimate)}</b>.</>
            : <>We got your request for {wanted.join(', ').toLowerCase()}{zones.length ? ` and your ${what.toLowerCase()} outline` : ''}.</>}
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: '15px', marginBottom: '28px' }}>
          {COMPANY_INFO.name} will reach out at {form.phone} with your {estimate == null ? 'price' : 'quote'}.
        </p>
        <button className="btn-primary" onClick={() => { setPage('home'); window.scrollTo(0, 0); }} style={{ padding: '12px 28px' }}>
          Back to Home
        </button>
      </div>
    );
  }

  if (step === 'contact') {
    const measured = zones.length > 0;
    return (
      <div style={{ maxWidth: '560px' }}>
        <button type="button" className="btn-ghost" onClick={() => setStep('map')} style={{ fontSize: '13px', padding: '6px 12px', marginBottom: '12px' }}>← Back to the map</button>
        <h1 style={{ fontSize: '30px', fontWeight: 800, marginBottom: '6px' }}>Where should we send it?</h1>
        <Steps current={3} />
        <div className="card quote-summary">
          <div>
            <div className="quote-summary-what">{wanted.join(', ')}</div>
            <div className="quote-summary-addr">{fullAddress}{measured ? ` · ${formatSqFt(totalSqFt)}` : ''}</div>
          </div>
          <div className="quote-summary-price">
            {measured && estimate != null ? <>{formatPrice(estimate)}<small>per cut</small></> : <small>{measured ? 'John prices it' : 'John will call'}</small>}
          </div>
        </div>
        <form className="card" onSubmit={sendQuote} style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '14px' }}>
            <Field label="Your name"><input className="form-input" name="name" value={form.name} onChange={change} placeholder="John Smith" autoComplete="name" required autoFocus /></Field>
            <Field label="Phone"><input className="form-input" type="tel" name="phone" value={form.phone} onChange={change} placeholder="(313) 555-0000" autoComplete="tel" required /></Field>
          </div>
          <Field label="Email (optional)"><input className="form-input" type="email" name="email" value={form.email} onChange={change} placeholder="you@example.com" autoComplete="email" /></Field>
          <Field label="Anything John should know? (optional)">
            <textarea className="form-input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Gate code, dogs, new beds, mulch…" style={{ resize: 'vertical' }} />
          </Field>
          {submit.state === 'error' && <div style={{ color: '#ff7b72', fontSize: '13px' }}>{submit.msg}</div>}
          <button className="btn-primary" type="submit" disabled={submit.state === 'loading'} style={{ padding: '14px', fontSize: '16px' }}>
            {submit.state === 'loading' ? 'Sending…' : measured && estimate != null ? `Send My Quote (${formatPrice(estimate)})` : 'Send to John'}
          </button>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>No account, no payment. John texts or calls to confirm.</div>
        </form>
      </div>
    );
  }

  if (step === 'details') {
    return (
      <div style={{ maxWidth: '720px' }}>
        <h1 style={{ fontSize: '36px', fontWeight: 800, marginBottom: '8px' }}>Get Your Price</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '16px', lineHeight: 1.6, marginBottom: '20px' }}>
          Enter your address. We'll find your yard on the satellite map and show your price in seconds.
        </p>
        <Steps current={1} />
        <form className="card" onSubmit={findProperty} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <Field label="Your address">
            <AddressInput
              value={form.address}
              onChange={v => { setForm(f => ({ ...f, address: v, city: '', zip: '' })); setPicked(null); }}
              onPick={s => { setForm(f => ({ ...f, address: s.address, city: s.city || '', zip: s.zip || '' })); setPicked(s); }}
              placeholder="Start typing, then pick it from the list"
              required
            />
          </Field>
          <div>
            <label className="form-label">What do you need?</label>
            <div className="quote-services">
              {WANTED_SERVICES.map(s => {
                const on = wanted.includes(s.name);
                return (
                  <button key={s.id} type="button" onClick={() => toggleWanted(s.name)} aria-pressed={on} className={`quote-service${on ? ' on' : ''}`}>
                    <span className="quote-service-icon">{s.icon}</span>
                    <span>{s.name}</span>
                    {on && <span className="quote-service-check">✓</span>}
                  </button>
                );
              })}
            </div>
            {showWantedError && <div style={{ color: '#ff7b72', fontSize: '13px', marginTop: '6px' }}>Pick at least one service.</div>}
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
            {lookup.state === 'loading' ? 'Finding your yard…' : `Show My ${what} →`}
          </button>
        </form>
      </div>
    );
  }

  // step === 'map'
  return (
    <div className="quote-map-step" style={{ maxWidth: '1100px' }}>
      <div className="quote-map-head">
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: '26px', fontWeight: 800, margin: 0 }}>Your {what}</h1>
          <div className="quote-addr">
            📍 {center?.manual ? 'Zoom in and find your property' : center?.approx ? `Near ${form.address.replace(/^\d+\s*/, '')}. Drag the map to your house.` : fullAddress}
            {' '}<button type="button" className="link-btn" onClick={() => setStep('details')}>Change</button>
          </div>
        </div>
        <Steps current={2} />
      </div>

      {/* One short line saying what's happening and what to do. */}
      {outlineOn && !snow && !center?.manual ? (
        <div className={`outline-auto ${outline.state}`}>
          <span>
            {outline.state === 'busy' ? '✨ Finding your lawn… about 15 seconds.'
              : outline.state === 'done' ? <>✅ Lawn outlined. <b>Wrong house?</b> Drag the map so the ✛ sits on your roof. Drag a corner to fix an edge.</>
                : outline.state === 'error' ? <>{outline.msg} Or tap <b>Draw a Zone</b> and tap the corners of your lawn.</>
                  : 'Drag the map so the ✛ sits on your roof.'}
          </span>
          {outline.state !== 'busy' && (
            <button type="button" className="btn-ghost" onClick={() => { const m = lastMapCenter.current || center; if (m) autoOutline(m, { tapped: true }); }}>
              ✨ {outline.state === 'done' ? 'Redo' : 'Outline it'}
            </button>
          )}
        </div>
      ) : (
        <div className="outline-auto">
          <span>Tap <b>Draw a Zone</b>, then tap each corner of an area you want serviced{snow ? '. For snow, outline every lot, drive and walk you want plowed' : ''}.</span>
        </div>
      )}

      <div className="quote-layout">
        <div style={{ minWidth: 0, position: 'relative' }}>
          {outline.state === 'busy' && <MowProgress findingHouse={!outline.tapped} seconds={outline.tapped ? 15 : 20} />}
          <YardMap
            center={center}
            zones={zones}
            onZonesChange={setZones}
            selectedId={selectedId}
            onSelect={setSelectedId}
            showArea={false}
            zoneNames={snowOnly ? SNOW_ZONE_NAMES : undefined}
            onPickPoint={outline.state === 'picking' ? autoOutline : null}
            crosshair={outlineOn && !snow}
            onMoveEnd={onMapMoved}
            fitSignal={fitSignal}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="card" style={{ padding: '20px', textAlign: 'center' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '1px' }}>Your Quote</div>
            <div style={{ fontSize: '40px', fontWeight: 800, color: 'var(--accent-teal)', margin: '4px 0' }}>
              {estimate == null ? (zones.length ? formatSqFt(totalSqFt) : '❄️') : zones.length ? formatPrice(estimate) : '—'}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              {estimate == null
                ? (zones.length ? `outlined · ${COMPANY_INFO.shortName} will text your price per push` : 'Outline the area to plow')
                : zones.length ? 'Final price confirmed on-site' : 'Draw a zone to see your price'}
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

          <button className="btn-primary quote-next" type="button" onClick={() => { setStep('contact'); window.scrollTo(0, 0); }}
            disabled={!zones.length || outline.state === 'busy'}>
            {outline.state === 'busy' ? 'Finding your lawn…' : !zones.length ? 'Outline your lawn first' : 'Next: where to send it →'}
          </button>
          {!zones.length && outline.state !== 'busy' && (
            <button type="button" className="link-btn" onClick={() => { setStep('contact'); window.scrollTo(0, 0); }} style={{ alignSelf: 'center' }}>
              Trouble with the map? Skip it and John will call you
            </button>
          )}
        </div>
      </div>

      {/* Phones: price + Next stay on screen under the map. */}
      <div className="quote-sticky">
        <div>
          <b>{zones.length ? (estimate != null ? formatPrice(estimate) : formatSqFt(totalSqFt)) : '—'}</b>
          <span>{outline.state === 'busy' ? 'Finding your lawn…' : zones.length ? (estimate != null ? 'per cut' : 'John prices it') : 'Outline your lawn'}</span>
        </div>
        <button className="btn-primary" type="button" onClick={() => { setStep('contact'); window.scrollTo(0, 0); }} disabled={!zones.length || outline.state === 'busy'}>
          Next →
        </button>
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
  const steps = ['Address', 'Your Yard', 'Send'];
  return (
    <div style={{ display: 'flex', gap: '8px', margin: '10px 0 16px', flexWrap: 'wrap' }}>
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
