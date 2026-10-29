import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { TECH_STATUS, statusOf } from '../lib/constants.js';
import { jobDay, lawnKey, lawnStats } from '../lib/lawns.js';
import { todayString } from '../lib/dates.js';

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
  rain_delay: '#58a6ff',
};

const CAB_COLORS = {
  '#3fb950': '#2d8c3a',
  '#e67e22': '#b85c0f',
  '#9c55f7': '#6d2dcc',
  '#8b949e': '#5a6270',
  '#58a6ff': '#1f6feb',
};

// Pickup with a front plow blade, facing right. Snow spray while plowing.
function makePlowIcon(status, name) {
  const color = STATUS_COLORS[status] || '#8b949e';
  const cab = CAB_COLORS[color] || '#444';
  const initials = name.split(' ').map(n => n[0]).join('');
  const spray = status === 'busy' ? `
  <circle cx="68" cy="30" r="2.2" fill="#fff"/><circle cx="66" cy="24" r="1.8" fill="#e6f2ff"/><circle cx="70" cy="36" r="1.6" fill="#fff"/><circle cx="63" cy="20" r="1.4" fill="#fff"/>` : '';
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="72" height="52" viewBox="0 0 72 52">
  <ellipse cx="34" cy="50" rx="28" ry="3" fill="rgba(0,0,0,0.3)"/>
  ${spray}
  <!-- Bed + cab -->
  <path d="M4,28 L30,28 L30,40 L4,40 Q2,40 2,38 L2,30 Q2,28 4,28 Z" fill="${color}"/>
  <path d="M30,18 Q30,16 32,16 L42,16 Q45,16 47,20 L50,27 L54,28 Q57,29 57,32 L57,40 L30,40 Z" fill="${color}"/>
  <path d="M33,19 L42,19 Q44,19 45,21 L47,26 L33,26 Z" fill="#bfe3ff" opacity="0.85"/>
  <rect x="30" y="28" width="27" height="2" fill="${cab}"/>
  <!-- Amber light -->
  <rect x="36" y="12" width="6" height="4" rx="1.5" fill="#f0b429"/>
  <!-- Blade -->
  <path d="M58,22 Q66,30 64,44 L60,44 L60,24 Z" fill="#c9ced6" stroke="#6b7280" stroke-width="1"/>
  <rect x="56" y="33" width="5" height="3" fill="#3a3f47"/>
  <!-- Wheels -->
  <circle cx="14" cy="41" r="7" fill="#15171c"/><circle cx="14" cy="41" r="3" fill="#9aa4b2"/>
  <circle cx="46" cy="41" r="7" fill="#15171c"/><circle cx="46" cy="41" r="3" fill="#9aa4b2"/>
  <!-- Driver badge -->
  <circle cx="10" cy="11" r="8" fill="${color}" stroke="white" stroke-width="2.5"/>
  <text x="10" y="14" font-size="8" text-anchor="middle" fill="white" font-weight="bold" font-family="sans-serif">${initials}</text>
</svg>`;
  return L.divIcon({ html: svg, className: '', iconSize: [72, 52], iconAnchor: [36, 50], popupAnchor: [0, -54] });
}
const iconFor = tech => (tech.kind === 'plow' ? makePlowIcon : makeVanIcon)(tech.status, tech.name);

function makeVanIcon(status, name) {
  const color    = STATUS_COLORS[status] || '#8b949e';
  const cab      = CAB_COLORS[color] || '#444';
  const initials = name.split(' ').map(n => n[0]).join('');

  // Raindrops over a mower that's on rain delay.
  const rain = status === 'rain_delay' ? `
  <path d="M20,3 l-2,5 M30,1 l-2,5 M40,3 l-2,5 M25,9 l-2,5 M45,9 l-2,5" stroke="#58a6ff" stroke-width="2" stroke-linecap="round"/>` : '';

  // Grass flying out the side while cutting.
  const clippings = status === 'busy' ? `
  <path d="M22,47 l-3,-6 M27,48 l-1,-7 M32,47 l2,-6" stroke="#4ade80" stroke-width="2" stroke-linecap="round"/>
  <path d="M17,49 l-5,-3 M37,49 l5,-4" stroke="#86efac" stroke-width="1.6" stroke-linecap="round"/>` : '';

  // Riding mower, side view, facing right. Body color = status.
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="72" height="52" viewBox="0 0 72 52">
  <!-- Drop shadow -->
  <ellipse cx="36" cy="50" rx="27" ry="3" fill="rgba(0,0,0,0.3)"/>
  ${clippings}
  ${rain}

  <!-- Cutting deck (under the body, between the wheels) -->
  <path d="M20,40 L54,40 Q57,40 57,43 L57,45 L18,45 L18,42 Q18,40 20,40 Z" fill="#3a3f47"/>
  <rect x="18" y="43.5" width="39" height="1.6" fill="#1f2328"/>

  <!-- Body / hood -->
  <path d="M10,26 L46,26 Q60,26 66,33 L67,37 Q67,40 64,40 L12,40 Q8,40 8,36 L8,29 Q8,26 10,26 Z" fill="${color}"/>
  <path d="M46,26 Q60,26 66,33 L67,37 L52,37 Q50,30 46,26 Z" fill="${cab}"/>
  <!-- Grille -->
  <rect x="61" y="31.5" width="5" height="5" rx="1" fill="rgba(0,0,0,0.25)"/>
  <!-- Headlight -->
  <circle cx="64.5" cy="30.5" r="1.6" fill="#fff6c2"/>
  <!-- Stripe -->
  <rect x="22" y="31" width="26" height="2.4" rx="1.2" fill="rgba(255,255,255,0.45)"/>

  <!-- Seat -->
  <path d="M12,26 L28,26 Q30,26 30,23 L30,22 L14,22 Q12,22 12,24 Z" fill="#20242a"/>
  <path d="M10,26 L14,26 L16,10 Q16,8 14,8 L12,8 Q10,8 10,10 Z" fill="#20242a"/>

  <!-- Steering column + wheel -->
  <line x1="40" y1="26" x2="35" y2="13" stroke="#20242a" stroke-width="2.6" stroke-linecap="round"/>
  <ellipse cx="35" cy="12" rx="6" ry="2" fill="none" stroke="#20242a" stroke-width="2.4"/>

  <!-- Rear wheel (big) -->
  <circle cx="17" cy="39" r="10" fill="#15171c"/>
  <circle cx="17" cy="39" r="5.5" fill="#f1c40f"/>
  <circle cx="17" cy="39" r="2" fill="#15171c"/>

  <!-- Front wheel (small) -->
  <circle cx="56" cy="43" r="6" fill="#15171c"/>
  <circle cx="56" cy="43" r="3" fill="#f1c40f"/>
  <circle cx="56" cy="43" r="1.2" fill="#15171c"/>

  <!-- Foreman badge -->
  <circle cx="63" cy="9" r="8" fill="${color}" stroke="white" stroke-width="2.5"/>
  <text x="63" y="12" font-size="8" text-anchor="middle" fill="white" font-weight="bold" font-family="sans-serif">${initials}</text>
</svg>`;

  return L.divIcon({
    html:        svg,
    className:   '',
    iconSize:    [72, 52],
    iconAnchor:  [36, 50],
    popupAnchor: [0, -54],
  });
}

