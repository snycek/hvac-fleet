// Address search-as-you-type using Photon (free, OpenStreetMap data).
// Shared by the server endpoint and the browser fallback.

const PHOTON_URL = 'https://photon.komoot.io/api/';

// Metro Detroit / Downriver box, so partial input doesn't match other states.
const SEARCH_AREA = { bbox: '-83.75,41.95,-82.9,42.55', lat: 42.2142, lon: -83.1499 };

const isMichiganZip = zip => !zip || /^4[89]\d{3}/.test(zip);

function photonQuery(q, layer) {
  const params = new URLSearchParams({
    q, limit: '6', lang: 'en', layer,
    bbox: SEARCH_AREA.bbox, lat: String(SEARCH_AREA.lat), lon: String(SEARCH_AREA.lon),
  });
  return `${PHOTON_URL}?${params}`;
}

function toSuggestion(feature, houseNumber) {
  const p = feature.properties || {};
  const [lng, lat] = feature.geometry?.coordinates || [];
  const street = p.street || p.name;
  const number = p.housenumber || houseNumber || '';
  const city = p.city || p.district || p.county || '';
  const zip = p.postcode || '';
  if (!street || !isMichiganZip(zip)) return null;
  const address = [number, street].filter(Boolean).join(' ');
  return {
    address,
    city,
    zip,
    label: [address, city, zip].filter(Boolean).join(', '),
    lat,
    lng,
    // true = Photon knows this exact house; false = we only know the street.
    exact: Boolean(p.housenumber),
  };
}

/**
 * Suggest addresses for what the customer has typed so far.
 * fetchJson: (url) => Promise<json>, so server and browser can supply their own fetch.
 */
export async function suggestAddresses(input, fetchJson) {
  const text = String(input || '').trim().replace(/\s+/g, ' ');
  if (text.length < 3) return [];

  const match = text.match(/^(\d+[A-Za-z]?)\s+(.+)$/);
  const houseNumber = match?.[1] || '';
  const streetPart = match ? match[2] : text;
  if (streetPart.length < 2) return [];

  const [houses, streets] = await Promise.all([
    houseNumber ? fetchJson(photonQuery(text, 'house')).catch(() => null) : null,
    fetchJson(photonQuery(streetPart, 'street')).catch(() => null),
  ]);

  const results = [
    ...(houses?.features || [])
      .filter(f => !houseNumber || String(f.properties?.housenumber || '').toLowerCase() === houseNumber.toLowerCase())
      .map(f => toSuggestion(f)),
    ...(streets?.features || []).map(f => toSuggestion(f, houseNumber)),
  ].filter(Boolean);

  // One row per address + city + zip, exact houses first.
  const seen = new Set();
  return results.filter(s => {
    const key = s.label.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 6);
}
