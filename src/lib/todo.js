// What's on the owner's To-Do (and the number on its tab).
import { lawnKey } from './lawns.js';
import { addDays } from './dates.js';
import { serviceDate } from './invoices.js';
import { emailOf } from './billing.js';
import { pastDueCustomers } from './customers.js';
import { pendingChecks } from './payments.js';

// Things that aren't urgent but shouldn't be forgotten: customers we can't send a bill
// to (no phone or email), and quote requests nobody has answered in a week.
export function housekeepingItems(jobs, today) {
  const recent = jobs.filter(j => !['quote', 'declined'].includes(j.status) && serviceDate(j) >= addDays(today, -60));
  const noContact = new Map();
  for (const j of recent) if (!j.clientPhone && !emailOf(j)) noContact.set(lawnKey(j), j);
  const staleQuotes = jobs.filter(j => j.status === 'quote' && String(j.createdAt || '').slice(0, 10) <= addDays(today, -7));
  return { noContact: [...noContact.values()], staleQuotes };
}

/** How many things on the To-Do need the owner (the tab badge). */
export function todoCount({ jobs, expenses, today, settings, statementsReady, hideQuotes = true }) {
  const chores = housekeepingItems(jobs, today);
  const quotes = jobs.filter(j => j.status === 'quote').length;
  return (hideQuotes ? (quotes ? 1 : 0) : quotes)
    + expenses.filter(e => e.status === 'pending').length
    + (statementsReady ? 1 : 0)
    // Past due counts only when John can act: not reminded this week, nothing on the way
    // (those wait in a folded group and come back when the week is up).
    + pastDueCustomers(jobs, today, 1, settings).filter(c => !c.recentlyReminded && !c.check).length
    + pendingChecks(jobs).length
    + jobs.filter(j => j.status === 'completed' && !j.paid && j.paymentIssue).length
    + chores.noContact.length + chores.staleQuotes.length;
}
