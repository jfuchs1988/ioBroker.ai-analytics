// Sponsor-required component. See LICENSES/SPONSOR-REQUIRED.md.
// lib/scheduler.js
'use strict';

const MAX_TIMER_MS = 2147483647;

function startProactiveScheduler(adapter, { intervalMs, runCheck }) {
    if (!Number.isSafeInteger(intervalMs) || intervalMs < 1000 || intervalMs > MAX_TIMER_MS) {
        throw new RangeError(`Proaktives Intervall muss zwischen 1000 und ${MAX_TIMER_MS} ms liegen.`);
    }
    if (typeof runCheck !== 'function') throw new TypeError('runCheck muss eine Funktion sein.');

    let running = false;
    const timer = setInterval(async () => {
        if (running) return;
        running = true;
        try {
            await runCheck();
        } catch (error) {
            adapter.log.error(`Proaktive Pruefung fehlgeschlagen: ${error.message}`);
        } finally {
            running = false;
        }
    }, intervalMs);

    return () => clearInterval(timer);
}

module.exports = { startProactiveScheduler, MAX_TIMER_MS };
