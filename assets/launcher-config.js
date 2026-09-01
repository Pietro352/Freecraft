/*
 * Configurazione condivisa del launcher FREECRAFTER.
 *
 * Questo file viene caricato sia dalla home (index.html) sia dalla pagina del
 * client dentro l'iframe (freecraft/index.html): essendo la stessa origine, i
 * due documenti leggono e scrivono lo stesso localStorage e restano sempre
 * allineati (le modifiche fatte nella home arrivano al gioco tramite l'evento
 * "storage" e, come rete di sicurezza, tramite postMessage).
 */
(function (global) {
    'use strict';

    const SETTINGS_KEY = 'freecrafter:settings:v1';
    const MODS_KEY = 'freecrafter:mods:v1';

    const DEFAULT_SETTINGS = {
        // Gioco e avvio
        autoLaunch: false,
        fullscreenOnLaunch: false,
        lockLandscape: false,
        keepAwake: true,
        confirmExit: false,
        menuAnimation: true,
        // Grafica
        renderScale: 100,
        fpsLimit: 0,
        brightness: 100,
        contrast: 100,
        saturation: 100,
        pixelated: false,
        // Audio
        masterVolume: 100,
        muted: false,
        muteWhenHidden: true,
        // Controlli
        mouseSensitivity: 100,
        invertMouseY: false,
        vibrate: false,
        // Chat
        showChatButton: true,
        chatBanners: true,
        chatSound: true,
        chatAutoClose: true
    };

    const DEFAULT_MODS = {
        fullbright: { enabled: false, level: 170 },
        zoom: { enabled: false, key: 'KeyC', level: 250 },
        fps: { enabled: false },
        clock: { enabled: false },
        crosshair: { enabled: false, color: '#ffe14d', size: 12 },
        autosprint: { enabled: false, key: 'ControlLeft' },
        toggleSneak: { enabled: false, key: 'KeyV' },
        autoclick: { enabled: false, cps: 8, key: 'KeyR' }
    };

    /* Descrizione delle mod: usata dal pannello per costruire l'interfaccia e
       dal runtime dentro il gioco per sapere quali valori leggere. */
    const MOD_DEFS = [
        {
            id: 'fullbright',
            name: 'Luminosità piena',
            desc: 'Illumina grotte e notti come se avessi la gamma al massimo.',
            controls: [{ key: 'level', type: 'range', label: 'Intensità', min: 110, max: 260, step: 5, unit: '%' }]
        },
        {
            id: 'zoom',
            name: 'Zoom ottico',
            desc: 'Tieni premuto il tasto per ingrandire la vista, come un binocolo.',
            controls: [
                { key: 'key', type: 'key', label: 'Tasto zoom' },
                { key: 'level', type: 'range', label: 'Ingrandimento', min: 150, max: 500, step: 10, unit: '%' }
            ]
        },
        { id: 'fps', name: 'Contatore FPS', desc: 'Mostra i fotogrammi al secondo reali del gioco.' },
        { id: 'clock', name: 'Orologio', desc: 'Mostra l\'ora del tuo dispositivo mentre giochi.' },
        {
            id: 'crosshair',
            name: 'Mirino personalizzato',
            desc: 'Aggiunge un mirino colorato al centro dello schermo.',
            controls: [
                { key: 'color', type: 'color', label: 'Colore' },
                { key: 'size', type: 'range', label: 'Dimensione', min: 6, max: 28, step: 1, unit: 'px' }
            ]
        },
        {
            id: 'autosprint',
            name: 'Sprint automatico',
            desc: 'Tiene premuto il tasto della corsa mentre vai avanti.',
            controls: [{
                key: 'key', type: 'select', label: 'Tasto corsa del gioco', options: [
                    { value: 'ControlLeft', label: 'Ctrl sinistro' },
                    { value: 'ShiftLeft', label: 'Shift sinistro' }
                ]
            }]
        },
        {
            id: 'toggleSneak',
            name: 'Sneak a interruttore',
            desc: 'Premi una volta per accovacciarti e una volta per rialzarti.',
            controls: [{ key: 'key', type: 'key', label: 'Tasto' }]
        },
        {
            id: 'autoclick',
            name: 'Click automatico',
            desc: 'Clicca da solo quando è attivo: comodo per minare o coltivare.',
            controls: [
                { key: 'cps', type: 'range', label: 'Click al secondo', min: 1, max: 20, step: 1, unit: 'cps' },
                { key: 'key', type: 'key', label: 'Tasto attiva/disattiva' }
            ]
        }
    ];

    /* Voci del pannello impostazioni. "scope" indica solo chi le applica:
       parent = launcher, game = runtime dentro l'iframe. */
    const SETTINGS_SCHEMA = [
        {
            id: 'avvio',
            title: 'Gioco e avvio',
            items: [
                { key: 'autoLaunch', type: 'toggle', label: 'Avvio automatico', hint: 'Entra nel gioco senza passare dal menu.', scope: 'parent' },
                { key: 'fullscreenOnLaunch', type: 'toggle', label: 'Schermo intero all\'avvio', scope: 'parent' },
                { key: 'lockLandscape', type: 'toggle', label: 'Blocca schermo orizzontale', hint: 'Solo su telefoni e tablet che lo permettono.', scope: 'parent' },
                { key: 'keepAwake', type: 'toggle', label: 'Non spegnere lo schermo', hint: 'Tiene il display acceso mentre giochi.', scope: 'parent' },
                { key: 'confirmExit', type: 'toggle', label: 'Chiedi conferma prima di uscire', hint: 'Evita di chiudere la pagina per sbaglio.', scope: 'parent' },
                { key: 'menuAnimation', type: 'toggle', label: 'Animazione dei blocchi nel menu', scope: 'parent' }
            ]
        },
        {
            id: 'grafica',
            title: 'Grafica',
            items: [
                { key: 'renderScale', type: 'range', label: 'Scala risoluzione', min: 50, max: 150, step: 5, unit: '%', hint: 'Abbassala per guadagnare FPS sui dispositivi lenti.', scope: 'game' },
                {
                    key: 'fpsLimit', type: 'select', label: 'Limite FPS', scope: 'game', options: [
                        { value: 0, label: 'Illimitato' },
                        { value: 30, label: '30 FPS' },
                        { value: 45, label: '45 FPS' },
                        { value: 60, label: '60 FPS' },
                        { value: 75, label: '75 FPS' },
                        { value: 120, label: '120 FPS' }
                    ]
                },
                { key: 'brightness', type: 'range', label: 'Luminosità', min: 60, max: 200, step: 5, unit: '%', scope: 'game' },
                { key: 'contrast', type: 'range', label: 'Contrasto', min: 70, max: 150, step: 5, unit: '%', scope: 'game' },
                { key: 'saturation', type: 'range', label: 'Saturazione', min: 0, max: 200, step: 5, unit: '%', scope: 'game' },
                { key: 'pixelated', type: 'toggle', label: 'Pixel nitidi', hint: 'Niente sfocatura quando la risoluzione è ridotta.', scope: 'game' }
            ]
        },
        {
            id: 'audio',
            title: 'Audio',
            items: [
                { key: 'masterVolume', type: 'range', label: 'Volume generale', min: 0, max: 100, step: 5, unit: '%', scope: 'game' },
                { key: 'muted', type: 'toggle', label: 'Silenzia tutto', scope: 'game' },
                { key: 'muteWhenHidden', type: 'toggle', label: 'Silenzia in secondo piano', hint: 'Ferma l\'audio quando cambi scheda o app.', scope: 'game' }
            ]
        },
        {
            id: 'controlli',
            title: 'Controlli',
            items: [
                { key: 'mouseSensitivity', type: 'range', label: 'Sensibilità mouse', min: 25, max: 300, step: 5, unit: '%', hint: 'A 100% resta quella del gioco.', scope: 'game' },
                { key: 'invertMouseY', type: 'toggle', label: 'Inverti asse verticale', scope: 'game' },
                { key: 'vibrate', type: 'toggle', label: 'Vibrazione al tocco', hint: 'Solo sui dispositivi che supportano la vibrazione.', scope: 'game' }
            ]
        },
        {
            id: 'chat',
            title: 'CraftChat',
            items: [
                { key: 'showChatButton', type: 'toggle', label: 'Mostra il pulsante della chat', scope: 'parent' },
                { key: 'chatBanners', type: 'toggle', label: 'Avvisi dei nuovi messaggi', scope: 'parent' },
                { key: 'chatSound', type: 'toggle', label: 'Suono dei nuovi messaggi', scope: 'parent' },
                { key: 'chatAutoClose', type: 'toggle', label: 'Chiudi la chat quando torni al gioco', scope: 'parent' }
            ]
        },
        {
            id: 'dati',
            title: 'Dati e salvataggi',
            items: [
                { type: 'info', key: 'storagePersisted', label: 'Salvataggi protetti' },
                { type: 'info', key: 'storageUsage', label: 'Spazio occupato' },
                { type: 'action', key: 'requestPersist', label: 'Proteggi i salvataggi', button: 'Richiedi', hint: 'Chiede al browser di non cancellare i mondi.' },
                { type: 'action', key: 'exportConfig', label: 'Esporta impostazioni e mod', button: 'Esporta' },
                { type: 'action', key: 'importConfig', label: 'Importa impostazioni e mod', button: 'Importa' },
                { type: 'action', key: 'resetConfig', label: 'Reimposta tutto', button: 'Reimposta', danger: true },
                { type: 'action', key: 'clearWorlds', label: 'Cancella i dati del gioco', button: 'Cancella', danger: true, hint: 'Elimina mondi, opzioni e profilo salvati nel browser.' }
            ]
        },
        {
            id: 'info',
            title: 'Informazioni',
            items: [
                { type: 'info', key: 'clientVersion', label: 'Client' },
                { type: 'info', key: 'device', label: 'Dispositivo' },
                { type: 'info', key: 'screenInfo', label: 'Schermo' },
                { type: 'info', key: 'modsActive', label: 'Mod attive' }
            ]
        }
    ];

    const clone = (value) => JSON.parse(JSON.stringify(value));

    function mergeSettings(stored) {
        const out = clone(DEFAULT_SETTINGS);
        if (!stored || typeof stored !== 'object') return out;
        Object.keys(out).forEach((key) => {
            const value = stored[key];
            if (value === undefined || value === null) return;
            if (typeof out[key] === 'boolean') out[key] = Boolean(value);
            else if (typeof out[key] === 'number') { const n = Number(value); if (Number.isFinite(n)) out[key] = n; }
            else out[key] = value;
        });
        return out;
    }

    function mergeMods(stored) {
        const out = clone(DEFAULT_MODS);
        if (!stored || typeof stored !== 'object') return out;
        Object.keys(out).forEach((id) => {
            const saved = stored[id];
            if (!saved || typeof saved !== 'object') return;
            Object.keys(out[id]).forEach((key) => {
                const value = saved[key];
                if (value === undefined || value === null) return;
                if (typeof out[id][key] === 'boolean') out[id][key] = Boolean(value);
                else if (typeof out[id][key] === 'number') { const n = Number(value); if (Number.isFinite(n)) out[id][key] = n; }
                else out[id][key] = String(value);
            });
        });
        return out;
    }

    function readJSON(key) {
        try {
            const raw = global.localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function writeJSON(key, value) {
        try {
            global.localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            return false;
        }
    }

    const listeners = new Set();

    const config = {
        SETTINGS_KEY,
        MODS_KEY,
        DEFAULT_SETTINGS,
        DEFAULT_MODS,
        MOD_DEFS,
        SETTINGS_SCHEMA,
        settings: mergeSettings(readJSON(SETTINGS_KEY)),
        mods: mergeMods(readJSON(MODS_KEY)),

        reload() {
            this.settings = mergeSettings(readJSON(SETTINGS_KEY));
            this.mods = mergeMods(readJSON(MODS_KEY));
            return this;
        },

        emit(reason) {
            listeners.forEach((fn) => {
                try { fn(this, reason); } catch (e) { /* una mod rotta non deve bloccare le altre */ }
            });
        },

        subscribe(fn) {
            listeners.add(fn);
            return () => listeners.delete(fn);
        },

        setSetting(key, value) {
            if (!(key in DEFAULT_SETTINGS)) return;
            this.settings[key] = value;
            writeJSON(SETTINGS_KEY, this.settings);
            this.emit('settings');
        },

        setMod(id, patch) {
            if (!this.mods[id]) return;
            Object.assign(this.mods[id], patch);
            writeJSON(MODS_KEY, this.mods);
            this.emit('mods');
        },

        resetAll() {
            this.settings = clone(DEFAULT_SETTINGS);
            this.mods = clone(DEFAULT_MODS);
            writeJSON(SETTINGS_KEY, this.settings);
            writeJSON(MODS_KEY, this.mods);
            this.emit('reset');
        },

        exportAll() {
            return JSON.stringify({ version: 1, settings: this.settings, mods: this.mods }, null, 2);
        },

        importAll(text) {
            const parsed = JSON.parse(text);
            this.settings = mergeSettings(parsed.settings);
            this.mods = mergeMods(parsed.mods);
            writeJSON(SETTINGS_KEY, this.settings);
            writeJSON(MODS_KEY, this.mods);
            this.emit('import');
            return true;
        },

        activeModCount() {
            return Object.keys(this.mods).filter((id) => this.mods[id].enabled).length;
        },

        applyMobilePreset() {
            Object.assign(this.settings, {
                renderScale: 65,
                fpsLimit: 30,
                menuAnimation: true,
                fullscreenOnLaunch: true,
                lockLandscape: true,
                keepAwake: true,
                vibrate: true
            });
            writeJSON(SETTINGS_KEY, this.settings);
            this.emit('mobile-preset');
        }
    };

    // La prima versione del preset mobile disattivava lo sfondo animato.
    // Lo ripristiniamo una sola volta sui dispositivi touch già configurati.
    try {
        const restoreKey = 'freecrafter:mobile-animation-restored:v1';
        if (global.matchMedia('(pointer: coarse)').matches && !global.localStorage.getItem(restoreKey)) {
            if (!config.settings.menuAnimation) {
                config.settings.menuAnimation = true;
                writeJSON(SETTINGS_KEY, config.settings);
            }
            global.localStorage.setItem(restoreKey, 'done');
        }
    } catch (e) {
        // Le impostazioni restano utilizzabili anche se lo storage è bloccato.
    }

    global.addEventListener('storage', (event) => {
        if (event.key !== SETTINGS_KEY && event.key !== MODS_KEY) return;
        config.reload().emit('storage');
    });

    global.addEventListener('message', (event) => {
        if (event.origin !== global.location.origin) return;
        if (!event.data || event.data.type !== 'freecrafter-config') return;
        config.reload().emit('message');
    });

    global.FreecrafterConfig = config;
})(window);
