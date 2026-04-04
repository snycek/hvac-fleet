import { useEffect, useState, useRef } from 'react';
import { HVAC_SERVICES } from '../lib/constants.js';

const REQUEST_CHOICES = [
  {
    id: 'furnace_inspection',
    title: "I'm Freezing",
    subtitle: 'Furnace inspection request',
    icon: '🥶',
    serviceName: 'Furnace Inspection',
    earnings: 200,
  },
  {
    id: 'ac_inspection',
    title: "I'm Sweating",
    subtitle: 'AC inspection request',
    icon: '🥵',
    serviceName: 'AC Inspection',
    earnings: 200,
  },
];

const DEFAULT_BEST_TIME = 'ASAP – Emergency';

function ContactForm({ compact = false, onSuccess }) {
  const formRef = useRef(null);
  const [form, setForm] = useState({
    name: '', email: '', phone: '',
    address: '', city: '', zip: '',
    requestChoice: '', bestTime: DEFAULT_BEST_TIME, message: '',
  });
  const [state, setState] = useState('idle');
  const [errMsg, setErrMsg] = useState('');
  const twoColGrid = compact ? 'repeat(2, minmax(0, 1fr))' : '1fr 1fr';
  const formGap = compact ? '10px' : '14px';
  const controlStyle = compact ? { padding: '8px 10px', fontSize: '13px' } : {};
  const choiceCardStyle = compact ? { padding: '8px 10px' } : { padding: '10px 14px' };

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const selectedChoice = REQUEST_CHOICES.find(c => c.id === form.requestChoice);

  const readFormValues = () => {
    const el = formRef.current;
    if (!el) return form;

    const data = new FormData(el);
    return {
      name: String(data.get('name') || '').trim(),
      email: String(data.get('email') || '').trim(),
      phone: String(data.get('phone') || '').trim(),
      address: String(data.get('address') || '').trim(),
      city: String(data.get('city') || '').trim(),
      zip: String(data.get('zip') || '').trim(),
      requestChoice: form.requestChoice || String(data.get('requestChoice') || ''),
      bestTime: String(data.get('bestTime') || ''),
      message: String(data.get('message') || '').trim(),
    };
  };

  const handleSubmit = async e => {
    e.preventDefault();
    const submitted = readFormValues();
    setForm(submitted);
    const submittedChoice = REQUEST_CHOICES.find(c => c.id === submitted.requestChoice);

    if (!submitted.name || !submitted.requestChoice || !submitted.phone) return;
    setState('loading');
    setErrMsg('');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...submitted,
          service: submittedChoice?.serviceName || 'Inspection Request',
          earnings: submittedChoice?.earnings || 0,
        }),
      });
      const raw = await res.text();
      let data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch (_parseErr) {
        data = {};
      }

      if (!res.ok) {
        throw new Error(data.error || `Unable to submit request (HTTP ${res.status}).`);
      }

      setState('success');
      setForm({ name: '', email: '', phone: '', address: '', city: '', zip: '', requestChoice: '', bestTime: DEFAULT_BEST_TIME, message: '' });
      if (onSuccess) {
        setTimeout(() => onSuccess(), 1500);
      }
    } catch (err) {
      // Still redirect back even on error — the request was attempted
      setState('error');
      setErrMsg(err.message || 'Unable to reach the server.');
      if (onSuccess) {
        setTimeout(() => onSuccess(), 2500);
      }
    }
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit} autoComplete="on" style={{ display: 'flex', flexDirection: 'column', gap: formGap }}>

      {/* Name + Phone */}
      <div style={{ display: 'grid', gridTemplateColumns: twoColGrid, gap: formGap }}>
        <div>
          <label className="form-label">Full Name *</label>
          <input className="form-input" style={controlStyle} name="name" value={form.name} onChange={handleChange} placeholder="John Smith" autoComplete="section-service name" required />
        </div>
        <div>
          <label className="form-label">Phone Number *</label>
          <input className="form-input" style={controlStyle} type="tel" inputMode="tel" name="phone" value={form.phone} onChange={handleChange} placeholder="(313) 555-0000" autoComplete="section-service tel" required />
        </div>
      </div>

      {/* Email */}
      <div>
        <label className="form-label">Email Address</label>
        <input className="form-input" style={controlStyle} type="email" name="email" value={form.email} onChange={handleChange} placeholder="john@example.com" autoComplete="section-service email" />
      </div>

      {/* Address */}
      <div>
        <label className="form-label">Service Address *</label>
        <input className="form-input" style={controlStyle} name="address" value={form.address} onChange={handleChange} placeholder="1234 Oak St" autoComplete="section-service street-address" required />
      </div>

      {/* City + Zip */}
      <div style={{ display: 'grid', gridTemplateColumns: twoColGrid, gap: formGap }}>
        <div>
          <label className="form-label">City</label>
          <input className="form-input" style={controlStyle} name="city" value={form.city} onChange={handleChange} placeholder="Wyandotte" autoComplete="section-service address-level2" />
        </div>
        <div>
          <label className="form-label">ZIP Code</label>
          <input className="form-input" style={controlStyle} inputMode="numeric" name="zip" value={form.zip} onChange={handleChange} placeholder="48192" autoComplete="section-service postal-code" />
        </div>
      </div>

      {/* Request Type */}
      <div>
        <label className="form-label">
          What are you feeling right now? *
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px', marginTop: '6px' }}>
          {REQUEST_CHOICES.map(choice => {
            const selected = form.requestChoice === choice.id;
            return (
              <button
                key={choice.id}
                type="button"
                onClick={() => setForm(f => ({ ...f, requestChoice: choice.id }))}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  ...choiceCardStyle, borderRadius: '8px', cursor: 'pointer',
                  border: `2px solid ${selected ? 'var(--accent-teal)' : 'var(--border)'}`,
                  background: selected ? 'var(--accent-teal)15' : 'var(--bg-elevated)',
                  textAlign: 'left', transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                <span style={{ fontSize: '24px', flexShrink: 0 }}>{choice.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: selected ? 'var(--accent-teal)' : 'var(--text-primary)', lineHeight: 1.3 }}>{choice.title}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{choice.subtitle}</div>
                </div>
                {selected && <span style={{ color: 'var(--accent-teal)', fontSize: '16px', flexShrink: 0 }}>✓</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Best Time */}
      <div>
        <label className="form-label">Best Time to Call</label>
        <select className="form-input" style={controlStyle} name="bestTime" value={form.bestTime} onChange={handleChange}>
          <option value="">Any time</option>
          <option value="Morning (8am–12pm)">Morning (8am–12pm)</option>
          <option value="Afternoon (12pm–5pm)">Afternoon (12pm–5pm)</option>
          <option value="Evening (5pm–8pm)">Evening (5pm–8pm)</option>
          <option value={DEFAULT_BEST_TIME}>{DEFAULT_BEST_TIME}</option>
        </select>
      </div>

      {/* Notes */}
      <div>
        <label className="form-label">Additional Details</label>
        <textarea className="form-input" style={{ ...controlStyle, resize: 'vertical' }} name="message" value={form.message} onChange={handleChange}
          rows={compact ? 2 : 3} placeholder="Describe your issue — age of unit, symptoms, anything helpful…" />
      </div>

      {state === 'success' && (
        <div style={{ background: '#3fb95022', border: '1px solid #3fb95055', borderRadius: '8px', padding: '12px 16px', color: '#3fb950', fontSize: '14px' }}>
          ✅ Request received! We'll be in touch shortly.
        </div>
      )}
      {state === 'error' && (
        <div style={{ background: '#f8514922', border: '1px solid #f8514955', borderRadius: '8px', padding: '12px 16px', color: '#f85149', fontSize: '14px' }}>
          ❌ {errMsg || 'Something went wrong. Please try again.'}
        </div>
      )}

      <button type="submit" className="btn-primary" disabled={state === 'loading'} style={{ alignSelf: 'flex-start', padding: compact ? '10px 20px' : '12px 28px', fontSize: compact ? '14px' : '15px' }}>
        {state === 'loading' ? 'Sending…' : 'Request Service'}
      </button>
    </form>
  );
}

function TechRegistrationForm() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    city: '',
    truckName: '',
    yearsExperience: '',
  });
  const [state, setState] = useState('idle');
  const [errMsg, setErrMsg] = useState('');

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async e => {
    e.preventDefault();
    if (!form.name || !form.email || !form.phone) return;
    setState('loading');
    setErrMsg('');
    try {
      const res = await fetch('/api/technicians/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          yearsExperience: Number(form.yearsExperience) || 0,
        }),
      });
      const raw = await res.text();
      let data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch (_parseErr) {
        data = {};
      }
      if (!res.ok) {
        throw new Error(data.error || `Request failed: ${res.status}`);
      }
      setState('success');
      setForm({ name: '', email: '', phone: '', city: '', truckName: '', yearsExperience: '' });
    } catch (err) {
      setState('error');
      setErrMsg(err.message || 'Unable to submit registration.');
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
        <div>
          <label className="form-label">Full Name *</label>
          <input className="form-input" name="name" value={form.name} onChange={handleChange} placeholder="Marcus Williams" required />
        </div>
        <div>
          <label className="form-label">Phone Number *</label>
          <input className="form-input" name="phone" value={form.phone} onChange={handleChange} placeholder="(313) 555-0000" required />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
        <div>
          <label className="form-label">Email Address *</label>
          <input className="form-input" type="email" name="email" value={form.email} onChange={handleChange} placeholder="tech@example.com" required />
        </div>
        <div>
          <label className="form-label">City</label>
          <input className="form-input" name="city" value={form.city} onChange={handleChange} placeholder="Southgate" />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
        <div>
          <label className="form-label">Truck Name / Number</label>
          <input className="form-input" name="truckName" value={form.truckName} onChange={handleChange} placeholder="Truck 29" />
        </div>
        <div>
          <label className="form-label">Years of HVAC Experience</label>
          <input className="form-input" type="number" min="0" step="1" name="yearsExperience" value={form.yearsExperience} onChange={handleChange} placeholder="0" />
        </div>
      </div>

      {state === 'success' && (
        <div style={{ background: '#3fb95022', border: '1px solid #3fb95055', borderRadius: '8px', padding: '12px 16px', color: '#3fb950', fontSize: '14px' }}>
          Application received. A manager must approve you before dispatch assignment.
        </div>
      )}
      {state === 'error' && (
        <div style={{ background: '#f8514922', border: '1px solid #f8514955', borderRadius: '8px', padding: '12px 16px', color: '#f85149', fontSize: '14px' }}>
          {errMsg}
        </div>
      )}

      <button type="submit" className="btn-primary" disabled={state === 'loading'} style={{ alignSelf: 'flex-start', padding: '12px 28px', fontSize: '15px' }}>
        {state === 'loading' ? 'Submitting…' : 'Apply as Technician'}
      </button>
    </form>
  );
}

