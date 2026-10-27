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

const EXPENSE_CATEGORIES = ['gas', 'maintenance', 'other'];

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
    estimate: Math.max(0, Math.round(Number(quote.estimate) || 0)),
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

  const body = `🌱 New John's Lawn Request\nName: ${name}\nPhone: ${phone}${email ? `\nEmail: ${email}` : ''}\nAddress: ${fullAddress || 'Not provided'}\nService: ${service}${quote ? `\nMeasured: ${quote.totalSqFt.toLocaleString()} sq ft (${quote.zones.length} zones), estimate $${quote.estimate}` : ''}${bestTime ?`\nBest Time: ${bestTime}` : ''}\nNotes: ${message || 'None'}`;
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
    earnings: amount,
    acceptedAt: new Date().toISOString(),
  };
  jobs[idx] = updatedJob;
  return res.json(updatedJob);
});

// Owner marks a finished cut paid (or un-paid if tapped by mistake).
app.put('/api/jobs/:id/paid', (req, res) => {
  const idx = jobs.findIndex((j) => j.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'job not found' });
  const paid = req.body?.paid !== false;
  jobs[idx] = { ...jobs[idx], paid, paidAt: paid ? new Date().toISOString() : null };
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

  technicians[idx] = { ...technicians[idx], status };
  return res.json(technicians[idx]);
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

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));

  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`Server listening on :${PORT}`));
