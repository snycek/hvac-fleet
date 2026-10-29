// Bookkeeping: everything the app already knows (visits billed, payments received,
// expenses, crew pay, fixed monthly costs) turned into double-entry books and the monthly
// reports a bookkeeper hands an accountant.
//
// Every transaction becomes a balanced journal entry (debits = credits) on a small chart
// of accounts. Reports are built from those entries, so the trial balance always ties out
// and the balance sheet always balances.
//
// Accrual basis by default (income when the work is done, wages when they're worked);
// the P&L can also be shown on a cash basis (income when paid, wages when paid).
import { addDays } from './dates.js';
import { dayOf } from './lawns.js';
import { invoiceNumber } from './invoices.js';
import { buildPayroll, weekDates } from './payroll.js';

export const ACCOUNTS = [
  { no: '1000', name: 'Cash (bank)', type: 'asset' },
  { no: '1200', name: 'Accounts receivable', type: 'asset' },
  { no: '2100', name: 'Wages payable', type: 'liability' },
  { no: '3900', name: 'Retained earnings', type: 'equity' },
  { no: '4000', name: 'Lawn mowing income', type: 'income' },
  { no: '4100', name: 'Landscaping income', type: 'income' },
  { no: '4200', name: 'Snow removal income', type: 'income' },
  { no: '4300', name: 'Leaf removal & other income', type: 'income' },
  { no: '5000', name: 'Crew wages', type: 'cogs' },
  { no: '5100', name: 'Fuel', type: 'cogs' },
  { no: '5200', name: 'Equipment repairs & maintenance', type: 'cogs' },
  { no: '6000', name: 'Merchant (card) fees', type: 'expense' },
  { no: '6100', name: 'Insurance', type: 'expense' },
  { no: '6200', name: 'Vehicle payments', type: 'expense' },
  { no: '6300', name: 'Phone & software', type: 'expense' },
  { no: '6900', name: 'Other expenses', type: 'expense' },
];
export const account = no => ACCOUNTS.find(a => a.no === no);
const isPL = no => ['income', 'cogs', 'expense'].includes(account(no)?.type);
const debitNormal = no => ['asset', 'cogs', 'expense'].includes(account(no)?.type);

