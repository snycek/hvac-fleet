// Payroll math. Cutters ride with their foreman, so a crew's hours for a day are that
// truck's day: start (rolled out) → end (back at shop, or last cut if still out).
import { addDays, todayString } from './dates.js';
import { dayOf, dayShift, jobDay, periodRange, rainMinutes } from './lawns.js';

export const OVERTIME_AFTER = 40;   // weekly hours before overtime
export const OVERTIME_RATE = 1.5;

export const quarter = h => Math.round(h * 4) / 4;
export const fmtHours = h => (h ? (Number.isInteger(h) ? `${h}` : h.toFixed(2).replace(/0$/, '')) : '—');

/** Monday–Sunday dates for the week containing `anchor`. */
export function weekDates(anchor) {
  const { from } = periodRange('week', anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(from, i));
}

/** Hours a crew (its foreman's truck) worked on a date, from the truck's day. */
export function crewHours(foremanTechId, date, { jobs, shifts, delays, payRain }) {
  const shift = dayShift(foremanTechId, date, jobs, shifts);
  if (!shift.start) return 0;
  let end = shift.end;
  if (!end) {
    // Still out: count up to their latest finished cut that day.
    end = jobs
      .filter(j => j.assignedTo === foremanTechId && j.status === 'completed' && dayOf(j.completedAt) === date)
      .map(j => j.completedAt).sort().pop();
  }
  if (!end) return 0;
  let minutes = (new Date(end) - new Date(shift.start)) / 60000;
  if (!payRain) minutes -= rainMinutes(delays, foremanTechId, date, date);
  return Math.max(0, quarter(minutes / 60));
}

/**
 * One row per employee for the week: daily hours (owner edits win), regular/overtime,
 * gross pay, and whether the week is marked paid.
 */
export function buildPayroll({ employees, week, jobs, shifts, delays, settings }) {
  const { hours: edits = {}, paid = {}, payRain = false } = settings || {};
  const weekStart = week[0];
  const crewCache = {};
  const crewDay = (crewId, date) => {
    const key = `${crewId}@${date}`;
    if (!(key in crewCache)) crewCache[key] = crewHours(crewId, date, { jobs, shifts, delays, payRain });
    return crewCache[key];
  };

  return employees.filter(e => e.active !== false).map(e => {
    const days = week.map(date => {
      const key = `${e.id}@${date}`;
      const auto = crewDay(e.crewId, date);
      const entered = key in edits;
      // Amber only when the entered hours differ from the truck's day.
      return { date, auto, hours: entered ? edits[key] : auto, edited: entered && edits[key] !== auto };
    });
    const total = quarter(days.reduce((s, d) => s + d.hours, 0));
    const regular = Math.min(total, OVERTIME_AFTER);
    const overtime = quarter(Math.max(0, total - OVERTIME_AFTER));
    const gross = Math.round((regular * e.rate + overtime * e.rate * OVERTIME_RATE) * 100) / 100;
    const paidAt = paid[`${e.id}@${weekStart}`] || null;
    return { employee: e, days, total, regular, overtime, gross, paidAt };
  });
}

/** What the crews billed (cuts finished) that week, for labor-cost %. */
export function billedInWeek(jobs, week) {
  return jobs
    .filter(j => j.status === 'completed' && week.includes(jobDay(j, todayString())))
    .reduce((s, j) => s + (j.earnings || 0), 0);
}

/**
 * Crew labor as P/L expenses: one entry per crew per day it worked, dated that day
 * (the cost is earned when the work is done, not on payday). Uses the same hours,
 * rates and overtime as the payroll tab; a person's weekly pay is spread over their
 * days by hours, so overtime lands on the days that week they worked.
 */
export function laborExpenses({ employees, jobs, shifts, delays, settings, today = todayString(), weeksBack = 26 }) {
  if (!employees?.length) return [];
  // Weeks from the first day anyone worked (capped) through this week.
  const days = [...shifts.map(s => s.date), ...jobs.filter(j => j.completedAt).map(j => dayOf(j.completedAt))].filter(Boolean).sort();
  if (!days.length) return [];
  const lastWeek = periodRange('week', today).from;
  let week = periodRange('week', days[0] < addDays(lastWeek, -7 * weeksBack) ? addDays(lastWeek, -7 * weeksBack) : days[0]).from;
  const byCrewDay = new Map();
  for (; week <= lastWeek; week = addDays(week, 7)) {
    const dates = weekDates(week);
    for (const row of buildPayroll({ employees, week: dates, jobs, shifts, delays, settings })) {
      if (!row.total || !row.gross) continue;
      for (const d of row.days) {
        if (!d.hours || d.date > today) continue;
        const key = `${row.employee.crewId}@${d.date}`;
        const cur = byCrewDay.get(key) || { crewId: row.employee.crewId, date: d.date, amount: 0, hours: 0, people: 0 };
        cur.amount += row.gross * (d.hours / row.total);
        cur.hours += d.hours;
        cur.people += 1;
        byCrewDay.set(key, cur);
      }
    }
  }
  return [...byCrewDay.values()].map(c => ({
    id: `labor-${c.crewId}-${c.date}`,
    category: 'labor',
    techId: c.crewId,
    date: c.date,
    amount: Math.round(c.amount * 100) / 100,
    note: `${c.people} × ${fmtHours(quarter(c.hours / c.people))}h`, // people × hours each
    status: 'logged',
    derived: true,
  }));
}

/**
 * One person's pay, week by week (newest first), back up to `weeksBack` weeks — the same
 * hours, rate and overtime as the weekly timesheet. Weeks with no hours are skipped.
 */
export function payHistory(employee, { jobs, shifts, delays, settings }, today = todayString(), weeksBack = 26) {
  const out = [];
  let monday = periodRange('week', today).from;
  for (let i = 0; i < weeksBack; i++, monday = addDays(monday, -7)) {
    const week = weekDates(monday);
    const [row] = buildPayroll({ employees: [employee], week, jobs, shifts, delays, settings });
    if (!row || (!row.total && !row.paidAt)) continue;
    out.push({ weekStart: week[0], weekEnd: week[6], ...row });
  }
  return out;
}
