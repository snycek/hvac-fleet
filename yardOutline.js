// "✨ Outline my yard": a satellite photo of the property goes to Claude, which traces the
// mowable grass (front, back, side yards, boulevard) as polygons. We turn the photo's pixels
// back into map coordinates and the customer adjusts the shapes like hand-drawn ones.
//
// Needs ANTHROPIC_API_KEY on the server (without it the button stays hidden).
// Photo: with ARCGIS_API_KEY, the same World Imagery tiles the quote map shows (so the outline
// lines up with the picture the customer sees), then Esri's Static Maps, then the free export.
import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';
import { findLot, lotBox, clipToLot } from './lotLines.js';

const MODEL = 'claude-opus-5-5';
let client = null;
export const outlineReady = () => Boolean(process.env.ANTHROPIC_API_KEY);
const getClient = () => (client ||= new Anthropic());

const SITE = process.env.PUBLIC_SITE_URL || 'https://johns.swordfishconsultinginc.com';
const getImage = async (url) => {
  // The request says it comes from John's site, so a referrer-restricted key still works.
  const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { Referer: `${SITE}/` } });
  if (!res.ok || !String(res.headers.get('content-type')).startsWith('image/')) throw new Error(`satellite photo HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer()).toString('base64');
};

// ---- Keyed photo (Static Maps) ----
// Zoom 19: ~0.11 m per pixel, sharp enough to see garages, fences and beds. 1024 px is
// the largest size Esri allows. Edges come from Web Mercator math
// (checked against the free photo: within ~3 m).
const R = 6378137;
const KEYED_ZOOM = Number(process.env.OUTLINE_ZOOM) || 19;
// The ✛ is on their roof: the tight 512 px close-up (~56 m) traces best. From the typed
// address (pin may be in the street): 1024 px (~113 m) so the whole lot is in view.
const keyedSize = tapped => (tapped ? 512 : 1024);
function mercatorBox({ lat, lng }, zoom, size) {
  const half = (size / 2) * ((2 * Math.PI * R) / (512 * 2 ** zoom)); // Mercator meters
  const dLng = (half / R) * (180 / Math.PI);
  const dLat = ((half * Math.cos((lat * Math.PI) / 180)) / R) * (180 / Math.PI);
  return { west: lng - dLng, east: lng + dLng, south: lat - dLat, north: lat + dLat };
}
const spanMeters = (box, lat) => Math.round(((box.east - box.west) * Math.PI / 180) * R * Math.cos((lat * Math.PI) / 180));

// Big properties (church, school, business): one zoom out at full size, ~230 m across.
const WIDE = { zoom: KEYED_ZOOM - 1, size: 1024 };
// ---- Map tiles (what the quote map shows) ----
// Static Maps is a different, sharper picture that sits ~2-3 m off the map tiles here
// (14640 N Yost), so outlines traced on it landed off on the customer's map. Instead,
// stitch the map's own tiles (zoom 19, the sharpest these have) to cover the same box,
// and scale to the same pixel size so the rest of the code doesn't change.
const TILE_ZOOM = 19;
const FIT_SIZE = 1024;
const tileXY = (lat, lng) => {
  const n = 256 * 2 ** TILE_ZOOM, r = (lat * Math.PI) / 180;
  return [((lng + 180) / 360) * n, ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n];
};
async function tilePhoto(box, size, ring = null) {
  const key = process.env.ARCGIS_API_KEY;
  const [x0, y0] = tileXY(box.north, box.west);
  const [x1, y1] = tileXY(box.south, box.east);
  const tx0 = Math.floor(x0 / 256), ty0 = Math.floor(y0 / 256), tx1 = Math.floor(x1 / 256), ty1 = Math.floor(y1 / 256);
  if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) > 49) throw new Error('too many tiles');
  const jobs = [];
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    jobs.push((async () => {
      const url = `https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/${TILE_ZOOM}/${ty}/${tx}?token=${encodeURIComponent(key)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { Referer: `${SITE}/` } });
      if (!res.ok || !String(res.headers.get('content-type')).startsWith('image/')) throw new Error(`tile HTTP ${res.status}`);
      return { input: Buffer.from(await res.arrayBuffer()), left: (tx - tx0) * 256, top: (ty - ty0) * 256 };
    })());
  }
  const tiles = await Promise.all(jobs);
  const left = Math.round(x0 - tx0 * 256), top = Math.round(y0 - ty0 * 256);
  const w = Math.max(1, Math.round(x1 - x0)), h = Math.max(1, Math.round(y1 - y0));
  const mosaic = await sharp({ create: { width: (tx1 - tx0 + 1) * 256, height: (ty1 - ty0 + 1) * 256, channels: 3, background: '#000' } })
    .composite(tiles).png().toBuffer();
  // The county lot line, drawn so the AI sees it on the picture (dashed yellow, like the map).
  const toPx = ([la, ln]) => `${(((ln - box.west) / (box.east - box.west)) * size).toFixed(1)},${(((box.north - la) / (box.north - box.south)) * size).toFixed(1)}`;
  const lotLine = ring ? `<polygon points="${ring.map(toPx).join(' ')}" fill="none" stroke="#ffd400" stroke-width="${Math.max(2, size / 400)}" stroke-dasharray="${size / 80},${size / 120}"/>` : '';
  const dot = Buffer.from(`<svg width="${size}" height="${size}">${lotLine}<circle cx="${size / 2}" cy="${size / 2}" r="${Math.max(4, size / 160)}" fill="#ff0000" stroke="#fff" stroke-width="1.5"/></svg>`);
  const out = await sharp(mosaic).extract({ left, top, width: w, height: h })
    .resize(size, size, { kernel: 'lanczos3' }).composite([{ input: dot }]).jpeg({ quality: 88 }).toBuffer();
  return out.toString('base64');
}