const r2 = n => Math.round((n || 0) * 100) / 100;
export const monthStart = m => `${m}-01`;
export const monthEnd = m => { const [y, mo] = m.split('-').map(Number); return addDays(`${mo === 12 ? y + 1 : y}-${String(mo === 12 ? 1 : mo + 1).padStart(2, '0')}-01`, -1); };
export const nextMonth = m => addDays(monthEnd(m), 1).slice(0, 7);
export const monthLabel = m => new Date(`${m}-15T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

export function incomeAccount(job) {
  const s = String(job.service || '');
  if (job.service === 'Snow Removal' || job.perSnowfall) return '4200';
  if (/^landscaping/i.test(s)) return '4100';
  if (/leaf/i.test(s)) return '4300';
  return '4000';
}
const EXPENSE_ACCOUNT = { gas: '5100', maintenance: '5200', card_fees: '6000', other: '6900' };
export function fixedCostAccount(label) {
  const l = String(label || '').toLowerCase();
  if (/insur/.test(l)) return '6100';
  if (/truck|vehicle|loan|auto|car /.test(l)) return '6200';
  if (/phone|software|internet|app|web/.test(l)) return '6300';
  return '6900';
}
const METHOD = { card: 'Card', cash: 'Cash', check: 'Check' };

/**
 * All journal entries from the first record through `through` (a 'YYYY-MM-DD').
 * entry: { id, date, type, ref, name, memo, lines: [{ acct, debit, credit }] }
 */
export function journalEntries({ jobs, expenses, employees = [], shifts = [], delays = [], payrollSettings = {}, fixedCosts = [], through }) {
  const out = [];
  const add = (e) => out.push({ ...e, lines: e.lines.map(l => ({ acct: l.acct, debit: r2(l.debit), credit: r2(l.credit) })) });

  // Sales: a finished visit is billed (accounts receivable) the day it's done.
  for (const j of jobs) {
    if (j.status !== 'completed' || !(j.earnings > 0) || !j.completedAt) continue;
    const date = dayOf(j.completedAt);
    if (date > through) continue;
    const inc = incomeAccount(j);
    add({ id: `inv-${j.id}`, date, type: 'Invoice', ref: invoiceNumber(j), name: j.clientName, memo: `${j.service} · ${String(j.address || '').split(',')[0]}`,
      lines: [{ acct: '1200', debit: j.earnings }, { acct: inc, credit: j.earnings }] });
    // Cash receipts: paid (card, cash, check).
    if (j.paid && j.paidAt && dayOf(j.paidAt) <= through) {
      add({ id: `rcpt-${j.id}`, date: dayOf(j.paidAt), type: 'Payment', ref: invoiceNumber(j), name: j.clientName, memo: `${METHOD[j.paymentMethod] || 'Payment'} received`,
        lines: [{ acct: '1000', debit: j.earnings }, { acct: '1200', credit: j.earnings }] });
    }
  }

  // Expenses the owner logged (gas, maintenance, other) and card fees (logged automatically).
  for (const e of expenses) {
    if (e.status !== 'logged' || e.derived || e.category === 'labor' || !(e.amount > 0) || !e.date || e.date > through) continue;
    const acct = EXPENSE_ACCOUNT[e.category] || '6900';
    add({ id: `exp-${e.id}`, date: e.date, type: 'Expense', ref: e.hasReceipt ? 'Receipt' : '', name: e.note || account(acct).name, memo: account(acct).name,
      lines: [{ acct, debit: e.amount }, { acct: '1000', credit: e.amount }] });
  }

  // Payroll: wages are an expense the days they're worked (owed until payday), and leave
  // cash when the week is marked paid. Same hours, rates and overtime as the payroll tab.
  const firstDay = [...shifts.map(s => s.date), ...jobs.filter(j => j.completedAt).map(j => dayOf(j.completedAt))].filter(Boolean).sort()[0];
  if (firstDay && employees.length) {
    const monday = d => addDays(d, -((new Date(`${d}T12:00:00`).getDay() + 6) % 7));
    for (let wk = monday(firstDay); wk <= through; wk = addDays(wk, 7)) {
      const rows = buildPayroll({ employees, week: weekDates(wk), jobs, shifts, delays, settings: payrollSettings }).filter(r => r.gross > 0);
      if (!rows.length) continue;
      // earned, per crew per day
      const byDay = new Map();
      for (const row of rows) for (const d of row.days) {
        if (!d.hours || d.date > through) continue;
        byDay.set(d.date, (byDay.get(d.date) || 0) + row.gross * (d.hours / row.total));
      }
      for (const [date, amt] of byDay) {
        add({ id: `wage-${date}`, date, type: 'Payroll', ref: `Week of ${wk}`, name: 'Crew', memo: 'Wages earned',
          lines: [{ acct: '5000', debit: amt }, { acct: '2100', credit: amt }] });
      }
      // paid (by person, on the day the week was marked paid)
      for (const row of rows) {
        if (!row.paidAt) continue;
        const date = dayOf(row.paidAt);
        if (date > through) continue;
        add({ id: `pay-${row.employee.id}-${wk}`, date, type: 'Paycheck', ref: row.checkNo ? `Check #${row.checkNo}` : `Week of ${wk}`, name: row.employee.name, memo: `Pay for week of ${wk}`,
          lines: [{ acct: '2100', debit: row.gross }, { acct: '1000', credit: row.gross }] });
      }
    }
  }

  // Fixed monthly costs (insurance, truck payment…): once a month on the 1st.
  if (fixedCosts.length && firstDay) {
    for (let m = firstDay.slice(0, 7); monthStart(m) <= through; m = nextMonth(m)) {
      for (const c of fixedCosts) {
        const acct = fixedCostAccount(c.label);
        add({ id: `fixed-${m}-${c.label}`, date: monthStart(m), type: 'Bill', ref: 'Monthly', name: c.label, memo: `${c.label} (monthly amount from your fixed costs)`,
          lines: [{ acct, debit: c.monthly }, { acct: '1000', credit: c.monthly }] });
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));
}

