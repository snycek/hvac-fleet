export const JOB_STATUS = {
  quote:       { label: 'New Quote',   color: '#f0b429' },
  pending:     { label: 'Pending',     color: '#d29922' },
  assigned:    { label: 'Assigned',    color: '#1f6feb' },
  en_route:    { label: 'En Route',    color: '#9c55f7' },
  in_progress: { label: 'In Progress', color: '#e67e22' },
  completed:   { label: 'Cut',         color: '#3fb950' },
  skipped:     { label: 'Skipped',     color: '#8b949e' },
  declined:    { label: 'Declined',    color: '#8b949e' },
};

// Status for a driver: plow trucks say "Plowing" where mowers say "Cutting".
export const statusOf = tech => (tech?.kind === 'plow' && tech.status === 'busy' ? { ...TECH_STATUS.busy, label: 'Plowing' } : TECH_STATUS[tech?.status]);

export const TECH_STATUS = {
  available:        { label: 'Available',        color: '#3fb950' },
  busy:             { label: 'Cutting',          color: '#e67e22' },
  en_route:         { label: 'En Route',         color: '#9c55f7' },
  offline:          { label: 'Offline',          color: '#8b949e' },
  rain_delay:       { label: 'Rain Delay',       color: '#58a6ff' },
  pending_approval: { label: 'Pending Approval', color: '#d29922' },
};
