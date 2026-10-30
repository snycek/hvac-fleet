import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { COMPANY_INFO } from '../data/services.js';
import {
  ACCOUNTS, account, balances, generalLedger, journalCsv, journalEntries, monthEnd, monthLabel, monthStart, nextMonth,
  payrollRegister, profitLoss, receivableAging, toCsv,
} from '../lib/books.js';
import { addDays } from '../lib/dates.js';

// Accounting number style: 1,234.56 and (1,234.56) for negatives; blank for zero in columns.
const amt = n => { const v = Math.round((n || 0) * 100) / 100; const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); return v < 0 ? `(${s})` : s; };
const col = n => (n ? amt(n) : '');
const fmtDate = d => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : '');
const longDate = d => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
const prevMonth = m => addDays(monthStart(m), -1).slice(0, 7);

const REPORTS = [
  { id: 'summary', label: 'Summary' },
  { id: 'pl', label: 'Profit & Loss' },
  { id: 'bs', label: 'Balance Sheet' },
  { id: 'tb', label: 'Trial Balance' },
  { id: 'gl', label: 'General Ledger' },
  { id: 'sales', label: 'Sales' },
  { id: 'receipts', label: 'Cash Receipts' },
  { id: 'disb', label: 'Disbursements' },
  { id: 'payroll', label: 'Payroll Register' },
  { id: 'ar', label: 'A/R Aging' },
  { id: 'notes', label: 'Notes' },
];

// The short packet (default): what an accountant reads. The detail reports (trial balance,
// ledger, journals, payroll register) repeat the same numbers; the QuickBooks/Xero import
// file carries that detail, and "Full detail" adds them to the packet when asked for.
const CORE = ['summary', 'pl', 'bs', 'ar', 'notes'];

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Jump to a section on screen. The href stays so links also work in a saved PDF.
const jumpTo = id => e => {
  e.preventDefault();
  document.getElementById(id)?.scrollIntoView({ block: 'start' }); // instant: long sections make smooth scrolling slow
  // Update the packet's highlighted section now, not on the next (possibly delayed) scroll event.
  document.querySelector('.print-root')?.dispatchEvent(new Event('scroll'));
};

/** Packet section bar: jump to any section; highlights the one you're in. Has its own state so
 *  scrolling redraws only this bar, not the whole (long) packet. */
function PacketNav({ rootRef, rowsIn, reports }) {
  const [inView, setInView] = useState('cover');
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // The last section whose top has passed under the toolbar (or the last section once
    // scrolled to the bottom, since a short last section never reaches the top).
    const update = () => {
      const line = root.getBoundingClientRect().top + 130;
      const els = [...root.querySelectorAll('[data-section]')];
      let cur = 'cover';
      els.forEach(el => { if (el.getBoundingClientRect().top <= line) cur = el.dataset.section; });
      if (els.length && root.scrollTop + root.clientHeight >= root.scrollHeight - 4) cur = els.at(-1).dataset.section;
      setInView(cur);
    };
    root.addEventListener('scroll', update, { passive: true });
    update();
    return () => root.removeEventListener('scroll', update);
  }, [rootRef, reports]);
  return (
    <nav className="packet-nav" aria-label="Sections">
      <a href="#pk-cover" onClick={jumpTo('pk-cover')} aria-current={inView === 'cover' ? 'true' : undefined}>Contents</a>
      {reports.map(r => (
        <a key={r.id} href={`#pk-${r.id}`} onClick={jumpTo(`pk-${r.id}`)} aria-current={inView === r.id ? 'true' : undefined}>
          {r.label}{rowsIn[r.id] > 0 && <small>{rowsIn[r.id]}</small>}
        </a>
      ))}
    </nav>
  );
}

