// Customer invoices: the paper left at the door after a visit, and the account page the
// QR code on it opens. Shared by the server and the browser.
import { addDays, todayString } from './dates.js';
import { lawnKey } from './lawns.js';

export const DUE_DAYS = 15;        // due 15 days after the invoice date
export const PAST_DUE_AFTER = 30;  // older unpaid visits are flagged past due

const dayOf = iso => String(iso || '').slice(0, 10);
const shortHash = s => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 1679616; return h.toString(36).toUpperCase().padStart(4, '0'); };

/** Service date of a visit: when it was done, else when it's scheduled. */
export const serviceDate = job => dayOf(job.completedAt) || job.scheduledDate || dayOf(job.createdAt);

/** Stable invoice number for a visit, e.g. JL-261027-4F2A. */
export const invoiceNumber = job => `JL-${serviceDate(job).slice(2).replace(/-/g, '')}-${shortHash(job.id)}`;

export const serviceLabel = job => (job.service === 'Snow Removal' ? 'Snow removal — plow & clear' : String(job.service || 'Lawn service').replace(/^Quote:\s*/i, ''));

/** One invoice line for a visit. */
export function invoiceLine(job, today = todayString()) {
  const date = serviceDate(job);
  const age = Math.round((new Date(`${today}T12:00:00`) - new Date(`${date}T12:00:00`)) / 86400000);
  return {
    id: job.id,
    invoiceNo: invoiceNumber(job),
    date,
    service: serviceLabel(job),
    amount: job.earnings || 0,
    paid: !!job.paid,
    paidAt: job.paidAt || null,
    pastDue: !job.paid && job.status === 'completed' && age > PAST_DUE_AFTER,
  };
}

/** Every visit at this customer's address (same lawn = same customer). */
export const customerJobs = (jobs, job) => {
  const key = lawnKey(job);
  return jobs.filter(j => lawnKey(j) === key);
};

/**
 * What goes on the paper for one visit: this visit, plus any older finished visits
 * that still aren't paid (shown as previous balance).
 */
export function invoiceFor(jobs, job, today = todayString()) {
  const current = invoiceLine(job, today);
  const previous = customerJobs(jobs, job)
    .filter(j => j.id !== job.id && j.status === 'completed' && !j.paid && serviceDate(j) < current.date)
    .sort((a, b) => serviceDate(a).localeCompare(serviceDate(b)))
    .map(j => invoiceLine(j, today));
  const previousTotal = previous.reduce((s, l) => s + l.amount, 0);
  return {
    invoiceNo: current.invoiceNo,
    invoiceDate: today,
    dueDate: addDays(today, DUE_DAYS),
    customer: { name: job.clientName, address: job.address, phone: job.clientPhone || '' },
    current,
    previous,
    previousTotal,
    total: (current.paid ? 0 : current.amount) + previousTotal,
  };
}

/** The customer's account: open visits (finished, unpaid) and recent payments. */
export function accountFor(jobs, anyJob, today = todayString()) {
  const mine = customerJobs(jobs, anyJob);
  const lines = mine.filter(j => j.status !== 'quote' && j.status !== 'declined').map(j => invoiceLine(j, today));
  const open = lines.filter(l => !l.paid && mine.find(j => j.id === l.id)?.status === 'completed').sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = lines.filter(l => !l.paid && mine.find(j => j.id === l.id)?.status !== 'completed').sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
  const paid = lines.filter(l => l.paid).sort((a, b) => String(b.paidAt).localeCompare(String(a.paidAt))).slice(0, 8);
  return {
    customer: { name: anyJob.clientName, address: anyJob.address },
    open,
    upcoming,
    paid,
    balance: open.reduce((s, l) => s + l.amount, 0),
  };
}

// ---- Demo invoices: no server copy of demo jobs, so the QR carries the account itself ----
const b64url = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

// Kept short so the QR stays easy to scan: dates as YYMMDD, services as one letter.
const SVC = { L: 'Lawn Cutting', R: 'Leaf Removal', S: 'Snow removal — plow & clear' };
const svcCode = s => Object.keys(SVC).find(k => SVC[k] === s) || s;
export function demoAccountHash(account) {
  const pack = {
    n: account.customer.name,
    a: account.customer.address.replace(/, MI \d{5}$/, ''),
    o: account.open.map(l => [l.date.slice(2).replace(/-/g, ''), l.amount, svcCode(l.service), l.invoiceNo.slice(-4)]),
    t: account.asOf, // invoice date, so "past due" matches the paper
  };
  return b64url(JSON.stringify(pack));
}
export function readDemoAccount(hash, today = todayString()) {
  try {
    const p = JSON.parse(unb64url(hash));
    if (p.t) today = p.t;
    const open = (p.o || []).map(([d, amount, svc, tail], i) => {
      const date = `20${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4, 6)}`;
      const age = Math.round((new Date(`${today}T12:00:00`) - new Date(`${date}T12:00:00`)) / 86400000);
      return { id: `demo-${i}`, invoiceNo: `JL-${d}-${tail}`, date, service: SVC[svc] || svc, amount, pastDue: age > PAST_DUE_AFTER, paid: false };
    });
    return { customer: { name: p.n, address: p.a }, open, upcoming: [], paid: [], balance: open.reduce((s, l) => s + l.amount, 0), demo: true };
  } catch {
    return null;
  }
}
