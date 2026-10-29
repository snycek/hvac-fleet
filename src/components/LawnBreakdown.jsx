import { Fragment, useState } from 'react';
import CostSheet from './CostSheet.jsx';
import { allLawns, dayOf } from '../lib/lawns.js';
import { addDays } from '../lib/dates.js';
import { cutBreakdown, fixedMonthlyTotal } from '../lib/jobCost.js';

const usd = n => `${n < 0 ? '−' : ''}$${Math.abs(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const usd2 = n => `${n < 0 ? '−' : ''}$${Math.abs(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const COST_NAMES = { labor: 'Crew labor (on site)', drive: 'Crew labor (driving)', gas: 'Gas', wear: 'Mower wear & blades', card: 'Card fees', other: 'Other expenses' };

/** How each customer pays, from their latest paid visit. */
const payMethodOf = l => l.history.find(j => j.paid && j.paymentMethod)?.paymentMethod || null;

/**
 * Per-lawn money: price, what a cut costs, net — worst margins first — plus the next 30
 * days forecast (every regular customer's cuts) and John's fixed monthly costs.
 */
export default function LawnBreakdown({ jobs, rates, today, fixedCosts = [], onSaveFixed, onClose }) {
  const [open, setOpen] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => (fixedCosts.length ? fixedCosts : [{ label: 'Insurance', monthly: '' }, { label: 'Truck payments', monthly: '' }, { label: 'Phone & software', monthly: '' }]).map(c => ({ ...c, monthly: String(c.monthly ?? '') })));
  const [saving, setSaving] = useState(false);
  const fixed = fixedMonthlyTotal(fixedCosts);

  // Regular customers who are still active (a cut coming or one in the last 30 days).
  const lawns = allLawns(jobs)
    .filter(l => l.repeatDays > 0 && l.price > 0 && (l.nextCut || (l.lastCut && dayOf(l.lastCut) >= addDays(today, -30))))
    .map(l => ({ l, b: cutBreakdown({ price: l.price, minutes: l.avgMinutes, sqFt: l.sqFt, repeatDays: l.repeatDays, payMethod: payMethodOf(l), rates, fixedMonthly: fixed }) }))
    .sort((a, b) => a.b.margin - b.b.margin);

  // Next 30 days, summed like one statement.
  const revenue = lawns.reduce((s, x) => s + x.l.price * x.b.cutsPerMonth, 0);
  const costs = Object.keys(COST_NAMES).map(key => ({
    key, label: COST_NAMES[key],
    amount: lawns.reduce((s, x) => s + (x.b.lines.find(line => line.key === key)?.amount || 0) * x.b.cutsPerMonth, 0),
  })).filter(c => Math.abs(c.amount) >= 0.5);
  const net = revenue + costs.reduce((s, c) => s + c.amount, 0) - fixed;
  const losers = lawns.filter(x => x.b.net < 0).length;

  const save = async () => {
    setSaving(true);
    try {
      await onSaveFixed(draft.map(c => ({ label: c.label.trim(), monthly: Number(c.monthly) || 0 })).filter(c => c.label && c.monthly > 0));
      setEditing(false);
    } finally { setSaving(false); }
  };

  return (
    <div onClick={onClose} className="lawn-bd-backdrop">
      <div className="card lawn-bd" onClick={e => e.stopPropagation()} role="dialog" aria-label="Breakdown by lawn">
        <div className="lawn-bd-head">
          <h3>📊 Breakdown by lawn</h3>
          <button type="button" className="btn-ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <p className="cust-dim" style={{ fontSize: '12.5px' }}>
          Costs come from the last 60 days of your books: crew pay {usd2(rates.crewPerHour)}/hr for a {rates.crewSize}-person crew, gas {usd2(rates.gasPerCut)} and mower wear {usd2(rates.wearPerCut)} per cut.
        </p>

        <div className="lawn-bd-top">
          <div className="cost-sheet">
            <div className="cost-row head"><span>Next 30 days · {lawns.length} regular lawns</span><span /></div>
            <div className="cost-row"><span>Revenue (booked cuts)</span><span>{usd(revenue)}</span></div>
            {costs.map(c => <div key={c.key} className="cost-row"><span>− {c.label}</span><span>{usd(c.amount)}</span></div>)}
            <div className={fixed ? 'cost-row' : 'cost-row muted'}><span>− Fixed costs (insurance, truck…)</span><span>{fixed ? usd(-fixed) : 'not entered'}</span></div>
            <div className={`cost-row total ${net >= 0 ? 'good' : 'bad'}`}><span>= Forecast net</span><span>{usd(net)} <small>({revenue ? Math.round((net / revenue) * 100) : 0}%)</small></span></div>
          </div>

          <div className="cost-sheet">
            <div className="cost-row head"><span>Fixed monthly costs</span>{!editing && <button type="button" className="btn-ghost" onClick={() => setEditing(true)} style={{ padding: '2px 10px', fontSize: '12px' }}>Edit</button>}</div>
            {!editing ? (
              fixedCosts.length ? fixedCosts.map(c => <div key={c.label} className="cost-row"><span>{c.label}</span><span>{usd(c.monthly)}/mo</span></div>)
                : <div className="cost-row muted"><span>None entered yet. Add insurance, truck payments, phone… so the net includes them.</span></div>
            ) : (
              <div className="fixed-edit">
                {draft.map((c, i) => (
                  <div key={i} className="fixed-row">
                    <input className="form-input" value={c.label} onChange={e => setDraft(d => d.map((x, n) => (n === i ? { ...x, label: e.target.value } : x)))} aria-label={`Cost ${i + 1} name`} />
                    <span className="land-amt"><span>$</span><input className="form-input" inputMode="decimal" value={c.monthly} placeholder="0" onChange={e => setDraft(d => d.map((x, n) => (n === i ? { ...x, monthly: e.target.value.replace(/[^\d.]/g, '') } : x)))} aria-label={`Cost ${i + 1} per month`} /></span>
                    <button type="button" className="land-x" onClick={() => setDraft(d => d.filter((_, n) => n !== i))} aria-label="Remove">✕</button>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                  <button type="button" className="btn-ghost" onClick={() => setDraft(d => [...d, { label: '', monthly: '' }])} style={{ fontSize: '12px', padding: '4px 10px' }}>+ Add</button>
                  <span style={{ flex: 1 }} />
                  <button type="button" className="btn-ghost" onClick={() => setEditing(false)} style={{ fontSize: '12px', padding: '4px 10px' }}>Cancel</button>
                  <button type="button" className="btn-primary" disabled={saving} onClick={save} style={{ fontSize: '12px', padding: '4px 12px' }}>{saving ? 'Saving…' : 'Save'}</button>
                </div>
              </div>
            )}
            {fixed > 0 && <div className="cost-row total"><span>Total</span><span>{usd(fixed)}/mo · ~{usd2(fixed / Math.max(1, rates.cutsPerMonth))} per cut</span></div>}
          </div>
        </div>

        <h4 className="lawn-bd-sub">Every lawn · lowest margin first{losers ? <span className="bad"> · {losers} losing money</span> : ''}</h4>
        <div className="lawn-bd-table">
          <table>
            <thead><tr><th>Lawn</th><th>Price</th><th>Time</th><th>Cost</th><th>Net</th><th>Margin</th><th>Net/mo</th></tr></thead>
            <tbody>
              {lawns.map(({ l, b }) => (
                <Fragment key={l.key}>
                  <tr className={b.net < 0 ? 'bad' : undefined} onClick={() => setOpen(open === l.key ? null : l.key)} aria-expanded={open === l.key}>
                    <td><b>{open === l.key ? '▾' : '▸'} {l.name}</b><div className="cust-dim">{String(l.address || '').split(',')[0]}</div></td>
                    <td>{usd(l.price)}</td>
                    <td>{b.minutes}m</td>
                    <td>{usd2(b.cost)}</td>
                    <td className={b.net < 0 ? 'bad' : 'good'}>{usd2(b.net)}</td>
                    <td>{Math.round(b.margin * 100)}%</td>
                    <td>{usd(b.perMonth)}</td>
                  </tr>
                  {open === l.key && (
                    <tr className="lawn-bd-open"><td colSpan={7}><CostSheet b={b} title={`${l.name} · per cut`} note={l.avgMinutes ? `Time is their real average (${l.avgMinutes} min on site).` : 'Time estimated from the yard size.'} /></td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
