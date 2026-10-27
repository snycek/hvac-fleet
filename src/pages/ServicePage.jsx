import { ALL_SERVICES } from '../data/services.js';

export default function ServicePage({ serviceId, setPage }) {
  const service = ALL_SERVICES.find(s => s.id === serviceId);

  if (!service) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <h1 style={{ fontSize: '28px', marginBottom: '12px' }}>Service Not Found</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>We couldn't find that service.</p>
        <button className="btn-primary" onClick={() => setPage('home')}>Back to Home</button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '800px' }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: '24px' }}>
        <button
          className="btn-ghost"
          onClick={() => setPage('home')}
          style={{ fontSize: '13px', padding: '6px 12px' }}
        >
          &larr; Back to Home
        </button>
      </div>

      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '1px', marginBottom: '8px' }}>
          {service.categoryIcon} {service.category}
        </div>
        <h1 style={{ fontSize: '36px', fontWeight: 800, marginBottom: '8px' }}>{service.name}</h1>
        <p style={{ fontSize: '18px', color: 'var(--accent-teal)', fontWeight: 500 }}>{service.tagline}</p>
      </div>

      {/* Description */}
      <div className="card" style={{ marginBottom: '24px', padding: '28px' }}>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: 'var(--text-primary)' }}>{service.description}</p>
      </div>

      {/* Benefits */}
      <div className="card" style={{ marginBottom: '24px', padding: '28px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>What You Get</h3>
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {service.benefits.map((b, i) => (
            <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px' }}>
              <span style={{ color: 'var(--accent-teal)', fontWeight: 700, fontSize: '16px' }}>&#10003;</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Pricing */}
      <div className="card" style={{ marginBottom: '32px', padding: '28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          {service.startingPrice ? (
            <>
              <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--accent-teal)' }}>${service.startingPrice}</div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{service.priceNote}</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: '22px', fontWeight: 700 }}>Free Estimate</div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{service.priceNote}</div>
            </>
          )}
        </div>
        <button className="btn-primary" onClick={() => { setPage(`quote:${service.id}`); window.scrollTo(0, 0); }} style={{ padding: '12px 28px', fontSize: '15px' }}>
          Request a Quote
        </button>
      </div>
    </div>
  );
}
