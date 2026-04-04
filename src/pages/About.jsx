import { COMPANY_INFO } from '../data/services.js';

export default function About({ setPage, mode = 'story' }) {
  if (mode === 'service-areas') {
    return (
      <div style={{ maxWidth: '800px' }}>
        <h1 style={{ fontSize: '36px', fontWeight: 800, marginBottom: '8px' }}>Service Areas</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '16px', marginBottom: '32px' }}>
          Proudly serving Downriver Michigan and surrounding communities.
        </p>
        <div className="card" style={{ padding: '28px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
            {COMPANY_INFO.serviceAreas.map(area => (
              <div key={area} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px' }}>
                <span style={{ color: 'var(--accent-teal)' }}>&#9679;</span>
                <span>{area}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card" style={{ marginTop: '20px', padding: '20px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '12px' }}>Don't see your area? Give us a call — we may still be able to help.</p>
          <a href="tel:3133789982" className="btn-primary" style={{ textDecoration: 'none', padding: '10px 24px' }}>
            Call (313) 378-9982
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '800px' }}>
      <h1 style={{ fontSize: '36px', fontWeight: 800, marginBottom: '8px' }}>Our Story</h1>
      <p style={{ color: 'var(--accent-teal)', fontSize: '16px', fontWeight: 500, marginBottom: '32px' }}>
        {COMPANY_INFO.tagline}
      </p>

      <div className="card" style={{ marginBottom: '24px', padding: '28px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '12px' }}>About {COMPANY_INFO.name}</h3>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: 'var(--text-primary)', marginBottom: '16px' }}>
          DuctTales HVAC was founded in {COMPANY_INFO.established} with a simple mission: deliver honest, reliable HVAC service to Downriver Michigan. We believe in upfront pricing, real-time dispatch, and technicians who actually care about your comfort.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.8, color: 'var(--text-primary)' }}>
          Every technician on our fleet is background-checked, certified, and equipped with the parts and tools to get the job done right the first time. No upselling, no surprises — just straight-up service.
        </p>
      </div>

      <div className="card" style={{ marginBottom: '24px', padding: '28px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>Credentials & Certifications</h3>
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {COMPANY_INFO.credentials.map(c => (
            <li key={c} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px' }}>
              <span style={{ color: 'var(--accent-teal)', fontWeight: 700 }}>&#10003;</span>
              <span>{c}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="card" style={{ padding: '28px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>Service Areas</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {COMPANY_INFO.serviceAreas.map(area => (
            <span key={area} style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: '20px',
              padding: '4px 14px',
              fontSize: '13px',
              color: 'var(--text-muted)',
            }}>
              {area}
            </span>
          ))}
        </div>
      </div>

      <div style={{ marginTop: '24px', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
          Established {COMPANY_INFO.established} &middot; {COMPANY_INFO.address}
        </p>
      </div>
    </div>
  );
}
