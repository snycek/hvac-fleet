import { ALL_SERVICES } from '../data/services.js';

const HIGHLIGHT_IDS = ['ac-repair', 'furnace-repair', 'ac-install', 'furnace-install', 'duct-cleaning'];
const EMERGENCY_CARD = {
  id: 'emergency',
  name: 'Emergency Service',
  categoryIcon: '&#128680;',
  startingPrice: null,
  priceNote: '24/7 — call now',
  isEmergency: true,
};

const TRUST_BADGES = [
  { icon: '&#128203;', label: 'Licensed & Insured' },
  { icon: '&#127757;', label: 'EPA Certified' },
  { icon: '&#9989;', label: 'NATE Certified' },
  { icon: '&#11088;', label: 'BBB Accredited' },
];

export default function Home({ setPage }) {
  const highlights = HIGHLIGHT_IDS.map(id => ALL_SERVICES.find(s => s.id === id)).filter(Boolean);

  return (
    <div>
      {/* Hero */}
      <section className="page-hero" style={{ background: 'radial-gradient(ellipse at 50% 0%, #0fd3c322 0%, transparent 60%)' }}>
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
        }}>
          Downriver Michigan's Trusted HVAC Fleet
        </div>
        <h1 style={{ lineHeight: 1.4 }}>
          No Sweat.<br />
          No Freeze.<br />
          <span style={{ color: 'var(--accent-teal)' }}>Just DuctTales!</span>
        </h1>
        <p style={{ maxWidth: '560px', margin: '0 auto 24px', lineHeight: 1.7 }}>
          We give a duct about your comfort. Real-time dispatch, certified technicians, and upfront pricing — keeping Downriver comfortable, year-round.
        </p>
        <button className="btn-primary" onClick={() => setPage('request-service')} style={{ padding: '14px 32px', fontSize: '16px' }}>
          Request Service
        </button>
      </section>

      {/* Service Cards */}
      <section style={{ marginBottom: '48px' }}>
        <h2 style={{ fontSize: '28px', fontWeight: 700, textAlign: 'center', marginBottom: '24px' }}>Our Services</h2>
        <div className="service-grid">
          {highlights.map(service => (
            <div key={service.id} className="card" style={{ textAlign: 'center', padding: '28px 20px', cursor: 'pointer' }} onClick={() => setPage(service.id)}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>{service.categoryIcon}</div>
              <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: '8px' }}>{service.name}</div>
              {service.startingPrice && (
                <div style={{ color: 'var(--accent-teal)', fontWeight: 600, fontSize: '14px', marginBottom: '12px' }}>
                  Starting at ${service.startingPrice}
                </div>
              )}
              {!service.startingPrice && (
                <div style={{ color: 'var(--accent-teal)', fontWeight: 600, fontSize: '14px', marginBottom: '12px' }}>
                  {service.priceNote || 'Free estimate'}
                </div>
              )}
              <span style={{ color: 'var(--accent-blue)', fontSize: '13px', fontWeight: 600 }}>Learn More &rarr;</span>
            </div>
          ))}
          {/* Emergency card */}
          <div className="card" style={{ textAlign: 'center', padding: '28px 20px', cursor: 'pointer', borderColor: '#da3633' }} onClick={() => window.location.href = 'tel:3133789982'}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>&#128680;</div>
            <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: '8px' }}>Emergency Service</div>
            <div style={{ color: '#da3633', fontWeight: 600, fontSize: '14px', marginBottom: '12px' }}>24/7 — Call Now</div>
            <span style={{ color: 'var(--accent-blue)', fontSize: '13px', fontWeight: 600 }}>(313) 378-9982</span>
          </div>
        </div>
      </section>

      {/* Trust Badges */}
      <section className="trust-badges">
        {TRUST_BADGES.map(badge => (
          <div key={badge.label} className="trust-badge">
            <span dangerouslySetInnerHTML={{ __html: badge.icon }} />
            <span>{badge.label}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
