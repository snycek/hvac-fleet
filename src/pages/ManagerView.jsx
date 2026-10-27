import { useState } from 'react';
import { useJobs } from '../hooks/useJobs.js';
import { useTechnicians } from '../hooks/useTechnicians.js';
import JobCard from '../components/JobCard.jsx';
import FleetMap from '../components/FleetMap.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

function AssignModal({ job, technicians, onAssign, onClose }) {
  const [selectedTechId, setSelectedTechId] = useState('');
  const available = technicians
    .filter(t => t.status === 'available')
    .sort((a, b) => {
      const seasonedDelta = Number(Boolean(b.isSeasoned)) - Number(Boolean(a.isSeasoned));
      if (seasonedDelta !== 0) {
        return seasonedDelta;
      }
      return (b.jobsCompleted || 0) - (a.jobsCompleted || 0);
    });

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#000000bb', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
    }} onClick={onClose}>
      <div className="card" style={{ maxWidth: '460px', width: '100%', padding: '28px' }} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontWeight: 700, fontSize: '18px', marginBottom: '6px' }}>Assign Job</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '20px' }}>
          {job.service} — {job.clientName}
        </p>
        <div style={{
          marginBottom: '18px',
          padding: '10px 12px',
          borderRadius: '8px',
          background: 'var(--bg-primary)',
          border: '1px solid var(--border)',
          color: 'var(--text-muted)',
          fontSize: '13px',
        }}>
          <div>📍 {job.address || 'Address not provided'}</div>
          {job.location?.lat && job.location?.lng && (
            <div style={{ marginTop: '4px', fontSize: '12px' }}>
              GPS: {Number(job.location.lat).toFixed(6)}, {Number(job.location.lng).toFixed(6)}
            </div>
          )}
        </div>

        {available.length === 0 ? (
          <div style={{ color: '#d29922', background: '#d2992222', border: '1px solid #d2992244', borderRadius: '8px', padding: '12px 16px', fontSize: '14px', marginBottom: '20px' }}>
            No foremen are currently available. Everyone is on a job or offline.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
            {available.map(tech => (
              <label key={tech.id} style={{
                display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px',
                background: selectedTechId === tech.id ? 'var(--accent-blue)22' : 'var(--bg-primary)',
                border: `1px solid ${selectedTechId === tech.id ? 'var(--accent-blue)' : 'var(--border)'}`,
                borderRadius: '8px', cursor: 'pointer',
              }}>
                <input type="radio" name="tech" value={tech.id} checked={selectedTechId === tech.id}
                  onChange={() => setSelectedTechId(tech.id)} style={{ accentColor: 'var(--accent-blue)' }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>{tech.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {(tech.truckName || 'Truck not set')} · {tech.jobsCompleted || 0} jobs completed
                  </div>
                </div>
                <StatusBadge label={tech.isSeasoned ? 'Available' : 'Available · Unseasoned'} color={tech.isSeasoned ? '#3fb950' : '#d29922'} />
              </label>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => onAssign(job.id, selectedTechId)} disabled={!selectedTechId}>
            Assign Foreman
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ManagerView() {
  const { jobs, assignJob } = useJobs();
  const { technicians, approveTechnician } = useTechnicians();
  const [assigningJob, setAssigningJob] = useState(null);
  const [approvingId, setApprovingId] = useState(null);

  const pendingJobs  = jobs.filter(j => j.status === 'pending');
  const activeJobs   = jobs.filter(j => ['assigned', 'en_route', 'in_progress'].includes(j.status));
  const pendingApplicants = technicians.filter(t => t.status === 'pending_approval');

  const handleApprove = async (techId) => {
    setApprovingId(techId);
    await approveTechnician(techId);
    setApprovingId(null);
  };

  const handleAssign = async (jobId, techId) => {
    await assignJob(jobId, techId);
    setAssigningJob(null);
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 700, marginBottom: '6px' }}>Manager Console</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
          Track live fleet locations, approve new crew, and assign jobs to foremen.
        </p>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Pending',   value: pendingJobs.length,                                          color: '#d29922' },
          { label: 'Active',    value: activeJobs.length,                                           color: '#1f6feb' },
          { label: 'Available Foremen', value: technicians.filter(t => t.status === 'available').length, color: '#3fb950' },
          { label: 'Awaiting Approval', value: pendingApplicants.length,                             color: '#d29922' },
        ].map(s => (
          <div key={s.label} className="card" style={{ textAlign: 'center', padding: '14px 10px' }}>
            <div style={{ fontSize: '24px', fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Live Fleet Map */}
      <div style={{ marginBottom: '28px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>Live Fleet Map</h2>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: '12px', color: 'var(--text-muted)' }}>
            Click a truck marker to view the foreman's status and current job.
          </div>
          <div style={{ height: '500px' }}>
            <FleetMap technicians={technicians} jobs={jobs} />
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '28px' }}>
        {/* Incoming Queue */}
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>
            Incoming Queue
            {pendingJobs.length > 0 && (
              <span style={{ marginLeft: '10px', background: '#d2992233', color: '#d29922', border: '1px solid #d2992244', borderRadius: '20px', padding: '2px 10px', fontSize: '12px' }}>
                {pendingJobs.length}
              </span>
            )}
          </h2>

          {pendingJobs.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
              Queue is clear
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {pendingJobs.map(job => (
                <JobCard
                  key={job.id}
                  job={job}
                  actions={
                    <button className="btn-primary" onClick={() => setAssigningJob(job)} style={{ padding: '8px 18px', fontSize: '13px' }}>
                      Assign Foreman
                    </button>
                  }
                />
              ))}
            </div>
          )}
        </div>

        {/* Technician Applicants */}
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>
            Crew Applications
            {pendingApplicants.length > 0 && (
              <span style={{ marginLeft: '10px', background: '#d2992233', color: '#d29922', border: '1px solid #d2992244', borderRadius: '20px', padding: '2px 10px', fontSize: '12px' }}>
                {pendingApplicants.length}
              </span>
            )}
          </h2>

          {pendingApplicants.length === 0 ? (
            <div className="card" style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '14px' }}>
              No new crew applications.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {pendingApplicants.map(tech => (
                <div key={tech.id} className="card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{tech.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {tech.email} · {tech.phone}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {tech.city || 'City not provided'} · {tech.truckName || 'Truck not set'} · {tech.yearsExperience || 0} years
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                    <StatusBadge label={tech.isSeasoned ? 'Seasoned' : 'Unseasoned'} color={tech.isSeasoned ? '#3fb950' : '#d29922'} />
                    <button className="btn-primary" onClick={() => handleApprove(tech.id)} disabled={approvingId === tech.id} style={{ padding: '8px 14px', fontSize: '12px' }}>
                      {approvingId === tech.id ? 'Approving...' : 'Approve'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Active jobs summary */}
      {activeJobs.length > 0 && (
        <div style={{ marginTop: '28px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-muted)' }}>Active Jobs</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {activeJobs.map(job => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        </div>
      )}

      {assigningJob && (
        <AssignModal
          job={assigningJob}
          technicians={technicians}
          onAssign={handleAssign}
          onClose={() => setAssigningJob(null)}
        />
      )}
    </div>
  );
}
