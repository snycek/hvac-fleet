import { useEffect, useMemo, useState } from 'react';
import { useJobs } from '../hooks/useJobs.js';
import { useTechnicians } from '../hooks/useTechnicians.js';
import StatusBadge from '../components/StatusBadge.jsx';
import { JOB_STATUS, TECH_STATUS } from '../lib/constants.js';
import FleetMap from '../components/FleetMap.jsx';
import OwnerTodo from '../components/OwnerTodo.jsx';
import ProfitLoss from '../components/ProfitLoss.jsx';
import LawnsPanel from '../components/LawnsPanel.jsx';
import { useExpenses } from '../hooks/useExpenses.js';
import { money, profitAndLoss } from '../lib/lawns.js';
import { todayString } from '../lib/dates.js';
import { relativeDay, repeatLabel } from '../lib/dates.js';

function EarningsCard({ tech, jobs }) {
  const today = new Date().toISOString().split('T')[0];
  const techJobs = jobs.filter(j => j.assignedTo === tech.id);
  const completed = techJobs.filter(j => j.status === 'completed');
  const completedToday = completed.filter(j => (j.completedAt || j.createdAt || '').startsWith(today));
  const earnings  = completed.reduce((sum, j) => sum + (j.earnings || 0), 0);
  const earningsToday = completedToday.reduce((sum, j) => sum + (j.earnings || 0), 0);
  const st = TECH_STATUS[tech.status] || { label: tech.status, color: '#8b949e' };
  const initials = tech.name.split(' ').map(n => n[0]).join('');

  return (
    <div className="card" style={{ minWidth: '220px', padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <div style={{
          width: '44px', height: '44px', borderRadius: '50%',
          background: st.color + '22', border: `2px solid ${st.color}55`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: '16px', color: st.color, flexShrink: 0,
        }}>
          {initials}
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: '14px' }}>{tech.name}</div>
          <StatusBadge label={st.label} color={st.color} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        {[
          { label: 'Today Earned', value: `$${earningsToday.toFixed(0)}`, color: '#3fb950' },
          { label: 'Cuts Today',   value: completedToday.length,           color: '#1f6feb' },
          { label: 'Scheduled', value: techJobs.filter(j => j.status !== 'completed' && j.assignedTo === tech.id).length, color: '#e67e22' },
          { label: 'Total Earned', value: `$${earnings.toFixed(0)}`,      color: '#0fd3c3' },
        ].map(stat => (
          <div key={stat.label} style={{
            background: 'var(--bg-primary)',
            borderRadius: '8px',
            padding: '10px 12px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '18px', fontWeight: 700, color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function OwnerView() {
  const { jobs: allJobs, scheduleJob, declineJob, markPaid } = useJobs();
  const { expenses, addExpense, logExpense, rejectExpense } = useExpenses();
  // Quotes live in To-Do until accepted; declined ones are hidden.
  const jobs = useMemo(() => allJobs.filter(j => !['quote', 'declined'].includes(j.status)), [allJobs]);
  const { technicians }  = useTechnicians();
  const [selectedTechId, setSelectedTechId] = useState(null);

  const thisMonth       = profitAndLoss(jobs, expenses, todayString().slice(0, 7));
  const owedTotal       = jobs.filter(j => j.status === 'completed' && !j.paid).reduce((s, j) => s + (j.earnings || 0), 0);
  const completedJobs   = jobs.filter(j => j.status === 'completed').length;
  const activeTechs     = technicians.filter(t => ['available', 'busy', 'en_route'].includes(t.status)).length;
  const fleetTechs      = technicians.filter(t => t.status !== 'pending_approval');

  useEffect(() => {
    if (!selectedTechId) return;
    const stillExists = fleetTechs.some(t => t.id === selectedTechId);
    if (!stillExists) {
      setSelectedTechId(null);
    }
  }, [fleetTechs, selectedTechId]);

  return (
    <div style={{ maxWidth: '1300px', margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 700, marginBottom: '6px' }}>Owner Dashboard</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>New quotes, live crew map, and earnings</p>
      </div>

      <OwnerTodo
        jobs={allJobs} technicians={technicians} expenses={expenses}
        scheduleJob={scheduleJob} declineJob={declineJob} markPaid={markPaid}
        logExpense={logExpense} rejectExpense={rejectExpense}
      />

      {/* KPI Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '28px' }}>
        {[
          { label: 'Net This Month',   value: money(thisMonth.net),                                                      color: thisMonth.net >= 0 ? '#3fb950' : '#ff7b72' },
          { label: 'Owed',             value: money(owedTotal),                                                          color: '#f0b429' },
          { label: 'Cuts Done',        value: completedJobs,                                                             color: '#0fd3c3' },
          { label: 'Foremen On Duty',    value: `${activeTechs} / ${technicians.length}`,                                  color: '#e67e22' },
        ].map(s => (
          <div key={s.label} className="card" style={{ textAlign: 'center', padding: '20px' }}>
            <div style={{ fontSize: '26px', fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Fleet Map */}
      <div className="card" style={{ padding: '0', overflow: 'hidden', marginBottom: '28px' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <span style={{ fontWeight: 700, fontSize: '16px' }}>🗺️ Live Crew Map</span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '10px' }}>Downriver Michigan</span>
          </div>
          <div style={{ display: 'flex', gap: '14px', fontSize: '12px', color: 'var(--text-muted)' }}>
            {[['#3fb950', 'Available'], ['#e67e22', 'On Job'], ['#9c55f7', 'En Route'], ['#8b949e', 'Offline']].map(([color, label]) => (
              <span key={label} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: color, display: 'inline-block' }} />
                {label}
              </span>
            ))}
          </div>
        </div>
        <div className="crew-map-grid">
          <aside style={{ borderRight: '1px solid var(--border)', background: 'var(--bg-elevated)', padding: '14px', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Crew List</div>
              {selectedTechId && (
                <button className="btn-ghost" onClick={() => setSelectedTechId(null)} style={{ fontSize: '11px', padding: '4px 10px' }}>
                  Clear
                </button>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {fleetTechs.map(tech => {
                const st = TECH_STATUS[tech.status] || { label: tech.status, color: '#8b949e' };
                const isSelected = selectedTechId === tech.id;
                const activeJob = jobs.find(j => j.assignedTo === tech.id && ['assigned', 'en_route', 'in_progress'].includes(j.status));

                return (
                  <button
                    key={tech.id}
                    type="button"
                    onClick={() => setSelectedTechId(tech.id)}
                    style={{
                      width: '100%', textAlign: 'left',
                      border: `1px solid ${isSelected ? st.color : 'var(--border)'}`,
                      background: isSelected ? `${st.color}22` : 'var(--bg-primary)',
                      borderRadius: '10px', padding: '10px 12px', cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{tech.name}</div>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: st.color, display: 'inline-block' }} />
                    </div>
                    <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--text-muted)' }}>
                      {tech.truckName || 'Truck not set'}
                    </div>
                    <div style={{ marginTop: '2px', fontSize: '11px', color: st.color, fontWeight: 600 }}>
                      {st.label}
                    </div>
                    {activeJob && (
                      <div style={{ marginTop: '5px', fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {activeJob.service}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </aside>

          <div style={{ minHeight: '440px' }}>
            <FleetMap technicians={technicians} jobs={jobs} selectedTechId={selectedTechId} />
          </div>
        </div>
      </div>

      <ProfitLoss jobs={jobs} expenses={expenses} technicians={technicians} addExpense={addExpense} />

      <LawnsPanel jobs={jobs} markPaid={markPaid} />

      {/* Foreman Report Cards */}
      <div>
        <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '18px' }}>Foreman Report Cards</h2>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          {technicians.map(tech => (
            <EarningsCard key={tech.id} tech={tech} jobs={jobs} />
          ))}
        </div>
      </div>

      {/* Recent Jobs Table */}
      <div style={{ marginTop: '36px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '18px' }}>Recent & Upcoming Cuts</h2>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
                {['Cut Day', 'Service', 'Customer', 'Foreman', 'Status', 'Price'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jobs.slice(0, 10).map((job, i) => {
                const tech = technicians.find(t => t.id === job.assignedTo);
                return (
                  <tr key={job.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-elevated)44' }}>
                    <td style={{ padding: '12px 16px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {job.status === 'completed' ? (job.completedAt || '').slice(0, 10) : relativeDay(job.scheduledDate)}
                      {job.repeatDays > 0 && <div style={{ fontSize: '11px' }}>{repeatLabel(job.repeatDays)}</div>}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-primary)' }}>{job.service}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{job.clientName}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{tech?.name || '—'}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <StatusBadge label={JOB_STATUS[job.status]?.label || job.status.replace('_', ' ')} color={JOB_STATUS[job.status]?.color || '#8b949e'} />
                    </td>
                    <td style={{ padding: '12px 16px', color: '#3fb950', fontWeight: 600 }}>
                      ${job.earnings?.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
