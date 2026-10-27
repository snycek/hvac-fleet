// Payments received. Shared by the server and the demo so card results are handled
// one way everywhere: a processor reports a result → applyPaymentResult() updates the books.
//
// Result shape (what a processor webhook boils down to):
//   { processorId, jobIds, amount, status: 'succeeded' | 'failed', method: 'card' | 'cash' | 'check',
//     brand?, last4?, reason?, at (ISO) }

export const CARD_FEE = { pct: 0.029, fixed: 0.30 }; // typical card processing
export const cardFee = amount => Math.round((amount * CARD_FEE.pct + CARD_FEE.fixed) * 100) / 100;

export const METHODS = {
  card: { label: 'Card', icon: '💳' },
  cash: { label: 'Cash', icon: '💵' },
  check: { label: 'Check', icon: '🧾' },
};

const localDate = iso => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ---- Test processor (stands in for Stripe/PayPal/Square until one is connected) ----
// Last 4 decides the outcome, like processors' test cards.
export const TEST_CARDS = {
  4242: { brand: 'Visa', ok: true },
  4444: { brand: 'Mastercard', ok: true },
  '0005': { brand: 'Amex', ok: true },
  1117: { brand: 'Discover', ok: true },
  9995: { brand: 'Visa', ok: false, reason: 'Insufficient funds' },
  '0002': { brand: 'Visa', ok: false, reason: 'Card declined' },
  '0069': { brand: 'Mastercard', ok: false, reason: 'Card expired' },
};

let seq = 0;
export function simulateCardCharge({ jobIds, amount, last4 = '4242', at = new Date().toISOString() }) {
  const card = TEST_CARDS[last4] || { brand: 'Visa', ok: true };
  seq += 1;
  return {
    processorId: `test_ch_${Date.now().toString(36)}_${seq}`,
    jobIds, amount, method: 'card', brand: card.brand, last4: String(last4),
    status: card.ok ? 'succeeded' : 'failed',
    reason: card.ok ? null : card.reason,
    at,
  };
}

/**
 * Apply one payment result to the books. Pure: returns new { jobs, payments, expenses }.
 * - succeeded: cuts marked paid at the time the money arrived; card fee logged as an expense.
 * - failed: cuts stay unpaid and carry the problem so the owner sees it in To-Do.
 * Same processorId twice = ignored (processors can resend results).
 */
export function applyPaymentResult({ jobs, payments, expenses }, result) {
  if (!result || !Array.isArray(result.jobIds) || !result.jobIds.length) return { jobs, payments, expenses, payment: null };
  if (result.processorId && payments.some(p => p.processorId === result.processorId)) {
    return { jobs, payments, expenses, payment: payments.find(p => p.processorId === result.processorId), duplicate: true };
  }
  const at = result.at || new Date().toISOString();
  const ids = new Set(result.jobIds);
  const forJobs = jobs.filter(j => ids.has(j.id));
  const amount = Math.round((result.amount ?? forJobs.reduce((s, j) => s + (j.earnings || 0), 0)) * 100) / 100;
  const isCard = result.method === 'card';
  const fee = isCard && result.status === 'succeeded' ? cardFee(amount) : 0;
  const payment = {
    id: `pay_${(result.processorId || `${Date.now()}`).replace(/[^\w]/g, '')}`,
    processorId: result.processorId || null,
    jobIds: result.jobIds,
    clientName: forJobs[0]?.clientName || '',
    amount, fee, net: Math.round((amount - fee) * 100) / 100,
    method: result.method || 'cash',
    brand: result.brand || null,
    last4: result.last4 || null,
    status: result.status,
    reason: result.reason || null,
    at,
  };

  let nextJobs = jobs;
  let nextExpenses = expenses;
  if (payment.status === 'succeeded') {
    nextJobs = jobs.map(j => (ids.has(j.id) ? { ...j, paid: true, paidAt: at, paymentId: payment.id, paymentMethod: payment.method, paymentIssue: null } : j));
    if (fee > 0) {
      nextExpenses = [{
        id: `fee_${payment.id}`, category: 'card_fees', amount: fee, date: localDate(at),
        note: `${payment.brand || 'Card'} ••${payment.last4 || '----'} · ${payment.clientName}`,
        status: 'logged', paymentId: payment.id, hasReceipt: false, createdAt: at, loggedAt: at,
      }, ...expenses];
    }
  } else {
    nextJobs = jobs.map(j => (ids.has(j.id) ? { ...j, paymentIssue: { at, reason: payment.reason || 'Payment failed', paymentId: payment.id, last4: payment.last4, brand: payment.brand } } : j));
  }
  return { jobs: nextJobs, payments: [payment, ...payments], expenses: nextExpenses, payment };
}

/** Owner taps "not paid" after all: undo the payment and its card fee. */
export function voidPayment({ jobs, payments, expenses }, jobId) {
  const job = jobs.find(j => j.id === jobId);
  const pid = job?.paymentId;
  return {
    jobs: jobs.map(j => (j.id === jobId ? { ...j, paid: false, paidAt: null, paymentId: null, paymentMethod: null } : j)),
    payments: payments.map(p => (p.id === pid ? { ...p, status: 'voided' } : p)),
    expenses: expenses.filter(e => !(pid && e.paymentId === pid)),
  };
}
