import { COMPANY_INFO } from '../data/services.js';

export default function Contact({ setPage }) {
  return (
    <div style={{ maxWidth: '800px' }}>
      <h1 style={{ fontSize: '36px', fontWeight: 800, marginBottom: '8px' }}>Contact Us</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '16px', marginBottom: '32px' }}>
        Ready for a better-looking yard? Reach out or fill out the form below.
      </p>

      {/* Contact Info */}
      <div className="card" style={{ marginBottom: '24px', padding: '24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '4px' }}>Phone</div>
            <a href={COMPANY_INFO.phoneHref} style={{ color: 'var(--accent-teal)', fontWeight: 600, textDecoration: 'none', fontSize: '15px' }}>
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

      {/* Quote CTA */}
      <div className="card" style={{ padding: '28px', textAlign: 'center' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>Need service?</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '16px' }}>Request a quote online in about two minutes — you'll see an estimate right away.</p>
        <button className="btn-primary" onClick={() => { setPage('quote'); window.scrollTo(0, 0); }} style={{ padding: '12px 28px', fontSize: '15px' }}>
          Request a Quote
        </button>
      </div>
    </div>
  );
}
