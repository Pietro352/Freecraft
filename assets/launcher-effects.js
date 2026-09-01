/*
 * Applica lato launcher le impostazioni che riguardano la pagina (schermo
 * intero, blocco orientamento, schermo sempre acceso, conferma di uscita,
 * pulsante chat) e inoltra la configurazione all'iframe del gioco.
 */
(function () {
    'use strict';

    const config = window.FreecrafterConfig;
    if (!config) return;

    const frame = () => document.getElementById('freecraft-frame');
    const inGame = () => document.body.classList.contains('is-in-game');
    const quickActions = document.querySelector('.fc-quick-actions');
    const quickActionsToggle = document.getElementById('fc-quick-actions-toggle');
    const quickActionsMenu = document.getElementById('fc-quick-actions-menu');

    function setQuickActionsOpen(open) {
        if (!quickActionsToggle || !quickActionsMenu) return;
        quickActionsMenu.hidden = !open;
        quickActionsToggle.setAttribute('aria-expanded', String(open));
        quickActionsToggle.setAttribute('aria-label', open ? 'Chiudi scorciatoie' : 'Apri scorciatoie');
        if (quickActions) quickActions.classList.toggle('is-open', open);
    }

    function closeQuickActions() {
        setQuickActionsOpen(false);
    }

    function toggleQuickActions() {
        if (!quickActionsMenu) return;
        setQuickActionsOpen(quickActionsMenu.hidden);
    }

    /* --- Appiglio spostabile sui telefoni ---
       Sui touch il puntatore non si blocca mai, quindi il launcher non sa se
       stai giocando o guardando un menu del gioco e i suoi pulsanti restano
       sempre sopra la partita. Sono piccoli e semitrasparenti (vedi il CSS),
       ma i comandi del gioco cambiano posizione da un dispositivo all'altro:
       trascinandolo si sposta dove non da' fastidio, e la posizione resta
       salvata per le partite successive. */
    const DOCK_KEY = 'freecrafter:dock-position:v1';
    const DOCK_MARGIN = 6;
    const touchLayout = () => window.matchMedia('(pointer: coarse)').matches;
    const dockActive = () => Boolean(quickActions) && inGame() && touchLayout();
    let dragState = null;
    let ignoreNextToggleClick = false;
    let ignoreResetTimer = null;

    function readDock() {
        try {
            const parsed = JSON.parse(localStorage.getItem(DOCK_KEY) || 'null');
            if (!parsed || !Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return null;
            return parsed;
        } catch (e) {
            return null;
        }
    }

    // L'appiglio deve restare tutto dentro allo schermo anche dopo una rotazione
    // o l'apertura della barra degli indirizzi.
    function clampDock(x, y) {
        const box = quickActionsToggle ? quickActionsToggle.getBoundingClientRect() : null;
        const width = (box && box.width) || 40;
        const height = (box && box.height) || 40;
        const maxX = Math.max(DOCK_MARGIN, window.innerWidth - width - DOCK_MARGIN);
        const maxY = Math.max(DOCK_MARGIN, window.innerHeight - height - DOCK_MARGIN);
        return {
            x: Math.min(Math.max(DOCK_MARGIN, x), maxX),
            y: Math.min(Math.max(DOCK_MARGIN, y), maxY)
        };
    }

    // La barra viene ancorata al bordo piu' vicino e il menu si apre verso il
    // centro dello schermo: ancorandola sempre a sinistra, aprendo il menu
    // l'appiglio sarebbe scivolato via dal dito (o fuori dallo schermo).
    function applyDock(position) {
        if (!quickActions) return;
        const box = quickActionsToggle ? quickActionsToggle.getBoundingClientRect() : null;
        const width = (box && box.width) || 40;
        quickActions.style.setProperty('--fc-dock-x', position.x + 'px');
        quickActions.style.setProperty('--fc-dock-right', Math.max(0, window.innerWidth - position.x - width) + 'px');
        quickActions.style.setProperty('--fc-dock-y', position.y + 'px');
        quickActions.classList.add('is-moved');
        quickActions.classList.toggle('is-flipped', position.x < window.innerWidth / 2);
    }

    function restoreDock() {
        if (!quickActions || !touchLayout()) return;
        const saved = readDock();
        if (saved) applyDock(clampDock(saved.x, saved.y));
    }

    function endDrag(event) {
        if (!dragState || event.pointerId !== dragState.id) return;
        const { moved, position } = dragState;
        dragState = null;
        quickActions.classList.remove('is-dragging');
        if (!moved) return;
        if (position) {
            try { localStorage.setItem(DOCK_KEY, JSON.stringify(position)); } catch (e) { /* storage pieno */ }
        }
        // Il dito ha trascinato, non toccato: il click che segue non deve anche
        // aprire il menu.
        ignoreNextToggleClick = true;
        clearTimeout(ignoreResetTimer);
        ignoreResetTimer = setTimeout(() => { ignoreNextToggleClick = false; }, 400);
    }

    if (quickActionsToggle) {
        quickActionsToggle.addEventListener('pointerdown', (event) => {
            if (!dockActive() || !event.isPrimary) return;
            const box = quickActionsToggle.getBoundingClientRect();
            dragState = {
                id: event.pointerId,
                offsetX: event.clientX - box.left,
                offsetY: event.clientY - box.top,
                startX: event.clientX,
                startY: event.clientY,
                moved: false,
                position: null
            };
            try { quickActionsToggle.setPointerCapture(event.pointerId); } catch (e) { /* non supportato */ }
        });

        quickActionsToggle.addEventListener('pointermove', (event) => {
            if (!dragState || event.pointerId !== dragState.id) return;
            if (!dragState.moved) {
                // Una soglia di qualche pixel: il tremolio del dito su un tocco
                // normale non deve trasformarsi in uno spostamento.
                if (Math.abs(event.clientX - dragState.startX) < 9 && Math.abs(event.clientY - dragState.startY) < 9) return;
                dragState.moved = true;
                closeQuickActions();
                quickActions.classList.add('is-dragging');
            }
            event.preventDefault();
            dragState.position = clampDock(event.clientX - dragState.offsetX, event.clientY - dragState.offsetY);
            applyDock(dragState.position);
        });

        quickActionsToggle.addEventListener('pointerup', endDrag);
        quickActionsToggle.addEventListener('pointercancel', endDrag);
    }

    window.addEventListener('resize', () => {
        if (!dockActive() || !quickActions.classList.contains('is-moved')) return;
        const saved = readDock();
        if (saved) applyDock(clampDock(saved.x, saved.y));
    });

    /* --- Ponte verso il gioco (oltre a localStorage + evento storage) --- */
    function broadcast() {
        const node = frame();
        if (!node || !node.contentWindow) return;
        try {
            node.contentWindow.postMessage({
                type: 'freecrafter-config',
                settings: config.settings,
                mods: config.mods
            }, window.location.origin);
        } catch (e) { /* iframe non ancora pronto */ }
    }

    /* --- Pulsante chat --- */
    function applyChatButton() {
        document.body.classList.toggle('fc-hide-chat-button', !config.settings.showChatButton);
    }

    /* --- Schermo sempre acceso --- */
    let wakeLock = null;
    // La richiesta e' asincrona: senza questa bandierina due eventi ravvicinati
    // (per esempio ritorno sulla scheda e apertura del menu di gioco) potevano
    // chiederne due, e la seconda restava appesa senza che nessuno la rilasci.
    let wakeLockPending = false;
    async function applyWakeLock() {
        const wanted = config.settings.keepAwake && inGame() && document.visibilityState === 'visible';
        if (wanted && !wakeLock && !wakeLockPending && 'wakeLock' in navigator) {
            wakeLockPending = true;
            try {
                wakeLock = await navigator.wakeLock.request('screen');
                wakeLock.addEventListener('release', () => { wakeLock = null; });
            } catch (e) { wakeLock = null; }
            finally { wakeLockPending = false; }
        } else if (!wanted && wakeLock) {
            try { await wakeLock.release(); } catch (e) { /* già rilasciato */ }
            wakeLock = null;
        }
    }

    /* --- Schermo intero e orientamento --- */
    async function applyFullscreen() {
        if (!config.settings.fullscreenOnLaunch) return;
        const root = document.documentElement;
        const request = root.requestFullscreen || root.webkitRequestFullscreen;
        if (!document.fullscreenElement && request) {
            try { await request.call(root, { navigationUI: 'hide' }); } catch (e) { /* gesto utente mancante */ }
        }
        applyOrientation();
    }

    function applyOrientation() {
        if (!config.settings.lockLandscape) return;
        if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock('landscape').catch(() => { /* non supportato su desktop */ });
        }
    }

    /* --- Conferma di uscita --- */
    function onBeforeUnload(event) {
        if (!config.settings.confirmExit || !inGame()) return undefined;
        event.preventDefault();
        event.returnValue = '';
        return '';
    }

    /* --- Vibrazione (usata anche dai pulsanti rapidi) --- */
    function buzz(ms) {
        if (!config.settings.vibrate || !navigator.vibrate) return;
        try { navigator.vibrate(ms || 12); } catch (e) { /* ignorato */ }
    }

    function applyAll() {
        applyChatButton();
        applyWakeLock();
    }

    config.subscribe(applyAll);
    document.addEventListener('visibilitychange', applyWakeLock);
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('freecrafter:game-menu', applyWakeLock);

    window.addEventListener('freecrafter:launch', () => {
        applyFullscreen();
        applyWakeLock();
        restoreDock();
        // Il client apre il suo canale appena l'iframe è caricato: rimandiamo
        // la configurazione qualche volta per coprire i tempi di boot lunghi.
        [400, 1500, 4000, 9000].forEach((delay) => setTimeout(broadcast, delay));
    });

    // Il gioco chiede la configurazione appena il suo runtime è pronto.
    window.addEventListener('message', (event) => {
        if (event.origin !== window.location.origin) return;
        const data = event.data;
        if (data && data.type === 'freecrafter-config-request') broadcast();
    });

    // I pulsanti rapidi in gioco e quelli della home condividono lo stesso
    // comportamento: apri il pannello, chiudi il menu di sistema.
    document.addEventListener('click', (event) => {
        if (event.target.closest && event.target.closest('#fc-quick-actions-toggle')) {
            event.preventDefault();
            if (ignoreNextToggleClick) {
                ignoreNextToggleClick = false;
                clearTimeout(ignoreResetTimer);
                return;
            }
            buzz();
            toggleQuickActions();
            return;
        }

        const trigger = event.target.closest && event.target.closest('[data-fc-open]');
        if (!trigger) {
            if (!event.target.closest || !event.target.closest('.fc-quick-actions')) closeQuickActions();
            return;
        }
        event.preventDefault();
        buzz();
        closeQuickActions();
        if (trigger.dataset.fcOpen === 'chat') { window.FreecrafterChat && window.FreecrafterChat.open(); return; }
        const panels = window.FreecrafterPanels;
        if (!panels) return;
        if (trigger.dataset.fcOpen === 'settings') panels.openSettings();
        else if (trigger.dataset.fcOpen === 'mods') panels.openMods();
        else if (trigger.dataset.fcOpen === 'onboarding') panels.openOnboarding();
        else if (trigger.dataset.fcOpen === 'updates') panels.openUpdates();
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeQuickActions();
    });

    window.addEventListener('freecrafter:game-menu', (event) => {
        if (!event.detail || !event.detail.visible) closeQuickActions();
    });

    applyAll();

    window.FreecrafterEffects = { broadcast, buzz, applyFullscreen, applyOrientation };
})();
