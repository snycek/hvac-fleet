// How far a new quote is from the shop and from the trucks, plus directions links.
// Card numbers are quick estimates (straight line × a road factor); "Show on map" asks a
// free road-routing service for the real drive line and time.

export function metersBetween(a, b) {
  const R = 6371000;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

const ROAD_FACTOR = 1.3;   // roads wander ~30% more than a straight line
const AVG_MPH = 25;        // neighborhood driving
const MILE = 1609.34;

/** { miles, minutes } for a straight-line distance, as a rough drive. */
export function driveEstimate(meters) {
  const miles = (meters * ROAD_FACTOR) / MILE;
  return { miles, minutes: Math.max(1, Math.round((miles / AVG_MPH) * 60 + 1)) };
}
export const fmtDrive = ({ miles, minutes }) => `${minutes} min · ${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;

const hasSpot = p => Number.isFinite(p?.lat) && Number.isFinite(p?.lng);

/** Closest truck that's out today (has a location, not off). kind: only that crew kind. */
export function nearestTruck(point, techs, kind = null) {
  if (!hasSpot(point)) return null;
  let best = null;
  for (const t of techs || []) {
    if (!hasSpot(t.location) || ['offline', 'pending_approval'].includes(t.status)) continue;
    if (kind && (t.kind || 'lawn') !== kind && !(kind === 'lawn' && !['plow', 'landscape'].includes(t.kind))) continue;
    const m = metersBetween(t.location, point);
    if (!best || m < best.meters) best = { tech: t, meters: m };
  }
  return best && { ...best, ...driveEstimate(best.meters) };
}

/** Waze on phones, Google Maps anywhere. */
export function directionsLinks(point, address = '') {
  if (hasSpot(point)) {
    return {
      waze: `https://waze.com/ul?ll=${point.lat},${point.lng}&navigate=yes`,
      google: `https://www.google.com/maps/dir/?api=1&destination=${point.lat},${point.lng}`,
    };
  }
  const q = encodeURIComponent(address);
  return { waze: `https://waze.com/ul?q=${q}&navigate=yes`, google: `https://www.google.com/maps/dir/?api=1&destination=${q}` };
}

/** Real road route between two points: { path: [[lat, lng]...], miles, minutes } or null. */
export async function roadRoute(from, to) {
  try {
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`);
    const r = (await res.json()).routes?.[0];
    if (!r) return null;
    return { path: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]), miles: r.distance / MILE, minutes: Math.max(1, Math.round(r.duration / 60)) };
  } catch {
    return null;
  }
}
