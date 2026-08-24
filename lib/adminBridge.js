'use strict';

const BRIDGE_STATE = 'admin.bridge';

const ALLOWED_COMMANDS = [
    'chatQuestion',
    'listCatalogEntries',
    'updateCatalogEntryAdmin',
    'removeCatalogEntry',
    'runDiscoveryNow',
    'runProactiveCheckNow',
];

/**
 * Legt den Bridge-State an, ueber den die Admin-UI Befehle als JSON schreiben kann,
 * wenn der direkte sendTo-Pfad vom Tab aus nicht funktioniert (Legacy-HTML-Tab im
 * React-Admin hat dort keinen privilegierten Socket; getState/setState sind dagegen
 * nachweislich erlaubt).
 */
async function ensureBridgeState(adapter) {
    await adapter.setObjectNotExistsAsync(BRIDGE_STATE, {
        type: 'state',
        common: {
            name: 'Admin UI command bridge',
            type: 'string',
            role: 'json',
            read: true,
            write: true,
        },
        native: {},
    });
}

/**
 * Prueft eine State-Aenderung und parst sie zu einer gueltigen Bridge-Anfrage.
 * Gibt null zurueck fuer alles, was keine Anfrage ist (fremde IDs, ack=true,
 * ungueltiges JSON, unbekannter Befehl), damit eigene ack:true-Antworten nicht
 * erneut verarbeitet werden.
 */
function parseRequest(adapter, id, state) {
    if (!adapter || !adapter.namespace) return null;
    if (id !== `${adapter.namespace}.${BRIDGE_STATE}`) return null;
    if (!state || state.ack !== false || typeof state.val !== 'string') return null;

    let request;
    try {
        request = JSON.parse(state.val);
    } catch (error) {
        if (adapter.log && adapter.log.warn) {
            adapter.log.warn(`Admin-Bridge: ungültige Anfrage ignoriert (${error.message})`);
        }
        return null;
    }

    if (!request || typeof request.id !== 'string' || !request.id.trim()) {
        if (adapter.log && adapter.log.warn) {
            adapter.log.warn('Admin-Bridge: Anfrage ohne ID ignoriert');
        }
        return null;
    }
    if (!ALLOWED_COMMANDS.includes(request.command)) {
        if (adapter.log && adapter.log.warn) {
            adapter.log.warn(`Admin-Bridge: unbekannter Befehl ignoriert: ${request.command}`);
        }
        return null;
    }
    return request;
}

/**
 * Verarbeitet eine State-Aenderung als Bridge-Anfrage und schreibt die Antwort
 * mit ack:true zurueck in denselben State. `dispatch(command, message)` muss das
 * Ergebnis des Befehls liefern oder werfen — identisch zum sendTo-Pfad in main.js.
 *
 * @returns {Promise<boolean>} true, wenn die Aenderung als Anfrage behandelt wurde
 */
async function handleBridgeStateChange(adapter, id, state, dispatch) {
    const request = parseRequest(adapter, id, state);
    if (!request) return false;

    let response;
    try {
        const result = await dispatch(request.command, request.message);
        response = { id: request.id, ok: true, result };
    } catch (error) {
        response = { id: request.id, ok: false, error: error && error.message ? error.message : String(error) };
    }

    await adapter.setStateAsync(BRIDGE_STATE, { val: JSON.stringify(response), ack: true });

    if (adapter.log && adapter.log.silly) {
        adapter.log.silly(`Admin-Bridge: Antwort für ${request.command} (${request.id}) geschrieben`);
    }
    return true;
}

module.exports = {
    BRIDGE_STATE,
    ALLOWED_COMMANDS,
    ensureBridgeState,
    parseRequest,
    handleBridgeStateChange,
};