// fit: a square this many meters across, drawn with the lot line `ring` (house lots, so the
// lot fills the photo instead of being a small patch in the middle).
async function keyedPhoto(point, wide = false, fit = null, ring = null) {
  const key = process.env.ARCGIS_API_KEY;
  if (!key) return null;
  const size = wide ? WIDE.size : keyedSize(point.tapped);
  const zoom = wide ? WIDE.zoom : KEYED_ZOOM;
  if (fit) {
    const box = bboxAround(point, fit);
    try {
      return { photo: await tilePhoto(box, FIT_SIZE, ring), box, size: FIT_SIZE, span: Math.round(fit), dot: true, lotDrawn: Boolean(ring) };
    } catch (err) {
      console.warn('[OUTLINE] fitted map tiles failed:', err.message);
    }
  }
  {
    const box = mercatorBox(point, zoom, size);
    try {
      return { photo: await tilePhoto(box, size), box, size, span: spanMeters(box, point.lat), dot: true };
    } catch (err) {
      console.warn('[OUTLINE] map tiles failed, using Static Maps:', err.message);
    }
  }
  const url = 'https://static-maps-api.arcgis.com/arcgis/rest/services/static-maps-service/v1/static-maps/arcgis/imagery/with-point'
    + `?x=${point.lng}&y=${point.lat}&zoom=${zoom}&symbolStyle=circle&symbolScale=0.4&symbolColor=FF0000`
    + `&width=${size}&height=${size}&format=jpeg&token=${encodeURIComponent(key)}`;
  try {
    const box = mercatorBox(point, zoom, size);
    return { photo: await getImage(url), box, size, span: spanMeters(box, point.lat), dot: true };
  } catch (err) {
    console.warn('[OUTLINE] keyed photo failed, using the free one:', err.message);
    return null;
  }
}

// ---- Free photo (no key, or the keyed one failed) ----
// The free service refuses anything sharper than ~0.2 m per pixel, so 110 m at 512 px;
// if it still says no, a wider shot.
const FREE_SIZE = 512;
const FREE_SPANS_M = [110, 160];
function bboxAround({ lat, lng }, span) {
  const dLat = span / 2 / 111320;
  const dLng = span / 2 / (111320 * Math.cos((lat * Math.PI) / 180));
  return { west: lng - dLng, east: lng + dLng, south: lat - dLat, north: lat + dLat };
}
async function freePhoto(point, wide = false) {
  let last = null;
  for (const span of wide ? [220] : FREE_SPANS_M) {
    const box = bboxAround(point, span);
    try {
      const photo = await getImage('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export'
        + `?bbox=${box.west},${box.south},${box.east},${box.north}&bboxSR=4326&imageSR=4326`
        + `&size=${FREE_SIZE},${FREE_SIZE}&format=jpg&f=image`);
      return { photo, box, size: FREE_SIZE, span, dot: false };
    } catch (err) { last = err; }
  }
  throw last;
}

