import { useEffect, useState, useRef } from 'react';
import { ALL_SERVICES, COMPANY_INFO } from '../data/services.js';


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
          <label className="form-label">Years of Lawn Care Experience</label>
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
        {state === 'loading' ? 'Submitting…' : 'Apply to Join the Crew'}
      </button>
    </form>
  );
}

export default function Landing({ setPage, mode = 'home' }) {
  const headingWrapRef = useRef(null);
  const [viewportWidth, setViewportWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1440);
  const [heroHeadingSize, setHeroHeadingSize] = useState(48);

  useEffect(() => {
    const onResize = () => {
      setViewportWidth(window.innerWidth);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const lineText = 'Cut. Cleaned. Done Right.';

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
  const ctaStackWidth = Math.max(220, Math.min(420, Math.floor(viewportWidth * (isMobileHero ? 0.88 : 0.34))));

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
            <h1 style={{ fontSize: isMobileHero ? '34px' : '42px', fontWeight: 800, marginBottom: '8px' }}>Join Our Crew</h1>
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
        background: 'radial-gradient(ellipse at 50% 0%, #4ade8022 0%, transparent 60%)',
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
            🌱 Downriver Michigan's Trusted Lawn Crew
          </div>

          <div ref={headingWrapRef} style={{ position: 'relative', maxWidth: isStackedHero ? '100%' : '800px', marginBottom: '16px' }}>
            <span style={{ position: 'absolute', top: isMobileHero ? '-14px' : '-18px', left: isMobileHero ? '0px' : '-4px', fontSize: isMobileHero ? '18px' : '20px', color: 'var(--accent-teal)', opacity: 0.95 }}>♪</span>
            <span style={{ position: 'absolute', top: isMobileHero ? '-8px' : '6px', right: isMobileHero ? '4px' : '14px', fontSize: isMobileHero ? '16px' : '18px', color: 'var(--accent-teal)', opacity: 0.85 }}>♫</span>
            <span style={{ position: 'absolute', bottom: isMobileHero ? '-4px' : '-10px', right: isMobileHero ? '24px' : '70px', fontSize: isMobileHero ? '15px' : '16px', color: 'var(--accent-teal)', opacity: 0.7 }}>♬</span>
            <h1 style={{ fontSize: `${heroHeadingSize}px`, fontWeight: 800, lineHeight: 1.1, marginBottom: 0, whiteSpace: 'nowrap' }}>
              Cut. Cleaned. <span style={{ color: 'var(--accent-teal)' }}>Done Right.</span>
            </h1>
          </div>

          <p style={{ fontSize: isMobileHero ? '16px' : '18px', color: 'var(--text-muted)', maxWidth: '560px', lineHeight: 1.7, marginBottom: '24px' }}>
            Weekly lawn cutting, fall leaf removal, and free landscaping quotes — with upfront pricing and a crew that shows up when we say we will.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center', width: 'min(100%, ' + ctaStackWidth + 'px)', margin: '0 auto' }}>
            <button className="btn-primary" onClick={() => setPage('quote')} style={{ padding: '14px 28px', fontSize: '16px', width: '100%' }}>
              Request a Quote
            </button>
            <button className="btn-ghost" onClick={() => setPage('technician-apply')} style={{ padding: '14px 28px', fontSize: '16px', width: '100%' }}>
              Join Our Crew
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
          <p style={{ color: 'var(--text-muted)', fontSize: '16px' }}>Everything your yard needs, done right the first time.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
          {ALL_SERVICES.map(service => (
            <div key={service.id} className="card" style={{ textAlign: 'center', padding: '28px 20px', cursor: 'pointer' }} onClick={() => { setPage(service.id); window.scrollTo(0, 0); }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>{service.icon}</div>
              <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: '8px', color: 'var(--text-primary)' }}>{service.name}</div>
              <div style={{ color: 'var(--accent-teal)', fontWeight: 600, fontSize: '14px' }}>
                {service.startingPrice ? `Starting at $${service.startingPrice}` : service.priceNote}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', borderTop: '1px solid var(--border)' }}>
        © 2026 {COMPANY_INFO.name} · Downriver Michigan · Licensed &amp; Insured
      </footer>
    </div>
  );
}
