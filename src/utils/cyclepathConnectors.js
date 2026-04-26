// Bends the geometry of physically-separate cycleways (`highway=cycleway`)
// where they meet a road carrying sided cycleway tags. The cycleway's
// terminal vertex is replaced by a point ~3 m perpendicular to the road,
// on the side corresponding to the lane traveling in the cyclist's direction
// (right-hand traffic). The cycleway's last segment now points directly at
// the offset side-rendering of the road instead of stopping at the OSM
// centerline node.
//
// We REPLACE the terminal vertex rather than append. Appending creates a
// short lateral segment that Mapbox's `symbol-placement: line` arrow layer
// happily decorates with its own oneway arrow, producing what reads as a
// stub branch. Replacing keeps the line a single segment per arrow.

const SIDED_KEYS = ['cycleway:left', 'cycleway:right', 'cycleway:both'];

const SIDE_TRIGGER_VALUES = new Set([
  'track',
  'opposite_track',
  'sidepath',
  'lane',
  'opposite_lane',
  'buffered_lane',
  'shared_lane',
  'share_busway',
  'opposite_share_busway',
]);

// Offset toward the adjacent lane. ~3 m matches typical lane half-widths
// and roughly tracks the Mapbox pixel offset at z16-17.
const OFFSET_METERS = 3;

const METERS_PER_LAT_DEG = 110540;
const metersPerLngDeg = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);

function isSidedRoad(tags) {
  return SIDED_KEYS.some((k) => tags[k] && SIDE_TRIGGER_VALUES.has(tags[k]));
}

// Restricted to highway=cycleway — footways/pedestrians often run alongside
// roads and produce spurious bridges.
function isCenterCyclewayWay(tags) {
  return tags.highway === 'cycleway';
}

