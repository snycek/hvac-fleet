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
import { applyPaymentResult, simulateCardCharge, voidPayment } from './src/lib/payments.js';
import { accountFor, invoiceFor } from './src/lib/invoices.js';
import { lawnKey } from './src/lib/lawns.js';
import crypto from 'crypto';

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
  const updatedJob = {
    ...currentJob,
    status,
    completedAt: status === 'completed' ? stamp : currentJob.completedAt || null,
    // Timing for "average minutes to cut".
    ...(status === 'en_route' && !currentJob.enRouteAt ? { enRouteAt: stamp } : {}),
    ...(status === 'in_progress' && !currentJob.startedAt ? { startedAt: stamp } : {}),
  };
  jobs[idx] = updatedJob;

  let nextJob = null;
  if (status === 'completed' && currentJob.status !== 'completed' && updatedJob.repeatDays > 0) {
    nextJob = {
      ...updatedJob,
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
      if (status === 'completed') {
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
  return res.json(nextJob ? { ...updatedJob, nextJob } : updatedJob);
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

// Payment reminder to the customer for an unpaid cut. Logged on the job with the exact
// message. (Customer texting/email isn't connected yet — this records it and prints it.)
app.post('/api/jobs/:id/remind', (req, res) => {
  const idx = jobs.findIndex((j) => j.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'job not found' });
  const job = jobs[idx];
  if (job.status !== 'completed' || job.paid) return res.status(400).json({ error: 'only unpaid finished cuts get reminders' });
  const channel = ['text', 'email'].includes(req.body?.channel) ? req.body.channel : 'text';
  const message = String(req.body?.message || '').slice(0, 500);
  const reminder = { at: new Date().toISOString(), channel, message, delivered: false };
  jobs[idx] = { ...job, reminders: [...(job.reminders || []), reminder] };
  console.log(`[REMIND] ${channel} → ${job.clientName} ${job.clientPhone || ''}: ${message}`);
  return res.json(jobs[idx]);
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
  if (body.role !== undefined && ['foreman', 'cutter'].includes(body.role)) out.role = body.role;
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
    invoice: invoiceFor(jobs, job),
  }));
  res.json(out);
});

// Customer: their account (open invoices, recent payments).
app.get('/api/portal/:token', (req, res) => {
  const key = readToken(req.params.token);
  const job = key && jobForKey(key);
  if (!job) return res.status(404).json({ error: "We couldn't find that account. Call us and we'll sort it out." });
  res.json({ ...accountFor(jobs, job), company: 'johns' });
});

// Customer pays open invoices by card (test processor for now — only the last 4 digits
// ever reach the server). Result goes through the same handler as every other payment.
app.post('/api/portal/:token/pay', (req, res) => {
  const key = readToken(req.params.token);
  const job = key && jobForKey(key);
  if (!job) return res.status(404).json({ error: "We couldn't find that account." });
  const open = accountFor(jobs, job).open;
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
  res.json({ payment: next.payment, account: accountFor(jobs, job) });
});

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));

  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`Server listening on :${PORT}`));
