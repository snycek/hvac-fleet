import { useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { useJobs } from '../hooks/useJobs.js';
import { useTechnicians } from '../hooks/useTechnicians.js';
import JobCard from '../components/JobCard.jsx';
import ExpenseModal from '../components/ExpenseModal.jsx';
import { useExpenses } from '../hooks/useExpenses.js';
import { useShareLocation } from '../hooks/useShareLocation.js';
import { formatDay, todayString } from '../lib/dates.js';
import CrewHoursCard from '../components/CrewHoursCard.jsx';
import { usePayroll } from '../hooks/usePayroll.js';
import { useShifts } from '../hooks/useShifts.js';
import { lawnKey } from '../lib/lawns.js';

// Skip this lawn today: pick why, then it's off the route (not billed, not late). The
// next visit still schedules itself.
const SKIP_REASONS = ['Customer asked', 'Gate locked / no access', 'Too wet / weather', 'Other'];
function SkipButton({ onSkip, disabled }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const stop = e => e.stopPropagation();
  if (!open) {
    return (
      <button type="button" className="btn-ghost" disabled={disabled} onClick={e => { stop(e); setOpen(true); }}
        style={{ padding: '12px 14px', fontSize: '15px', flex: '0 1 auto', color: 'var(--text-muted)' }}>⏭ Skip</button>
    );
  }
  const pick = async (e, reason) => { stop(e); setBusy(true); try { await onSkip(reason); } finally { setBusy(false); setOpen(false); } };
  return (
    <div onClick={stop} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Skip this lawn today because…</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        {SKIP_REASONS.map(r => (
          <button key={r} type="button" className="btn-ghost" disabled={busy} onClick={e => pick(e, r)} style={{ padding: '11px 8px', fontSize: '14px', fontWeight: 600 }}>{r}</button>
        ))}
      </div>
      <button type="button" className="btn-ghost" onClick={e => { stop(e); setOpen(false); }} style={{ padding: '8px', fontSize: '13px' }}>Cancel, don't skip</button>
    </div>
  );
}

// Customer paid at the door: check (number optional) or cash. Covers their whole
// unpaid balance; the owner clears it when the foreman turns it in.
function GotPaid({ amount, onSave }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState('check');
  const [number, setNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const stop = e => e.stopPropagation();
  if (!open) {
    return (
      <button type="button" className="btn-ghost" onClick={e => { stop(e); setOpen(true); }}
        style={{ padding: '10px 16px', fontSize: '14px', fontWeight: 600, color: '#3fb950', borderColor: '#3fb95066' }}>
        💵 Got paid · ${amount.toFixed(0)}
      </button>
    );
  }
  const save = async e => {
    stop(e); setErr(''); setBusy(true);
    try { await onSave(kind, number.trim()); setOpen(false); } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  };
  const pick = on => ({ padding: '10px 14px', fontSize: '14px', fontWeight: 700, flex: 1, ...(on ? { background: '#3fb95022', borderColor: '#3fb950', color: '#3fb950' } : {}) });
  return (
    <div onClick={stop} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>They paid you <b style={{ color: 'var(--text-primary)' }}>${amount.toFixed(2)}</b> (their full balance) with:</div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button type="button" className="btn-ghost" aria-pressed={kind === 'check'} onClick={() => setKind('check')} style={pick(kind === 'check')}>🧾 Check</button>
        <button type="button" className="btn-ghost" aria-pressed={kind === 'cash'} onClick={() => setKind('cash')} style={pick(kind === 'cash')}>💵 Cash</button>
      </div>
      {kind === 'check' && (
        <input className="form-input" inputMode="numeric" placeholder="Check # (optional)" aria-label="Check number" value={number} onChange={e => setNumber(e.target.value.slice(0, 12))} />
      )}
      {err && <div style={{ color: '#ff7b72', fontSize: '13px' }}>{err}</div>}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button type="button" className="btn-primary" disabled={busy} onClick={save} style={{ padding: '12px 18px', fontSize: '15px', flex: 1, background: '#3fb950', borderColor: '#3fb950' }}>
          {busy ? 'Saving…' : `Got ${kind === 'cash' ? 'cash' : 'a check'} for $${amount.toFixed(0)}`}
        </button>
        <button type="button" className="btn-ghost" onClick={e => { stop(e); setOpen(false); }} style={{ padding: '12px 14px', fontSize: '14px' }}>Cancel</button>
      </div>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Keep it safe and hand it to John. He marks it received.</div>
    </div>
  );
}

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
  const { jobs, updateJobStatus2, crewCollect } = useJobs();
  const { technicians, updateTechLocation, updateTechStatus } = useTechnicians();
  const { addExpense } = useExpenses({ poll: false });
  const gps = useShareLocation(activeTechId, updateTechLocation);
  const [addingExpense, setAddingExpense] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [loadingId, setLoadingId]   = useState(null);
  const [toast, setToast] = useState('');
  const today = todayString();
  // Crew hours: this foreman's crew + today's rollout / back-at-yard.
  const payroll = usePayroll();
  const { shifts, saveShift } = useShifts();
  const myCrew = payroll.employees.filter(e => e.crewId === activeTechId && e.active !== false)
    .sort((a, b) => (a.role === 'foreman' ? -1 : b.role === 'foreman' ? 1 : a.name.localeCompare(b.name)));
  const myShift = shifts.find(s => s.techId === activeTechId && s.date === today);
  const demoSelectableTechs = technicians.filter(t => t.status !== 'pending_approval');
  const selectedTech = demoSelectableTechs.find(t => t.id === activeTechId);

  const mine = jobs.filter(j => j.assignedTo === activeTechId);
  const open = mine
    .filter(j => !['completed', 'skipped', 'declined', 'quote'].includes(j.status))
    .sort((a, b) => dayOf(a).localeCompare(dayOf(b)));
  const groups = [
    { key: 'overdue',  title: 'Overdue',  color: '#ff7b72', jobs: open.filter(j => dayOf(j) < today) },
    { key: 'today',    title: 'Today',    color: 'var(--accent-teal)', jobs: open.filter(j => dayOf(j) === today) },
    { key: 'upcoming', title: 'Upcoming', color: 'var(--text-muted)', jobs: open.filter(j => dayOf(j) > today) },
  ];
  // Finished stops: cut, or skipped (shown with their reason).
  const done = mine.filter(j => j.status === 'completed' || j.status === 'skipped')
    .sort((a, b) => String(b.completedAt || b.skippedAt).localeCompare(String(a.completedAt || a.skippedAt)));
  const doneToday = done.filter(j => j.status === 'completed' && j.completedAt && todayString(new Date(j.completedAt)) === today);
  const earnedToday = doneToday.reduce((sum, j) => sum + (j.earnings || 0), 0);

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(''), 5000); };

  // Money at each address: unpaid finished visits, and anything already collected / promised.
  const owedAt = key => {
    const unpaid = jobs.filter(j => lawnKey(j) === key && j.status === 'completed' && !j.paid);
    const pending = unpaid.find(j => j.checkPending)?.checkPending || null;
    return { amount: unpaid.reduce((s, j) => s + (j.earnings || 0), 0), pending };
  };
  const collect = async (job, kind, number) => {
    const r = await crewCollect(job.id, kind, number);
    flash(`Got ${kind === 'cash' ? 'cash' : 'a check'} for $${Math.round(r.amount)} from ${job.clientName}. Hand it to John. It's on his list to clear.`);
  };
  // Today's cut lawns: "Got paid" until the money is in hand.
  const paidActions = job => {
    const { amount, pending } = owedAt(lawnKey(job));
    if (pending?.collectedBy) return <div style={{ fontSize: '13px', fontWeight: 600, color: '#a371f7' }}>📨 {pending.kind === 'cash' ? 'Cash' : 'Check'} collected · hand it to John</div>;
    if (!amount) return null;
    return <GotPaid amount={amount} onSave={(kind, number) => collect(job, kind, number)} />;
  };

  // Rain delay: put the whole route on hold, then resume where they left off.
  const onRainDelay = selectedTech?.status === 'rain_delay';
  const [rainBusy, setRainBusy] = useState(false);
  const toggleRain = async () => {
    if (!activeTechId) return;
    setRainBusy(true);
    const cutting = jobs.some(j => j.assignedTo === activeTechId && j.status === 'in_progress');
    const driving = jobs.some(j => j.assignedTo === activeTechId && j.status === 'en_route');
    await updateTechStatus(activeTechId, onRainDelay ? (cutting ? 'busy' : driving ? 'en_route' : 'available') : 'rain_delay');
    setRainBusy(false);
    flash(onRainDelay ? 'Route resumed.' : 'Route on rain delay. Tap Resume when it clears.');
  };

  const handleTransition = async (job, t) => {
    if (!t) return;
    setLoadingId(job.id);
    const result = await updateJobStatus2(job.id, t.next);
    if (t.next !== 'completed') { setLoadingId(null); return; }

    // Marking a lawn cut puts the foreman "On My Way" to the next lawn on today's list
    // (today's or overdue stops only — never a future day).
    // PLANNED (not built yet): if that customer wants a heads-up text/email ("crew on the
    // way — please move your car"), hold it for ~30 seconds after Mark Cut so the foreman
    // can say "not yet" (lunch, gas, break) and send it later instead.
    const next = open.find(j => j.id !== job.id && ['assigned', 'pending'].includes(j.status) && dayOf(j) <= today);
    if (next) await updateJobStatus2(next.id, 'en_route');
    setLoadingId(null);

    const repeat = result?.nextJob ? ` Next visit ${formatDay(result.nextJob.scheduledDate)}.` : '';
    flash(next
      ? `${job.clientName} marked cut. On my way to ${String(next.address || '').split(',')[0]}.${repeat}`
      : `${job.clientName} marked cut — that's the last one today.${repeat}`);
  };

  const handleSkip = async (job, reason) => {
    setLoadingId(job.id);
    const result = await updateJobStatus2(job.id, 'skipped', { reason });
    const next = open.find(j => j.id !== job.id && ['assigned', 'pending'].includes(j.status) && dayOf(j) <= today);
    if (next) await updateJobStatus2(next.id, 'en_route');
    setLoadingId(null);
    const repeat = result?.nextJob ? ` Next visit ${formatDay(result.nextJob.scheduledDate)}.` : '';
    // Another stop still open today (maybe already marked on the way)?
    const onTo = next || open.find(j => j.id !== job.id && dayOf(j) <= today);
    flash(onTo
      ? `Skipped ${job.clientName} (${reason.toLowerCase()}). On to ${String(onTo.address || '').split(',')[0]}.${repeat}`
      : `Skipped ${job.clientName} (${reason.toLowerCase()}). That was the last one today.${repeat}`);
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
          <button type="button" className={onRainDelay ? 'btn-primary' : 'btn-ghost'} onClick={toggleRain} disabled={rainBusy || !activeTechId}
            style={{ padding: '10px 16px', fontSize: '14px', fontWeight: 600, ...(onRainDelay ? { background: '#3fb950', borderColor: '#3fb950' } : { color: '#58a6ff', borderColor: '#58a6ff66' }) }}>
            {onRainDelay ? '☀️ Resume Route' : '🌧 Rain Delay'}
          </button>
          <span style={{ fontSize: '12px', fontWeight: 600, color: GPS_LABEL[gps].color }}>{GPS_LABEL[gps].text}</span>
        </div>
        {onRainDelay && (
          <div role="status" style={{ marginTop: '12px', background: '#58a6ff1f', border: '1px solid #58a6ff66', color: '#58a6ff', borderRadius: '8px', padding: '10px 14px', fontSize: '14px', fontWeight: 600 }}>
            🌧 Route on rain delay — the owner can see it. Tap ☀️ Resume Route when you're back to cutting.
          </div>
        )}
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

      <CrewHoursCard
        foremanId={activeTechId}
        date={today}
        shift={myShift}
        crew={myCrew}
        savedHours={payroll.settings.hours || {}}
        onSaveShift={saveShift}
        onSaveHours={payroll.setHours}
      />

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
                      {(() => {
                        const { pending } = owedAt(lawnKey(job));
                        return pending && pending.how === 'crew' && !pending.collectedBy ? (
                          <div style={{ width: '100%', fontSize: '13px', fontWeight: 700, color: '#a371f7' }}>
                            📨 They said they'll hand you a check for ${Math.round(pending.amount)}. After Mark Cut, tap 💵 Got paid.
                          </div>
                        ) : null;
                      })()}
                      {steps.map((step, i) => (
                        <button
                          key={step.next}
                          className={i === 0 ? 'btn-primary' : 'btn-ghost'}
                          onClick={e => { e.stopPropagation(); handleTransition(job, step); }}
                          disabled={isLoading || onRainDelay}
                          style={i === 0
                            ? { background: step.color, borderColor: step.color, padding: '12px 22px', fontSize: '15px', flex: '1 1 auto' }
                            : { padding: '12px 18px', fontSize: '15px', flex: '0 1 auto' }}
                        >
                          {isLoading && i === 0 ? 'Updating…' : step.label}
                        </button>
                      ))}
                      <SkipButton disabled={isLoading || onRainDelay} onSkip={reason => handleSkip(job, reason)} />
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
              <JobCard key={job.id} job={job} actions={doneToday.includes(job) ? paidActions(job) : null} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
