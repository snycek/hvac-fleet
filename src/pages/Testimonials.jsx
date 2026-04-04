import { TESTIMONIALS } from '../data/services.js';

export default function Testimonials() {
  return (
    <div>
      <h1 style={{ fontSize: '36px', fontWeight: 800, marginBottom: '8px' }}>What Our Customers Say</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '16px', marginBottom: '32px' }}>
        Real reviews from real Downriver homeowners.
      </p>

      <div className="service-grid">
        {TESTIMONIALS.map((t, i) => (
          <div key={i} className="card" style={{ padding: '24px' }}>
            <div style={{ marginBottom: '12px' }}>
              {Array.from({ length: 5 }, (_, s) => (
                <span key={s} style={{ color: s < t.rating ? '#f0b429' : 'var(--border)', fontSize: '16px' }}>
                  &#9733;
                </span>
              ))}
            </div>
            <p style={{ fontSize: '14px', lineHeight: 1.7, color: 'var(--text-primary)', marginBottom: '16px' }}>
              "{t.text}"
            </p>
            <div style={{ fontSize: '13px' }}>
              <span style={{ fontWeight: 600 }}>{t.name}</span>
              <span style={{ color: 'var(--text-muted)' }}> &middot; {t.location}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
