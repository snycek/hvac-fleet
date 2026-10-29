// Per-lawn stats and the monthly P/L, built from jobs + expenses.
import { addDays, todayString } from './dates.js';

// Repeat cuts at the same address are the same lawn.
export const lawnKey = job => String(job.address || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const minutesBetween = (a, b) => (new Date(b) - new Date(a)) / 60000;

// Customer's own notes from the quote ("Notes: gate code…").
export function customerNotes(job) {
  const text = String(job?.notes || '');
  const idx = text.indexOf('Notes: ');
  if (idx >= 0) return text.slice(idx + 7).trim();
  return /^(Measured |Skipped measuring)/.test(text) ? '' : text.trim();
}

export function lawnStats(jobs, key) {
  const all = jobs.filter(j => lawnKey(j) === key && !['quote', 'declined'].includes(j.status));
  const cuts = all.filter(j => j.status === 'completed').sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)));
  // Under 3 min is a mis-tap; over 10 hrs means they forgot to tap Mark Cut.
  // Landscaping projects at the same address take hours: they're not cut time.
  const timed = cuts.filter(j => j.startedAt && j.completedAt && !/^landscaping/i.test(String(j.service || '')))
    .map(j => minutesBetween(j.startedAt, j.completedAt))
    .filter(m => m >= 3 && m < 600);
  const open = all.filter(j => !['completed', 'skipped'].includes(j.status))
    .sort((a, b) => String(a.scheduledDate || todayString()).localeCompare(String(b.scheduledDate || todayString())));
  const upcoming = open.map(j => j.scheduledDate || todayString());
  const latest = all.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] || {};
  const withNotes = all.find(j => customerNotes(j));
  return {
    key,
    name: latest.clientName,
    phone: latest.clientPhone,
    address: latest.address,
    price: latest.earnings,
    repeatDays: latest.repeatDays,
    sqFt: (all.find(j => j.quote?.totalSqFt) || {}).quote?.totalSqFt,
    cuts: cuts.length,
    avgMinutes: timed.length ? Math.round(timed.reduce((s, m) => s + m, 0) / timed.length) : null,
    paid: cuts.filter(j => j.paid).reduce((s, j) => s + (j.earnings || 0), 0),
    owed: cuts.filter(j => !j.paid).reduce((s, j) => s + (j.earnings || 0), 0),
    lastCut: cuts[0]?.completedAt || null,
    nextCut: upcoming[0] || null,
    // The visit the owner can move (not started yet). regularDate = moved just this once.
    nextVisit: open[0] && ['pending', 'assigned'].includes(open[0].status)
      ? { id: open[0].id, date: open[0].scheduledDate || todayString(), techId: open[0].assignedTo || null, regularDate: open[0].regularDate || null, regularTech: open[0].regularTech || null }
      : null,
    location: latest.location || null,
    lawnId: latest.lawnId || null,
    notes: withNotes ? customerNotes(withNotes) : '',
    history: cuts,
  };
}

export function allLawns(jobs) {
  const keys = [...new Set(jobs.filter(j => !['quote', 'declined'].includes(j.status) && j.address).map(lawnKey))];
  return keys.map(k => lawnStats(jobs, k));
}

// ---- Money ----

export const monthOf = iso => (iso ? todayString(new Date(iso)).slice(0, 7) : '');
export const monthOfDate = dateString => String(dateString || '').slice(0, 7);

export function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// ---- Periods: day / week (Mon–Sun) / month ----

export const PERIODS = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
];

