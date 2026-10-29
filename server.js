import { createRequire } from 'module';
const require = createRequire(import.meta.url);

import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { mockJobs } from './src/data/mockData.js';
import { mockTechnicians } from './src/data/mockData.js';
import { suggestAddresses } from './src/lib/addressSuggest.js';
import { applyPaymentResult, crewCollect, promiseCheck, settleCheck, simulateCardCharge, voidPayment } from './src/lib/payments.js';
import { BILLING_DEFAULTS, accountFor, billingSettings, invoiceFor } from './src/lib/invoices.js';
import { lawnKey } from './src/lib/lawns.js';
import { headsUpRecord, isHeadsUp, wantsHeadsUp } from './src/lib/notify.js';
import { COMPANY_INFO } from './src/data/services.js';
import crypto from 'crypto';
import { firebaseReady, initFirebase, loadAll, saveNow, scheduleSave, verifyUser } from './store.js';

// Load .env manually for ESM
try {
  const { config } = await import('dotenv');
  config();
} catch (_) {}

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, 'dist');

const envOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const defaultOrigins = [
  'http://localhost:5173',
  'http://localhost:4173',
  'http://localhost:5180',
  'http://localhost:5181',
  'http://localhost:5182',
  'http://localhost:5183',
  'http://localhost:5184',
  'https://fleet.swordfishconsultingin.com',
  'https://www.swordfishconsultingin.com',
  'https://swordfishconsultingin.com',
  'https://fleet.swordfishconsultinginc.com',
  'https://www.swordfishconsultinginc.com',
  'https://swordfishconsultinginc.com',
  'https://hvac-fleet-production.up.railway.app',
];

const allowedOrigins = new Set([...defaultOrigins, ...envOrigins]);

