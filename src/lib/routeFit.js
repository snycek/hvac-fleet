// Where does a new customer fit best? For each route (a day + truck), find the spot in
// its stop order that adds the least driving, then rank the routes by that cost.
// Straight-line distances — good enough to compare options; the truck still drives roads.

const R = 6371000;
export function meters(a, b) {
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export const miles = m => m / 1609.34;
export const fmtMiles = m => {
  const mi = miles(m);
  return mi < 0.1 ? '<0.1 mi' : `${mi.toFixed(1)} mi`;
};

/**
 * Cheapest place to put `p` in a route that starts and ends at `depot`.
 * stops: [{ id, lat, lng, label }] in driving order. Returns { cost, index, after, before }:
 * the new stop goes before stops[index] (index === stops.length → last stop).
 */
export function bestInsertion(stops, depot, p) {
  const pts = [depot, ...stops, depot];
  let best = { cost: Infinity, index: 0 };
  for (let i = 0; i < pts.length - 1; i++) {
    const cost = meters(pts[i], p) + meters(p, pts[i + 1]) - meters(pts[i], pts[i + 1]);
    if (cost < best.cost) best = { cost, index: i };
  }
  return {
    cost: best.cost,
    index: best.index,
    after: best.index > 0 ? stops[best.index - 1] : null,  // null = right after leaving the shop
    before: best.index < stops.length ? stops[best.index] : null, // null = last stop before home
  };
}

/**
 * Rank every route for a new stop.
 * routes: [{ key, date, day, dayLabel, techId, techName, truckName, stops: [...] }]
 * Returns the routes with { cost, index, after, before, stopsCount } added, cheapest first.
 */
export function rankRoutes(routes, depot, p) {
  return routes
    .map(r => ({ ...r, ...bestInsertion(r.stops, r.depot || depot, p), stopsCount: r.stops.length }))
    .sort((a, b) => a.cost - b.cost);
}

/** Cheapest option per day (for the day chips), in weekday order. */
export function bestPerDay(ranked) {
  const byDay = new Map();
  for (const o of ranked) if (!byDay.has(o.day) || o.cost < byDay.get(o.day).cost) byDay.set(o.day, o);
  return [...byDay.values()].sort((a, b) => a.day - b.day);
}
