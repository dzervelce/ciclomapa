#!/usr/bin/env bun
// Reverses the destructive parts of patch-mapbox-styles.ts:
//   1. Re-adds mapbox-terrain-v2 to composite source URL
//   2. Reinserts landcover/hillshade layers (sourced from cmdalbem-*-style.json)
//      after their original anchor layers
// Keeps the safe edits (font replacement, sizerank coalesce).
// After running: re-upload both JSONs to Mapbox Studio.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface Layer {
  id?: string;
  [k: string]: unknown;
}
interface Style {
  sources: Record<string, { url?: string; [k: string]: unknown }>;
  layers: Layer[];
  [k: string]: unknown;
}

const RESTORE_PLAN: Record<string, Array<{ id: string; after: string }>> = {
  'velokarte-light-style.json': [
    { id: 'landcover', after: 'land' },
    { id: 'landcover-OG', after: 'land-OG' },
    { id: 'hillshade-OG', after: 'water-OG' },
  ],
  'velokarte-dark-style.json': [
    { id: 'landcover', after: 'land' },
    { id: 'hillshade', after: 'parking' },
  ],
};

const SOURCE_FILES: Record<string, string> = {
  'velokarte-light-style.json': 'cmdalbem-light-style.json',
  'velokarte-dark-style.json': 'cmdalbem-dark-style.json',
};

const COMPOSITE_URL = 'mapbox://mapbox.mapbox-terrain-v2,mapbox.mapbox-streets-v8';

for (const [target, plan] of Object.entries(RESTORE_PLAN)) {
  const tgtPath = resolve(target);
  const srcPath = resolve(SOURCE_FILES[target]);
  const tgt: Style = JSON.parse(readFileSync(tgtPath, 'utf8'));
  const src: Style = JSON.parse(readFileSync(srcPath, 'utf8'));

  if (tgt.sources?.composite) tgt.sources.composite.url = COMPOSITE_URL;

  const srcById = new Map<string, Layer>();
  for (const l of src.layers) if (l.id) srcById.set(l.id, l);

  let added = 0;
  for (const { id, after } of plan) {
    if (tgt.layers.some((l) => l.id === id)) continue;
    const def = srcById.get(id);
    if (!def) {
      console.warn(`  ${target}: ${id} not found in ${SOURCE_FILES[target]}`);
      continue;
    }
    const anchorIdx = tgt.layers.findIndex((l) => l.id === after);
    if (anchorIdx === -1) {
      console.warn(`  ${target}: anchor ${after} for ${id} not found, appending`);
      tgt.layers.push(def);
    } else {
      tgt.layers.splice(anchorIdx + 1, 0, def);
    }
    added++;
  }

  writeFileSync(tgtPath, JSON.stringify(tgt, null, 2) + '\n');
  console.log(`${target}: composite restored, layers added=${added}`);
}
