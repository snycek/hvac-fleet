import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { COMPANY_INFO } from '../data/services.js';
import { OVERTIME_RATE, fmtHours } from '../lib/payroll.js';

const usd = n => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = d => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
const long = d => new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/**
 * A printable pay stub for one person and one week: hours by day, regular and overtime
 * pay, gross, year-to-date, and paid status. Gross only — taxes aren't withheld here.
 */
export default function PayStub({ employee, crewName, stub, ytd, onClose }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const regularPay = stub.regular * employee.rate;
  const otRate = employee.rate * OVERTIME_RATE;
  const otPay = stub.overtime * otRate;

  return createPortal(
    <div className="print-root" role="dialog" aria-label={`Pay stub for ${employee.name}`}>
      <div className="print-toolbar">
        <b>🧾 Pay stub · {employee.name}</b>
        <span>{long(stub.weekStart)} – {long(stub.weekEnd)}</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn-primary" onClick={() => window.print()}>Print</button>
        <button type="button" className="btn-ghost" onClick={onClose}>Close</button>
      </div>
      <div className="print-pages">
        <article className="invoice-sheet stub-sheet">
          <header className="inv-head">
            <div>
              <div className="inv-brand"><span aria-hidden="true">🌱</span> {COMPANY_INFO.name}</div>
              <div className="inv-contact">{COMPANY_INFO.phone} · {COMPANY_INFO.email}</div>
            </div>
            <div className="inv-meta">
              <div className="inv-title">PAY STUB</div>
              <table>
                <tbody>
                  <tr><th>Pay period</th><td>{long(stub.weekStart)} – {long(stub.weekEnd)}</td></tr>
                  <tr><th>Status</th><td><b>{stub.paidAt ? `Paid ${long(stub.paidAt)}` : 'Not paid yet'}</b></td></tr>
                  {stub.checkNo && <tr><th>Check #</th><td>{stub.checkNo}</td></tr>}
                </tbody>
              </table>
            </div>
          </header>

          <section className="inv-parties">
            <div>
              <div className="inv-label">Employee</div>
              <div className="inv-strong">{employee.name}</div>
              <div>{employee.role === 'foreman' ? 'Crew lead' : employee.role === 'shoveler' ? 'Shoveler' : 'Cutter'} · {crewName}</div>
            </div>
            <div>
              <div className="inv-label">Rate</div>
              <div className="inv-strong">{usd(employee.rate)} / hour</div>
              <div>Overtime after 40 h at {OVERTIME_RATE}× ({usd(otRate)} / hour)</div>
            </div>
          </section>

          <table className="inv-lines">
            <thead><tr><th>Day</th><th className="num">Hours</th></tr></thead>
            <tbody>
              {stub.days.map(d => (
                <tr key={d.date}><td>{day(d.date)}</td><td className="num">{d.hours ? fmtHours(d.hours) : '—'}</td></tr>
              ))}
            </tbody>
          </table>

          <table className="inv-lines">
            <thead><tr><th>Earnings</th><th className="num">Hours</th><th className="num">Rate</th><th className="num">Amount</th></tr></thead>
            <tbody>
              <tr><td>Regular</td><td className="num">{fmtHours(stub.regular)}</td><td className="num">{usd(employee.rate)}</td><td className="num">{usd(regularPay)}</td></tr>
              {stub.overtime > 0 && <tr><td>Overtime</td><td className="num">{fmtHours(stub.overtime)}</td><td className="num">{usd(otRate)}</td><td className="num">{usd(otPay)}</td></tr>}
            </tbody>
          </table>

          <div className="inv-totals">
            <div className="inv-total"><span>Gross pay</span><span>{usd(stub.gross)}</span></div>
            <div><span>Year to date (gross)</span><span>{usd(ytd)}</span></div>
          </div>

          <footer className="inv-foot">Gross pay before taxes. Questions about your hours? Talk to your crew lead or call {COMPANY_INFO.phone}.</footer>
        </article>
      </div>
    </div>,
    document.body,
  );
}
