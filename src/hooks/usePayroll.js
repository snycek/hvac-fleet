import { useCallback, useEffect, useMemo, useState } from 'react';
import { addDays } from '../lib/dates.js';

const mondayOf = date => { const d = new Date(`${date}T12:00:00`); return addDays(date, -((d.getDay() + 6) % 7)); };

// Crew roster + payroll settings. Live mode talks to the server; demo mode keeps a
// made-up crew (2 cutters per foreman — a typical 3-person mowing crew) and the owner's edits in memory only.

const FIRST = ['Jose', 'Kyle', 'Andre', 'Tyler', 'Luis', 'Brandon', 'Marco', 'Devin', 'Ricky', 'Shawn', 'Eddie', 'Nate', 'Omar', 'Cody', 'Trey', 'Hector', 'Jake', 'Dante', 'Gabe', 'Vince', 'Pedro', 'Sal', 'Ivan', 'Rudy', 'Ty'];
const LAST = ['Ramirez', 'Kowalski', 'Hill', 'Brooks', 'Mendoza', 'Price', 'Rossi', 'Grant', 'Flores', 'Wade', 'Nguyen', 'Shaw', 'Haddad', 'Lane', 'Ortiz', 'Cruz', 'Reed', 'Webb', 'Soto', 'Kane', 'Diaz', 'Pruitt', 'Vega', 'Lund', 'Moss'];
export const CUTTERS_PER_CREW = 2; // 5 made labor cost more than the lawns billed

// Same crew every time for a given demo foreman.
function demoCrew(foreman, index) {
  // Plow trucks: just the driver.
  if (foreman.kind === 'plow') return [{ id: `demo-emp-${foreman.id}`, name: foreman.name, role: 'foreman', crewId: foreman.id, rate: 26, active: true }];
  return [
    { id: `demo-emp-${foreman.id}`, name: foreman.name, role: 'foreman', crewId: foreman.id, rate: 24, active: true },
    ...Array.from({ length: CUTTERS_PER_CREW }, (_, i) => {
      const n = index * CUTTERS_PER_CREW + i;
      return { id: `demo-emp-${foreman.id}-c${i}`, name: `${FIRST[n % FIRST.length]} ${LAST[(n * 7) % LAST.length]}`, role: 'cutter', crewId: foreman.id, rate: 15 + ((n * 3) % 5), active: true };
    }),
  ];
}

async function send(url, method, body) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (HTTP ${res.status})`);
  return data;
}

// today (demo calendar): every week before this one counts as paid that Friday, by check.
export function usePayroll({ demo = false, foremen = [], today } = {}) {
  // ---- live ----
  const [liveEmployees, setLiveEmployees] = useState([]);
  const [liveSettings, setLiveSettings] = useState({ hours: {}, paid: {}, payRain: false });
  useEffect(() => {
    if (demo) return undefined;
    let cancelled = false;
    const load = async () => {
      try {
        const [emps, pay] = await Promise.all([fetch('/api/employees').then(r => r.json()), fetch('/api/payroll').then(r => r.json())]);
        if (!cancelled) { setLiveEmployees(Array.isArray(emps) ? emps : []); setLiveSettings(pay || {}); }
      } catch { /* offline */ }
    };
    const first = setTimeout(load, 0);
    const id = setInterval(load, 15000);
    return () => { cancelled = true; clearTimeout(first); clearInterval(id); };
  }, [demo]);

  // ---- demo ----
  const [demoState, setDemoState] = useState({ edits: {}, added: [], hours: {}, paid: {}, payRain: false });
  const foremanKey = foremen.map(f => f.id).join(',');
  const demoEmployees = useMemo(() => {
    const crewIds = new Set(foremen.map(f => f.id));
    return [...foremen.flatMap(demoCrew), ...demoState.added]
      .map(e => ({ ...e, ...demoState.edits[e.id] }))
      .filter(e => crewIds.has(e.crewId));
    // foremanKey covers foremen changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foremanKey, demoState.edits, demoState.added]);

  // Demo: the crew is paid every Friday (paycheck numbers run in order), so each
  // person's pay history has real stubs. This week stays open until the owner pays it.
  const thisMonday = demo && today ? mondayOf(today) : null;
  const demoPaidWeeks = useMemo(() => {
    const paid = {};
    const paidChecks = {};
    if (!thisMonday) return { paid, paidChecks };
    let check = 2001;
    for (let w = 26; w >= 1; w--) {
      const monday = addDays(thisMonday, -7 * w);
      for (const e of demoEmployees) {
        const key = `${e.id}@${monday}`;
        paid[key] = `${addDays(monday, 4)}T16:30:00`;
        paidChecks[key] = String(check++);
      }
    }
    return { paid, paidChecks };
  }, [thisMonday, demoEmployees]);

  const employees = demo ? demoEmployees : liveEmployees;
  // The owner's own taps (paid, or undone = false) win over the automatic Fridays.
  const settings = useMemo(() => {
    if (!demo) return liveSettings;
    const paid = { ...demoPaidWeeks.paid, ...demoState.paid };
    for (const k of Object.keys(paid)) if (!paid[k]) delete paid[k];
    return { ...demoState, paid, paidChecks: demoPaidWeeks.paidChecks };
  }, [demo, liveSettings, demoState, demoPaidWeeks]);

  const addEmployee = useCallback(async (emp) => {
    if (demo) {
      setDemoState(s => ({ ...s, added: [...s.added, { id: `demo-emp-new-${Date.now()}`, role: 'cutter', active: true, rate: 15, ...emp }] }));
      return;
    }
    const created = await send('/api/employees', 'POST', emp);
    setLiveEmployees(list => [...list, created]);
  }, [demo]);

  const updateEmployee = useCallback(async (id, patch) => {
    if (demo) {
      setDemoState(s => ({ ...s, edits: { ...s.edits, [id]: { ...s.edits[id], ...patch } } }));
      return;
    }
    const updated = await send(`/api/employees/${id}`, 'PUT', patch);
    setLiveEmployees(list => list.map(e => (e.id === id ? updated : e)));
  }, [demo]);

  // hours = null clears the owner's edit (back to the truck's time).
  const setHours = useCallback(async (empId, date, hours) => {
    const key = `${empId}@${date}`;
    if (demo) {
      setDemoState(s => {
        const next = { ...s.hours };
        if (hours === null) delete next[key]; else next[key] = Math.max(0, Math.min(24, Math.round(Number(hours) * 4) / 4 || 0));
        return { ...s, hours: next };
      });
      return;
    }
    setLiveSettings(await send('/api/payroll/hours', 'PUT', { empId, date, hours }));
  }, [demo]);

  const setPaid = useCallback(async (weekStart, empIds, paid = true) => {
    if (demo) {
      const at = new Date().toISOString();
      setDemoState(s => {
        const next = { ...s.paid };
        // false (not delete) so an undone week isn't paid again by the automatic Fridays.
        for (const id of empIds) next[`${id}@${weekStart}`] = paid ? at : false;
        return { ...s, paid: next };
      });
      return;
    }
    setLiveSettings(await send('/api/payroll/paid', 'PUT', { weekStart, empIds, paid }));
  }, [demo]);

  const setPayRain = useCallback(async (payRain) => {
    if (demo) { setDemoState(s => ({ ...s, payRain })); return; }
    setLiveSettings(await send('/api/payroll/settings', 'PUT', { payRain }));
  }, [demo]);

  return { employees, settings, addEmployee, updateEmployee, setHours, setPaid, setPayRain };
}