app.use(cors({
  origin(origin, callback) {
    const isRailwayAppOrigin = typeof origin === 'string' && /\.up\.railway\.app$/i.test(origin.replace(/^https?:\/\//i, ''));
    const isSwordfishOrigin = typeof origin === 'string' && /(^|\.)swordfishconsultinginc\.com$/i.test(origin.replace(/^https?:\/\//i, ''));

    if (!origin || allowedOrigins.has(origin) || isRailwayAppOrigin || isSwordfishOrigin) {
      return callback(null, true);
    }
    return callback(new Error('CORS not allowed for this origin'));
  },
}));
// Receipt photos come in as base64 images, so allow larger bodies.
app.use(express.json({ limit: '8mb' }));

// ---- Sign-in: owner screens and data need a signed-in John's account ----
// Public: the website's quote form, address lookups, careers form, health check, and
// customers' own signed pay links. Everything else needs a Firebase sign-in token.
initFirebase();
const PUBLIC_API = [
  ['POST', /^\/api\/contact$/],
  ['GET', /^\/api\/geocode/],
  ['GET', /^\/api\/address-suggest/],
  ['POST', /^\/api\/technicians\/apply$/],
  ['GET', /^\/api\/health$/],
  ['*', /^\/api\/portal\//],
];
const isPublic = (req) => PUBLIC_API.some(([m, re]) => (m === '*' || m === req.method) && re.test(req.path));
app.use('/api', async (req, res, next) => {
  if (isPublic({ method: req.method, path: req.originalUrl.split('?')[0] })) return next();
  if (!firebaseReady()) {
    // Never run open in production; local dev without a key stays open for testing.
    if (process.env.NODE_ENV === 'production') return res.status(503).json({ error: 'Sign-in is not set up on the server yet.' });
    return next();
  }
  const m = (req.get('authorization') || '').match(/^Bearer (.+)$/);
  if (!m) return res.status(401).json({ error: 'Please sign in.' });
  try {
    const u = await verifyUser(m[1]);
    // Staff accounts are the IDs the owner adds ("owner" → owner@johnslawn.app). Anyone else who
    // manages to make a Firebase account (Google sign-in, etc.) gets nothing.
    if (!/@johnslawn\.app$/i.test(u.email)) return res.status(403).json({ error: "This account is not a John's Lawn staff account." });
    // Every account in John's Firebase project is staff (sign-up is turned off, so
    // only accounts the owner adds exist). The ID before the @ is the username.
    req.user = { ...u, id: u.email.split('@')[0], role: 'owner' };
    return next();
  } catch {
    return res.status(401).json({ error: 'Your sign-in expired. Please sign in again.' });
  }
});

// Anything that changes data gets saved to Firebase right after the response.
app.use((req, res, next) => {
  if (req.method !== 'GET') res.on('finish', () => { if (res.statusCode < 400) scheduleSave(); });
  next();
});

// Who's signed in (the app asks after Firebase sign-in).
app.get('/api/me', (req, res) => {
  if (!req.user) return res.status(firebaseReady() ? 401 : 200).json(firebaseReady() ? { error: 'Please sign in.' } : { id: 'dev', role: 'owner', dev: true });
  res.json({ id: req.user.id, email: req.user.email, role: req.user.role });
});

const jobs = mockJobs.map((job) => ({ ...job }));
const technicians = mockTechnicians.map((tech) => ({ ...tech }));
const expenses = [];
const payments = []; // money received (or attempted): see src/lib/payments.js
const delays = []; // rain delays: { techId, date, start, end, minutes }

// ---- Crew & payroll ----
// employees: foremen (linked to a technician) and their cutters, each with an hourly rate.
const employees = [];
// payroll.hours: owner's edits { 'empId@YYYY-MM-DD': hours }, payroll.paid: { 'empId@weekStart': ISO paid time }
// payroll.payRain: whether rain-delay time counts as paid hours.
const payroll = { hours: {}, paid: {}, payRain: false };
// Billing: statements go out on `day` of each month for the month before; due `terms` days later.
const billing = { ...BILLING_DEFAULTS };
// Each truck's day as the foreman logs it: rolled out → back at the yard.
const shifts = []; // { techId, date, start, end }

function seedEmployees() {
  const firsts = ['Jose', 'Kyle', 'Andre', 'Tyler', 'Luis', 'Brandon', 'Marco', 'Devin', 'Ricky', 'Shawn', 'Eddie', 'Nate', 'Omar', 'Cody', 'Trey', 'Hector', 'Jake', 'Dante', 'Gabe', 'Vince', 'Pedro'];
  const lasts = ['Ramirez', 'Kowalski', 'Hill', 'Brooks', 'Mendoza', 'Price', 'Rossi', 'Grant', 'Flores', 'Wade', 'Nguyen', 'Shaw', 'Haddad', 'Lane', 'Ortiz', 'Cruz', 'Reed', 'Webb', 'Soto', 'Kane', 'Diaz'];
  let n = 0;
  technicians.filter((t) => t.status !== 'pending_approval').forEach((t) => {
    // Plow trucks run with just the driver.
    employees.push({ id: `emp-${t.id}`, name: t.name, role: 'foreman', crewId: t.id, rate: t.kind === 'plow' ? 26 : 24, active: true });
    for (let i = 0; i < (t.kind === 'plow' ? 0 : 3); i++) {
      employees.push({ id: `emp-c${n}`, name: `${firsts[n % firsts.length]} ${lasts[(n * 5) % lasts.length]}`, role: 'cutter', crewId: t.id, rate: 15 + (n % 4), active: true });
      n++;
    }
  });
}
seedEmployees();

const EXPENSE_CATEGORIES = ['gas', 'maintenance', 'other', 'card_fees'];

// Demo history so lawn stats and the P/L have numbers before real use.
function seedDemoHistory() {
  const now = Date.now();
  const day = 86400000;
  const iso = (ms) => new Date(ms).toISOString();
  const dateOnly = (ms) => {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // Existing finished demo job: give it timing and mark it paid.
  jobs.filter((j) => j.status === 'completed').forEach((j, i) => {
    const done = now - (3 + i) * day;
    Object.assign(j, { startedAt: iso(done - 95 * 60000), completedAt: j.completedAt || iso(done), paid: true, paidAt: iso(done + day) });
  });

  // A weekly lawn with four past cuts (three paid) and the next one on the list.
  const base = {
    service: 'Lawn Cutting',
    clientName: 'Pat Kowalczyk',
    clientPhone: '(313) 555-0148',
    address: '2145 Oak St, Wyandotte, MI 48192',
    location: { lat: 42.2049, lng: -83.1587 },
    assignedTo: 'tech-003',
    earnings: 45,
    repeatDays: 7,
    notes: 'Notes: Gate code 4412. Dog in back — friendly.',
    quote: { totalSqFt: 4380, estimate: 45, wanted: ['Lawn Cutting'], zones: [] },
    acceptedAt: iso(now - 30 * day),
  };
  const cutMinutes = [38, 42, 35, 40];
  cutMinutes.forEach((mins, i) => {
    const done = now - (28 - i * 7) * day;
    jobs.push({
      ...base,
      id: `job-demo-pat-${i}`,
      status: 'completed',
      scheduledDate: dateOnly(done),
      createdAt: iso(done - day),
      enRouteAt: iso(done - (mins + 12) * 60000),
      startedAt: iso(done - mins * 60000),
      completedAt: iso(done),
      paid: i < 3,
      paidAt: i < 3 ? iso(done + 2 * day) : null,
    });
  });
  jobs.unshift({ ...base, id: 'job-demo-pat-next', status: 'assigned', scheduledDate: dateOnly(now), createdAt: iso(now - day) });

  expenses.push(
    { id: 'exp-demo-1', techId: 'tech-003', category: 'gas', amount: 48.2, date: dateOnly(now - 5 * day), note: 'Speedway', status: 'logged', createdAt: iso(now - 5 * day), loggedAt: iso(now - 5 * day) },
    { id: 'exp-demo-2', techId: 'tech-001', category: 'maintenance', amount: 120, date: dateOnly(now - 9 * day), note: 'Blade sharpening', status: 'logged', createdAt: iso(now - 9 * day), loggedAt: iso(now - 9 * day) },
  );
}
seedDemoHistory();

function buildAddress(address, city, zip) {
  return [address, city, zip].filter(Boolean).join(', ');
}

async function geocodeAddress(fullAddress) {
  if (!fullAddress || typeof fetch !== 'function') {
    return null;
  }

  try {
    const query = encodeURIComponent(fullAddress);
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${query}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'hvac-fleet/1.0 (dispatch geocoder)',
      },
    });

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    const match = Array.isArray(data) && data.length > 0 ? data[0] : null;
    if (!match?.lat || !match?.lon) {
      return null;
    }

    return {
      lat: Number(match.lat),
      lng: Number(match.lon),
    };
  } catch (_err) {
    return null;
  }
}

function validLatLng(loc) {
  const lat = Number(loc?.lat);
  const lng = Number(loc?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

// Keep only the shape we expect from the quote tool, with sane size limits.
function sanitizeQuote(quote) {
  if (!quote || !Array.isArray(quote.zones) || !quote.zones.length) return null;
  const zones = quote.zones.slice(0, 25).map((z, i) => ({
    name: String(z?.name || `Zone ${i + 1}`).slice(0, 40),
    color: /^#[0-9a-f]{3,8}$/i.test(z?.color || '') ? z.color : '#4ade80',
    sqFt: Math.max(0, Math.round(Number(z?.sqFt) || 0)),
    points: (Array.isArray(z?.points) ? z.points : []).slice(0, 200)
      .map(p => validLatLng({ lat: p?.[0], lng: p?.[1] }))
      .filter(Boolean)
      .map(p => [p.lat, p.lng]),
  })).filter(z => z.points.length >= 3);
  if (!zones.length) return null;
  return {
    zones,
    totalSqFt: zones.reduce((s, z) => s + z.sqFt, 0),
    // null = John prices it (snow removal).
    estimate: quote.estimate == null ? null : Math.max(0, Math.round(Number(quote.estimate) || 0)),
    wanted: (Array.isArray(quote.wanted) ? quote.wanted : []).slice(0, 5).map(s => String(s).slice(0, 40)),
  };
}

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(dateString, days) {
  const d = new Date(`${dateString}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function createJobId() {
  return `job-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function createTechId() {
  return `tech-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

let twilioClient = null;
try {
  if (process.env.TWILIO_SID && process.env.TWILIO_TOKEN) {
    const twilio = (await import('twilio')).default;
    twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
    console.log('[SMS] Twilio connected');
  } else {
    console.log('[SMS] No Twilio credentials — demo mode (SMS will log only)');
  }
} catch (e) {
  console.warn('[SMS] Twilio init failed:', e.message);
}

const TO_PHONE = process.env.TO_PHONE || '+13133789982';

app.post('/api/contact', async (req, res) => {
  const { name, phone, email, address, city, zip, service, bestTime, message, earnings } = req.body;
  const quote = sanitizeQuote(req.body.quote);
  if (!name || !service || !phone) {
    return res.status(400).json({ error: 'name, phone, and service are required' });
  }

  const fullAddress = buildAddress(address, city, zip);
  const location = validLatLng(req.body.location) || await geocodeAddress(fullAddress);

  const defaultEarnings = /lawn cutting/i.test(service || '') ? 40 : /leaf removal/i.test(service || '') ? 150 : 0;
  const resolvedEarnings = typeof earnings === 'number' ? earnings : defaultEarnings;

  const createdJob = {
    id: createJobId(),
    service,
    clientName: name,
    clientPhone: phone,
    address: fullAddress || 'Address not provided',
    location,
    status: 'quote',
    assignedTo: null,
    earnings: resolvedEarnings,
    requested: (Array.isArray(req.body.requested) ? req.body.requested : []).slice(0, 5).map(s => String(s).slice(0, 40)),
    notes: message || '',
    createdAt: new Date().toISOString(),
    bestTime: bestTime || '',
    email: email || '',
    clientEmail: email || '',
    ...(quote ? { quote } : {}),
  };
  jobs.unshift(createdJob);

  const body = `🌱 New John's Lawn Request\nName: ${name}\nPhone: ${phone}${email ? `\nEmail: ${email}` : ''}\nAddress: ${fullAddress || 'Not provided'}\nService: ${service}${quote ? `\nMeasured: ${quote.totalSqFt.toLocaleString()} sq ft (${quote.zones.length} zones)${quote.estimate == null ? ', you price it' : `, estimate $${quote.estimate}`}` : ''}${bestTime ?`\nBest Time: ${bestTime}` : ''}\nNotes: ${message || 'None'}`;
  console.log('[SMS]', body);

  if (!twilioClient) {
    return res.json({ success: true, demo: true, queuedJob: createdJob });
  }

  try {
    await twilioClient.messages.create({
      body,
      from: process.env.TWILIO_PHONE,
      to: TO_PHONE,
    });
    res.json({ success: true, queuedJob: createdJob });
  } catch (err) {
    console.error('[SMS] Twilio error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/geocode', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 200);
  if (!q) return res.status(400).json({ error: 'q is required' });
  const found = await geocodeAddress(q);
  if (!found) return res.status(404).json({ error: 'address not found' });
  res.json(found);
});

app.get('/api/address-suggest', async (req, res) => {
  const q = String(req.query.q || '').slice(0, 120);
  const fetchJson = async (url) => {
    const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'johns-lawn-quote/1.0' } });
    if (!r.ok) throw new Error(`photon ${r.status}`);
    return r.json();
  };
  try {
    res.json(await suggestAddresses(q, fetchJson));
  } catch {
    res.json([]);
  }
});

app.get('/api/jobs', (_req, res) => {
  res.json(jobs);
});

app.post('/api/jobs', async (req, res) => {
  const { service, clientName, clientPhone, address, notes, earnings } = req.body;
  if (!service || !clientName || !clientPhone) {
    return res.status(400).json({ error: 'service, clientName, and clientPhone are required' });
  }

  const location = await geocodeAddress(address);
  const newJob = {
    id: createJobId(),
    service,
    clientName,
    clientPhone,
    address: address || 'Address not provided',
    location,
    status: 'pending',
    assignedTo: null,
    earnings: typeof earnings === 'number' ? earnings : 0,
    notes: notes || '',
    createdAt: new Date().toISOString(),
  };

  jobs.unshift(newJob);
  res.status(201).json(newJob);
});

app.put('/api/jobs/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const idx = jobs.findIndex((j) => j.id === id);
  if (idx < 0) {
    return res.status(404).json({ error: 'job not found' });
  }
  if (!status) {
    return res.status(400).json({ error: 'status is required' });
  }

  const currentJob = jobs[idx];
  const stamp = new Date().toISOString();
  // Skip: the crew didn't cut it this time (customer asked, gate locked, …). Not billed,
  // never late; the next visit still schedules itself.
  const skip = status === 'skipped'
    ? { skippedAt: stamp, skipReason: String(req.body?.reason || 'Skipped').slice(0, 80), skippedBy: req.user?.id || null }
    : {};
  const updatedJob = {
    ...currentJob,
    ...skip,
    status,
    completedAt: status === 'completed' ? stamp : currentJob.completedAt || null,
    // Timing for "average minutes to cut".
    ...(status === 'en_route' && !currentJob.enRouteAt ? { enRouteAt: stamp } : {}),
    ...(status === 'in_progress' && !currentJob.startedAt ? { startedAt: stamp } : {}),
  };
  jobs[idx] = updatedJob;
  // "Crew on the way": customers who asked get a text/email as the crew heads over.
  // (Logged in their contact history; texting/email isn't connected yet.)
  if (status === 'en_route' && currentJob.status !== 'en_route' && wantsHeadsUp(updatedJob)) {
    const rec = headsUpRecord(updatedJob, COMPANY_INFO.name, stamp);
    if (rec) {
      jobs[idx] = { ...updatedJob, reminders: [...(updatedJob.reminders || []), rec] };
      console.log(`[ON THE WAY] ${rec.channel} → ${updatedJob.clientName} ${rec.to}: ${rec.message}`);
    }
  }

  let nextJob = null;
  const finished = s => s === 'completed' || s === 'skipped';
  if (finished(status) && !finished(currentJob.status) && updatedJob.repeatDays > 0) {
    // The next visit copies the customer + schedule, never this visit's own history
    // (reminders, a check on the way, payment problems, skip notes).
    const { reminders: _r, checkPending: _c, paymentIssue: _p, paymentId: _pi, paymentMethod: _pm, skippedAt: _sa, skipReason: _sr, skippedBy: _sb, ...carry } = updatedJob;
    nextJob = {
      ...carry,
      id: createJobId(),
      status: updatedJob.assignedTo ? 'assigned' : 'pending',
      scheduledDate: addDays(updatedJob.scheduledDate || todayString(), updatedJob.repeatDays),
      completedAt: null,
      enRouteAt: null,
      startedAt: null,
      paid: false,
      paidAt: null,
      createdAt: new Date().toISOString(),
      previousJobId: updatedJob.id,
    };
    jobs.unshift(nextJob);
  }

  if (updatedJob.assignedTo) {
    const techIdx = technicians.findIndex((t) => t.id === updatedJob.assignedTo);
    if (techIdx >= 0) {
      const tech = technicians[techIdx];
      if (status === 'skipped') {
        technicians[techIdx] = { ...tech, currentJobId: null, status: 'available' };
      } else if (status === 'completed') {
        technicians[techIdx] = {
          ...tech,
          currentJobId: null,
          status: 'available',
          jobsCompleted: (tech.jobsCompleted || 0) + 1,
          totalEarnings: Number((tech.totalEarnings || 0) + (updatedJob.earnings || 0)),
        };
      } else if (['assigned', 'en_route', 'in_progress'].includes(status)) {
        technicians[techIdx] = {
          ...tech,
          currentJobId: updatedJob.id,
          status: status === 'assigned' ? 'available' : status,
        };
      }
    }
  }
  return res.json(nextJob ? { ...jobs[idx], nextJob } : jobs[idx]);
});

// Owner accepts a quote: set price, first cut day, how often, and the foreman.
app.put('/api/jobs/:id/schedule', (req, res) => {
  const idx = jobs.findIndex((j) => j.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'job not found' });

  const { scheduledDate, repeatDays, price, techId, service } = req.body;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(scheduledDate || ''))) {
    return res.status(400).json({ error: 'scheduledDate (YYYY-MM-DD) is required' });
  }
  if (!techId || !technicians.some((t) => t.id === techId)) {
    return res.status(400).json({ error: 'a valid foreman (techId) is required' });
  }
  const repeat = [0, 7, 14].includes(Number(repeatDays)) ? Number(repeatDays) : 0;
  const amount = Math.max(0, Math.round(Number(price) * 100) / 100 || 0);

  const current = jobs[idx];
  const updatedJob = {
    ...current,
    service: String(service || current.service || '').replace(/^Quote:\s*/i, '').slice(0, 80) || 'Lawn Service',
    status: 'assigned',
    assignedTo: techId,
    scheduledDate,
    repeatDays: repeat,
    // Snow customers get pushed every snowfall (dispatched when it snows), not on a repeat.
    perSnowfall: req.body.perSnowfall === true,
    notifyArrival: req.body.notifyArrival === true, // text/email when the crew heads over
    earnings: amount,
    acceptedAt: new Date().toISOString(),
  };
  jobs[idx] = updatedJob;
  return res.json(updatedJob);
});

