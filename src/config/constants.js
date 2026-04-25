/*
 * OSM & Overpass
 */

// Velokarte: aggressive freshness — refresh per-city cache if older than ~1 hour.
export const OSM_DATA_MAX_AGE_DAYS = 0.04;

export const BLACKLISTED_CITIES_FOR_EXTRA_LAYERS = [
  3600062422, // Berlin, Berlin, Germany
];

export const LENGTH_CALCULATE_STRATEGIES = [
  'random', // Consider a random side each time
  'optimistic', // Consider always the side the longest
  'pessimistic', // Consider always the side the shortest
  'average', // Ignore sides, cut total raw street length by half and call it a day
];
export const DEFAULT_LENGTH_CALCULATE_STRATEGIES = 'average';
export const LENGTH_COUNTED_LAYER_IDS = [
  'ciclovia',
  'ciclofaixa',
  'ciclorrota',
  'calcada-compartilhada',
  // 'baixa-velocidade',
  // 'trilha',
  // 'proibido',
];

// Velokarte: same-origin proxy. Public Overpass servers have unreliable CORS;
// /api/overpass forwards to overpass-api.de via Bun.
export const OVERPASS_SERVERS = ['/api/overpass'];

// Velokarte: empty by default — fill in only if a Latvian city's geocoded name
// fails to resolve to its OSM relation id automatically.
export const AREA_ID_OVERRIDES = {};

/*
 * Layout
 */

