import React from 'react';
import { ConfigGeneric } from '@iobroker/json-config';

const CATEGORIES = ['consumption', 'generation_pv', 'lighting', 'device_usage', 'environment'];
const VALUE_KINDS = ['gauge', 'boolean_state', 'daily_reset_counter', 'cumulative_total', 'event_count'];
const CSV_COLUMNS = ['sourceId', 'description', 'category', 'valueKind', 'unit', 'room', 'ignored', 'active', 'needsReview', 'writable', 'writePattern', 'updateFrequency', 'dataCompleteness'];
const CSV_EDITABLE_COLUMNS = ['description', 'category', 'room', 'valueKind', 'ignored', 'updateFrequency', 'dataCompleteness'];
const UPDATE_FREQUENCIES = ['unknown', 'seconds', 'minutes', 'hourly', 'daily', 'weekly_or_slower', 'event_driven'];
const DATA_COMPLETENESS = ['unknown', 'complete', 'gaps', 'stale'];
const SETTINGS_COLUMNS = [
    'providerType', 'baseUrl', 'model', 'apiKey',
    'chatPricePerMillionInputTokens', 'chatPricePerMillionOutputTokens',
    'onboardingProviderType', 'onboardingBaseUrl', 'onboardingModel', 'onboardingApiKey',
    'onboardingPricePerMillionInputTokens', 'onboardingPricePerMillionOutputTokens',
    'checkIntervalHours', 'dailyTokenBudget', 'maxAgentIterations', 'maxToolCalls', 'maxPeriodsPerRequest', 'maxPeriodsPerToolCall', 'silentIfNothingFound', 'enableValueKindBackfill', 'enableDataQualityBackfill',
];
const SETTINGS_NUMBER_COLUMNS = new Set([
    'chatPricePerMillionInputTokens', 'chatPricePerMillionOutputTokens',
    'onboardingPricePerMillionInputTokens', 'onboardingPricePerMillionOutputTokens',
    'checkIntervalHours', 'dailyTokenBudget', 'maxAgentIterations', 'maxToolCalls', 'maxPeriodsPerRequest', 'maxPeriodsPerToolCall',
]);
const SETTINGS_BOOLEAN_COLUMNS = new Set(['silentIfNothingFound', 'enableValueKindBackfill', 'enableDataQualityBackfill']);
const SETTINGS_SECRET_COLUMNS = new Set(['apiKey', 'onboardingApiKey']);
const PROVIDER_TYPES = new Set(['anthropic', 'openai', 'openrouter', 'opencode', 'local']);
const OPENCODE_ZEN_BASE_URL = 'https://opencode.ai/zen/v1';
const OPENCODE_ZEN_MODELS = ['mimo-v2.5-free', 'ling-3.0-flash-fin-free', 'nemotron-3-ultra-free', 'nemotron-3.5-lightning-free', 'muse-spark-1.3-contributor-free', 'muse-spark-1.2-contributor-free'];
const MAX_CSV_FILE_BYTES = 5 * 1024 * 1024;
const MAX_CSV_ROWS = 10000;
const MAX_CSV_FIELD_LENGTH = 4096;
const MAX_SOURCE_ID_LENGTH = 512;
const MAX_ROOM_LENGTH = 200;
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
    const header = row.map(value => value.replace(/^\uFEFF/, '').trim());
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
    if (field === 'updateFrequency' && !UPDATE_FREQUENCIES.includes(value)) throw new Error(`Ungültige updateFrequency: ${value}`);
    if (field === 'dataCompleteness' && !DATA_COMPLETENESS.includes(value)) throw new Error(`Ungültige dataCompleteness: ${value}`);
    return field === 'ignored' ? parseBoolean(value, field) : value;
}

export function validateSettingImportValue(key, rawValue) {
    if (rawValue.length > MAX_CSV_FIELD_LENGTH) throw new Error(`${key} ist zu lang.`);
    let value = rawValue;
    if (SETTINGS_NUMBER_COLUMNS.has(key)) {
        value = value === '' ? 0 : Number(value);
        if (!Number.isFinite(value) || value < 0 || (key === 'checkIntervalHours' && value < 1)) {
            throw new Error(`${key} enthält keine gültige nicht-negative Zahl.`);
        }
    }
    if (SETTINGS_BOOLEAN_COLUMNS.has(key)) value = parseBoolean(value, key);
    if (key === 'providerType' && !PROVIDER_TYPES.has(value)) throw new Error(`Ungültiger providerType: ${value}`);
    if (key === 'onboardingProviderType' && value !== '' && !PROVIDER_TYPES.has(value)) throw new Error(`Ungültiger onboardingProviderType: ${value}`);
    return value;
}

