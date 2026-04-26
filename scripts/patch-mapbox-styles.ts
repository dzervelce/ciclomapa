#!/usr/bin/env bun
// Patches velokarte-{light,dark}-style.json:
//   1. IBM Plex Sans Medium/Italic -> Regular (only Regular is uploaded to
//      the edgarsdna Mapbox account; Studio rewrites glyphs URL on upload)
//   2. wrap ["get","sizerank"] in coalesce to handle null features
// After running: re-upload both JSONs to Mapbox Studio.
//
// Note: do NOT touch the composite source URL or remove terrain-v2 layers.
// Firefox 403s on Mapbox vector tiles are a browser-side issue (see CLAUDE.md),
// not solvable from the style. Removing terrain-v2 only breaks landcover and
// hillshade in Chrome/Safari.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

  // 1. Font replacement
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

  // 2. Coalesce sizerank
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
    `${file}: fonts replaced=${fontReplacements}, sizerank wrapped=${sizerankBefore}`
  );
}

patch('velokarte-light-style.json');
patch('velokarte-dark-style.json');