/** One report page: company, report name, period, basis, then the body. */
function Sheet({ title, period, basis, children, foot }) {
  return (
    <section className="book-sheet">
      <header className="book-sheet-head">
        <div className="book-co">{COMPANY_INFO.name}</div>
        <h2>{title}</h2>
        <div className="book-period">{period}{basis ? ` · ${basis}` : ''}</div>
      </header>
      {children}
      <footer className="book-sheet-foot">{foot || `Prepared from ${COMPANY_INFO.name} operating records`}</footer>
    </section>
  );
}

function PLTable({ pl, ytd }) {
  const block = (label, key, totalLabel, totalKey) => (pl[key].length || ytd[key].length) ? (
    <>
      <tr className="sec"><td colSpan={3}>{label}</td></tr>
      {[...new Map([...pl[key], ...ytd[key]].map(a => [a.no, a])).values()].sort((a, b) => a.no.localeCompare(b.no)).map(a => (
        <tr key={a.no}><td className="ind">{a.no} · {a.name}</td><td>{amt(pl[key].find(x => x.no === a.no)?.amount || 0)}</td><td>{amt(ytd[key].find(x => x.no === a.no)?.amount || 0)}</td></tr>
      ))}
      <tr className="sub"><td>{totalLabel}</td><td>{amt(pl[totalKey])}</td><td>{amt(ytd[totalKey])}</td></tr>
    </>
  ) : null;
  return (
    <table className="book-table">
      <thead><tr><th /><th>This month</th><th>Year to date</th></tr></thead>
      <tbody>
        {block('Income', 'income', 'Total income', 'totalIncome')}
        {block('Cost of services', 'cogs', 'Total cost of services', 'totalCogs')}
        <tr className="sub strong"><td>Gross profit</td><td>{amt(pl.gross)}</td><td>{amt(ytd.gross)}</td></tr>
        <tr className="pct"><td className="ind">Gross margin</td><td>{pl.totalIncome ? `${((pl.gross / pl.totalIncome) * 100).toFixed(1)}%` : '—'}</td><td>{ytd.totalIncome ? `${((ytd.gross / ytd.totalIncome) * 100).toFixed(1)}%` : '—'}</td></tr>
        {block('Operating expenses', 'expenses', 'Total operating expenses', 'totalExpenses')}
        <tr className="grand"><td>Net income</td><td>{amt(pl.net)}</td><td>{amt(ytd.net)}</td></tr>
      </tbody>
    </table>
  );
}

function BSTable({ now, prior, asOf, priorDate }) {
  const row = (label, a, b, cls) => <tr className={cls}><td className={cls ? undefined : 'ind'}>{label}</td><td>{amt(a)}</td><td>{amt(b)}</td></tr>;
  return (
    <table className="book-table">
      <thead><tr><th /><th>{fmtDate(asOf)}</th><th>{fmtDate(priorDate)}</th></tr></thead>
      <tbody>
        <tr className="sec"><td colSpan={3}>Assets</td></tr>
        {row('1000 · Cash (bank)', now.cash, prior.cash)}
        {row('1200 · Accounts receivable', now.receivable, prior.receivable)}
        {row('Total assets', now.assets, prior.assets, 'grand')}
        <tr className="sec"><td colSpan={3}>Liabilities</td></tr>
        {row('2100 · Wages payable', now.wagesPayable, prior.wagesPayable)}
        {row('Total liabilities', now.liabilities, prior.liabilities, 'sub')}
        <tr className="sec"><td colSpan={3}>Equity</td></tr>
        {row('3900 · Retained earnings', now.retained, prior.retained)}
        {row('Net income, year to date', now.currentProfit, prior.currentProfit)}
        {row('Total equity', now.equity, prior.equity, 'sub')}
        {row('Total liabilities & equity', now.liabilities + now.equity, prior.liabilities + prior.equity, 'grand')}
      </tbody>
    </table>
  );
}

function TBTable({ tb }) {
  return (
    <table className="book-table">
      <thead><tr><th>Account</th><th>Debit</th><th>Credit</th></tr></thead>
      <tbody>
        {tb.trial.map(a => <tr key={a.no}><td>{a.no} · {a.name}</td><td>{col(a.debit)}</td><td>{col(a.credit)}</td></tr>)}
        <tr className="grand"><td>Totals</td><td>{amt(tb.totalDebit)}</td><td>{amt(tb.totalCredit)}</td></tr>
      </tbody>
    </table>
  );
}