export const MOBILE_MAX_WIDTH = '480px';
export const IS_MOBILE =
  window.matchMedia && window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH})`).matches;

export { TOPBAR_HEIGHT, ROUTE_COLORS, MAP_COLORS } from './design-tokens.js';

/*
 * Routing
 */

// Settings

export const HYBRID_MAX_RESULTS_DESKTOP = 5;
export const HYBRID_MAX_RESULTS_MOBILE = 3;
export const HYBRID_MAX_RESULTS = IS_MOBILE
  ? HYBRID_MAX_RESULTS_MOBILE
  : HYBRID_MAX_RESULTS_DESKTOP;
export const MIN_ROUTE_COVERAGE_PERCENT_TO_DISPLAY = 5;

/*
 * City picker
 */
export const MAX_RECENT_CITIES = IS_MOBILE ? 3 : 6;
export const ENABLE_MAP_CLICK_TO_SET_POINTS = false;
export const ENABLE_AUTO_AREA_CHANGE_ON_POINT = false;
// Velokarte: comments / Airtable feature stripped. Code paths stay (gated by this flag).
export const ENABLE_COMMENTS = false;
export const ENABLE_SATELLITE_TOGGLE = false;

// Velokarte: Latvia only. The `labelPt` key name is preserved (callers reference
// it explicitly) but its value holds the Latvian-language country name.
export const SUPPORTED_COUNTRIES = Object.freeze([
  { code: 'lv', labelPt: 'Latvija', flag: '🇱🇻' },
]);

export const SUPPORTED_COUNTRY_CODES = Object.freeze(SUPPORTED_COUNTRIES.map((c) => c.code));

/** Mapbox Geocoder `countries`: comma-separated ISO 3166-1 alpha-2. */
export const MAPBOX_GEOCODER_COUNTRIES = SUPPORTED_COUNTRY_CODES.join(',');

/**
 * Google Places script/Autocomplete region bias (one ccTLD). Searches still
 * restrict to all `SUPPORTED_COUNTRY_CODES` via componentRestrictions.
 */
export const GOOGLE_PLACES_DEFAULT_REGION = 'lv';

export const SUPPORTED_COUNTRY_LABEL_PT_BY_CODE = Object.freeze(
  SUPPORTED_COUNTRIES.reduce((acc, { code, labelPt }) => {
    acc[code] = labelPt;
    return acc;
  }, /** @type {Record<string, string>} */ ({}))
);

/*
 * Map Layers
 */

export const DEFAULT_BORDER_WIDTH = 3;
export const DEFAULT_LINE_WIDTH_MULTIPLIER = 1;
export const LINE_WIDTH_MULTIPLIER_HOVER = 2;

export const DIRECTIONS_LINE_WIDTH = 24;
export const DIRECTIONS_LINE_BORDER_WIDTH = 4;

export const ROUTE_FIXED_WIDTH = 8;
export const ROUTE_LINE_PADDING_WIDTH = 2;
export const ROUTE_LINE_BORDER_WIDTH = 0;
export const ROUTE_LINE_BORDER_OPACITY = 0.1;

export const ROUTE_LINE_WIDTH = ROUTE_FIXED_WIDTH;
export const ROUTE_LINE_PADDING_GAP_WIDTH = ROUTE_FIXED_WIDTH + ROUTE_LINE_PADDING_WIDTH - 3;
export const ROUTE_LINE_GAP_WIDTH = ROUTE_FIXED_WIDTH - ROUTE_LINE_BORDER_WIDTH - 1;

export const NEAR_DESTINATION_POI_RADIUS_KM = 0.6; // Radius in kilometers for showing POIs near destination during route planning

// At low zoom, line widths are scaled down by dividing lineWidth by these values.
export const LOW_ZOOM_WIDTH_DIVISOR = 5;
export const ROUTES_ACTIVE_LOW_ZOOM_WIDTH_DIVISOR = 15;

// At high zoom, line widths are scaled by multiplying lineWidth by these values.
export const ROUTES_ACTIVE_HIGH_ZOOM_WIDTH_MULTIPLIER = 0.5;

/*
 * Map
 */

// Velokarte: default to Riga.
export const DEFAULT_AREA = 'Rīga, Latvija';
export const DEFAULT_LNG = 24.105186;
export const DEFAULT_LAT = 56.946285;
export const DEFAULT_ZOOM = 11;
export const INTERACTIVE_LAYERS_ZOOM_THRESHOLD = 15;
export const COMMENTS_ZOOM_THRESHOLD = 13;
export const MAP_AUTOCHANGE_AREA_ZOOM_THRESHOLD = 12;

// Velokarte: single Latvia PMTiles, regenerated hourly by VPS cron.
const DEFAULT_PMTILES_FILENAME = 'latvia.pmtiles';
export const PMTILES_FILENAME = process.env.REACT_APP_PMTILES_FILENAME || DEFAULT_PMTILES_FILENAME;

// Velokarte: MapTiler basemap style URL (with API key embedded).
// Set REACT_APP_MAPTILER_STYLE_URL in GitHub Actions Secrets.
export const MAPTILER_STYLE_URL = process.env.REACT_APP_MAPTILER_STYLE_URL || '';

/*
 * Debug & local development
 */

export const IS_PROD = window.location.hostname === 'velokarte.pocs.dev';

export const ENABLE_OFFICIAL_CITY_HALL_METRICS_COMPARISON =
  process.env.REACT_APP_ENABLE_OFFICIAL_CITY_HALL_METRICS === 'true'
    ? true
    : process.env.REACT_APP_ENABLE_OFFICIAL_CITY_HALL_METRICS === 'false'
      ? false
      : !IS_PROD;

/**
 * When true and not in production: the About modal auto-opens once on each full page load,
 * ignoring per-city welcome storage (useful to QA the modal in dev/staging).
 * When false: auto-open uses per-city persistence (once per city per browser).
 */
export const ABOUT_MODAL_ALWAYS_AUTO_OPEN_IN_NON_PROD = false;

/**
 * City switcher: persist km totals in localStorage and reload them on startup.
 * True only on production so dev / preview always hit Firestore after a full refresh (in-memory cache still applies for the current tab).
 */
export const ENABLE_CITY_SWITCHER_STATS_CACHE = IS_PROD;

export const DEFAULT_SIDEBAR_OPEN = false;
// Velokarte: name preserved for compatibility with callers; this flag now gates
// writes to our Postgres-backed /api endpoints rather than Firestore.
export const SAVE_TO_FIREBASE = true;
export const DISABLE_DATA_HEALTY_TEST = false;
export const THRESHOLD_NEW_VS_OLD_DATA_TOLERANCE = 0.1;
export const DISABLE_LOCAL_STORAGE = true;
const URL_PARAMS = new URLSearchParams(window.location.search);
export const FORCE_RECALCULATE_LENGTHS_ALWAYS = URL_PARAMS.get('debug') === 'true';

export const USE_GEOJSON_SOURCE = true;
// Velokarte: PMTiles overlay re-enabled now that we're back on real Mapbox GL JS.
// First deploy: file at /srv/velokarte/pmtiles/latvia.pmtiles must exist —
// run `systemctl start velokarte-pmtiles.service` on the VPS once after deploy.
export const USE_PMTILES_SOURCE = true;

// Providers

export const OPENROUTESERVICE_API_KEY = process.env.REACT_APP_OPENROUTESERVICE_API_KEY;
export const OPENROUTESERVICE_BASE_URL = 'https://api.openrouteservice.org/v2/directions';

export const GRAPHHOPPER_API_KEY = process.env.REACT_APP_GRAPHHOPPER_API_KEY;
export const GRAPHHOPPER_BASE_URL = 'https://graphhopper.com/api/1/route';

export const VALHALLA_BASE_URL = 'https://valhalla1.openstreetmap.de/route';

/*
 * Mapbox
 *
 * Velokarte uses Mapbox GL JS v3 with a free-tier Mapbox public token.
 * MAPTILER_STYLE_URL above is left exported but currently unused; swap it
 * back into MAP_STYLES if you ever want MapTiler tiles instead.
 */

export const MAPBOX_ACCESS_TOKEN = process.env.REACT_APP_MAPBOX_ACCESS_TOKEN;

export const GOOGLE_PLACES_API_KEY = process.env.REACT_APP_GOOGLE_PLACES_API_KEY;

// Velokarte: custom Mapbox Studio styles owned by edgarsdna's account.
// Forked from cmdalbem's upstream styles, with cmdalbem-private bits
// (sprite, glyphs, drinking-water tileset) swapped to Mapbox defaults
// so any token can resolve them. Source JSON is checked into
// repo root: velokarte-dark-style.json / velokarte-light-style.json.
// Velokarte: switched to MapTiler. Mapbox styles stored above as comments
// for posterity; they work on Chrome/Safari but Firefox + young account
// + blocked telemetry combo broke cleanly. MapTiler has no equivalent issue.
// const MAPBOX_DARK  = 'mapbox://styles/edgarsdna/cmoeuk8nk002v01sbfd3858yy';
// const MAPBOX_LIGHT = 'mapbox://styles/edgarsdna/cmoeukfo6000b01qy1kdq0zbw';
// Mapbox Standard: same URL for both, theme switches via lightPreset config
// applied in Map.js based on isDarkMode prop. 'dawn' for light, 'night' for dark.
export const MAP_STYLES = {
  DARK: 'mapbox://styles/mapbox/standard',
  LIGHT: 'mapbox://styles/mapbox/standard',
};
