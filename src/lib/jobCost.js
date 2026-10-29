// What a cut really costs, laid out like an account: revenue, minus crew labor (on site +
// driving), gas, mower wear, card fees, other expenses and a share of the fixed monthly
// costs (insurance, truck payment…) — the net per cut, per month and per season.
// Rates come from the last 60 days of John's own books, so they track reality.
import { addDays } from './dates.js';
import { cardFee } from './payments.js';
import { crewKind } from './crews.js';

export const DRIVE_MIN = 6;                       // average drive between stops on a route
export const SEASON_WEEKS = 30;                   // mowing season, roughly April–October
const cutsPerMonthFor = repeatDays => (Number(repeatDays) === 14 ? 26 / 12 : 52 / 12);
const cutsPerSeasonFor = repeatDays => (Number(repeatDays) === 14 ? SEASON_WEEKS / 2 : SEASON_WEEKS);
const day = s => String(s || '').slice(0, 10);
const isLawnCut = j => !/^landscaping/i.test(String(j.service || '')) && j.service !== 'Snow Removal';

/** Minutes on site for an outlined area: small yards are trim-heavy; big open areas mow fast. */
export function minutesForSqFt(sqFt) {
  if (!sqFt) return null;
  const small = Math.min(sqFt, 10000);
  const big = Math.max(0, sqFt - 10000);
  return Math.round(6 + small / 260 + big / 1200);
}

/** Cost rates from the books (last `days` days). */
export function costRates({ jobs = [], expenses = [], employees = [], technicians = [], today, days = 60 }) {
  const from = addDays(today, -days);
  const cuts = jobs.filter(j => j.status === 'completed' && day(j.completedAt) >= from && day(j.completedAt) <= today);
  const n = Math.max(1, cuts.length);
  const spent = cat => expenses.filter(e => e.status === 'logged' && e.category === cat && e.date >= from && e.date <= today).reduce((s, e) => s + (e.amount || 0), 0);
  // A lawn crew's pay per hour (everyone on the truck) and its size, averaged over lawn crews.
  const crews = technicians.filter(t => crewKind(t) === 'lawn' && t.status !== 'pending_approval')
    .map(t => employees.filter(e => e.crewId === t.id && e.active !== false))
    .filter(people => people.length);
  const crewPerHour = crews.length ? crews.reduce((s, p) => s + p.reduce((a, e) => a + (e.rate || 0), 0), 0) / crews.length : 55;
  const crewSize = crews.length ? Math.round(crews.reduce((s, p) => s + p.length, 0) / crews.length) : 3;
  const timed = cuts.filter(isLawnCut).filter(j => j.startedAt && j.completedAt)
    .map(j => (new Date(j.completedAt) - new Date(j.startedAt)) / 60000).filter(m => m >= 3 && m < 600);
  const paid = jobs.filter(j => j.paid && day(j.paidAt) >= from);
  return {
    gasPerCut: spent('gas') / n,
    wearPerCut: spent('maintenance') / n,
    otherPerCut: spent('other') / n,
    crewPerHour,
    crewSize,
    avgMinutes: timed.length ? timed.reduce((s, m) => s + m, 0) / timed.length : 22,
    cardShare: paid.length ? paid.filter(j => j.paymentMethod === 'card').length / paid.length : 0.5,
    cutsPerMonth: (cuts.length * 30) / days,
  };
}

export const fixedMonthlyTotal = fixedCosts => (fixedCosts || []).reduce((s, c) => s + (Number(c.monthly) || 0), 0);

const cardFeeLabel = (payMethod, rates) => {
  if (payMethod === 'card') return 'Card fee (pays by card)';
  if (payMethod) return `Card fee (pays by ${payMethod})`;
  return `Card fee (~${Math.round(rates.cardShare * 100)}% pay by card)`;
};

/**
 * One cut as an account. minutes: known average on site (else from sqFt, else the crews'
 * average). payMethod: how this customer pays ('card' adds the fee; cash/check none;
 * unknown = the average card share).
 */
export function cutBreakdown({ price, minutes = null, sqFt = null, repeatDays = 7, payMethod = null, rates, fixedMonthly = 0 }) {
  const mins = Math.round(minutes ?? minutesForSqFt(sqFt) ?? rates.avgMinutes);
  const perMin = rates.crewPerHour / 60;
  const fee = payMethod === 'card' ? cardFee(price) : payMethod ? 0 : cardFee(price) * rates.cardShare;
  const lines = [
    { key: 'labor', label: `Crew labor · ${mins} min × ${rates.crewSize} people`, amount: -mins * perMin },
    { key: 'drive', label: `Driving · ~${DRIVE_MIN} min between stops`, amount: -DRIVE_MIN * perMin },
    { key: 'gas', label: 'Gas', amount: -rates.gasPerCut },
    { key: 'wear', label: 'Mower wear & blades', amount: -rates.wearPerCut },
    { key: 'card', label: cardFeeLabel(payMethod, rates), amount: -fee },
    ...(rates.otherPerCut > 0.005 ? [{ key: 'other', label: 'Other expenses', amount: -rates.otherPerCut }] : []),
    fixedMonthly > 0
      ? { key: 'fixed', label: 'Overhead share (insurance, truck…)', amount: -fixedMonthly / Math.max(1, rates.cutsPerMonth) }
      : { key: 'fixed', label: 'Overhead (fixed costs not entered yet)', amount: 0, muted: true },
  ].map(l => ({ ...l, amount: Math.round(l.amount * 100) / 100 }));
  const cost = -lines.reduce((s, l) => s + l.amount, 0);
  const net = Math.round((price - cost) * 100) / 100;
  return {
    price, minutes: mins, lines, cost: Math.round(cost * 100) / 100, net,
    margin: price ? net / price : 0,
    perMonth: Math.round(net * cutsPerMonthFor(repeatDays) * 100) / 100,
    perSeason: Math.round(net * cutsPerSeasonFor(repeatDays) * 100) / 100,
    cutsPerMonth: cutsPerMonthFor(repeatDays),
  };
}
