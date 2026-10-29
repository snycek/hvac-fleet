import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { SATELLITE_TILES, ZONE_COLORS, ZONE_NAME_SUGGESTIONS, areaSqFt, formatSqFt, satelliteTileUrl } from '../lib/zones.js';
import { getMapKey, loadMapKey } from '../lib/mapConfig.js';

const pinIcon = L.divIcon({
  className: 'yard-pin',
  html: '<div style="font-size:30px;line-height:30px;transform:translate(-50%,-100%);filter:drop-shadow(0 2px 3px rgba(0,0,0,.6))">📍</div>',
  iconSize: [0, 0],
});

const vertexIcon = (color) => L.divIcon({
  className: 'yard-vertex',
  html: `<div style="width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:#fff;border:3px solid ${color};box-shadow:0 1px 4px rgba(0,0,0,.6)"></div>`,
  iconSize: [0, 0],
});

function nextZoneName(zones, names = ZONE_NAME_SUGGESTIONS) {
  const used = new Set(zones.map(z => z.name));
  const free = names.find(n => n !== 'Other' && !used.has(n));
  return free || `Zone ${zones.length + 1}`;
}

/**
 * Satellite map where customers outline parts of their yard.
 * zones: [{ id, name, color, points: [[lat, lng], ...] }]
 * readOnly: just shows the zones (used on the dispatch side).
 * showArea: label zones with their square footage (customers only see names).
 */
