// Three kinds of trucks, each with its own crew and its own kind of job:
//   lawn      — mowing routes (foreman + cutters)
//   plow      — snow routes (driver + shovelers)
//   landscape — one-off projects (foreman + General Labor)
// Shared by the server, the owner hub, the foreman app and the demo.

export const CREW_KINDS = {
  lawn: { id: 'lawn', icon: '🚜', truck: 'Truck', lead: 'Foreman', helperRole: 'cutter', helper: 'cutter', helpers: 'cutters', working: 'Cutting', done: 'Cut', doneVerb: 'cut', unit: 'lawn', units: 'lawns' },
  plow: { id: 'plow', icon: '❄️', truck: 'Plow', lead: 'Driver', helperRole: 'shoveler', helper: 'shoveler', helpers: 'shovelers', working: 'Plowing', done: 'Plowed', doneVerb: 'plowed', unit: 'lot', units: 'lots' },
  landscape: { id: 'landscape', icon: '🌳', truck: 'Landscape', lead: 'Foreman', helperRole: 'laborer', helper: 'General Labor', helpers: 'General Labor', working: 'Working', done: 'Done', doneVerb: 'finished', unit: 'job', units: 'jobs' },
};

export const crewKind = tech => (tech?.kind === 'plow' || tech?.kind === 'landscape' ? tech.kind : 'lawn');
export const crewInfo = tech => CREW_KINDS[crewKind(tech)];

/** Payroll role label: foreman / driver, cutter, shoveler, General Labor. */
export const ROLE_LABELS = { foreman: 'Foreman', cutter: 'Cutter', shoveler: 'Shoveler', laborer: 'General Labor' };
export const EMPLOYEE_ROLES = Object.keys(ROLE_LABELS);

export const LANDSCAPING = 'Landscaping';
const servicesOf = job => (job?.requested?.length
  ? job.requested
  : String(job?.service || '').replace(/^Quote:\s*/i, '').split(',').map(s => s.trim()).filter(Boolean));
/** A landscaping request or project ("Landscaping" / "Landscaping Quote"). */
export const wantsLandscaping = job => servicesOf(job).some(s => /^landscaping/i.test(s));
export const isLandscapingJob = job => /^landscaping/i.test(String(job?.service || '').replace(/^Quote:\s*/i, '')) && !servicesOf(job).some(s => !/^landscaping/i.test(s));
export const isSnowJob = job => job?.service === 'Snow Removal' || job?.perSnowfall === true || servicesOf(job).includes('Snow Removal');

/** Which kind of truck does this job: plow, landscape or lawn. */
export const jobKind = job => (isLandscapingJob(job) ? 'landscape' : isSnowJob(job) ? 'plow' : 'lawn');
/** The trucks that can take this job. */
export const crewsForJob = (job, techs) => techs.filter(t => crewKind(t) === jobKind(job));
export const lawnCrews = techs => techs.filter(t => crewKind(t) === 'lawn');