// "Boulevard" is the local word for the grass strip between the sidewalk and the street.
const ZONE_NAMES = ['Front Yard', 'Back Yard', 'Side Yard', 'Side Yard 2', 'Boulevard', 'Lawn'];
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['layout', 'zones', 'note', 'warnings'],
  properties: {
    layout: { type: 'string' },
    warnings: { type: 'array', items: { type: 'string' } },
    zones: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'points'],
        properties: {
          name: { type: 'string', enum: ZONE_NAMES },
          points: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['x', 'y'],
              properties: { x: { type: 'integer' }, y: { type: 'integer' } },
            },
          },
        },
      },
    },
    note: { type: 'string' },
  },
};

function promptFor({ size, span, dot }, tapped, large = false, lot = null) {
  const mid = size / 2;
  const big = large
    ? `\n\nThis is a large property (like a church, school, business or park), so this photo is zoomed out to show all of it. Outline every mowable lawn area on this one property, however far it reaches (up to 10 polygons); name them Front Yard, Back Yard, Side Yard, Side Yard 2, Boulevard or Lawn by where they sit. Parking lots and paved areas are not lawn.`
    : '';
  const where = lot
    ? `The customer's lot lines, from county parcel records, are ${lot.drawn ? 'drawn on the photo as a dashed yellow line (the same polygon in pixel coordinates (x, y): ' + JSON.stringify(lot.px) + ')' : 'this polygon in pixel coordinates (x, y): ' + JSON.stringify(lot.px)}. That lot (about ${lot.sqFt.toLocaleString('en-US')} sq ft) is their property${dot ? '; the red dot is just the middle of it' : ''}.

Use those lot lines to know which property is theirs, but they are approximate: county lines are often shifted 2–3 meters (several pixels to a few dozen) from the photo. So for the actual edges on the sides and at the back, follow what you see: the driveway, fence, hedge, mowing-pattern change, or the house wall. Their lawn right beside their own house belongs to them even where the county line cuts across it; don't stop a lawn short just because the line runs through it, and don't take grass that is clearly the neighbor's just because the line reaches over it. Side edges especially: the lawn beside a house usually runs to the neighbor's driveway, fence or hedge. If the yellow line runs along their house wall or through their side grass, include the grass strip out to the neighbor's driveway or fence (stop at the edge of the neighbor's pavement; never take the neighbor's lawn on the far side of it). Before you finish, sweep the whole lot: every patch of grass inside their lot (beside the house, between the driveway and the side line, beside and behind a garage or shed, along the back fence) should be inside one of your polygons. On the street side, the front yard runs out to the public sidewalk, and the boulevard is the grass strip between that sidewalk and the street curb. The county's front line can fall anywhere from before the sidewalk to the curb, so place both by what you see, not by the line. Outline the boulevard across the width of their lot as its own polygon named "Boulevard"; most streets here have one, so look closely for it (only leave it out if the sidewalk runs right against the curb or there is no sidewalk). The sidewalk and the street pavement are never lawn.`
    : tapped
    ? `A lawn-care customer tapped the roof of their house, and that spot is the exact center of the photo (pixel ${mid},${mid}). The house under that spot is their property.`
    : `The center of the photo (pixel ${mid},${mid}) is where a lawn-care customer's typed street address landed on the map. Address points are often on the street, sidewalk or driveway in front of the house rather than on the roof: their property is the house that point belongs to (usually the closest house, facing the street the point is on).`;
  return `This is a straight-down satellite photo, ${size}×${size} pixels, about ${span} meters across (north is up, ~${((span / size) * 100).toFixed(0)} cm per pixel). ${where}

Outline the mowable grass that belongs to that one property, as polygons in pixel coordinates (x right, y down, 0–${size - 1}):
- One polygon per lawn area: the front yard (street side), the back yard, side yards, and the boulevard (the grass strip between the public sidewalk and the street) if there is one. Name that strip "Boulevard".
- Trace each lawn to its real edges: out to where the grass actually stops (house wall, driveway, public sidewalk or street curb, fence, garden bed, or the property line). These are usually much bigger than a small box: a typical front yard runs the full width of the lot from the house to the sidewalk, and a back yard runs from the house to the rear fence.
- Leave out the house, garage, driveway, sidewalks, patios, decks, pools, sheds, gardens/mulch beds, and areas fully under thick tree cover.
- Many lots here have a detached garage toward the back. The lawn usually continues beside and behind it to the rear fence or alley; include that grass too (as part of the back yard, or its own polygon). Don't stop the back yard at the garage.
- Stay on this property. Neighboring lots usually start at a fence, a hedge line, a change in mowing pattern, or halfway to the next house. If a boundary is unclear, stay a little inside it.
- Use 4–14 points per polygon, in order around the edge, adding points where the edge bends (around a driveway or a bed).
- If you can't find this property's grass (photo too dark, all trees, a parking lot), return no zones and say why in note.${big}

Before the polygons, fill in layout: a few sentences describing this lot as you see it: where the street and sidewalk are, the house, the driveway, any detached garage or shed, fences and hedges, where the lot ends on each side and at the back, and which parts are grass. Then trace from that.

In note, give one short sentence the customer will see (e.g. "Outlined your front and back lawns; check the edge by the driveway").

In warnings, list for the business owner (not the customer) anything to double-check before pricing, one short sentence each naming the area, for example: "Back yard mostly under heavy tree cover; grass there isn't outlined", "Rear lot line unclear; back yard may extend further", "Back of the lot is out of the photo". Only real concerns; leave it empty if the outline looks complete. Never mention pixel coordinates in note or warnings; describe places in plain words ("south edge below the parking lot").${dot
    ? `\n\nA small red dot marks ${tapped ? 'the spot they tapped (on their roof)' : 'the address point'}. Any strip of credit text along the bottom edge is not part of the property.`
    : ''}`;
}

