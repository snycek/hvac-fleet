// Questions for the crew: the owner asks ("Does a 36-inch mower fit through the gate?"),
// the foreman answers on site. For a quote, the questions ride on a free "Site check" stop
// on a foreman's route; for a customer, on their next regular visit.
// job.checks: [{ id, q, answer: 'yes' | 'no' | 'unsure' | null, note, by, at }]

export const SITE_CHECK = 'Site check';
export const isSiteCheck = job => job?.service === SITE_CHECK;

export const CHECK_SUGGESTIONS = [
  'Does a 36-inch mower fit through the gate?',
  'Does the lawn match the outline on the quote?',
  'Any dog, locked gate or other access issue?',
  'Is the back yard mostly grass, or trees and beds?',
  'Any steep hills, ditches or soft spots?',
];

export const ANSWERS = [
  { id: 'yes', label: 'Yes' },
  { id: 'no', label: 'No' },
  { id: 'unsure', label: 'Not sure' },
];
export const answerLabel = id => ANSWERS.find(a => a.id === id)?.label || '—';

export const cleanQuestions = qs => (Array.isArray(qs) ? qs : [])
  .map(q => String(q || '').trim().slice(0, 140))
  .filter(Boolean)
  .slice(0, 6);

export const newChecks = (qs, stamp = Date.now()) => cleanQuestions(qs)
  .map((q, i) => ({ id: `q${stamp.toString(36)}${i}`, q, answer: null, note: '' }));

/** Merge the foreman's answers ([{ id, answer, note }]) into a job's checks. */
export function applyAnswers(checks, answers, by, at) {
  const byId = new Map((Array.isArray(answers) ? answers : []).map(a => [a?.id, a]));
  return (checks || []).map(c => {
    const a = byId.get(c.id);
    if (!a || !ANSWERS.some(x => x.id === a.answer)) return c;
    return { ...c, answer: a.answer, note: String(a.note || '').trim().slice(0, 200), by: by || 'Crew', at };
  });
}

export const answeredCount = checks => (checks || []).filter(c => c.answer).length;

/** Every question asked at this address (newest visit first), with the visit it rode on. */
export const checksAt = (jobs, key, lawnKey) => jobs
  .filter(j => j.checks?.length && lawnKey(j) === key)
  .sort((a, b) => String(b.scheduledDate || '').localeCompare(String(a.scheduledDate || '')))
  .flatMap(j => j.checks.map(c => ({ ...c, jobId: j.id, date: j.scheduledDate, techId: j.assignedTo, siteCheck: isSiteCheck(j) })));