// Owner marks a finished cut paid (or un-paid if tapped by mistake).
// Replace the contents of our in-memory lists with a new version.
function commitBooks(next) {
  jobs.splice(0, jobs.length, ...next.jobs);
  payments.splice(0, payments.length, ...next.payments);
  expenses.splice(0, expenses.length, ...next.expenses);
}

// Owner marks a finished cut paid by cash/check (or card, which runs a test charge),
// or un-paid if tapped by mistake.
app.put('/api/jobs/:id/paid', (req, res) => {
  const job = jobs.find((j) => j.id === req.params.id);
  if (!job) return res.status(404).json({ error: 'job not found' });
  if (req.body?.paid === false) {
    commitBooks(voidPayment({ jobs, payments, expenses }, job.id));
    return res.json(jobs.find((j) => j.id === job.id));
  }
  const method = ['cash', 'check', 'card'].includes(req.body?.method) ? req.body.method : 'cash';
  const result = method === 'card'
    ? simulateCardCharge({ jobIds: [job.id], amount: job.earnings || 0, last4: req.body?.last4 })
    : { processorId: `manual_${Date.now()}_${job.id}`, jobIds: [job.id], amount: job.earnings || 0, method, status: 'succeeded', at: new Date().toISOString() };
  const next = applyPaymentResult({ jobs, payments, expenses }, result);
  commitBooks(next);
  return res.json({ ...jobs.find((j) => j.id === job.id), payment: next.payment });
});