/**
 * Outline the grass around { lat, lng, tapped } (tapped: the customer tapped their roof;
 * otherwise it's the typed address). Returns { zones: [{ name, points: [[lat, lng]...] }], note, usage }.
 */
// Shared call: photo + text → parsed JSON (structured output, server-side fallbacks).
async function ask(shot, text, schema, effort) {
  const response = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    // On a policy decline, the API re-runs the request on Anthropic's recommended fallback.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort, format: { type: 'json_schema', schema } },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: shot.photo } },
        { type: 'text', text },
      ],
    }],
  });
  if (response.stop_reason === 'refusal') throw new Error('The outline request was declined.');
  const out = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  try { return { out: JSON.parse(out), usage: response.usage }; } catch { throw new Error('Could not read the outline.'); }
}
// Pixel → [lat, lng] on a photo (a plain grid across its box at this size).
const pixelToLatLng = ({ box, size }, { x, y }) => [
  +(box.north - (Math.min(Math.max(y, 0), size) / size) * (box.north - box.south)).toFixed(7),
  +(box.west + (Math.min(Math.max(x, 0), size) / size) * (box.east - box.west)).toFixed(7),
];

// Step 1 for a typed address: which roof is it? The pin often lands in the street, so the
// AI finds the house the address belongs to on a wide photo, and the careful trace is then
// done on a close-up centered on that roof (the map's ✛ moves there too).
const HOUSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['found', 'x', 'y', 'large', 'reason'],
  properties: { found: { type: 'boolean' }, x: { type: 'integer' }, y: { type: 'integer' }, large: { type: 'boolean' }, reason: { type: 'string' } },
};
async function findHouse(point) {
  const shot = await keyedPhoto({ ...point, tapped: false });
  if (!shot) return null; // free photo: just trace from the address
  const mid = shot.size / 2;
  const { out } = await ask(shot, `This is a straight-down satellite photo, ${shot.size}×${shot.size} pixels, about ${shot.span} meters across (north is up). The red dot at the center (pixel ${mid},${mid}) is where a customer's typed street address landed on the map. Address points are often on the street, sidewalk or driveway in front of the house instead of on the roof.

Find the house this address belongs to: usually the closest house, facing the street the dot is on (if the dot is on a roof already, that's the house). Give the pixel at the middle of that house's main roof (not the garage) as x, y. If it's a large property instead of a house lot (a church, school, business, apartment complex or park, or its lawn clearly runs past the edge of this photo), give the middle of its main building and set large to true; for an ordinary house lot, large is false. If there's no building near the dot, set found to false. In reason, one short sentence on how you picked it. Any strip of credit text along the bottom edge is not part of the map.`, HOUSE_SCHEMA, 'medium');
  if (!out.found) return null;
  const [lat, lng] = pixelToLatLng(shot, out);
  return { lat, lng, large: Boolean(out.large) };
}

