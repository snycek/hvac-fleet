import { useEffect, useMemo, useState } from 'react';
import { COMPANY_INFO } from '../data/services.js';
import { readDemoAccount } from '../lib/invoices.js';
import { simulateCardCharge } from '../lib/payments.js';

// Customer account, opened by scanning the QR on a paper invoice (/pay/<link>).
// The link signs them in — no password. Demo invoices carry the account in the link
// (/pay/demo#…), so they work without the server.

const SAVED = 'johnsPortalLink';
const usd = n => `$${Number(n || 0).toFixed(2)}`;
const niceDate = d => new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
// Testing: payments complete the moment Pay is tapped (test Visa ••4242). A real card
// processor (e.g. Stripe) replaces this before customers pay for real.
const TEST_CARD = '4242';

function linkFromLocation() {
  const parts = window.location.pathname.split('/').filter(Boolean); // ['pay', token]
  if (parts[1] === 'demo') return { demo: true, hash: window.location.hash.slice(1) };
  if (parts[1]) return { token: parts[1] };
  try { const saved = localStorage.getItem(SAVED); if (saved) return { token: saved }; } catch { /* private mode */ }
  return {};
}

export default function CustomerPortal() {
  const link = useMemo(linkFromLocation, []);
  const [account, setAccount] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null); // ids to pay (null = all open)
  const [paying, setPaying] = useState(false);
  const [receipt, setReceipt] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (link.demo) {
        const a = readDemoAccount(link.hash);
        if (a) setAccount(a); else setError('This demo link is damaged. Ask John for a new invoice.');
        return;
      }
      if (!link.token) { setError('Scan the QR code on your invoice to open your account.'); return; }
      try {
        const res = await fetch(`/api/portal/${encodeURIComponent(link.token)}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || 'Could not open your account.');
        setAccount(data);
        try { localStorage.setItem(SAVED, link.token); } catch { /* private mode */ }
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => { cancelled = true; };
  }, [link]);

  if (error) return <Shell><div className="portal-card"><p>{error}</p><Contact /></div></Shell>;
  if (!account) return <Shell><div className="portal-card portal-muted">Opening your account…</div></Shell>;

  // Visits with a check already on the way aren't picked for paying again by default.
  const ids = selected ?? account.open.filter(l => !l.checkPending).map(l => l.id);
  const toPay = account.open.filter(l => ids.includes(l.id));
  const onTheWay = account.open.filter(l => l.checkPending);

  // "I'll pay by check": the visits stay open until John gets the check.
  const promiseCheck = async ({ how, number }) => {
    const now = new Date().toISOString();
    if (link.demo) {
      setAccount(a => ({ ...a, open: a.open.map(l => (ids.includes(l.id) ? { ...l, checkPending: { at: now, how, number } } : l)) }));
    } else {
      const res = await fetch(`/api/portal/${encodeURIComponent(link.token)}/check`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobIds: toPay.map(l => l.id), how, number }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save that. Please call us.');
      setAccount(a => ({ ...a, ...data.account }));
    }
    setReceipt({ check: true, amount, how, number, at: now, count: toPay.length });
    setSelected(null);
  };
  const amount = toPay.reduce((s, l) => s + l.amount, 0);
  const first = String(account.customer.name || '').split(' ')[0];

  const pay = async (card) => {
    setError('');
    if (link.demo) {
      const r = simulateCardCharge({ jobIds: toPay.map(l => l.id), amount, last4: card.last4 });
      if (r.status !== 'succeeded') throw new Error(`${r.brand} ••${r.last4} was declined: ${r.reason}. Try another card.`);
      const now = new Date().toISOString();
      setAccount(a => {
        const open = a.open.filter(l => !ids.includes(l.id));
        return { ...a, open, balance: open.reduce((s, l) => s + l.amount, 0), paid: [...toPay.map(l => ({ ...l, paid: true, paidAt: now })), ...a.paid] };
      });
      setReceipt({ amount, brand: r.brand, last4: r.last4, at: now, id: r.processorId, count: toPay.length });
      setSelected(null);
      return;
    }
    const res = await fetch(`/api/portal/${encodeURIComponent(link.token)}/pay`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobIds: toPay.map(l => l.id), last4: card.last4 }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Payment did not go through.');
    setAccount(a => ({ ...a, ...data.account }));
    setReceipt({ amount: data.payment.amount, brand: data.payment.brand, last4: data.payment.last4, at: data.payment.at, id: data.payment.processorId, count: data.payment.jobIds.length });
    setSelected(null);
  };

  return (
    <Shell>
      <div className="portal-hello">Hi {first} 👋</div>
      <div className="portal-muted">{account.customer.address}</div>

      {receipt?.check && (
        <div className="portal-card portal-receipt" role="status">
          <div className="portal-big">📨 Thanks — we'll watch for your check</div>
          <div className="portal-amount">{usd(receipt.amount)}</div>
          <div className="portal-muted">
            {receipt.how === 'crew' ? 'Hand it to your crew on the next visit.' : `Mail it to ${COMPANY_INFO.mailingAddress || 'the address on your invoice'}.`}
            {' '}Make it out to “{COMPANY_INFO.name}”{receipt.number ? ` · check #${receipt.number}` : ''}.
          </div>
          <div className="portal-muted" style={{ fontSize: '12px' }}>We'll mark {receipt.count === 1 ? 'this visit' : `these ${receipt.count} visits`} paid when it arrives. No reminders in the meantime.</div>
        </div>
      )}
      {receipt && !receipt.check && (
        <div className="portal-card portal-receipt" role="status">
          <div className="portal-big">✅ Payment received</div>
          <div className="portal-amount">{usd(receipt.amount)}</div>
          <div className="portal-muted">{receipt.brand} ••{receipt.last4} · {niceDate(receipt.at)} · {receipt.count} visit{receipt.count === 1 ? '' : 's'}</div>
          <div className="portal-muted" style={{ fontSize: '12px' }}>Confirmation {receipt.id}</div>
        </div>
      )}

      <div className="portal-card">
        <div className="portal-label">Balance due</div>
        <div className="portal-amount">{usd(account.balance)}</div>
        {onTheWay.length > 0 && <div className="portal-muted">📨 {usd(onTheWay.reduce((s, l) => s + l.amount, 0))} of that is covered by a check on the way.</div>}
        {account.open.length === 0 && <div className="portal-good">You're all paid up. Thank you! 🌱</div>}
        {account.open.length > 0 && (
          <>
            <ul className="portal-list">
              {account.open.map(l => (
                <li key={l.id}>
                  <label>
                    <input type="checkbox" checked={ids.includes(l.id)} onChange={e => setSelected(e.target.checked ? [...ids, l.id] : ids.filter(x => x !== l.id))} />
                    <span className="portal-line">
                      <b>{niceDate(l.date)}</b> · {l.service}
                      {l.checkPending ? <span className="portal-check"> · 📨 check on the way</span> : l.pastDue && <span className="portal-pastdue"> · past due</span>}
                      <span className="portal-muted portal-small">Invoice {l.invoiceNo}</span>
                    </span>
                    <span className="portal-line-amt">{usd(l.amount)}</span>
                  </label>
                </li>
              ))}
            </ul>
            {amount > 0 && <PayButton amount={amount} paying={paying} setPaying={setPaying} onPay={pay} demo={link.demo} />}
            {amount > 0 && <CheckOption amount={amount} onPromise={promiseCheck} />}
          </>
        )}
      </div>

      {account.upcoming?.length > 0 && (
        <div className="portal-card">
          <div className="portal-label">Coming up</div>
          <ul className="portal-plain">{account.upcoming.map(l => <li key={l.id}>{niceDate(l.date)} · {l.service} · {usd(l.amount)}</li>)}</ul>
        </div>
      )}

      {account.paid?.length > 0 && (
        <div className="portal-card">
          <div className="portal-label">Paid</div>
          <ul className="portal-plain">{account.paid.map(l => <li key={l.id}>{niceDate(l.date)} · {l.service} · {usd(l.amount)} <span className="portal-good">✓</span></li>)}</ul>
        </div>
      )}

      <Contact />
    </Shell>
  );
}

