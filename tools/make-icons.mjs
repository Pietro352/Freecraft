// Genera le icone dell'app (assets/icon-192.png e assets/icon-512.png) partendo
// da assets/favicon.svg, cosi' l'icona che si vede quando si aggiunge Freecraft
// alla schermata iniziale del telefono e' esattamente la stessa che si vede
// nella linguetta del browser, e non puo' scordarsi indietro se cambiamo una.
//
// La favicon e' pixel art 32x32 fatta solo di rettangoli, e 192 e 512 sono
// multipli esatti di 32 (6x e 16x): ogni quadretto diventa un blocco perfetto,
// senza sfocature.
//
// Uso: node tools/make-icons.mjs

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng, resize } from "./png.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SIZE = 32;

const svg = await readFile(join(root, "assets/favicon.svg"), "utf8");

// I rettangoli, in ordine di disegno: prima quelli scritti come <rect>, poi
// quelli dentro i <path>. L'SVG li elenca gia' nell'ordine giusto, dal fondo
// verso i dettagli sopra, quindi li raccogliamo scorrendo il file una volta.
const shapes = [];
for (const match of svg.matchAll(/<(rect|path)\b([^>]*)>/g)) {
  const [, tag, attributes] = match;
  const fill = /fill="([^"]+)"/.exec(attributes)?.[1] ?? "#000000";
  if (tag === "rect") {
    const number = (name) => Number(new RegExp(`\\b${name}="([^"]+)"`).exec(attributes)?.[1] ?? 0);
    shapes.push({ fill, x: number("x"), y: number("y"), w: number("width"), h: number("height") });
    continue;
  }
  const d = /d="([^"]+)"/.exec(attributes)?.[1] ?? "";
  shapes.push(...rectanglesFromPath(d).map((rect) => ({ fill, ...rect })));
}

// I path della favicon sono tutti rettangoli scritti nella forma
// "M x y h<larghezza> v<altezza> H<x di partenza> z", eventualmente ripetuta con
// "m" (spostamento relativo) e chiusa con "h-<larghezza>". Ci basta leggere il
// punto di partenza e i due spostamenti: il resto della sagoma e' implicito.
function rectanglesFromPath(d) {
  const tokens = d.match(/[MmHhVvZz]|-?\d+(?:\.\d+)?/g) ?? [];
  const rects = [];
  let cursorX = 0, cursorY = 0, startX = 0, startY = 0, width = 0, height = 0;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === "M" || token === "m") {
      const x = Number(tokens[++i]);
      const y = Number(tokens[++i]);
      cursorX = token === "M" ? x : cursorX + x;
      cursorY = token === "M" ? y : cursorY + y;
      startX = cursorX;
      startY = cursorY;
      width = 0;
      height = 0;
    } else if (token === "h" || token === "H") {
      const x = Number(tokens[++i]);
      const next = token === "h" ? cursorX + x : x;
      if (!width) width = next - cursorX;
      cursorX = next;
    } else if (token === "v" || token === "V") {
      const y = Number(tokens[++i]);
      const next = token === "v" ? cursorY + y : y;
      if (!height) height = next - cursorY;
      cursorY = next;
    } else if (token === "Z" || token === "z") {
      rects.push({
        x: Math.min(startX, startX + width),
        y: Math.min(startY, startY + height),
        w: Math.abs(width),
        h: Math.abs(height),
      });
      cursorX = startX;
      cursorY = startY;
    }
  }
  return rects;
}

const base = new Uint8Array(SIZE * SIZE * 4);
for (const { fill, x, y, w, h } of shapes) {
  const r = parseInt(fill.slice(1, 3), 16);
  const g = parseInt(fill.slice(3, 5), 16);
  const b = parseInt(fill.slice(5, 7), 16);
  for (let py = Math.max(0, y); py < Math.min(SIZE, y + h); py++) {
    for (let px = Math.max(0, x); px < Math.min(SIZE, x + w); px++) {
      const offset = (py * SIZE + px) * 4;
      base[offset] = r;
      base[offset + 1] = g;
      base[offset + 2] = b;
      base[offset + 3] = 255;
    }
  }
}

const source = { width: SIZE, height: SIZE, data: base };
for (const size of [192, 512]) {
  const scaled = resize(source, size, size);
  await writeFile(join(root, `assets/icon-${size}.png`), encodePng(scaled));
  console.log(`assets/icon-${size}.png scritta.`);
}
