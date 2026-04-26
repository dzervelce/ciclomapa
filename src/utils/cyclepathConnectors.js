// Generates synthetic 2-vertex connector LineStrings that visually bridge a
// physically-separate cycleway (e.g. `highway=cycleway`) to the offset side
// rendering of a connecting road that carries `cycleway:left/right/both=*`.
//
// Without these connectors the cycleway way's endpoint sits on the road's
// OSM centerline, while the road's sided rendering is offset by ~lineWidth
// pixels — producing a visible gap. The connectors inherit the source way's
// tags so they render in the same Mapbox layer (same color/dash) and round
// line-caps smooth the joint.

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

// Approximate offset toward the adjacent lane. ~3 m matches typical lane
// half-widths and roughly tracks the Mapbox pixel offset at z16-17.
const OFFSET_METERS = 3;

const METERS_PER_LAT_DEG = 110540;
const metersPerLngDeg = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);

function isSidedRoad(tags) {
  return SIDED_KEYS.some((k) => tags[k] && SIDE_TRIGGER_VALUES.has(tags[k]));
}

// A way whose cyclepath rendering is on its own centerline (not a road
// carrying a painted lane). These are the candidates whose endpoints we try
// to bridge to nearby sided roads. Restricted to highway=cycleway for now —
// footways/pedestrians often run alongside roads and produce spurious bridges.
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
    if (Array.isArray(el.nodes) && Array.isArray(el.geometry) && el.nodes.length === el.geometry.length) {
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

  const connectors = [];

  for (const el of rawElements) {
    if (el.type !== 'way') continue;
    const tags = el.tags || {};
    if (!isCenterCyclewayWay(tags)) continue;
    if (!Array.isArray(el.nodes) || !Array.isArray(el.geometry)) continue;
    if (el.nodes.length < 2 || el.nodes.length !== el.geometry.length) continue;

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

      // Prefer a target way different from the source. Source shouldn't be
      // sided itself per isCenterCyclewayWay, but be safe.
      const target = matches.find((m) => m.way.id !== el.id) || matches[0];
      const targetWay = target.way;
      const targetIdx = target.indexInWay;
      const tg = targetWay.geometry;

      // Road tangent at the connection node — central difference if interior,
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

      // Source flow at the endpoint: cyclist's forward motion. For the start
      // node the flow leaves the node toward node 1; for the end node the
      // flow arrives from node N-2.
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

      // Normalize the road tangent in metric space.
      const rxM = rdx * mPerLng;
      const ryM = rdy * mPerLat;
      const rLen = Math.sqrt(rxM * rxM + ryM * ryM);
      if (rLen === 0) continue;
      const rUx = rxM / rLen;
      const rUy = ryM / rLen;

      // Source direction in metric space, normalized.
      const sxM = sdx * mPerLng;
      const syM = sdy * mPerLat;
      const sLen = Math.sqrt(sxM * sxM + syM * syM);
      if (sLen === 0) continue;
      const sUx = sxM / sLen;
      const sUy = syM / sLen;

      // Sign of the dot product picks the lane: positive = source flows the
      // same way as the road's drawn direction → cyclist enters the lane on
      // the right of the road's drawn direction (right-hand traffic).
      const dot = sUx * rUx + sUy * rUy;
      const sideSign = dot >= 0 ? 1 : -1;

      // Right-hand perpendicular of the road tangent: (rUy, -rUx).
      const offsetXMeters = sideSign * rUy * OFFSET_METERS;
      const offsetYMeters = sideSign * -rUx * OFFSET_METERS;

      const offsetLng = epPt.lon + offsetXMeters / mPerLng;
      const offsetLat = epPt.lat + offsetYMeters / mPerLat;

      connectors.push({
        type: 'Feature',
        id: `connector-${el.id}-${ep.role}`,
        properties: {
          ...tags,
          'velokarte:synthetic': 'connector',
        },
        geometry: {
          type: 'LineString',
          coordinates: [
            [epPt.lon, epPt.lat],
            [offsetLng, offsetLat],
          ],
        },
      });
      console.debug('[cyclepath connector emitted]', {
        sourceWayId: el.id,
        sourceTags: tags,
        endpoint: ep.role,
        endpointCoord: [epPt.lon, epPt.lat],
        targetRoadId: targetWay.id,
        targetTags: targetWay.tags,
        offsetCoord: [offsetLng, offsetLat],
        sideSign,
      });
    }
  }

  // Diagnostic: prints how many sided roads we indexed, how many separate
  // cycleway endpoints we examined, and how many connectors we emitted. Helps
  // debug "no connectors generated" cases (most likely cause: Overpass response
  // shape differs from expected — `nodes` / `geometry` arrays missing).
  let sourceWayCount = 0;
  let sourceEndpointsExamined = 0;
  for (const el of rawElements) {
    if (el.type === 'way' && isCenterCyclewayWay(el.tags || {})) {
      sourceWayCount++;
      if (Array.isArray(el.nodes) && Array.isArray(el.geometry)) {
        sourceEndpointsExamined += 2;
      }
    }
  }
  console.debug('[cyclepath connectors]', {
    sidedRoadNodes: sidedAtNode.size,
    sourceWayCount,
    sourceEndpointsExamined,
    connectorsEmitted: connectors.length,
    sampleSourceWayKeys:
      rawElements.find((el) => el.type === 'way' && isCenterCyclewayWay(el.tags || {})) &&
      Object.keys(rawElements.find((el) => el.type === 'way' && isCenterCyclewayWay(el.tags || {}))),
  });

  if (connectors.length === 0) return geoJson;
  return {
    ...geoJson,
    features: [...geoJson.features, ...connectors],
  };
}
