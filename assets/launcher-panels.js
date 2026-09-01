/*
 * Pannelli "Mod" e "Impostazioni" della home di FREECRAFTER.
 * L'interfaccia viene costruita a partire dagli schemi definiti in
 * launcher-config.js, cosi' una nuova voce si aggiunge in un solo posto.
 */
(function () {
    'use strict';

    const config = window.FreecrafterConfig;
    if (!config) return;
    const releases = Array.isArray(window.FreecrafterReleases) ? window.FreecrafterReleases : [];
    const RELEASE_READ_KEY = 'freecrafter:last-release-read';
    const ONBOARDING_KEY = 'freecrafter:onboarding:v1';
    let lastFocusedElement = null;
    // Cattura del tasto in corso, se c'e': serve poterla annullare da fuori.
    let stopKeyCapture = null;

    const KEY_LABELS = {
        ControlLeft: 'Ctrl sinistro', ControlRight: 'Ctrl destro',
        ShiftLeft: 'Shift sinistro', ShiftRight: 'Shift destro',
        AltLeft: 'Alt sinistro', AltRight: 'Alt destro',
        Space: 'Spazio', Enter: 'Invio', Tab: 'Tab', Backquote: 'Backtick (`)',
        ArrowUp: 'Freccia su', ArrowDown: 'Freccia giù', ArrowLeft: 'Freccia sinistra', ArrowRight: 'Freccia destra'
    };

    const keyLabel = (code) => {
        if (!code) return 'Nessuno';
        if (KEY_LABELS[code]) return KEY_LABELS[code];
        if (/^Key[A-Z]$/.test(code)) return code.slice(3);
        if (/^Digit\d$/.test(code)) return code.slice(5);
        if (/^Numpad/.test(code)) return 'Num ' + code.slice(6);
        return code;
    };

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    /* --- Toast --- */
    let toastNode = null;
    let toastTimer = null;
    function toast(message, isError) {
        if (!toastNode) {
            toastNode = el('div', 'fc-toast');
            toastNode.setAttribute('role', 'status');
            document.body.appendChild(toastNode);
        }
        toastNode.textContent = message;
        toastNode.classList.toggle('is-error', Boolean(isError));
        toastNode.classList.add('is-visible');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastNode.classList.remove('is-visible'), 3400);
    }

    /* --- Controlli --- */
    function buildControl(item, getValue, setValue) {
        const wrap = el('div', 'fc-row__control');

        if (item.type === 'toggle') {
            const button = el('button', 'fc-toggle');
            button.type = 'button';
            const paint = () => {
                const on = Boolean(getValue());
                button.setAttribute('aria-pressed', String(on));
                button.textContent = on ? 'ATTIVO' : 'SPENTO';
            };
            button.addEventListener('click', () => { setValue(!getValue()); paint(); });
            paint();
            wrap.appendChild(button);
            return wrap;
        }

        if (item.type === 'range') {
            const box = el('div', 'fc-range');
            const input = document.createElement('input');
            input.type = 'range';
            input.min = String(item.min);
            input.max = String(item.max);
            input.step = String(item.step || 1);
            input.value = String(getValue());
            const out = document.createElement('output');
            const paint = () => { out.textContent = input.value + (item.unit ? ' ' + item.unit : ''); };
            let debounce = null;
            input.addEventListener('input', () => {
                paint();
                clearTimeout(debounce);
                debounce = setTimeout(() => setValue(Number(input.value)), 110);
            });
            input.addEventListener('change', () => { clearTimeout(debounce); setValue(Number(input.value)); });
            paint();
            box.append(input, out);
            wrap.appendChild(box);
            return wrap;
        }

        if (item.type === 'select') {
            const select = el('select', 'fc-select');
            item.options.forEach((option) => {
                const node = el('option', null, option.label);
                node.value = String(option.value);
                select.appendChild(node);
            });
            select.value = String(getValue());
            select.addEventListener('change', () => {
                const raw = select.value;
                const first = item.options[0];
                setValue(typeof first.value === 'number' ? Number(raw) : raw);
            });
            wrap.appendChild(select);
            return wrap;
        }

        if (item.type === 'color') {
            const input = document.createElement('input');
            input.type = 'color';
            input.className = 'fc-color';
            input.value = getValue();
            input.addEventListener('input', () => setValue(input.value));
            wrap.appendChild(input);
            return wrap;
        }

        if (item.type === 'key') {
            const button = el('button', 'fc-mini-button');
            button.type = 'button';
            const paint = () => { button.textContent = keyLabel(getValue()); };
            button.addEventListener('click', () => {
                // Un ascolto per volta: due clic di fila lasciavano due listener
                // sulla finestra, e il secondo si mangiava un tasto premuto molto
                // dopo, magari a pannello gia' chiuso.
                if (stopKeyCapture) stopKeyCapture();
                button.classList.add('is-listening');
                button.textContent = 'PREMI UN TASTO...';
                const onKey = (event) => {
                    // Finche' stiamo ascoltando, il tasto non deve arrivare al
                    // resto della pagina: Esc annulla la cattura e basta.
                    event.preventDefault();
                    event.stopPropagation();
                    stopKeyCapture();
                    if (event.code && event.code !== 'Escape') setValue(event.code);
                };
                stopKeyCapture = () => {
                    stopKeyCapture = null;
                    window.removeEventListener('keydown', onKey, true);
                    button.classList.remove('is-listening');
                    paint();
                };
                window.addEventListener('keydown', onKey, true);
            });
            paint();
            wrap.appendChild(button);
            return wrap;
        }

        if (item.type === 'code' || item.type === 'text') {
            const input = item.type === 'code' ? el('textarea', 'fc-code') : document.createElement('input');
            if (item.type === 'text') { input.className = 'fc-text'; input.type = 'text'; }
            input.value = getValue() || '';
            if (item.type === 'code') input.spellcheck = false;
            input.addEventListener('change', () => setValue(input.value));
            wrap.appendChild(input);
            return wrap;
        }

        if (item.type === 'info') {
            const value = el('div', 'fc-info-value', '...');
            value.dataset.info = item.key;
            wrap.appendChild(value);
            return wrap;
        }

        if (item.type === 'action') {
            const button = el('button', 'fc-mini-button' + (item.danger ? ' is-danger' : ''), item.button || 'Esegui');
            button.type = 'button';
            button.addEventListener('click', () => runAction(item.key, button));
            wrap.appendChild(button);
            return wrap;
        }

        return wrap;
    }

    function buildRow(item, getValue, setValue, stacked) {
        const row = el('div', 'fc-row' + (stacked ? ' fc-row--stacked' : ''));
        const label = el('div', 'fc-row__label');
        label.appendChild(document.createTextNode(item.label));
        if (item.hint) label.appendChild(el('small', 'fc-row__hint', item.hint));
        row.append(label, buildControl(item, getValue, setValue));
        return row;
    }

    /* --- Azioni della sezione "Dati" --- */
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'application/json,.json';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    fileInput.addEventListener('change', async () => {
        const file = fileInput.files && fileInput.files[0];
        fileInput.value = '';
        if (!file) return;
        try {
            config.importAll(await file.text());
            refreshAllControls();
            toast('Impostazioni importate.');
        } catch (e) {
            toast('File non valido.', true);
        }
    });

    function download(name, text, mime) {
        const blob = new Blob([text], { type: mime || 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
    }

    async function clearGameData() {
        const dbNames = new Set([
            '_net_lax1dude_eaglercraft_v1_8_internal_PlatformFilesystem_1_8_8_worlds',
            '_net_lax1dude_eaglercraft_v1_8_internal_PlatformFilesystem_1_8_8_resourcePacks',
            '_net_lax1dude_eaglercraft_v1_8_boot_menu_BootMenuDatastore_1_8_8_main'
        ]);
        try {
            if (indexedDB.databases) {
                const list = await indexedDB.databases();
                list.forEach((entry) => { if (entry && entry.name) dbNames.add(entry.name); });
            }
        } catch (e) { /* enumerazione non supportata: restano i nomi noti */ }

        await Promise.all([...dbNames].map((name) => new Promise((resolve) => {
            let done = false;
            const finish = () => { if (!done) { done = true; resolve(); } };
            try {
                const request = indexedDB.deleteDatabase(name);
                request.onsuccess = finish;
                request.onerror = finish;
                request.onblocked = finish;
                setTimeout(finish, 2500);
            } catch (e) { finish(); }
        })));

        Object.keys(localStorage).forEach((key) => {
            if (/eaglercraft|latestUpdate_/i.test(key)) localStorage.removeItem(key);
        });
    }

    async function runAction(key, button) {
        if (key === 'requestPersist') {
            try {
                const granted = await navigator.storage.persist();
                toast(granted ? 'Salvataggi protetti dal browser.' : 'Il browser ha rifiutato la protezione.', !granted);
            } catch (e) {
                toast('Questo browser non supporta la protezione dei dati.', true);
            }
            refreshInfo();
            return;
        }

        if (key === 'exportConfig') {
            download('freecraft-impostazioni.json', config.exportAll());
            toast('File esportato.');
            return;
        }

        if (key === 'importConfig') { fileInput.click(); return; }

        if (key === 'resetConfig') {
            if (!window.confirm('Reimpostare tutte le impostazioni e disattivare le mod?')) return;
            config.resetAll();
            refreshAllControls();
            toast('Impostazioni reimpostate.');
            return;
        }

        if (key === 'clearWorlds') {
            if (!window.confirm('ATTENZIONE: verranno cancellati i mondi, le opzioni e il profilo salvati in questo browser. Continuare?')) return;
            if (!window.confirm('Ultima conferma: i mondi cancellati NON si possono recuperare. Procedere?')) return;
            const original = button.textContent;
            button.disabled = true;
            button.textContent = 'ATTENDI...';
            await clearGameData();
            button.disabled = false;
            button.textContent = original;
            toast('Dati del gioco cancellati. Ricarica la pagina.');
            refreshInfo();
        }
    }

    /* --- Informazioni dinamiche --- */
    async function refreshInfo() {
        const set = (key, value) => {
            document.querySelectorAll('[data-info="' + key + '"]').forEach((node) => { node.textContent = value; });
        };

        set('clientVersion', 'FREECRAFT · client 1.8 integrato');
        set('device', navigator.userAgentData && navigator.userAgentData.platform ? navigator.userAgentData.platform : (navigator.platform || 'Sconosciuto'));
        set('screenInfo', window.innerWidth + '×' + window.innerHeight + ' · ' + (window.devicePixelRatio || 1).toFixed(2) + 'x');
        set('modsActive', config.activeModCount() + ' su ' + config.MOD_DEFS.length);

        try {
            const persisted = await navigator.storage.persisted();
            set('storagePersisted', persisted ? 'Sì, i mondi sono protetti' : 'No, il browser può cancellarli');
        } catch (e) {
            set('storagePersisted', 'Non disponibile');
        }

        try {
            const estimate = await navigator.storage.estimate();
            const mb = (value) => (value / (1024 * 1024)).toFixed(1) + ' MB';
            set('storageUsage', mb(estimate.usage || 0) + ' usati di ' + mb(estimate.quota || 0));
        } catch (e) {
            set('storageUsage', 'Non disponibile');
        }
    }

    /* --- Costruzione dei pannelli --- */
    function makeOverlay(id, title, subtitle) {
        const overlay = el('div', 'fc-overlay');
        overlay.id = id;
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', title);

        const panel = el('div', 'fc-panel');
        const header = el('div', 'fc-panel__header');
        const heading = document.createElement('div');
        heading.className = 'fc-panel__heading';
        heading.appendChild(el('h2', null, title));
        if (subtitle) heading.appendChild(el('p', null, subtitle));
        const back = el('button', 'fc-panel__back', '← Indietro');
        back.type = 'button';
        back.setAttribute('aria-label', 'Torna indietro');
        back.addEventListener('click', () => setOverlayOpen(overlay, false));
        const close = el('button', 'fc-panel__close', '×');
        close.type = 'button';
        close.setAttribute('aria-label', 'Chiudi');
        close.addEventListener('click', () => setOverlayOpen(overlay, false));
        header.append(back, heading, close);

        const body = el('div', 'fc-panel__body');
        panel.append(header, body);
        overlay.appendChild(panel);
        overlay.addEventListener('mousedown', (event) => {
            if (event.target === overlay) setOverlayOpen(overlay, false);
        });
        document.body.appendChild(overlay);
        return { overlay, panel, body };
    }

    function setOverlayOpen(overlay, open) {
        // closeAll() richiude anche i pannelli gia' chiusi: senza questo controllo
        // ognuno di loro rispostava il fuoco, quattro volte di fila.
        if (overlay.classList.contains('is-open') === open) return;
        if (stopKeyCapture) stopKeyCapture();
        if (open) {
            document.querySelectorAll('.fc-overlay.is-open').forEach((item) => {
                if (item !== overlay) item.classList.remove('is-open');
            });
            lastFocusedElement = document.activeElement;
        }
        overlay.classList.toggle('is-open', open);
        if (open) {
            refreshInfo();
            requestAnimationFrame(() => overlay.querySelector('button, input, select, textarea')?.focus());
        } else if (document.body.classList.contains('is-in-game')) {
            window.focusGameFrame && window.focusGameFrame();
        } else if (lastFocusedElement?.focus) {
            lastFocusedElement.focus();
        }
    }

    const settingsUI = makeOverlay('fc-settings-overlay', 'IMPOSTAZIONI', 'Tutto quello che serve per giocare come piace a te.');
    const modsUI = makeOverlay('fc-mods-overlay', 'MOD · BETA', 'Attiva le mod integrate: valgono subito, anche a gioco avviato.');
    const updatesUI = makeOverlay('fc-updates-overlay', 'COSA È CAMBIATO', 'Le ultime correzioni disponibili in FREECRAFT.');
    const onboardingUI = makeOverlay('fc-onboarding-overlay', 'BENVENUTO IN FREECRAFT', 'Tre cose da sapere prima di entrare nel mondo.');

    function updateReleaseBadges() {
        const latestVersion = releases[0]?.version;
        const unread = latestVersion && localStorage.getItem(RELEASE_READ_KEY) !== latestVersion;
        document.querySelectorAll('[data-fc-open="updates"]').forEach((button) => {
            let badge = button.querySelector('.fc-new-badge');
            if (unread && !badge) {
                // Un quadratino, non la scritta "NUOVO": accanto all'etichetta
                // "Novita'" sembrava che il pulsante ripetesse due volte la
                // stessa parola.
                badge = el('span', 'fc-new-badge');
                badge.setAttribute('role', 'img');
                badge.setAttribute('aria-label', 'Ci sono novità da leggere');
                button.appendChild(badge);
            } else if (!unread && badge) badge.remove();
        });
    }

    function renderUpdates() {
        updatesUI.body.textContent = '';
        releases.forEach((item) => {
            const release = el('article', 'fc-update');
            release.appendChild(el('div', 'fc-update__date', `${item.date} · VERSIONE ${item.version}`));
            release.appendChild(el('h3', 'fc-update__title', item.title));
            const list = el('ul', 'fc-update__list');
            item.changes.forEach((change) => list.appendChild(el('li', null, change)));
            release.appendChild(list);
            if (item.hint) release.appendChild(el('p', 'fc-update__hint', item.hint));
            updatesUI.body.appendChild(release);
        });
    }

    function renderOnboarding() {
        onboardingUI.body.textContent = '';
        const grid = el('div', 'fc-onboarding-grid');
        [
            ['1 · GIOCA', 'Premi Gioca: il caricamento mostra il download reale del client. I mondi restano salvati nel browser.'],
            ['2 · CONTROLLI', 'Su computer usa mouse e tastiera. Su telefono ruota lo schermo e usa il preset mobile per maggiore stabilità.'],
            ['3 · PERSONALIZZA', 'Mod e impostazioni restano accessibili dal pulsante Menu. Le Novità sono sempre disponibili dalla “i”.']
        ].forEach(([title, copy]) => {
            const card = el('article', 'fc-onboarding-card');
            card.append(el('h3', null, title), el('p', null, copy));
            grid.appendChild(card);
        });
        const actions = el('div', 'fc-onboarding-actions');
        if (matchMedia('(pointer: coarse)').matches || innerWidth <= 768) {
            const preset = el('button', 'fc-action-button', 'APPLICA PRESET MOBILE');
            preset.type = 'button';
            preset.addEventListener('click', () => {
                config.applyMobilePreset();
                renderSettings();
                toast('Preset mobile applicato.');
                preset.textContent = 'PRESET MOBILE ATTIVO';
                preset.disabled = true;
            });
            actions.appendChild(preset);
        }
        const start = el('button', 'fc-action-button is-primary', 'HO CAPITO · INIZIA');
        start.type = 'button';
        start.addEventListener('click', () => {
            localStorage.setItem(ONBOARDING_KEY, 'done');
            setOverlayOpen(onboardingUI.overlay, false);
            if (releases[0] && localStorage.getItem(RELEASE_READ_KEY) !== releases[0].version) {
                setTimeout(() => window.FreecrafterPanels.openUpdates(), 180);
            }
        });
        actions.appendChild(start);
        onboardingUI.body.append(grid, actions);
    }

    function renderSettings() {
        settingsUI.body.textContent = '';
        config.SETTINGS_SCHEMA.forEach((section) => {
            const node = el('section', 'fc-section');
            node.appendChild(el('h3', 'fc-section__title', section.title));
            section.items.forEach((item) => {
                node.appendChild(buildRow(
                    item,
                    () => config.settings[item.key],
                    (value) => { config.setSetting(item.key, value); if (item.key === 'menuAnimation') refreshInfo(); }
                ));
            });
            settingsUI.body.appendChild(node);
        });
    }

    function renderMods() {
        modsUI.body.textContent = '';
        const intro = el('section', 'fc-section');
        intro.appendChild(el('h3', 'fc-section__title', 'Mod integrate'));
        config.MOD_DEFS.forEach((def) => {
            const state = config.mods[def.id];
            const card = el('div', 'fc-mod');
            card.classList.toggle('is-enabled', state.enabled);

            const head = el('div', 'fc-mod__head');
            const info = document.createElement('div');
            const name = el('div', 'fc-mod__name');
            name.appendChild(document.createTextNode(def.name));
            if (state.enabled) name.appendChild(el('span', 'fc-mod__badge', 'ON'));
            info.appendChild(name);
            info.appendChild(el('p', 'fc-mod__desc', def.desc));

            const toggle = buildControl(
                { type: 'toggle' },
                () => config.mods[def.id].enabled,
                (value) => {
                    config.setMod(def.id, { enabled: value });
                    card.classList.toggle('is-enabled', value);
                    name.textContent = def.name;
                    if (value) name.appendChild(el('span', 'fc-mod__badge', 'ON'));
                }
            );

            head.append(info, toggle);
            card.appendChild(head);

            if (def.controls && def.controls.length) {
                const controls = el('div', 'fc-mod__controls');
                def.controls.forEach((control) => {
                    controls.appendChild(buildRow(
                        control,
                        () => config.mods[def.id][control.key],
                        (value) => config.setMod(def.id, { [control.key]: value }),
                        control.type === 'code'
                    ));
                });
                card.appendChild(controls);
            }

            intro.appendChild(card);
        });
        modsUI.body.appendChild(intro);
    }

    function refreshAllControls() {
        renderSettings();
        renderMods();
        renderUpdates();
        renderOnboarding();
        refreshInfo();
    }

    refreshAllControls();

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        [settingsUI.overlay, modsUI.overlay, updatesUI.overlay, onboardingUI.overlay].forEach((overlay) => {
            if (overlay.classList.contains('is-open')) setOverlayOpen(overlay, false);
        });
    });

    window.FreecrafterPanels = {
        openSettings() { setOverlayOpen(settingsUI.overlay, true); },
        openMods() { setOverlayOpen(modsUI.overlay, true); },
        openUpdates() {
            if (releases[0]) localStorage.setItem(RELEASE_READ_KEY, releases[0].version);
            updateReleaseBadges();
            setOverlayOpen(updatesUI.overlay, true);
        },
        openOnboarding() { setOverlayOpen(onboardingUI.overlay, true); },
        closeAll() {
            setOverlayOpen(settingsUI.overlay, false);
            setOverlayOpen(modsUI.overlay, false);
            setOverlayOpen(updatesUI.overlay, false);
            setOverlayOpen(onboardingUI.overlay, false);
        },
        toast,
        refresh: refreshAllControls
    };

    updateReleaseBadges();
    setTimeout(() => {
        if (!localStorage.getItem(ONBOARDING_KEY)) {
            localStorage.setItem(ONBOARDING_KEY, 'shown');
            setOverlayOpen(onboardingUI.overlay, true);
        } else if (releases[0] && localStorage.getItem(RELEASE_READ_KEY) !== releases[0].version) {
            window.FreecrafterPanels.openUpdates();
        }
    }, 350);
})();
