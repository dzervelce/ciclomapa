#!/usr/bin/env bun
// Patches velokarte-{light,dark}-style.json:
//   1. composite source -> mapbox-streets-v8 only (Firefox 403 workaround)
//   2. drop terrain-v2-only layers (landcover, hillshade)
//   3. IBM Plex Sans Medium/Italic -> Regular (only Regular is uploaded)
//   4. wrap ["get","sizerank"] in coalesce to handle null
// After running: re-upload both JSONs to Mapbox Studio.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TERRAIN_V2_LAYER_IDS = new Set([
  'landcover',
  'landcover-OG',
  'hillshade',
  'hillshade-OG',
]);

function coalesceSizerank(node: unknown): unknown {
  if (Array.isArray(node)) {
    if (
      node.length === 2 &&
      node[0] === 'get' &&
      node[1] === 'sizerank'
    ) {
      return ['coalesce', ['get', 'sizerank'], 0];
    }
    return node.map(coalesceSizerank);
  }
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) out[k] = coalesceSizerank(v);
    return out;
  }
  return node;
}

function patch(file: string): void {
  const path = resolve(file);
  const style = JSON.parse(readFileSync(path, 'utf8'));

  // 1. Source URL
  if (style.sources?.composite?.url) {
    style.sources.composite.url = 'mapbox://mapbox.mapbox-streets-v8';
  }

  // 2. Drop terrain-v2 layers
  const before = style.layers.length;
  style.layers = style.layers.filter(
    (l: { id?: string }) => !(l.id && TERRAIN_V2_LAYER_IDS.has(l.id))
  );
  const dropped = before - style.layers.length;

  // 3. Font replacement
  let fontReplacements = 0;
  const replaceFonts = (node: unknown): unknown => {
    if (typeof node === 'string') {
      if (node === 'IBM Plex Sans Medium' || node === 'IBM Plex Sans Italic') {
        fontReplacements++;
        return 'IBM Plex Sans Regular';
      }
      return node;
    }
    if (Array.isArray(node)) return node.map(replaceFonts);
    if (node && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node)) out[k] = replaceFonts(v);
      return out;
    }
    return node;
  };
  style.layers = replaceFonts(style.layers);

  // 4. Coalesce sizerank
  let sizerankBefore = 0;
  const countSizerank = (node: unknown): void => {
    if (Array.isArray(node)) {
      if (node.length === 2 && node[0] === 'get' && node[1] === 'sizerank')
        sizerankBefore++;
      node.forEach(countSizerank);
    } else if (node && typeof node === 'object') {
      Object.values(node).forEach(countSizerank);
    }
  };
  countSizerank(style.layers);
  style.layers = coalesceSizerank(style.layers);

  writeFileSync(path, JSON.stringify(style, null, 2) + '\n');
  console.log(
    `${file}: source=streets-v8, layers dropped=${dropped}, fonts replaced=${fontReplacements}, sizerank wrapped=${sizerankBefore}`
  );
}

patch('velokarte-light-style.json');
patch('velokarte-dark-style.json');
