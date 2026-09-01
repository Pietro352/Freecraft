(() => {
    'use strict';

    // Un errore dentro un ciclo di animazione si ripete decine di volte al
    // secondo: senza un tetto, la pagina passerebbe il tempo a spedire sempre
    // la stessa segnalazione invece che a far girare il gioco.
    const alreadySent = new Set();
    const MAX_REPORTS = 8;

    const send = (kind, message) => {
        const text = String(message || 'Errore sconosciuto');
        const signature = kind + '|' + text;
        if (alreadySent.has(signature) || alreadySent.size >= MAX_REPORTS) return;
        alreadySent.add(signature);
        const payload = JSON.stringify({ kind, message: text, path: location.pathname });
        try {
            if (navigator.sendBeacon) {
                navigator.sendBeacon('/api/telemetry', new Blob([payload], { type: 'application/json' }));
                return;
            }
            fetch('/api/telemetry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {});
        } catch {}
    };

    window.addEventListener('error', (event) => send('error', event.message));
    window.addEventListener('unhandledrejection', (event) => send('promise', event.reason?.message || event.reason));
    window.FreecrafterTelemetry = { send };
})();
