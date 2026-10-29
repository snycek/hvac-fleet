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
import { todoCount as countTodo } from '../lib/todo.js';
import BillingPanel from '../components/BillingPanel.jsx';
import { fetchPayLinks, useBilling } from '../hooks/useBilling.js';
import { latestBilledPeriod, periodLabel, remindBy, statementMessage, statementOpenLines, statementSheet, statementsFor } from '../lib/billing.js';
import QuoteInbox from '../components/QuoteInbox.jsx';
import ProfitLoss from '../components/ProfitLoss.jsx';
import LawnsPanel from '../components/LawnsPanel.jsx';
import CrewReport from '../components/CrewReport.jsx';
import TruckRoutes from '../components/TruckRoutes.jsx';
import ActivityFeed from '../components/ActivityFeed.jsx';
import CollapseButton from '../components/CollapseButton.jsx';
import PayrollView from '../components/PayrollView.jsx';
import PrintInvoices from '../components/PrintInvoices.jsx';
import CustomerCard from '../components/CustomerCard.jsx';
import { accountReminder } from '../lib/customers.js';
import { rankRoutes } from '../lib/routeFit.js';
import { COMPANY_INFO } from '../data/services.js';
import { billingMode, demoAccountHash, invoiceFor } from '../lib/invoices.js';
import { usePayroll } from '../hooks/usePayroll.js';
import { addDays, formatDay, todayString } from '../lib/dates.js';
import { dayOf, jobDay, lawnKey, money, periodRange, profitAndLoss, rainMinutes } from '../lib/lawns.js';

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
export default function OwnerView({ demoOnly = false } = {}) {
  // demoOnly: the public /demo link. Demo runs on its own (1×, 2 trucks by default),
  // nothing talks to the server, and there's no way out into live data.
  const serverless = demoOnly;
  const live = useJobs({ live: !serverless });
  const liveExpenses = useExpenses({ poll: !serverless });
  const { technicians: liveTechs } = useTechnicians({ live: !serverless });
  const liveDelays = useDelays({ poll: !serverless });
  const { shifts: liveShifts } = useShifts({ poll: !serverless });
  const livePayments = usePayments({ poll: !serverless });
  // /demo?speed=1&trucks=2 (both optional): already playing from the first frame.
  const [linkOpts] = useState(() => {
    const q = new URLSearchParams(window.location.search);
    const speed = Number(q.get('speed')) || 1;
    return { speed: SPEEDS.includes(speed) ? speed : 1, trucks: Number(q.get('trucks')) || 2 };
  });
  const sim = useDemoSim(demoOnly ? { playing: true, speed: linkOpts.speed } : {});
  const [demoOn, setDemoOn] = useState(demoOnly);
  // A truck count other than the usual 2 rebuilds the demo once on open.
  useEffect(() => {
    if (demoOnly && linkOpts.trucks !== sim.truckCount && linkOpts.trucks >= 1 && linkOpts.trucks <= sim.maxTrucks) sim.setTruckCount(linkOpts.trucks);
    // Once, on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoOnly]);
  const [leftTab, setLeftTab] = useState('todo');
  const [view, setView] = useState('hub'); // 'hub' | 'payroll'
  const [selectedTechId, setSelectedTechId] = useState(null);
  const [printing, setPrinting] = useState(null); // { title, items } for the invoice preview
  const [printMenu, setPrintMenu] = useState(false);
  const [customerKey, setCustomerKey] = useState(null); // customer card open for this address
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
  const remindCustomersFn = demoOn ? sim.remindCustomers : live.remindCustomers;
  const scheduleJob   = demoOn ? sim.scheduleQuote : live.scheduleJob;
  const declineJob    = demoOn ? sim.declineQuote : live.declineJob;
  const addExpense    = demoOn ? noop : liveExpenses.addExpense;
  const logExpense    = demoOn ? noop : liveExpenses.logExpense;
  const rejectExpense = demoOn ? noop : liveExpenses.rejectExpense;
  const delays        = demoOn ? sim.delays : liveDelays;
  const payroll       = usePayroll({ demo: demoOn, foremen: demoOn ? sim.technicians : [], today: demoOn ? sim.date : undefined });
  const shifts        = demoOn ? sim.shifts : liveShifts; // rolled out → back at yard
  const payments      = demoOn ? sim.payments : livePayments;
  const sendStatementsFn = demoOn ? sim.sendStatements : live.sendStatements;
  const updateCustomer = demoOn ? sim.updateCustomer : live.updateCustomer;
  const billing       = useBilling(demoOn, { serverless });
  const settings      = billing.settings;

  // Quotes live in To-Do until accepted; declined ones are hidden.
  const jobs = useMemo(() => allJobs.filter(j => !['quote', 'declined'].includes(j.status)), [allJobs]);
  // The demo runs on its own calendar; reports treat the demo's date as "today".
  const today = demoOn ? sim.date : todayString();
  // Demo: statements dated before the demo started count as already sent (sample history).
  const assumeSentBefore = demoOn ? sim.start : null;
  const latestPeriod = latestBilledPeriod(today, settings);
  const statementsReady = useMemo(() => {
    const unsent = statementsFor(allJobs, latestPeriod, today, settings, { assumeSentBefore }).filter(st => st.status === 'unsent');
    return unsent.length ? { period: latestPeriod, count: unsent.length, total: unsent.reduce((s, st) => s + st.total, 0) } : null;
  }, [allJobs, latestPeriod, today, settings, assumeSentBefore]);

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
        const invoice = invoiceFor(allJobs, j, today, settings);
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
  // Monthly statements: print (record=true also logs them as sent on paper) and send
  // (text/email, the way each customer prefers). Each carries the customer's pay link.
  const statementPayUrls = async list => {
    if (demoOn) return Object.fromEntries(list.map(st => [st.key, `${window.location.origin}/pay/demo#${demoAccountHash({ customer: { name: st.name, address: st.address }, open: statementOpenLines(st), asOf: today })}`]));
    const tokens = await fetchPayLinks(list.map(st => st.key));
    return Object.fromEntries(list.map(st => [st.key, `${window.location.origin}/pay/${tokens[st.key] || ''}`]));
  };
  const statementItems = (list, channelOf, messageOf) => list.map(st => ({
    jobIds: st.visits.map(j => j.id), period: st.period, periodLabel: periodLabel(st.period), channel: channelOf(st), message: messageOf(st),
  }));
  const printStatements = async (list, record = false) => {
    if (!list.length) return;
    const urls = await statementPayUrls(list);
    setPrinting({ title: list.length === 1 ? `Statement · ${list[0].name}` : `${periodLabel(list[0].period)} statements`, items: list.map(st => ({ key: st.key, invoice: statementSheet(st), payUrl: urls[st.key] })) });
    if (record) await sendStatementsFn(statementItems(list, () => 'paper', () => ''));
  };
  const sendStatements = async list => {
    const urls = demoOn ? await statementPayUrls(list) : {};
    const message = st => { const m = statementMessage(st, COMPANY_INFO.name); return demoOn ? m.replace('{payLink}', urls[st.key]) : m; };
    return sendStatementsFn(statementItems(list, st => st.reach, message));
  };
  // A customer's bill: monthly customers get their latest statement; others the invoice for their latest visit.
  const printBillFor = job => {
    const key = lawnKey(job);
    if (billingMode(job) === 'monthly') {
      const st = statementsFor(allJobs, latestPeriod, today, settings).find(s => s.key === key)
        || statementsFor(allJobs, today.slice(0, 7), today, settings).find(s => s.key === key);
      if (st) return printStatements([st]);
    }
    const latest = allJobs.filter(j => lawnKey(j) === key && j.status === 'completed' && !j.paid)
      .sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)))[0] || job;
    return printInvoices([latest], `Invoice · ${job.clientName}`);
  };
  // Demo pay link for a customer (the link carries their open visits).
  const demoPayLink = job => {
    const invoice = invoiceFor(allJobs, job, today, settings);
    const open = [...invoice.previous, ...(invoice.current.paid ? [] : [invoice.current])];
    return `${window.location.origin}/pay/demo#${demoAccountHash({ customer: invoice.customer, open, asOf: today })}`;
  };
  // Account reminders, one per customer: [{ name, address, email, jobs, balance, oldestDate }].
  const remindAccounts = async customers => {
    const items = customers.map(c => {
      const latest = c.jobs[c.jobs.length - 1];
      const message = accountReminder(c, COMPANY_INFO.name);
      return { jobIds: c.jobs.map(j => j.id), channel: remindBy(latest), message: demoOn ? message.replace('{payLink}', demoPayLink(latest)) : message };
    }).filter(it => it.channel); // no phone or email: nothing to send (their bills go on paper)
    return remindCustomersFn(items);
  };
  // Open cuts for one customer, shaped for remindAccounts.
  const openAccount = key => {
    const jobsOpen = allJobs.filter(j => lawnKey(j) === key && j.status === 'completed' && !j.paid)
      .sort((a, b) => String(a.completedAt).localeCompare(String(b.completedAt)));
    const latest = jobsOpen[jobsOpen.length - 1] || allJobs.find(j => lawnKey(j) === key);
    return { key, name: latest?.clientName, address: latest?.address, email: latest?.clientEmail || latest?.email || '', phone: latest?.clientPhone || '', jobs: jobsOpen, balance: jobsOpen.reduce((s, j) => s + (j.earnings || 0), 0), oldestDate: String(jobsOpen[0]?.completedAt || '').slice(0, 10) };
  };
  const openCustomer = job => setCustomerKey(lawnKey(job));

  // Accept quote: where would this address fit best? Demo uses its weekly routes; live
  // looks at each foreman's scheduled stops over the next 5 weekdays.
  const livePlanRoutes = job => {
    const crews = technicians.filter(t => t.kind !== 'plow' && t.status !== 'pending_approval');
    const routes = [];
    for (let i = 1, n = 0; n < 5 && i < 10; i++) {
      const date = addDays(today, i);
      const wd = new Date(`${date}T12:00:00`).getDay();
      if (wd === 0 || wd === 6) continue;
      n++;
      for (const t of crews) {
        const stops = allJobs.filter(j => j.assignedTo === t.id && j.scheduledDate === date && j.location?.lat && !['quote', 'declined'].includes(j.status))
          .map(j => ({ id: j.id, lat: j.location.lat, lng: j.location.lng, label: j.address }));
        const depot = t.location?.lat ? t.location : stops[0] || job.location;
        routes.push({ key: `${date}:${t.id}`, day: wd, date, depot, dayShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][wd],
          dayLabel: new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }),
          techId: t.id, techName: t.name, truckName: t.truckName || '', stops });
      }
    }
    return rankRoutes(routes, job.location, job.location);
  };
  const planRoutes = demoOn ? sim.planRoutes : livePlanRoutes;

  // Today's visits for one truck (route order) or every truck.
  // Door invoices are only for customers billed per visit (monthly ones get a statement).
  const todaysVisits = techId => jobs
    .filter(j => jobDay(j, today) === today && j.status !== 'quote' && billingMode(j) === 'visit' && (!techId || j.assignedTo === techId))
    .sort((a, b) => String(a.assignedTo).localeCompare(String(b.assignedTo)));
  const routeTechs = technicians.filter(t => t.status !== 'pending_approval' && jobs.some(j => j.assignedTo === t.id && jobDay(j, today) === today && billingMode(j) === 'visit'));

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
      // Money actually brought in today (anything marked paid today: cash, check, card, QR).
      // Everything cut this month (paid or not).
      billedMonth: (() => { const r = periodRange('month', today); return jobs.filter(j => j.status === 'completed' && jobDay(j, today) >= r.from && jobDay(j, today) <= r.to).reduce((s, j) => s + (j.earnings || 0), 0); })(),
      collectedToday: jobs.filter(j => j.paid && dayOf(j.paidAt) === today).reduce((s, j) => s + (j.earnings || 0), 0),
      onDuty: crew.filter(t => ['available', 'busy', 'en_route'].includes(t.status)).length,
      crewSize: crew.length,
      lawns: new Set(jobs.map(lawnKey)).size,
      rainMonth: (() => { const r = periodRange('month', today); return rainMinutes(delays, null, r.from, r.to); })(),
      onRain: crew.filter(t => t.status === 'rain_delay').length,
    };
  }, [jobs, books, today, technicians, delays]);

  // New quote requests have their own tab now.
  const quoteCount = useMemo(() => allJobs.filter(j => j.status === 'quote').length, [allJobs]);
  // A new quote request came in (count went up after the hub loaded): bring the Quotes
  // tab forward, open the panel if it's folded, and flash it. Not on first load.
  const [quoteSeen, setQuoteSeen] = useState({ count: null, demo: demoOn });
  const [quoteFlash, setQuoteFlash] = useState(0);
  if (quoteSeen.demo !== demoOn || (quoteSeen.count === null && allJobs.length > 0)) {
    setQuoteSeen({ count: allJobs.length > 0 ? quoteCount : null, demo: demoOn });
  } else if (quoteSeen.count !== null && quoteCount !== quoteSeen.count) {
    setQuoteSeen({ count: quoteCount, demo: demoOn });
    if (quoteCount > quoteSeen.count) {
      setLeftTab('quotes');
      setQuoteFlash(n => n + 1);
      if (collapsed.todo) setCollapsed(c => ({ ...c, todo: false }));
    }
  }
  const todoCount = useMemo(() => countTodo({ jobs: allJobs, expenses, today, settings, statementsReady }), [allJobs, expenses, today, settings, statementsReady]);

  const kpiGroups = [
    { title: 'Today', tiles: [
      { label: 'Cut', value: `${stats.cutToday}/${stats.totalToday}` },
      { label: 'Left', value: stats.leftToday },
      { label: 'Earned', value: money(stats.billedToday) },
      { label: 'Collected', value: money(stats.collectedToday), color: '#3fb950' },
    ] },
    { title: 'This month', tiles: [
      { label: 'Earned', value: money(stats.billedMonth) },
      { label: 'Collected', value: money(stats.month.incomeTotal), color: '#3fb950' },
      { label: 'Expenses', value: money(stats.month.expenseTotal) },
      { label: 'Net', value: money(stats.month.net), color: stats.month.net >= 0 ? '#3fb950' : '#ff7b72' },
    ] },
    // (Crew "On duty" / "Rain · month" tiles removed: they took space without helping.
    // Rain delays still show on the live map and in each truck's route.)
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
        {/* On phones/tablets the Crew numbers live on the Crew & Payroll tab, not the Hub. */}
        <div className={`dash-kpis view-${view}`}>
          {kpiGroups.map(g => (
            <div key={g.title} className={g.title === 'Crew' ? 'kpi-group kpi-crew' : 'kpi-group'} style={{ flexGrow: g.tiles.length }}>
              <div className="kpi-group-title">{g.title}</div>
              <div className="kpi-row" style={{ gridTemplateColumns: `repeat(${g.tiles.length}, minmax(0, 1fr))` }}>
                {g.tiles.map(k => <Kpi key={k.label} {...k} />)}
              </div>
            </div>
          ))}
        </div>
        {!demoOnly && (
          <button type="button" className="btn-ghost" onClick={toggleDemo} aria-pressed={demoOn}
            style={{ padding: '7px 13px', fontSize: '13px', ...(demoOn ? { color: '#f0b429', borderColor: '#f0b42977', background: '#f0b42914' } : {}) }}>
            🎬 {demoOn ? 'Demo on' : 'Demo'}
          </button>
        )}
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
          {!demoOnly && <button type="button" className="btn-ghost demo-action" onClick={toggleDemo}>✕ Exit</button>}
        </div>
      )}

      {customerKey && (
        <CustomerCard
          customerKey={customerKey} jobs={allJobs} payments={payments} today={today} settings={settings}
          onClose={() => setCustomerKey(null)}
          onRemind={() => remindAccounts([openAccount(customerKey)])}
          onPrint={() => { const a = openAccount(customerKey); if (a.jobs.length) printBillFor(a.jobs[a.jobs.length - 1]); }}
          onUpdate={updateCustomer}
        />
      )}
      {printing && <PrintInvoices title={printing.title} items={printing.items} onClose={() => setPrinting(null)} />}
      {view === 'payroll' ? (
        <PayrollView technicians={technicians} jobs={jobs} shifts={shifts} delays={delays} payroll={payroll} today={today} />
      ) : (
      <div className="dash-main" style={gridVars}>
        {/* 1. To-Do / Lawns */}
        <div className="dash-col">
          <section className={`dash-panel${fold('todo')}`} style={{ position: 'relative' }}>
            {quoteFlash > 0 && <span key={quoteFlash} className="panel-flash" aria-hidden="true" />}
            <div className="dash-panel-head">
              <CollapseButton collapsed={collapsed.todo} onToggle={() => toggle('todo')} label="To-Do" />
              <div className="dash-tabs" role="tablist">
                <button type="button" role="tab" aria-selected={leftTab === 'todo'} onClick={() => setLeftTab('todo')}>📥 To-Do{todoCount ? <span className="tab-count">{todoCount}</span> : null}</button>
                <button type="button" role="tab" aria-selected={leftTab === 'quotes'} onClick={() => setLeftTab('quotes')}>📝 Quotes{quoteCount ? <span className="tab-count new">{quoteCount}</span> : null}</button>
                <button type="button" role="tab" aria-selected={leftTab === 'billing'} onClick={() => setLeftTab('billing')}>💵 Billing{statementsReady ? <span className="tab-count">{statementsReady.count}</span> : null}</button>
                <button type="button" role="tab" aria-selected={leftTab === 'lawns'} onClick={() => setLeftTab('lawns')}>🌱 Lawns<span className="tab-count muted">{stats.lawns}</span></button>
              </div>
            </div>
            {!collapsed.todo && <div className="dash-panel-body">
              {leftTab === 'quotes' ? (
                quoteCount ? (
                  <QuoteInbox jobs={allJobs} technicians={technicians} scheduleJob={scheduleJob} declineJob={declineJob} planRoutes={planRoutes} today={today} />
                ) : <div className="cust-empty">✓ No new quote requests. New ones from the website land here.</div>
              ) : leftTab === 'todo' ? (
                <OwnerTodo
                  bare hideQuotes
                  jobs={allJobs} technicians={technicians} expenses={expenses}
                  scheduleJob={scheduleJob} declineJob={declineJob} markPaid={markPaid}
                  logExpense={logExpense} rejectExpense={rejectExpense}
                  remindCustomer={remindCustomer} today={today}
                  remindAccounts={remindAccounts} openCustomer={openCustomer} planRoutes={planRoutes}
                  printInvoice={printBillFor}
                  settings={settings} statementsReady={statementsReady}
                  onOpenBilling={() => setLeftTab('billing')} onOpenQuotes={() => setLeftTab('quotes')}
                  promiseCheck={demoOn ? sim.promiseCheck : live.promiseCheck} settleCheck={demoOn ? sim.settleCheck : live.settleCheck}
                />
              ) : leftTab === 'billing' ? (
                <BillingPanel jobs={allJobs} today={today} settings={settings} onSaveSettings={billing.save}
                  onSend={sendStatements} onPrint={printStatements} openCustomer={key => setCustomerKey(key)} assumeSentBefore={assumeSentBefore} />
              ) : (
                <LawnsPanel bare jobs={jobs} markPaid={markPaid} today={today} settings={settings} openCustomer={key => setCustomerKey(key)} />
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
              {!collapsed.routes && routeTechs.length > 0 && (
                <span className="print-menu">
                  <button type="button" className="btn-ghost head-btn" onClick={() => setPrintMenu(m => !m)} aria-expanded={printMenu} title="Print invoices to leave at the door, for customers billed each visit">🖨 Door invoices</button>
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
                  onPickCustomer={key => setCustomerKey(key)}
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
