// "✨ Outline my yard": a satellite photo of the property goes to Claude, which traces the
// mowable grass (front, back, side yards) as polygons. We turn the photo's pixels back into
// map coordinates and the customer adjusts the shapes like hand-drawn ones.
//
// Needs ANTHROPIC_API_KEY on the server. Without it the button says it isn't set up.
// Imagery: Esri World Imagery (same source as the quote map). A paid ArcGIS plan is
// needed for commercial use once real customers rely on it.
import Anthropic from '@anthropic-ai/sdk';

const SIZE = 512;              // image pixels (square)
// Meters across the photo: one house lot plus the neighbors' edges. The imagery service
// refuses anything sharper than ~0.2 m per pixel, so 110 m at 512 px is about as close
// as it goes; if it still says no, we step back to a wider shot.
const SPANS_M = [110, 160];
const MODEL = 'claude-opus-5-5';

let client = null;
export const outlineReady = () => Boolean(process.env.ANTHROPIC_API_KEY);
const getClient = () => (client ||= new Anthropic());

// Bounding box (lng/lat) SPAN_M meters across, centered on the pin.
function bboxAround({ lat, lng }, span) {
  const dLat = span / 2 / 111320;
  const dLng = span / 2 / (111320 * Math.cos((lat * Math.PI) / 180));
  return { west: lng - dLng, east: lng + dLng, south: lat - dLat, north: lat + dLat };
}

const SITE = process.env.PUBLIC_SITE_URL || 'https://johns.swordfishconsultinginc.com';
const getImage = async (url) => {
  // The request says it comes from John's site, so a referrer-restricted key still works.
  const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { Referer: `${SITE}/` } });
  if (!res.ok || !String(res.headers.get('content-type')).startsWith('image/')) throw new Error(`satellite photo HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer()).toString('base64');
};

// With ARCGIS_API_KEY: Esri's Static Maps service (licensed for business use, newer
// imagery). Zoom 18 at 512 px is ~0.22 m per pixel, ~113 m across, centered on the
// address with a small red dot on it. Its edges come from the Web Mercator math below
// (checked against the free photo: within ~3 m).
const R = 6378137;
const STATIC_ZOOM = 18;
function staticBox({ lat, lng }) {
  const half = (SIZE / 2) * ((2 * Math.PI * R) / (512 * 2 ** STATIC_ZOOM)); // Mercator meters
  const dLng = (half / R) * (180 / Math.PI);
  const dLat = ((half * Math.cos((lat * Math.PI) / 180)) / R) * (180 / Math.PI);
  return { west: lng - dLng, east: lng + dLng, south: lat - dLat, north: lat + dLat };
}
async function keyedPhoto(point) {
  const key = process.env.ARCGIS_API_KEY;
  if (!key) return null;
  const url = 'https://static-maps-api.arcgis.com/arcgis/rest/services/static-maps-service/v1/static-maps/arcgis/imagery/with-point'
    + `?x=${point.lng}&y=${point.lat}&zoom=${STATIC_ZOOM}&symbolStyle=circle&symbolScale=0.3&symbolColor=FF0000`
    + `&width=${SIZE}&height=${SIZE}&format=jpeg&token=${encodeURIComponent(key)}`;
  try {
    const box = staticBox(point);
    const span = Math.round(((box.east - box.west) * Math.PI / 180) * R * Math.cos((point.lat * Math.PI) / 180));
    return { photo: await getImage(url), box, span, dot: true };
  } catch (err) {
    console.warn('[OUTLINE] keyed photo failed, using the free one:', err.message);
    return null;
  }
}

// Without a key (or if it fails): the free export, by bounding box.
async function satellitePhoto(box) {
  return getImage('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export'
    + `?bbox=${box.west},${box.south},${box.east},${box.north}&bboxSR=4326&imageSR=4326`
    + `&size=${SIZE},${SIZE}&format=jpg&f=image`);
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['zones', 'note'],
  properties: {
    zones: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'points'],
        properties: {
          name: { type: 'string', enum: ['Front Yard', 'Back Yard', 'Side Yard', 'Side Yard 2', 'Parkway Strip', 'Lawn'] },
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

const promptFor = span => `This is a straight-down satellite photo, ${SIZE}×${SIZE} pixels, about ${span} meters across (north is up, ~${(span / SIZE * 100).toFixed(0)} cm per pixel). A lawn-care customer tapped the roof of their house, and that spot is the exact center of the photo (pixel ${SIZE / 2},${SIZE / 2}). The house under that spot is their property.

Outline the mowable grass that belongs to that one property, as polygons in pixel coordinates (x right, y down, 0–${SIZE - 1}):
- One polygon per lawn area: the front yard (street side), the back yard, side yards, and the strip between sidewalk and street if there is one.
- Trace each lawn to its real edges: out to where the grass actually stops (house wall, driveway, public sidewalk or street curb, fence, garden bed, or the property line). These are usually much bigger than a small box: a typical front yard runs the full width of the lot from the house to the sidewalk, and a back yard runs from the house to the rear fence.
- Leave out the house, garage, driveway, sidewalks, patios, decks, pools, sheds, gardens/mulch beds, and areas fully under thick tree cover.
- Stay on this property. Neighboring lots usually start at a fence, a hedge line, a change in mowing pattern, or halfway to the next house. If a boundary is unclear, stay a little inside it.
- Use 4–14 points per polygon, in order around the edge, adding points where the edge bends (around a driveway or a bed).
- If you can't find this property's grass (photo too dark, all trees, a parking lot), return no zones and say why in note.

In note, give one short sentence the customer will see (e.g. "Outlined your front and back lawns; check the edge by the driveway").`;

/**
 * Outline the grass around { lat, lng }. Returns { zones: [{ name, points: [[lat, lng]...] }], note }.
 */
export async function outlineYard(point) {
  let box = null;
  let photo = null;
  let span = SPANS_M[0];
  let dot = false;
  const keyed = await keyedPhoto(point);
  if (keyed) ({ box, photo, span, dot } = keyed);
  // dot: the red dot drawn on the house in the keyed photo
  else {
    for (span of SPANS_M) {
      box = bboxAround(point, span);
      try { photo = await satellitePhoto(box); break; } catch (err) { if (span === SPANS_M[SPANS_M.length - 1]) throw err; }
    }
  }
  const response = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    // On a policy decline, the API re-runs the request on Anthropic's recommended fallback.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: photo } },
        { type: 'text', text: promptFor(span) + (dot ? '\n\nA small red dot marks the spot they tapped (on their roof). The strip of credit text along the bottom edge is not part of the property.' : '') },
      ],
    }],
  });
  if (response.stop_reason === 'refusal') throw new Error('The outline request was declined.');
  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  let out;
  try { out = JSON.parse(text); } catch { throw new Error('Could not read the outline.'); }

  // Pixels → lat/lng (the photo is a plain lat/lng grid at this size).
  const toLatLng = ({ x, y }) => [
    +(box.north - (Math.min(Math.max(y, 0), SIZE) / SIZE) * (box.north - box.south)).toFixed(7),
    +(box.west + (Math.min(Math.max(x, 0), SIZE) / SIZE) * (box.east - box.west)).toFixed(7),
  ];
  const zones = (out.zones || [])
    .filter(z => Array.isArray(z.points) && z.points.length >= 3)
    .slice(0, 6)
    .map(z => ({ name: z.name, points: z.points.slice(0, 16).map(toLatLng) }));
  return { zones, note: String(out.note || '').slice(0, 200), usage: response.usage };
}