const d12 = s => new Date(`${s}T12:00:00`);
const shortMD = s => d12(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

// { from, to } inclusive 'YYYY-MM-DD' for the period containing anchor.
export function periodRange(mode, anchor) {
  if (mode === 'day') return { from: anchor, to: anchor };
  if (mode === 'week') {
    const back = (d12(anchor).getDay() + 6) % 7; // days since Monday
    const from = addDays(anchor, -back);
    return { from, to: addDays(from, 6) };
  }
  const from = `${anchor.slice(0, 7)}-01`;
  return { from, to: addDays(`${shiftMonth(anchor.slice(0, 7), 1)}-01`, -1) };
}

export function shiftPeriod(mode, anchor, delta) {
  if (mode === 'day') return addDays(anchor, delta);
  if (mode === 'week') return addDays(anchor, 7 * delta);
  return `${shiftMonth(anchor.slice(0, 7), delta)}-01`;
}

export function periodLabel(mode, anchor, today = todayString()) {
  const { from, to } = periodRange(mode, anchor);
  if (mode === 'day') {
    const day = d12(anchor).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    return anchor === today ? `Today · ${day}` : day;
  }
  if (mode === 'week') return `${today >= from && today <= to ? 'This week · ' : ''}${shortMD(from)} – ${shortMD(to)}`;
  return monthLabel(anchor.slice(0, 7));
}

// True when the period already includes today (no "next" to step to).
export const isCurrentOrLater = (mode, anchor, today = todayString()) => periodRange(mode, anchor).to >= today;
/** The period to show: follows "today" unless the owner stepped back to an older one. */
export const effectiveAnchor = (value, today) => (value.pinned ? value.anchor : today);
export const periodHas = (mode, anchor, day) => { const r = periodRange(mode, anchor); return day >= r.from && day <= r.to; };

export const dayOf = iso => (iso ? todayString(new Date(iso)) : '');
const inRange = (dateString, { from, to }) => Boolean(dateString) && dateString >= from && dateString <= to;

// Which day a job belongs to: its cut day, else the day it was finished, else today.
export const jobDay = (j, today = todayString()) => j.scheduledDate || (j.status === 'completed' ? dayOf(j.completedAt) : today);

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
/** 'Thursday' for a 'YYYY-MM-DD'. */
export const weekdayName = dateString => (dateString ? d12(dateString).toLocaleDateString('en-US', { weekday: 'long' }) : '');
export const weekdayIndex = dateString => (d12(dateString).getDay() + 6) % 7;

export const EXPENSE_TYPES = [
  { id: 'gas', label: 'Gas', icon: '⛽' },
  { id: 'maintenance', label: 'Maintenance', icon: '🔧' },
  { id: 'other', label: 'Other', icon: '🧾' },
  // Logged automatically when a card payment comes in — not picked by hand.
  { id: 'card_fees', label: 'Card fees', icon: '💳', manual: false },
  // Worked out from payroll hours (see laborExpenses in lib/payroll.js) — not entered by hand.
  { id: 'labor', label: 'Crew labor', icon: '👷', manual: false },
];
export const MANUAL_EXPENSE_TYPES = EXPENSE_TYPES.filter(t => t.manual !== false);
export const expenseType = id => EXPENSE_TYPES.find(t => t.id === id) || EXPENSE_TYPES[2];

// Income = cuts marked paid in the period. Owed = cuts done in the period, not paid yet.
// Expenses = logged expenses dated in the period. Net = income − expenses (cash in hand).
// period: a { from, to } range, or a 'YYYY-MM' month.
export function profitAndLoss(jobs, expenses, period) {
  const range = typeof period === 'string' ? periodRange('month', `${period}-01`) : period;
  const income = jobs.filter(j => j.paid && inRange(dayOf(j.paidAt), range));
  const owed = jobs.filter(j => j.status === 'completed' && !j.paid && inRange(dayOf(j.completedAt), range));
  const owedTotal = owed.reduce((s, j) => s + (j.earnings || 0), 0);
  const spent = expenses.filter(e => e.status === 'logged' && inRange(e.date, range));
  const byType = EXPENSE_TYPES.map(t => ({ ...t, total: spent.filter(e => e.category === t.id).reduce((s, e) => s + e.amount, 0) }));
  const incomeTotal = income.reduce((s, j) => s + (j.earnings || 0), 0);
  const expenseTotal = spent.reduce((s, e) => s + e.amount, 0);
  return { income, owed, owedTotal, spent, byType, incomeTotal, expenseTotal, net: incomeTotal - expenseTotal };
}

export const money = (n, cents = false) =>
  `${n < 0 ? '−' : ''}$${Math.abs(n || 0).toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })}`;

export const shortDate = iso => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) : '—');

// ---- Crew day: start/end times and rain delays ----

// Start and end of a foreman's day: the logged shift if there is one, otherwise worked
// out from their cuts (start = first heading out; end = last cut once all are done).
export function dayShift(techId, date, jobs, shifts = []) {
  const logged = shifts.find(s => s.techId === techId && s.date === date);
  if (logged) return { start: logged.start, end: logged.end };
  const mine = jobs.filter(j => j.assignedTo === techId && jobDay(j, date) === date);
  const start = mine.map(j => j.enRouteAt || j.startedAt).filter(Boolean).sort()[0] || null;
  const allDone = mine.length > 0 && mine.every(j => j.status === 'completed');
  const end = allDone ? mine.map(j => j.completedAt).filter(Boolean).sort().pop() || null : null;
  return { start, end };
}

// Rain-delay minutes for one foreman (or everyone if techId is null) between two dates.
// Open delays count up to now.
export function rainMinutes(delays, techId, from, to) {
  return delays
    .filter(d => (!techId || d.techId === techId) && d.date >= from && d.date <= to)
    .reduce((s, d) => s + (d.minutes ?? Math.max(0, Math.round((Date.now() - new Date(d.start)) / 60000))), 0);
}

export const hoursMins = m => (m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`);

// Average time of day for a list of ISO times ('8:04 AM'); null if none.
export function averageClock(isoTimes) {
  const mins = isoTimes.filter(Boolean).map(t => { const d = new Date(t); return d.getHours() * 60 + d.getMinutes(); });
  if (!mins.length) return null;
  const avg = Math.round(mins.reduce((s, m) => s + m, 0) / mins.length);
  const d = new Date(); d.setHours(Math.floor(avg / 60), avg % 60, 0, 0);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// ---- Collections ----
// When a bill is due and how late it is: see invoices.js (dueDateFor, daysPastDue).

// Friendly payment reminder the customer gets.
export function reminderMessage(job, companyName) {
  const first = String(job.clientName || '').split(' ')[0] || 'there';
  const when = job.completedAt ? new Date(job.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'your recent';
  return `Hi ${first}, this is ${companyName}. Friendly reminder: $${Math.round(job.earnings || 0)} for your ${when} lawn cut at ${String(job.address || '').split(',')[0]} is still open. Reply here with any questions — thank you!`;
}