export class ProviderSelectComponent extends ConfigGeneric {
    renderItem() {
        const value = (this.props.data && this.props.data[this.props.attr]) || '';
        const options = [ ...(this.props.schema.includeEmpty ? [['', 'Wie oben (Chat/Pruefung)']] : []), ['anthropic', 'Anthropic'], ['openai', 'OpenAI'], ['openrouter', 'OpenRouter'], ['opencode', 'OpenCode Zen'], ['local', 'Lokal (OpenAI-kompatibel)'] ];
        return <select value={value} aria-label={this.props.schema.label || 'LLM-Provider'} onChange={async event => {
            const next = event.target.value;
            await this.onChange(this.props.attr, next);
            if (next === 'opencode' && this.props.schema.urlField) await this.onChange(this.props.schema.urlField, OPENCODE_ZEN_BASE_URL);
        }}>{options.map(([optionValue, label]) => <option key={optionValue} value={optionValue}>{label}</option>)}</select>;
    }
}

export class ModelSelectComponent extends ConfigGeneric {
    renderItem() {
        const value = (this.props.data && this.props.data[this.props.attr]) || '';
        const isPreset = OPENCODE_ZEN_MODELS.includes(value);
        return <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <select aria-label="Modellvorschläge" value={isPreset ? value : '__custom__'} onChange={event => {
                if (event.target.value !== '__custom__') this.onChange(this.props.attr, event.target.value);
            }}>
                <option value="__custom__">Benutzerdefiniertes Modell</option>
                {OPENCODE_ZEN_MODELS.map(model => <option key={model} value={model}>{model}</option>)}
            </select>
            <input aria-label={this.props.schema.label || 'Modell'} value={value} placeholder="Modellname frei eingeben" onChange={event => this.onChange(this.props.attr, event.target.value)} />
        </div>;
    }
}

export class UsageResetComponent extends ConfigGeneric {
    async reset() {
        if (!window.confirm('Tokenzähler und Kostenhistorie wirklich zurücksetzen?')) return;
        const socket = this.props.socket || this.props.oContext.socket;
        const instance = `ai-analytics.${this.props.oContext.instance}`;
        const requestId = `usage-reset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        await socket.setState(`${instance}.admin.bridge`, { val: JSON.stringify({ id: requestId, command: 'resetUsage', message: {} }), ack: false });
        const deadline = Date.now() + 60000;
        while (Date.now() < deadline) {
            const state = await socket.getState(`${instance}.admin.bridge`);
            if (state && state.ack === true && typeof state.val === 'string') {
                const response = JSON.parse(state.val);
                if (response.id === requestId) {
                    if (!response.ok) throw new Error(response.error || 'Zurücksetzen fehlgeschlagen.');
                    this.setState({ status: 'Tokenzähler und Kostenhistorie wurden zurückgesetzt.' });
                    return;
                }
            }
            await new Promise(resolve => setTimeout(resolve, 400));
        }
        throw new Error('Keine Antwort beim Zurücksetzen.');
    }

    renderItem() {
        return <div>
            <button onClick={() => this.reset().catch(error => this.setState({ status: `Fehler: ${error.message}` }))}>Tokenzähler zurücksetzen</button>
            <span role="status" aria-live="polite" style={{ marginLeft: 8 }}>{this.state.status || 'Setzt usage.today und usage.history zurück.'}</span>
        </div>;
    }
}

export default class CatalogDevicesComponent extends ConfigGeneric {
    constructor(props) {
        super(props);
        this.state = { ...this.state, entries: [], filter: '', loading: true, status: '', progress: null, selected: [], drafts: {} };
        this.fileInputRef = React.createRef();
        this.progressTimer = null;
        this.loadGeneration = 0;
        this.unmounted = false;
        this.bridgeQueue = Promise.resolve();
    }

    async componentDidMount() {
        super.componentDidMount();
        await this.loadEntries();
    }

    componentWillUnmount() {
        this.unmounted = true;
        if (this.progressTimer) clearInterval(this.progressTimer);
        if (super.componentWillUnmount) super.componentWillUnmount();
    }

    callAdapter(command, message = {}) {
        const run = this.bridgeQueue.then(() => this.callAdapterNow(command, message));
        this.bridgeQueue = run.catch(() => {});
        return run;
    }

    async callAdapterNow(command, message) {
        const socket = this.props.socket || this.props.oContext.socket;
        const instance = `ai-analytics.${this.props.oContext.instance}`;
        const requestId = `component-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        await socket.setState(`${instance}.admin.bridge`, {
            val: JSON.stringify({ id: requestId, command, message }),
            ack: false,
        });
        const deadline = Date.now() + 60000;
        while (Date.now() < deadline) {
            if (this.unmounted) throw new Error('Komponente wurde geschlossen.');
            const state = await socket.getState(`${instance}.admin.bridge`);
            if (state && state.ack === true && typeof state.val === 'string') {
                const response = JSON.parse(state.val);
                if (response.id === requestId) {
                    if (!response.ok) throw new Error(response.error || 'Unbekannter Fehler');
                    return response.result;
                }
            }
            await new Promise(resolve => setTimeout(resolve, 400));
        }
        throw new Error(`Keine Antwort auf '${command}' über die State-Bridge`);
    }

