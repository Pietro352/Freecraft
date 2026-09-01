/*
 * Avvio del launcher FREECRAFT.
 *
 * Questo codice stava dentro un tag <script> nella pagina. Vive in un file suo
 * perche' la Content-Security-Policy dichiarata in netlify.toml consente solo
 * script serviti dal sito: e' quella regola che impedisce a del codice
 * estraneo, se un giorno riuscisse a finire nella pagina, di leggere il gettone
 * di sessione salvato nel browser.
 */
// --- 0. Player Progress Persistence ---
// Freecraft salva i mondi (progressi del giocatore) nell'IndexedDB del
// browser. Senza questa richiesta, alcuni browser (es. Chrome sotto
// pressione di spazio) possono cancellare quei dati come storage "best
// effort". Richiedendo lo storage persistente evitiamo che i salvataggi
// vengano eliminati automaticamente.
(async function requestPersistentStorage() {
    try {
        if (navigator.storage && navigator.storage.persist) {
            const alreadyPersisted = await navigator.storage.persisted();
            if (!alreadyPersisted) {
                await navigator.storage.persist();
            }
        }
    } catch (e) {
        // Non bloccante: se il browser non supporta l'API, il gioco
        // continua a funzionare normalmente.
    }
})();

// --- 0b. Copia locale del client di gioco ---
// Il service worker (sw.js) tiene da parte i 18 MB del gioco dopo il primo
// avvio, cosi' le volte successive parte subito e senza riscaricare niente.
// Se il browser non lo supporta o la registrazione fallisce non cambia nulla:
// il gioco si scarica dalla rete come prima.
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function registerGameCache() {
        navigator.serviceWorker.register('sw.js').catch(function () {
            // Nessun avviso all'utente: e' solo un'ottimizzazione mancata.
        });
    });
}

// --- 0c. Zoom disattivato ---
// Il tag viewport della pagina chiede gia' di non ingrandire, e questo basta a
// evitare lo zoom automatico quando il dito entra in un campo di testo: era il
// fastidio principale, perche' Safari ingrandiva da solo e a scrittura finita
// non tornava piu' indietro. Il pizzico a due dita, pero', Safari lo concede
// comunque ignorando il viewport: si toglie solo annullando gli eventi
// "gesture", che sono suoi e non esistono altrove.
function blockZoomGestures(doc) {
    if (!doc) return;
    const stopGesture = (event) => event.preventDefault();
    for (const name of ['gesturestart', 'gesturechange', 'gestureend']) {
        doc.addEventListener(name, stopGesture, { passive: false });
    }
}
blockZoomGestures(document);

// --- 1. Background Animation Logic ---
const canvas = document.getElementById('bg-canvas');
// alpha:false lascia comporre il canvas come livello opaco: e' l'opacita'
// CSS a fonderlo con lo sfondo, quindi il canale alfa non serve.
const ctx = canvas.getContext('2d', { alpha: false });
let width, height;
let bgAnimationId = null;
let bgGradient = null;
const blocks = [];
const colors = ['#5d4037', '#795548', '#4caf50', '#388e3c', '#9e9e9e'];

function resize() {
    width = window.innerWidth; height = window.innerHeight;
    // Il gradiente dipende solo dall'altezza: lo ricostruiamo qui una
    // volta sola invece che a ogni fotogramma.
    bgGradient = ctx.createLinearGradient(0, 0, 0, height);
    bgGradient.addColorStop(0, "#1a1a1a"); bgGradient.addColorStop(1, "#000");
    // A gioco avviato il canvas e' nascosto: riallocarne il buffer a
    // schermo intero a ogni scatto della barra degli indirizzi sarebbe
    // lavoro buttato via proprio mentre il gioco sta girando.
    if (canvas.style.display === 'none') return;
    canvas.width = width; canvas.height = height;
}
window.addEventListener('resize', resize); resize();

