// Per-lawn stats and the monthly P/L, built from jobs + expenses.
import { todayString } from './dates.js';

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
  const timed = cuts.filter(j => j.startedAt && j.completedAt)
    .map(j => minutesBetween(j.startedAt, j.completedAt))
    .filter(m => m >= 3 && m < 600);
  const upcoming = all.filter(j => j.status !== 'completed').map(j => j.scheduledDate || todayString()).sort();
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

export const EXPENSE_TYPES = [
  { id: 'gas', label: 'Gas', icon: '⛽' },
  { id: 'maintenance', label: 'Maintenance', icon: '🔧' },
  { id: 'other', label: 'Other', icon: '🧾' },
];
export const expenseType = id => EXPENSE_TYPES.find(t => t.id === id) || EXPENSE_TYPES[2];

// Income = cuts marked paid in the month. Expenses = logged expenses dated in the month.
export function profitAndLoss(jobs, expenses, month) {
  const income = jobs.filter(j => j.paid && monthOf(j.paidAt) === month);
  const spent = expenses.filter(e => e.status === 'logged' && monthOfDate(e.date) === month);
  const byType = EXPENSE_TYPES.map(t => ({ ...t, total: spent.filter(e => e.category === t.id).reduce((s, e) => s + e.amount, 0) }));
  const incomeTotal = income.reduce((s, j) => s + (j.earnings || 0), 0);
  const expenseTotal = spent.reduce((s, e) => s + e.amount, 0);
  return { income, spent, byType, incomeTotal, expenseTotal, net: incomeTotal - expenseTotal };
}

export const money = (n, cents = false) =>
  `${n < 0 ? '−' : ''}$${Math.abs(n || 0).toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })}`;

export const shortDate = iso => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) : '—');