export default function Landing({ setPage, mode = 'home' }) {
  const headingWrapRef = useRef(null);
  const [viewportWidth, setViewportWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1440);
  const [viewportHeight, setViewportHeight] = useState(typeof window !== 'undefined' ? window.innerHeight : 900);
  const [heroHeadingSize, setHeroHeadingSize] = useState(48);

  useEffect(() => {
    const onResize = () => {
      setViewportWidth(window.innerWidth);
      setViewportHeight(window.innerHeight);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const lineText = 'No Sweat. No Freeze. Just DuctTales.';

    const updateHeadingSize = () => {
      const width = headingWrapRef.current?.clientWidth || viewportWidth;
      const usableWidth = Math.max(280, width - 16);
      const avgGlyphWidth = 0.53;
      const next = Math.floor(usableWidth / (lineText.length * avgGlyphWidth));
      const clamped = Math.max(24, Math.min(58, next));
      setHeroHeadingSize(clamped);
    };

    updateHeadingSize();

    if (typeof ResizeObserver !== 'undefined' && headingWrapRef.current) {
      const ro = new ResizeObserver(() => updateHeadingSize());
      ro.observe(headingWrapRef.current);
      return () => ro.disconnect();
    }
  }, [viewportWidth]);

  const isStackedHero = viewportWidth < 1200;
  const isMobileHero = viewportWidth < 780;
  const compactRequestForm = viewportWidth < 900 || viewportHeight < 860;
  const ctaStackWidth = Math.max(220, Math.min(420, Math.floor(viewportWidth * (isMobileHero ? 0.88 : 0.34))));

  if (mode === 'request') {
    return (
      <section style={{ maxWidth: '920px', margin: '0 auto', padding: isMobileHero ? '24px 16px 50px' : '42px 24px 60px' }}>
        <div style={{ marginBottom: '12px' }}>
          <button className="btn-ghost" onClick={() => { setPage('home'); window.scrollTo(0, 0); }} style={{ fontSize: '13px' }}>
            ← Back to Home
          </button>
        </div>
        <div className="card" style={{ padding: isMobileHero ? '20px' : '30px' }}>
          <div style={{ marginBottom: '16px' }}>
            <h1 style={{ fontSize: isMobileHero ? '34px' : '42px', fontWeight: 800, marginBottom: '8px' }}>Request Service</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '15px' }}>Send your request now. Dispatch sees this in real time.</p>
          </div>
          <ContactForm compact={compactRequestForm} onSuccess={() => { setPage('home'); window.scrollTo(0, 0); }} />
        </div>
      </section>
    );
  }

  if (mode === 'apply') {
    return (
      <section style={{ maxWidth: '920px', margin: '0 auto', padding: isMobileHero ? '24px 16px 50px' : '42px 24px 60px' }}>
        <div style={{ marginBottom: '16px' }}>
          <button className="btn-ghost" onClick={() => setPage('home')} style={{ fontSize: '13px' }}>
            ← Back to Home
          </button>
        </div>
        <div className="card" style={{ padding: isMobileHero ? '20px' : '30px' }}>
          <div style={{ marginBottom: '16px' }}>
            <h1 style={{ fontSize: isMobileHero ? '34px' : '42px', fontWeight: 800, marginBottom: '8px' }}>Technician Registration</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '15px' }}>Anyone can apply. A manager must approve before dispatch assignment.</p>
          </div>
          <TechRegistrationForm />
        </div>
      </section>
    );
  }

  return (
    <div>
      {/* Hero */}
      <section style={{
        minHeight: '88vh',
        display: 'grid',
        gridTemplateColumns: '1fr',
        alignItems: isStackedHero ? 'stretch' : 'start',
        gap: isStackedHero ? '20px' : '30px',
        padding: isMobileHero ? '36px 16px' : '60px 24px',
        background: 'radial-gradient(ellipse at 50% 0%, #0fd3c322 0%, transparent 60%)',
        maxWidth: '1320px',
        margin: '0 auto',
      }}>
        <div style={{ alignSelf: 'start', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', paddingTop: isStackedHero ? '0' : '12px' }}>
          <div style={{
            display: 'inline-block',
            background: 'var(--accent-teal)22',
            color: 'var(--accent-teal)',
            border: '1px solid var(--accent-teal)44',
            borderRadius: '20px',
            padding: '4px 16px',
            fontSize: '13px',
            fontWeight: 600,
            letterSpacing: '1px',
            marginBottom: '18px',
            textTransform: 'uppercase',
            width: 'fit-content',
          }}>
            🦆 Downriver Michigan's Trusted HVAC Fleet
          </div>

          <div ref={headingWrapRef} style={{ position: 'relative', maxWidth: isStackedHero ? '100%' : '800px', marginBottom: '16px' }}>
            <span style={{ position: 'absolute', top: isMobileHero ? '-14px' : '-18px', left: isMobileHero ? '0px' : '-4px', fontSize: isMobileHero ? '18px' : '20px', color: 'var(--accent-teal)', opacity: 0.95 }}>♪</span>
            <span style={{ position: 'absolute', top: isMobileHero ? '-8px' : '6px', right: isMobileHero ? '4px' : '14px', fontSize: isMobileHero ? '16px' : '18px', color: 'var(--accent-teal)', opacity: 0.85 }}>♫</span>
            <span style={{ position: 'absolute', bottom: isMobileHero ? '-4px' : '-10px', right: isMobileHero ? '24px' : '70px', fontSize: isMobileHero ? '15px' : '16px', color: 'var(--accent-teal)', opacity: 0.7 }}>♬</span>
            <h1 style={{ fontSize: `${heroHeadingSize}px`, fontWeight: 800, lineHeight: 1.1, marginBottom: 0, whiteSpace: 'nowrap' }}>
              No Sweat. No Freeze. <span style={{ color: 'var(--accent-teal)' }}>Just DuctTales.</span>
            </h1>
          </div>

          <p style={{ fontSize: isMobileHero ? '16px' : '18px', color: 'var(--text-muted)', maxWidth: '560px', lineHeight: 1.7, marginBottom: '24px' }}>
            We give a duct about your comfort. Real-time dispatch, certified technicians, and upfront pricing — keeping Downriver comfortable, year-round.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center', width: 'min(100%, ' + ctaStackWidth + 'px)', margin: '0 auto' }}>
            <button className="btn-primary" onClick={() => setPage('request-service')} style={{ padding: '14px 28px', fontSize: '16px', width: '100%' }}>
              Request Service
            </button>
            <button className="btn-ghost" onClick={() => setPage('technician-apply')} style={{ padding: '14px 28px', fontSize: '16px', width: '100%' }}>
              Join Our Fleet
            </button>
            <button className="btn-ghost" onClick={() => setPage('login')} style={{ padding: '14px 28px', fontSize: '16px', width: '100%' }}>
              Portal Login →
            </button>
          </div>

        </div>

      </section>

      {/* Services */}
      <section style={{ padding: '80px 24px', maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <h2 style={{ fontSize: '36px', fontWeight: 700, marginBottom: '12px' }}>Our Services</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '16px' }}>Everything your HVAC system needs, done right the first time.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
          {HVAC_SERVICES.map(service => (
            <div key={service.id} className="card" style={{ textAlign: 'center', padding: '28px 20px' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>{service.icon}</div>
              <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: '8px', color: 'var(--text-primary)' }}>{service.name}</div>
              <div style={{ color: 'var(--accent-teal)', fontWeight: 600, fontSize: '14px' }}>
                Starting at ${service.price}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', borderTop: '1px solid var(--border)' }}>
        © 2026 DuctTales HVAC · Downriver Michigan · Licensed &amp; Insured
      </footer>
    </div>
  );
}