class Block {
    constructor() { this.reset(true); }
    reset(initial = false) {
        this.size = Math.random() * 30 + 10;
        this.x = Math.random() * width;
        this.y = initial ? Math.random() * height : -this.size;
        this.speed = Math.random() * 2 + 0.5;
        this.color = colors[Math.floor(Math.random() * colors.length)];
        this.rot = Math.random() * 360;
        this.rSpeed = (Math.random() - 0.5) * 2;
    }
    update() {
        this.y += this.speed; this.rot += this.rSpeed;
        if (this.y > height) this.reset();
    }
    draw() {
        ctx.save(); ctx.translate(this.x, this.y); ctx.rotate((this.rot * Math.PI) / 180);
        ctx.fillStyle = this.color; ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
        ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = 2;
        ctx.strokeRect(-this.size / 2, -this.size / 2, this.size, this.size);
        ctx.restore();
    }
}
for (let i = 0; i < 50; i++) blocks.push(new Block());

// Impostazione "Animazione dei blocchi nel menu": se spenta disegniamo
// solo lo sfondo statico, senza tenere occupata la GPU.
const launcherConfig = window.FreecrafterConfig;
const menuAnimationOn = () => !launcherConfig || launcherConfig.settings.menuAnimation;

function drawStaticBg() {
    // Il riempimento copre tutta la superficie: clearRect sarebbe lavoro
    // buttato via.
    ctx.fillStyle = bgGradient; ctx.fillRect(0, 0, width, height);
}

function animateBg() {
    ctx.fillStyle = bgGradient; ctx.fillRect(0, 0, width, height);
    for (let i = 0; i < blocks.length; i++) { blocks[i].update(); blocks[i].draw(); }
    bgAnimationId = requestAnimationFrame(animateBg);
}

function startBgAnimation() {
    if (!menuAnimationOn()) { drawStaticBg(); return; }
    if (bgAnimationId === null) animateBg();
}
startBgAnimation();

if (launcherConfig) {
    launcherConfig.subscribe(() => {
        if (document.body.classList.contains('is-in-game')) return;
        if (menuAnimationOn()) startBgAnimation();
        else if (bgAnimationId !== null) {
            cancelAnimationFrame(bgAnimationId);
            bgAnimationId = null;
            drawStaticBg();
        }
    });
}

document.addEventListener('visibilitychange', () => {
    if (document.body.classList.contains('is-in-game')) return;
    if (document.hidden) {
        if (bgAnimationId !== null) { cancelAnimationFrame(bgAnimationId); bgAnimationId = null; }
    } else {
        startBgAnimation();
    }
});

function stopBgAnimation() {
    if (bgAnimationId !== null) {
        cancelAnimationFrame(bgAnimationId);
        bgAnimationId = null;
    }
    canvas.style.display = 'none';
}

// --- 2. Launcher Logic ---
const playBtn = document.getElementById('play-btn');
const retryBtn = document.getElementById('retry-btn');
const mainMenu = document.getElementById('main-menu');
const loadingScreen = document.getElementById('loading-screen');
const gameContainer = document.getElementById('game-container');
const freecraftFrame = document.getElementById('freecraft-frame');
const progressBar = document.getElementById('progress-bar');
const loadingMsg = document.getElementById('loading-msg');

// Percorso locale del client Freecraft.
const FREECRAFT_SOURCE = "./freecraft/index.html";

// Usata da chat.js per restituire il focus tastiera al gioco quando
// si chiude il pannello CraftChat.
window.focusGameFrame = () => { try { freecraftFrame.focus(); } catch (e) {} };

// Il gioco intercetta il mousedown sul proprio canvas per evitare la
// selezione del testo: questo può impedire al browser di spostare
// automaticamente il focus tastiera sull'iframe, lasciando il click
// (e quindi il blocco del puntatore) funzionante mentre WASD/spazio
// non arrivano più al gioco. Rifocalizziamo esplicitamente l'iframe
// ogni volta che il gioco segnala un cambio di stato del menu.
window.addEventListener('message', (event) => {
    if (event.source !== freecraftFrame.contentWindow || event.origin !== window.location.origin) return;
    if (event.data?.type !== 'freecrafter-game-menu') return;
    const menuVisible = Boolean(event.data.visible);
    document.body.classList.toggle('is-game-menu-open', menuVisible);
    window.dispatchEvent(new CustomEvent('freecrafter:game-menu', { detail: { visible: menuVisible } }));
    freecraftFrame.focus();
});

