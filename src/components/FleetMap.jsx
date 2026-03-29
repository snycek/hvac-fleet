import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { TECH_STATUS } from '../lib/constants.js';

// Fix Leaflet default icon URLs broken by Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const STATUS_COLORS = {
  available: '#3fb950',
  busy:      '#e67e22',
  en_route:  '#9c55f7',
  offline:   '#8b949e',
};

const CAB_COLORS = {
  '#3fb950': '#2d8c3a',
  '#e67e22': '#b85c0f',
  '#9c55f7': '#6d2dcc',
  '#8b949e': '#5a6270',
};

function makeVanIcon(status, name) {
  const color    = STATUS_COLORS[status] || '#8b949e';
  const cab      = CAB_COLORS[color] || '#444';
  const initials = name.split(' ').map(n => n[0]).join('');

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="72" height="52" viewBox="0 0 72 52">
  <!-- Drop shadow -->
  <ellipse cx="34" cy="50" rx="26" ry="3.5" fill="rgba(0,0,0,0.28)"/>

  <!-- Van body (cargo section) -->
  <rect x="2" y="13" width="44" height="24" rx="5" fill="${color}"/>

  <!-- Cab section -->
  <path d="M42,13 L60,13 Q68,13 68,20 L68,33 Q68,37 62,37 L42,37 Z" fill="${cab}"/>

  <!-- Windshield -->
  <path d="M43,15 L58,15 Q65,15 65,20 L65,27 L43,27 Z" fill="#b8dff5" opacity="0.88"/>

  <!-- Door window -->
  <rect x="31" y="15" width="10" height="10" rx="2.5" fill="#b8dff5" opacity="0.72"/>

  <!-- Cab/body divider -->
  <line x1="42" y1="13" x2="42" y2="37" stroke="rgba(0,0,0,0.25)" stroke-width="2"/>

  <!-- Door handle -->
  <rect x="34" y="28" width="5" height="2" rx="1" fill="rgba(255,255,255,0.45)"/>

  <!-- Snowflake on body -->
  <text x="20" y="30" font-size="16" text-anchor="middle">❄️</text>

  <!-- Front bumper -->
  <rect x="64" y="32" width="5" height="4" rx="2" fill="${cab}"/>

  <!-- Rear bumper -->
  <rect x="2" y="32" width="5" height="5" rx="1.5" fill="${color}"/>

  <!-- Rear wheel -->
  <circle cx="15" cy="38" r="8" fill="#1a1a2e"/>
  <circle cx="15" cy="38" r="4.5" fill="#2e2e44"/>
  <circle cx="15" cy="38" r="2"   fill="#555577"/>

  <!-- Front wheel -->
  <circle cx="53" cy="38" r="8" fill="#1a1a2e"/>
  <circle cx="53" cy="38" r="4.5" fill="#2e2e44"/>
  <circle cx="53" cy="38" r="2"   fill="#555577"/>

  <!-- Wheel arches -->
  <path d="M7,31 Q7,26 15,26 Q23,26 23,31"  fill="${color}" stroke="rgba(0,0,0,0.2)" stroke-width="1"/>
  <path d="M45,31 Q45,26 53,26 Q61,26 61,31" fill="${cab}"   stroke="rgba(0,0,0,0.2)" stroke-width="1"/>

  <!-- Status badge -->
  <circle cx="65" cy="7" r="8"   fill="${color}" stroke="white" stroke-width="2.5"/>
  <text   x="65" y="11" font-size="8" text-anchor="middle" fill="white" font-weight="bold">${initials}</text>
</svg>`;

  return L.divIcon({
    html:        svg,
    className:   '',
    iconSize:    [72, 52],
    iconAnchor:  [36, 50],
    popupAnchor: [0, -54],
  });
}

function buildPopup(tech, jobs, statusInfo, color) {
  const today = new Date().toISOString().split('T')[0];
  const techJobs = jobs.filter(j => j.assignedTo === tech.id);
  const completedToday = techJobs.filter(j =>
    j.status === 'completed' && (j.completedAt || j.createdAt || '').startsWith(today)
  );
  const totalCompleted = techJobs.filter(j => j.status === 'completed').length;
  // fallback: if no "today" completed jobs, show all completed (demo data)
  const completedForEarnings = completedToday.length ? completedToday : techJobs.filter(j => j.status === 'completed');
  const dailyEarnings = completedForEarnings.reduce((s, j) => s + (j.earnings || 0), 0);
  const activeJob = techJobs.find(j => ['assigned', 'en_route', 'in_progress'].includes(j.status));

  const statusDot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:5px;vertical-align:middle"></span>`;

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-width:210px;padding:2px 0">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid #e0e0e0">
        <div style="width:38px;height:38px;border-radius:50%;background:${color}22;border:2px solid ${color}66;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:${color};flex-shrink:0">
          ${tech.name.split(' ').map(n => n[0]).join('')}
        </div>
        <div>
          <div style="font-weight:700;font-size:15px;color:#111;line-height:1.2">${tech.name}</div>
          <div style="font-size:12px;margin-top:2px">${statusDot}<span style="color:${color};font-weight:600">${statusInfo.label}</span></div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
        <div style="background:#f5f5f5;border-radius:8px;padding:8px 10px;text-align:center">
          <div style="font-size:16px;font-weight:800;color:#2d7a3a">$${dailyEarnings.toFixed(0)}</div>
          <div style="font-size:10px;color:#888;margin-top:1px">Today's Earnings</div>
        </div>
        <div style="background:#f5f5f5;border-radius:8px;padding:8px 10px;text-align:center">
          <div style="font-size:16px;font-weight:800;color:#1a5cbf">${totalCompleted}</div>
          <div style="font-size:10px;color:#888;margin-top:1px">Jobs Done</div>
        </div>
      </div>

      ${activeJob ? `
        <div style="background:#fff8f0;border:1px solid #e6c07b;border-radius:8px;padding:8px 10px;font-size:12px">
          <div style="font-weight:600;color:#b85c0f;margin-bottom:2px">🔧 Current Job</div>
          <div style="color:#555">${activeJob.service}</div>
          <div style="color:#888;margin-top:2px;font-size:11px">📍 ${activeJob.address}</div>
        </div>
      ` : `
        <div style="background:#f0fff4;border:1px solid #86d998;border-radius:8px;padding:8px 10px;font-size:12px;color:#2d7a3a;text-align:center">
          ✅ Available for dispatch
        </div>
      `}
    </div>`;
}

export default function FleetMap({ technicians = [], jobs = [], selectedTechId = null }) {
  const mapRef     = useRef(null);
  const mapObj     = useRef(null);
  const markersRef = useRef({});

  // Initialize map once.
  useEffect(() => {
    if (!mapRef.current) return;

    if (!mapObj.current) {
      try {
        mapObj.current = L.map(mapRef.current, {
          center: [42.18, -83.19], // Downriver MI
          zoom: 12,
          zoomControl: true,
        });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 18,
        }).addTo(mapObj.current);
      } catch (e) {
        mapObj.current = mapRef.current._leaflet_map || mapObj.current;
      }
    }

    return () => {
      if (mapObj.current) {
        mapObj.current.remove();
        mapObj.current = null;
        markersRef.current = {};
      }
    };
  }, []);

  // Sync markers from technician/job state.
  useEffect(() => {
    if (!mapObj.current) return;
    const map = mapObj.current;
    const seen = new Set();

    technicians.forEach(tech => {
      if (!tech.location?.lat) return;
      seen.add(tech.id);
      const pos        = [tech.location.lat, tech.location.lng];
      const statusInfo = TECH_STATUS[tech.status] || { label: tech.status };
      const color      = STATUS_COLORS[tech.status] || '#8b949e';
      const popup      = buildPopup(tech, jobs, statusInfo, color);

      if (markersRef.current[tech.id]) {
        markersRef.current[tech.id].setLatLng(pos);
        markersRef.current[tech.id].setIcon(makeVanIcon(tech.status, tech.name));
        markersRef.current[tech.id].setPopupContent(popup);
      } else {
        const marker = L.marker(pos, { icon: makeVanIcon(tech.status, tech.name) })
          .bindPopup(popup, { maxWidth: 260 })
          .addTo(map);
        markersRef.current[tech.id] = marker;
      }
    });

    // Remove stale markers
    Object.keys(markersRef.current).forEach(id => {
      if (!seen.has(id)) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
      }
    });
  }, [technicians, jobs]);

  // Focus selected technician marker from fleet list.
  useEffect(() => {
    if (!selectedTechId || !mapObj.current) return;
    const marker = markersRef.current[selectedTechId];
    if (!marker) return;

    const map = mapObj.current;
    map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), 13), { duration: 0.5 });
    marker.openPopup();
  }, [selectedTechId, technicians]);

  return (
    <div ref={mapRef} style={{ width: '100%', height: '100%', borderRadius: '8px' }} />
  );
}