    async loadEntries() {
        const generation = ++this.loadGeneration;
        this.setState({ loading: true });
        try {
            const response = await this.callAdapter('listCatalogEntries');
            if (response && response.error) throw new Error(response.error);
            if (this.unmounted || generation !== this.loadGeneration) return;
            const entries = (response && response.entries) || [];
            const ids = new Set(entries.map(entry => entry.sourceId));
            this.setState(state => ({
                entries,
                loading: false,
                selected: state.selected.filter(id => ids.has(id)),
                drafts: Object.fromEntries(Object.entries(state.drafts).filter(([id]) => ids.has(id))),
            }));
        } catch (error) {
            if (!this.unmounted && generation === this.loadGeneration) this.setState({ loading: false, status: `Fehler: ${error.message || error}` });
        }
    }

    async updateEntry(entry, values) {
        try {
            const response = await this.callAdapter('updateCatalogEntryAdmin', { sourceId: entry.sourceId, ...values });
            if (response && response.error) throw new Error(response.error);
            this.setState(state => {
                const drafts = { ...state.drafts };
                delete drafts[entry.sourceId];
                return { drafts, status: `${entry.sourceId} gespeichert.` };
            });
            await this.loadEntries();
        } catch (error) {
            this.setState({ status: `Fehler: ${error.message || error}` });
        }
    }

    setDraft(sourceId, values) {
        this.setState(state => ({ drafts: { ...state.drafts, [sourceId]: { ...(state.drafts[sourceId] || {}), ...values } } }));
    }

    toggleSelected(sourceId) {
        this.setState(state => ({ selected: state.selected.includes(sourceId) ? state.selected.filter(id => id !== sourceId) : [...state.selected, sourceId] }));
    }

    async saveSelected() {
        const selected = this.state.selected;
        const drafts = this.state.drafts;
        if (!selected.length) {
            this.setState({ status: 'Bitte zuerst mindestens einen Datenpunkt auswählen.' });
            return;
        }
        this.setState({ status: `Speichere ${selected.length} Datenpunkte ...` });
        let failed = 0;
        const failedIds = [];
        for (const sourceId of selected) {
            try {
                const values = drafts[sourceId];
                if (values && Object.keys(values).length) {
                    const response = await this.callAdapter('updateCatalogEntryAdmin', { sourceId, ...values });
                    if (response && response.error) throw new Error(response.error);
                }
            } catch (_error) {
                failed++;
                failedIds.push(sourceId);
            }
        }
        this.setState(state => ({
            status: failed ? `${selected.length - failed} gespeichert, ${failed} fehlgeschlagen.` : `${selected.length} Datenpunkte gespeichert.`,
            selected: failedIds,
            drafts: Object.fromEntries(Object.entries(state.drafts).filter(([id]) => !selected.includes(id) || failedIds.includes(id))),
        }));
        await this.loadEntries();
    }

    async removeEntry(entry) {
        if (!window.confirm(`Katalogeintrag "${entry.sourceId}" wirklich entfernen?`)) return;
        try {
            const response = await this.callAdapter('removeCatalogEntry', { sourceId: entry.sourceId });
            if (response && response.error) throw new Error(response.error);
            this.setState(state => {
                const drafts = { ...state.drafts };
                delete drafts[entry.sourceId];
                return {
                    drafts,
                    selected: state.selected.filter(id => id !== entry.sourceId),
                    status: `${entry.sourceId} entfernt.`,
                };
            });
            await this.loadEntries();
        } catch (error) {
            this.setState({ status: `Fehler: ${error.message || error}` });
        }
    }