function GLTable({ gl, scope = 'tab' }) {
  if (!gl.length) return <p className="book-empty">No activity this month.</p>;
  const idOf = no => `${scope}-gl-${no}`;
  return [
    gl.length > 1 && (
      <table key="index" className="book-table gl-index">
        <thead><tr><th>Account</th><th>Entries</th><th>Closing balance</th></tr></thead>
        <tbody>
          {gl.map(a => (
            <tr key={a.no}>
              <td><a href={`#${idOf(a.no)}`} onClick={jumpTo(idOf(a.no))}>{a.no} · {a.name}</a></td>
              <td>{a.lines.length}</td>
              <td>{amt(a.closing)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    ),
    ...gl.map(a => (
    <table key={a.no} id={idOf(a.no)} className="book-table gl">
      <thead>
        <tr className="gl-acct"><th colSpan={7}>{a.no} · {a.name}</th></tr>
        <tr><th>Date</th><th>Type</th><th>Ref</th><th>Name / memo</th><th>Debit</th><th>Credit</th><th>Balance</th></tr>
      </thead>
      <tbody>
        <tr className="muted"><td colSpan={6}>Opening balance</td><td>{amt(a.opening)}</td></tr>
        {a.lines.map((l, i) => (
          <tr key={i}><td>{fmtDate(l.date)}</td><td>{l.type}</td><td>{l.ref}</td><td>{l.name}{l.memo ? <span className="book-memo"> · {l.memo}</span> : null}</td><td>{col(l.debit)}</td><td>{col(l.credit)}</td><td>{amt(l.balance)}</td></tr>
        ))}
        <tr className="sub"><td colSpan={4}>Closing balance · {account(a.no).name}</td><td>{amt(a.lines.reduce((s, l) => s + l.debit, 0))}</td><td>{amt(a.lines.reduce((s, l) => s + l.credit, 0))}</td><td>{amt(a.closing)}</td></tr>
      </tbody>
    </table>
    )),
  ];
}

function ListTable({ head, rows, total }) {
  if (!rows.length) return <p className="book-empty">Nothing recorded this month.</p>;
  return (
    <table className="book-table">
      <thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
      <tbody>
        {rows.map((r, i) => <tr key={i}>{r.map((c, n) => <td key={n}>{c}</td>)}</tr>)}
        {total && <tr className="grand">{total.map((c, n) => <td key={n}>{c}</td>)}</tr>}
      </tbody>
    </table>
  );
}

/**
 * 📒 Books: the month-end close a bookkeeper would hand an accountant, built from what the
 * app already records. Every report comes from one double-entry ledger, so they tie out.
 */
export default function BooksView({ jobs, expenses, payroll, shifts, delays, fixedCosts = [], today, demo = false }) {
  const firstMonth = useMemo(() => {
    const d = jobs.filter(j => j.completedAt).map(j => j.completedAt.slice(0, 7)).sort()[0];
    return d && d < today.slice(0, 7) ? d : today.slice(0, 7);
  }, [jobs, today]);
  // Default to last month once this month is under way (the month you'd be closing).
  const [month, setMonth] = useState(() => (firstMonth < today.slice(0, 7) ? prevMonth(today.slice(0, 7)) : today.slice(0, 7)));
  const [report, setReport] = useState('summary');
  const [basis, setBasis] = useState('accrual');
  const [packet, setPacket] = useState(false);
  const [full, setFull] = useState(false); // packet: core reports only, unless Full detail
  const inPacket = useMemo(() => (full ? REPORTS : REPORTS.filter(r => CORE.includes(r.id))), [full]);
  const packetRef = useRef(null);

  const from = monthStart(month);
  const asOf = monthEnd(month) < today ? monthEnd(month) : today;
  const partial = asOf !== monthEnd(month);
  const yearStart = `${month.slice(0, 4)}-01-01`;
  const period = partial ? `${longDate(from)} – ${longDate(asOf)} (month to date)` : `For the month ended ${longDate(asOf)}`;
  const basisLabel = basis === 'cash' ? 'Cash basis' : 'Accrual basis';

  const b = useMemo(() => {
    const entries = journalEntries({ jobs, expenses, employees: payroll.employees, shifts, delays, payrollSettings: payroll.settings, fixedCosts, through: asOf });
    const inMonth = entries.filter(e => e.date >= from && e.date <= asOf);
    const priorDate = addDays(from, -1);
    const tb = balances(entries, asOf);
    const prior = balances(entries, priorDate);
    const aging = receivableAging(jobs, asOf);
    const register = payrollRegister({ employees: payroll.employees, jobs, shifts, delays, payrollSettings: payroll.settings, from, to: asOf });
    const gl = generalLedger(entries, from, asOf);
    const arLedger = tb.sheet.receivable;
    const unpaidWages = Math.round(register.filter(r => !r.paidAt || r.paidAt > asOf).reduce((s, r) => s + r.gross, 0) * 100) / 100;
    return {
      entries, inMonth, tb, prior: prior.sheet, priorDate, aging, register, gl,
      pl: profitLoss(entries, from, asOf, basis), ytd: profitLoss(entries, yearStart, asOf, basis),
      checks: [
        { ok: Math.abs(tb.totalDebit - tb.totalCredit) < 0.01, label: 'Trial balance: debits equal credits', detail: `${amt(tb.totalDebit)} / ${amt(tb.totalCredit)}` },
        { ok: Math.abs(tb.sheet.assets - tb.sheet.liabilities - tb.sheet.equity) < 0.01, label: 'Balance sheet balances', detail: `Assets ${amt(tb.sheet.assets)} = Liabilities + Equity ${amt(tb.sheet.liabilities + tb.sheet.equity)}` },
        { ok: Math.abs(arLedger - aging.totals.total) < 0.01, label: 'A/R ledger ties to the aging report', detail: `${amt(arLedger)} / ${amt(aging.totals.total)}` },
        { ok: Math.abs(tb.sheet.wagesPayable - unpaidWages) < 0.01 || tb.sheet.wagesPayable >= unpaidWages, label: 'Wages payable covers unpaid payroll weeks', detail: `${amt(tb.sheet.wagesPayable)} owed to the crew` },
      ],
    };
  }, [jobs, expenses, payroll.employees, payroll.settings, shifts, delays, fixedCosts, asOf, from, yearStart, basis]);

  const sales = b.inMonth.filter(e => e.type === 'Invoice');
  const receipts = b.inMonth.filter(e => e.type === 'Payment');
  const disb = b.inMonth.filter(e => ['Expense', 'Bill', 'Paycheck'].includes(e.type));
  const sum = (list, f) => list.reduce((s, e) => s + f(e), 0);
  const incomeOf = e => e.lines.find(l => l.credit && l.acct.startsWith('4'))?.acct;
  const debitAcct = e => e.lines.find(l => l.debit)?.acct;

  // ---- each report as screen/print content + its spreadsheet ----
  const content = {
    summary: () => (
      <Sheet title="Month-End Summary" period={period} basis={basisLabel}>
        <div className="book-kpis">
          <div><span>Income</span><b>{amt(b.pl.totalIncome)}</b></div>
          <div><span>Gross profit</span><b>{amt(b.pl.gross)}</b></div>
          <div><span>Net income</span><b className={b.pl.net < 0 ? 'neg' : undefined}>{amt(b.pl.net)}</b></div>
          <div><span>Cash collected</span><b>{amt(sum(receipts, e => e.lines[0].debit))}</b></div>
          <div><span>Owed by customers</span><b>{amt(b.aging.totals.total)}</b></div>
          <div><span>Owed to crew</span><b>{amt(b.tb.sheet.wagesPayable)}</b></div>
        </div>
        <h3 className="book-h3">Close checklist</h3>
        <ul className="book-checks">
          {b.checks.map(c => <li key={c.label} className={c.ok ? 'ok' : 'bad'}><span>{c.ok ? '✓' : '✗'}</span> {c.label} <small>{c.detail}</small></li>)}
        </ul>
        <h3 className="book-h3">In this packet</h3>
        <ol className="book-toc">{inPacket.filter(r => r.id !== 'summary').map(r => <li key={r.id}>{r.label}</li>)}</ol>
        <p className="book-fine">{b.inMonth.length} journal entries this month · {sales.length} invoices · {receipts.length} payments · {disb.length} disbursements. The QuickBooks/Xero journal import file has every entry{full ? '' : '; the ledger, journals and payroll register are available on request'}.</p>
      </Sheet>
    ),
    pl: () => <Sheet title="Profit and Loss" period={period} basis={basisLabel}><PLTable pl={b.pl} ytd={b.ytd} /></Sheet>,
    bs: () => <Sheet title="Balance Sheet" period={`As of ${longDate(asOf)}, compared with ${longDate(b.priorDate)}`} basis="Accrual basis"><BSTable now={b.tb.sheet} prior={b.prior} asOf={asOf} priorDate={b.priorDate} /></Sheet>,
    tb: () => <Sheet title="Trial Balance" period={`As of ${longDate(asOf)}`} basis="Accrual basis"><TBTable tb={b.tb} /></Sheet>,
    gl: (scope = 'tab') => <Sheet title="General Ledger" period={period} basis="Accrual basis"><GLTable gl={b.gl} scope={scope} /></Sheet>,
    sales: () => (
      <Sheet title="Sales Journal" period={period}>
        <ListTable head={['Date', 'Invoice', 'Customer', 'Service', 'Account', 'Amount']}
          rows={sales.map(e => [fmtDate(e.date), e.ref, e.name, e.memo, incomeOf(e), amt(e.lines[0].debit)])}
          total={['Total', '', `${sales.length} invoices`, '', '', amt(sum(sales, e => e.lines[0].debit))]} />
      </Sheet>
    ),
    receipts: () => (
      <Sheet title="Cash Receipts Journal" period={period}>
        <ListTable head={['Date', 'Invoice', 'Customer', 'Method', 'Amount']}
          rows={receipts.map(e => [fmtDate(e.date), e.ref, e.name, e.memo.replace(' received', ''), amt(e.lines[0].debit)])}
          total={['Total', '', `${receipts.length} payments`, '', amt(sum(receipts, e => e.lines[0].debit))]} />
      </Sheet>
    ),
    disb: () => (
      <Sheet title="Cash Disbursements Journal" period={period}>
        <ListTable head={['Date', 'Type', 'Ref', 'Payee / note', 'Account', 'Amount']}
          rows={disb.map(e => [fmtDate(e.date), e.type, e.ref, e.name, `${debitAcct(e)} · ${account(debitAcct(e)).name}`, amt(e.lines[0].debit)])}
          total={['Total', '', '', `${disb.length} items`, '', amt(sum(disb, e => e.lines[0].debit))]} />
      </Sheet>
    ),
    payroll: () => (
      <Sheet title="Payroll Register" period={period} foot="Gross wages from crew hours (truck rollout to back at the yard, owner edits applied). Withholding and employer taxes are handled by your payroll provider.">
        <ListTable head={['Week', 'Employee', 'Role', 'Rate', 'Reg hrs', 'OT hrs', 'Gross', 'Paid']}
          rows={b.register.map(r => [`${fmtDate(r.weekStart)}–${fmtDate(r.weekEnd).slice(0, 5)}`, r.name, r.role, amt(r.rate), r.regular, r.overtime || '', amt(r.gross), r.paidAt ? `${fmtDate(r.paidAt)}${r.checkNo ? ` #${r.checkNo}` : ''}` : 'Unpaid'])}
          total={['Total', `${new Set(b.register.map(r => r.name)).size} people`, '', '', sum(b.register, r => r.regular), sum(b.register, r => r.overtime) || '', amt(sum(b.register, r => r.gross)), '']} />
      </Sheet>
    ),
    ar: () => (
      <Sheet title="Accounts Receivable Aging" period={`As of ${longDate(asOf)}`} foot="Days counted from the visit date. Invoices are due on receipt.">
        <ListTable head={['Customer', 'Address', 'Current', '31–60', '61–90', 'Over 90', 'Total']}
          rows={b.aging.rows.map(r => [r.name, r.address, col(r.current), col(r.d31), col(r.d61), col(r.d90), amt(r.total)])}
          total={['Total', `${b.aging.rows.length} customers`, amt(b.aging.totals.current), amt(b.aging.totals.d31), amt(b.aging.totals.d61), amt(b.aging.totals.d90), amt(b.aging.totals.total)]} />
      </Sheet>
    ),
    notes: () => (
      <Sheet title="Notes for the Accountant" period={period}>
        <ol className="book-notes">
          <li><b>Basis.</b> Books are kept on the accrual basis: a visit is income the day the work is done (Dr A/R, Cr income) and wages are an expense the days they're worked (Dr 5000, Cr 2100 Wages payable). The P&amp;L can also be printed on a cash basis.</li>
          <li><b>Source records.</b> Every entry comes from the operating system: finished visits (with crew start/finish times), customer payments (card, cash, check), receipts the owner logged, and weekly payroll. Each entry carries its invoice number, check number or receipt reference.</li>
          <li><b>Cash.</b> Account 1000 shows only cash activity recorded in the app and starts from zero; it has no opening bank balance, owner contributions or draws, loan proceeds or transfers. Please reconcile it to the bank statement and book those items.</li>
          <li><b>Card fees.</b> Processor fees are booked to 6000 when each card payment settles. Card payments are recorded at their gross amount.</li>
          <li><b>Payroll.</b> Wages are gross. Withholdings and employer payroll taxes are not in these books; please add them from the payroll provider's reports.</li>
          <li><b>Fixed monthly costs</b> ({fixedCosts.length ? fixedCosts.map(c => c.label).join(', ') : 'none entered'}) are booked on the 1st of each month from the owner's monthly amounts. Please check them against the actual bills.</li>
          <li><b>Not tracked here:</b> equipment purchases to capitalize and depreciate, sales/use tax, 1099 contractors, and prepaid seasonal contracts. Please add these if they apply.</li>
          {demo && <li><b>Demo data.</b> These figures are from the demo company, not a real business.</li>}
        </ol>
        <h3 className="book-h3">Chart of accounts</h3>
        <table className="book-table"><tbody>{['asset', 'liability', 'equity', 'income', 'cogs', 'expense'].flatMap(t => [
          <tr key={t} className="sec"><td colSpan={2}>{{ asset: 'Assets', liability: 'Liabilities', equity: 'Equity', income: 'Income', cogs: 'Cost of services', expense: 'Operating expenses' }[t]}</td></tr>,
          ...ACCOUNTS.filter(a => a.type === t).map(a => <tr key={a.no}><td className="ind">{a.no}</td><td>{a.name}</td></tr>),
        ])}</tbody></table>
      </Sheet>
    ),
  };

  const csv = {
    pl: () => toCsv(['Account', 'This month', 'Year to date'], ['income', 'cogs', 'expenses'].flatMap(k => [...new Map([...b.pl[k], ...b.ytd[k]].map(a => [a.no, a])).values()].map(a => [`${a.no} ${a.name}`, (b.pl[k].find(x => x.no === a.no)?.amount || 0).toFixed(2), (b.ytd[k].find(x => x.no === a.no)?.amount || 0).toFixed(2)])).concat([['Gross profit', b.pl.gross.toFixed(2), b.ytd.gross.toFixed(2)], ['Net income', b.pl.net.toFixed(2), b.ytd.net.toFixed(2)]])),
    bs: () => toCsv(['Line', asOf, b.priorDate], [['1000 Cash', 'cash'], ['1200 Accounts receivable', 'receivable'], ['Total assets', 'assets'], ['2100 Wages payable', 'wagesPayable'], ['3900 Retained earnings', 'retained'], ['Net income YTD', 'currentProfit'], ['Total equity', 'equity']].map(([l, k]) => [l, b.tb.sheet[k].toFixed(2), b.prior[k].toFixed(2)])),
    tb: () => toCsv(['Account', 'Debit', 'Credit'], [...b.tb.trial.map(a => [`${a.no} ${a.name}`, a.debit.toFixed(2), a.credit.toFixed(2)]), ['Totals', b.tb.totalDebit.toFixed(2), b.tb.totalCredit.toFixed(2)]]),
    gl: () => toCsv(['Account', 'Date', 'Type', 'Ref', 'Name', 'Memo', 'Debit', 'Credit', 'Balance'], b.gl.flatMap(a => a.lines.map(l => [`${a.no} ${a.name}`, l.date, l.type, l.ref, l.name, l.memo, l.debit.toFixed(2), l.credit.toFixed(2), l.balance.toFixed(2)]))),
    sales: () => toCsv(['Date', 'Invoice', 'Customer', 'Service', 'Account', 'Amount'], sales.map(e => [e.date, e.ref, e.name, e.memo, incomeOf(e), e.lines[0].debit.toFixed(2)])),
    receipts: () => toCsv(['Date', 'Invoice', 'Customer', 'Method', 'Amount'], receipts.map(e => [e.date, e.ref, e.name, e.memo, e.lines[0].debit.toFixed(2)])),
    disb: () => toCsv(['Date', 'Type', 'Ref', 'Payee', 'Account', 'Amount'], disb.map(e => [e.date, e.type, e.ref, e.name, `${debitAcct(e)} ${account(debitAcct(e)).name}`, e.lines[0].debit.toFixed(2)])),
    payroll: () => toCsv(['Week start', 'Week end', 'Employee', 'Role', 'Rate', 'Regular hours', 'Overtime hours', 'Gross', 'Paid', 'Check'], b.register.map(r => [r.weekStart, r.weekEnd, r.name, r.role, r.rate, r.regular, r.overtime, r.gross.toFixed(2), r.paidAt || '', r.checkNo || ''])),
    ar: () => toCsv(['Customer', 'Address', 'Current', '31-60', '61-90', 'Over 90', 'Total'], b.aging.rows.map(r => [r.name, r.address, r.current.toFixed(2), r.d31.toFixed(2), r.d61.toFixed(2), r.d90.toFixed(2), r.total.toFixed(2)])),
  };
  const slug = `johns-lawn-${month}`;
  const rowsIn = {
    gl: b.gl.reduce((n, a) => n + a.lines.length, 0), sales: sales.length, receipts: receipts.length,
    disb: disb.length, payroll: b.register.length, ar: b.aging.rows.length,
  };
  const months = [];
  for (let m = firstMonth; m <= today.slice(0, 7); m = nextMonth(m)) months.push(m);

  return (
    <div className="books">
      <div className="books-bar">
        <div className="books-month">
          <button type="button" className="btn-ghost" disabled={month <= firstMonth} onClick={() => setMonth(prevMonth(month))} aria-label="Previous month">‹</button>
          <select className="form-input" value={month} onChange={e => setMonth(e.target.value)} aria-label="Month">
            {months.map(m => <option key={m} value={m}>{monthLabel(m)}{m === today.slice(0, 7) ? ' (so far)' : ''}</option>)}
          </select>
          <button type="button" className="btn-ghost" disabled={month >= today.slice(0, 7)} onClick={() => setMonth(nextMonth(month))} aria-label="Next month">›</button>
        </div>
        <div className="hub-tabs" role="radiogroup" aria-label="Basis">
          <button type="button" role="radio" aria-checked={basis === 'accrual'} aria-selected={basis === 'accrual'} onClick={() => setBasis('accrual')} title="Income when the work is done">Accrual</button>
          <button type="button" role="radio" aria-checked={basis === 'cash'} aria-selected={basis === 'cash'} onClick={() => setBasis('cash')} title="Income when the money comes in">Cash</button>
        </div>
        <span style={{ flex: 1 }} />
        <span className={`books-tie ${b.checks.every(c => c.ok) ? 'ok' : 'bad'}`} title={b.checks.map(c => `${c.ok ? '✓' : '✗'} ${c.label}`).join('\n')}>
          {b.checks.every(c => c.ok) ? '✓ Books tie out' : '✗ Check the close list'}
        </span>
        {csv[report] && <button type="button" className="btn-ghost" onClick={() => download(`${slug}-${report}.csv`, csv[report]())}>⬇ This report (CSV)</button>}
        <button type="button" className="btn-ghost" onClick={() => download(`${slug}-journal-import.csv`, journalCsv(b.entries, from, asOf))} title="Journal entries in the layout QuickBooks Online and Xero import">⬇ QuickBooks / Xero journal</button>
        <button type="button" className="btn-primary" onClick={() => setPacket(true)}>🖨 Month-end packet</button>
      </div>
      {partial && <div className="books-partial">{monthLabel(month)} isn't over yet. These are month-to-date numbers through {longDate(asOf)}.</div>}

      <div className="books-tabs" role="tablist">
        {REPORTS.map(r => <button key={r.id} type="button" role="tab" aria-selected={report === r.id} onClick={() => setReport(r.id)}>{r.label}</button>)}
      </div>
      <div className="books-page">{content[report]()}</div>

      {packet && createPortal(
        <div className="print-root" role="dialog" aria-label="Month-end packet" ref={packetRef}>
          <div className="print-toolbar">
            <b>📒 Month-end packet · {monthLabel(month)}</b>
            <span>{inPacket.length} reports · {basisLabel}</span>
            <label className="packet-full" title="Adds the trial balance, general ledger, sales / receipts / disbursements journals and payroll register">
              <input type="checkbox" checked={full} onChange={e => setFull(e.target.checked)} /> Full detail (+{REPORTS.length - CORE.length} reports)
            </label>
            <span style={{ flex: 1 }} />
            <button type="button" className="btn-primary" onClick={() => window.print()}>Print / Save PDF</button>
            <button type="button" className="btn-ghost" onClick={() => setPacket(false)}>Close</button>
            <PacketNav rootRef={packetRef} rowsIn={rowsIn} reports={inPacket} />
          </div>
          <div className="print-pages books-packet">
            <section className="book-sheet book-cover" id="pk-cover" data-section="cover">
              <div className="book-cover-co">{COMPANY_INFO.name}</div>
              <h1>Monthly Financial Close</h1>
              <div className="book-cover-month">{monthLabel(month)}</div>
              <div className="book-period">{period} · {basisLabel}</div>
              <ol className="book-toc">{inPacket.map(r => (
                <li key={r.id}><a href={`#pk-${r.id}`} onClick={jumpTo(`pk-${r.id}`)}>{r.label}</a>{rowsIn[r.id] > 0 && <span className="book-toc-n"> · {rowsIn[r.id]} {r.id === 'gl' ? 'entries' : 'rows'}</span>}</li>
              ))}</ol>
              <p className="book-fine">Prepared {longDate(today)} from {COMPANY_INFO.name} operating records.{demo ? ' Demo data.' : ''}</p>
            </section>
            {inPacket.map(r => (
              <div key={r.id} id={`pk-${r.id}`} data-section={r.id} className="book-print-page">
                <a className="packet-up" href="#pk-cover" onClick={jumpTo('pk-cover')}>↑ Contents</a>
                {content[r.id]('pk')}
              </div>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

