import { useEffect, useMemo, useState } from 'react';
import { COMPANY_INFO } from '../data/services.js';
import { readDemoQuote } from '../lib/landscape.js';

// Customer's landscaping quote, opened from the email/text link (/quote/<link>).
// The link is signed, so no password. Demo quotes carry the quote in the link
// (/quote/demo#…) and work without the server.

const usd = n => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const niceDay = d => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : '');

function linkFromLocation() {
  const parts = window.location.pathname.split('/').filter(Boolean); // ['quote', token]
  if (parts[1] === 'demo') return { demo: true, hash: window.location.hash.slice(1) };
  return { token: parts[1] || '' };
}

export default function QuotePage() {
  const link = useMemo(linkFromLocation, []);
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (link.demo) {
        const q = readDemoQuote(link.hash);
        if (q) setQuote(q); else setError('This demo link is damaged.');
        return;
      }
      if (!link.token) { setError('Open the link from your email or text to see your quote.'); return; }
      try {
        const res = await fetch(`/api/portal/quote/${encodeURIComponent(link.token)}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || 'Could not open your quote.');
        setQuote(data);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => { cancelled = true; };
  }, [link]);

  const answer = async (what) => {
    setBusy(true);
    setError('');
    try {
      if (link.demo) {
        setQuote(q => ({ ...q, status: what === 'accept' ? 'accepted' : 'declined', scheduledDate: q.offer.startDate }));
      } else {
        const res = await fetch(`/api/portal/quote/${encodeURIComponent(link.token)}/${what}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { if (data.quote) setQuote(data.quote); throw new Error(data.error || 'Could not save that. Please call us.'); }
        setQuote(data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!quote) return <Shell>{error ? <div className="portal-card"><p>{error}</p><Contact /></div> : <div className="portal-card portal-muted">Opening your quote…</div>}</Shell>;

  const first = String(quote.customer?.name || '').split(' ')[0];
  const o = quote.offer || { items: [], total: 0 };

  return (
    <Shell>
      <div className="portal-hello">Hi {first} 👋</div>
      <div className="portal-muted">Your landscaping quote · {quote.customer?.address}</div>

      {quote.status === 'accepted' && (
        <div className="portal-card portal-receipt" role="status">
          <div className="portal-big">✅ You're on the schedule</div>
          <div className="portal-muted">Our landscaping crew starts <b>{niceDay(quote.scheduledDate || o.startDate)}</b>. We'll bill you when the job is done. Thank you!</div>
        </div>
      )}
      {quote.status === 'declined' && (
        <div className="portal-card" role="status">
          <div className="portal-big" style={{ color: '#5b6470' }}>No problem. We won't do this one.</div>
          <div className="portal-muted">If you change your mind or want a different price, give us a call.</div>
        </div>
      )}
      {quote.status === 'closed' && (
        <div className="portal-card"><div className="portal-muted">This quote is no longer available. Give us a call and we'll put together a new one.</div></div>
      )}

      <div className="portal-card">
        <div className="portal-label">Quote</div>
        <ul className="portal-list quote-lines">
          {o.items.map((i, n) => (
            <li key={n}><span className="portal-line">{i.label}</span><span className="portal-line-amt">{usd(i.amount)}</span></li>
          ))}
        </ul>
        <div className="quote-total"><span>Total</span><span className="portal-amount">{usd(o.total)}</span></div>
        {o.startDate && <div className="portal-muted">We can start <b>{niceDay(o.startDate)}</b>.</div>}
        {o.note && <div className="quote-note">📝 {o.note}</div>}

        {quote.status === 'quote_sent' && (
          <div className="quote-actions">
            {error && <div className="portal-error">{error}</div>}
            <button type="button" className="portal-pay" disabled={busy} onClick={() => answer('accept')}>{busy ? 'Saving…' : `Accept · ${usd(o.total)}`}</button>
            {!declining ? (
              <button type="button" className="quote-decline" disabled={busy} onClick={() => setDeclining(true)}>Decline</button>
            ) : (
              <div className="portal-form">
                <label>Anything we should know? (optional)<input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Going with a smaller project" /></label>
                <div className="portal-row">
                  <button type="button" className="quote-decline" onClick={() => setDeclining(false)}>Back</button>
                  <button type="button" className="quote-decline strong" disabled={busy} onClick={() => answer('decline')}>Decline quote</button>
                </div>
              </div>
            )}
            {link.demo && <div className="portal-test">Demo quote: nothing is saved.</div>}
          </div>
        )}
      </div>

      <Contact />
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div className="portal">
      <header className="portal-top"><span aria-hidden="true">🌳</span> {COMPANY_INFO.name}</header>
      <main className="portal-main">{children}</main>
    </div>
  );
}

function Contact() {
  const digitsOnly = COMPANY_INFO.phone.replace(/\D/g, '');
  return (
    <div className="portal-contact">
      Questions? <a href={`tel:${digitsOnly}`}>Call</a> or <a href={`sms:${digitsOnly}`}>text</a> {COMPANY_INFO.phone}
    </div>
  );
}
