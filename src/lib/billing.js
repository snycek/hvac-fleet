// Monthly billing: one statement per customer per month (every visit that month plus
// any older unpaid balance), each sent the way the customer prefers (text, email or
// paper). Shared by the owner hub (live + demo).
import { lawnKey } from './lawns.js';
import { addDays } from './dates.js';
import { billingMode, billingSettings, daysPastDue, invoiceLine, periodOf, prevPeriod, serviceDate, statementDate } from './invoices.js';

// ---- How each customer wants to hear from us ----
export const CONTACT_METHODS = {
  text: { icon: '💬', label: 'Text' },
  email: { icon: '✉️', label: 'Email' },
  paper: { icon: '📄', label: 'Paper' },
};
export const emailOf = job => job.clientEmail || job.email || '';
/** Their pick, or a sensible default: text if we have a phone, else email, else paper. */
export function contactPref(job) {
  if (CONTACT_METHODS[job?.contactPref]) return job.contactPref;
  return job?.clientPhone ? 'text' : emailOf(job || {}) ? 'email' : 'paper';
}
/** How a statement actually goes out: their pick when we have the number/address for it. */
export function reachBy(job) {
  const pref = contactPref(job);
  if (pref === 'paper' || (pref === 'text' && job.clientPhone) || (pref === 'email' && emailOf(job))) return pref;
  return job.clientPhone ? 'text' : emailOf(job) ? 'email' : 'paper';
}
/** Reminders can't go on paper: their pick if it's text/email, else whatever reaches them (null = no way). */
export function remindBy(job) {
  const r = reachBy(job);
  if (r !== 'paper') return r;
  return job.clientPhone ? 'text' : emailOf(job) ? 'email' : null;
}
export const addressFor = (job, channel) => (channel === 'email' ? emailOf(job) : channel === 'text' ? (job.clientPhone || '') : '');

