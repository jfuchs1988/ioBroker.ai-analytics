'use strict';

const HISTORY_ADAPTER_PATTERN = /^(influxdb|history|sql)\.\d+$/;

async function findHistorizedObjects(adapter) {
    const objects = await adapter.getForeignObjectsAsync('*', 'state');
    if (adapter.log && adapter.log.silly) {
        adapter.log.silly(`Discovery: durchsuche ${Object.keys(objects).length} Objekte nach aktivem History-Logging`);
    }
    const result = [];

    for (const id of Object.keys(objects)) {
        const obj = objects[id];
        const custom = obj && obj.common && obj.common.custom;
        if (!custom) continue;

        const loggingInstance = Object.keys(custom).find(
            (key) => HISTORY_ADAPTER_PATTERN.test(key) && custom[key] && custom[key].enabled
        );

        if (loggingInstance) {
            result.push({
                id,
                historyInstance: loggingInstance,
                common: obj.common,
            });
            if (adapter.log) {
                adapter.log.silly(`Discovery: ${id} hat aktives Logging ueber ${loggingInstance}`);
            }
        }
    }

    return result;
}

module.exports = { findHistorizedObjects, HISTORY_ADAPTER_PATTERN };
