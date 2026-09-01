/*
 * Runtime delle mod e delle impostazioni "di gioco" di FREECRAFTER.
 *
 * Viene caricato dentro l'iframe del client, PRIMA che il client parta, cosi'
 * puo' agganciare devicePixelRatio, requestAnimationFrame, l'AudioContext e gli
 * eventi di tastiera/mouse. Tutto quello che fa e' pilotare il client dal di
 * fuori (CSS sui canvas, HUD in overlay, eventi sintetici): il codice del gioco
 * non viene mai modificato a runtime.
 */
(function () {
    'use strict';

    const config = window.FreecrafterConfig;
    if (!config) return;

    const settings = () => config.settings;
    const mods = () => config.mods;
    const modOn = (id) => Boolean(mods()[id] && mods()[id].enabled);

    /* ------------------------------------------------------------------ *
     * 1. Scala di risoluzione (devicePixelRatio)
     * ------------------------------------------------------------------ */
    const nativeRatio = window.devicePixelRatio || 1;
    let ratioFactor = 1;
    let ratioHookOk = false;
    try {
        Object.defineProperty(window, 'devicePixelRatio', {
            configurable: true,
            get() { return nativeRatio * ratioFactor; }
        });
        ratioHookOk = true;
    } catch (e) { /* browser che non permette l'override: la scala resta 100% */ }

    function applyRenderScale() {
        if (!ratioHookOk) return;
        const next = Math.max(0.35, Math.min(1.6, settings().renderScale / 100));
        if (Math.abs(next - ratioFactor) < 0.001) return;
        ratioFactor = next;
        window.dispatchEvent(new Event('resize'));
    }

    /* ------------------------------------------------------------------ *
     * 2. Limite FPS + conteggio dei fotogrammi reali
     * ------------------------------------------------------------------ */
    const rawRequest = window.requestAnimationFrame.bind(window);
    const rawCancel = window.cancelAnimationFrame.bind(window);
    const pendingFrames = new Map();
    // I nostri handle vivono in un intervallo numerico che il contatore nativo
    // non raggiunge: cosi' sappiamo sempre di chi e' un handle da annullare.
    const HANDLE_BASE = 1000000000;
    let frameHandleSeq = HANDLE_BASE;
    let lastFrameStamp = 0;
    let frameCount = 0;
    let fpsValue = 0;
    let fpsWindowStart = 0;

    window.requestAnimationFrame = function (callback) {
        const handle = frameHandleSeq++;
        const step = (stamp) => {
            if (!pendingFrames.has(handle)) return;
            const limit = settings().fpsLimit;
            if (limit > 0 && lastFrameStamp && stamp - lastFrameStamp < (1000 / limit) - 0.7) {
                pendingFrames.set(handle, rawRequest(step));
                return;
            }
            lastFrameStamp = stamp;
            pendingFrames.delete(handle);
            frameCount++;
            if (!fpsWindowStart) fpsWindowStart = stamp;
            else if (stamp - fpsWindowStart >= 500) {
                fpsValue = Math.round((frameCount * 1000) / (stamp - fpsWindowStart));
                frameCount = 0;
                fpsWindowStart = stamp;
            }
            callback(stamp);
        };
        pendingFrames.set(handle, rawRequest(step));
        return handle;
    };

    window.cancelAnimationFrame = function (handle) {
        if (handle < HANDLE_BASE) { rawCancel(handle); return; }
        const inner = pendingFrames.get(handle);
        pendingFrames.delete(handle);
        if (inner !== undefined) rawCancel(inner);
    };

    /* ------------------------------------------------------------------ *
     * 3. Audio: volume generale, silenzioso, silenzio in secondo piano
     * ------------------------------------------------------------------ */
    const NativeAudioContext = window.AudioContext || window.webkitAudioContext;
    const masterGains = new Set();

    function targetVolume() {
        const s = settings();
        if (s.muted) return 0;
        if (s.muteWhenHidden && document.visibilityState === 'hidden') return 0;
        return Math.max(0, Math.min(1, s.masterVolume / 100));
    }

    function applyVolume() {
        const value = targetVolume();
        masterGains.forEach((gain) => {
            try {
                gain.gain.setTargetAtTime(value, gain.context.currentTime, 0.02);
            } catch (e) {
                try { gain.gain.value = value; } catch (e2) { /* nodo chiuso */ }
            }
        });
    }

    if (NativeAudioContext) {
        const Wrapped = function (...args) {
            const context = new NativeAudioContext(...args);
            try {
                const realDestination = context.destination;
                const gain = context.createGain();
                gain.gain.value = targetVolume();
                gain.connect(realDestination);
                masterGains.add(gain);
                Object.defineProperty(context, 'destination', {
                    configurable: true,
                    get() { return gain; }
                });
            } catch (e) { /* niente controllo volume su questo browser */ }
            return context;
        };
        Wrapped.prototype = NativeAudioContext.prototype;
        window.AudioContext = Wrapped;
        window.webkitAudioContext = Wrapped;
    }

    document.addEventListener('visibilitychange', applyVolume);

    /* ------------------------------------------------------------------ *
     * 4. Filtri grafici sui canvas del client
     * ------------------------------------------------------------------ */
    const styleNode = document.createElement('style');
    styleNode.id = 'fc-mods-style';
    (document.head || document.documentElement).appendChild(styleNode);

    let zoomActive = false;

    function applyVisuals() {
        const s = settings();
        const filters = [];
        let brightness = s.brightness / 100;
        if (modOn('fullbright')) brightness *= mods().fullbright.level / 100;
        if (Math.abs(brightness - 1) > 0.001) filters.push('brightness(' + brightness.toFixed(3) + ')');
        if (s.contrast !== 100) filters.push('contrast(' + (s.contrast / 100).toFixed(3) + ')');
        if (s.saturation !== 100) filters.push('saturate(' + (s.saturation / 100).toFixed(3) + ')');

        const rules = ['#game_frame canvas, body > canvas {'];
        if (filters.length) rules.push('  filter: ' + filters.join(' ') + ';');
        if (s.pixelated) rules.push('  image-rendering: pixelated;');
        if (zoomActive && modOn('zoom')) {
            const scale = Math.max(1, mods().zoom.level / 100);
            rules.push('  transform: scale(' + scale.toFixed(2) + ');');
            rules.push('  transform-origin: center center;');
        }
        rules.push('}');
        styleNode.textContent = rules.join('\n');
    }

    /* ------------------------------------------------------------------ *
     * 5. HUD (FPS, orologio, mirino, righe della mod personalizzata)
     * ------------------------------------------------------------------ */
    const hud = document.createElement('div');
    hud.id = 'fc-hud';
    const hudLines = document.createElement('div');
    hudLines.id = 'fc-hud-lines';
    const crosshair = document.createElement('div');
    crosshair.id = 'fc-crosshair';
    crosshair.innerHTML = '<i></i><i></i>';

    const hudStyle = document.createElement('style');
    hudStyle.textContent = [
        '#fc-hud{position:fixed;top:6px;left:8px;z-index:2147483000;pointer-events:none;',
        'font-family:"Courier New",monospace;font-size:13px;line-height:1.35;color:#fff;',
        'text-shadow:1px 1px 0 #000,-1px 1px 0 #000,1px -1px 0 #000,-1px -1px 0 #000;}',
        '#fc-hud div{white-space:pre;}',
        '#fc-crosshair{position:fixed;left:50%;top:50%;z-index:2147483000;pointer-events:none;',
        'transform:translate(-50%,-50%);display:none;}',
        '#fc-crosshair i{position:absolute;background:currentColor;box-shadow:0 0 2px rgba(0,0,0,.9);}',
        '#fc-crosshair i:first-child{left:50%;top:0;width:2px;height:100%;transform:translateX(-50%);}',
        '#fc-crosshair i:last-child{top:50%;left:0;height:2px;width:100%;transform:translateY(-50%);}'
    ].join('');

    function mountHud() {
        if (!document.body) return;
        if (!hudStyle.isConnected) document.head.appendChild(hudStyle);
        if (!hud.isConnected) document.body.appendChild(hud);
        if (!crosshair.isConnected) document.body.appendChild(crosshair);
        if (!hudLines.isConnected) hud.appendChild(hudLines);
    }

    const fpsLine = document.createElement('div');
    const clockLine = document.createElement('div');

    function applyHud() {
        mountHud();
        if (modOn('fps')) { if (!fpsLine.isConnected) hud.insertBefore(fpsLine, hudLines); }
        else fpsLine.remove();
        if (modOn('clock')) { if (!clockLine.isConnected) hud.insertBefore(clockLine, hudLines); }
        else clockLine.remove();

        if (modOn('crosshair')) {
            const size = mods().crosshair.size;
            crosshair.style.color = mods().crosshair.color;
            crosshair.style.width = size + 'px';
            crosshair.style.height = size + 'px';
            crosshair.style.display = document.pointerLockElement ? 'block' : 'none';
        } else {
            crosshair.style.display = 'none';
        }

        syncHudTimer();
    }

    let hudTimer = null;

    function refreshHudLines() {
        if (modOn('fps')) fpsLine.textContent = fpsValue + ' FPS';
        if (modOn('clock')) {
            const now = new Date();
            clockLine.textContent = String(now.getHours()).padStart(2, '0') + ':' +
                String(now.getMinutes()).padStart(2, '0') + ':' +
                String(now.getSeconds()).padStart(2, '0');
        }
    }

    // Il timer serve solo se c'e' qualcosa da aggiornare: con FPS e orologio
    // spenti restava comunque a svegliare la pagina due volte al secondo.
    function syncHudTimer() {
        const needed = modOn('fps') || modOn('clock');
        if (needed && hudTimer === null) {
            refreshHudLines();
            hudTimer = setInterval(refreshHudLines, 500);
        } else if (!needed && hudTimer !== null) {
            clearInterval(hudTimer);
            hudTimer = null;
        }
    }

    /* ------------------------------------------------------------------ *
     * 6. Eventi sintetici verso il client
     * ------------------------------------------------------------------ */
    const SYNTHETIC = '__freecrafterSynthetic';
    const heldKeys = new Set();

    function gameCanvas() {
        return document.querySelector('#game_frame canvas') || document.querySelector('canvas');
    }

    function keyEvent(type, code) {
        const event = new KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true });
        try { event[SYNTHETIC] = true; } catch (e) { /* ignorato */ }
        (gameCanvas() || document.body || window).dispatchEvent(event);
        window.dispatchEvent(event);
    }

    function holdKey(code, down) {
        if (!code) return;
        if (down && heldKeys.has(code)) return;
        if (!down && !heldKeys.has(code)) return;
        if (down) heldKeys.add(code); else heldKeys.delete(code);
        keyEvent(down ? 'keydown' : 'keyup', code);
    }

    function pressKey(code, duration) {
        if (!code) return;
        keyEvent('keydown', code);
        setTimeout(() => keyEvent('keyup', code), duration || 60);
    }

    function mouseClick() {
        const target = gameCanvas() || document.body;
        if (!target) return;
        const rect = target.getBoundingClientRect ? target.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
        const base = {
            bubbles: true, cancelable: true, view: window, button: 0,
            clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2
        };
        const down = new MouseEvent('mousedown', Object.assign({ buttons: 1 }, base));
        const up = new MouseEvent('mouseup', Object.assign({ buttons: 0 }, base));
        try { down[SYNTHETIC] = true; up[SYNTHETIC] = true; } catch (e) { /* ignorato */ }
        target.dispatchEvent(down);
        setTimeout(() => target.dispatchEvent(up), 24);
    }

    function mouseButtonClick(button, clientX, clientY) {
        const target = gameCanvas() || document.body;
        if (!target) return;
        const base = {
            bubbles: true, cancelable: true, view: window, button,
            clientX, clientY
        };
        const down = new MouseEvent('mousedown', Object.assign({ buttons: button === 2 ? 2 : 1 }, base));
        const up = new MouseEvent('mouseup', Object.assign({ buttons: 0 }, base));
        try { down[SYNTHETIC] = true; up[SYNTHETIC] = true; } catch (e) { /* ignorato */ }
        target.dispatchEvent(down);
        setTimeout(() => target.dispatchEvent(up), 24);
    }

    /* ------------------------------------------------------------------ *
     * 6b. Doppio tocco per dividere gli stack sui dispositivi touch
     * ------------------------------------------------------------------ */
    const touchDevice = navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;
    const doubleTapDelay = 360;
    const doubleTapDistance = 28;
    let tapCandidate = null;
    let previousTap = null;
    let consumedDoubleTap = null;

    function touchDistance(first, second) {
        return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
    }

    window.addEventListener('touchstart', (event) => {
        if (!touchDevice || document.pointerLockElement || !event.changedTouches.length) return;
        const canvas = gameCanvas();
        if (!canvas || event.target !== canvas) return;
        const touch = event.changedTouches[0];
        const now = performance.now();
        const isDoubleTap = previousTap &&
            now - previousTap.time <= doubleTapDelay &&
            touchDistance(previousTap, touch) <= doubleTapDistance;

        if (!isDoubleTap) {
            tapCandidate = {
                identifier: touch.identifier,
                clientX: touch.clientX,
                clientY: touch.clientY,
                moved: false
            };
            return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();
        consumedDoubleTap = touch.identifier;
        tapCandidate = null;
        previousTap = null;

        mouseButtonClick(0, touch.clientX, touch.clientY);
        setTimeout(() => mouseButtonClick(2, touch.clientX, touch.clientY), 48);
        if (settings().vibrate && navigator.vibrate) navigator.vibrate([18, 28, 24]);
    }, true);

    window.addEventListener('touchmove', (event) => {
        const touches = Array.from(event.changedTouches || []);
        if (consumedDoubleTap !== null && touches.some((touch) => touch.identifier === consumedDoubleTap)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
        }
        if (!tapCandidate) return;
        const touch = touches.find((item) => item.identifier === tapCandidate.identifier);
        if (touch && touchDistance(tapCandidate, touch) > doubleTapDistance) tapCandidate.moved = true;
    }, true);

    function finishTap(event) {
        const touches = Array.from(event.changedTouches || []);
        if (consumedDoubleTap !== null && touches.some((touch) => touch.identifier === consumedDoubleTap)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            consumedDoubleTap = null;
            return;
        }
        if (!tapCandidate) return;
        const touch = touches.find((item) => item.identifier === tapCandidate.identifier);
        if (!touch) return;
        previousTap = tapCandidate.moved ? null : {
            clientX: touch.clientX,
            clientY: touch.clientY,
            time: performance.now()
        };
        tapCandidate = null;
    }

    window.addEventListener('touchend', finishTap, true);
    window.addEventListener('touchcancel', (event) => {
        finishTap(event);
        tapCandidate = null;
        previousTap = null;
    }, true);

    /* ------------------------------------------------------------------ *
     * 7. Sensibilità e inversione del mouse
     * ------------------------------------------------------------------ */
    let leftoverX = 0;
    let leftoverY = 0;

    window.addEventListener('mousemove', (event) => {
        if (event[SYNTHETIC]) return;
        if (!document.pointerLockElement) return;
        const s = settings();
        const factor = s.mouseSensitivity / 100;
        if (Math.abs(factor - 1) < 0.001 && !s.invertMouseY) return;

        const rawX = (event.movementX || 0) * factor + leftoverX;
        const rawY = (event.movementY || 0) * factor * (s.invertMouseY ? -1 : 1) + leftoverY;
        const moveX = Math.trunc(rawX);
        const moveY = Math.trunc(rawY);
        leftoverX = rawX - moveX;
        leftoverY = rawY - moveY;

        event.stopImmediatePropagation();
        if (!moveX && !moveY) return;

        const clone = new MouseEvent('mousemove', {
            bubbles: true, cancelable: true, view: window,
            clientX: event.clientX, clientY: event.clientY,
            screenX: event.screenX, screenY: event.screenY,
            buttons: event.buttons, movementX: moveX, movementY: moveY
        });
        try { clone[SYNTHETIC] = true; } catch (e) { /* ignorato */ }
        (event.target || window).dispatchEvent(clone);
    }, true);

    /* ------------------------------------------------------------------ *
     * 8. Mod di gioco: zoom, sprint, sneak, autoclick
     * ------------------------------------------------------------------ */
    let sneakHeld = false;
    let autoclickOn = false;
    let autoclickTimer = null;

    let autosprintCode = null;

    function applyAutosprint() {
        const wanted = modOn('autosprint') && Boolean(document.pointerLockElement);
        const code = mods().autosprint.key;
        // Rilasciamo il tasto che avevamo davvero premuto noi: cosi' cambiare
        // scorciatoia non lascia il vecchio tasto bloccato, e lo sneak alternato
        // resta affare del solo toggleSneak.
        if (autosprintCode !== null && (!wanted || autosprintCode !== code)) {
            holdKey(autosprintCode, false);
            autosprintCode = null;
        }
        if (wanted) {
            holdKey(code, true);
            autosprintCode = code;
        }
    }

    function stopAutoclick() {
        autoclickOn = false;
        clearInterval(autoclickTimer);
        autoclickTimer = null;
    }

    function toggleAutoclick() {
        if (autoclickOn) { stopAutoclick(); return; }
        autoclickOn = true;
        const cps = Math.max(1, Math.min(20, mods().autoclick.cps));
        autoclickTimer = setInterval(() => {
            if (!modOn('autoclick') || !document.pointerLockElement) { stopAutoclick(); return; }
            mouseClick();
        }, Math.round(1000 / cps));
    }

    window.addEventListener('keydown', (event) => {
        if (event[SYNTHETIC] || event.repeat) return;

        if (modOn('zoom') && event.code === mods().zoom.key && document.pointerLockElement && !zoomActive) {
            zoomActive = true;
            applyVisuals();
        }

        if (modOn('toggleSneak') && event.code === mods().toggleSneak.key && document.pointerLockElement) {
            sneakHeld = !sneakHeld;
            holdKey('ShiftLeft', sneakHeld);
        }

        if (modOn('autoclick') && event.code === mods().autoclick.key && document.pointerLockElement) {
            toggleAutoclick();
        }

    }, true);

    window.addEventListener('keyup', (event) => {
        if (event[SYNTHETIC]) return;
        if (event.code === mods().zoom.key && zoomActive) {
            zoomActive = false;
            applyVisuals();
        }
    }, true);

    document.addEventListener('pointerlockchange', () => {
        if (!document.pointerLockElement) {
            if (zoomActive) { zoomActive = false; applyVisuals(); }
            if (sneakHeld) { sneakHeld = false; holdKey('ShiftLeft', false); }
            stopAutoclick();
        }
        applyAutosprint();
        applyHud();
    });

    window.addEventListener('blur', () => {
        heldKeys.forEach((code) => keyEvent('keyup', code));
        heldKeys.clear();
        sneakHeld = false;
        stopAutoclick();
        if (zoomActive) { zoomActive = false; applyVisuals(); }
    });

    /* ------------------------------------------------------------------ *
     * 9. Applicazione e sincronizzazione
     * ------------------------------------------------------------------ */
    function applyAll() {
        applyRenderScale();
        applyVolume();
        applyVisuals();
        applyHud();
        applyAutosprint();
        if (!modOn('autoclick')) stopAutoclick();
    }

    config.subscribe(applyAll);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyAll, { once: true });
    }
    applyAll();
    setTimeout(applyAll, 1200);

    // Chiede al launcher la configurazione corrente (rete di sicurezza se il
    // localStorage non fosse leggibile in questo contesto).
    try {
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: 'freecrafter-config-request' }, window.location.origin);
        }
    } catch (e) { /* nessun launcher: pagina aperta da sola */ }

    window.FreecrafterMods = { applyAll };
})();
