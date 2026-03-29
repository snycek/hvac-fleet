import { createRequire } from 'module';
const require = createRequire(import.meta.url);

import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { mockJobs } from './src/data/mockData.js';
import { mockTechnicians } from './src/data/mockData.js';

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
];

const allowedOrigins = new Set([...defaultOrigins, ...envOrigins]);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      return callback(null, true);
    }
    return callback(new Error('CORS not allowed for this origin'));
  },
}));
app.use(express.json());

const jobs = mockJobs.map((job) => ({ ...job }));
const technicians = mockTechnicians.map((tech) => ({ ...tech }));

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
  if (!name || !service || !phone) {
    return res.status(400).json({ error: 'name, phone, and service are required' });
  }

  const fullAddress = buildAddress(address, city, zip);
  const location = await geocodeAddress(fullAddress);

  const inspectionFallback = /furnace inspection|ac inspection/i.test(service || '') ? 200 : 0;
  const resolvedEarnings = typeof earnings === 'number' ? earnings : inspectionFallback;

  const createdJob = {
    id: createJobId(),
    service,
    clientName: name,
    clientPhone: phone,
    address: fullAddress || 'Address not provided',
    location,
    status: 'pending',
    assignedTo: null,
    earnings: resolvedEarnings,
    notes: message || '',
    createdAt: new Date().toISOString(),
    bestTime: bestTime || '',
    email: email || '',
  };
  jobs.unshift(createdJob);

  const body = `🦆 New DuctTales Request\nName: ${name}\nPhone: ${phone}${email ? `\nEmail: ${email}` : ''}\nAddress: ${fullAddress || 'Not provided'}\nService: ${service}${bestTime ? `\nBest Time: ${bestTime}` : ''}\nNotes: ${message || 'None'}`;
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
  const updatedJob = {
    ...currentJob,
    status,
    completedAt: status === 'completed' ? new Date().toISOString() : currentJob.completedAt || null,
  };
  jobs[idx] = updatedJob;

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
  return res.json(updatedJob);
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