/** Debit/credit totals per account over entries. */
function totals(entries) {
  const t = {};
  for (const e of entries) for (const l of e.lines) {
    const x = (t[l.acct] ||= { debit: 0, credit: 0 });
    x.debit += l.debit; x.credit += l.credit;
  }
  return t;
}
/** Signed balance in the account's normal direction. */
const bal = (t, no) => { const x = t[no] || { debit: 0, credit: 0 }; return r2(debitNormal(no) ? x.debit - x.credit : x.credit - x.debit); };

/** Profit & loss over [from, to]. basis 'accrual' (from the ledger) or 'cash'. */
export function profitLoss(entries, from, to, basis = 'accrual') {
  const inRange = entries.filter(e => e.date >= from && e.date <= to);
  let t;
  if (basis === 'cash') {
    // Cash basis: income when the money arrives (by the visit's income account), wages when paid.
    const invById = new Map(entries.filter(e => e.type === 'Invoice').map(e => [e.id, e]));
    const cashEntries = [];
    for (const e of inRange) {
      if (e.type === 'Invoice' || e.type === 'Payroll') continue;
      if (e.type === 'Payment') {
        const inv = invById.get(e.id.replace('rcpt-', 'inv-'));
        const inc = inv?.lines.find(l => isPL(l.acct))?.acct || '4000';
        cashEntries.push({ lines: [{ acct: inc, debit: 0, credit: e.lines[0].debit }] });
      } else if (e.type === 'Paycheck') {
        cashEntries.push({ lines: [{ acct: '5000', debit: e.lines[0].debit, credit: 0 }] });
      } else cashEntries.push(e);
    }
    t = totals(cashEntries);
  } else t = totals(inRange);
  const group = type => ACCOUNTS.filter(a => a.type === type).map(a => ({ ...a, amount: bal(t, a.no) })).filter(a => a.amount !== 0);
  const income = group('income');
  const cogs = group('cogs');
  const expenses = group('expense');
  const sum = list => r2(list.reduce((s, a) => s + a.amount, 0));
  const totalIncome = sum(income);
  const totalCogs = sum(cogs);
  const gross = r2(totalIncome - totalCogs);
  const totalExpenses = sum(expenses);
  return { income, cogs, expenses, totalIncome, totalCogs, gross, totalExpenses, net: r2(gross - totalExpenses) };
}

/** Trial balance + balance sheet as of `asOf`; income/expense accounts reset each Jan 1. */
export function balances(entries, asOf) {
  const yearStart = `${asOf.slice(0, 4)}-01-01`;
  const upTo = entries.filter(e => e.date <= asOf);
  const priorPL = profitLoss(upTo.filter(e => e.date < yearStart), '0000-00-00', asOf);
  const t = totals(upTo.map(e => (e.date < yearStart ? { ...e, lines: e.lines.filter(l => !isPL(l.acct)) } : e)));
  // Prior years' profit sits in retained earnings.
  if (priorPL.net) {
    const x = (t['3900'] ||= { debit: 0, credit: 0 });
    if (priorPL.net > 0) x.credit += priorPL.net; else x.debit += -priorPL.net;
  }
  const rows = ACCOUNTS.map(a => {
    const x = t[a.no] || { debit: 0, credit: 0 };
    const net = r2(x.debit - x.credit);
    return { ...a, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0 };
  }).filter(a => a.debit || a.credit);
  const totalDebit = r2(rows.reduce((s, a) => s + a.debit, 0));
  const totalCredit = r2(rows.reduce((s, a) => s + a.credit, 0));
  const ytd = profitLoss(upTo, yearStart, asOf);
  const sheet = {
    cash: bal(t, '1000'), receivable: bal(t, '1200'), wagesPayable: bal(t, '2100'),
    retained: bal(t, '3900'), currentProfit: ytd.net,
  };
  sheet.assets = r2(sheet.cash + sheet.receivable);
  sheet.liabilities = r2(sheet.wagesPayable);
  sheet.equity = r2(sheet.retained + sheet.currentProfit);
  return { trial: rows, totalDebit, totalCredit, sheet };
}

