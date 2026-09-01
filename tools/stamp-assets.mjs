// Aggiunge un "timbro" alla fine degli indirizzi dei file in assets/, per
// esempio assets/chat.js?v=6f2a91c4.
//
// Serve a risolvere un problema fastidioso: netlify.toml dice ai browser di
// tenere quei file in cache per un anno senza mai richiedere conferma, perche'
// riscaricarli a ogni visita e' uno spreco. Ma se il file resta lo stesso
// indirizzo, chi ha gia' visitato il sito continua a usare la copia vecchia
// anche dopo un aggiornamento. Il timbro e' calcolato dal contenuto del file:
// se il contenuto cambia, cambia l'indirizzo, e il browser lo considera un file
// nuovo da scaricare. Se il contenuto non cambia, l'indirizzo resta identico e
// la cache continua a valere.
//
// Uso:
//   node tools/stamp-assets.mjs           riscrive i timbri nelle pagine
//   node tools/stamp-assets.mjs --check   esce con errore se sono da rifare
//
// La modalita' --check gira dentro i test, cosi' una modifica a un file di
// assets/ senza timbro aggiornato fa fallire la build invece di arrivare
// online e servire codice vecchio.

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Le pagine che caricano file da assets/. Il client di gioco e' un unico file
// da 18 MB: lo trattiamo come le altre pagine, ma solo tre righe lo riguardano.
const PAGES = ["index.html", "freecraft/index.html"];

// Cerchiamo solo dentro src="..." e href="...", non ovunque compaia la parola
// "assets": dentro il client di gioco c'e' un blocco enorme di dati compressi e
// non vogliamo toccarlo per sbaglio.
const REFERENCE = /(\bsrc=|\bhref=)"((?:\.\.\/)?assets\/[A-Za-z0-9._-]+)(\?v=[A-Za-z0-9]+)?"/g;

const hashes = new Map();

async function stampFor(reference) {
  const file = reference.replace(/^\.\.\//, "");
  if (!hashes.has(file)) {
    const contents = await readFile(join(root, file));
    hashes.set(file, createHash("sha256").update(contents).digest("hex").slice(0, 8));
  }
  return hashes.get(file);
}

async function restamp(page) {
  const path = join(root, page);
  const original = await readFile(path, "utf8");

  // Le sostituzioni richiedono di leggere i file di assets/, che e' asincrono,
  // mentre String.replace non aspetta le promesse: raccogliamo prima tutte le
  // corrispondenze, poi calcoliamo i timbri, infine riscriviamo.
  const matches = [...original.matchAll(REFERENCE)];
  const stamps = await Promise.all(matches.map((match) => stampFor(match[2])));

  let index = 0;
  const updated = original.replace(REFERENCE, (_full, attribute, reference) =>
    `${attribute}"${reference}?v=${stamps[index++]}"`);

  return { path, page, original, updated, count: matches.length };
}

// sw.js tiene il client di gioco in un archivio del browser il cui nome
// contiene l'impronta del client stesso. Scriviamo qui quell'impronta: cosi'
// pubblicare un gioco nuovo cambia il nome dell'archivio, il vecchio viene
// buttato e nessuno resta con la versione precedente.
// L'impronta va calcolata sul testo del client *dopo* che gli abbiamo messo i
// timbri, non su quello che c'e' ancora su disco: i timbri fanno parte del file
// e leggendolo prima otterremmo un'impronta che al controllo successivo non
// torna piu', bloccando il rilascio per un motivo inventato.
async function restampServiceWorker(gameContents) {
  const path = join(root, "sw.js");
  const original = await readFile(path, "utf8");
  const build = createHash("sha256").update(gameContents, "utf8").digest("hex").slice(0, 12);
  const updated = original.replace(/const GAME_BUILD = "[^"]*";/, `const GAME_BUILD = "${build}";`);
  return { path, page: "sw.js", original, updated, count: 1 };
}

const pages = await Promise.all(PAGES.map(restamp));
const game = pages.find((result) => result.page === "freecraft/index.html");
const results = [...pages, await restampServiceWorker(game.updated)];
const stale = results.filter((result) => result.original !== result.updated);

if (process.argv.includes("--check")) {
  if (stale.length) {
    console.error(
      "Timbri delle risorse non aggiornati in: " + stale.map((result) => result.page).join(", ") +
      "\nEsegui: node tools/stamp-assets.mjs",
    );
    process.exit(1);
  }
  console.log(`Timbri aggiornati in ${results.length} pagine.`);
} else {
  await Promise.all(stale.map((result) => writeFile(result.path, result.updated)));
  for (const result of results) {
    const state = result.original === result.updated ? "gia' a posto" : "aggiornata";
    console.log(`${result.page}: ${result.count} riferimenti, ${state}.`);
  }
}