// ---- Checks on the way ----
// Owner: a customer called to say a check is coming ({ jobIds, how: mail|crew, number }).
app.post('/api/checks', (req, res) => {
  const { jobs: next, check } = promiseCheck(jobs, { jobIds: req.body?.jobIds, how: req.body?.how, number: req.body?.number, by: 'owner' });
  if (!check) return res.status(400).json({ error: 'Nothing unpaid to cover.' });
  jobs.splice(0, jobs.length, ...next);
  res.json(check);
});
// Foreman at the door: the customer handed over a check or cash ({ jobId, kind, number }).
// Covers every unpaid finished visit at that address; John clears it when it's turned in.
app.post('/api/crew/collect', (req, res) => {
  const job = jobs.find((j) => j.id === req.body?.jobId);
  if (!job) return res.status(404).json({ error: 'job not found' });
  const key = lawnKey(job);
  const ids = jobs.filter((j) => lawnKey(j) === key && j.status === 'completed' && !j.paid).map((j) => j.id);
  if (!ids.length) return res.status(400).json({ error: 'Nothing unpaid at this address — mark the cut first.' });
  const foreman = technicians.find((t) => t.id === job.assignedTo)?.name || req.user?.id || 'Crew';
  const kind = req.body?.kind === 'cash' ? 'cash' : 'check';
  const { jobs: next, check } = crewCollect(jobs, { jobIds: ids, kind, number: req.body?.number, foreman });
  if (!check) return res.status(400).json({ error: 'Nothing unpaid at this address.' });
  jobs.splice(0, jobs.length, ...next);
  console.log(`[CREW] ${foreman} collected ${kind} from ${job.clientName}`);
  res.json({ check, amount: jobs.filter((j) => j.checkPending?.id === check.id).reduce((s, j) => s + (j.earnings || 0), 0) });
});

// Owner: the check arrived (paid by check) or bounced (shows under Payment problems).
app.post('/api/checks/:id/:outcome', (req, res) => {
  const { id, outcome } = req.params;
  if (!['received', 'bounced'].includes(outcome)) return res.status(404).json({ error: 'unknown action' });
  const next = settleCheck({ jobs, payments, expenses }, id, outcome === 'received');
  if (!next.payment) return res.status(404).json({ error: 'That check is already settled.' });
  commitBooks(next);
  res.json({ payment: next.payment });
});

// ---- Payments received ----
app.get('/api/payments', (_req, res) => res.json(payments));