/** General ledger for one month: each account's opening balance, entries, closing balance. */
export function generalLedger(entries, from, to) {
  const before = totals(entries.filter(e => e.date < from));
  const yearBefore = totals(entries.filter(e => e.date < from && e.date >= `${from.slice(0, 4)}-01-01`));
  return ACCOUNTS.map(a => {
    // Income and expense accounts start each year at zero.
    const opening = isPL(a.no) ? bal(yearBefore, a.no) : bal(before, a.no);
    let running = opening;
    const lines = [];
    for (const e of entries) {
      if (e.date < from || e.date > to) continue;
      for (const l of e.lines) {
        if (l.acct !== a.no) continue;
        running = r2(running + (debitNormal(a.no) ? l.debit - l.credit : l.credit - l.debit));
        lines.push({ date: e.date, type: e.type, ref: e.ref, name: e.name, memo: e.memo, debit: l.debit, credit: l.credit, balance: running });
      }
    }
    return { ...a, opening, lines, closing: running };
  }).filter(a => a.lines.length || a.opening);
}

/** Accounts receivable aging as of a date: open invoices by days since the visit. */
export function receivableAging(jobs, asOf) {
  const open = jobs.filter(j => j.status === 'completed' && j.earnings > 0 && j.completedAt && dayOf(j.completedAt) <= asOf
    && !(j.paid && j.paidAt && dayOf(j.paidAt) <= asOf));
  const days = d => Math.round((new Date(`${asOf}T12:00:00`) - new Date(`${d}T12:00:00`)) / 86400000);
  const bucket = n => (n <= 30 ? 'current' : n <= 60 ? 'd31' : n <= 90 ? 'd61' : 'd90');
  const byCustomer = new Map();
  for (const j of open) {
    const d = dayOf(j.completedAt);
    const key = j.clientName || j.address;
    const c = byCustomer.get(key) || { name: j.clientName, address: String(j.address || '').split(',')[0], current: 0, d31: 0, d61: 0, d90: 0, total: 0, invoices: 0 };
    c[bucket(days(d))] += j.earnings; c.total += j.earnings; c.invoices += 1;
    byCustomer.set(key, c);
  }
  const rows = [...byCustomer.values()].map(c => ({ ...c, current: r2(c.current), d31: r2(c.d31), d61: r2(c.d61), d90: r2(c.d90), total: r2(c.total) })).sort((a, b) => b.total - a.total);
  const sum = k => r2(rows.reduce((s, r) => s + r[k], 0));
  return { rows, totals: { current: sum('current'), d31: sum('d31'), d61: sum('d61'), d90: sum('d90'), total: sum('total') } };
}

/** Payroll register for weeks that end in [from, to]: one row per person per week. */
export function payrollRegister({ employees, jobs, shifts, delays, payrollSettings, from, to }) {
  const rows = [];
  const monday = d => addDays(d, -((new Date(`${d}T12:00:00`).getDay() + 6) % 7));
  for (let wk = monday(addDays(from, -6)); addDays(wk, 6) <= to; wk = addDays(wk, 7)) {
    const end = addDays(wk, 6);
    if (end < from) continue;
    for (const r of buildPayroll({ employees, week: weekDates(wk), jobs, shifts, delays, settings: payrollSettings })) {
      if (!r.gross) continue;
      rows.push({ weekStart: wk, weekEnd: end, name: r.employee.name, role: r.employee.role, rate: r.employee.rate, hours: r.total, regular: r.regular, overtime: r.overtime, gross: r.gross, paidAt: r.paidAt ? dayOf(r.paidAt) : null, checkNo: r.checkNo });
    }
  }
  return rows;
}

// ---- Spreadsheets ----
const csvCell = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const toCsv = (header, rows) => [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');

/** Journal entries in the column layout QuickBooks Online / Xero import (one line per account). */
export function journalCsv(entries, from, to) {
  const rows = [];
  let n = 0;
  for (const e of entries) {
    if (e.date < from || e.date > to) continue;
    n += 1;
    for (const l of e.lines) {
      rows.push([`JL-${from.slice(0, 7).replace('-', '')}-${String(n).padStart(4, '0')}`, e.date, `${l.acct} ${account(l.acct).name}`, l.debit ? l.debit.toFixed(2) : '', l.credit ? l.credit.toFixed(2) : '', `${e.type} · ${e.memo}`, e.name]);
    }
  }
  return toCsv(['Journal No', 'Journal Date', 'Account', 'Debits', 'Credits', 'Description', 'Name'], rows);
}
