// Replaces the "MINECRAFT" title texture that the bundled game client draws on
// its main menu with the FREECRAFT wordmark used by the launcher.
//
// The logo is not an HTML element and cannot be restyled from the page: the
// client uploads its own texture to WebGL, so the texture itself has to change
// inside the packaged assets.
//
//   node tools/patch-game-logo.mjs
//
// Re-runnable: it always rebuilds the texture from assets/freecrafter-logo.png.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng, resize } from './png.mjs';
import { readClientBundle, writeClientBundle, PAGE } from './client-bundle.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOGO = path.join(root, 'assets/freecrafter-logo.png');
export const TITLE_TEXTURE = 'assets/minecraft/textures/gui/title/minecraft.png';

// The main menu draws the title as two 155x44 tiles taken from (0,0) and
// (0,45), so the wordmark is laid out across a 310x44 strip and then split.
const TILE_W = 155;
const TILE_H = 44;
const STRIP_W = TILE_W * 2;

// The vanilla menu draws this 310px-wide strip starting at width/2 - 137, so
// it actually spans width/2 - 137 to width/2 + 173: 18px right of true
// center. Vanilla's own glyphs sit far enough from the tile edges that this
// never shows, but our wordmark fills the strip edge to edge, so we shift its
// content 18px left inside the strip to land it back on true center.
const CENTER_CORRECTION = 18;

export function buildTitleTexture(original, logo) {
  const tex = { width: original.width, height: original.height, data: Uint8Array.from(original.data) };

  // Wipe both tiles; everything below y=89 (the Realms wordmark) is left alone.
  for (let y = 0; y < TILE_H * 2 + 1; y++) {
    tex.data.fill(0, y * tex.width * 4, (y + 1) * tex.width * 4);
  }

  const scale = Math.min(STRIP_W / logo.width, TILE_H / logo.height);
  const scaled = resize(logo, Math.round(logo.width * scale), Math.round(logo.height * scale));
  const centered = (STRIP_W - scaled.width) / 2;
  const left = Math.max(0, Math.round(centered - CENTER_CORRECTION));
  const top = Math.round((TILE_H - scaled.height) / 2);

  for (let y = 0; y < scaled.height; y++) {
    for (let x = 0; x < scaled.width; x++) {
      const sx = left + x;
      const sy = top + y;
      const tx = sx < TILE_W ? sx : sx - TILE_W;
      const ty = sx < TILE_W ? sy : sy + TILE_H + 1;
      const s = (y * scaled.width + x) * 4;
      tex.data.set(scaled.data.subarray(s, s + 4), (ty * tex.width + tx) * 4);
    }
  }
  return tex;
}

const bundle = readClientBundle();
const entry = bundle.epk.entries.find((e) => e.name === TITLE_TEXTURE);
if (!entry) throw new Error('client package has no ' + TITLE_TEXTURE);
entry.content = encodePng(buildTitleTexture(decodePng(entry.content), decodePng(fs.readFileSync(LOGO))));
writeClientBundle(bundle);

console.log('patched ' + TITLE_TEXTURE + ' (' + entry.content.length + ' bytes) into ' + path.relative(root, PAGE));
