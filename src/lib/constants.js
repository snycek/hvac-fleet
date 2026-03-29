export const HVAC_SERVICES = [
  { id: 'ac_repair',     name: 'AC Repair & Diagnostics',              icon: '❄️',  price: 150 },
  { id: 'ac_install',    name: 'AC Installation',                       icon: '🆕',  price: 3500 },
  { id: 'heat_repair',   name: 'Heating System Repair',                 icon: '🔥',  price: 175 },
  { id: 'furnace',       name: 'Furnace Installation',                  icon: '🏭',  price: 4000 },
  { id: 'tune_up',       name: 'HVAC Tune-Up / Preventive Maintenance', icon: '🔧',  price: 89 },
  { id: 'duct_clean',    name: 'Air Duct Cleaning & Sealing',           icon: '💨',  price: 350 },
  { id: 'emergency',     name: 'Emergency HVAC Service',                icon: '🚨',  price: 250 },
];

export const JOB_STATUS = {
  pending:     { label: 'Pending',     color: '#d29922' },
  assigned:    { label: 'Assigned',    color: '#1f6feb' },
  en_route:    { label: 'En Route',    color: '#9c55f7' },
  in_progress: { label: 'In Progress', color: '#e67e22' },
  completed:   { label: 'Completed',   color: '#3fb950' },
};

export const TECH_STATUS = {
  available:        { label: 'Available',        color: '#3fb950' },
  busy:             { label: 'On Job',           color: '#e67e22' },
  en_route:         { label: 'En Route',         color: '#9c55f7' },
  offline:          { label: 'Offline',          color: '#8b949e' },
  pending_approval: { label: 'Pending Approval', color: '#d29922' },
};