// Where a card processor reports a payment result (approved / declined).
// Connecting Stripe/PayPal/Square later = translate their webhook into this shape.
app.post('/api/payments/result', (req, res) => {
  const r = req.body || {};
  if (!Array.isArray(r.jobIds) || !r.jobIds.every((id) => jobs.some((j) => j.id === id))) {
    return res.status(400).json({ error: 'jobIds must be existing jobs' });
  }
  if (!['succeeded', 'failed'].includes(r.status)) return res.status(400).json({ error: 'status must be succeeded or failed' });
  const next = applyPaymentResult({ jobs, payments, expenses }, {
    processorId: String(r.processorId || '').slice(0, 80) || undefined,
    jobIds: r.jobIds, amount: Number(r.amount) || undefined, status: r.status,
    method: ['card', 'cash', 'check'].includes(r.method) ? r.method : 'card',
    brand: r.brand ? String(r.brand).slice(0, 20) : null, last4: r.last4 ? String(r.last4).slice(-4) : null,
    reason: r.reason ? String(r.reason).slice(0, 120) : null,
    at: r.at && !Number.isNaN(Date.parse(r.at)) ? r.at : new Date().toISOString(),
  });
  commitBooks(next);
  console.log(`[PAYMENT] ${next.payment?.status} ${next.payment?.method} $${next.payment?.amount} ${next.payment?.clientName}${next.duplicate ? ' (duplicate ignored)' : ''}`);
  return res.json({ payment: next.payment, duplicate: Boolean(next.duplicate) });
});

// Test processor: charge a card for unpaid cuts (last4 picks approve/decline).
app.post('/api/payments/charge', (req, res) => {
  const { jobIds, last4 } = req.body || {};
  const picked = jobs.filter((j) => (jobIds || []).includes(j.id) && j.status === 'completed' && !j.paid);
  if (!picked.length) return res.status(400).json({ error: 'nothing unpaid to charge' });
  const result = simulateCardCharge({ jobIds: picked.map((j) => j.id), amount: picked.reduce((s, j) => s + (j.earnings || 0), 0), last4 });
  const next = applyPaymentResult({ jobs, payments, expenses }, result);
  commitBooks(next);
  return res.json({ payment: next.payment });
});

// At most one payment reminder per customer (service address) per week.
const REMIND_EVERY_MS = 7 * 24 * 3600 * 1000;
function lastReminderAt(key) {
  let last = '';
  for (const j of jobs) if (lawnKey(j) === key) for (const r of j.reminders || []) if (!isHeadsUp(r) && String(r.at) > last) last = String(r.at);
  return last || null;
}
const remindedThisWeek = (key) => { const last = lastReminderAt(key); return last && Date.now() - new Date(last).getTime() < REMIND_EVERY_MS ? last : null; };

// Payment reminder to the customer for an unpaid cut. Logged on the job with the exact
// message. (Customer texting/email isn't connected yet — this records it and prints it.)
app.post('/api/jobs/:id/remind', (req, res) => {
  const idx = jobs.findIndex((j) => j.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'job not found' });
  const job = jobs[idx];
  if (job.status !== 'completed' || job.paid) return res.status(400).json({ error: 'only unpaid finished cuts get reminders' });
  const recent = remindedThisWeek(lawnKey(job));
  if (recent) return res.status(429).json({ error: `Already reminded ${new Date(recent).toLocaleDateString('en-US')} — one reminder per week.` });
  const channel = ['text', 'email'].includes(req.body?.channel) ? req.body.channel : 'text';
  const message = String(req.body?.message || '').slice(0, 500);
  const to = channel === 'email' ? (job.clientEmail || job.email || '') : (job.clientPhone || '');
  const reminder = { id: `rem_${Date.now().toString(36)}_${idx}`, at: new Date().toISOString(), kind: 'payment_reminder', channel, to, by: 'Owner', message, delivered: false };
  jobs[idx] = { ...job, reminders: [...(job.reminders || []), reminder] };
  console.log(`[REMIND] ${channel} → ${job.clientName} ${job.clientPhone || ''}: ${message}`);
  return res.json(jobs[idx]);
});

// "Remind all": one reminder per customer covering all their open cuts. {payLink} in the
// message becomes that customer's own account link. Recorded on every cut it covers
// (same id), so the customer's contact history shows it once with the exact wording.
// (Texting/email isn't connected yet — delivered stays false until it is.)
app.post('/api/reminders', (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 500) : [];
  const origin = req.get('origin') || `${req.protocol}://${req.get('host')}`;
  const at = new Date().toISOString();
  const sent = [];
  items.forEach((item, n) => {
    const ids = (Array.isArray(item.jobIds) ? item.jobIds : []).filter((id) => {
      const j = jobs.find((x) => x.id === id);
      return j && j.status === 'completed' && !j.paid;
    });
    if (!ids.length) return;
    const first = jobs.find((x) => x.id === ids[0]);
    if (remindedThisWeek(lawnKey(first))) return; // one reminder per customer per week
    const channel = ['text', 'email'].includes(item.channel) ? item.channel : 'text';
    const to = channel === 'email' ? (first.clientEmail || first.email || '') : (first.clientPhone || '');
    const link = `${origin}/pay/${portalToken(lawnKey(first))}`;
    const message = String(item.message || '').slice(0, 600).replace('{payLink}', link);
    const reminder = { id: `rem_${Date.now().toString(36)}_${n}`, at, kind: 'payment_reminder', scope: 'account', channel, to, by: 'Owner', message, delivered: false };
    for (const id of ids) {
      const idx = jobs.findIndex((x) => x.id === id);
      jobs[idx] = { ...jobs[idx], reminders: [...(jobs[idx].reminders || []), reminder] };
    }
    console.log(`[REMIND] ${channel} → ${first.clientName} ${to}: ${message}`);
    sent.push({ id: reminder.id, customer: first.clientName, jobIds: ids });
  });
  res.json({ sent: sent.length, items: sent });
});

// ---- Expenses (gas, maintenance, other) ----

// List without the photos; each receipt is fetched on its own when shown.
app.get('/api/expenses', (_req, res) => {
  res.json(expenses.map(({ receipt, ...e }) => ({ ...e, hasReceipt: Boolean(receipt) })));
});

app.get('/api/expenses/:id/receipt', (req, res) => {
  const exp = expenses.find((e) => e.id === req.params.id);
  const match = exp?.receipt?.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!match) return res.status(404).end();
  res.type(match[1]).send(Buffer.from(match[2], 'base64'));
});

