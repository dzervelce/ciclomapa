import { get, set } from 'idb-keyval';

import { slugify } from './utils/utils.js';
import { DISABLE_LOCAL_STORAGE } from './config/constants.js';

/**
 * Velokarte Storage layer.
 *
 * Replaces upstream CicloMapa's Firestore-backed Storage with a thin REST client
 * against our own Bun + Postgres backend. The exported public surface
 * (constructor, save, load, getCityStatsDoc, getAllCitiesDocs, getAllCitiesStats,
 * normalizeStorageKey, printPOIsStats) matches upstream so callers in App.js,
 * CitySwitcherModal, etc. don't need to change.
 *
 * The local IndexedDB cache via idb-keyval is preserved.
 */

const API_BASE = '/api';

class Storage {
  constructor() {
    // No external SDK to initialize.
  }

  /**
   * Stable id for a given place. Mirrors upstream behavior so offline and
   * server-side reads/writes align even if the geocoder label varies.
   */
  normalizeStorageKey(storageKeyOrName) {
    if (!storageKeyOrName) return '';
    return slugify(String(storageKeyOrName));
  }

  /**
   * Debug-only legacy method kept so any caller that referenced it doesn't
   * crash. Returns an empty `forEach`-able shim.
   */
  getAllCitiesDocs() {
    return Promise.resolve({ forEach: () => {} });
  }

  /**
   * Debug helper used by the city switcher to seed-fetch all city stats.
   * Returns a Firestore-like `{ forEach(cb) }` shim where each cb argument
   * exposes `.id` and `.data()` to match upstream call sites.
   */
  getAllCitiesStats() {
    console.debug('[Storage] getAllCitiesStats: GET /api/stats');
    return fetch(`${API_BASE}/stats`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => ({
        forEach: (cb) =>
          rows.forEach((row) =>
            cb({ id: row.slug, data: () => ({ lengths: row.lengths }) })
          ),
      }))
      .catch((err) => {
        console.warn('[Storage] getAllCitiesStats failed:', err);
        return { forEach: () => {} };
      });
  }

  /**
   * Fetch one city stats doc.
   * @param {string} statsDocId  e.g. slugify(areaLabel)
   * @returns {Promise<{lengths: object}|null>}
   */
  async getCityStatsDoc(statsDocId) {
    const id = String(statsDocId || '').trim();
    if (!id) return null;
    try {
      const r = await fetch(`${API_BASE}/stats/${encodeURIComponent(id)}`);
      if (r.status === 404) return null;
      if (!r.ok) return null;
      const data = await r.json();
      return { lengths: data.lengths };
    } catch (e) {
      console.debug('[Storage] getCityStatsDoc failed:', id, e);
      return null;
    }
  }

  /**
   * Save GeoJSON + length stats for a city.
   * @param {string} name
   * @param {object} geoJson
   * @param {object} lengths
   * @param {object} [options]
   * @param {string} [options.storageKey]
   * @returns {Promise<void>}
   */
  async save(name, geoJson, lengths, options = {}) {
    const now = new Date();
    const storageKey = this.normalizeStorageKey(options.storageKey || name);

    // Local IndexedDB cache (immediate, even if backend fails)
    set(storageKey, {
      geoJson,
      updatedAt: now,
    }).catch((err) => console.warn('[Storage] idb set failed:', err));

    // Backend: stats first (best-effort), then full city blob (must succeed)
    try {
      await fetch(`${API_BASE}/stats/${encodeURIComponent(storageKey)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lengths }),
      });
    } catch (err) {
      console.warn('[Storage] stats PUT failed (non-fatal):', err);
    }

    const cityRes = await fetch(
      `${API_BASE}/cities/${encodeURIComponent(storageKey)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, geoJson, lengths }),
      }
    );
    if (!cityRes.ok) {
      const text = await cityRes.text().catch(() => '');
      throw new Error(`city PUT failed: ${cityRes.status} ${text}`);
    }
  }

  /**
   * Load cached city geojson. Tries local IndexedDB first (unless disabled),
   * then backend.
   * @param {string} name
   * @param {object} [options]
   * @returns {Promise<{geoJson: object, lengths: object, updatedAt: Date}|null>}
   */
  async load(name, options = {}) {
    const storageKey = this.normalizeStorageKey(options.storageKey || name);

    if (!DISABLE_LOCAL_STORAGE) {
      try {
        const local = await get(storageKey);
        if (local) {
          return {
            geoJson: local.geoJson,
            updatedAt: local.updatedAt,
            lengths: local.lengths,
          };
        }
      } catch (err) {
        console.warn('[Storage] idb get failed:', err);
      }
    }

    try {
      const r = await fetch(
        `${API_BASE}/cities/${encodeURIComponent(storageKey)}`
      );
      if (r.status === 404) return null;
      if (!r.ok) {
        console.warn('[Storage] city GET failed:', r.status);
        return null;
      }
      const data = await r.json();
      const updatedAt = data.updatedAt ? new Date(data.updatedAt) : new Date();
      this.printPOIsStats(data.geoJson);
      return {
        geoJson: data.geoJson,
        lengths: data.lengths,
        updatedAt,
      };
    } catch (err) {
      console.warn('[Storage] city GET threw:', err);
      return null;
    }
  }

  /** Lightweight POI tag accounting; behavior preserved from upstream debug helper. */
  printPOIsStats(geoJson) {
    if (!geoJson || !Array.isArray(geoJson.features)) return;
    const tagsCount = {};
    geoJson.features.forEach((f) => {
      if (f?.properties && (f.properties.shop || f.properties.amenity)) {
        for (const k in f.properties) {
          tagsCount[k] = (tagsCount[k] || 0) + 1;
        }
      }
    });
    console.debug('[Storage] POI tag counts:', Object.keys(tagsCount).length);
  }
}

export default Storage;
