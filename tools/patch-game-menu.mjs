// Cleans up the packaged game client's main menu and makes Italian its default
// language.
//
//   node tools/patch-game-menu.mjs
//
// The client is TeaVM-compiled Java: every string literal lives in one big
// $rt_stringPool([...]) array and the code refers to entries by index through
// C(n). Blanking an entry is therefore enough to stop the menu drawing it, and
// a new language code can be added by appending one entry (existing indices
// keep working because nothing before them moves).
//
// Re-runnable: it rewrites the same page from tools/lang/it_IT.lang each time.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readClientBundle, writeClientBundle, PAGE } from './client-bundle.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LANG_SOURCE = path.join(root, 'tools/lang/it_IT.lang');
export const LANG_ASSET = 'assets/minecraft/lang/it_IT.lang';
export const LANGUAGE = 'it_IT';

// Corner notices and the credits link the launcher has no use for. Blanking
// them is safe: the menu already measures every one of these before drawing,
// and a zero width makes it skip the surrounding panels too.
const BLANK = [
  6219, // "Powered by freeteck!"       - subtitle under the logo
  6224, // "FreecraftX u53"             - version above that subtitle
  6234, // "Minecraft 1.8.8"            - bottom left
  6235, // " Demo"                      - suffix of the above
  6236, // "Resources Copyright Mojang AB"        - bottom right
  6237, // "Copyright Mojang AB. Do not distribute!" - bottom right, demo
  6238, // "CREDITS.txt"                - top right link
  6239, // "Collector's Edition"        - top left badge
  6240, // "PBR Shaders"                - top left badge
];

// Every edit below is asserted to match exactly once so a future client build
// fails loudly here instead of silently shipping an unpatched menu. Finding the
// result already in place is fine though - that is just a re-run.
function replaceOnce(text, from, to) {
  const at = text.indexOf(from);
  if (at < 0) {
    if (text.includes(to)) return text;
    throw new Error('pattern not found: ' + JSON.stringify(from.slice(0, 60)));
  }
  if (text.indexOf(from, at + from.length) >= 0) throw new Error('pattern is not unique: ' + JSON.stringify(from.slice(0, 60)));
  return text.slice(0, at) + to + text.slice(at + from.length);
}

/** Walk $rt_stringPool([...]) and return every literal's span. */
export function readStringPool(classes) {
  const MARKER = '$rt_stringPool([';
  const at = classes.indexOf(MARKER);
  if (at < 0) throw new Error('client has no string pool');
  const entries = [];
  let i = at + MARKER.length;
  const skip = () => { while (classes[i] === '\n' || classes[i] === ' ') i++; };
  const literal = () => {
    let j = i + 1;
    for (;;) { const c = classes[j]; if (c === '\\') { j += 2; continue; } if (c === '"') break; j++; }
    return j + 1;
  };
  for (;;) {
    while (classes[i] === ',' || classes[i] === '\n' || classes[i] === ' ') i++;
    if (classes[i] === ']') break;
    if (classes[i] !== '"') throw new Error('unparsable string pool at ' + i);
    const start = i;
    let end = literal();
    // A few entries are written as "a"+"b" across a line break.
    for (;;) {
      i = end; skip();
      if (classes[i] !== '+') break;
      i++; skip();
      if (classes[i] !== '"') break;
      end = literal();
    }
    entries.push({ start, end });
    i = end;
  }
  return { entries, close: i };
}

