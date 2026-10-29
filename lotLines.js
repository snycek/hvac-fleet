// Lot lines from Wayne County's public parcel map (the county's own 2026 parcel viewer
// uses this service). Given a spot (and the typed address, when there is one), find the
// property's lot: its outline and size. Only the shape and size are used; owner names
// and tax values in the county data are never read or passed on.
const PARCELS = 'https://services1.arcgis.com/b6rkZNtCd6Mx2gvB/arcgis/rest/services/Parcels_AssessmentData/FeatureServer/0/query';

const cache = new Map(); // key → { at, lot }
const DAY = 24 * 3600 * 1000;

async function query(params) {
  const qs = new URLSearchParams({
    inSR: '4326', outSR: '4326', spatialRel: 'esriSpatialRelIntersects',
    outFields: 'Address,Shape__Area', returnGeometry: 'true', geometryPrecision: '7', f: 'json', ...params,
  });
  const res = await fetch(`${PARCELS}?${qs}`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`parcels HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'parcels error');
  return (data.features || []).filter(f => f.geometry?.rings?.[0]?.length >= 4);
}

const M_LAT = 111320;
const mLng = lat => 111320 * Math.cos((lat * Math.PI) / 180);
// Meters from a point to the nearest edge of a ring ([lng, lat] pairs); 0 when inside.
function distanceTo(ring, { lat, lng }) {
  let inside = false;
  let best = Infinity;
  const kx = mLng(lat);
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    const ax = (xi - lng) * kx, ay = (yi - lat) * M_LAT, bx = (xj - lng) * kx, by = (yj - lat) * M_LAT;
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return inside ? 0 : best;
}

// "15617 Moore Rd, Allen Park, MI" → { num: '15617', street: 'MOORE' }
function addressParts(address) {
  const m = String(address || '').toUpperCase().match(/^\s*(\d+)\s+(?:[NSEW]\.?\s+)?([A-Z0-9]+)/);
  return m ? { num: m[1], street: m[2] } : null;
}
const sameAddress = (parcelAddress, want) => {
  if (!want) return false;
  const p = String(parcelAddress || '').toUpperCase().split(/\s+/);
  return p[0] === want.num && p.includes(want.street);
};

/**
 * The lot at { lat, lng }. Typed addresses often land on the street, so nearby lots are
 * checked too: the one whose county address matches wins, otherwise the closest.
 * Returns { ring: [[lat, lng], ...], sqFt, matched } or null.
 */
export async function findLot({ lat, lng, address = '' }) {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)},${address}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 7 * DAY) return hit.lot;

  const want = addressParts(address);
  let features = await query({ geometry: `${lng},${lat}`, geometryType: 'esriGeometryPoint' });
  let pick = features[0];
  if (!pick || (want && !sameAddress(pick.attributes.Address, want))) {
    // ~40 m around the spot.
    const dLat = 40 / M_LAT, dLng = 40 / mLng(lat);
    const near = await query({ geometry: `${lng - dLng},${lat - dLat},${lng + dLng},${lat + dLat}`, geometryType: 'esriGeometryEnvelope' });
    let byAddress = near.find(f => sameAddress(f.attributes.Address, want));
    // The map pin can be well off for some addresses: look the address up by name nearby (~800 m).
    if (!byAddress && want) {
      const wLat = 800 / M_LAT, wLng = 800 / mLng(lat);
      const named = await query({
        where: `Address LIKE '${want.num} %${want.street}%'`,
        geometry: `${lng - wLng},${lat - wLat},${lng + wLng},${lat + wLat}`, geometryType: 'esriGeometryEnvelope',
      });
      byAddress = named
        .filter(f => sameAddress(f.attributes.Address, want))
        .map(f => ({ f, d: distanceTo(f.geometry.rings[0], { lat, lng }) }))
        .sort((a, b) => a.d - b.d)[0]?.f;
    }
    if (byAddress) pick = byAddress;
    else if (!pick) {
      features = near
        .map(f => ({ f, d: distanceTo(f.geometry.rings[0], { lat, lng }) }))
        .filter(x => x.d < 25)
        .sort((a, b) => a.d - b.d);
      pick = features[0]?.f;
    }
  }
  let lot = null;
  if (pick) {
    const ring = pick.geometry.rings[0].map(([x, y]) => [y, x]);
    if (ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]) ring.pop();
    lot = {
      ring: ring.slice(0, 400),
      sqFt: Math.round(Number(pick.attributes.Shape__Area) || 0),
      matched: sameAddress(pick.attributes.Address, want),
    };
  }
  if (cache.size > 2000) cache.clear();
  cache.set(key, { at: Date.now(), lot });
  return lot;
}

// Lot size in meters across (east-west, north-south) and its middle.
export function lotBox(ring) {
  const lats = ring.map(p => p[0]);
  const lngs = ring.map(p => p[1]);
  const south = Math.min(...lats), north = Math.max(...lats), west = Math.min(...lngs), east = Math.max(...lngs);
  const mid = { lat: (south + north) / 2, lng: (west + east) / 2 };
  return { mid, width: (east - west) * mLng(mid.lat), height: (north - south) * M_LAT };
}

// ---- Keep outlines on the lot ----
// Clip each lawn polygon to the lot (its convex hull, pushed out ~1.5 m because county
// lines and the photo can be off by a step or so). Lots are nearly always convex here.
function hull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), q) <= 0) lower.pop(); lower.push(q); }
  for (const q of [...p].reverse()) { while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), q) <= 0) upper.pop(); upper.push(q); }
  return lower.slice(0, -1).concat(upper.slice(0, -1)); // counter-clockwise
}
// Work in local meters: x east, y north.
const toXY = (o) => ([lat, lng]) => [(lng - o.lng) * mLng(o.lat), (lat - o.lat) * M_LAT];
const toLL = (o) => ([x, y]) => [+(o.lat + y / M_LAT).toFixed(7), +(o.lng + x / mLng(o.lat)).toFixed(7)];

function clipConvex(subject, clip) {
  let out = subject;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i], b = clip[(i + 1) % clip.length];
    const inside = p => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0;
    const cut = (p, q) => {
      const t = ((a[0] - p[0]) * (b[1] - a[1]) - (a[1] - p[1]) * (b[0] - a[0])) / ((q[0] - p[0]) * (b[1] - a[1]) - (q[1] - p[1]) * (b[0] - a[0]));
      return [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])];
    };
    const input = out;
    out = [];
    for (let k = 0; k < input.length; k++) {
      const p = input[k], q = input[(k + 1) % input.length];
      if (inside(q)) { if (!inside(p)) out.push(cut(p, q)); out.push(q); } else if (inside(p)) out.push(cut(p, q));
    }
  }
  return out;
}
// Front lot line to curb, plus room for the boulevard (60–66 ft roads here: ~5–7 m).
const STREET_REACH = 10;
const areaM2 = pts => Math.abs(pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;

/**
 * Trim zones ({ name, points: [[lat, lng]...] }) to the lot. Front yard and boulevard may
 * run past the front lot line to the curb (city strip the owner mows), but not wider than the lot.
 * Returns { zones, trimmed: how many zones lost grass outside the lot }.
 */
export function clipToLot(zones, ring) {
  const { mid } = lotBox(ring);
  const fwd = toXY(mid), back = toLL(mid);
  const h = hull(ring.map(fwd));
  // Push the hull out 1.5 m from its middle.
  const cx = h.reduce((s, p) => s + p[0], 0) / h.length, cy = h.reduce((s, p) => s + p[1], 0) / h.length;
  const grown = h.map(([x, y]) => { const d = Math.hypot(x - cx, y - cy) || 1; return [x + ((x - cx) / d) * 1.5, y + ((y - cy) / d) * 1.5]; });
  // The front lot line usually sits a few meters behind the sidewalk: the strip out to the
  // curb (front lawn edge, sidewalk, boulevard) is city land the owner mows. So the street
  // side gets the lot stretched STREET_REACH m toward the street (same width as the lot).
  const centroid = pts => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
  const streetSide = /boulevard|front/i;
  const toward = zones.find(z => /boulevard/i.test(z.name)) || zones.find(z => /front/i.test(z.name));
  let street = null;
  if (toward) {
    const [fx, fy] = centroid(toward.points.map(fwd));
    const d = Math.hypot(fx - cx, fy - cy);
    if (d > 2) {
      const ux = (fx - cx) / d, uy = (fy - cy) / d;
      street = hull([...grown, ...grown.map(([x, y]) => [x + ux * STREET_REACH, y + uy * STREET_REACH])]);
    }
  }
  let trimmed = 0;
  const out = [];
  for (const z of zones) {
    const pts = z.points.map(fwd);
    const onStreetSide = streetSide.test(z.name);
    if (onStreetSide && !street) { out.push(z); continue; } // can't tell where the street is
    const before = areaM2(pts);
    const ccw = pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) > 0 ? pts : [...pts].reverse();
    const kept = clipConvex(ccw, onStreetSide ? street : grown);
    const after = kept.length >= 3 ? areaM2(kept) : 0;
    if (after < 4) { trimmed += 1; continue; } // nothing left on the lot (under ~40 sq ft)
    if (after < before * 0.97) trimmed += 1;
    out.push({ ...z, points: after < before * 0.999 ? kept.map(back) : z.points });
  }
  return { zones: out, trimmed };
}
