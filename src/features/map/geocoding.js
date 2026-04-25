/**
 * Velokarte: reverse geocoding via Nominatim instead of Mapbox SDK.
 * The upstream version constructed an mbxGeocoding client at module load,
 * which threw "Invalid token" without a Mapbox API token.
 *
 * Public surface (`reverseGeocodePlace(lngLat)` returning `{ place_name, bbox }`)
 * is preserved so callers in Map.js don't change.
 */

const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';

export async function reverseGeocodePlace(lngLat) {
  let lng;
  let lat;

  if (lngLat && lngLat.lat !== undefined && lngLat.lng !== undefined) {
    lng = lngLat.lng;
    lat = lngLat.lat;
  } else if (Array.isArray(lngLat) && lngLat.length === 2) {
    [lng, lat] = lngLat;
  }

  if (lng === undefined || lat === undefined) {
    throw new Error('Invalid coordinates');
  }

  const url = new URL(NOMINATIM_REVERSE_URL);
  url.searchParams.set('format', 'json');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lng));
  url.searchParams.set('zoom', '10'); // ~city level
  url.searchParams.set('accept-language', 'lv,en');

  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Nominatim reverse geocoding failed: ${response.status}`);
  }

  const data = await response.json();
  if (!data || !data.display_name) {
    throw new Error('No geocoding results found');
  }

  // Nominatim returns boundingbox as [lat_min, lat_max, lng_min, lng_max] of strings.
  // Mapbox-style bbox is [lng_min, lat_min, lng_max, lat_max] of numbers.
  let bbox;
  if (Array.isArray(data.boundingbox) && data.boundingbox.length === 4) {
    const [latMin, latMax, lngMin, lngMax] = data.boundingbox.map(Number);
    if ([latMin, latMax, lngMin, lngMax].every(Number.isFinite)) {
      bbox = [lngMin, latMin, lngMax, latMax];
    }
  }

  return {
    place_name: data.display_name,
    bbox,
  };
}
