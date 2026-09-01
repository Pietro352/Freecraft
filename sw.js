// Service worker: tiene da parte il client di gioco cosi' non va riscaricato.
//
// /freecraft/index.html pesa 18 MB. Senza questo file il browser se lo tiene in
// cache dieci minuti (vedi netlify.toml) e poi ricomincia da capo: chi gioca
// tutti i giorni si ritrova a scaricare 18 MB ogni volta, e con la connessione
// del telefono e' un'attesa lunga e traffico buttato.
//
// Qui invece: la prima volta lo scarichiamo e lo mettiamo in un archivio del
// browser, e da li' in poi lo serviamo da quell'archivio, subito e senza rete.
//
// GAME_BUILD e' l'impronta del contenuto del client, riscritta in automatico da
// tools/stamp-assets.mjs a ogni rilascio. Quando pubblichiamo un client nuovo
// l'impronta cambia, il nome dell'archivio cambia con lei, il vecchio archivio
// viene buttato via e il gioco nuovo viene scaricato. Nessuno resta indietro.
const GAME_BUILD = "7e605eb2cdcd";
const CACHE = `freecraft-game-${GAME_BUILD}`;
const GAME_PATH = "/freecraft/index.html";

// Appena installato prende servizio, senza aspettare che si chiudano le schede
// gia' aperte: altrimenti dopo un aggiornamento la versione nuova resterebbe in
// attesa fino alla chiusura di tutte le finestre di Freecraft.
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

// Alla partenza buttiamo via gli archivi dei client precedenti, altrimenti dopo
// qualche rilascio ci ritroveremmo decine di megabyte di roba inutile.
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith("freecraft-game-") && name !== CACHE)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Tocchiamo soltanto la pagina del gioco. Tutto il resto - la chat, le
  // funzioni, le immagini - passa senza che ce ne occupiamo: se questo file
  // avesse un difetto, resterebbe un difetto confinato al caricamento del
  // gioco invece di rompere l'intero sito.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname !== GAME_PATH) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(GAME_PATH);
    if (cached) return cached;

    const response = await fetch(request);

    // Mettiamo da parte solo una risposta completa e riuscita. Una risposta
    // parziale o un errore del server salvato in archivio significherebbe un
    // gioco rotto che si ripresenta identico a ogni avvio.
    //
    // Il salvataggio non viene atteso: la pagina deve ricevere i byte mentre
    // arrivano, perche' e' contandoli che disegna la barra di avanzamento.
    // Aspettando qui, al primo avvio la barra resterebbe ferma a zero per tutti
    // i 18 MB e poi salterebbe di colpo alla fine. waitUntil tiene comunque in
    // vita il service worker finche' la copia non e' stata scritta.
    if (response.ok && response.status === 200) {
      event.waitUntil(cache.put(GAME_PATH, response.clone()));
    }
    return response;
  })());
});