    async runCommand(command, runningText, successText) {
        const backgroundCommand = command === 'runProactiveCheckNow';
        this.setState({ status: runningText, progress: null });
        this.startProgressPolling();
        try {
            const response = await this.callAdapter(command);
            if (response && response.error) throw new Error(response.error);
            if (response && response.triggered === false) {
                this.stopProgressPolling();
                this.setState({ status: `Fehler: ${response.reason || 'Prüfung konnte nicht gestartet werden.'}`, progress: null });
                return;
            }
            this.setState({ status: successText });
            await this.loadEntries();
        } catch (error) {
            this.stopProgressPolling();
            this.setState({ status: `Fehler: ${error.message || error}`, progress: null });
        } finally {
            if (!backgroundCommand) this.stopProgressPolling();
        }
    }

    stopProgressPolling() {
        if (this.progressTimer) clearInterval(this.progressTimer);
        this.progressTimer = null;
    }

    startProgressPolling() {
        this.stopProgressPolling();
        let observedRunning = false;
        const deadline = Date.now() + 10 * 60 * 1000;
        const readProgress = async () => {
            try {
                if (Date.now() >= deadline) {
                    this.stopProgressPolling();
                    if (!this.unmounted) this.setState({ status: 'Fortschrittsanzeige wegen Zeitüberschreitung beendet.', progress: null });
                    return;
                }
                const state = await this.props.oContext.socket.getState(`ai-analytics.${this.props.oContext.instance}.catalogSync`);
                if (this.unmounted) return;
                if (!state || !state.val) return;
                const progress = typeof state.val === 'string' ? JSON.parse(state.val) : state.val;
                this.setState({ progress });
                if (progress.running === true) observedRunning = true;
                if (observedRunning && progress.running === false && this.progressTimer) {
                    this.stopProgressPolling();
                }
            } catch (_error) {
                // The command result remains usable when an older Admin does not expose getState here.
            }
        };
        readProgress();
        this.progressTimer = setInterval(readProgress, 500);
    }

