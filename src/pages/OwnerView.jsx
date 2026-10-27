import { useEffect, useMemo, useRef, useState } from 'react';
import { useJobs } from '../hooks/useJobs.js';
import { useTechnicians } from '../hooks/useTechnicians.js';
import { useExpenses } from '../hooks/useExpenses.js';
import { useDelays } from '../hooks/useDelays.js';
import { useShifts } from '../hooks/useShifts.js';
import { usePayments } from '../hooks/usePayments.js';
import { laborExpenses } from '../lib/payroll.js';
import { SPEEDS, useDemoSim } from '../hooks/useDemoSim.js';
import FleetMap from '../components/FleetMap.jsx';
import OwnerTodo from '../components/OwnerTodo.jsx';
import ProfitLoss from '../components/ProfitLoss.jsx';
import LawnsPanel from '../components/LawnsPanel.jsx';
import CrewReport from '../components/CrewReport.jsx';
import TruckRoutes from '../components/TruckRoutes.jsx';
import ActivityFeed from '../components/ActivityFeed.jsx';
import CollapseButton from '../components/CollapseButton.jsx';
import PayrollView from '../components/PayrollView.jsx';
import PrintInvoices from '../components/PrintInvoices.jsx';
import { demoAccountHash, invoiceFor } from '../lib/invoices.js';
import { usePayroll } from '../hooks/usePayroll.js';
import { formatDay, todayString } from '../lib/dates.js';
import { hoursMins, jobDay, lawnKey, money, periodRange, profitAndLoss, rainMinutes } from '../lib/lawns.js';

// Stable no-op so memoized panels don't re-render in demo mode.
const noop = async () => {};

const LEGEND = [['#3fb950', 'Available'], ['#9c55f7', 'En Route'], ['#e67e22', 'Cutting'], ['#58a6ff', 'Rain'], ['#8b949e', 'Offline']];

// One number in the top strip; flashes when it changes (money coming in).
function Kpi({ label, value, color = 'var(--text-primary)' }) {
  const [flash, setFlash] = useState(0);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current === value) return undefined;
    prev.current = value;
    const id = setTimeout(() => setFlash(f => f + 1), 0);
    return () => clearTimeout(id);
  }, [value]);
  return (
    <div className="dash-kpi">
      <div key={flash} className={`dash-kpi-value${flash ? ' pl-flash' : ''}`} style={{ color }}>{value}</div>
      <div className="dash-kpi-label">{label}</div>
    </div>
  );
}

const Legend = () => (
  <div style={{ display: 'flex', gap: '10px', fontSize: '11px', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
    {LEGEND.map(([color, label]) => (
      <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }} />{label}
      </span>
    ))}
  </div>
);

// Which hub panels are folded; remembered per browser.
const COLLAPSE_KEY = 'ownerHubCollapsed';
const loadCollapsed = () => { try { return JSON.parse(localStorage.getItem(COLLAPSE_KEY)) || {}; } catch { return {}; } };
// Columns and their panels, with each column's normal width (fr so the others fill freed space).
const COLUMNS = [
  { panels: ['todo'], track: 'minmax(270px, 19fr)' },
  { panels: ['routes', 'activity'], track: 'minmax(0, 34fr)' },
  { panels: ['map'], track: 'minmax(250px, 22fr)' },
  { panels: ['pl', 'crew'], track: 'minmax(340px, 25fr)' },
];

