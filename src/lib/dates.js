// Cut dates are plain 'YYYY-MM-DD' strings in local time.

export function todayString(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(dateString, days) {
  const d = new Date(`${dateString}T12:00:00`);
  d.setDate(d.getDate() + days);
  return todayString(d);
}

// 'Tue, Oct 28' (adds the year only when it isn't this year)
export function formatDay(dateString) {
  if (!dateString) return '';
  const d = new Date(`${dateString}T12:00:00`);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

export const REPEAT_OPTIONS = [
  { days: 7, label: 'Weekly' },
  { days: 14, label: 'Every 2 weeks' },
  { days: 0, label: 'One-time' },
];

export function repeatLabel(days) {
  return REPEAT_OPTIONS.find(o => o.days === Number(days || 0))?.label || 'One-time';
}

// 'Today', 'Tomorrow', 'Overdue', or the formatted day
// today can be overridden (the owner demo runs on its own calendar).
export function relativeDay(dateString, today = todayString()) {
  if (!dateString) return 'Today';
  if (dateString === today) return 'Today';
  if (dateString === addDays(today, 1)) return 'Tomorrow';
  if (dateString < today) return `Overdue · ${formatDay(dateString)}`;
  return formatDay(dateString);
}