    exportCsv() {
        const lines = [CSV_COLUMNS.join(',')];
        this.state.entries.forEach((entry) => {
            lines.push(CSV_COLUMNS.map((key) => csvEscape(entry[key])).join(','));
        });
        const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `ai-analytics-katalog-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    triggerCsvImport() {
        if (this.fileInputRef.current) {
            this.fileInputRef.current.value = '';
            this.fileInputRef.current.click();
        }
    }

    async handleCsvFileSelected(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;

        try {
            validateFile(file);
            const text = await file.text();
            const rows = parseCsv(text);
            if (!rows.length) {
                this.setState({ status: 'Fehler: CSV-Datei ist leer.' });
                return;
            }

            const header = normalizeHeader(rows[0]);
            const sourceIdIndex = header.indexOf('sourceId');
            if (sourceIdIndex === -1) {
                this.setState({ status: 'Fehler: CSV-Header enthaelt keine sourceId-Spalte.' });
                return;
            }
            const fieldIndexes = CSV_EDITABLE_COLUMNS.map((field) => ({ field, index: header.indexOf(field) })).filter(
                (entry) => entry.index !== -1
            );

            const dataRows = rows.slice(1);
            let updatedCount = 0;
            let errorCount = 0;
            for (let i = 0; i < dataRows.length; i++) {
                const row = dataRows[i];
                const sourceId = row[sourceIdIndex];
                if (!sourceId) continue;
                if (sourceId.length > MAX_SOURCE_ID_LENGTH) {
                    errorCount++;
                    continue;
                }

                this.setState({ status: `CSV-Import laeuft (${i + 1}/${dataRows.length}) ...` });
                try {
                    const values = {};
                    fieldIndexes.forEach(({ field, index }) => {
                        if (row[index] === undefined || row[index] === '') return;
                        values[field] = validateCatalogImportValue(field, row[index]);
                    });
                    const response = await this.callAdapter('updateCatalogEntryAdmin', { sourceId, ...values });
                    if (response && response.error) throw new Error(response.error);
                    updatedCount++;
                } catch (_error) {
                    errorCount++;
                }
            }

            this.setState({
                status:
                    errorCount > 0
                        ? `CSV-Import abgeschlossen: ${updatedCount} aktualisiert, ${errorCount} fehlgeschlagen.`
                        : `CSV-Import abgeschlossen: ${updatedCount} Eintraege aktualisiert.`,
            });
            await this.loadEntries();
        } catch (error) {
            this.setState({ status: `Fehler: ${error.message || error}` });
        }
    }

    renderRow(entry) {
        const draft = this.state.drafts[entry.sourceId] || {};
        const value = key => draft[key] !== undefined ? draft[key] : (entry[key] || '');
        const ignored = draft.ignored !== undefined ? draft.ignored : Boolean(entry.ignored);
        const update = values => this.setDraft(entry.sourceId, values);
        return (
            <tr key={entry.sourceId}>
                <td><input type="checkbox" aria-label={`${entry.sourceId} auswählen`} checked={this.state.selected.includes(entry.sourceId)} onChange={() => this.toggleSelected(entry.sourceId)} /></td>
                <td>{entry.sourceId}</td>
                <td><input aria-label={`Beschreibung für ${entry.sourceId}`} maxLength={MAX_DESCRIPTION_LENGTH} value={value('description')} onChange={event => update({ description: event.target.value })} /></td>
                <td><select aria-label={`Kategorie für ${entry.sourceId}`} value={value('category')} onChange={event => update({ category: event.target.value })}>
                    {CATEGORIES.map(category => <option key={category} value={category}>{category}</option>)}
                </select></td>
                <td><select aria-label={`Verhalten für ${entry.sourceId}`} value={value('valueKind')} onChange={event => update({ valueKind: event.target.value })}>
                    <option value="">nicht klassifiziert</option>
                    {VALUE_KINDS.map(kind => <option key={kind} value={kind}>{kind}</option>)}
                </select></td>
                <td>{entry.unit || ''}</td>
                <td>{entry.writable === true ? '✓' : entry.writable === false ? '–' : ''}</td>
                <td><select aria-label={`Update-Frequenz für ${entry.sourceId}`} value={value('updateFrequency')} onChange={event => update({ updateFrequency: event.target.value })}>{UPDATE_FREQUENCIES.map(item => <option key={item} value={item}>{item}</option>)}</select></td>
                <td><select aria-label={`Vollständigkeit für ${entry.sourceId}`} value={value('dataCompleteness')} onChange={event => update({ dataCompleteness: event.target.value })}>{DATA_COMPLETENESS.map(item => <option key={item} value={item}>{item}</option>)}</select></td>
                <td><input aria-label={`Raum für ${entry.sourceId}`} maxLength={MAX_ROOM_LENGTH} value={value('room')} placeholder="z. B. Keller" onChange={event => update({ room: event.target.value })} /></td>
                <td>{ignored ? 'ignoriert' : entry.active === false ? 'inaktiv' : entry.needsReview ? 'Prüfung nötig' : 'aktiv'}</td>
                <td>
                    <button aria-label={`${entry.sourceId} ${ignored ? 'aktivieren' : 'ignorieren'}`} onClick={() => update({ ignored: !ignored })}>{ignored ? 'Aktivieren' : 'Ignorieren'}</button>
                    <button aria-label={`${entry.sourceId} entfernen`} onClick={() => this.removeEntry(entry)}>Entfernen</button>
                </td>
            </tr>
        );
    }

    renderItem() {
        const query = this.state.filter.trim().toLowerCase();
        const entries = this.state.entries.filter(entry => !query ||
            [entry.sourceId, entry.description, entry.category, entry.room, entry.valueKind].filter(Boolean).join(' ').toLowerCase().includes(query));

        return (
            <div style={{ width: '100%' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
                    <button onClick={() => this.runCommand('runDiscoveryNow', 'Re-Scan läuft ...', 'Re-Scan abgeschlossen.')}>Geräte neu einlesen</button>
                    <button onClick={() => this.runCommand('runDiscoveryOnly', 'Sync läuft ...', 'Sync abgeschlossen.')}>Nur Updates einlesen</button>
                    <button onClick={() => this.runCommand('runProactiveCheckNow', 'Prüfung läuft ...', 'Prüfung gestartet.')}>Prüfung jetzt ausführen</button>
                    <button onClick={() => this.saveSelected()}>Auswahl speichern</button>
                    <button onClick={() => this.setState({ selected: entries.map(entry => entry.sourceId) })}>Alle auswählen</button>
                    <button onClick={() => this.exportCsv()}>Als CSV exportieren</button>
                    <button onClick={() => this.triggerCsvImport()}>CSV importieren</button>
                    <input
                        ref={this.fileInputRef}
                        type="file"
                        accept=".csv,text/csv"
                        style={{ display: 'none' }}
                        onChange={event => this.handleCsvFileSelected(event)}
                    />
                    <input aria-label="Katalog filtern" placeholder="Filtern ..." value={this.state.filter} onChange={event => this.setState({ filter: event.target.value })} />
                </div>
                {this.state.status ? <div role="status" aria-live="polite" style={{ marginBottom: 8 }}>{this.state.status}</div> : null}
                {this.state.progress && this.state.progress.running ? <div style={{ marginBottom: 8 }}>
                    {this.state.progress.message || 'Verarbeitung läuft ...'}
                    <progress max="100" value={this.state.progress.total ? Math.round((this.state.progress.processed / this.state.progress.total) * 100) : 0} style={{ width: '100%' }} />
                    <span>{this.state.progress.total ? Math.round((this.state.progress.processed / this.state.progress.total) * 100) : 0}%</span>
                </div> : null}
                <div style={{ marginBottom: 8, fontSize: 12 }}>Verhalten: <b>Gauge</b> = kontinuierlicher Messwert, z. B. Temperatur. Zähler und Zustände werden separat erkannt. Update-Frequenz und Vollständigkeit können hier manuell korrigiert werden. Räume wie Keller, Heizraum, Technikraum oder Garage sind freie Eingaben.</div>
                {this.state.loading ? <div>Geräte werden geladen ...</div> : <div style={{ overflowX: 'auto', maxHeight: 600 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead><tr><th>Auswahl</th><th>Objekt-ID</th><th>Beschreibung</th><th>Kategorie</th><th>Verhalten</th><th>Einheit</th><th>Schreibbar</th><th>Update-Frequenz</th><th>Vollständigkeit</th><th>Raum</th><th>Status</th><th>Aktionen</th></tr></thead>
                        <tbody>{entries.map(entry => this.renderRow(entry))}</tbody>
                    </table>
                </div>}
            </div>
        );
    }
}

export class SettingsCsvComponent extends ConfigGeneric {
    constructor(props) {
        super(props);
        this.state = { ...this.state, status: '' };
        this.fileInputRef = React.createRef();
    }

    exportCsv() {
        const data = this.props.data || {};
        const lines = [SETTINGS_COLUMNS.join(',')];
        lines.push(SETTINGS_COLUMNS.map(key => csvEscape(SETTINGS_SECRET_COLUMNS.has(key) ? '' : data[key])).join(','));
        const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `ai-analytics-settings-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    async handleFileSelected(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        try {
            validateFile(file);
            const rows = parseCsv(await file.text());
            if (rows.length < 2) {
                this.setState({ status: 'Fehler: Settings-CSV enthält keine Datenzeile.' });
                return;
            }
            if (rows.length > 2) throw new Error('Settings-CSV darf nur eine Datenzeile enthalten.');
            const header = normalizeHeader(rows[0]);
            const values = rows[1];
            const importedValues = [];
            let imported = 0;
            SETTINGS_COLUMNS.forEach(key => {
                const index = header.indexOf(key);
                if (index === -1 || values[index] === undefined) return;
                if (SETTINGS_SECRET_COLUMNS.has(key)) return;
                const value = validateSettingImportValue(key, values[index]);
                importedValues.push([key, value]);
                imported++;
            });
            for (const [key, value] of importedValues) {
                await this.onChange(key, value);
            }
            this.setState({ status: `${imported} Settings importiert. Bitte mit Speichern übernehmen.` });
        } catch (error) {
            this.setState({ status: `Fehler: ${error.message || error}` });
        }
    }

    renderItem() {
        return <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => this.exportCsv()}>Settings als CSV exportieren</button>
            <button onClick={() => {
                if (this.fileInputRef.current) {
                    this.fileInputRef.current.value = '';
                    this.fileInputRef.current.click();
                }
            }}>Settings aus CSV importieren</button>
            <input ref={this.fileInputRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={event => this.handleFileSelected(event)} />
            <span role="status" aria-live="polite">{this.state.status}</span>
        </div>;
    }
}
