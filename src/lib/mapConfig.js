// Map settings from the server (the ArcGIS key for satellite tiles). Asked for once per
// page; maps start on the free tiles and switch over when the key arrives.
let key = null;
let loading = null;

export const getMapKey = () => key;

export function loadMapKey() {
  if (!loading) {
    loading = fetch('/api/map-config')
      .then(r => (r.ok ? r.json() : {}))
      .then(c => { key = c?.imageryKey || null; return key; })
      .catch(() => null);
  }
  return loading;
}