/** Apply every menu edit to the packaged client and write the page back. */
export function patchGameMenu() {
  const bundle = readClientBundle();
  let classes = bundle.classes;

  const pool = readStringPool(classes);

  // A previous run already parked the language code at the end of the pool; the
  // index has to stay the same, so reuse it instead of appending a duplicate.
  const last = pool.entries[pool.entries.length - 1];
  const alreadyAppended = classes.slice(last.start, last.end) === '"' + LANGUAGE + '"';
  const languageIndex = alreadyAppended ? pool.entries.length - 1 : pool.entries.length;

  // Offset edits run back to front so earlier spans stay valid.
  const edits = alreadyAppended ? [] : [{ start: pool.close, end: pool.close, text: ',"' + LANGUAGE + '"' }];
  for (const index of BLANK) {
    const entry = pool.entries[index];
    if (!entry) throw new Error('string pool has no entry ' + index);
    edits.push({ start: entry.start, end: entry.end, text: '""' });
  }
  edits.sort((a, b) => b.start - a.start);
  for (const edit of edits) classes = classes.slice(0, edit.start) + edit.text + classes.slice(edit.end);

  // The build stamp drawn under "Minecraft 1.8.8" is built at runtime, so it has
  // to be swapped for the shared empty string (index 6) at the draw site.
  classes = replaceOnce(classes, 'AOw();if(B()){break _;}g=HVO;', 'AOw();if(B()){break _;}g=C(6);');

  // The credits link keeps a hover highlight and a translucent bar that are drawn
  // from the mouse position rather than from the (now empty) label, plus a click
  // target that would still open CREDITS.txt. Disable all three.
  const HOVER = 'if(b>=h&&b<=f&&c>=0&&c<=9){MG();m=K3L;$p=61;continue _;}i=0;j=10;k';
  const HOVER_OFF = 'if(0){MG();m=K3L;$p=61;continue _;}i=0;j=0;k';
  const hovers = classes.split(HOVER).length - 1 + (classes.split(HOVER_OFF).length - 1);
  if (hovers !== 2) throw new Error('expected two credits hover checks, found ' + hovers);
  classes = classes.split(HOVER).join(HOVER_OFF);
  classes = replaceOnce(classes, 'i=0;j=0;k=1428160512;$p=41;', 'i=0;j=0;k=0;$p=41;');
  classes = replaceOnce(classes, 'i=0;j=0;k\n=1428160512;$p=41;', 'i=0;j=0;k\n=0;$p=41;');
  classes = replaceOnce(classes, 'if(b>=((f-e|0)-4|0)&&b<=f&&c>=0&&c<=10){g=C(6243);', 'if(0){g=C(6243);');

  // Default language: the stored profile falls back to en_US in three places (a
  // fresh profile, a profile read from JSON, and one read from the settings map).
  classes = replaceOnce(classes, 'a.b$b=C(172);', 'a.b$b=C(' + languageIndex + ');');
  classes = replaceOnce(classes, 'c=C(178);d=C(172);', 'c=C(178);d=C(' + languageIndex + ');');
  classes = replaceOnce(classes, 'typeof b.lang==="string"?b.lang:"en_US"', 'typeof b.lang==="string"?b.lang:"' + LANGUAGE + '"');

  // The resource package is spliced back in by offset, so the marker has to be
  // relocated after editing the surrounding code.
  const ASSETS_MARKER = 'assetsURI = [ { url: "data:application/octet-stream;base64,';
  const shift = classes.indexOf(ASSETS_MARKER) - bundle.classes.indexOf(ASSETS_MARKER);
  bundle.classes = classes;
  bundle.epkAt = { start: bundle.epkAt.start + shift, end: bundle.epkAt.end + shift };

  // en_US ships the /eagskull command's strings under keys that a past rebrand
  // mangled ("eaglercraft.co" became the site domain), so the client showed the
  // raw key. Restore the keys the client actually asks for.
  const en = bundle.epk.entries.find((e) => e.name === 'assets/minecraft/lang/en_US.lang');
  if (!en) throw new Error('client package has no en_US.lang');
  const fixed = en.content.toString('utf8').replace(/^freecrafter\.netlify\.app/gm, 'eaglercraft.co');
  if (fixed !== en.content.toString('utf8')) en.content = Buffer.from(fixed, 'utf8');

  const italian = fs.readFileSync(LANG_SOURCE);
  const existing = bundle.epk.entries.find((e) => e.name === LANG_ASSET);
  if (existing) existing.content = italian;
  else bundle.epk.entries.splice(bundle.epk.entries.indexOf(en) + 1, 0, { type: 'FILE', name: LANG_ASSET, content: italian });

  writeClientBundle(bundle);

  const keys = italian.toString('utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).length;
  console.log('blanked ' + BLANK.length + ' menu strings, default language ' + LANGUAGE +
    ' (pool index ' + languageIndex + '), ' + keys + ' translated keys in ' + path.relative(root, PAGE));
}

// Importing this module (the tests read its string-pool parser) must not
// rewrite the page; only running it directly should.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) patchGameMenu();