/** Owner hub: everything on one screen. Long lists scroll inside their own panel. */
export default function OwnerView() {
  const live = useJobs();
  const liveExpenses = useExpenses();
  const { technicians: liveTechs } = useTechnicians();
  const liveDelays = useDelays();
  const { shifts: liveShifts } = useShifts();
  const livePayments = usePayments();
  const sim = useDemoSim();
  const [demoOn, setDemoOn] = useState(false);
  const [leftTab, setLeftTab] = useState('todo');
  const [view, setView] = useState('hub'); // 'hub' | 'payroll'
  const [selectedTechId, setSelectedTechId] = useState(null);
  const [printing, setPrinting] = useState(null); // { title, items } for the invoice preview
  const [printMenu, setPrintMenu] = useState(false);
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const toggle = id => setCollapsed(c => {
    const next = { ...c, [id]: !c[id] };
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next)); } catch { /* private mode */ }
    return next;
  });
  const fold = id => (collapsed[id] ? ' collapsed' : '');
  // A column whose panels are all folded becomes a thin rail; the rest share its space.
  const gridVars = Object.fromEntries(COLUMNS.map((c, i) => [`--col${i + 1}`, c.panels.every(p => collapsed[p]) ? '190px' : c.track]));

  // Demo mode swaps in the 48101 simulation; everything below reads from here.
  const allJobs       = demoOn ? sim.jobs : live.jobs;
  const technicians   = demoOn ? sim.technicians : liveTechs;
  const expenses      = demoOn ? sim.expenses : liveExpenses.expenses;
  const markPaid      = demoOn ? sim.markPaid : live.markPaid;
  const remindCustomer = demoOn ? sim.remindCustomer : live.remindCustomer;
  const scheduleJob   = demoOn ? noop : live.scheduleJob;
  const declineJob    = demoOn ? noop : live.declineJob;
  const addExpense    = demoOn ? noop : liveExpenses.addExpense;
  const logExpense    = demoOn ? noop : liveExpenses.logExpense;
  const rejectExpense = demoOn ? noop : liveExpenses.rejectExpense;
  const delays        = demoOn ? sim.delays : liveDelays;
  const payroll       = usePayroll({ demo: demoOn, foremen: demoOn ? sim.technicians : [] });
  const shifts        = demoOn ? sim.shifts : liveShifts; // rolled out → back at yard
  const payments      = demoOn ? sim.payments : livePayments;

  // Quotes live in To-Do until accepted; declined ones are hidden.
  const jobs = useMemo(() => allJobs.filter(j => !['quote', 'declined'].includes(j.status)), [allJobs]);
  // The demo runs on its own calendar; reports treat the demo's date as "today".
  const today = demoOn ? sim.date : todayString();
  // P/L expenses = logged expenses + each crew's labor (from payroll hours × rates).
  const labor = useMemo(() => laborExpenses({ employees: payroll.employees, jobs, shifts, delays, settings: payroll.settings, today }),
    [payroll.employees, payroll.settings, jobs, shifts, delays, today]);
  const books = useMemo(() => [...expenses, ...labor], [expenses, labor]);
  // Moving positions stay apart from status so the panels don't redraw 10×/second.
  const mapTechs = useMemo(
    // Demo: trucks that are off today (mowers in winter, plows when it's not snowing) stay off the map.
    () => (demoOn ? technicians.map((t, i) => ({ ...t, location: sim.positions[i] })).filter(t => t.status !== 'offline') : technicians),
    [demoOn, technicians, sim.positions],
  );

  // Paper invoices: one per visit, each with a QR that opens the customer's account.
  // Live: the server signs each customer's link. Demo: the link carries the account itself.
  const printInvoices = async (visitJobs, title) => {
    setPrintMenu(false);
    const crewOf = j => { const t = technicians.find(x => x.id === j.assignedTo); return t ? `${t.name}${t.truckName ? ` · ${t.truckName}` : ''}` : ''; };
    let items;
    if (demoOn) {
      items = visitJobs.map(j => {
        const invoice = invoiceFor(allJobs, j, today);
        const open = [...invoice.previous, ...(invoice.current.paid ? [] : [invoice.current])];
        const hash = demoAccountHash({ customer: invoice.customer, open, asOf: today });
        return { key: j.id, invoice, crew: crewOf(j), payUrl: `${window.location.origin}/pay/demo#${hash}` };
      });
    } else {
      const res = await fetch('/api/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobIds: visitJobs.map(j => j.id) }) });
      const data = res.ok ? await res.json() : [];
      items = data.map(d => {
        const j = visitJobs.find(x => x.id === d.jobId);
        return { key: d.jobId, invoice: d.invoice, crew: crewOf(j), payUrl: `${window.location.origin}/pay/${d.token}` };
      });
    }
    setPrinting({ title, items });
  };
  // Today's visits for one truck (route order) or every truck.
  const todaysVisits = techId => jobs
    .filter(j => jobDay(j, today) === today && j.status !== 'quote' && (!techId || j.assignedTo === techId))
    .sort((a, b) => String(a.assignedTo).localeCompare(String(b.assignedTo)));
  const routeTechs = technicians.filter(t => t.status !== 'pending_approval' && jobs.some(j => j.assignedTo === t.id && jobDay(j, today) === today));

  const toggleDemo = () => {
    if (demoOn) sim.pause();
    setSelectedTechId(null);
    setDemoOn(on => !on);
  };

  // ---- Numbers for the top strip ----
  const stats = useMemo(() => {
    const month = profitAndLoss(jobs, books, today.slice(0, 7));
    const todays = jobs.filter(j => jobDay(j, today) === today);
    const done = todays.filter(j => j.status === 'completed');
    const crew = technicians.filter(t => t.status !== 'pending_approval');
    return {
      month,
      cutToday: done.length,
      totalToday: todays.length,
      leftToday: todays.length - done.length,
      billedToday: done.reduce((s, j) => s + (j.earnings || 0), 0),
      onDuty: crew.filter(t => ['available', 'busy', 'en_route'].includes(t.status)).length,
      crewSize: crew.length,
      lawns: new Set(jobs.map(lawnKey)).size,
      rainMonth: (() => { const r = periodRange('month', today); return rainMinutes(delays, null, r.from, r.to); })(),
      onRain: crew.filter(t => t.status === 'rain_delay').length,
    };
  }, [jobs, books, today, technicians, delays]);

  const todoCount = useMemo(() => (
    allJobs.filter(j => j.status === 'quote').length
    + expenses.filter(e => e.status === 'pending').length
    + jobs.filter(j => j.status === 'completed' && !j.paid).length
  ), [allJobs, expenses, jobs]);

  const kpiGroups = [
    { title: 'Today', tiles: [
      { label: 'Cut', value: `${stats.cutToday}/${stats.totalToday}` },
      { label: 'Left', value: stats.leftToday },
      { label: 'Billed', value: money(stats.billedToday), color: '#3fb950' },
    ] },
    { title: 'This month', tiles: [
      { label: 'Income', value: money(stats.month.incomeTotal), color: '#3fb950' },
      { label: 'Owed', value: money(stats.month.owedTotal), color: '#f0b429' },
      { label: 'Expenses', value: money(stats.month.expenseTotal) },
      { label: 'Net', value: money(stats.month.net), color: stats.month.net >= 0 ? '#3fb950' : '#ff7b72' },
    ] },
    { title: 'Crew', tiles: [
      { label: 'On duty', value: `${stats.onDuty}/${stats.crewSize}` },
      { label: 'Rain · month', value: stats.rainMonth ? hoursMins(stats.rainMonth) : '0m', color: stats.rainMonth ? '#58a6ff' : undefined },
    ] },
  ];

  const seg = { display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', height: '30px' };
  const segBtn = on => ({
    padding: '0 10px', height: '100%', fontSize: '12px', fontWeight: 700, border: 'none', cursor: 'pointer',
    background: on ? 'var(--accent-teal)22' : 'transparent', color: on ? 'var(--accent-teal)' : 'var(--text-muted)',
  });

  return (
    <div className="owner-dash">
      {/* Title + grouped numbers */}
      <div className="dash-head">
        <div className="dash-title">
          <div style={{ fontWeight: 800, fontSize: '18px', letterSpacing: '-0.2px' }}>Owner Hub</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{formatDay(today)} · {stats.lawns} lawns</div>
          <div className="hub-tabs" role="tablist" style={{ marginTop: '6px' }}>
            <button type="button" role="tab" aria-selected={view === 'hub'} onClick={() => setView('hub')}>📊 Hub</button>
            <button type="button" role="tab" aria-selected={view === 'payroll'} onClick={() => setView('payroll')}>👷 Crew & Payroll</button>
          </div>
        </div>
        <div className="dash-kpis">
          {kpiGroups.map(g => (
            <div key={g.title} className="kpi-group" style={{ flexGrow: g.tiles.length }}>
              <div className="kpi-group-title">{g.title}</div>
              <div className="kpi-row" style={{ gridTemplateColumns: `repeat(${g.tiles.length}, minmax(0, 1fr))` }}>
                {g.tiles.map(k => <Kpi key={k.label} {...k} />)}
              </div>
            </div>
          ))}
        </div>
        <button type="button" className="btn-ghost" onClick={toggleDemo} aria-pressed={demoOn}
          style={{ padding: '7px 13px', fontSize: '13px', ...(demoOn ? { color: '#f0b429', borderColor: '#f0b42977', background: '#f0b42914' } : {}) }}>
          🎬 {demoOn ? 'Demo on' : 'Demo'}
        </button>
      </div>

      {/* Demo controls */}
      {demoOn && (
        <div className="demo-bar">
          <button type="button" onClick={sim.playing ? sim.pause : sim.play} aria-label={sim.playing ? 'Pause demo' : 'Play demo'}
            className="demo-play" style={{ background: sim.playing ? '#e67e22' : '#3fb950' }}>
            {sim.playing ? '⏸' : '▶'}
          </button>
          <div style={{ lineHeight: 1.25 }}>
            <div style={{ fontWeight: 700, fontSize: '13px' }}>{formatDay(sim.date)} · Week {sim.week}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Demo · ZIP 48101 · {sim.playing ? 'running' : 'paused'}{sim.cleared ? ' · fresh books' : ''}</div>
          </div>
          <span className="demo-sep" />
          <div style={seg} role="group" aria-label="Trucks">
            <button type="button" aria-label="Fewer trucks" disabled={sim.truckCount <= 1} onClick={() => sim.setTruckCount(sim.truckCount - 1)} style={{ ...segBtn(false), opacity: sim.truckCount <= 1 ? 0.35 : 1 }}>−</button>
            <span style={{ fontSize: '12px', fontWeight: 700, padding: '0 6px', whiteSpace: 'nowrap' }} title="Trucks running (16 lawns each per day)">🚜 {sim.truckCount} truck{sim.truckCount === 1 ? '' : 's'}</span>
            <button type="button" aria-label="More trucks" disabled={sim.truckCount >= sim.maxTrucks} onClick={() => sim.setTruckCount(sim.truckCount + 1)} style={{ ...segBtn(false), opacity: sim.truckCount >= sim.maxTrucks ? 0.35 : 1 }}>+</button>
          </div>
          <div style={seg} role="group" aria-label="Demo speed">
            {SPEEDS.map(s => <button key={s} type="button" aria-pressed={sim.speed === s} onClick={() => sim.setSpeed(s)} style={segBtn(sim.speed === s)}>{s}×</button>)}
          </div>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#58a6ff', whiteSpace: 'nowrap' }} title={sim.winter ? 'Demo winter (Dec–Mar): mowers parked; it snows about 1 workday in 3 and the plows roll at 4 AM.' : 'Demo weather: showers every 5th workday. Each foreman decides when to put their own truck on Rain Delay.'}>
            {sim.winter
              ? (sim.snowDay ? '❄️ Snow today · plows out' : '☁️ No snow · plows parked')
              : sim.rainDay ? '🌧 Showers likely today' : `☀️ Dry · showers in ${sim.daysUntilRain} day${sim.daysUntilRain === 1 ? '' : 's'}`}
          </span>
          <button type="button" className="btn-ghost demo-action" onClick={sim.winter ? sim.jumpToSpring : sim.jumpToWinter}
            title={sim.winter ? 'Back to mowing season' : 'Jump the demo to December: mowers park, plow trucks work snow days'}>
            {sim.winter ? '🌱 Mowing season' : '❄️ Jump to winter'}
          </button>
          <span style={{ flex: 1 }} />
          {sim.lastEvent && (
            <span key={sim.lastEvent + sim.cutToday} className="pl-flash demo-event">{sim.lastEvent}</span>
          )}
          <span className="demo-sep" />
          <button type="button" className="btn-ghost demo-action" onClick={() => { if (window.confirm('Clear all demo records? Paid history and expenses go to $0 so you can watch it build fresh.')) sim.clearRecords(); }} title="Wipe demo history: P/L starts at $0">🧹 Clear</button>
          <button type="button" className="btn-ghost demo-action" onClick={sim.reset} title="Back to week 1 with sample history">↺ Reset</button>
          <button type="button" className="btn-ghost demo-action" onClick={toggleDemo}>✕ Exit</button>
        </div>
      )}

      {printing && <PrintInvoices title={printing.title} items={printing.items} onClose={() => setPrinting(null)} />}
      {view === 'payroll' ? (
        <PayrollView technicians={technicians} jobs={jobs} shifts={shifts} delays={delays} payroll={payroll} today={today} />
      ) : (
      <div className="dash-main" style={gridVars}>
        {/* 1. To-Do / Lawns */}
        <div className="dash-col">
          <section className={`dash-panel${fold('todo')}`}>
            <div className="dash-panel-head">
              <CollapseButton collapsed={collapsed.todo} onToggle={() => toggle('todo')} label="To-Do" />
              <div className="dash-tabs" role="tablist">
                <button type="button" role="tab" aria-selected={leftTab === 'todo'} onClick={() => setLeftTab('todo')}>📥 To-Do{todoCount ? <span className="tab-count">{todoCount}</span> : null}</button>
                <button type="button" role="tab" aria-selected={leftTab === 'lawns'} onClick={() => setLeftTab('lawns')}>🌱 Lawns<span className="tab-count muted">{stats.lawns}</span></button>
              </div>
            </div>
            {!collapsed.todo && <div className="dash-panel-body">
              {leftTab === 'todo' ? (
                <OwnerTodo
                  bare
                  jobs={allJobs} technicians={technicians} expenses={expenses}
                  scheduleJob={scheduleJob} declineJob={declineJob} markPaid={markPaid}
                  logExpense={logExpense} rejectExpense={rejectExpense}
                  remindCustomer={remindCustomer} today={today}
                  // From Unpaid: print off their latest unpaid cut so every older one shows as balance.
                  printInvoice={job => {
                    const latest = allJobs.filter(j => lawnKey(j) === lawnKey(job) && j.status === 'completed' && !j.paid)
                      .sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)))[0] || job;
                    printInvoices([latest], `Invoice · ${job.clientName}`);
                  }}
                />
              ) : (
                <LawnsPanel bare jobs={jobs} markPaid={markPaid} today={today} />
              )}
            </div>}
          </section>
        </div>

        {/* 2. Routes per truck + what's happening */}
        <div className="dash-col">
          <section className={`dash-panel dash-routes${fold('routes')}`}>
            <div className="dash-panel-head">
              <CollapseButton collapsed={collapsed.routes} onToggle={() => toggle('routes')} label="Routes" />
              <span className="dash-panel-title">🚜 Routes today</span>
              <span className="dash-head-note">{stats.cutToday}/{stats.totalToday} cut · {stats.leftToday} left · {money(stats.billedToday)}</span>
              {!collapsed.routes && (
                <span className="print-menu">
                  <button type="button" className="btn-ghost head-btn" onClick={() => setPrintMenu(m => !m)} aria-expanded={printMenu} title="Print today's paper invoices to leave at each door">🖨 Invoices</button>
                  {printMenu && (
                    <span className="print-menu-list" role="menu">
                      <button type="button" role="menuitem" onClick={() => printInvoices(todaysVisits(), `Today's invoices · all trucks`)}>All trucks ({todaysVisits().length})</button>
                      {routeTechs.map(t => (
                        <button key={t.id} type="button" role="menuitem" onClick={() => printInvoices(todaysVisits(t.id), `Today's invoices · ${t.truckName || t.name}`)}>
                          {t.truckName || 'Truck'} · {t.name.split(' ')[0]} ({todaysVisits(t.id).length})
                        </button>
                      ))}
                    </span>
                  )}
                </span>
              )}
            </div>
            {!collapsed.routes && <div className="dash-panel-body">
              <TruckRoutes jobs={jobs} technicians={demoOn ? technicians.filter(t => t.status !== 'offline') : technicians} today={today} selectedTechId={selectedTechId} onSelect={setSelectedTechId} shifts={shifts} delays={delays} />
            </div>}
          </section>
          <section className={`dash-panel${fold('activity')}`}>
            <div className="dash-panel-head">
              <CollapseButton collapsed={collapsed.activity} onToggle={() => toggle('activity')} label="Live activity" />
              <span className="dash-panel-title">⚡ Live activity</span>
              <span className="dash-head-note">today</span>
            </div>
            {!collapsed.activity && <div className="dash-panel-body">
              <ActivityFeed jobs={jobs} expenses={expenses} technicians={technicians} delays={delays} shifts={shifts} payments={payments} today={today} />
            </div>}
          </section>
        </div>

        {/* 3. Tall map (48101 is tall and narrow) */}
        <div className="dash-col">
          <section className={`dash-panel${fold('map')}`}>
            <div className="dash-panel-head">
              <CollapseButton collapsed={collapsed.map} onToggle={() => toggle('map')} label="Live map" />
              <span className="dash-panel-title">🗺️ Live map <span className="dash-head-note">{demoOn ? 'ZIP 48101' : 'Downriver'}</span></span>
              {stats.onRain > 0 && <span style={{ fontSize: '12px', fontWeight: 700, color: '#58a6ff' }}>🌧 {stats.onRain} on rain delay</span>}
            </div>
            {!collapsed.map && <><div className="dash-map">
              <div>
                <FleetMap
                  key={demoOn ? 'demo' : 'live'}
                  technicians={mapTechs}
                  jobs={jobs}
                  selectedTechId={selectedTechId}
                  {...(demoOn ? { lawns: sim.lawns, bursts: sim.bursts, fitBounds: sim.bounds, outline: sim.outline, lots: sim.lots, snowing: sim.snowDay } : {})}
                />
              </div>
            </div>
            <div className="dash-panel-foot"><Legend /></div></>}
          </section>
        </div>

        {/* 4. Money + who cut what */}
        <div className="dash-col">
          <ProfitLoss compact collapsed={!!collapsed.pl} onToggleCollapse={() => toggle('pl')} jobs={jobs} expenses={books} technicians={technicians} addExpense={addExpense} today={today} payments={payments} />
          <CrewReport compact collapsed={!!collapsed.crew} onToggleCollapse={() => toggle('crew')} jobs={jobs} technicians={technicians} today={today} shifts={shifts} delays={delays} />
        </div>
      </div>
      )}
    </div>
  );
}
