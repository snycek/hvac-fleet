// "Crew on the way" heads-up: customers who asked for it get a text/email (their
// preferred way) when the crew heads to their lawn, i.e. right after the stop before
// is marked cut. Shared by the server and the demo.
import { addressFor, remindBy } from './billing.js';

const street = a => String(a || '').split(',')[0];

/** The message they get. */
export function arrivalMessage(job, companyName) {
  const first = String(job.clientName || '').split(' ')[0] || 'there';
  const snow = job.service === 'Snow Removal' || job.perSnowfall;
  return snow
    ? `Hi ${first}, ${companyName} here: your plow crew is on the way to ${street(job.address)} now. If you can, please move cars out of the lot so we can clear it all. Thanks!`
    : `Hi ${first}, ${companyName} here: your crew is on the way to ${street(job.address)} now. If you can, please unlock the gate and move any cars or toys off the lawn. Thanks!`;
}

/** A heads-up never counts as a payment reminder (the once-a-week limit). */
export const isHeadsUp = contact => contact?.kind === 'heads_up';
/** Latest payment-type contact (reminder or statement) from a newest-first list. */
export const lastPaymentContact = contacts => (contacts || []).find(c => !isHeadsUp(c)) || null;

/** The log record for one heads-up (null if we have no phone or email for them). */
export function headsUpRecord(job, companyName, at) {
  const channel = remindBy(job);
  if (!channel) return null;
  return {
    // Full visit id: several can go out in the same millisecond (the demo).
    id: `otw_${Date.now().toString(36)}_${String(job.id).replace(/[^\w]/g, '')}`,
    at, kind: 'heads_up', channel, to: addressFor(job, channel), by: 'Auto',
    message: arrivalMessage(job, companyName), delivered: false,
  };
}

/** Should this visit get a heads-up now? (asked for one, and not already sent for it) */
export const wantsHeadsUp = job => Boolean(job?.notifyArrival) && !(job.reminders || []).some(isHeadsUp);
