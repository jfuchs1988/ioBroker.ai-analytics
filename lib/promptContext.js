'use strict';

/**
 * Liest Standort-Infos aus dem ioBroker-Systemobjekt `system.config` (dort traegt der
 * Nutzer sie beim Setup ein). Fehlt das Objekt oder sind Felder leer, wird ein leeres
 * Ergebnis geliefert statt zu werfen.
 */
async function getSystemLocation(adapter) {
    const obj = await adapter.getForeignObjectAsync('system.config');
    const common = (obj && obj.common) || {};
    return {
        city: common.city || null,
        country: common.country || null,
        latitude: typeof common.latitude === 'number' ? common.latitude : null,
        longitude: typeof common.longitude === 'number' ? common.longitude : null,
    };
}

/**
 * Die lokale Zeitzone des ioBroker-Host-Prozesses (nicht des Nutzer-Browsers). Bei
 * einer typischen Home-Installation laeuft der Host beim Nutzer, die Systemzeitzone
 * ist also ein deutlich besserer Anhaltspunkt als UTC ohne jeden Zeitzonenbezug.
 */
function getLocalTimeZone() {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch (error) {
        return 'UTC';
    }
}

function formatLocalTime(date, timeZone) {
    try {
        return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'medium', timeZone }).format(date);
    } catch (error) {
        return date.toISOString();
    }
}

/**
 * Baut den Standort-/Zeit-Kontextblock fuer Agent-Systemprompts. Wird sowohl fuer
 * Chat-Fragen als auch die proaktive Pruefung verwendet, damit der Agent Fragen wie
 * "wo bin ich" / "wie spaet ist es bei mir" beantworten kann, statt zu raten.
 */
async function buildTimeAndLocationContext(adapter, now = new Date()) {
    const location = await getSystemLocation(adapter);
    const timeZone = getLocalTimeZone();
    const localTime = formatLocalTime(now, timeZone);

    const locationLabelParts = [location.city, location.country].filter(Boolean);
    const coordinates =
        location.latitude != null && location.longitude != null
            ? ` (Breite ${location.latitude}, Laenge ${location.longitude})`
            : '';
    const locationLine = locationLabelParts.length
        ? `Standort des Nutzers: ${locationLabelParts.join(', ')}${coordinates}. `
        : '';

    return (
        `${locationLine}` +
        `Aktuelle Zeit: ${now.toISOString()} (${now.getTime()} ms seit Epoch, Unix-Millisekunden), ` +
        `entspricht ${localTime} in der lokalen Zeitzone ${timeZone}. `
    );
}

module.exports = { getSystemLocation, getLocalTimeZone, formatLocalTime, buildTimeAndLocationContext };
