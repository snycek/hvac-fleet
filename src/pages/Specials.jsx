import { SPECIALS } from '../data/services.js';

export default function Specials({ setPage }) {
  return (
    <div style={{ maxWidth: '800px' }}>
      <h1 style={{ fontSize: '36px', fontWeight: 800, marginBottom: '8px' }}>Current Specials</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '16px', marginBottom: '32px' }}>
        Save on the services you need. Mention these offers when you book.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {SPECIALS.map((special, i) => (
          <div key={i} className="card" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>{special.title}</h3>
            <p style={{ fontSize: '14px', lineHeight: 1.7, color: 'var(--text-muted)', marginBottom: special.code ? '12px' : '0' }}>
              {special.description}
            </p>
            {special.code && (
              <div style={{
                display: 'inline-block',
                background: 'var(--accent-teal)15',
                border: '1px dashed var(--accent-teal)',
                borderRadius: '6px',
                padding: '6px 16px',
                fontSize: '14px',
                fontWeight: 700,
                color: 'var(--accent-teal)',
                letterSpacing: '1px',
              }}>
                {special.code}
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ marginTop: '32px', textAlign: 'center' }}>
        <button className="btn-primary" onClick={() => { setPage('quote'); window.scrollTo(0, 0); }} style={{ padding: '12px 28px', fontSize: '15px' }}>
          Request a Quote
        </button>
      </div>
    </div>
  );
}
