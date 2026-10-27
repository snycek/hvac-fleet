import { ALL_SERVICES, COMPANY_INFO } from '../data/services.js';

const TRUST_BADGES = [
  { icon: '&#128203;', label: 'Licensed & Insured' },
  { icon: '&#127969;', label: 'Locally Owned' },
  { icon: '&#9989;', label: 'Satisfaction Guaranteed' },
  { icon: '&#11088;', label: '5-Star Rated' },
];

export default function Home({ setPage }) {
  const highlights = ALL_SERVICES;

  return (
    <div>
      {/* Hero */}
      <section className="page-hero" style={{ background: 'radial-gradient(ellipse at 50% 0%, #4ade8022 0%, transparent 60%)' }}>
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
          Downriver Michigan's Trusted Lawn Crew
        </div>
        <h1 style={{ lineHeight: 1.4 }}>
          Cut.<br />
          Cleaned.<br />
          <span style={{ color: 'var(--accent-teal)' }}>Done Right.</span>
        </h1>
        <p style={{ maxWidth: '560px', margin: '0 auto 24px', lineHeight: 1.7 }}>
          {COMPANY_INFO.name} keeps Downriver yards sharp — weekly lawn cutting, fall leaf removal, and free landscaping quotes, with upfront pricing and a crew that shows up when we say we will.
        </p>
        <button className="btn-primary" onClick={() => setPage('quote')} style={{ padding: '14px 32px', fontSize: '16px' }}>
          Request a Quote
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