// ---- Statements ----
const usd = n => `$${Number(n || 0).toFixed(2).replace(/\.00$/, '')}`;
const shortHash = s => { let h = 11; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 1679616; return h.toString(36).toUpperCase().padStart(4, '0'); };
export const periodLabel = period => new Date(`${period}-15T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
export const monthName = period => new Date(`${period}-15T12:00:00`).toLocaleDateString('en-US', { month: 'long' });
export const statementNumber = (key, period) => `JL-S${period.slice(2).replace('-', '')}-${shortHash(key)}`;

/** The latest month whose statements are due to go out by today (this month's go out next month). */
export function latestBilledPeriod(today, settings) {
  let p = today.slice(0, 7);
  while (statementDate(p, settings) > today) p = prevPeriod(p);
  return p;
}

/** When this month's statement went to the customer (from the contact log on its visits). */
export function statementSent(visits, period) {
  let last = null;
  for (const j of visits) {
    for (const r of j.reminders || []) {
      if (r.kind === 'statement' && r.period === period && (!last || String(r.at) > String(last.at))) last = r;
    }
  }
  return last;
}

/**
 * Every customer's statement for one month: their monthly-billed visits finished that
 * month, plus older visits still unpaid (previous balance).
 * status: upcoming (month not over / not billing day yet) · unsent · sent · partial · overdue · paid
 * assumeSentBefore (demo): statements dated before this count as already sent (sample history).
 */
export function statementsFor(jobs, period, today, settings, { assumeSentBefore } = {}) {
  const s = billingSettings(settings);
  const date = statementDate(period, s);
  const due = addDays(date, s.terms);
  const byKey = new Map();
  for (const j of jobs) {
    if (j.status !== 'completed' || billingMode(j) !== 'monthly' || periodOf(j) !== period) continue;
    const k = lawnKey(j);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(j);
  }
  const out = [];
  for (const [key, visits] of byKey) {
    visits.sort((a, b) => serviceDate(a).localeCompare(serviceDate(b)));
    const latest = visits[visits.length - 1];
    const lines = visits.map(j => invoiceLine(j, today, s));
    const previous = jobs
      .filter(j => lawnKey(j) === key && j.status === 'completed' && !j.paid && serviceDate(j) < `${period}-01`)
      .sort((a, b) => serviceDate(a).localeCompare(serviceDate(b)))
      .map(j => invoiceLine(j, today, s));
    const amount = lines.reduce((t, l) => t + l.amount, 0);
    const open = lines.filter(l => !l.paid).reduce((t, l) => t + l.amount, 0);
    const previousTotal = previous.reduce((t, l) => t + l.amount, 0);
    const sent = statementSent(visits, period)
      || (assumeSentBefore && date < assumeSentBefore ? { at: `${date}T09:00:00`, channel: reachBy(latest), assumed: true } : null);
    const status = open === 0 ? 'paid'
      : date > today ? 'upcoming'
      : !sent ? 'unsent'
      : lines.every(l => l.paid || l.checkPending) ? 'check'
      : today > due ? 'overdue'
      : open < amount ? 'partial'
      : 'sent';
    out.push({
      key, period, number: statementNumber(key, period),
      name: latest.clientName, address: latest.address, phone: latest.clientPhone || '', email: emailOf(latest),
      pref: contactPref(latest), reach: reachBy(latest), snow: latest.service === 'Snow Removal',
      visits, latest, lines, previous, amount, open, previousTotal, total: open + previousTotal,
      date, due, sent, status,
    });
  }
  return out.sort((a, b) => String(a.address).localeCompare(String(b.address)));
}

export const STATUS = {
  upcoming: { label: 'Not billed yet', color: 'var(--text-muted)' },
  unsent: { label: 'Not sent', color: '#f0b429' },
  sent: { label: 'Sent', color: '#58a6ff' },
  partial: { label: 'Part paid', color: '#58a6ff' },
  overdue: { label: 'Overdue', color: '#ff7b72' },
  check: { label: 'Check coming', color: '#a371f7' },
  paid: { label: 'Paid', color: '#3fb950' },
};

/** The text/email that goes with a statement. {payLink} becomes their account link when sent. */
export function statementMessage(st, companyName) {
  const first = String(st.name || '').split(' ')[0] || 'there';
  const n = st.lines.filter(l => !l.paid).length;
  const unit = st.snow ? (n === 1 ? 'push' : 'pushes') : (n === 1 ? 'visit' : 'visits');
  const due = new Date(`${st.due}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const prev = st.previousTotal > 0 ? `, plus ${usd(st.previousTotal)} from earlier` : '';
  return `Hi ${first}, here's your ${monthName(st.period)} statement from ${companyName}: ${usd(st.open)} for ${n} ${unit}${prev}. Total ${usd(st.total)}, due ${due}. View and pay: {payLink}`;
}

/** Printable statement (same sheet as a door invoice, statement layout). */
export function statementSheet(st) {
  return {
    kind: 'statement',
    invoiceNo: st.number,
    invoiceDate: st.date,
    dueDate: st.due,
    periodLabel: periodLabel(st.period),
    customer: { name: st.name, address: st.address, phone: st.phone },
    lines: st.lines,
    previous: st.previous,
    previousTotal: st.previousTotal,
    open: st.open,
    total: st.total,
  };
}

/** Open visits for a pay link (older balance first). */
export const statementOpenLines = st => [...st.previous, ...st.lines.filter(l => !l.paid)];

// ---- Who owes what, by how late (from each visit's due date) ----
export const AGING = [
  { id: 'current', label: 'Not due yet', min: 0, max: 0 },
  { id: 'd30', label: '1–30 days', min: 1, max: 30 },
  { id: 'd60', label: '31–60', min: 31, max: 60 },
  { id: 'd90', label: '61–90', min: 61, max: 90 },
  { id: 'd90p', label: '90+', min: 91, max: Infinity },
];
export function aging(jobs, today, settings) {
  const rows = AGING.map(b => ({ ...b, amount: 0, keys: new Set() }));
  for (const j of jobs) {
    if (j.status !== 'completed' || j.paid) continue;
    const d = daysPastDue(j, today, settings);
    const row = rows.find(b => d >= b.min && d <= b.max);
    row.amount += j.earnings || 0;
    row.keys.add(lawnKey(j));
  }
  return rows.map(({ keys, ...b }) => ({ ...b, customers: keys.size }));
}