app.post('/api/expenses', (req, res) => {
  const { techId, category, amount, date, note, receipt, logNow } = req.body || {};
  const value = Math.round(Number(amount) * 100) / 100;
  if (!EXPENSE_CATEGORIES.includes(category)) return res.status(400).json({ error: 'category must be gas, maintenance, or other' });
  if (!(value > 0)) return res.status(400).json({ error: 'amount must be more than 0' });
  if (receipt && !/^data:image\/(jpeg|png|webp);base64,/.test(receipt)) return res.status(400).json({ error: 'receipt must be a photo' });
  if (receipt && receipt.length > 7_000_000) return res.status(413).json({ error: 'receipt photo is too large' });

  const now = new Date().toISOString();
  const exp = {
    id: `exp-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    techId: techId || null,
    category,
    amount: value,
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? date : todayString(),
    note: String(note || '').slice(0, 200),
    receipt: receipt || null,
    // Foreman expenses wait in the owner's To-Do; owner-entered ones go straight to the books.
    status: logNow ? 'logged' : 'pending',
    createdAt: now,
    ...(logNow ? { loggedAt: now } : {}),
  };
  expenses.unshift(exp);
  const { receipt: _r, ...listItem } = exp;
  res.status(201).json({ ...listItem, hasReceipt: Boolean(exp.receipt) });
});

// Owner confirms (and can correct) a foreman's expense.
app.put('/api/expenses/:id/log', (req, res) => {
  const idx = expenses.findIndex((e) => e.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'expense not found' });
  const { category, amount, date } = req.body || {};
  const value = amount != null ? Math.round(Number(amount) * 100) / 100 : expenses[idx].amount;
  if (!(value > 0)) return res.status(400).json({ error: 'amount must be more than 0' });
  expenses[idx] = {
    ...expenses[idx],
    category: EXPENSE_CATEGORIES.includes(category) ? category : expenses[idx].category,
    amount: value,
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? date : expenses[idx].date,
    status: 'logged',
    loggedAt: new Date().toISOString(),
  };
  const { receipt, ...listItem } = expenses[idx];
  return res.json({ ...listItem, hasReceipt: Boolean(receipt) });
});

app.put('/api/expenses/:id/reject', (req, res) => {
  const idx = expenses.findIndex((e) => e.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'expense not found' });
  expenses[idx] = { ...expenses[idx], status: 'rejected', rejectedAt: new Date().toISOString() };
  const { receipt, ...listItem } = expenses[idx];
  return res.json({ ...listItem, hasReceipt: Boolean(receipt) });
});

app.put('/api/jobs/:id/decline', (req, res) => {
  const idx = jobs.findIndex((j) => j.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'job not found' });
  jobs[idx] = { ...jobs[idx], status: 'declined', declinedAt: new Date().toISOString() };
  return res.json(jobs[idx]);
});

app.put('/api/jobs/:id/assign', (req, res) => {
  const { id } = req.params;
  const { techId } = req.body;
  const idx = jobs.findIndex((j) => j.id === id);
  if (idx < 0) {
    return res.status(404).json({ error: 'job not found' });
  }
  if (!techId) {
    return res.status(400).json({ error: 'techId is required' });
  }

  const updatedJob = { ...jobs[idx], status: 'assigned', assignedTo: techId };
  jobs[idx] = updatedJob;

  const techIdx = technicians.findIndex((t) => t.id === techId);
  if (techIdx >= 0) {
    technicians[techIdx] = {
      ...technicians[techIdx],
      currentJobId: updatedJob.id,
    };
  }

  return res.json(updatedJob);
});

app.get('/api/technicians', (_req, res) => {
  res.json(technicians);
});

app.post('/api/technicians/apply', (req, res) => {
  const { name, email, phone, city, truckName, yearsExperience } = req.body;
  if (!name || !email || !phone) {
    return res.status(400).json({ error: 'name, email, and phone are required' });
  }

  const experience = Number(yearsExperience) || 0;
  const applicant = {
    id: createTechId(),
    name,
    email,
    phone,
    city: city || '',
    truckName: truckName || `Truck ${Math.floor(Math.random() * 80) + 20}`,
    yearsExperience: experience,
    isSeasoned: experience >= 2,
    status: 'pending_approval',
    location: { lat: 42.2114, lng: -83.1935 },
    currentJobId: null,
    totalEarnings: 0,
    jobsCompleted: 0,
    approvedAt: null,
  };

  technicians.push(applicant);
  return res.status(201).json(applicant);
});

app.put('/api/technicians/:id/approve', (req, res) => {
  const { id } = req.params;
  const idx = technicians.findIndex((t) => t.id === id);
  if (idx < 0) {
    return res.status(404).json({ error: 'technician not found' });
  }

  technicians[idx] = {
    ...technicians[idx],
    status: 'available',
    approvedAt: new Date().toISOString(),
  };
  return res.json(technicians[idx]);
});

app.put('/api/technicians/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const idx = technicians.findIndex((t) => t.id === id);
  if (idx < 0) {
    return res.status(404).json({ error: 'technician not found' });
  }
  if (!status) {
    return res.status(400).json({ error: 'status is required' });
  }

  // Rain delay log: opening/closing a delay as the foreman toggles it.
  const before = technicians[idx].status;
  const now = new Date();
  if (status === 'rain_delay' && before !== 'rain_delay') {
    delays.unshift({ id: `delay-${Date.now()}`, techId: id, reason: 'rain', date: todayString(), start: now.toISOString(), end: null, minutes: null });
  } else if (before === 'rain_delay' && status !== 'rain_delay') {
    const open = delays.find((d) => d.techId === id && !d.end);
    if (open) {
      open.end = now.toISOString();
      open.minutes = Math.max(1, Math.round((now - new Date(open.start)) / 60000));
    }
  }

  technicians[idx] = { ...technicians[idx], status };
  return res.json(technicians[idx]);
});

// Rain delays (newest first). Open ones have end: null.
app.get('/api/delays', (_req, res) => res.json(delays));

// ---- Crew & payroll ----
const cleanEmployee = (body, base = {}) => {
  const out = { ...base };
  if (body.name !== undefined) out.name = String(body.name).trim().slice(0, 60);
  if (body.rate !== undefined) out.rate = Math.max(0, Math.min(500, Math.round(Number(body.rate) * 100) / 100 || 0));
  if (body.crewId !== undefined && technicians.some((t) => t.id === body.crewId)) out.crewId = body.crewId;
  if (body.role !== undefined && ['foreman', 'cutter', 'shoveler'].includes(body.role)) out.role = body.role;
  if (body.active !== undefined) out.active = Boolean(body.active);
  return out;
};

app.get('/api/employees', (_req, res) => res.json(employees));

app.post('/api/employees', (req, res) => {
  const emp = cleanEmployee(req.body || {}, { id: `emp-${Date.now()}-${Math.floor(Math.random() * 1000)}`, role: 'cutter', rate: 15, active: true });
  if (!emp.name) return res.status(400).json({ error: 'name is required' });
  if (!emp.crewId) return res.status(400).json({ error: 'a valid crew (foreman) is required' });
  employees.push(emp);
  res.status(201).json(emp);
});

app.put('/api/employees/:id', (req, res) => {
  const idx = employees.findIndex((e) => e.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'employee not found' });
  employees[idx] = cleanEmployee(req.body || {}, employees[idx]);
  if (!employees[idx].name) return res.status(400).json({ error: 'name is required' });
  res.json(employees[idx]);
});

app.get('/api/payroll', (_req, res) => res.json(payroll));

// Owner edits one day's hours (hours: null clears the edit and goes back to the truck's time).
app.put('/api/payroll/hours', (req, res) => {
  const { empId, date, hours } = req.body || {};
  if (!employees.some((e) => e.id === empId) || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) {
    return res.status(400).json({ error: 'empId and date are required' });
  }
  const key = `${empId}@${date}`;
  if (hours === null || hours === '') delete payroll.hours[key];
  else payroll.hours[key] = Math.max(0, Math.min(24, Math.round(Number(hours) * 4) / 4 || 0));
  res.json(payroll);
});

// Mark a week paid / unpaid for some employees.
app.put('/api/payroll/paid', (req, res) => {
  const { weekStart, empIds, paid } = req.body || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(weekStart || '')) || !Array.isArray(empIds)) {
    return res.status(400).json({ error: 'weekStart and empIds are required' });
  }
  const at = new Date().toISOString();
  for (const id of empIds) {
    const key = `${id}@${weekStart}`;
    if (paid === false) delete payroll.paid[key];
    else payroll.paid[key] = at;
  }
  res.json(payroll);
});

// Truck days (rolled out / back at yard).
app.get('/api/shifts', (_req, res) => res.json(shifts));

// Foreman sets rollout and/or back-at-yard for a date. Times are ISO strings; null clears one.
app.put('/api/shifts', (req, res) => {
  const { techId, date, start, end } = req.body || {};
  if (!technicians.some((t) => t.id === techId) || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) {
    return res.status(400).json({ error: 'techId and date are required' });
  }
  const valid = (v) => v === null || (typeof v === 'string' && !Number.isNaN(Date.parse(v)));
  if ((start !== undefined && !valid(start)) || (end !== undefined && !valid(end))) {
    return res.status(400).json({ error: 'start/end must be times' });
  }
  let shift = shifts.find((s) => s.techId === techId && s.date === date);
  if (!shift) { shift = { techId, date, start: null, end: null }; shifts.unshift(shift); }
  if (start !== undefined) shift.start = start;
  if (end !== undefined) shift.end = end;
  if (shift.start && shift.end && new Date(shift.end) < new Date(shift.start)) {
    return res.status(400).json({ error: 'back at yard must be after rollout' });
  }
  res.json(shift);
});

app.put('/api/payroll/settings', (req, res) => {
  if (req.body?.payRain !== undefined) payroll.payRain = Boolean(req.body.payRain);
  res.json(payroll);
});

app.put('/api/technicians/:id/location', (req, res) => {
  const { id } = req.params;
  const { location } = req.body;
  const idx = technicians.findIndex((t) => t.id === id);
  if (idx < 0) {
    return res.status(404).json({ error: 'technician not found' });
  }
  if (!location?.lat || !location?.lng) {
    return res.status(400).json({ error: 'location.lat and location.lng are required' });
  }

  technicians[idx] = { ...technicians[idx], location: { lat: Number(location.lat), lng: Number(location.lng) } };
  return res.json(technicians[idx]);
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ---- Customer accounts: the QR on each paper invoice opens the customer's account ----
// The link carries the customer (their service address) plus a signature, so it works
// without a password and can't be edited to open someone else's account.
// Set PORTAL_SECRET in production so links stay valid across restarts.
const PORTAL_SECRET = process.env.PORTAL_SECRET || 'dev-only-portal-secret';
if (!process.env.PORTAL_SECRET) console.warn('PORTAL_SECRET not set — using a dev-only secret for customer links');
const b64url = (buf) => Buffer.from(buf).toString('base64url');
const sign = (key) => crypto.createHmac('sha256', PORTAL_SECRET).update(key).digest('base64url').slice(0, 22);
const portalToken = (key) => `${b64url(key)}.${sign(key)}`;
function readToken(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  let key;
  try { key = Buffer.from(body, 'base64url').toString('utf8'); } catch { return null; }
  const want = sign(key);
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  return key;
}
const jobForKey = (key) => jobs.filter((j) => lawnKey(j) === key).sort((a, b) => String(b.completedAt || b.scheduledDate || '').localeCompare(String(a.completedAt || a.scheduledDate || '')))[0];

// Owner (printing invoices): the paper for each visit + its customer's account link.
app.post('/api/invoices', (req, res) => {
  const ids = Array.isArray(req.body?.jobIds) ? req.body.jobIds.slice(0, 200) : [];
  const out = ids.map((id) => jobs.find((j) => j.id === id)).filter(Boolean).map((job) => ({
    jobId: job.id,
    token: portalToken(lawnKey(job)),
    invoice: invoiceFor(jobs, job, undefined, billing),
  }));
  res.json(out);
});

// ---- Monthly billing ----
app.get('/api/billing', (_req, res) => res.json(billingSettings(billing)));
app.put('/api/billing', (req, res) => {
  Object.assign(billing, billingSettings({ ...billing, ...req.body }));
  res.json(billingSettings(billing));
});

// Owner (statements): each customer's signed account link, by customer key.
app.post('/api/pay-links', (req, res) => {
  const keys = Array.isArray(req.body?.keys) ? req.body.keys.slice(0, 1000).map(String) : [];
  const known = new Set(jobs.map(lawnKey));
  res.json(Object.fromEntries(keys.filter((k) => known.has(k)).map((k) => [k, portalToken(k)])));
});

// Send monthly statements: items [{ jobIds, period, periodLabel, channel, message }].
// Logged on every visit the statement covers (one id), so the customer's contact
// history shows it once. {payLink} becomes their account link. Paper = printed to mail
// or hand over. (Texting/email isn't connected yet — delivered stays false until it is.)
app.post('/api/statements/send', (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 1000) : [];
  const origin = req.get('origin') || `${req.protocol}://${req.get('host')}`;
  const at = new Date().toISOString();
  const sent = [];
  items.forEach((item, n) => {
    const period = /^\d{4}-\d{2}$/.test(item.period) ? item.period : null;
    const ids = (Array.isArray(item.jobIds) ? item.jobIds : []).filter((id) => jobs.some((j) => j.id === id && j.status === 'completed'));
    if (!period || !ids.length) return;
    const first = jobs.find((j) => j.id === ids[0]);
    const channel = ['text', 'email', 'paper'].includes(item.channel) ? item.channel : 'paper';
    const to = channel === 'email' ? (first.clientEmail || first.email || '') : channel === 'text' ? (first.clientPhone || '') : '';
    const link = `${origin}/pay/${portalToken(lawnKey(first))}`;
    const message = channel === 'paper' ? '' : String(item.message || '').slice(0, 600).replace('{payLink}', link);
    const record = { id: `stm_${Date.now().toString(36)}_${n}`, at, kind: 'statement', period, periodLabel: String(item.periodLabel || '').slice(0, 40), scope: 'account', channel, to, by: 'Owner', message, delivered: false };
    for (const id of ids) {
      const idx = jobs.findIndex((x) => x.id === id);
      jobs[idx] = { ...jobs[idx], reminders: [...(jobs[idx].reminders || []), record] };
    }
    console.log(`[STATEMENT] ${period} ${channel} → ${first.clientName} ${to}${message ? `: ${message}` : ''}`);
    sent.push({ id: record.id, customer: first.clientName, jobIds: ids });
  });
  res.json({ sent: sent.length, items: sent });
});

// Customer billing preferences, saved on every visit at their address (so future cuts
// copy them): contactPref text | email | paper, billing monthly | visit.
app.put('/api/customers', (req, res) => {
  const key = String(req.body?.key || '');
  const patch = {};
  if (['text', 'email', 'paper'].includes(req.body?.contactPref)) patch.contactPref = req.body.contactPref;
  if (['monthly', 'visit'].includes(req.body?.billing)) patch.billing = req.body.billing;
  if (typeof req.body?.notifyArrival === 'boolean') patch.notifyArrival = req.body.notifyArrival;
  if (!key || !Object.keys(patch).length) return res.status(400).json({ error: 'nothing to change' });
  let n = 0;
  jobs.forEach((j, i) => { if (lawnKey(j) === key) { jobs[i] = { ...j, ...patch }; n += 1; } });
  if (!n) return res.status(404).json({ error: 'customer not found' });
  res.json({ updated: n, ...patch });
});

// Customer: their account (open invoices, recent payments).
app.get('/api/portal/:token', (req, res) => {
  const key = readToken(req.params.token);
  const job = key && jobForKey(key);
  if (!job) return res.status(404).json({ error: "We couldn't find that account. Call us and we'll sort it out." });
  res.json({ ...accountFor(jobs, job, undefined, billing), company: 'johns' });
});

// Customer: "I'll pay by check" (mailing it or handing it to the crew). The visits stay
// unpaid until John marks the check received; reminders hold off meanwhile.
app.post('/api/portal/:token/check', (req, res) => {
  const key = readToken(req.params.token);
  const job = key && jobForKey(key);
  if (!job) return res.status(404).json({ error: "We couldn't find that account." });
  const open = accountFor(jobs, job, undefined, billing).open.filter((l) => !l.checkPending);
  const wanted = Array.isArray(req.body?.jobIds) ? req.body.jobIds : open.map((l) => l.id);
  const ids = open.filter((l) => wanted.includes(l.id)).map((l) => l.id);
  if (!ids.length) return res.status(400).json({ error: 'Nothing left to pay — thank you!' });
  const { jobs: next, check } = promiseCheck(jobs, { jobIds: ids, how: req.body?.how, number: req.body?.number, by: 'customer' });
  jobs.splice(0, jobs.length, ...next);
  console.log(`[CHECK] ${job.clientName} says a check is coming (${check.how}) for $${check.amount}`);
  res.json({ check, account: accountFor(jobs, job, undefined, billing) });
});

// Customer pays open invoices by card (test processor for now — only the last 4 digits
// ever reach the server). Result goes through the same handler as every other payment.
app.post('/api/portal/:token/pay', (req, res) => {
  const key = readToken(req.params.token);
  const job = key && jobForKey(key);
  if (!job) return res.status(404).json({ error: "We couldn't find that account." });
  const open = accountFor(jobs, job, undefined, billing).open;
  const wanted = Array.isArray(req.body?.jobIds) ? req.body.jobIds : open.map((l) => l.id);
  const lines = open.filter((l) => wanted.includes(l.id));
  if (!lines.length) return res.status(400).json({ error: 'Nothing to pay — you are all caught up.' });
  const last4 = String(req.body?.last4 || '').replace(/\D/g, '').slice(-4);
  if (last4.length !== 4) return res.status(400).json({ error: 'Enter your card number.' });
  const amount = lines.reduce((s, l) => s + l.amount, 0);
  const result = simulateCardCharge({ jobIds: lines.map((l) => l.id), amount, last4 });
  const next = applyPaymentResult({ jobs, payments, expenses }, result);
  commitBooks(next);
  if (result.status !== 'succeeded') return res.status(402).json({ error: `${result.brand} ••${result.last4} was declined: ${result.reason}. Try another card.`, payment: next.payment });
  res.json({ payment: next.payment, account: accountFor(jobs, job, undefined, billing) });
});

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));

  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Load saved data from Firebase before taking requests; first run seeds the database.
await loadAll({ jobs, technicians, expenses, payments, delays, employees, shifts }, { payroll, billing });
await saveNow();

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`Server listening on :${PORT}${firebaseReady() ? ' (Firebase on)' : ' (no Firebase key — data in memory only)'}`));