export function augmentWithCyclepathConnectors(geoJson, rawElements) {
  if (!geoJson || !Array.isArray(geoJson.features) || !Array.isArray(rawElements)) {
    return geoJson;
  }

  // Index nodeId → [{ way, indexInWay }] for every node touched by a sided
  // road. We need the index, not just endpoints, because a separate cycleway
  // typically meets the road at one of the road's interior nodes.
  const sidedAtNode = new Map();
  // Count how many center-cycleway ways use each node. If more than one, the
  // cycleway network continues through that node and no bridge is needed.
  const centerCountAtNode = new Map();
  for (const el of rawElements) {
    if (el.type !== 'way') continue;
    const tags = el.tags || {};
    if (
      Array.isArray(el.nodes) &&
      Array.isArray(el.geometry) &&
      el.nodes.length === el.geometry.length
    ) {
      if (isSidedRoad(tags)) {
        el.nodes.forEach((nid, idx) => {
          let arr = sidedAtNode.get(nid);
          if (!arr) {
            arr = [];
            sidedAtNode.set(nid, arr);
          }
          arr.push({ way: el, indexInWay: idx });
        });
      }
      if (isCenterCyclewayWay(tags)) {
        for (const nid of el.nodes) {
          centerCountAtNode.set(nid, (centerCountAtNode.get(nid) || 0) + 1);
        }
      }
    }
  }

  // Index features by id. osmtogeojson produces feature.id as `way/<osm-id>`.
  const featureById = new Map();
  for (const f of geoJson.features) {
    if (f && f.id != null) featureById.set(String(f.id), f);
  }

  let bendsApplied = 0;

  for (const el of rawElements) {
    if (el.type !== 'way') continue;
    const tags = el.tags || {};
    if (!isCenterCyclewayWay(tags)) continue;
    if (!Array.isArray(el.nodes) || !Array.isArray(el.geometry)) continue;
    if (el.nodes.length < 2 || el.nodes.length !== el.geometry.length) continue;

    const feature = featureById.get(`way/${el.id}`);
    if (!feature || !feature.geometry || feature.geometry.type !== 'LineString') continue;
    const coords = feature.geometry.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;

    const last = el.geometry.length - 1;

    const endpoints = [
      { idx: 0, role: 'start' },
      { idx: last, role: 'end' },
    ];

    for (const ep of endpoints) {
      const nodeId = el.nodes[ep.idx];
      const matches = sidedAtNode.get(nodeId);
      if (!matches || matches.length === 0) continue;

      // Skip if another center-cycleway way also uses this node — the
      // cycleway network visually continues through, no bridge needed.
      if ((centerCountAtNode.get(nodeId) || 0) > 1) continue;

      const target = matches.find((m) => m.way.id !== el.id) || matches[0];
      const targetWay = target.way;
      const targetIdx = target.indexInWay;
      const tg = targetWay.geometry;

      // Road tangent at the connection node — central diff if interior,
      // forward/back diff at the way's own endpoints.
      let rdx;
      let rdy;
      if (targetIdx > 0 && targetIdx < tg.length - 1) {
        rdx = tg[targetIdx + 1].lon - tg[targetIdx - 1].lon;
        rdy = tg[targetIdx + 1].lat - tg[targetIdx - 1].lat;
      } else if (targetIdx === 0 && tg.length > 1) {
        rdx = tg[1].lon - tg[0].lon;
        rdy = tg[1].lat - tg[0].lat;
      } else if (targetIdx === tg.length - 1 && tg.length > 1) {
        rdx = tg[targetIdx].lon - tg[targetIdx - 1].lon;
        rdy = tg[targetIdx].lat - tg[targetIdx - 1].lat;
      } else {
        continue;
      }

      // Source flow at the endpoint: cyclist's forward motion.
      const sg = el.geometry;
      let sdx;
      let sdy;
      if (ep.idx === 0) {
        sdx = sg[1].lon - sg[0].lon;
        sdy = sg[1].lat - sg[0].lat;
      } else {
        sdx = sg[last].lon - sg[last - 1].lon;
        sdy = sg[last].lat - sg[last - 1].lat;
      }

      const epPt = sg[ep.idx];
      const lat = epPt.lat;
      const mPerLng = metersPerLngDeg(lat);
      const mPerLat = METERS_PER_LAT_DEG;

      // Normalize tangents in metric space.
      const rxM = rdx * mPerLng;
      const ryM = rdy * mPerLat;
      const rLen = Math.sqrt(rxM * rxM + ryM * ryM);
      if (rLen === 0) continue;
      const rUx = rxM / rLen;
      const rUy = ryM / rLen;

      const sxM = sdx * mPerLng;
      const syM = sdy * mPerLat;
      const sLen = Math.sqrt(sxM * sxM + syM * syM);
      if (sLen === 0) continue;
      const sUx = sxM / sLen;
      const sUy = syM / sLen;

      // Positive dot = source flows in the road's drawn direction →
      // right-of-road lane (right-hand traffic). Negative = opposite lane.
      const dot = sUx * rUx + sUy * rUy;
      const sideSign = dot >= 0 ? 1 : -1;

      // Right-hand perpendicular of road tangent.
      const offsetXMeters = sideSign * rUy * OFFSET_METERS;
      const offsetYMeters = sideSign * -rUx * OFFSET_METERS;

      const offsetLng = epPt.lon + offsetXMeters / mPerLng;
      const offsetLat = epPt.lat + offsetYMeters / mPerLat;

      // Replace the terminal coordinate so the cycleway's last segment
      // runs straight to the offset point. Appending would add a separate
      // micro-segment that Mapbox decorates with its own oneway arrow.
      // Guard: skip the rewrite if the way's last segment is shorter than
      // the offset distance, otherwise the endpoint rotates too far.
      const neighborPt = ep.idx === 0 ? sg[1] : sg[last - 1];
      const dxN = (epPt.lon - neighborPt.lon) * mPerLng;
      const dyN = (epPt.lat - neighborPt.lat) * mPerLat;
      const lastSegMeters = Math.sqrt(dxN * dxN + dyN * dyN);
      if (lastSegMeters < OFFSET_METERS * 1.5) continue;

      if (ep.idx === 0) {
        coords[0] = [offsetLng, offsetLat];
      } else {
        coords[coords.length - 1] = [offsetLng, offsetLat];
      }
      bendsApplied++;
    }
  }

  if (bendsApplied > 0) {
    console.debug('[cyclepath connectors] bent', bendsApplied, 'cycleway endpoints');
  }
  return geoJson;
}