// today = the hub's date (the demo runs on its own calendar). Same rule as the route
// cards: this truck's stops for today; earned = the ones finished.
function buildPopup(tech, jobs, statusInfo, color, today) {
  const techJobs = jobs.filter(j => j.assignedTo === tech.id);
  const todays = techJobs.filter(j => jobDay(j, today) === today && !['quote', 'declined', 'skipped'].includes(j.status));
  const doneToday = todays.filter(j => j.status === 'completed');
  const dailyEarnings = doneToday.reduce((s, j) => s + (j.earnings || 0), 0);
  const plow = tech.kind === 'plow';
  // The lawn they're on (cutting first, then driving to, then next up).
  const activeJob = ['in_progress', 'en_route', 'assigned'].map(s => techJobs.find(j => j.status === s)).find(Boolean);
  const lawn = activeJob ? lawnStats(jobs, lawnKey(activeJob)) : null;
  const doing = { in_progress: '✂️ Cutting', en_route: '🚚 Heading to', assigned: '📅 Next' }[activeJob?.status] || '';
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

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
          <div style="font-size:16px;font-weight:800;color:#1a5cbf">${doneToday.length}<span style="font-size:11px;color:#888;font-weight:600"> of ${todays.length}</span></div>
          <div style="font-size:10px;color:#888;margin-top:1px">${plow ? 'Plowed' : 'Cut'} Today</div>
        </div>
      </div>

      ${activeJob ? `
        <div style="background:#f6fbf7;border:1px solid #9fd8ac;border-radius:8px;padding:8px 10px;font-size:12px">
          <div style="font-weight:700;color:#2d7a3a;margin-bottom:2px">${doing} · ${esc(activeJob.clientName)}</div>
          <div style="color:#888;font-size:11px;margin-bottom:6px">📍 ${esc(String(activeJob.address).split(',')[0])}</div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;text-align:center">
            <div><div style="font-weight:800;color:#111">${lawn.cuts}</div><div style="font-size:9px;color:#888">cuts</div></div>
            <div><div style="font-weight:800;color:#111">${lawn.avgMinutes != null ? lawn.avgMinutes + 'm' : '—'}</div><div style="font-size:9px;color:#888">avg</div></div>
            <div><div style="font-weight:800;color:#2d7a3a">$${Math.round(lawn.paid)}</div><div style="font-size:9px;color:#888">paid</div></div>
            <div><div style="font-weight:800;color:${lawn.owed ? '#b7791f' : '#888'}">$${Math.round(lawn.owed)}</div><div style="font-size:9px;color:#888">owed</div></div>
          </div>
          ${lawn.notes ? `<div style="margin-top:6px;color:#555">📝 ${esc(lawn.notes)}</div>` : ''}
        </div>
      ` : `
        <div style="background:#f0fff4;border:1px solid #86d998;border-radius:8px;padding:8px 10px;font-size:12px;color:#2d7a3a;text-align:center">
          ✅ No cuts left
        </div>
      `}
    </div>`;
}

const LAWN_COLORS = { completed: '#3fb950', in_progress: '#e67e22', en_route: '#9c55f7' };

/**
 * lawns:  optional [{ id, lat, lng, name, status }] drawn as dots (demo route).
 * bursts: optional [{ id, lat, lng, text }] "+$40" pills that float up and fade.
 * fitBounds: optional [[lat, lng], [lat, lng]] to frame the map (e.g. demo area).
 * outline: optional { ring: [[lat, lng], ...], label } service-area boundary (dashed).
 */
export default function FleetMap({ technicians = [], jobs = [], today = todayString(), selectedTechId = null, lawns = null, bursts = null, fitBounds = null, outline = null, lots = null, snowing = false, onPickCustomer = null }) {
  const lotLayer   = useRef(null);
  // Click a lawn or lot → that customer's card (kept in a ref so markers don't rebuild).
  const pickRef = useRef(onPickCustomer);
  useEffect(() => { pickRef.current = onPickCustomer; }, [onPickCustomer]);
  const mapRef     = useRef(null);
  const mapObj     = useRef(null);
  const markersRef = useRef({});
  const lawnLayer  = useRef(null);
  const burstRefs  = useRef({});
  const techsRef   = useRef(technicians);
  useEffect(() => { techsRef.current = technicians; }, [technicians]);

  // Initialize map once.
  useEffect(() => {
    if (!mapRef.current) return;

    if (!mapObj.current) {
      try {
        mapObj.current = L.map(mapRef.current, {
          center: [42.18, -83.19], // Downriver MI
          zoom: 12,
          zoomControl: true,
          // Locked so scrolling the page never moves the map: zoom with +/−.
          // On phones, one finger scrolls the page; two fingers move/zoom the map.
          scrollWheelZoom: false,
          dragging: !L.Browser.mobile,
          touchZoom: true,
          // Quarter-step zoom so a tall, narrow area (like ZIP 48101) fills the map snugly.
          zoomSnap: 0.25,
        });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 18,
        }).addTo(mapObj.current);
      } catch {
        mapObj.current = mapRef.current._leaflet_map || mapObj.current;
      }
    }

    return () => {
      if (mapObj.current) {
        mapObj.current.remove();
        mapObj.current = null;
        markersRef.current = {};
        lawnLayer.current = null;
        lotLayer.current = null;
        burstRefs.current = {};
      }
    };
  }, []);

  // Frame a given area (demo mode zooms to Allen Park).
  const boundsKey = fitBounds ? JSON.stringify(fitBounds) : '';
  useEffect(() => {
    if (!mapObj.current || !boundsKey) return;
    mapObj.current.fitBounds(JSON.parse(boundsKey), { padding: [30, 30] });
  }, [boundsKey]);

  // When the map's box changes size (layout stacks on narrow screens, window resizes),
  // re-measure so the view doesn't drift, and re-frame the area if one was given.
  const boundsRef = useRef(boundsKey);
  useEffect(() => { boundsRef.current = boundsKey; }, [boundsKey]);
  useEffect(() => {
    const el = mapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    let last = '';
    const ro = new ResizeObserver(([entry]) => {
      const size = `${Math.round(entry.contentRect.width)}x${Math.round(entry.contentRect.height)}`;
      if (size === last || !mapObj.current) return;
      last = size;
      mapObj.current.invalidateSize();
      if (boundsRef.current) mapObj.current.fitBounds(JSON.parse(boundsRef.current), { padding: [30, 30] });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Service-area boundary (e.g. ZIP 48101), drawn under everything else.
  const outlineKey = outline ? JSON.stringify(outline) : '';
  useEffect(() => {
    const map = mapObj.current;
    if (!map || !outlineKey) return undefined;
    const { ring, label } = JSON.parse(outlineKey);
    const shape = L.polygon(ring, { color: '#f0b429', weight: 2.5, dashArray: '8 6', fillColor: '#f0b429', fillOpacity: 0.05, interactive: false }).addTo(map);
    if (label) shape.bindTooltip(label, { permanent: true, direction: 'center', className: 'zone-label' });
    shape.bringToBack();
    return () => shape.remove();
  }, [outlineKey]);

  // Lawn dots for the demo route.
  useEffect(() => {
    const map = mapObj.current;
    if (!map) return;
    if (!lawnLayer.current) lawnLayer.current = L.layerGroup().addTo(map);
    lawnLayer.current.clearLayers();
    (lawns || []).forEach(l => {
      const color = LAWN_COLORS[l.status] || '#8b949e';
      L.circleMarker([l.lat, l.lng], { radius: 7, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1, bubblingMouseEvents: false })
        .on('click', () => { if (l.key && pickRef.current) pickRef.current(l.key); })
        .bindTooltip(`${l.name} · ${l.price}${l.key ? ' · click for account' : ''}`, { direction: 'top', offset: [0, -6] })
        .addTo(lawnLayer.current);
    });
  }, [lawns]);

  // Parking-lot outlines: the plow's geofence for each lot on today's route.
  useEffect(() => {
    const map = mapObj.current;
    if (!map) return;
    if (!lotLayer.current) lotLayer.current = L.layerGroup().addTo(map);
    lotLayer.current.clearLayers();
    (lots || []).forEach(l => {
      const color = LAWN_COLORS[l.status] || '#58a6ff';
      L.polygon(l.ring, { color, weight: 2, fillColor: color, fillOpacity: l.status === 'completed' ? 0.35 : 0.18, bubblingMouseEvents: false })
        .on('click', () => { if (l.key && pickRef.current) pickRef.current(l.key); })
        .bindTooltip(`❄️ ${l.name} · $${l.price}/push`, { direction: 'top', sticky: true })
        .addTo(lotLayer.current);
    });
  }, [lots]);

  // "+$40" pills: add new ones, drop finished ones.
  useEffect(() => {
    const map = mapObj.current;
    if (!map) return;
    const live = new Set((bursts || []).map(b => b.id));
    (bursts || []).forEach(b => {
      if (burstRefs.current[b.id]) return;
      burstRefs.current[b.id] = L.marker([b.lat, b.lng], {
        icon: L.divIcon({ className: `money-burst${b.kind === 'expense' ? ' expense' : ''}`, html: `<span>${b.text}</span>`, iconSize: [0, 0] }),
        interactive: false,
        zIndexOffset: 2000,
      }).addTo(map);
    });
    Object.keys(burstRefs.current).forEach(id => {
      if (!live.has(id)) { burstRefs.current[id].remove(); delete burstRefs.current[id]; }
    });
  }, [bursts]);

  // Sync markers from technician/job state.
  useEffect(() => {
    if (!mapObj.current) return;
    const map = mapObj.current;
    const seen = new Set();

    technicians.forEach(tech => {
      if (!tech.location?.lat) return;
      seen.add(tech.id);
      const pos        = [tech.location.lat, tech.location.lng];
      const statusInfo = statusOf(tech) || { label: tech.status };
      const color      = STATUS_COLORS[tech.status] || '#8b949e';
      const popup      = buildPopup(tech, jobs, statusInfo, color, today);

      const existing = markersRef.current[tech.id];
      if (existing) {
        existing.setLatLng(pos);
        if (existing._lawnStatus !== tech.status) {
          existing.setIcon(iconFor(tech));
          existing._lawnStatus = tech.status;
        }
        if (existing._lawnPopup !== popup) {
          existing.setPopupContent(popup);
          existing._lawnPopup = popup;
        }
      } else {
        const marker = L.marker(pos, { icon: iconFor(tech), zIndexOffset: 1000 })
          .bindPopup(popup, { maxWidth: 260 })
          .addTo(map);
        marker._lawnStatus = tech.status;
        marker._lawnPopup = popup;
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
  }, [technicians, jobs, today]);

  // Focus the truck picked in the crew list (once per pick, so moving trucks don't yank the map).
  useEffect(() => {
    if (!selectedTechId || !mapObj.current) return;
    const marker = markersRef.current[selectedTechId];
    const tech = techsRef.current.find(t => t.id === selectedTechId);
    if (!marker || !tech?.location) return;
    const map = mapObj.current;
    map.flyTo([tech.location.lat, tech.location.lng], Math.max(map.getZoom(), 14), { duration: 0.5 });
    marker.openPopup();
  }, [selectedTechId]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%', borderRadius: '8px' }} />
      {snowing && <div className="snowfall" aria-hidden="true" />}
    </div>
  );
}
