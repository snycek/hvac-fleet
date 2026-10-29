// Shared helpers for the yard-measuring quote tool.

// Free Esri satellite imagery (no API key). Native tiles stop at zoom 19;
// Leaflet upscales past that so customers can zoom in close to trace edges.
export const SATELLITE_TILES = {
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  options: {
    maxZoom: 21,
    maxNativeZoom: 19,
    attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics',
  },
};

export const ZONE_COLORS = ['#4ade80', '#facc15', '#38bdf8', '#f472b6', '#fb923c', '#a78bfa', '#2dd4bf', '#f87171'];

export const ZONE_NAME_SUGGESTIONS = ['Front Yard', 'Back Yard', 'Side Yard', 'Garden Bed', 'Hillside', 'Parking Lot', 'Driveway', 'Sidewalks', 'Other'];

// Default view when an address can't be found: Downriver Michigan.
export const DEFAULT_CENTER = [42.2142, -83.1499];

const SQ_FT_PER_SQ_M = 10.7639;

// Geodesic area of a polygon on the earth's surface, in square feet.
// points: [[lat, lng], ...]
export function areaSqFt(points) {
  if (!points || points.length < 3) return 0;
  const R = 6378137;
  const rad = Math.PI / 180;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [lat1, lng1] = points[i];
    const [lat2, lng2] = points[(i + 1) % points.length];
    sum += (lng2 - lng1) * rad * (2 + Math.sin(lat1 * rad) + Math.sin(lat2 * rad));
  }
  return Math.abs((sum * R * R) / 2) * SQ_FT_PER_SQ_M;
}

// Instant estimate: $5 for every 500 sq ft, rounded up to the next full block.
export const PRICING = { blockSqFt: 500, pricePerBlock: 5 };

// ---- "Don't cut" areas ----
// The owner can leave an outlined area off (zone.skip): greyed on maps, not in the price,
// and the crew sees "Don't cut: …" on the stop.
export const SKIP_COLOR = '#8b949e';
export const cutSqFt = zones => (zones || []).filter(z => !z.skip).reduce((s, z) => s + (z.sqFt || 0), 0);
export const skippedZones = zones => (zones || []).filter(z => z.skip);
/** Zones with the skip list applied (indexes). */
export const withSkips = (zones, skip = []) => (zones || []).map((z, i) => (skip.includes(i) ? { ...z, skip: true } : { ...z, skip: false }));
/** The quoted price for just the areas being cut (same rate per sq ft), to the nearest $5. */
export function priceForCut(estimate, zones) {
  const all = (zones || []).reduce((s, z) => s + (z.sqFt || 0), 0);
  if (!estimate || !all) return estimate || 0;
  return Math.max(5, Math.round((estimate * cutSqFt(zones)) / all / 5) * 5);
}

export function estimatePrice(totalSqFt) {
  if (!totalSqFt) return 0;
  return Math.ceil(totalSqFt / PRICING.blockSqFt) * PRICING.pricePerBlock;
}

export function formatPrice(value) {
  return `$${Math.round(value || 0).toLocaleString()}`;
}

export function formatSqFt(value) {
  return `${Math.round(value || 0).toLocaleString()} sq ft`;
}

// Address suggestions while typing. Tries our server first, then Photon directly.
export async function fetchAddressSuggestions(text, signal) {
  try {
    const res = await fetch(`/api/address-suggest?q=${encodeURIComponent(text)}`, { signal });
    if (res.ok) return await res.json();
  } catch (err) {
    if (err.name === 'AbortError') throw err;
  }
  const { suggestAddresses } = await import('./addressSuggest.js');
  return suggestAddresses(text, url => fetch(url, { signal }).then(r => (r.ok ? r.json() : Promise.reject(new Error(r.status)))));
}

// Look up an address. Tries our server first, then OpenStreetMap directly.
export async function geocode(query) {
  const parse = (list) => {
    const hit = Array.isArray(list) ? list[0] : list;
    if (!hit) return null;
    const lat = Number(hit.lat);
    const lng = Number(hit.lng ?? hit.lon);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  };

  try {
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
    if (res.ok) {
      const found = parse(await res.json());
      if (found) return found;
    }
  } catch { /* server not running — fall through */ }

  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(query)}`);
    if (res.ok) return parse(await res.json());
  } catch { /* offline */ }
  return null;
}
