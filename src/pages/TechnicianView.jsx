import { useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { useJobs } from '../hooks/useJobs.js';
import { useTechnicians } from '../hooks/useTechnicians.js';
import JobCard from '../components/JobCard.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { JOB_STATUS } from '../lib/constants.js';

const TRANSITIONS = {
  assigned:    { label: 'Start Driving',  next: 'en_route',    color: '#9c55f7' },
  en_route:    { label: 'Begin Job',      next: 'in_progress', color: '#e67e22' },
  in_progress: { label: '✅ Mark Complete', next: 'completed', color: '#3fb950' },
};

export default function TechnicianView() {
  const { activeTechId, user, setActiveTechId, demoMode } = useApp();
  const { jobs, updateJobStatus } = useJobs();
  const { technicians } = useTechnicians();
  const [expandedId, setExpandedId] = useState(null);
  const [loadingId, setLoadingId]   = useState(null);
  const today = new Date().toISOString().split('T')[0];
  const demoSelectableTechs = technicians.filter(t => t.status !== 'pending_approval');
  const selectedTech = demoSelectableTechs.find(t => t.id === activeTechId);

  const myJobs = jobs.filter(j => j.assignedTo === activeTechId && j.status !== 'completed');
  const completedJobs = jobs.filter(j => j.assignedTo === activeTechId && j.status === 'completed');
  const completedToday = completedJobs.filter(j => (j.completedAt || j.createdAt || '').startsWith(today));
  const totalEarnings = completedToday.reduce((sum, j) => sum + (j.earnings || 0), 0);

  const handleTransition = async (job) => {
    const t = TRANSITIONS[job.status];
    if (!t) return;
    setLoadingId(job.id);
    await updateJobStatus(job.id, t.next);
    setLoadingId(null);
  };

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto', padding: '32px 24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 700, marginBottom: '6px' }}>My Jobs</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
          Welcome back, <strong style={{ color: 'var(--text-primary)' }}>{selectedTech?.name || user?.displayName}</strong>
        </p>
        {demoMode && demoSelectableTechs.length > 0 && (
          <div style={{ marginTop: '12px', maxWidth: '320px' }}>
            <label className="form-label" style={{ display: 'block', marginBottom: '6px' }}>Switch Technician (Demo)</label>
            <select className="form-input" value={activeTechId || ''} onChange={e => setActiveTechId(e.target.value)}>
              {demoSelectableTechs.map(tech => (
                <option key={tech.id} value={tech.id}>{tech.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Stats strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '32px' }}>
        {[
          { label: 'Active Jobs',    value: myJobs.length,                            color: '#1f6feb' },
          { label: 'Completed Today', value: completedToday.length,                   color: '#3fb950' },
          { label: 'Today\'s Earnings', value: `$${totalEarnings.toFixed(2)}`,        color: '#0fd3c3' },
        ].map(s => (
          <div key={s.label} className="card" style={{ textAlign: 'center', padding: '18px' }}>
            <div style={{ fontSize: '22px', fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Active jobs */}
      {myJobs.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>🎉</div>
          <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px' }}>All clear!</div>
          <div style={{ fontSize: '14px' }}>No active jobs assigned to you.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '32px' }}>
          {myJobs.map(job => {
            const transition = TRANSITIONS[job.status];
            const isLoading = loadingId === job.id;
            const isExpanded = expandedId === job.id;
            const statusInfo = JOB_STATUS[job.status] || { label: job.status, color: '#8b949e' };

            return (
              <JobCard
                key={job.id}
                job={job}
                expanded={isExpanded}
                onClick={() => setExpandedId(isExpanded ? null : job.id)}
                actions={transition ? (
                  <button
                    className="btn-primary"
                    onClick={e => { e.stopPropagation(); handleTransition(job); }}
                    disabled={isLoading}
                    style={{ background: transition.color, borderColor: transition.color, padding: '8px 20px', fontSize: '13px' }}
                  >
                    {isLoading ? 'Updating…' : transition.label}
                  </button>
                ) : null}
              />
            );
          })}
        </div>
      )}

      {/* Completed jobs */}
      {completedJobs.length > 0 && (
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '14px', color: 'var(--text-muted)' }}>
            Completed
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {completedJobs.map(job => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
