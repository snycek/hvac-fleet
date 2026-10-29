// Landscaping quotes: the owner prices the job (line items) when approving the request,
// it goes back to the customer by email (text if no email) with a link to accept or
// decline. Accepted → it's on the landscaping crew's schedule, billed when it's done.

export const ITEM_SUGGESTIONS = ['Mulch', 'Plants & shrubs', 'Sod', 'Stone & edging', 'Labor', 'Cleanup & haul away'];

export const cleanItems = items => (Array.isArray(items) ? items : [])
  .map(i => ({ label: String(i?.label || '').trim().slice(0, 80), amount: Math.round(Math.max(0, Number(i?.amount) || 0) * 100) / 100 }))
  .filter(i => i.label && i.amount > 0)
  .slice(0, 20);
export const offerTotal = items => Math.round(cleanItems(items).reduce((s, i) => s + i.amount, 0) * 100) / 100;

const usd = n => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const niceDay = d => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) : '');

/** Email/text that carries the quote. {quoteLink} is filled in by whoever sends it. */
export function quoteMessage(job, offer, companyName) {
  const first = String(job.clientName || '').split(' ')[0] || 'there';
  return `Hi ${first}, thanks for asking ${companyName} about landscaping at ${String(job.address || '').split(',')[0]}. `
    + `Your quote is ${usd(offer.total)}${offer.startDate ? `, and we can start ${niceDay(offer.startDate)}` : ''}. `
    + 'See the details and accept or decline here: {quoteLink}';
}

/** Statuses a landscaping quote goes through. */
export const QUOTE_STATUS = {
  quote: 'New request',
  quote_sent: 'Sent · waiting on customer',
  declined: 'Declined',
};

// Demo quotes carry the quote in the link (/quote/demo#…), like demo invoices do.
export function demoQuoteHash(job, offer, companyName) {
  const data = { n: job.clientName, a: job.address, c: companyName, i: offer.items, t: offer.total, s: offer.startDate || '', m: offer.note || '' };
  return btoa(unescape(encodeURIComponent(JSON.stringify(data))));
}
export function readDemoQuote(hash) {
  try {
    const d = JSON.parse(decodeURIComponent(escape(atob(hash))));
    return { demo: true, status: 'quote_sent', customer: { name: d.n, address: d.a }, company: d.c, offer: { items: cleanItems(d.i), total: d.t, startDate: d.s, note: d.m } };
  } catch {
    return null;
  }
}