function PayButton({ amount, paying, setPaying, onPay, demo }) {
  const [err, setErr] = useState('');
  const go = async () => {
    setErr('');
    setPaying(true);
    try { await onPay({ last4: TEST_CARD }); }
    catch (ex) { setErr(ex.message); }
    finally { setPaying(false); }
  };
  return (
    <div className="portal-form">
      <div className="portal-test">Test mode{demo ? ' (demo)' : ''} — tapping Pay completes the payment right away. No real money moves.</div>
      {err && <div className="portal-error" role="alert">{err}</div>}
      <button type="button" className="portal-pay" disabled={paying} onClick={go}>{paying ? 'Paying…' : `Pay ${usd(amount)}`}</button>
    </div>
  );
}

// Paying by check instead: mail it or hand it to the crew (check number optional).
function CheckOption({ amount, onPromise }) {
  const [open, setOpen] = useState(false);
  const [how, setHow] = useState('mail');
  const [number, setNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!open) return <button type="button" className="portal-alt" onClick={() => setOpen(true)}>Paying by check instead?</button>;
  const go = async () => {
    setErr(''); setBusy(true);
    try { await onPromise({ how, number: number.trim() }); setOpen(false); setNumber(''); }
    catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="portal-checkform">
      <div className="portal-label">Pay {usd(amount)} by check</div>
      <div className="portal-choice" role="radiogroup" aria-label="How you'll get it to us">
        <label><input type="radio" name="how" checked={how === 'mail'} onChange={() => setHow('mail')} /> I'll mail it</label>
        <label><input type="radio" name="how" checked={how === 'crew'} onChange={() => setHow('crew')} /> I'll hand it to the crew</label>
      </div>
      <input className="portal-input" inputMode="numeric" placeholder="Check # (optional)" aria-label="Check number" value={number} onChange={e => setNumber(e.target.value.slice(0, 12))} />
      <div className="portal-muted portal-small">Make it out to “{COMPANY_INFO.name}”{how === 'mail' && COMPANY_INFO.mailingAddress ? ` and mail to ${COMPANY_INFO.mailingAddress}` : ''}.</div>
      {err && <div className="portal-error" role="alert">{err}</div>}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button type="button" className="portal-pay" disabled={busy} onClick={go}>{busy ? 'Saving…' : `I'll send a check for ${usd(amount)}`}</button>
        <button type="button" className="portal-alt" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

function Shell({ children }) {
  return (
    <div className="portal">
      <header className="portal-top"><span aria-hidden="true">🌱</span> {COMPANY_INFO.name}</header>
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
