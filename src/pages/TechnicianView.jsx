import { useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { useJobs } from '../hooks/useJobs.js';
import { useTechnicians } from '../hooks/useTechnicians.js';
import JobCard from '../components/JobCard.jsx';
import ExpenseModal from '../components/ExpenseModal.jsx';
import { useExpenses } from '../hooks/useExpenses.js';
import { useShareLocation } from '../hooks/useShareLocation.js';
import { formatDay, todayString } from '../lib/dates.js';

// Foreman flow: head out → start cutting (starts the clock) → mark the yard cut.
const ON_MY_WAY = { label: '🚚 On My Way',     next: 'en_route',    color: '#9c55f7' };
const START     = { label: '✂️ Start Cutting',  next: 'in_progress', color: '#e67e22' };
const MARK_CUT  = { label: '✅ Mark Cut',       next: 'completed',   color: '#3fb950' };
const TRANSITIONS = {
  pending:     [ON_MY_WAY, START],
  assigned:    [ON_MY_WAY, START],
  en_route:    [START],
  in_progress: [MARK_CUT],
};

const GPS_LABEL = {
  live:        { text: '📡 Live on owner map', color: '#3fb950' },
  waiting:     { text: '📡 Finding GPS…',      color: 'var(--text-muted)' },
  denied:      { text: '📡 Location blocked — allow it so the owner can see your truck', color: '#ff7b72' },
  unsupported: { text: '📡 GPS not available on this connection', color: 'var(--text-muted)' },
};

const dayOf = job => job.scheduledDate || todayString();

export default function TechnicianView() {
  const { activeTechId, user, setActiveTechId, demoMode } = useApp();
  const { jobs, updateJobStatus2 } = useJobs();
  const { technicians, updateTechLocation } = useTechnicians();
  const { addExpense } = useExpenses({ poll: false });
  const gps = useShareLocation(activeTechId, updateTechLocation);
  const [addingExpense, setAddingExpense] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [loadingId, setLoadingId]   = useState(null);
  const [toast, setToast] = useState('');
  const today = todayString();
  const demoSelectableTechs = technicians.filter(t => t.status !== 'pending_approval');
  const selectedTech = demoSelectableTechs.find(t => t.id === activeTechId);

  const mine = jobs.filter(j => j.assignedTo === activeTechId);
  const open = mine
    .filter(j => !['completed', 'declined', 'quote'].includes(j.status))
    .sort((a, b) => dayOf(a).localeCompare(dayOf(b)));
  const groups = [
    { key: 'overdue',  title: 'Overdue',  color: '#ff7b72', jobs: open.filter(j => dayOf(j) < today) },
    { key: 'today',    title: 'Today',    color: 'var(--accent-teal)', jobs: open.filter(j => dayOf(j) === today) },
    { key: 'upcoming', title: 'Upcoming', color: 'var(--text-muted)', jobs: open.filter(j => dayOf(j) > today) },
  ];
  const done = mine.filter(j => j.status === 'completed').sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)));
  const doneToday = done.filter(j => j.completedAt && todayString(new Date(j.completedAt)) === today);
  const earnedToday = doneToday.reduce((sum, j) => sum + (j.earnings || 0), 0);

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(''), 5000); };

  const handleTransition = async (job, t) => {
    if (!t) return;
    setLoadingId(job.id);
    const result = await updateJobStatus2(job.id, t.next);
    setLoadingId(null);
    if (t.next === 'completed') {
      flash(result?.nextJob
        ? `${job.clientName} marked cut. Next cut scheduled for ${formatDay(result.nextJob.scheduledDate)}.`
        : `${job.clientName} marked cut.`);
    }
  };

  const handleExpense = async (exp) => {
    await addExpense({ ...exp, techId: activeTechId });
    setAddingExpense(false);
    flash(`$${exp.amount.toFixed(2)} ${exp.category === 'maintenance' ? 'maintenance' : exp.category} expense sent to the owner.`);
  };

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto', padding: '28px 16px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 700, marginBottom: '6px' }}>My Cuts</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
          Welcome back, <strong style={{ color: 'var(--text-primary)' }}>{selectedTech?.name || user?.displayName}</strong>
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '12px' }}>
          <button type="button" className="btn-ghost" onClick={() => setAddingExpense(true)} style={{ padding: '10px 16px', fontSize: '14px', fontWeight: 600 }}>
            ⛽ Add Gas / Expense
          </button>
          <span style={{ fontSize: '12px', fontWeight: 600, color: GPS_LABEL[gps].color }}>{GPS_LABEL[gps].text}</span>
        </div>
        {demoMode && demoSelectableTechs.length > 0 && (
          <div style={{ marginTop: '12px', maxWidth: '320px' }}>
            <label className="form-label" style={{ display: 'block', marginBottom: '6px' }}>Switch Foreman (Demo)</label>
            <select className="form-input" value={activeTechId || ''} onChange={e => setActiveTechId(e.target.value)}>
              {demoSelectableTechs.map(tech => (
                <option key={tech.id} value={tech.id}>{tech.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Left Today',      value: groups[0].jobs.length + groups[1].jobs.length, color: '#1f6feb' },
          { label: 'Cut Today',       value: doneToday.length,                             color: '#3fb950' },
          { label: "Today's Earnings", value: `$${earnedToday.toFixed(0)}`,                color: '#4ade80' },
        ].map(s => (
          <div key={s.label} className="card" style={{ textAlign: 'center', padding: '16px 8px' }}>
            <div style={{ fontSize: '22px', fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {toast && (
        <div role="status" style={{ background: '#3fb95022', border: '1px solid #3fb95055', color: '#3fb950', borderRadius: '8px', padding: '10px 14px', fontSize: '14px', marginBottom: '16px' }}>
          ✓ {toast}
        </div>
      )}

      {open.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)', marginBottom: '28px' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>🌱</div>
          <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px' }}>All cut!</div>
          <div style={{ fontSize: '14px' }}>No cuts on your list right now.</div>
        </div>
      ) : groups.filter(g => g.jobs.length).map(group => (
        <section key={group.key} style={{ marginBottom: '26px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '12px', color: group.color }}>
            {group.title} <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>· {group.jobs.length}</span>
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {group.jobs.map(job => {
              const steps = TRANSITIONS[job.status] || [];
              const cuttingFor = job.status === 'in_progress' && job.startedAt ? Math.max(0, Math.round((Date.now() - new Date(job.startedAt)) / 60000)) : null;
              const isLoading = loadingId === job.id;
              const isExpanded = expandedId === job.id;
              return (
                <JobCard
                  key={job.id}
                  job={job}
                  expanded={isExpanded}
                  onClick={() => setExpandedId(isExpanded ? null : job.id)}
                  actions={steps.length ? (
                    <>
                      {cuttingFor != null && (
                        <div style={{ width: '100%', fontSize: '13px', fontWeight: 600, color: '#e67e22' }}>✂️ Cutting · {cuttingFor} min</div>
                      )}
                      {steps.map((step, i) => (
                        <button
                          key={step.next}
                          className={i === 0 ? 'btn-primary' : 'btn-ghost'}
                          onClick={e => { e.stopPropagation(); handleTransition(job, step); }}
                          disabled={isLoading}
                          style={i === 0
                            ? { background: step.color, borderColor: step.color, padding: '12px 22px', fontSize: '15px', flex: '1 1 auto' }
                            : { padding: '12px 18px', fontSize: '15px', flex: '0 1 auto' }}
                        >
                          {isLoading && i === 0 ? 'Updating…' : step.label}
                        </button>
                      ))}
                    </>
                  ) : null}
                />
              );
            })}
          </div>
        </section>
      ))}

      {addingExpense && (
        <ExpenseModal title="Add Gas / Expense" requireReceipt submitLabel="Send to Owner" onSubmit={handleExpense} onClose={() => setAddingExpense(false)} />
      )}

      {done.length > 0 && (
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '12px', color: 'var(--text-muted)' }}>Recently Cut</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {done.slice(0, 10).map(job => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
