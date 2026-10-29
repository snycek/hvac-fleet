import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import demo from '../data/demoAllenParkWeek.json';
import plowData from '../data/demoPlowLots.json';
import yardLink from '../data/yardConnector.json';
import { addDays, todayString } from '../lib/dates.js';
import { lawnKey } from '../lib/lawns.js';
import { areaSqFt, estimatePrice } from '../lib/zones.js';
import { bestInsertion, rankRoutes } from '../lib/routeFit.js';
import { applyPaymentResult, promiseCheck, settleCheck, simulateCardCharge, voidPayment } from '../lib/payments.js';
import { headsUpRecord, wantsHeadsUp } from '../lib/notify.js';
import { COMPANY_INFO } from '../data/services.js';
import { cleanItems, demoQuoteHash, offerTotal, quoteMessage } from '../lib/landscape.js';
import { isLandscapingJob } from '../lib/crews.js';
import { SITE_CHECK, newChecks } from '../lib/siteCheck.js';
import { newNote } from '../lib/crewNotes.js';

// Owner demo: two trucks working ZIP 48101 on a weekly cycle (Mon–Fri, 16 lawns
// per truck per day). Each truck drives real road paths "En Route", switches to
// "Cutting" inside GEOFENCE_M of the lawn, then marks it cut with a "+$40" pill.
// After both trucks park, the next workday starts; Friday rolls into next Monday.
// Customers pay a few days after their cut, and gas/maintenance get logged, so the
// weekly and monthly P/L build up as the weeks go by.

const TICK_MS = 100;
const DRIVE_MPS = 160;       // meters of road per real second at 1×
const CUT_SECONDS = 3;       // on-screen cut time at 1×
const NIGHT_SECONDS = 1.2;   // pause between workdays at 1×
// Rain: every 5th workday showers roll through. Each foreman decides on their own to put
// their truck on Rain Delay — staggered from ~11:00, each lasting 1½–2½ hrs.
const RAIN_EVERY = 5;
const RAIN_START_HOUR = 11;
const SECONDS_PER_RAIN_HOUR = 8; // on-screen seconds per pretend hour of delay at 1× (same pace as cutting)
const rainPlan = (date, t) => ({
  start: at(date, RAIN_START_HOUR, (t * 13 + (hash(date) % 20)) % 50),  // 11:00–11:49
  minutes: 90 + (hash(`${date}#${t}`) % 5) * 15,                        // 90–150 min
});
const GEOFENCE_M = 30;
const BURST_MS = 3200;
export const SPEEDS = [1, 3, 10, 30];
const WORKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

const ALL_FOREMEN = [
  { id: 'demo-truck-1', name: 'Mike Ruiz', truckName: 'Truck 1' },
  { id: 'demo-truck-2', name: 'Tony Bianchi', truckName: 'Truck 2' },
  { id: 'demo-truck-3', name: 'Dee Carter', truckName: 'Truck 3' },
  { id: 'demo-truck-4', name: 'Sam Novak', truckName: 'Truck 4' },
  { id: 'demo-truck-5', name: 'Rico Alvarez', truckName: 'Truck 5' },
];
// How many trucks the route data supports (each has its own territory every weekday).
export const MAX_TRUCKS = Math.min(ALL_FOREMEN.length, Math.max(...demo.routes.map(r => r.truck)) + 1);
const FOREMEN = ALL_FOREMEN.slice(0, MAX_TRUCKS);

const lawnById = Object.fromEntries(demo.lawns.map(l => [l.id, l]));

// ---- Winter: 3 plow trucks, 10 commercial lots (made-up businesses on real lot shapes) ----
const PLOWS = [
  { id: 'demo-plow-1', name: 'Gus Petrov', truckName: 'Plow 1', kind: 'plow' },
  { id: 'demo-plow-2', name: 'Walt Kozak', truckName: 'Plow 2', kind: 'plow' },
  { id: 'demo-plow-3', name: 'Bo Jensen', truckName: 'Plow 3', kind: 'plow' },
];
const lotById = Object.fromEntries(plowData.lots.map(l => [l.id, l]));

// ---- Landscaping: one truck (foreman + General Labor) doing 1–2 projects a day ----
const LAND = { id: 'demo-land-1', name: 'Carlos Mendez', truckName: 'Landscape 1', kind: 'landscape' };
const LAND_SECONDS = 12;      // on-screen work time per project at 1× (a cut is 3)
const landMinutes = key => 150 + (hash(`${key}%`) % 7) * 20; // 2½–4½ hrs on site
const LAND_PLANS = [
  { label: 'Front beds redone: fresh mulch + new shrubs', items: [['Mulch, 6 yards', 360], ['Shrubs ×4', 280], ['Labor', 420]] },
  { label: 'New sod in the back yard', items: [['Sod, 1,200 sq ft', 900], ['Grading & prep', 350], ['Labor', 480]] },
  { label: 'Stone edging + river rock beds', items: [['Stone edging', 540], ['River rock', 310], ['Labor', 380]] },
  { label: 'Cleanup + fresh mulch', items: [['Bed cleanup', 180], ['Mulch, 4 yards', 240], ['Haul away', 95]] },
];
// One project job at an existing customer's house (quoted and accepted two weeks back).
function landJob(lawn, date) {
  const id = `land-${lawn.id}@${date}`;
  const plan = LAND_PLANS[hash(id) % LAND_PLANS.length];
  const items = plan.items.map(([label, base]) => ({ label, amount: base + (hash(id + label) % 8) * 25 }));
  const total = items.reduce((s, i) => s + i.amount, 0);
  return {
    ...baseJob(lawn), id, lawnId: null, service: 'Landscaping', requested: ['Landscaping'],
    assignedTo: LAND.id, earnings: total, repeatDays: 0, billing: 'visit', project: plan.label, // (not notes: those are the customer's own lawn notes)
    status: 'assigned', scheduledDate: date, createdAt: iso(at(addDays(date, -14), 9)),
    offer: { items, total, startDate: date, techId: LAND.id, answer: 'accepted', sentAt: iso(at(addDays(date, -15), 18)) },
  };
}
const landProjectsFor = date => {
  if (isWinter(date)) return [];
  const n = 1 + (hash(`landn${date}`) % 2);
  const picks = [...new Set(Array.from({ length: n }, (_, i) => demo.lawns[hash(`land${i}${date}`) % demo.lawns.length]))];
  return picks.map(l => landJob(l, date));
};
const NO_ROUTE = { stops: [], legs: [] };
// Today's landscaping stops, nearest-first from the shop (straight lines; roads fill in after).
function landRouteFor(jobs, date) {
  const left = jobs.filter(j => j.assignedTo === LAND.id && j.scheduledDate === date && !['completed', 'skipped', 'declined'].includes(j.status) && j.location);
  const order = [];
  let from = DEPOT_PT;
  while (left.length) {
    left.sort((a, b) => metersBetween([from.lat, from.lng], [a.location.lat, a.location.lng]) - metersBetween([from.lat, from.lng], [b.location.lat, b.location.lng]));
    const j = left.shift();
    order.push(j);
    from = j.location;
  }
  const landStops = Object.fromEntries(order.map(j => {
    const id = j.id.split('@')[0];
    return [id, { id, name: j.clientName, address: j.address, lat: j.location.lat, lng: j.location.lng, price: j.earnings }];
  }));
  const ids = order.map(j => j.id.split('@')[0]);
  if (!ids.length) return { landRoute: NO_ROUTE, landStops };
  const pts = [DEPOT_PT, ...ids.map(i => landStops[i]), DEPOT_PT];
  const legs = pts.slice(1).map((p, i) => straightLeg(pts[i], p, i < ids.length ? ids[i] : 'depot'));
  return { landRoute: { stops: ids, legs, date }, landStops };
}
function landGas(date) {
  const amount = 58 + (hash(`${date}land`) % 2400) / 100;
  return { id: `gas-land-${date}`, techId: LAND.id, category: 'gas', amount: Math.round(amount * 100) / 100, date, note: ['Speedway', 'Marathon', 'Shell'][hash(date + 'l') % 3], status: 'logged', hasReceipt: false };
}
// A sent quote the customer accepted: on the landscaping schedule from its start date
// (never before `from`; weekends roll to Monday).
function landAccepted(j, from, by, when) {
  let date = j.offer?.startDate && j.offer.startDate > from ? j.offer.startDate : from;
  const wd = (new Date(`${date}T12:00:00`).getDay() + 6) % 7;
  if (wd > 4) date = addDays(date, 7 - wd);
  return {
    ...j, id: `landq-${String(j.id).replace(/[^\w]/g, '').slice(-14)}@${date}`, status: 'assigned', assignedTo: LAND.id, scheduledDate: date,
    earnings: j.offer?.total ?? j.earnings, repeatDays: 0, billing: 'visit', acceptedAt: when,
    offer: { ...j.offer, answer: 'accepted', answeredAt: when, answeredBy: by },
  };
}
// A landscaping request waiting in the inbox when the demo starts (John prices it).
function demoLandQuote(weekStart) {
  const near = demo.lawns[57 % demo.lawns.length];
  const [num, ...rest] = near.address.split(' ');
  return {
    id: 'quote-land-1', service: 'Landscaping', requested: ['Landscaping'],
    clientName: 'Rosa Delgado', clientPhone: '(313) 555-3142', clientEmail: 'rosa.delgado@example.com', email: 'rosa.delgado@example.com',
    address: `${Number(num) + 14} ${rest.join(' ')}`, location: { lat: near.lat + 0.0004, lng: near.lng - 0.0003 },
    status: 'quote', assignedTo: null, earnings: 0,
    notes: 'Notes: Front beds are overgrown. Want them redone with fresh mulch, a few new shrubs, and stone edging along the walk.',
    createdAt: iso(at(weekStart, 7) - 30 * 3600000),
  };
}
export const LOTS = plowData.lots;
const PLOW_START_HOUR = 4;   // plows roll at 4 AM so lots are clear before opening
const plowMinutes = key => 20 + (hash(key) % 26); // 20–45 min per lot
// Winter = December through March: no mowing; it snows on about 1 workday in 3.
export const isWinter = date => [12, 1, 2, 3].includes(Number(date.slice(5, 7)));
// The first Monday of December always snows, so jumping to winter opens on plows at work.
export const isSnowDay = date => isWinter(date) && (hash(`snow${date}`) % 3 === 0 || (date.slice(5, 7) === '12' && date === winterStart(date)));
// First Monday on/after Dec 1 of the demo's year (or this winter, if we're in it).
export function winterStart(from = todayString()) {
  const y = Number(from.slice(5, 7)) <= 3 ? Number(from.slice(0, 4)) - 1 : Number(from.slice(0, 4));
  let d = `${y}-12-01`;
  while (new Date(`${d}T12:00:00`).getDay() !== 1) d = addDays(d, 1);
  return d;
}
const springStart = () => `${todayString().slice(0, 7)}-01`;
// The yard (Roosevelt & Allen). The saved routes start and end at an older spot about
// half a mile away, so the first leg gets the drive out of the yard and the last the drive back.
const DEPOT = [COMPANY_INFO.shop.lat, COMPANY_INFO.shop.lng];
const withYard = (leg, i) => {
  let { path, meters = 0, seconds = 0 } = leg;
  if (i === 0) {
    path = [...yardLink.toOld.path.slice(0, -1), ...path];
    meters += yardLink.toOld.meters; seconds += yardLink.toOld.seconds;
  }
  if (leg.to === 'depot') {
    path = [...path, ...yardLink.fromOld.path.slice(1)];
    meters += yardLink.fromOld.meters; seconds += yardLink.fromOld.seconds;
  }
  return { ...leg, path, meters, seconds };
};