// zoneNames: the order new zones are named in (snow quotes start with Parking Lot).
// onPickPoint: when set, the next tap on the map is handed back ({ lat, lng }) instead of
// drawing or selecting.
// crosshair + onMoveEnd: a ✛ target in the middle of the map, and the map's center
// ({ lat, lng }) each time it stops moving (the quote tool re-outlines the house under it).
export default function YardMap({ center, zones, onZonesChange, readOnly = false, height = '60vh', selectedId, onSelect, showArea = true, zoneNames, onPickPoint = null, crosshair = false, onMoveEnd = null, fitSignal = 0, lot = null }) {
  const zoneNamesRef = useRef(zoneNames);
  useEffect(() => { zoneNamesRef.current = zoneNames; }, [zoneNames]);
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const pinRef = useRef(null);
  const [mode, setMode] = useState('idle'); // 'idle' | 'drawing'
  const [draft, setDraft] = useState([]);

  // Latest values for Leaflet event handlers.
  const live = useRef({});
  const zoneLabel = (name, points) => (showArea ? `<b>${name}</b><br>${formatSqFt(areaSqFt(points))}` : `<b>${name}</b>`);
  live.current = { mode, draft, zones, onZonesChange, onSelect, onPickPoint, onMoveEnd };

  // Create the map once.
  useEffect(() => {
    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: !readOnly,
      // Small read-only maps on phones shouldn't trap page scrolling (two fingers still pan/zoom).
      dragging: !(readOnly && L.Browser.mobile),
    });
    const tiles = L.tileLayer(satelliteTileUrl(getMapKey()), SATELLITE_TILES.options).addTo(map);
    // Switch to the keyed imagery once the server says there's a key.
    if (!getMapKey()) loadMapKey().then(k => { if (k) tiles.setUrl(satelliteTileUrl(k)); });
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    map.on('moveend', () => {
      const c = map.getCenter();
      live.current.onMoveEnd?.({ lat: c.lat, lng: c.lng, zoom: map.getZoom() });
    });

    map.on('click', (e) => {
      const { mode: m, onSelect: select, onPickPoint: pick } = live.current;
      if (pick) {
        pick({ lat: e.latlng.lat, lng: e.latlng.lng });
        return;
      }
      if (m === 'drawing') {
        setDraft(d => [...d, [e.latlng.lat, e.latlng.lng]]);
      } else if (select) {
        select(null);
      }
    });

    // The map often mounts inside a container that is still sizing itself,
    // so re-measure whenever the container changes size.
    const fitZones = () => {
      const pts = live.current.zones.flatMap(z => z.points);
      if (readOnly && pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [24, 24], maxZoom: 20 });
    };
    const ro = new ResizeObserver(() => { map.invalidateSize(); fitZones(); });
    ro.observe(containerRef.current);
    return () => { ro.disconnect(); map.remove(); mapRef.current = null; pinRef.current = null; };
  }, [readOnly]);

  // Move to the property.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const allPoints = zones.flatMap(z => z.points);
    if (readOnly && allPoints.length) {
      map.fitBounds(L.latLngBounds(allPoints), { padding: [24, 24], maxZoom: 20 });
    } else if (center) {
      // Wide enough to see a whole lot (~120 m across), not just the house.
      map.setView([center.lat, center.lng], 19);
    }
    if (center && !readOnly) {
      if (pinRef.current) pinRef.current.setLatLng([center.lat, center.lng]);
      else pinRef.current = L.marker([center.lat, center.lng], { icon: pinIcon, interactive: false }).addTo(map);
    }
    // Only re-center when the property changes, not on every zone edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center?.lat, center?.lng, readOnly]);

  // Lot lines (county records): a dashed line around the property.
  const lotRef = useRef(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    lotRef.current?.remove();
    lotRef.current = lot?.length >= 3
      ? L.polygon(lot, { color: '#ffd166', weight: 2.5, dashArray: '8 6', fill: false, interactive: false }).addTo(map)
      : null;
    if (readOnly && lotRef.current && !zones.length) map.fitBounds(lotRef.current.getBounds(), { padding: [24, 24], maxZoom: 20 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lot]);

  // A new automatic outline (or the lot line) landed: zoom to show all of it (and the house pin).
  useEffect(() => {
    const map = mapRef.current;
    const pts = [...zones.flatMap(z => z.points), ...(lot || [])];
    if (!map || !fitSignal || !pts.length) return;
    if (center) pts.push([center.lat, center.lng]);
    map.fitBounds(L.latLngBounds(pts), { padding: [36, 36], maxZoom: 20 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitSignal]);

  // Picking a point: crosshair cursor.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || mode === 'drawing') return;
    map.getContainer().style.cursor = onPickPoint ? 'crosshair' : '';
  }, [onPickPoint, mode]);

  // Drawing mode tweaks.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (mode === 'drawing') {
      map.doubleClickZoom.disable();
      map.getContainer().style.cursor = 'crosshair';
    } else {
      map.doubleClickZoom.enable();
      map.getContainer().style.cursor = '';
    }
  }, [mode]);

  // Redraw zones + draft whenever they change.
  useEffect(() => {
    const group = layerRef.current;
    if (!group) return;
    group.clearLayers();
    const drawing = mode === 'drawing';

    zones.forEach(zone => {
      const selected = zone.id === selectedId;
      // "Don't cut" areas: grey and dashed.
      const color = zone.skip ? '#8b949e' : zone.color;
      const poly = L.polygon(zone.points, {
        color,
        weight: selected ? 4 : 2,
        dashArray: zone.skip ? '6 5' : null,
        fillColor: color,
        fillOpacity: zone.skip ? 0.12 : selected ? 0.4 : 0.28,
        interactive: !drawing && !readOnly,
      }).addTo(group);
      poly.bindTooltip(zone.skip ? `🚫 ${zone.name}<br>don't cut` : zoneLabel(zone.name, zone.points), {
        permanent: true, direction: 'center', className: 'zone-label',
      });
      poly.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        live.current.onSelect?.(zone.id);
      });

      // Draggable corners on the selected zone.
      if (selected && !drawing && !readOnly) {
        zone.points.forEach((pt, idx) => {
          const handle = L.marker(pt, { icon: vertexIcon(zone.color), draggable: true }).addTo(group);
          handle.on('drag', (e) => {
            const pts = zone.points.map((p, i) => (i === idx ? [e.latlng.lat, e.latlng.lng] : p));
            poly.setLatLngs(pts);
            poly.setTooltipContent(zoneLabel(zone.name, pts));
          });
          handle.on('dragend', (e) => {
            const { lat, lng } = e.target.getLatLng();
            const { zones: current, onZonesChange: change } = live.current;
            change(current.map(z => z.id === zone.id
              ? { ...z, points: z.points.map((p, i) => (i === idx ? [lat, lng] : p)) }
              : z));
          });
        });
      }
    });

    if (drawing && draft.length) {
      const color = ZONE_COLORS[zones.length % ZONE_COLORS.length];
      if (draft.length >= 3) {
        L.polygon(draft, { color, weight: 2, dashArray: '6 6', fillColor: color, fillOpacity: 0.2, interactive: false }).addTo(group);
      } else {
        L.polyline(draft, { color, weight: 3, interactive: false }).addTo(group);
      }
      draft.forEach((pt, idx) => {
        const isFirst = idx === 0;
        const dot = L.circleMarker(pt, {
          radius: isFirst && draft.length >= 3 ? 9 : 6,
          color: '#fff', weight: 2, fillColor: color, fillOpacity: 1,
          interactive: isFirst,
        }).addTo(group);
        if (isFirst) {
          dot.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            finishZone();
          });
        }
      });
    }
    // finishZone reads from live ref, safe to leave out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zones, draft, mode, selectedId, readOnly]);

  function startZone() {
    setDraft([]);
    setMode('drawing');
    onSelect?.(null);
  }

  function finishZone() {
    const { draft: pts, zones: current, onZonesChange: change } = live.current;
    if (pts.length < 3) return;
    const zone = {
      id: `zone-${Date.now()}`,
      name: nextZoneName(current, zoneNamesRef.current),
      color: ZONE_COLORS[current.length % ZONE_COLORS.length],
      points: pts,
    };
    change([...current, zone]);
    setDraft([]);
    setMode('idle');
    onSelect?.(zone.id);
  }

  function cancelZone() {
    setDraft([]);
    setMode('idle');
  }

  const draftArea = draft.length >= 3 ? areaSqFt(draft) : 0;

  return (
    <div>
      {!readOnly && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '10px', minHeight: '40px' }}>
          {mode === 'idle' ? (
            <>
              <button type="button" className="btn-primary" onClick={startZone} style={{ padding: '9px 18px' }}>
                ＋ Draw a Zone
              </button>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                {zones.length ? 'Tap a zone to select it, then drag its corners to adjust.' : 'Outline each area you want serviced.'}
              </span>
            </>
          ) : (
            <>
              <button type="button" className="btn-primary" onClick={finishZone} disabled={draft.length < 3}
                style={{ padding: '9px 18px', opacity: draft.length < 3 ? 0.5 : 1 }}>
                ✓ Finish Zone
              </button>
              <button type="button" className="btn-ghost" onClick={() => setDraft(d => d.slice(0, -1))} disabled={!draft.length} style={{ padding: '9px 14px' }}>
                ↶ Undo Point
              </button>
              <button type="button" className="btn-ghost" onClick={cancelZone} style={{ padding: '9px 14px' }}>
                Cancel
              </button>
              <span style={{ fontSize: '13px', color: 'var(--accent-teal)', fontWeight: 600 }}>
                {draft.length < 3
                  ? `Tap the map to place corners (${draft.length} placed, need 3+)`
                  : `${showArea ? `${formatSqFt(draftArea)} — ` : ''}Tap the first corner or Finish to close`}
              </span>
            </>
          )}
        </div>
      )}
      <div style={{ position: 'relative' }}>
        <div
          ref={containerRef}
          style={{ height, width: '100%', borderRadius: '10px', border: '1px solid var(--border)', overflow: 'hidden', background: '#111' }}
        />
        {crosshair && mode !== 'drawing' && <div className="map-crosshair" aria-hidden="true" />}
      </div>
    </div>
  );
}
