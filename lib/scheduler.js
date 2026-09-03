// Sponsor-required component. See LICENSES/SPONSOR-REQUIRED.md.
// lib/scheduler.js
'use strict';

function startProactiveScheduler(adapter, { intervalMs, runCheck }) {
    const timer = setInterval(() => {
        runCheck().catch((error) => adapter.log.error(`Proaktive Pruefung fehlgeschlagen: ${error.message}`));
    }, intervalMs);

    return () => clearInterval(timer);
}

module.exports = { startProactiveScheduler };