function metersBetween([lat1, lng1], [lat2, lng2]) {
  const R = 6371000;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ROUTES[day][truck] with cumulative meters per leg, to place a truck by distance driven.
const ROUTES = WORKDAYS.map((_, day) => FOREMEN.map((_, truck) => {
  const r = demo.routes.find(x => x.day === day && x.truck === truck);
  return {
    ...r,
    legs: r.legs.map(withYard).map(leg => {
      const cum = [0];
      for (let i = 1; i < leg.path.length; i++) cum.push(cum[i - 1] + metersBetween(leg.path[i - 1], leg.path[i]));
      return { ...leg, cum, length: cum[cum.length - 1] };
    }),
  };
}));

const PLOW_ROUTES = plowData.routes.map(r => ({
  ...r,
  legs: r.legs.map(withYard).map(leg => {
    const cum = [0];
    for (let i = 1; i < leg.path.length; i++) cum.push(cum[i - 1] + metersBetween(leg.path[i - 1], leg.path[i]));
    return { ...leg, cum, length: cum[cum.length - 1] };
  }),
}));

// Vehicles in a world: lawn trucks first (truckCount of them), then the plows, then the
// landscaping truck.
const isPlow = (w, t) => t >= w.truckCount && t < w.truckCount + PLOWS.length;
const isLand = (w, t) => t === w.truckCount + PLOWS.length;
const driverOf = (w, t) => (isLand(w, t) ? LAND : isPlow(w, t) ? PLOWS[t - w.truckCount] : FOREMEN[t]);
// Accepted quotes change a weekday route from a date on: custom[`${day}:${truck}`] =
// [{ from, route }] (the latest one in effect wins). New lawns live in w.extraLawns.
// An entry with `only` is a one-time change for that date (a lawn moved just this once).
// Otherwise the entry with the latest `from` on/before the date wins (ties: newest).
const regularRoute = (list, day, truck, date) => {
  let best = null;
  for (const e of list) if (!e.only && date >= e.from && (!best || e.from >= best.from)) best = e;
  return best ? best.route : ROUTES[day][truck];
};
const routeFor = (custom, day, truck, date) => {
  const list = custom?.[`${day}:${truck}`] || [];
  for (let i = list.length - 1; i >= 0; i--) if (list[i].only === date) return list[i].route;
  return regularRoute(list, day, truck, date);
};
const routeOf = (w, t) => (isLand(w, t) ? w.landRoute || NO_ROUTE : isPlow(w, t) ? PLOW_ROUTES[t - w.truckCount] : routeFor(w.custom, w.day, t, addDays(w.weekStart, w.day)));
const stopById = (id, w) => lawnById[id] || w?.extraLawns?.[id] || lotById[id] || w?.landStops?.[id];
const DEPOT_PT = { lat: DEPOT[0], lng: DEPOT[1] };

// A straight-line leg (used until the real road path comes back).
function straightLeg(a, b, to) {
  const path = [[a.lat, a.lng], [b.lat, b.lng]];
  const m = metersBetween(path[0], path[1]);
  return { to, meters: Math.round(m), seconds: Math.round(m / 8), path, cum: [0, m], length: m, straight: true };
}
// Take a stop out of a route (the truck drives straight from the stop before to the one after).
function removeStop(route, id, w) {
  const i = route.stops.indexOf(id);
  if (i < 0) return route;
  const pt = s => (s === 'depot' ? DEPOT_PT : stopById(s, w));
  const prev = i === 0 ? DEPOT_PT : pt(route.stops[i - 1]);
  const nextId = route.legs[i + 1].to;
  const stops = route.stops.filter(s => s !== id);
  const legs = [...route.legs];
  legs.splice(i, 2, straightLeg(prev, pt(nextId), nextId));
  return { ...route, stops, legs };
}
// Put a lawn at its cheapest spot in a route (or at index, if given).
function addStop(route, lawn, w, index = null) {
  if (route.stops.includes(lawn.id)) return route;
  const at = index ?? bestInsertion(route.stops.map(s => ({ id: s, ...stopById(s, w) })), DEPOT_PT, lawn).index;
  return insertStop(route, lawn, Math.min(at, route.stops.length), w);
}
// Change one weekday route from a date on: later changes get the same edit, so nothing stacks wrong.
function editFrom(custom, key, from, edit) {
  const [d, t] = key.split(':').map(Number);
  const list = custom?.[key] || [];
  const later = list.map(e => ((e.only ? e.only >= from : e.from > from) ? { ...e, route: edit(e.route) } : e));
  return { ...custom, [key]: [...later, { from, route: edit(regularRoute(list, d, t, from)) }] };
}
// Change one weekday route on one date only.
function editOnly(custom, key, date, edit) {
  const [d, t] = key.split(':').map(Number);
  return { ...custom, [key]: [...(custom?.[key] || []), { only: date, route: edit(routeFor(custom, d, t, date)) }] };
}

// Put a lawn into a route before stops[index] (index === stops.length → last stop).
function insertStop(route, lawn, index, w) {
  const pt = id => (id === 'depot' ? DEPOT_PT : stopById(id, w));
  const prev = index === 0 ? DEPOT_PT : pt(route.stops[index - 1]);
  const nextId = route.legs[index].to;
  const stops = [...route.stops];
  stops.splice(index, 0, lawn.id);
  const legs = [...route.legs];
  legs.splice(index, 1, straightLeg(prev, lawn, lawn.id), straightLeg(lawn, pt(nextId), nextId));
  return { ...route, stops, legs };
}
// Real road path for one leg (public OSRM); null if it can't be reached.
async function roadLeg(a, b, to) {
  try {
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`);
    const data = await res.json();
    const r = data.routes?.[0];
    if (!r) return null;
    const path = r.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    path.push([b.lat, b.lng]);
    const cum = [0];
    for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + metersBetween(path[i - 1], path[i]));
    return { to, meters: Math.round(r.distance), seconds: Math.round(r.duration), path, cum, length: cum[cum.length - 1] };
  } catch {
    return null;
  }
}

function pointAlong(leg, meters) {
  if (meters <= 0) return leg.path[0];
  if (meters >= leg.length) return leg.path[leg.path.length - 1];
  let i = 1;
  while (leg.cum[i] < meters) i++;
  const t = (meters - leg.cum[i - 1]) / (leg.cum[i] - leg.cum[i - 1] || 1);
  const [a, b] = [leg.path[i - 1], leg.path[i]];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

const iso = ms => new Date(ms).toISOString();
const at = (dateString, h, m = 0) => { const d = new Date(`${dateString}T00:00:00`); d.setHours(h, m, 0, 0); return d.getTime(); };
const hash = s => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 100003; return h; };
const mondayOf = dateString => addDays(dateString, -((new Date(`${dateString}T12:00:00`).getDay() + 6) % 7));

// Most customers pay 1–5 days after the cut; about 1 in 12 takes ~2 weeks.
// Most customers pay 1–5 days after the cut; ~1 in 12 takes about 2 weeks; and a few
// "slow accounts" (about 1 in 25 lawns) go 45–70 days, so the 30-day ⚠️ shows up.
const slowAccount = key => hash(key.split('@')[0]) % 25 === 0;
const payDelay = key => (slowAccount(key) ? 45 + (hash(key) % 26) : hash(key) % 12 === 0 ? 11 + (hash(key) % 4) : 1 + (hash(key) % 5));
// How a customer pays: ~55% card, 25% cash, 20% check. ~1 in 14 card payments gets
// declined the first time (insufficient funds) and goes through on a retry 2 days later.
const payMethodFor = key => { const h = hash(key.split('@')[0]) % 20; return h < 11 ? 'card' : h < 16 ? 'cash' : 'check'; };
const CARD_LAST4 = ['4242', '4444', '0005', '1117'];
const cardFor = key => CARD_LAST4[hash(key.split('@')[0]) % CARD_LAST4.length];
const declinesFirst = key => hash(`${key}!`) % 14 === 0;

const cutMinutes = key => 16 + (hash(key) % 15); // 16–30 min per residential lawn
// About 1 stop in 45 gets skipped when the crew pulls up.
const skipFor = key => (hash(`${key}~`) % 45 === 0 ? (hash(`${key}^`) % 2 ? 'Customer asked' : 'Gate locked / no access') : null);

// Standard outlines for demo customers (as if they'd outlined them on the website):
// lawns get a front and back yard box sized to their price ($5 per 500 sq ft);
// plow lots use their real parking-lot shape. Cached so every visit shares one copy.
const outlineCache = new Map();
function lawnOutline(lawn) {
  if (outlineCache.has(lawn.id)) return outlineCache.get(lawn.id);
  const total = Math.max(1200, Math.round((lawn.price / 5) * 500 - (hash(lawn.id) % 400)));
  const front = Math.round(total * (0.35 + (hash(`${lawn.id}f`) % 15) / 100));
  const back = total - front;
  const mLat = 1 / 111320;
  const mLng = 1 / (111320 * Math.cos((lawn.lat * Math.PI) / 180));
  const box = (name, color, sqFt, top) => {
    const w = 18; // meters wide (a typical lot)
    const h = sqFt / 10.7639 / w;
    const t0 = lawn.lat + top * mLat;
    const b0 = t0 - h * mLat;
    const l0 = lawn.lng - (w / 2) * mLng;
    const r0 = lawn.lng + (w / 2) * mLng;
    return { name, color, sqFt, points: [[t0, l0], [t0, r0], [b0, r0], [b0, l0]] };
  };
  const frontH = front / 10.7639 / 18;
  const zones = [
    box('Front Yard', '#4ade80', front, frontH / 2),           // centered on the address
    box('Back Yard', '#38bdf8', back, -(frontH / 2 + 12)),     // behind the house (~12 m)
  ];
  const quote = { totalSqFt: total, estimate: lawn.price, wanted: ['Lawn Cutting'], center: { lat: lawn.lat, lng: lawn.lng }, zones };
  outlineCache.set(lawn.id, quote);
  return quote;
}
function lotOutline(lot) {
  const key = `lot:${lot.id}`;
  if (!outlineCache.has(key)) {
    outlineCache.set(key, { totalSqFt: lot.sqFt, estimate: null, wanted: ['Snow Removal'], center: { lat: lot.lat, lng: lot.lng }, zones: [{ name: 'Parking Lot', color: '#38bdf8', sqFt: lot.sqFt, points: lot.ring }] });
  }
  return outlineCache.get(key);
}

// Demo contact preferences: most customers get texts; every 4th prefers email, every
// 9th wants paper (made-up example.com addresses, never real ones).
const demoEmail = name => `${String(name).toLowerCase().replace(/[^a-z ]/g, '').trim().replace(/ +/g, '.')}@example.com`;
function demoContact(n, name) {
  const otw = n % 3 === 0 ? { notifyArrival: true } : {}; // about 1 in 3 wants an on-the-way text
  if (n % 9 === 0) return { contactPref: 'paper', ...otw };
  if (n % 4 === 0) return { clientEmail: demoEmail(name), contactPref: 'email', ...otw };
  return otw;
}

function baseJob(lawn) {
  return {
    service: 'Lawn Cutting',
    clientName: lawn.name,
    clientPhone: `(313) 555-${String(1000 + Number(lawn.id.slice(3))).slice(-4)}`,
    ...demoContact(Number(lawn.id.slice(3)), lawn.name),
    address: lawn.address,
    location: { lat: lawn.lat, lng: lawn.lng },
    assignedTo: FOREMEN[lawn.truck].id,
    earnings: lawn.price,
    repeatDays: 7,
    lawnId: lawn.id,
    ...(lawn.notifyArrival ? { notifyArrival: true } : {}),
    ...(lawn.quote ? { quote: lawn.quote, notes: lawn.notes, requested: lawn.requested } : { quote: lawnOutline(lawn) }),
  };
}

function lotJob(lot) {
  return {
    service: 'Snow Removal',
    kind: 'plow',
    clientName: lot.name,
    clientPhone: `(313) 555-${String(2000 + Number(lot.id.slice(4))).slice(-4)}`,
    clientEmail: `billing@${String(lot.name).toLowerCase().replace(/[^a-z]+/g, '')}.example.com`,
    contactPref: 'email',
    address: lot.address,
    location: { lat: lot.lat, lng: lot.lng },
    assignedTo: PLOWS[lot.truck].id,
    earnings: lot.price,
    repeatDays: 0,
    perSnowfall: true,
    lotId: lot.id,
    quote: lotOutline(lot),
  };
}

// Demo crew: about 1 stop in 30, the foreman sends the owner a message.
const DEMO_NOTES = [
  ['missed', 'The strip behind the shed isn\'t on the outline, about 400 sq ft more. Cut it anyway.'],
  ['request', 'Customer asked us to bag the clippings from now on.'],
  ['access', 'Back gate was locked. Cut the front only.'],
  ['damage', 'Sprinkler head by the driveway is broken (was like that when we got here).'],
  ['missed', 'Side yard on the north side is grass now, not beds. Should go on the quote.'],
];
const demoNoteFor = (key, by, at) => {
  if (hash(`${key}✉`) % 30 !== 0) return null;
  const [kind, text] = DEMO_NOTES[hash(`${key}✉✉`) % DEMO_NOTES.length];
  return newNote({ kind, text, by }, at);
};

// Demo crew: answers the owner's questions when the truck reaches the stop.
function demoAnswer(c, key) {
  const pick = (opts) => opts[hash(`${key}${c.id}`) % opts.length];
  const q = c.q.toLowerCase();
  const [answer, note] = /mower|gate/.test(q) ? pick([['no', 'Side gate is 32 in. Back yard needs the 21-inch push mower.'], ['yes', 'Gate is 48 in, the 36 fits fine.']])
    : /outline/.test(q) ? pick([['yes', 'Matches, except a flower bed by the patio.'], ['no', 'Back yard is bigger: it runs past the shed to the alley.']])
      : /dog|locked|access/.test(q) ? pick([['yes', 'Dog in the back yard; they keep it inside on cut days.'], ['no', 'Open gate, no dog.']])
        : /back yard/.test(q) ? pick([['unsure', 'About half grass, half beds and trees.'], ['yes', 'Mostly grass.']])
          : /hill|ditch|soft/.test(q) ? pick([['no', 'Flat lot.'], ['yes', 'Soft spot by the downspout; skip it after rain.']])
            : pick([['yes', 'Looks fine.'], ['unsure', 'Owner wasn\'t home to ask.']]);
  return { ...c, answer, note, by: 'Crew', at: new Date().toISOString() };
}

// Today's list: every lawn on this weekday's routes (not in winter), plus every
// plow lot when it snows.
function jobsForDay(date, day, trucks, w = null) {
  const lawns = isWinter(date) ? [] : Array.from({ length: trucks }, (_, t) => routeFor(w?.custom, day, t, date)).flatMap((route, t) => route.stops.map(id => ({
    ...baseJob(stopById(id, w)),
    ...(w?.prefs?.[id] || {}),
    ...(w?.crewQs?.[id] ? { checks: w.crewQs[id] } : {}),
    assignedTo: FOREMEN[t].id,
    id: `${id}@${date}`,
    status: 'assigned',
    scheduledDate: date,
    createdAt: iso(at(date, 6)),
  })));
  const lots = isSnowDay(date) ? PLOW_ROUTES.flatMap(route => route.stops.map(id => ({
    ...lotJob(lotById[id]),
    ...(w?.prefs?.[id] || {}),
    id: `${id}@${date}`,
    status: 'assigned',
    scheduledDate: date,
    createdAt: iso(at(date, 3)),
  }))) : [];
  const projects = landProjectsFor(date).filter(p => !w?.jobs?.some(j => j.id === p.id));
  return [...lawns, ...lots, ...projects];
}

function gasFill(truckIndex, date) {
  const amount = 52 + (hash(`${date}${truckIndex}`) % 2300) / 100;
  return { id: `gas-${truckIndex}-${date}`, techId: FOREMEN[truckIndex].id, category: 'gas', amount: Math.round(amount * 100) / 100, date, note: ['Speedway', 'Marathon', 'Shell'][hash(date) % 3], status: 'logged', hasReceipt: false };
}
function plowGas(i, date) {
  const amount = 48 + (hash(`${date}p${i}`) % 2600) / 100;
  return { id: `gas-plow-${i}-${date}`, techId: PLOWS[i].id, category: 'gas', amount: Math.round(amount * 100) / 100, date, note: ['Speedway', 'Marathon', 'Shell'][hash(date + i) % 3], status: 'logged', hasReceipt: false };
}
function maintenance(date, trucks = 2) {
  const amount = 85 + (hash(date) % 60);
  return { id: `maint-${date}`, techId: FOREMEN[hash(date) % Math.max(1, trucks)].id, category: 'maintenance', amount, date, note: ['Blades + oil', 'New belt', 'Tire patch + blades'][hash(date) % 3], status: 'logged', hasReceipt: false };
}

// Six weeks before the demo starts: cuts (paid if their pay day already passed), gas, maintenance.
function history(weekStart, trucks) {
  const jobs = [];
  const expenses = [];
  const delays = [];
  const shifts = [];
  for (let w = 6; w >= 1; w--) {
    const monday = addDays(weekStart, -7 * w);
    for (let day = 0; day < 5; day++) {
      const date = addDays(monday, day);
      // Past rain days line up with the demo's rule (every 5th workday = Friday).
      const rained = day === RAIN_EVERY - 1;
      if (isSnowDay(date)) {
        PLOW_ROUTES.forEach((route, p) => {
          let last = at(date, PLOW_START_HOUR, p * 10);
          route.stops.forEach((id, i) => {
            const key = `${id}@${date}`;
            const done = at(date, PLOW_START_HOUR, 30 + p * 10 + i * 40);
            last = done;
            const payOn = addDays(date, payDelay(key));
            const paid = payOn < weekStart;
            jobs.push({
              ...lotJob(lotById[id]), id: key, status: 'completed', scheduledDate: date,
              startedAt: iso(done - plowMinutes(key) * 60000), completedAt: iso(done),
              payOn, paid, paidAt: paid ? iso(at(payOn, 10)) : null, paymentMethod: paid ? payMethodFor(key) : null,
            });
          });
          expenses.push(plowGas(p, date));
          shifts.push({ techId: PLOWS[p].id, date, start: iso(at(date, PLOW_START_HOUR, p * 10)), end: iso(last + 20 * 60000) });
        });
      }
      if (isWinter(date)) continue;
      ROUTES[day].slice(0, trucks).forEach((route, t) => {
        let last = at(date, 8, t * 10);
        const plan = rainPlan(date, t);
        if (rained) {
          delays.push({ id: `rain-${t}-${date}`, techId: FOREMEN[t].id, reason: 'rain', date, start: iso(plan.start), end: iso(plan.start + plan.minutes * 60000), minutes: plan.minutes });
        }
        route.stops.forEach((id, i) => {
          const key = `${id}@${date}`;
          let done = at(date, 8, 25 + t * 10 + i * 26);
          if (rained && done >= plan.start) done += plan.minutes * 60000;
          last = done;
          const payOn = addDays(date, payDelay(key));
          const paid = payOn < weekStart;
          jobs.push({
            ...baseJob(lawnById[id]),
            id: key,
            status: 'completed',
            scheduledDate: date,
            startedAt: iso(done - cutMinutes(key) * 60000),
            completedAt: iso(done),
            payOn,
            paid,
            paidAt: paid ? iso(at(payOn, 10)) : null,
            paymentMethod: paid ? payMethodFor(key) : null,
          });
        });
        if (day === 2 || day === 4) expenses.push(gasFill(t, date));
        shifts.push({ techId: FOREMEN[t].id, date, start: iso(at(date, 8, t * 10)), end: iso(last + 25 * 60000) });
      });
      // The landscaping crew's projects that day.
      let landEnd = at(date, 7, 30);
      landProjectsFor(date).forEach(p => {
        const startedAt = landEnd + 25 * 60000;
        landEnd = startedAt + landMinutes(p.id) * 60000;
        const payOn = addDays(date, payDelay(p.id));
        const paid = payOn < weekStart;
        jobs.push({ ...p, status: 'completed', startedAt: iso(startedAt), completedAt: iso(landEnd), payOn, paid, paidAt: paid ? iso(at(payOn, 10)) : null, paymentMethod: paid ? payMethodFor(p.id) : null });
      });
      if (landEnd > at(date, 7, 30)) {
        shifts.push({ techId: LAND.id, date, start: iso(at(date, 7, 30)), end: iso(landEnd + 30 * 60000) });
        if (day === 2 || day === 4) expenses.push(landGas(date));
      }
      if (day === 0 && Number(date.slice(8)) <= 7) expenses.push(maintenance(date, trucks));
    }
  }
  return { jobs, expenses, delays, shifts };
}

// Lawn trucks start at 8 (parked all winter); plows start at 4 AM on snow days only.
// The landscaping truck rolls at 7:30 when it has a project that day.
const freshTrucks = (date, trucks, landStops = 0) => [
  ...FOREMEN.slice(0, trucks).map((_, t) => ({ leg: 0, meters: 0, phase: isWinter(date) ? 'done' : 'idle', cutLeft: 0, clock: at(date, 8, t * 10) })),
  ...PLOWS.map((_, p) => ({ leg: 0, meters: 0, phase: isSnowDay(date) ? 'idle' : 'done', cutLeft: 0, clock: at(date, PLOW_START_HOUR, p * 10) })),
  { leg: 0, meters: 0, phase: landStops > 0 ? 'idle' : 'done', cutLeft: 0, clock: at(date, 7, 30) },
];
// Who's working today: on-duty drivers show Available, the rest Off.
const crewFor = (date, trucks) => [
  ...FOREMEN.slice(0, trucks).map(f => ({ ...f, status: isWinter(date) ? 'offline' : 'available' })),
  ...PLOWS.map(p => ({ ...p, status: isSnowDay(date) ? 'available' : 'offline' })),
  { ...LAND, status: isWinter(date) ? 'offline' : 'available' },
];
// Frame the whole ZIP so the boundary is visible.
const BOUNDS = [
  [Math.min(...demo.zipOutline.map(p => p[0])), Math.min(...demo.zipOutline.map(p => p[1]))],
  [Math.max(...demo.zipOutline.map(p => p[0])), Math.max(...demo.zipOutline.map(p => p[1]))],
];
const OUTLINE = { ring: demo.zipOutline, label: `ZIP ${demo.zip}` };

const depotPositions = (trucks = MAX_TRUCKS) => Array.from({ length: trucks + PLOWS.length + 1 }, () => ({ lat: DEPOT[0], lng: DEPOT[1] }));

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
// Next date of weekday d after the demo's today (never today's route already running).
const nextDateFor = (w, d) => addDays(w.weekStart, d > w.day ? d : d + 7);

// New customers who just asked for a quote (outlined their yard on the website).
const QUOTE_SEEDS = [
  // The first one (the walkthrough's): a big church property on Reeck Rd, its grass traced
  // from the satellite photo: the field out back, the lawns north and south of the lot,
  // and the strip along Reeck. (Made-up church name; real lot shape.)
  {
    name: 'Reeck Road Community Church', hoursAgo: 3,
    notes: 'Please mow Fridays so it looks sharp for Sunday. The field out back too.',
    place: {
      address: '10080 Reeck Rd, Allen Park, MI 48101', lat: 42.23458, lng: -83.22115,
      // As if the customer used ✨ auto-outline: what it flagged for John.
      outline: { auto: true, edited: false, warnings: ['South lawn edge runs under a row of trees; the grass under them isn\'t outlined.', 'West side of the back field has no clear lot line; check where the property ends.'] },
      // Big open areas mow fast: a flat per-cut price (the per-sq-ft house formula would say ~$1,600).
      price: 225,
      zones: [
        { name: 'Back Field', points: [[42.235017, -83.22265], [42.235003, -83.22175], [42.2342, -83.22175], [42.234192, -83.22263]] },
        { name: 'North Lawn', points: [[42.234995, -83.221725], [42.235017, -83.22095], [42.234567, -83.22094], [42.234552, -83.221725]] },
        { name: 'Front Lawn', points: [[42.234837, -83.2203], [42.234837, -83.21995], [42.234219, -83.21995], [42.234219, -83.2203]] },
        { name: 'South Lawn', points: [[42.23423, -83.221725], [42.234237, -83.22045], [42.234088, -83.220525], [42.233908, -83.2209], [42.233938, -83.2217]] },
      ],
    },
  },
  { near: 'wk-170', dLat: -0.0005, dLng: 0.0007, name: 'Victor Salazar', bump: 22, notes: '', zones: [['Front Yard', 2100], ['Back Yard', 1900]], hoursAgo: 20 },
  { near: 'wk-330', dLat: 0.0004, dLng: -0.0006, name: 'Gwen Albrecht', bump: -30, notes: 'Please skip the flower bed by the porch.', zones: [['Front Yard', 1800], ['Back Yard', 3300], ['Side Yard', 700]], hoursAgo: 44 },
];
const ZONE_TINTS = ['#4ade80', '#38bdf8', '#facc15', '#f472b6'];
// A quote on a real property with its grass areas traced (seed.place).
function quoteFromPlace(s, i, weekStart) {
  const { lat, lng, address } = s.place;
  const zones = s.place.zones.map((z, n) => ({ name: z.name, color: ZONE_TINTS[n % ZONE_TINTS.length], sqFt: Math.round(areaSqFt(z.points)), points: z.points }));
  const totalSqFt = zones.reduce((sum, z) => sum + z.sqFt, 0);
  const estimate = s.place.price ?? estimatePrice(totalSqFt);
  return {
    id: `quote-demo-${i + 1}`, service: 'Quote: Lawn Cutting', requested: ['Lawn Cutting'],
    clientName: s.name, clientPhone: `(313) 555-${String(3100 + i * 7).slice(-4)}`,
    address, location: { lat, lng }, status: 'quote', assignedTo: null, earnings: estimate,
    notes: `Measured ${totalSqFt.toLocaleString()} sq ft.${s.notes ? ` Notes: ${s.notes}` : ''}`,
    createdAt: iso(at(weekStart, 7) - s.hoursAgo * 3600000),
    quote: { totalSqFt, estimate, wanted: ['Lawn Cutting'], center: { lat, lng }, zones, ...(s.place.outline ? { outline: s.place.outline } : {}) },
  };
}

// One quote request for week weekStart: QUOTE_SEEDS[i], sent the evening before.
function demoQuote(i, weekStart) {
  return [QUOTE_SEEDS[i]].map(s => {
    if (s.place) return quoteFromPlace(s, i, weekStart);
    const near = lawnById[s.near];
    const lat = near.lat + s.dLat;
    const lng = near.lng + s.dLng;
    const [num, ...rest] = near.address.split(' ');
    const address = `${Number(num) + s.bump} ${rest.join(' ')}`;
    // Each zone a rectangle of about the right size, stacked front to back.
    const mLat = 1 / 111320;
    const mLng = 1 / (111320 * Math.cos((lat * Math.PI) / 180));
    let y = 0;
    const zones = s.zones.map(([name, sqFt], z) => {
      const w = 22; // meters wide
      const h = sqFt / 10.7639 / w;
      const top = lat + (12 - y) * mLat;
      const bottom = top - h * mLat;
      y += h + 3;
      const left = lng - (w / 2) * mLng;
      const right = lng + (w / 2) * mLng;
      return { name, color: ZONE_TINTS[z % ZONE_TINTS.length], sqFt, points: [[top, left], [top, right], [bottom, right], [bottom, left]] };
    });
    const totalSqFt = zones.reduce((sum, z) => sum + z.sqFt, 0);
    const estimate = estimatePrice(totalSqFt);
    return {
      id: `quote-demo-${i + 1}`,
      service: 'Quote: Lawn Cutting',
      requested: ['Lawn Cutting'],
      clientName: s.name,
      clientPhone: `(313) 555-${String(3100 + i * 7).slice(-4)}`,
      address,
      location: { lat, lng },
      status: 'quote',
      assignedTo: null,
      earnings: estimate,
      notes: `Measured ${totalSqFt.toLocaleString()} sq ft.${s.notes ? ` Notes: ${s.notes}` : ''}`,
      createdAt: iso(at(weekStart, 7) - s.hoursAgo * 3600000),
      quote: { totalSqFt, estimate, wanted: ['Lawn Cutting'], center: { lat, lng }, zones },
    };
  })[0];
}

// The demo starts on the Monday of the week holding the 1st of this month
// (or the first Monday of winter, when the owner jumps to winter).
// Checks take a few days to show up: a check "sent" this many days ago is still on the way.
const CHECK_DAYS = 2;
const checkHowFor = key => (hash(`${String(key).split('@')[0]}#`) % 3 === 0 ? 'crew' : 'mail'); // per customer
const checkNoFor = key => String(1000 + (hash(`${key}$`) % 9000));
// Customers who hand their check to the crew: the foreman has it until John clears it.
const crewHas = j => (checkHowFor(j.id) === 'crew' ? { collectedBy: ALL_FOREMEN.find(f => f.id === j.assignedTo)?.name || 'Crew' } : {});
function checksStillComing(jobs, today) {
  let out = jobs;
  for (const j of jobs) {
    if (!j.paid || j.paymentMethod !== 'check' || String(j.paidAt).slice(0, 10) < addDays(today, -CHECK_DAYS)) continue;
    const back = out.map(x => (x.id === j.id ? { ...x, paid: false, paidAt: null, paymentMethod: null } : x));
    out = promiseCheck(back, { jobIds: [j.id], how: checkHowFor(j.id), number: checkNoFor(j.id), at: j.paidAt, ...crewHas(j) }).jobs;
  }
  return out;
}

function initialWorld(withHistory = true, trucks = Math.min(2, MAX_TRUCKS), start = springStart()) {
  const weekStart = mondayOf(start);
  const raw = withHistory ? history(weekStart, trucks) : { jobs: [], expenses: [], delays: [], shifts: [] };
  const past = { ...raw, jobs: checksStillComing(raw.jobs, weekStart) };
  const startJobs = [...past.jobs, ...jobsForDay(weekStart, 0, trucks), demoQuote(0, weekStart), demoLandQuote(weekStart)];
  const land = landRouteFor(startJobs, weekStart);
  return {
    truckCount: trucks,
    start,
    weekStart,
    day: 0,
    week: 1,
    dayCount: 1, // workdays since the demo started (rain on every RAIN_EVERY-th)
    night: 0,
    delays: past.delays,
    payments: [],
    shifts: past.shifts,
    // New quote requests: one to start, then one more each new week, 3 in all.
    jobs: startJobs,
    ...land,
    quotesSent: 1,
    custom: {},
    extraLawns: {},
    expenses: past.expenses,
    technicians: crewFor(weekStart, trucks),
    trucks: freshTrucks(weekStart, trucks, land.landRoute.stops.length),
    lastEvent: '',
  };
}

// start: { playing, speed } for the first frame (the public /demo link opens already running).
export function useDemoSim(start = {}) {
  const [world, setWorld] = useState(() => initialWorld(true));
  const [positions, setPositions] = useState(() => depotPositions(Math.min(2, MAX_TRUCKS)));
  const [playing, setPlaying] = useState(!!start.playing);
  const [speed, setSpeed] = useState(start.speed || 3);
  const [cleared, setCleared] = useState(false);
  const [bursts, setBursts] = useState([]);
  const worldRef = useRef(world);
  const posRef = useRef(positions);
  const speedRef = useRef(speed);
  // The ref is the source of truth; every change writes it first, then React state.
  // (Syncing the ref from state after render let a demo tick overwrite an owner's
  // click, e.g. Retry card, with an older copy of the world.)
  const commitWorld = useCallback(next => { worldRef.current = next; setWorld(next); }, []);
  useEffect(() => { posRef.current = positions; }, [positions]);
  useEffect(() => { speedRef.current = speed; }, [speed]);

  const date = addDays(world.weekStart, world.day);

  useEffect(() => {
    if (!playing) return undefined;
    const id = setInterval(() => {
      const w = worldRef.current;
      const dt = (TICK_MS / 1000) * speedRef.current;
      const today = addDays(w.weekStart, w.day);
      const newBursts = [];
      const pos = posRef.current.slice();
      let jobs = w.jobs;
      let technicians = w.technicians;
      let expenses = w.expenses;
      let lastEvent = w.lastEvent;
      let shifts = w.shifts;
      let changed = false; // only rebuild the big job list when something happens
      const setTech = (techId, patch) => { technicians = technicians.map(t => (t.id === techId ? { ...t, ...patch } : t)); changed = true; };
      const setJob = (jobId, patch) => { jobs = jobs.map(j => (j.id === jobId ? { ...j, ...patch } : j)); changed = true; };
      // Crew heading to a lawn whose customer wants the on-the-way text: send (log) it.
      const headsUp = (jobId, when) => {
        const j = jobs.find(x => x.id === jobId);
        if (!wantsHeadsUp(j)) return;
        const rec = headsUpRecord(j, COMPANY_INFO.name, iso(when));
        if (rec) setJob(jobId, { reminders: [...(j.reminders || []), rec] });
      };

      // Overnight: roll to the next workday, collect payments, load the new route.
      if (w.trucks.every(s => s.phase === 'done')) {
        const night = w.night + dt;
        if (night < NIGHT_SECONDS) { worldRef.current = { ...w, night }; return; }
        let { weekStart, day, week } = w;
        day += 1;
        if (day === 5) { day = 0; weekStart = addDays(weekStart, 7); week += 1; }
        const next = addDays(weekStart, day);
        let paidCount = 0;
        let paidSum = 0;
        let declined = 0;
        let books = { jobs, payments: w.payments || [], expenses };
        for (const j of jobs) {
          if (j.status !== 'completed' || j.paid || !j.payOn || j.payOn > next) continue;
          const when = iso(at(next, 9, 5 + (hash(j.id) % 50)));
          const method = payMethodFor(j.id);
          if (method === 'check') {
            if (!j.checkPending) books = { ...books, jobs: promiseCheck(books.jobs, { jobIds: [j.id], how: checkHowFor(j.id), number: checkNoFor(j.id), at: when, ...crewHas(j) }).jobs };
            continue;
          }
          let result;
          if (method === 'card') {
            const fails = declinesFirst(j.id) && !j.paymentIssue;
            result = simulateCardCharge({ jobIds: [j.id], amount: j.earnings || 0, last4: fails ? '9995' : cardFor(j.id), at: when });
          } else {
            result = { processorId: `demo_${method}_${j.id}`, jobIds: [j.id], amount: j.earnings || 0, method, status: 'succeeded', at: when };
          }
          books = applyPaymentResult(books, result);
          if (result.status === 'succeeded') { paidCount++; paidSum += j.earnings || 0; }
          else {
            declined++;
            // They fix their card; try again in 2 days.
            books.jobs = books.jobs.map(x => (x.id === j.id ? { ...x, payOn: addDays(next, 2) } : x));
          }
        }
        // Checks that have been on the way a few days arrive (John deposits them).
        const arrived = [...new Set(books.jobs.filter(x => x.checkPending && !x.paid && String(x.checkPending.at).slice(0, 10) <= addDays(next, -CHECK_DAYS)).map(x => x.checkPending.id))];
        for (const id of arrived) {
          const amt = books.jobs.filter(x => x.checkPending?.id === id).reduce((s, x) => s + (x.earnings || 0), 0);
          books = settleCheck(books, id, true, iso(at(next, 11)));
          paidCount++; paidSum += amt;
        }
        jobs = books.jobs;
        expenses = books.expenses;
        // Landscaping quotes sent before today: the customer taps Accept (demo).
        let acceptedName = '';
        jobs = jobs.map(j => {
          if (j.status !== 'quote_sent' || String(j.offer?.sentAt || '').slice(0, 10) >= next) return j;
          acceptedName = j.clientName;
          return landAccepted(j, next, 'customer', iso(at(next, 7, 40)));
        });
        const payments = books.payments;
        if (day === 0 && Number(next.slice(8)) <= 7) expenses = [maintenance(next, w.truckCount), ...expenses];
        if (paidCount) lastEvent = `💵 ${paidCount} paid · +${paidSum}${declined ? ` · ❌ ${declined} declined` : ''}`;
        // Monday morning: a new quote request came in over the weekend (until all 3 are used).
        const quotesSent = w.quotesSent ?? QUOTE_SEEDS.length;
        const newQuote = day === 0 && quotesSent < QUOTE_SEEDS.length ? demoQuote(quotesSent, next) : null;
        if (newQuote) lastEvent = `📝 New quote request · ${newQuote.clientName}`;
        if (acceptedName) lastEvent = `✅ ${acceptedName} accepted the landscaping quote`;
        setPositions(depotPositions(w.truckCount));
        // (skip any visit that already exists, e.g. a new customer's first cut made when approved)
        const dayJobs = [...jobs, ...jobsForDay(next, day, w.truckCount, w).filter(nj => !jobs.some(j => j.id === nj.id)), ...(newQuote ? [newQuote] : [])];
        const land = landRouteFor(dayJobs, next);
        // Questions that rode on today's cuts are on those jobs now.
        const crewQs = Object.fromEntries(Object.entries(w.crewQs || {}).filter(([id]) => !dayJobs.some(j => j.id === `${id}@${next}`)));
        commitWorld({
          ...w, weekStart, day, week, night: 0, expenses, payments, lastEvent,
          dayCount: w.dayCount + 1,
          jobs: dayJobs,
          crewQs,
          ...land,
          quotesSent: quotesSent + (newQuote ? 1 : 0),
          technicians: crewFor(next, w.truckCount),
          trucks: freshTrucks(next, w.truckCount, land.landRoute.stops.length),
        });
        return;
      }

      const rainDay = w.dayCount % RAIN_EVERY === 0 && !isWinter(today);
      let delays = w.delays;

      const trucks = w.trucks.map((s, t) => {
        if (s.phase === 'done') return s;
        const plow = isPlow(w, t);
        const land = isLand(w, t);
        const route = routeOf(w, t);
        const techId = driverOf(w, t).id;
        const name = driverOf(w, t).name.split(' ')[0];

        // This foreman is sitting out the rain; when it's over they go back to work.
        if (s.rainLeft > 0) {
          const rainLeft = s.rainLeft - dt;
          if (rainLeft > 0) return { ...s, rainLeft };
          setTech(techId, { status: s.phase === 'cutting' ? 'busy' : 'en_route' });
          lastEvent = `☀️ ${name} back on route`;
          return { ...s, rainLeft: 0, clock: s.clock + s.rainMinutes * 60000 };
        }
        // Rain day: past this foreman's own rain time, they put their truck on Rain Delay.
        if (!plow && rainDay && !s.rainDone && s.phase !== 'idle' && s.clock >= rainPlan(today, t).start) {
          const plan = rainPlan(today, t);
          delays = [{ id: `rain-${t}-${today}`, techId, reason: 'rain', date: today, start: iso(plan.start), end: iso(plan.start + plan.minutes * 60000), minutes: plan.minutes }, ...delays];
          setTech(techId, { status: 'rain_delay' });
          lastEvent = `🌧 ${name} — rain delay`;
          return { ...s, rainDone: true, rainMinutes: plan.minutes, rainLeft: (plan.minutes / 60) * SECONDS_PER_RAIN_HOUR };
        }

        const leg = route.legs[s.leg];
        const target = leg.to === 'depot' ? null : stopById(leg.to, w);
        const jobId = target ? `${target.id}@${today}` : null;

        if (s.phase === 'idle') {
          shifts = [{ techId, date: today, start: iso(s.clock), end: null }, ...shifts];
          if (jobId) { setJob(jobId, { status: 'en_route', enRouteAt: iso(s.clock) }); headsUp(jobId, s.clock); }
          setTech(techId, { status: 'en_route' });
          return { ...s, phase: 'driving' };
        }

        if (s.phase === 'driving') {
          const meters = Math.min(leg.length, s.meters + DRIVE_MPS * dt);
          const p = pointAlong(leg, meters);
          pos[t] = { lat: p[0], lng: p[1] };
          if (!target) {
            if (meters < leg.length) return { ...s, meters };
            // Back at the shop: end of this truck's day. Mowers gas up Wednesdays and
            // Fridays; plows fill up after every snow.
            const home = s.clock + leg.seconds * 1000;
            shifts = shifts.map(x => (x.techId === techId && x.date === today && !x.end ? { ...x, end: iso(home) } : x));
            setTech(techId, { status: 'available' });
            if (plow || w.day === 2 || w.day === 4) {
              const fill = land ? landGas(today) : plow ? plowGas(t - w.truckCount, today) : gasFill(t, today);
              expenses = [fill, ...expenses];
              newBursts.push({ id: `${fill.id}-${Date.now()}`, lat: DEPOT[0], lng: DEPOT[1], text: `⛽ −$${fill.amount.toFixed(0)}`, kind: 'expense', at: Date.now() });
            }
            return { ...s, meters, phase: 'done' };
          }
          // Geofence: close enough to the lawn → start cutting.
          if (metersBetween(p, [target.lat, target.lng]) <= GEOFENCE_M || meters >= leg.length) {
            pos[t] = { lat: target.lat, lng: target.lng };
            const skipReason = plow || land ? null : skipFor(jobId);
            if (skipReason) {
              // Skipped: not cut, not billed; straight on to the next lawn.
              const at0 = s.clock + leg.seconds * 1000;
              setJob(jobId, { status: 'skipped', skippedAt: iso(at0), skipReason });
              lastEvent = `⏭ ${name} skipped ${target.name} · ${skipReason.toLowerCase()}`;
              const after = route.legs[s.leg + 1]?.to;
              if (after && after !== 'depot') { setJob(`${after}@${today}`, { status: 'en_route', enRouteAt: iso(at0) }); headsUp(`${after}@${today}`, at0); }
              return { ...s, leg: s.leg + 1, meters: 0, phase: 'driving', cutLeft: 0, clock: at0 };
            }
            setTech(techId, { status: 'busy' });
            setJob(jobId, { status: 'in_progress' });
            return { ...s, meters, phase: 'cutting', cutLeft: land ? LAND_SECONDS : CUT_SECONDS };
          }
          return { ...s, meters };
        }

        // Cutting → done: mark cut (owed until the customer pays) and pop the money pill.
        const cutLeft = s.cutLeft - dt;
        if (cutLeft > 0) return { ...s, cutLeft };
        const started = s.clock + leg.seconds * 1000;
        const finished = started + (land ? landMinutes(jobId) : plow ? plowMinutes(jobId) : cutMinutes(jobId)) * 60000;
        const doneJob = jobs.find(j => j.id === jobId);
        const answered = doneJob?.checks?.length ? { checks: doneJob.checks.map(c => (c.answer ? c : demoAnswer(c, jobId))) } : {};
        if (doneJob?.service === SITE_CHECK) {
          setJob(jobId, { status: 'completed', startedAt: iso(started), completedAt: iso(started + 8 * 60000), paid: true, ...answered });
          newBursts.push({ id: `${jobId}-${Date.now()}`, lat: target.lat, lng: target.lng, text: '📋 answered', at: Date.now() });
          lastEvent = `📋 ${name} answered the site check · ${target.name}`;
        } else {
          const note = plow ? null : demoNoteFor(jobId, driverOf(w, t).name, iso(finished));
          setJob(jobId, { status: 'completed', startedAt: iso(started), completedAt: iso(finished), paid: false, paidAt: null, payOn: addDays(today, payDelay(jobId)), ...answered, ...(note ? { crewNotes: [...(doneJob?.crewNotes || []), note] } : {}) });
          if (note) lastEvent = `💬 ${name}: ${note.text.slice(0, 40)}…`;
          const tag = plow ? '❄️ ' : land ? '🌳 ' : '';
          newBursts.push({ id: `${jobId}-${Date.now()}`, lat: target.lat, lng: target.lng, text: `${tag}+$${target.price}`, at: Date.now() });
          lastEvent = answered.checks ? `📋 ${name} answered your questions · ${target.name}` : `${tag}+$${target.price} · ${target.name}`;
        }
        const nextStop = route.legs[s.leg + 1]?.to;
        if (nextStop && nextStop !== 'depot') { setJob(`${nextStop}@${today}`, { status: 'en_route', enRouteAt: iso(finished) }); headsUp(`${nextStop}@${today}`, finished); }
        setTech(techId, { status: 'en_route' });
        return { ...s, leg: s.leg + 1, meters: 0, phase: 'driving', cutLeft: 0, clock: finished };
      });

      setPositions(pos);
      if (changed || newBursts.length) commitWorld({ ...w, jobs, technicians, expenses, shifts, delays, trucks, lastEvent });
      else worldRef.current = { ...w, trucks }; // only movement: don't make the reports recompute
      if (newBursts.length) setBursts(b => [...b, ...newBursts]);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [playing, commitWorld]);

  // Let each pill fade out.
  useEffect(() => {
    if (!bursts.length) return undefined;
    const oldest = Math.min(...bursts.map(b => b.at));
    const wait = Math.max(50, oldest + BURST_MS - Date.now());
    const id = setTimeout(() => setBursts(b => b.filter(x => Date.now() - x.at < BURST_MS)), wait);
    return () => clearTimeout(id);
  }, [bursts]);

  const restart = useCallback((withHistory, trucks = worldRef.current.truckCount, start = worldRef.current.start) => {
    setPlaying(false);
    setBursts([]);
    setCleared(!withHistory);
    setPositions(depotPositions(trucks));
    const next = initialWorld(withHistory, trucks, start);
    worldRef.current = next;
    setWorld(next);
  }, []);

  const play = useCallback(() => setPlaying(true), []);
  const pause = useCallback(() => setPlaying(false), []);
  // Reset: back to week 1 with sample history. Clear: blank books for a fresh test.
  const reset = useCallback(() => restart(true), [restart]);
  const clearRecords = useCallback(() => restart(false), [restart]);
  // Jump the demo calendar to winter (plows) or back to mowing season.
  const jumpToWinter = useCallback(() => restart(!cleared, worldRef.current.truckCount, winterStart()), [restart, cleared]);
  const jumpToSpring = useCallback(() => restart(!cleared, worldRef.current.truckCount, springStart()), [restart, cleared]);
  // Change how many trucks run: restarts week 1 (keeps "fresh books" if that was on).
  const setTruckCount = useCallback((n) => {
    const trucks = Math.max(1, Math.min(MAX_TRUCKS, n));
    if (trucks === worldRef.current.truckCount) return;
    restart(!cleared, trucks);
  }, [restart, cleared]);

  // Use the latest truck state (kept in the ref between renders) so trucks don't jump.
  // Payment reminder to the customer (demo: just logged on the job).
  // Reminders are stamped on the demo's calendar (with the real time of day) so
  // "reminded in the last 7 days" lines up with the demo date.
  const demoNow = () => { const d = new Date(); return iso(at(addDays(worldRef.current.weekStart, worldRef.current.day), d.getHours(), d.getMinutes())); };
  const remindCustomer = useCallback(async (jobId, message) => {
    const w = worldRef.current;
    const job = w.jobs.find(j => j.id === jobId);
    const reminder = { id: `rem_${Date.now().toString(36)}`, at: demoNow(), kind: 'payment_reminder', channel: 'text', to: job?.clientPhone || '', by: 'Owner', message, delivered: false };
    const next = { ...w, jobs: w.jobs.map(j => (j.id === jobId ? { ...j, reminders: [...(j.reminders || []), reminder] } : j)) };
    worldRef.current = next;
    setWorld(next);
  }, []);
  // "Remind all": items [{ jobIds, channel, message }] — one reminder per customer.
  const remindCustomers = useCallback(async (items) => {
    const w = worldRef.current;
    const stampAt = demoNow();
    const byJob = new Map();
    items.forEach((it, n) => {
      const first = w.jobs.find(j => j.id === it.jobIds[0]);
      const reminder = { id: `rem_${Date.now().toString(36)}_${n}`, at: stampAt, kind: 'payment_reminder', scope: 'account', channel: it.channel, to: it.channel === 'email' ? (first?.clientEmail || '') : (first?.clientPhone || ''), by: 'Owner', message: it.message, delivered: false };
      it.jobIds.forEach(id => byJob.set(id, reminder));
    });
    const next = { ...w, jobs: w.jobs.map(j => (byJob.has(j.id) ? { ...j, reminders: [...(j.reminders || []), byJob.get(j.id)] } : j)) };
    worldRef.current = next;
    setWorld(next);
    return { sent: items.length };
  }, []);

  // Checks: the owner notes one is coming, or marks it received / bounced (demo calendar).
  const promiseCheckDemo = useCallback(async (jobIds, how = 'mail', number = '') => {
    const w = worldRef.current;
    const { jobs, check } = promiseCheck(w.jobs, { jobIds, how, number, by: 'owner', at: demoNow() });
    if (!check) throw new Error('Nothing unpaid to cover.');
    commitWorld({ ...w, jobs });
  }, [commitWorld]);
  const settleCheckDemo = useCallback(async (checkId, received) => {
    const w = worldRef.current;
    const next = settleCheck({ jobs: w.jobs, payments: w.payments || [], expenses: w.expenses }, checkId, received, demoNow());
    if (!next.payment) throw new Error('That check is already settled.');
    commitWorld({ ...w, jobs: next.jobs, payments: next.payments, expenses: next.expenses });
  }, [commitWorld]);

  // Monthly statements: items [{ jobIds, period, periodLabel, channel, message }] — logged
  // on every visit they cover, stamped on the demo calendar.
  const sendStatements = useCallback(async (items) => {
    const w = worldRef.current;
    const stampAt = demoNow();
    const byJob = new Map();
    items.forEach((it, n) => {
      const first = w.jobs.find(j => j.id === it.jobIds[0]);
      const to = it.channel === 'email' ? (first?.clientEmail || '') : it.channel === 'text' ? (first?.clientPhone || '') : '';
      const record = { id: `stm_${Date.now().toString(36)}_${n}`, at: stampAt, kind: 'statement', period: it.period, periodLabel: it.periodLabel, scope: 'account', channel: it.channel, to, by: 'Owner', message: it.channel === 'paper' ? '' : it.message, delivered: false };
      it.jobIds.forEach(id => byJob.set(id, record));
    });
    commitWorld({ ...w, jobs: w.jobs.map(j => (byJob.has(j.id) ? { ...j, reminders: [...(j.reminders || []), byJob.get(j.id)] } : j)) });
    return { sent: items.length };
  }, [commitWorld]);

  // Customer billing preferences (contactPref, billing): on every visit at the address,
  // and remembered for the visits the demo makes later.
  const updateCustomer = useCallback(async (key, patch) => {
    const w = worldRef.current;
    const stops = new Set();
    const jobs = w.jobs.map(j => {
      if (lawnKey(j) !== key) return j;
      if (j.lawnId || j.lotId) stops.add(j.lawnId || j.lotId);
      return { ...j, ...patch };
    });
    const prefs = { ...(w.prefs || {}) };
    for (const id of stops) prefs[id] = { ...(prefs[id] || {}), ...patch };
    commitWorld({ ...w, jobs, prefs });
  }, [commitWorld]);

  // ---- New customers from quotes ----
  // Every weekday × truck, with the best spot for this address, cheapest first.
  const planRoutes = useCallback((job, { exclude = null } = {}) => {
    const w = worldRef.current;
    const routes = [];
    for (let d = 0; d < 5; d++) {
      const date = nextDateFor(w, d);
      for (let t = 0; t < w.truckCount; t++) {
        const route = routeFor(w.custom, d, t, date);
        routes.push({
          key: `${d}:${t}`, day: d, date, dayShort: DAY_SHORT[d],
          dayLabel: new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }),
          techId: FOREMEN[t].id, techName: FOREMEN[t].name, truckName: FOREMEN[t].truckName,
          stops: route.stops.filter(id => id !== exclude).map(id => { const l = stopById(id, w); return { id, lat: l.lat, lng: l.lng, label: l.address }; }),
        });
      }
    }
    return rankRoutes(routes, DEPOT_PT, job.location);
  }, []);

  // Accept a quote: the lawn joins that weekday's route (from its first date on) at the
  // chosen spot, then the two new legs get real road paths.
  const scheduleQuote = useCallback(async (jobId, plan) => {
    const w = worldRef.current;
    const job = w.jobs.find(j => j.id === jobId);
    if (!job) return null;
    let t = FOREMEN.findIndex(f => f.id === plan.techId);
    if (t < 0 || t >= w.truckCount) t = 0;
    // Day from the chosen date (weekends roll to Monday); never today's route in progress.
    let date = plan.scheduledDate;
    let wd = (new Date(`${date}T12:00:00`).getDay() + 6) % 7;
    if (wd > 4) { date = addDays(date, 7 - wd); wd = 0; }
    const today = addDays(w.weekStart, w.day);
    while (date <= today) date = addDays(date, 7);
    const base = regularRoute((w.custom || {})[`${wd}:${t}`] || [], wd, t, date);
    const id = `nw-${Object.keys(w.extraLawns || {}).length + 1}`;
    const lawn = {
      id, name: job.clientName, address: job.address, lat: job.location.lat, lng: job.location.lng,
      price: plan.price || job.earnings || 0, day: wd, truck: t,
      quote: job.quote && Array.isArray(plan.skipZones) ? { ...job.quote, zones: job.quote.zones.map((z, i) => ({ ...z, skip: plan.skipZones.includes(i) })) } : job.quote,
      notes: job.notes, requested: job.requested, notifyArrival: Boolean(plan.notifyArrival),
    };
    const extraLawns = { ...(w.extraLawns || {}), [id]: lawn };
    const index = plan.slot && plan.slot.day === wd && plan.slot.techId === FOREMEN[t].id
      ? plan.slot.index
      : bestInsertion(base.stops.map(s => ({ id: s, ...stopById(s, w) })), DEPOT_PT, lawn).index;
    const route = insertStop(base, lawn, index, { ...w, extraLawns });
    const key = `${wd}:${t}`;
    const later = ((w.custom || {})[key] || []).map(e => ((e.only ? e.only >= date : e.from > date) ? { ...e, route: addStop(e.route, lawn, { ...w, extraLawns }) } : e));
    const custom = { ...(w.custom || {}), [key]: [...later, { from: date, route }] };
    const next = {
      ...w, custom, extraLawns,
      // The quote becomes their first scheduled cut (like the server does), so they're a
      // customer right away: card, Lawns list, next visit.
      jobs: [...w.jobs.filter(j => j.id !== jobId), { ...baseJob(lawn), id: `${id}@${date}`, status: 'assigned', scheduledDate: date, createdAt: demoNow() }],
      lastEvent: `✓ ${job.clientName} added · ${DAY_SHORT[wd]} · ${FOREMEN[t].truckName}`,
    };
    commitWorld(next);

    // Swap the straight lines for real roads when they come back.
    const prev = index === 0 ? DEPOT_PT : stopById(base.stops[index - 1], next);
    const nextId = route.legs[index + 1].to;
    const after = nextId === 'depot' ? DEPOT_PT : stopById(nextId, next);
    const [legIn, legOut] = await Promise.all([roadLeg(prev, lawn, id), roadLeg(lawn, after, nextId)]);
    if (legIn || legOut) {
      const cur = worldRef.current;
      const list = (cur.custom?.[key] || []).map(entry => {
        if (entry.route !== route) return entry;
        const legs = [...entry.route.legs];
        if (legIn) legs[index] = legIn;
        if (legOut) legs[index + 1] = legOut;
        return { ...entry, route: { ...entry.route, legs } };
      });
      commitWorld({ ...cur, custom: { ...cur.custom, [key]: list } });
    }
    return { date, day: wd, truck: t };
  }, [commitWorld]);

  // ---- Moving a lawn to another day ----
  // Where a lawn is: its regular weekday route + truck, and its next cut (a one-time move wins).
  const lawnPlan = useCallback(lawnId => {
    const w = worldRef.current;
    let regular = null;
    let next = null;
    for (let d = 0; d < 5; d++) {
      const date = nextDateFor(w, d);
      for (let t = 0; t < w.truckCount; t++) {
        const list = w.custom?.[`${d}:${t}`] || [];
        if (!regular && regularRoute(list, d, t, date).stops.includes(lawnId)) regular = { day: d, truck: t, date };
        if (routeFor(w.custom, d, t, date).stops.includes(lawnId) && (!next || date < next.date)) next = { day: d, truck: t, date };
      }
    }
    if (!next) return null;
    const moved = !regular || regular.day !== next.day || regular.truck !== next.truck;
    return {
      date: next.date, techId: FOREMEN[next.truck].id,
      regularDate: moved && regular ? regular.date : null, regularTech: moved && regular ? FOREMEN[regular.truck].id : null,
    };
  }, [world.custom, world.day, world.week, world.truckCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // plan: { mode: 'once' | 'always', scheduledDate, techId, slot? }
  // ---- Questions for the crew ----
  // A quote: a free site-check stop on that truck's route that day (just that date).
  const askCrewSiteCheck = useCallback(async (quoteId, plan) => {
    const w = worldRef.current;
    const quote = w.jobs.find(j => j.id === quoteId);
    if (!quote?.location) throw new Error('No map location for that quote.');
    let t = FOREMEN.findIndex(f => f.id === plan.techId);
    if (t < 0 || t >= w.truckCount) t = 0;
    let date = plan.scheduledDate;
    let wd = (new Date(`${date}T12:00:00`).getDay() + 6) % 7;
    if (wd > 4) { date = addDays(date, 7 - wd); wd = 0; }
    const today = addDays(w.weekStart, w.day);
    while (date <= today) date = addDays(date, 7);
    wd = (new Date(`${date}T12:00:00`).getDay() + 6) % 7;
    const id = `chk-${Object.keys(w.extraLawns || {}).length + 1}`;
    const stop = { id, name: quote.clientName, address: quote.address, lat: quote.location.lat, lng: quote.location.lng, price: 0, day: wd, truck: t };
    const extraLawns = { ...(w.extraLawns || {}), [id]: stop };
    const index = plan.slot && plan.slot.day === wd ? plan.slot.index : null;
    const custom = editOnly(w.custom || {}, `${wd}:${t}`, date, r => addStop(r, stop, { ...w, extraLawns }, index));
    const visit = {
      id: `${id}@${date}`, service: SITE_CHECK, status: 'assigned', assignedTo: FOREMEN[t].id, scheduledDate: date,
      clientName: quote.clientName, clientPhone: quote.clientPhone, address: quote.address, location: quote.location,
      earnings: 0, paid: true, repeatDays: 0, lawnId: null, siteCheckFor: quoteId, checks: newChecks(plan.questions), createdAt: demoNow(),
    };
    commitWorld({ ...w, custom, extraLawns, jobs: [...w.jobs, visit], lastEvent: `📋 Site check · ${quote.clientName} · ${DAY_SHORT[wd]} · ${FOREMEN[t].truckName}` });
    return visit;
  }, [commitWorld]);
  // A customer: the questions ride on their next cut (today's, if it's still open).
  // Owner read a crew message.
  const markNoteRead = useCallback(async (jobId, noteId) => {
    const w = worldRef.current;
    commitWorld({ ...w, jobs: w.jobs.map(j => (j.id === jobId ? { ...j, crewNotes: (j.crewNotes || []).map(n => (n.id === noteId ? { ...n, read: true } : n)) } : j)) });
  }, [commitWorld]);

  const askCrewNextVisit = useCallback(async (key, questions) => {
    const w = worldRef.current;
    const checks = newChecks(questions);
    const open = w.jobs.find(j => lawnKey(j) === key && ['assigned', 'pending', 'en_route'].includes(j.status) && j.service !== SITE_CHECK);
    if (open) {
      commitWorld({ ...w, jobs: w.jobs.map(j => (j.id === open.id ? { ...j, checks: [...(j.checks || []), ...checks] } : j)) });
      return open;
    }
    const lawnId = w.jobs.find(j => lawnKey(j) === key && j.lawnId)?.lawnId;
    if (!lawnId) throw new Error('No upcoming visit to add the questions to.');
    commitWorld({ ...w, crewQs: { ...(w.crewQs || {}), [lawnId]: [...(w.crewQs?.[lawnId] || []), ...checks] } });
    return null;
  }, [commitWorld]);

  const moveLawn = useCallback(async (lawnId, plan) => {
    const w = worldRef.current;
    const lawn = stopById(lawnId, w);
    const now = lawnPlan(lawnId);
    if (!lawn || !now) throw new Error('No upcoming cut to move.');
    let t = FOREMEN.findIndex(f => f.id === plan.techId);
    if (t < 0 || t >= w.truckCount) t = 0;
    let date = plan.scheduledDate;
    let wd = (new Date(`${date}T12:00:00`).getDay() + 6) % 7;
    if (wd > 4) { date = addDays(date, 7 - wd); wd = 0; }
    const today = addDays(w.weekStart, w.day);
    while (date <= today) date = addDays(date, 7);
    const index = plan.slot && plan.slot.day === wd && plan.slot.techId === FOREMEN[t].id ? plan.slot.index : null;
    const newKey = `${wd}:${t}`;
    const fromTruck = FOREMEN.findIndex(f => f.id === now.techId);
    const fromDay = (new Date(`${now.date}T12:00:00`).getDay() + 6) % 7;
    const oldKey = `${fromDay}:${fromTruck}`;
    const remove = r => removeStop(r, lawnId, w);
    const add = (r, i = null) => addStop(remove(r), lawn, w, i);
    let custom = w.custom || {};
    if (plan.mode === 'once') {
      custom = editOnly(custom, oldKey, now.date, remove);
      custom = editOnly(custom, newKey, date, r => add(r, index));
    } else {
      // Off every route from tomorrow, then onto the new one from its first date.
      const tomorrow = addDays(today, 1);
      for (let d = 0; d < 5; d++) for (let tt = 0; tt < w.truckCount; tt++) {
        const k = `${d}:${tt}`;
        const there = ROUTES[d][tt].stops.includes(lawnId) || (custom[k] || []).some(e => e.route.stops.includes(lawnId));
        if (there) custom = editFrom(custom, k, tomorrow, remove);
      }
      custom = editFrom(custom, newKey, date, r => add(r, index));
    }
    const extraLawns = w.extraLawns?.[lawnId] ? { ...w.extraLawns, [lawnId]: { ...w.extraLawns[lawnId], day: wd, truck: t } } : w.extraLawns;
    commitWorld({ ...w, custom, extraLawns, lastEvent: `📅 ${lawn.name} ${plan.mode === 'once' ? 'moved once' : 'now cut'} · ${DAY_SHORT[wd]} · ${FOREMEN[t].truckName}` });
    return { date, day: wd, truck: t };
  }, [commitWorld, lawnPlan]);

  // ---- Landscaping quotes: John prices it, the customer gets a link (they accept overnight) ----
  const sendLandscapeQuote = useCallback(async (jobId, plan) => {
    const w = worldRef.current;
    const job = w.jobs.find(j => j.id === jobId);
    if (!job) throw new Error('That request is gone.');
    const items = cleanItems(plan.items);
    if (!items.length) throw new Error('Add at least one line with a price.');
    const now = demoNow();
    const email = job.clientEmail || job.email || '';
    const channel = plan.channel === 'text' && job.clientPhone ? 'text' : email ? 'email' : 'text';
    const offer = { items, total: offerTotal(items), startDate: plan.startDate, techId: LAND.id, note: plan.note || '', sentAt: now, channel, version: (job.offer?.version || 0) + 1 };
    // Asked for mowing too? The landscaping part becomes its own job; the rest stays a quote.
    let jobs = w.jobs;
    let target = job;
    if (job.status === 'quote' && !isLandscapingJob(job)) {
      const rest = (job.requested || []).filter(s => !/^landscaping/i.test(s));
      jobs = jobs.map(j => (j.id === jobId ? { ...j, requested: rest, service: rest.join(', ') } : j));
      target = { ...job, id: `${job.id}-land` };
      jobs = [...jobs, target];
    }
    const link = `${window.location.origin}/quote/demo#${demoQuoteHash(target, offer, COMPANY_INFO.name)}`;
    const message = quoteMessage(target, offer, COMPANY_INFO.name).replace('{quoteLink}', link);
    const rec = { id: `qt_${Date.now().toString(36)}_${String(target.id).replace(/[^\w]/g, '')}`, at: now, kind: 'quote', channel, to: channel === 'email' ? email : job.clientPhone, by: 'Owner', message, total: offer.total, delivered: false };
    jobs = jobs.map(j => (j.id === target.id ? {
      ...j, status: 'quote_sent', service: 'Landscaping', requested: ['Landscaping'], earnings: offer.total, repeatDays: 0, billing: 'visit', offer,
      reminders: [...(j.reminders || []), rec],
    } : j));
    commitWorld({ ...w, jobs, lastEvent: `🌳 Quote sent to ${String(job.clientName).split(' ')[0]} · $${offer.total}` });
    return { link };
  }, [commitWorld]);
  // The customer said yes on the phone: on the schedule (from tomorrow at the earliest).
  const acceptLandscapeQuote = useCallback(async jobId => {
    const w = worldRef.current;
    const job = w.jobs.find(j => j.id === jobId);
    if (!job || job.status !== 'quote_sent') throw new Error('That quote is not waiting on the customer.');
    const tomorrow = addDays(addDays(w.weekStart, w.day), 1);
    const accepted = landAccepted(job, tomorrow, 'owner', demoNow());
    commitWorld({ ...w, jobs: w.jobs.map(j => (j.id === jobId ? accepted : j)), lastEvent: `✅ ${job.clientName} · landscaping on ${accepted.scheduledDate}` });
    return accepted;
  }, [commitWorld]);

  const declineQuote = useCallback(async jobId => {
    const w = worldRef.current;
    commitWorld({ ...w, jobs: w.jobs.map(j => (j.id === jobId ? { ...j, status: 'declined' } : j)) });
  }, [commitWorld]);

  // Owner records a payment (cash/check, or a test card charge that can decline).
  const markPaid = useCallback(async (jobId, paid = true, method = 'cash', last4) => {
    const w = worldRef.current;
    const books = { jobs: w.jobs, payments: w.payments || [], expenses: w.expenses };
    let next;
    if (!paid) next = voidPayment(books, jobId);
    else {
      const job = w.jobs.find(j => j.id === jobId);
      const when = iso(at(addDays(w.weekStart, w.day), 12));
      const result = method === 'card'
        ? simulateCardCharge({ jobIds: [jobId], amount: job?.earnings || 0, last4, at: when })
        : { processorId: `owner_${method}_${jobId}_${Date.now()}`, jobIds: [jobId], amount: job?.earnings || 0, method, status: 'succeeded', at: when };
      next = applyPaymentResult(books, result);
    }
    const nw = { ...w, jobs: next.jobs, payments: next.payments, expenses: next.expenses };
    worldRef.current = nw;
    setWorld(nw);
    return next.payment;
  }, []);

  // Only rebuild these when a job changes, not on every truck movement.
  const todays = useMemo(() => world.jobs.filter(j => j.scheduledDate === date), [world.jobs, date]);
  const lawns = useMemo(() => todays.map(j => ({ id: j.lawnId || j.lotId || j.id, key: lawnKey(j), name: j.clientName, price: j.earnings, lat: j.location.lat, lng: j.location.lng, status: j.status })), [todays]);
  // Parking-lot outlines (the plow geofence) for today's lots.
  const lots = useMemo(() => todays.filter(j => j.lotId).map(j => ({ id: j.lotId, key: lawnKey(j), name: j.clientName, price: j.earnings, ring: lotById[j.lotId].ring, status: j.status })), [todays]);

  return {
    playing, play, pause, reset, clearRecords, cleared,
    speed, setSpeed,
    truckCount: world.truckCount, setTruckCount, maxTrucks: MAX_TRUCKS,
    date, dayName: WORKDAYS[world.day], week: world.week,
    jobs: world.jobs,
    technicians: world.technicians,
    positions,
    expenses: world.expenses,
    lawns,
    bursts,
    lastEvent: world.lastEvent,
    delays: world.delays,
    shifts: world.shifts,
    // Weather only: is rain in the forecast today (each foreman decides their own delay).
    rainDay: world.dayCount % RAIN_EVERY === 0 && !isWinter(date),
    daysUntilRain: (RAIN_EVERY - (world.dayCount % RAIN_EVERY)) % RAIN_EVERY,
    winter: isWinter(date),
    snowDay: isSnowDay(date),
    jumpToWinter, jumpToSpring,
    lots,
    markPaid,
    remindCustomer,
    remindCustomers,
    sendStatements,
    updateCustomer,
    promiseCheck: promiseCheckDemo,
    settleCheck: settleCheckDemo,
    start: world.start,
    planRoutes,
    scheduleQuote,
    lawnPlan, moveLawn,
    askCrewSiteCheck, askCrewNextVisit, markNoteRead,
    sendLandscapeQuote, acceptLandscapeQuote,
    declineQuote,
    payments: world.payments || [],
    cutToday: todays.filter(j => j.status === 'completed').length,
    totalToday: todays.length,
    bounds: BOUNDS,
    depot: DEPOT_PT,
    outline: OUTLINE,
  };
}