export async function outlineYard(point) {
  // County lot lines: no guessing which house or how big. Outline inside the lot.
  let lot = null;
  try { lot = await findLot(point); } catch (err) { console.warn('[OUTLINE] lot lines failed:', err.message); }
  if (lot && lot.ring.length >= 3) return outlineLot(point, lot);

  // No lot lines. Typed address: find the roof first, then trace from the roof like a tap.
  let house = null;
  if (!point.tapped) {
    try { house = await findHouse(point); } catch (err) { console.warn('[OUTLINE] find house failed:', err.message); }
    if (house) point = { lat: house.lat, lng: house.lng, tapped: true };
  }
  let large = Boolean(house?.large);
  let result = await trace(point, large);
  if (!large && result.touchesEdge && result.zones.length) {
    large = true;
    const wider = await trace(point, true).catch(err => { console.warn('[OUTLINE] wide retry failed:', err.message); return null; });
    if (wider?.zones.length) result = { ...wider, usage: addUsage(result.usage, wider.usage) };
  }
  return { zones: result.zones, note: result.note, warnings: result.warnings, usage: result.usage, house, large };
}

// Lot known: photo centered on the lot, wide when the lot doesn't fit the normal one
// (~113 m across), lot lines in the prompt, and the result trimmed to the lot.
async function outlineLot(point, lot) {
  const { mid, width, height } = lotBox(lot.ring);
  const across = Math.max(width, height) + 16;
  const wide = across > 100;
  const center = { lat: mid.lat, lng: mid.lng, tapped: false };
  // House lot: photo fitted to the lot plus ~14 m around it (street, sidewalk, boulevard,
  // neighbors' edges for context), at least 50 m so a small lot still has its street in view.
  const fit = wide ? null : Math.min(110, Math.max(50, across + 28));
  const result = await trace(center, wide, lot, fit);
  const { zones } = clipToLot(result.zones, lot.ring);
  const warnings = [...result.warnings];
  if (across > (wide ? 220 : 110)) warnings.unshift('Lot is bigger than the satellite photo; some of it may not be outlined.');
  return {
    zones, note: result.note, warnings: warnings.slice(0, 4), usage: result.usage, large: wide,
    house: point.tapped ? null : { lat: +mid.lat.toFixed(7), lng: +mid.lng.toFixed(7) },
    lot: { ring: lot.ring, sqFt: lot.sqFt },
  };
}

const addUsage = (a = {}, b = {}) => ({ input_tokens: (a.input_tokens || 0) + (b.input_tokens || 0), output_tokens: (a.output_tokens || 0) + (b.output_tokens || 0) });

async function trace(point, large, lot = null, fit = null) {
  const shot = (await keyedPhoto(point, large, fit, lot?.ring)) || (await freePhoto(point, large));
  // Lot lines in this photo's pixels (at most ~60 corners).
  let lotPx = null;
  if (lot) {
    const { box, size } = shot;
    const step = Math.ceil(lot.ring.length / 60);
    lotPx = {
      drawn: Boolean(shot.lotDrawn),
      sqFt: lot.sqFt,
      px: lot.ring.filter((_, i) => i % step === 0).map(([la, ln]) => [
        Math.round(((ln - box.west) / (box.east - box.west)) * size),
        Math.round(((box.north - la) / (box.north - box.south)) * size),
      ]),
    };
  }
  const response = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    // On a policy decline, the API re-runs the request on Anthropic's recommended fallback.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: shot.photo } },
        { type: 'text', text: promptFor(shot, point.tapped, large, lotPx) },
      ],
    }],
  });
  if (response.stop_reason === 'refusal') throw new Error('The outline request was declined.');
  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  let out;
  try { out = JSON.parse(text); } catch { throw new Error('Could not read the outline.'); }

  // Pixels → lat/lng (a plain grid across the photo's box at this size).
  const { box, size } = shot;
  const toLatLng = ({ x, y }) => [
    +(box.north - (Math.min(Math.max(y, 0), size) / size) * (box.north - box.south)).toFixed(7),
    +(box.west + (Math.min(Math.max(x, 0), size) / size) * (box.east - box.west)).toFixed(7),
  ];
  const kept = (out.zones || []).filter(z => Array.isArray(z.points) && z.points.length >= 3).slice(0, large ? 10 : 6);
  // Lawn traced right up to the photo's edge = the property keeps going past it.
  const edge = size * 0.02;
  const touchesEdge = kept.some(z => z.points.some(p => p.x <= edge || p.y <= edge || p.x >= size - edge || p.y >= size - edge * 3));
  const zones = kept.map(z => ({ name: z.name, points: z.points.slice(0, 16).map(toLatLng) }));
  const warnings = (Array.isArray(out.warnings) ? out.warnings : []).map(w => String(w).trim().slice(0, 160)).filter(Boolean).slice(0, 4);
  return { zones, note: String(out.note || '').slice(0, 200), warnings, usage: response.usage, touchesEdge };
}
