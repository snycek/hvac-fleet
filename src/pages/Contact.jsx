import { useRef, useState } from 'react';
import { COMPANY_INFO } from '../data/services.js';

const REQUEST_CHOICES = [
  {
    id: 'furnace_inspection',
    title: "I'm Freezing",
    subtitle: 'Furnace inspection request',
    icon: '\uD83E\uDD76',
    serviceName: 'Furnace Inspection',
    earnings: 200,
  },
  {
    id: 'ac_inspection',
    title: "I'm Sweating",
    subtitle: 'AC inspection request',
    icon: '\uD83E\uDD75',
    serviceName: 'AC Inspection',
    earnings: 200,
  },
];

const DEFAULT_BEST_TIME = 'ASAP \u2013 Emergency';

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
      try { data = raw ? JSON.parse(raw) : {}; } catch (_) { data = {}; }
      if (!res.ok) throw new Error(data.error || `Unable to submit request (HTTP ${res.status}).`);
      setState('success');
      setForm({ name: '', email: '', phone: '', address: '', city: '', zip: '', requestChoice: '', bestTime: DEFAULT_BEST_TIME, message: '' });
      if (onSuccess) setTimeout(() => onSuccess(), 1500);
    } catch (err) {
      setState('error');
      setErrMsg(err.message || 'Unable to reach the server.');
      if (onSuccess) setTimeout(() => onSuccess(), 2500);
    }
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit} autoComplete="on" style={{ display: 'flex', flexDirection: 'column', gap: formGap }}>
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

      <div>
        <label className="form-label">Email Address</label>
        <input className="form-input" style={controlStyle} type="email" name="email" value={form.email} onChange={handleChange} placeholder="john@example.com" autoComplete="section-service email" />
      </div>

      <div>
        <label className="form-label">Service Address *</label>
        <input className="form-input" style={controlStyle} name="address" value={form.address} onChange={handleChange} placeholder="1234 Oak St" autoComplete="section-service street-address" required />
      </div>

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

      <div>
        <label className="form-label">What are you feeling right now? *</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px', marginTop: '6px' }}>
          {REQUEST_CHOICES.map(choice => {
            const selected = form.requestChoice === choice.id;
            return (
              <button key={choice.id} type="button" onClick={() => setForm(f => ({ ...f, requestChoice: choice.id }))}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  ...choiceCardStyle, borderRadius: '8px', cursor: 'pointer',
                  border: `2px solid ${selected ? 'var(--accent-teal)' : 'var(--border)'}`,
                  background: selected ? 'var(--accent-teal)15' : 'var(--bg-elevated)',
                  textAlign: 'left', transition: 'border-color 0.15s, background 0.15s',
                }}>
                <span style={{ fontSize: '24px', flexShrink: 0 }}>{choice.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: selected ? 'var(--accent-teal)' : 'var(--text-primary)', lineHeight: 1.3 }}>{choice.title}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{choice.subtitle}</div>
                </div>
                {selected && <span style={{ color: 'var(--accent-teal)', fontSize: '16px', flexShrink: 0 }}>&#10003;</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="form-label">Best Time to Call</label>
        <select className="form-input" style={controlStyle} name="bestTime" value={form.bestTime} onChange={handleChange}>
          <option value="">Any time</option>
          <option value="Morning (8am\u201312pm)">Morning (8am-12pm)</option>
          <option value="Afternoon (12pm\u20135pm)">Afternoon (12pm-5pm)</option>
          <option value="Evening (5pm\u20138pm)">Evening (5pm-8pm)</option>
          <option value={DEFAULT_BEST_TIME}>{DEFAULT_BEST_TIME}</option>
        </select>
      </div>

      <div>
        <label className="form-label">Additional Details</label>
        <textarea className="form-input" style={{ ...controlStyle, resize: 'vertical' }} name="message" value={form.message} onChange={handleChange}
          rows={compact ? 2 : 3} placeholder="Describe your issue \u2014 age of unit, symptoms, anything helpful\u2026" />
      </div>

      {state === 'success' && (
        <div style={{ background: '#3fb95022', border: '1px solid #3fb95055', borderRadius: '8px', padding: '12px 16px', color: '#3fb950', fontSize: '14px' }}>
          Request received! We'll be in touch shortly.
        </div>
      )}
      {state === 'error' && (
        <div style={{ background: '#f8514922', border: '1px solid #f8514955', borderRadius: '8px', padding: '12px 16px', color: '#f85149', fontSize: '14px' }}>
          {errMsg || 'Something went wrong. Please try again.'}
        </div>
      )}

      <button type="submit" className="btn-primary" disabled={state === 'loading'} style={{ alignSelf: 'flex-start', padding: compact ? '10px 20px' : '12px 28px', fontSize: compact ? '14px' : '15px' }}>
        {state === 'loading' ? 'Sending\u2026' : 'Request Service'}
      </button>
    </form>
  );
}

export default function Contact({ setPage }) {
  return (
    <div style={{ maxWidth: '800px' }}>
      <h1 style={{ fontSize: '36px', fontWeight: 800, marginBottom: '8px' }}>Contact Us</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '16px', marginBottom: '32px' }}>
        Ready to get comfortable? Reach out or fill out the form below.
      </p>

      {/* Contact Info */}
      <div className="card" style={{ marginBottom: '24px', padding: '24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '4px' }}>Phone</div>
            <a href="tel:3133789982" style={{ color: 'var(--accent-teal)', fontWeight: 600, textDecoration: 'none', fontSize: '15px' }}>
              {COMPANY_INFO.phone}
            </a>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '4px' }}>Email</div>
            <a href={`mailto:${COMPANY_INFO.email}`} style={{ color: 'var(--accent-teal)', fontWeight: 600, textDecoration: 'none', fontSize: '15px' }}>
              {COMPANY_INFO.email}
            </a>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '4px' }}>Area</div>
            <div style={{ fontSize: '14px' }}>{COMPANY_INFO.address}</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '4px' }}>Hours</div>
            <div style={{ fontSize: '14px' }}>{COMPANY_INFO.hours}</div>
          </div>
        </div>
      </div>

      {/* Contact Form */}
      <div className="card" style={{ padding: '28px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>Request Service</h3>
        <ContactForm onSuccess={() => { setPage('home'); window.scrollTo(0, 0); }} />
      </div>
    </div>
  );
}
