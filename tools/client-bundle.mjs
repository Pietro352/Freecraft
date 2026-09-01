// freecraft/index.html ships the whole game as nested payloads:
//   page  ->  gzip+base64 client bundle (classes.js)
//         ->  base64 EPK resource package
//         ->  the individual asset files
// These helpers unwrap and rewrap those layers so assets can be edited.
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readEpk, writeEpk } from './epk.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PAGE = path.join(root, 'freecraft/index.html');

const BUNDLE_MARKER = 'id="freecrafterClientBundle">data:application/octet-stream;base64,';
const ASSETS_MARKER = 'assetsURI = [ { url: "data:application/octet-stream;base64,';
const MAX = 1 << 30;

// The payload ends where the base64 alphabet ends. Do NOT look for the closing
// quote instead: the page's bundle is followed by `</style>` and the next tag,
// so the first quote after it belongs to `<script type="text/javascript">` and
// splicing up to it silently eats the tag that boots the client.
function locate(text, marker) {
  const at = text.indexOf(marker);
  if (at < 0) throw new Error('could not find ' + JSON.stringify(marker));
  const start = at + marker.length;
  let end = start;
  for (; end < text.length; end++) {
    const c = text.charCodeAt(end);
    const base64Char =
      (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || (c >= 0x30 && c <= 0x39) ||
      c === 0x2b /* + */ || c === 0x2f /* / */ || c === 0x3d /* = */;
    if (!base64Char) break;
  }
  if (end === start) throw new Error('empty payload after ' + JSON.stringify(marker));
  return { start, end };
}

/** Unwrap the page down to the parsed resource package. */
export function readClientBundle(pagePath = PAGE) {
  const page = fs.readFileSync(pagePath, 'latin1');
  const bundleAt = locate(page, BUNDLE_MARKER);
  const classes = zlib
    .gunzipSync(Buffer.from(page.slice(bundleAt.start, bundleAt.end), 'base64'), { maxOutputLength: MAX })
    .toString('latin1');
  const epkAt = locate(classes, ASSETS_MARKER);
  const epk = readEpk(Buffer.from(classes.slice(epkAt.start, epkAt.end), 'base64'));
  return { page, bundleAt, classes, epkAt, epk };
}

/** Rewrap a bundle read by readClientBundle and write the page back out. */
export function writeClientBundle(bundle, pagePath = PAGE) {
  const { page, bundleAt, classes, epkAt, epk } = bundle;
  const newClasses = classes.slice(0, epkAt.start) + writeEpk(epk).toString('base64') + classes.slice(epkAt.end);
  const newBundle = zlib.gzipSync(Buffer.from(newClasses, 'latin1'), { level: 9 }).toString('base64');
  const newPage = page.slice(0, bundleAt.start) + newBundle + page.slice(bundleAt.end);

  // The markup around the payload boots the client; losing any of it is a black
  // screen, so refuse to write a page whose structure no longer matches.
  for (const needed of ['</style>\n<script type="text/javascript">', 'window.eaglercraftXClientBundle']) {
    if (!newPage.includes(needed)) throw new Error('rewrapped page lost ' + JSON.stringify(needed));
  }
  fs.writeFileSync(pagePath, newPage, 'latin1');
}

/** Read a single asset out of the packaged client. */
export function readClientAsset(name, pagePath = PAGE) {
  const entry = readClientBundle(pagePath).epk.entries.find((e) => e.name === name);
  if (!entry) throw new Error('client package has no ' + name);
  return entry.content;
}
