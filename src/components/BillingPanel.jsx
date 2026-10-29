import { memo, useMemo, useState } from 'react';
import { CONTACT_METHODS, STATUS, aging, latestBilledPeriod, periodLabel, statementsFor } from '../lib/billing.js';
import { nextPeriod, prevPeriod, statementDate } from '../lib/invoices.js';
import { money, shortDate } from '../lib/lawns.js';

const DAYS = [1, 5, 10, 15, 20, 25, 28];
const TERMS = [0, 7, 10, 15, 30];
const ordinal = n => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;
const FILTERS = [['all', 'All'], ['unsent', 'Not sent'], ['overdue', 'Overdue'], ['open', 'Unpaid'], ['paid', 'Paid']];

/**
 * Billing: the ledger. Monthly statements (who got what, and whether it's paid) and
 * who owes what by how late. Sending goes the way each customer prefers.
 */
function BillingPanel({ jobs, today, settings, onSaveSettings, onSend, onPrint, openCustomer, assumeSentBefore }) {
  const latest = latestBilledPeriod(today, settings);
  const [period, setPeriod] = useState(null); // null = latest billed month
  const shown = period || latest;
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState('');
  const [done, setDone] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const PREVIEW = 25; // long months: first 25, then "Show all"

  const statements = useMemo(() => statementsFor(jobs, shown, today, settings, { assumeSentBefore }), [jobs, shown, today, settings, assumeSentBefore]);
  const buckets = useMemo(() => aging(jobs, today, settings), [jobs, today, settings]);
  const owed = buckets.reduce((s, b) => s + b.amount, 0);
  const late = buckets.filter(b => b.id !== 'current').reduce((s, b) => s + b.amount, 0);

  const q = search.trim().toLowerCase();
  const list = statements.filter(st => (!q || `${st.address} ${st.name}`.toLowerCase().includes(q))
    && (filter === 'all' || (filter === 'open' ? st.open > 0 : st.status === filter)));
  const unsent = statements.filter(st => st.status === 'unsent');
  const unsentDigital = unsent.filter(st => st.reach !== 'paper');
  const unsentPaper = unsent.filter(st => st.reach === 'paper');
  const total = statements.reduce((s, st) => s + st.amount, 0);
  const collected = statements.reduce((s, st) => s + (st.amount - st.open), 0);
  const upcoming = statementDate(shown, settings) > today;
  const by = ch => unsentDigital.filter(st => st.reach === ch).length;

  const run = async (label, fn) => {
    setBusy(label); setDone('');
    try { setDone(await fn()); } catch (e) { setDone(e.message || 'Something went wrong'); } finally { setBusy(''); setConfirm(false); }
  };
  const sendDigital = () => run('send', async () => { await onSend(unsentDigital); return `✓ Sent ${unsentDigital.length} statement${unsentDigital.length === 1 ? '' : 's'} (logged in each customer's contact history)`; });
  const printPaper = () => run('paper', async () => { await onPrint(unsentPaper, true); return `✓ ${unsentPaper.length} paper statement${unsentPaper.length === 1 ? '' : 's'} ready to print`; });
  const sendOne = st => run(st.key, async () => {
    if (st.reach === 'paper') { await onPrint([st], true); return `✓ Printed ${st.name}'s statement`; }
    await onSend([st]);
    return `✓ Sent ${st.name}'s statement by ${CONTACT_METHODS[st.reach].label.toLowerCase()}`;
  });

  return (
    <div className="billing">
      <div className="bill-settings">
        <span className="cust-dim">Statements go out on the</span>
        <select value={settings.day} onChange={e => onSaveSettings({ day: Number(e.target.value) })} aria-label="Billing day">
          {DAYS.map(d => <option key={d} value={d}>{ordinal(d)}</option>)}
        </select>
        <span className="cust-dim">· due in</span>
        <select value={settings.terms} onChange={e => onSaveSettings({ terms: Number(e.target.value) })} aria-label="Days to pay">
          {TERMS.map(d => <option key={d} value={d}>{d ? `${d} days` : 'on receipt'}</option>)}
        </select>
      </div>

      <div className="bill-aging" role="table" aria-label="Who owes what, by how late">
        <div className="bill-aging-head">
          <b>Owed {money(owed)}</b>
          {late > 0 && <span className="cust-bad"> · {money(late)} past due</span>}
        </div>
        {buckets.map(b => (
          <div key={b.id} className={`bill-aging-row ${b.id}`} role="row">
            <span>{b.label}</span>
            <span className="bill-bar"><i style={{ width: owed ? `${Math.max(b.amount ? 3 : 0, (b.amount / owed) * 100)}%` : 0 }} /></span>
            <b>{money(b.amount)}</b>
            <span className="cust-dim">{b.customers}</span>
          </div>
        ))}
      </div>

      <div className="bill-period">
        <button type="button" className="btn-ghost" aria-label="Previous month" onClick={() => setPeriod(prevPeriod(shown))}>‹</button>
        <b>{periodLabel(shown)}</b>
        <button type="button" className="btn-ghost" aria-label="Next month" disabled={shown >= today.slice(0, 7)} onClick={() => setPeriod(nextPeriod(shown))}>›</button>
        {shown !== latest && <button type="button" className="btn-ghost bill-latest" onClick={() => setPeriod(null)}>Latest</button>}
      </div>
      <div className="bill-sum cust-dim">
        {statements.length} statement{statements.length === 1 ? '' : 's'} · {money(total)} · {money(collected)} paid
        {upcoming ? ` · goes out ${shortDate(statementDate(shown, settings))}` : unsent.length ? ` · ${unsent.length} not sent` : ' · all sent'}
      </div>

      {!upcoming && unsent.length > 0 && (
        <div className="remind-all">
          {unsentDigital.length > 0 && (
            <button type="button" className="btn-primary bill-send" disabled={!!busy} onClick={() => setConfirm(c => !c)}>
              Send {unsentDigital.length} statement{unsentDigital.length === 1 ? '' : 's'}
            </button>
          )}
          {unsentPaper.length > 0 && (
            <button type="button" className="btn-ghost remind-btn" disabled={!!busy} onClick={printPaper} title="Customers who asked for paper">🖨 Print {unsentPaper.length} paper</button>
          )}
          {confirm && (
            <div className="remind-confirm">
              <div><b>Send {periodLabel(shown).split(' ')[0]} statements to {unsentDigital.length} customer{unsentDigital.length === 1 ? '' : 's'}?</b></div>
              <div className="cust-dim">{by('text')} by text · {by('email')} by email, each with their own total and pay link</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" className="btn-primary" disabled={!!busy} onClick={sendDigital} style={{ padding: '5px 14px', fontSize: '12px' }}>{busy === 'send' ? 'Sending…' : 'Send'}</button>
                <button type="button" className="btn-ghost" onClick={() => setConfirm(false)} style={{ padding: '5px 12px', fontSize: '12px' }}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
      {done && <div className={/^✓/.test(done) ? 'remind-done' : 'cust-bad'} style={{ fontSize: '12px' }}>{done}</div>}

      <div className="late-filter" role="group" aria-label="Show">
        {FILTERS.map(([id, label]) => (
          <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>
        ))}
      </div>
      <div className="late-filter">
        <input className="addr-search" type="search" placeholder="Search address or name…" aria-label="Search statements" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {list.length === 0 && <div className="cust-empty">{statements.length ? 'Nothing matches.' : `No monthly visits in ${periodLabel(shown)}.`}</div>}
        {(showAll ? list : list.slice(0, PREVIEW)).map((st, i) => {
          const s = STATUS[st.status];
          const m = CONTACT_METHODS[st.reach];
          return (
            <div key={st.key} className="bill-row" style={{ borderTop: i ? '1px solid var(--border)' : 'none' }}>
              <span className="bill-who">
                <button type="button" className="addr-link" onClick={() => openCustomer(st.key)} title="Customer details">{String(st.address).split(',')[0]}</button>
                <span className="cust-dim"> · {st.name}</span>
                <div className="bill-meta">
                  <span className="bill-status" style={{ color: s.color, borderColor: s.color }}>{s.label}</span>
                  <span title={`Prefers ${CONTACT_METHODS[st.pref].label.toLowerCase()}`}>{m.icon}</span>
                  <span className="cust-dim">{st.lines.length} {st.snow ? 'push' : 'visit'}{st.lines.length === 1 ? '' : st.snow ? 'es' : 's'}</span>
                  {st.sent && <span className="cust-dim">· sent {shortDate(st.sent.at)}</span>}
                  {st.previousTotal > 0 && <span className="cust-warn">· +{money(st.previousTotal)} earlier</span>}
                </div>
              </span>
              <b className="bill-amt">{money(st.open || st.amount)}</b>
              <span className="row-actions">
                <button type="button" className="btn-ghost remind-btn" onClick={() => onPrint([st], false)} title="Print this statement" aria-label={`Print statement for ${st.name}`}>🖨</button>
                {!upcoming && st.open + st.previousTotal > 0 && (
                  <button type="button" className="btn-ghost remind-btn" disabled={!!busy} onClick={() => sendOne(st)}
                    title={st.sent ? 'Send it again' : `Send by ${m.label.toLowerCase()}`}>
                    {busy === st.key ? '…' : `${m.icon} ${st.sent ? 'Resend' : 'Send'}`}
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </div>
      {list.length > PREVIEW && (
        <button type="button" className="btn-ghost" onClick={() => setShowAll(s => !s)} style={{ alignSelf: 'flex-start', padding: '6px 12px', fontSize: '12px' }}>
          {showAll ? 'Show less' : `Show all ${list.length}`}
        </button>
      )}
    </div>
  );
}

export default memo(BillingPanel);
