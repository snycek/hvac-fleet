// Driving order for one truck's day: start at the yard, go to the nearest lawn, then the
// next nearest, then untangle any legs that cross (2-opt). Straight-line distances: close
// enough to order neighborhood stops, and free (no routing service per stop).
//
// The owner can set his own order (job.stopNo, saved on the lawn and copied to its next
// visits). Then his order wins; a new lawn without a number slots in where it adds the
// fewest miles. Lawns with no map spot go last.
import { COMPANY_INFO } from '../data/services.js';
import { metersBetween, driveEstimate } from './distance.js';

export const YARD = COMPANY_INFO.shop;
const hasSpot = p => Number.isFinite(p?.lat) && Number.isFinite(p?.lng);
const pinned = j => Number.isFinite(j.stopNo);

// Path length from start through the stops in this order (not back to the yard).
function pathMeters(order, start) {
  let m = 0, at = start;
  for (const j of order) { m += metersBetween(at, j.location); at = j.location; }
  return m;
}

function nearestFirst(stops, start) {
  const left = [...stops];
  const out = [];
  let at = start;
  while (left.length) {
    let bi = 0, bm = Infinity;
    left.forEach((j, i) => { const m = metersBetween(at, j.location); if (m < bm) { bm = m; bi = i; } });
    const [next] = left.splice(bi, 1);
    out.push(next);
    at = next.location;
  }
  return out;
}

// Reverse a stretch of the route whenever that makes it shorter (removes crossings).
function untangle(order, start) {
  let best = order, bestM = pathMeters(order, start), better = true, rounds = 0;
  while (better && rounds++ < 50) {
    better = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const cand = [...best.slice(0, i), ...best.slice(i, k + 1).reverse(), ...best.slice(k + 1)];
        const m = pathMeters(cand, start);
        if (m < bestM - 0.5) { best = cand; bestM = m; better = true; }
      }
    }
  }
  return best;
}

/** Shortest-looking order from the yard (ignores any saved order). */
export function shortestOrder(stops, start = YARD) {
  const placed = stops.filter(j => hasSpot(j.location));
  return [...untangle(nearestFirst(placed, start), start), ...stops.filter(j => !hasSpot(j.location))];
}

/** Today's stops for one truck, in driving order (the owner's order when he set one). */
export function orderStops(stops, start = YARD) {
  if (stops.length < 2) return stops;
  // Demo routes were planned on real roads already: keep them as they are.
  if (stops.every(j => j.lawnId || j.lotId)) return stops;
  if (!stops.some(pinned)) return shortestOrder(stops, start);
  const order = stops.filter(pinned).sort((a, b) => a.stopNo - b.stopNo);
  for (const j of stops.filter(s => !pinned(s) && hasSpot(s.location))) {
    // Cheapest place to add it (only between stops that have a map spot).
    let bi = order.length, bm = Infinity;
    for (let i = 0; i <= order.length; i++) {
      const a = i === 0 ? start : order[i - 1].location, b = order[i]?.location;
      if (!hasSpot(a) || (b && !hasSpot(b))) continue;
      const m = metersBetween(a, j.location) + (b ? metersBetween(j.location, b) - metersBetween(a, b) : 0);
      if (m < bm) { bm = m; bi = i; }
    }
    order.splice(bi, 0, j);
  }
  return [...order, ...stops.filter(s => !pinned(s) && !hasSpot(s.location))];
}

/** Rough drive for a route ({ miles, minutes }), yard to last stop. */
export function routeDrive(order, start = YARD) {
  return driveEstimate(pathMeters(order.filter(j => hasSpot(j.location)), start));
}
