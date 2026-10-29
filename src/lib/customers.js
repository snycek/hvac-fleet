// One customer's history (same service address = same customer): visits, payments
// (including declined cards) and every reminder sent — the audit trail behind the
// customer card. Shared by the owner hub (live + demo).
import { customerNotes as customerNoteText, lawnKey } from './lawns.js';
import { billingMode, daysPastDue, dueDateFor, invoiceNumber, serviceDate, serviceLabel } from './invoices.js';
import { contactPref } from './billing.js';
import { lastPaymentContact } from './notify.js';
import { METHODS } from './payments.js';
import { addDays } from './dates.js';

export const REMIND_GAP_DAYS = 7; // "Remind all" skips anyone reminded this recently

const days = (from, to) => Math.round((new Date(`${to}T12:00:00`) - new Date(`${String(from).slice(0, 10)}T12:00:00`)) / 86400000);
const usd = n => `$${Math.round(n || 0)}`;

/** Every reminder across these jobs, newest first. Account reminders cover several cuts but show once. */
export function contactsFor(jobs) {
  const seen = new Map();
  for (const j of jobs) {
    (j.reminders || []).forEach((r, i) => {
      const id = r.id || `${j.id}#${i}`;
      const prev = seen.get(id);
      if (prev) prev.jobIds.push(j.id);
      else seen.set(id, { ...r, id, jobIds: [j.id] });
    });
  }
  return [...seen.values()].sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

/** Full history for the customer at this job's address. */
export function customerHistory({ jobs, payments = [], key, today, settings }) {
  const mine = jobs.filter(j => lawnKey(j) === key && j.status !== 'quote' && j.status !== 'declined');
  const latest = [...mine].sort((a, b) => serviceDate(b).localeCompare(serviceDate(a)))[0] || {};
  const ids = new Set(mine.map(j => j.id));

  const visits = [...mine].sort((a, b) => serviceDate(b).localeCompare(serviceDate(a))).map(j => ({
    id: j.id,
    date: serviceDate(j),
    service: serviceLabel(j),
    invoiceNo: invoiceNumber(j),
    amount: j.earnings || 0,
    status: j.paid ? 'paid' : j.status === 'completed' ? 'open' : j.status === 'skipped' ? 'skipped' : 'upcoming',
    skipReason: j.skipReason || null,
    paidAt: j.paidAt || null,
    method: j.paymentMethod || null,
    age: j.status === 'completed' && !j.paid ? days(serviceDate(j), today) : null,
    due: j.status === 'completed' && !j.paid ? dueDateFor(j, settings) : null,
    late: daysPastDue(j, today, settings), // days past its due date (0 = not late)
    checkPending: !j.paid && j.checkPending ? j.checkPending : null,
  }));
  const open = visits.filter(v => v.status === 'open');

  // Payments: one row per payment (a portal payment can cover several cuts), plus declines.
  const byPayment = new Map();
  for (const j of mine.filter(x => x.paid)) {
    const p = j.paymentId ? payments.find(x => x.id === j.paymentId) : null;
    const k = p?.id || `job-${j.id}`;
    const row = byPayment.get(k) || {
      id: k, at: j.paidAt, amount: 0, visits: 0, status: 'paid',
      method: p?.method || j.paymentMethod || 'cash',
      card: p?.method === 'card' ? `${p.brand} ••${p.last4}` : null,
    };
    row.amount += j.earnings || 0;
    row.visits += 1;
    byPayment.set(k, row);
  }
  const declines = payments
    .filter(p => p.status === 'failed' && p.jobIds?.some(id => ids.has(id)))
    .map(p => ({ id: p.id, at: p.at, amount: p.amount, visits: p.jobIds.length, status: 'declined', method: p.method || 'card', card: p.method === 'check' ? `Check${p.last4 ? ` #${p.last4}` : ''}` : `${p.brand} ••${p.last4}`, reason: p.reason }));
  const paymentRows = [...byPayment.values(), ...declines].sort((a, b) => String(b.at).localeCompare(String(a.at)));

  // Property: the areas they outlined when they asked for a quote (kept on every repeat cut).
  const quoted = [...mine].reverse().find(j => j.quote?.zones?.length) || mine.find(j => j.quote) || null;
  const q = quoted?.quote || null;
  const property = {
    center: q?.center || latest.location || null,
    zones: (q?.zones || []).map((z, i) => ({ ...z, id: `${quoted.id}-z${i}` })),
    totalSqFt: q?.totalSqFt || 0,
    requested: q?.wanted || latest.requested || [],
    quotedPrice: q?.estimate ?? null,
    price: latest.earnings || 0,
    service: serviceLabel(latest),
    repeatDays: latest.repeatDays || 0,
    perSnowfall: !!latest.perSnowfall,
    notes: customerNoteText(quoted || latest),
  };

  return {
    key,
    property,
    name: latest.clientName || '',
    address: latest.address || '',
    phone: latest.clientPhone || '',
    email: latest.clientEmail || latest.email || '',
    balance: open.reduce((s, v) => s + v.amount, 0),
    oldestOpen: open.length ? open[open.length - 1] : null,
    daysLate: Math.max(0, ...open.map(v => v.late)),
    contactPref: contactPref(latest),
    billing: latest.id ? billingMode(latest) : 'monthly',
    notifyArrival: Boolean(latest.notifyArrival),
    visits,
    payments: paymentRows,
    contacts: contactsFor(mine),
    paidTotal: [...byPayment.values()].reduce((s, r) => s + r.amount, 0),
  };
}

export const methodLabel = r => (r.card ? r.card : (METHODS[r.method]?.label || r.method));

/** One reminder per customer per week: the date they can next be reminded, or null if now. */
export function nextReminderDate(lastReminder, today) {
  if (!lastReminder?.at) return null;
  const next = addDays(String(lastReminder.at).slice(0, 10), REMIND_GAP_DAYS);
  return next > today ? next : null;
}

/**
 * Customers with something past its due date (at least minDays late), one entry each,
 * with all their open visits (the reminder covers the whole balance).
 * oldestDays = how many days past due their oldest bill is.
 */
export function pastDueCustomers(jobs, today, minDays = 1, settings) {
  const byKey = new Map();
  for (const j of jobs) {
    if (j.status !== 'completed' || j.paid) continue;
    const key = lawnKey(j);
    const list = byKey.get(key) || [];
    list.push(j);
    byKey.set(key, list);
  }
  const out = [];
  for (const [key, open] of byKey) {
    open.sort((a, b) => serviceDate(a).localeCompare(serviceDate(b)));
    const late = open.map(j => daysPastDue(j, today, settings));
    const oldest = Math.max(0, ...late);
    if (oldest < Math.max(1, minDays)) continue;
    const last = lastPaymentContact(contactsFor(jobs.filter(j => lawnKey(j) === key)));
    const recentlyReminded = !!last && String(last.at).slice(0, 10) > addDays(today, -REMIND_GAP_DAYS);
    const latest = open[open.length - 1];
    out.push({
      key,
      name: latest.clientName,
      address: latest.address,
      phone: latest.clientPhone || '',
      email: latest.clientEmail || latest.email || '',
      jobs: open,
      balance: open.reduce((s, j) => s + (j.earnings || 0), 0),
      overdue: open.filter((_, i) => late[i] > 0).reduce((s, j) => s + (j.earnings || 0), 0),
      // A check they said is coming (covers some or all of the open balance).
      check: open.find(j => j.checkPending)?.checkPending || null,
      checkCoversAll: open.every(j => j.checkPending),
      oldestDays: oldest,
      oldestDate: serviceDate(open[0]),
      lastReminder: last || null,
      recentlyReminded,
    });
  }
  return out.sort((a, b) => b.oldestDays - a.oldestDays);
}

/** Text for an account reminder. {payLink} is filled in with their pay link when sent. */
export function accountReminder(c, companyName) {
  const first = String(c.name || '').split(' ')[0] || 'there';
  const since = new Date(`${c.oldestDate}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const visits = c.jobs.length;
  return `Hi ${first}, this is ${companyName}. Friendly reminder: your account has ${usd(c.balance)} open for ${visits} visit${visits === 1 ? '' : 's'} (since ${since}) at ${String(c.address || '').split(',')[0]}. Pay anytime here: {payLink} — questions? Just reply. Thank you!`;
}
