'use strict';

const CATEGORIES = ['consumption', 'generation_pv', 'lighting', 'device_usage', 'environment'];
const VALUE_KINDS = ['gauge', 'boolean_state', 'daily_reset_counter', 'cumulative_total', 'event_count'];
const DERIVED_METRIC_ROLES = ['pv_generation', 'grid_feed_in', 'grid_import', 'battery_charge', 'battery_discharge', 'consumption', 'grid_power', 'battery_power'];
const HVAC_ROLES = ['window', 'heating'];
const UPDATE_FREQUENCIES = ['unknown', 'seconds', 'minutes', 'hourly', 'daily', 'weekly_or_slower', 'event_driven'];
const DATA_COMPLETENESS = ['unknown', 'complete', 'gaps', 'stale'];
const MAX_CSV_FILE_BYTES = 5 * 1024 * 1024;
const MAX_CSV_ROWS = 10000;
const MAX_CSV_FIELD_LENGTH = 4096;
export const MAX_SOURCE_ID_LENGTH = 512;
const MAX_ROOM_LENGTH = 256;
const MAX_DESCRIPTION_LENGTH = 2000;

function spreadsheetSafe(value) {
    const str = value === null || value === undefined ? '' : String(value);
    return /^[\t\r\n ]*[=+\-@]/.test(str) ? `'${str}` : str;
}

export function csvEscape(value) {
    const str = spreadsheetSafe(value);
    if (/[",\n\r]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

/** Minimal RFC4180-ish CSV parser: handles quoted fields with embedded commas/quotes/newlines. */
export function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    let quoteClosed = false;

    const append = char => {
        field += char;
        if (field.length > MAX_CSV_FIELD_LENGTH) throw new Error(`CSV-Feld überschreitet ${MAX_CSV_FIELD_LENGTH} Zeichen.`);
    };
    const pushRow = () => {
        row.push(field);
        rows.push(row);
        if (rows.length > MAX_CSV_ROWS) throw new Error(`CSV-Datei überschreitet ${MAX_CSV_ROWS} Zeilen.`);
        row = [];
        field = '';
        quoteClosed = false;
    };

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (inQuotes) {
            if (char === '"') {
                if (text[i + 1] === '"') {
                    append('"');
                    i++;
                } else {
                    inQuotes = false;
                    quoteClosed = true;
                }
            } else {
                append(char);
            }
        } else if (quoteClosed && char !== ',' && char !== '\n' && char !== '\r') {
            throw new Error('Ungültige Zeichen nach einem geschlossenen CSV-Feld.');
        } else if (char === '"') {
            if (field.length > 0) throw new Error('Anführungszeichen sind nur am Feldanfang erlaubt.');
            inQuotes = true;
        } else if (char === ',') {
            row.push(field);
            field = '';
            quoteClosed = false;
        } else if (char === '\n' || char === '\r') {
            if (char === '\r' && text[i + 1] === '\n') i++;
            pushRow();
        } else {
            append(char);
        }
    }
    if (inQuotes) throw new Error('CSV-Datei enthält ein nicht geschlossenes Anführungszeichen.');
    if (field.length > 0 || row.length > 0 || quoteClosed) {
        pushRow();
    }
    return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ''));
}

export function normalizeHeader(row) {
    const header = row.map(value => value.replace(/^﻿/, '').trim());
    if (new Set(header).size !== header.length) throw new Error('CSV-Header enthält doppelte Spalten.');
    return header;
}

export function validateFile(file) {
    if (file.size > MAX_CSV_FILE_BYTES) throw new Error(`CSV-Datei darf maximal ${MAX_CSV_FILE_BYTES / 1024 / 1024} MB groß sein.`);
}

export function parseBoolean(value, field) {
    const normalized = value.trim().toLowerCase();
    if (normalized !== 'true' && normalized !== 'false') throw new Error(`${field} muss true oder false sein.`);
    return normalized === 'true';
}

export function validateCatalogImportValue(field, value) {
    if (value.length > MAX_CSV_FIELD_LENGTH) throw new Error(`${field} ist zu lang.`);
    if (field === 'description' && value.length > MAX_DESCRIPTION_LENGTH) throw new Error(`description darf maximal ${MAX_DESCRIPTION_LENGTH} Zeichen enthalten.`);
    if (field === 'room' && value.length > MAX_ROOM_LENGTH) throw new Error(`room darf maximal ${MAX_ROOM_LENGTH} Zeichen enthalten.`);
    if (field === 'category' && !CATEGORIES.includes(value)) throw new Error(`Ungültige category: ${value}`);
    if (field === 'valueKind' && !VALUE_KINDS.includes(value)) throw new Error(`Ungültiger valueKind: ${value}`);
    if (field === 'derivedMetricRole' && !DERIVED_METRIC_ROLES.includes(value)) throw new Error(`Ungültige derivedMetricRole: ${value}`);
    if (field === 'hvacRole' && !HVAC_ROLES.includes(value)) throw new Error(`Ungültige hvacRole: ${value}`);
    if (field === 'updateFrequency' && !UPDATE_FREQUENCIES.includes(value)) throw new Error(`Ungültige updateFrequency: ${value}`);
    if (field === 'dataCompleteness' && !DATA_COMPLETENESS.includes(value)) throw new Error(`Ungültige dataCompleteness: ${value}`);
    return (field === 'ignored' || field === 'derivedMetricInverted') ? parseBoolean(value, field) : value;
}
