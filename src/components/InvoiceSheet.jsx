import { COMPANY_INFO } from '../data/services.js';
import { formatDay } from '../lib/dates.js';

const usd = n => `$${Number(n || 0).toFixed(2)}`;
const longDate = d => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const shortDate = d => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });

/**
 * One printed invoice (US Letter), left at the door after the visit. The QR opens the
 * customer's account so they can pay by card; cash/check still welcome.
 */
export default function InvoiceSheet({ invoice, qr, payUrl, crew }) {
  const { customer, current, previous, previousTotal, total } = invoice;
  const site = payUrl ? new URL(payUrl).host : '';
  // Keep it to one page: list the 6 most recent unpaid visits, sum up the rest.
  const SHOW = 6;
  const older = previous.slice(0, Math.max(0, previous.length - SHOW));
  const shown = previous.slice(-SHOW);
  return (
    <article className="invoice-sheet" data-pay-url={payUrl}>
      <header className="inv-head">
        <div>
          <div className="inv-brand"><span aria-hidden="true">🌱</span> {COMPANY_INFO.name}</div>
          <div className="inv-tag">{COMPANY_INFO.tagline}</div>
          <div className="inv-contact">
            {COMPANY_INFO.phone} · {COMPANY_INFO.email}<br />
            {site}
            {COMPANY_INFO.mailingAddress && <><br />{COMPANY_INFO.mailingAddress}</>}
          </div>
        </div>
        <div className="inv-meta">
          <div className="inv-title">INVOICE</div>
          <table>
            <tbody>
              <tr><th>Invoice #</th><td>{invoice.invoiceNo}</td></tr>
              <tr><th>Invoice date</th><td>{longDate(invoice.invoiceDate)}</td></tr>
              <tr><th>Due date</th><td><b>{longDate(invoice.dueDate)}</b></td></tr>
            </tbody>
          </table>
        </div>
      </header>

      <section className="inv-parties">
        <div>
          <div className="inv-label">Bill to</div>
          <div className="inv-strong">{customer.name}</div>
          <div>{customer.address}</div>
          {customer.phone && <div>{customer.phone}</div>}
        </div>
        <div>
          <div className="inv-label">This visit</div>
          <div className="inv-strong">{formatDay(current.date)}</div>
          {crew && <div>Your crew: {crew}</div>}
        </div>
      </section>

      <table className="inv-lines">
        <thead>
          <tr><th>Date</th><th>Description</th><th>Invoice #</th><th className="num">Amount</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>{shortDate(current.date)}</td>
            <td>{current.service}{current.paid ? ' — paid, thank you' : ''}</td>
            <td>{current.invoiceNo}</td>
            <td className="num">{usd(current.amount)}</td>
          </tr>
          {previous.length > 0 && (
            <tr className="inv-sub"><td colSpan={4}>Previous balance — earlier visits not yet paid</td></tr>
          )}
          {older.length > 0 && (
            <tr>
              <td>{shortDate(older[0].date)}–{shortDate(older[older.length - 1].date)}</td>
              <td>{older.length} earlier visit{older.length === 1 ? '' : 's'}<span className="inv-pastdue"> · PAST DUE</span></td>
              <td>see your account</td>
              <td className="num">{usd(older.reduce((s, l) => s + l.amount, 0))}</td>
            </tr>
          )}
          {shown.map(l => (
            <tr key={l.id}>
              <td>{shortDate(l.date)}</td>
              <td>{l.service}{l.pastDue ? <span className="inv-pastdue"> · PAST DUE</span> : ''}</td>
              <td>{l.invoiceNo}</td>
              <td className="num">{usd(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="inv-totals">
        <div><span>This visit</span><span>{current.paid ? 'Paid' : usd(current.amount)}</span></div>
        {previous.length > 0 && <div><span>Previous balance</span><span>{usd(previousTotal)}</span></div>}
        <div className="inv-total"><span>Total due</span><span>{usd(total)}</span></div>
      </div>

      <section className="inv-pay">
        <div className="inv-qr">
          {qr ? <img src={qr} alt="QR code to pay this invoice" /> : <div className="inv-qr-wait">QR…</div>}
        </div>
        <div className="inv-pay-text">
          <div className="inv-pay-title">Scan to pay</div>
          <p>Point your phone's camera at the code. It opens <b>your account</b> — no password needed — where you can pay by card and see past visits.</p>
          <p className="inv-other"><b>Other ways to pay:</b> cash or check made out to <b>"{COMPANY_INFO.name}"</b>{COMPANY_INFO.mailingAddress ? <> — hand it to your crew or mail it to {COMPANY_INFO.mailingAddress}</> : ' — hand it to your crew on the next visit'}. Please write <b>{invoice.invoiceNo}</b> on your check.</p>
        </div>
      </section>

      <section className="inv-notes">
        <div className="inv-label">Notes from your crew</div>
        <div className="inv-line" /><div className="inv-line" />
      </section>

      <footer className="inv-foot">
        Thank you for your business! Questions about this invoice? Call or text {COMPANY_INFO.phone}.
      </footer>
    </article>
  );
}