playBtn.addEventListener('click', () => {
    playBtn.disabled = true;
    mainMenu.style.opacity = '0';
    setTimeout(() => {
        mainMenu.style.display = 'none';
        loadingScreen.style.display = 'flex';
        startLoadingSequence();
    }, 500);
});

retryBtn.addEventListener('click', () => {
    retryBtn.style.display = 'none';
    loadingMsg.classList.remove('error');
    loadingScreen.style.display = 'none';
    mainMenu.style.display = 'flex';
    mainMenu.style.opacity = '1';
    playBtn.disabled = false;
    progressBar.style.width = '0%';
});

async function startLoadingSequence() {
    try {
        loadingMsg.innerText = 'Connessione al client...';
        const response = await fetch(FREECRAFT_SOURCE, { cache: 'default' });
        if (!response.ok || !response.body) throw new Error('client non disponibile');
        const total = Number(response.headers.get('content-length')) || 0;
        const reader = response.body.getReader();
        let received = 0;
        // Leggiamo il flusso solo per mostrare la barra di avanzamento e
        // per riempire la cache del browser: i byte vengono scartati
        // subito. Tenerli avrebbe significato costruire in memoria una
        // stringa da ~18 MB (36 MB in UTF-16) che poi il browser avrebbe
        // dovuto ri-analizzare da capo.
        let lastPaint = -1;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            received += value.byteLength;
            const percent = total ? Math.min(95, Math.round((received / total) * 100)) : Math.min(95, Math.round(received / 180000));
            // Toccare il DOM a ogni chunk provocava centinaia di layout
            // inutili durante il download; basta aggiornare quando la
            // percentuale cambia davvero.
            if (percent !== lastPaint) {
                lastPaint = percent;
                progressBar.style.width = `${percent}%`;
                loadingMsg.innerText = `Download client · ${(received / 1048576).toFixed(1)} MB${total ? ` / ${(total / 1048576).toFixed(1)} MB` : ''}`;
            }
        }
        progressBar.style.width = '100%';
        loadingMsg.innerText = 'Preparazione del mondo...';
        launchGame();
    } catch (e) {
        window.FreecrafterTelemetry?.send('game-load', e.message);
        showLoadError();
    }
}

function launchGame() {
    loadingScreen.style.display = 'none';
    gameContainer.style.display = 'block';
    document.body.classList.add('is-in-game');
    document.body.classList.remove('is-game-menu-open');
    // src invece di srcdoc: la pagina e' gia' nella cache HTTP dopo il
    // download qui sopra, quindi l'iframe la riprende da li' senza che il
    // launcher debba passargli 18 MB di markup. Caricandola dal suo vero
    // indirizzo i percorsi relativi funzionano da soli, senza <base>.
    freecraftFrame.src = FREECRAFT_SOURCE;
    freecraftFrame.addEventListener('load', () => {
        freecraftFrame.focus();
        // Il gioco e' un documento a se': il pizzico fatto sopra al gioco resta
        // dentro l'iframe e non arriva mai alla pagina che lo contiene, quindi
        // la stessa protezione va installata anche li' dentro.
        try { blockZoomGestures(freecraftFrame.contentDocument); } catch (e) {}
    }, { once: true });
    gameContainer.addEventListener('click', () => freecraftFrame.focus());

    // Ferma l'animazione di sfondo per risparmiare risorse una volta avviato il gioco
    stopBgAnimation();

    // Segnala l'avvio a launcher-effects.js (schermo intero, blocco
    // orientamento, schermo sempre acceso, invio della configurazione).
    window.dispatchEvent(new CustomEvent('freecrafter:launch'));
}

// Avvio automatico: salta il menu appena la pagina e' pronta.
if (launcherConfig && launcherConfig.settings.autoLaunch) {
    setTimeout(() => { if (!playBtn.disabled) playBtn.click(); }, 260);
}

function showLoadError() {
    gameContainer.style.display = 'none';
    loadingScreen.style.display = 'flex';
    loadingMsg.innerText = "Errore: client Freecraft non trovato in " + FREECRAFT_SOURCE +
        ". Assicurati di aver caricato la cartella /freecraft/ accanto a questo file.";
    loadingMsg.classList.add('error');
    retryBtn.style.display = 'inline-block';
}
