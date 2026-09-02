import React from 'react';
import { ConfigGeneric } from '@iobroker/json-config';

const CATEGORIES = ['consumption', 'generation_pv', 'lighting', 'device_usage', 'environment'];
const VALUE_KINDS = ['gauge', 'boolean_state', 'daily_reset_counter', 'cumulative_total', 'event_count'];
const CSV_COLUMNS = ['sourceId', 'description', 'category', 'valueKind', 'unit', 'room', 'ignored', 'active', 'needsReview'];
const CSV_EDITABLE_COLUMNS = ['description', 'category', 'room', 'valueKind', 'ignored'];
const SETTINGS_COLUMNS = [
    'providerType', 'baseUrl', 'model', 'apiKey',
    'chatPricePerMillionInputTokens', 'chatPricePerMillionOutputTokens',
    'onboardingProviderType', 'onboardingBaseUrl', 'onboardingModel', 'onboardingApiKey',
    'onboardingPricePerMillionInputTokens', 'onboardingPricePerMillionOutputTokens',
    'checkIntervalHours', 'dailyTokenBudget', 'silentIfNothingFound', 'enableValueKindBackfill',
];
const SETTINGS_NUMBER_COLUMNS = new Set([
    'chatPricePerMillionInputTokens', 'chatPricePerMillionOutputTokens',
    'onboardingPricePerMillionInputTokens', 'onboardingPricePerMillionOutputTokens',
    'checkIntervalHours', 'dailyTokenBudget',
]);
const SETTINGS_BOOLEAN_COLUMNS = new Set(['silentIfNothingFound', 'enableValueKindBackfill']);

function csvEscape(value) {
    const str = value === null || value === undefined ? '' : String(value);
    if (/[",\n\r]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

/** Minimal RFC4180-ish CSV parser: handles quoted fields with embedded commas/quotes/newlines. */
function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (inQuotes) {
            if (char === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                field += char;
            }
        } else if (char === '"') {
            inQuotes = true;
        } else if (char === ',') {
            row.push(field);
            field = '';
        } else if (char === '\n' || char === '\r') {
            if (char === '\r' && text[i + 1] === '\n') i++;
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
        } else {
            field += char;
        }
    }
    if (field.length > 0 || row.length > 0) {
        row.push(field);
        rows.push(row);
    }
    return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ''));
}

export default class CatalogDevicesComponent extends ConfigGeneric {
    constructor(props) {
        super(props);
        this.state = { ...this.state, entries: [], filter: '', loading: true, status: '', progress: null };
        this.fileInputRef = React.createRef();
        this.progressTimer = null;
    }

    async componentDidMount() {
        super.componentDidMount();
        await this.loadEntries();
    }

    componentWillUnmount() {
        if (this.progressTimer) clearInterval(this.progressTimer);
    }

    async callAdapter(command, message = {}) {
        const socket = this.props.socket || this.props.oContext.socket;
        const instance = `ai-analytics.${this.props.oContext.instance}`;
        const requestId = `component-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        await socket.setState(`${instance}.admin.bridge`, {
            val: JSON.stringify({ id: requestId, command, message }),
            ack: false,
        });
        const deadline = Date.now() + 60000;
        while (Date.now() < deadline) {
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
        this.setState({ loading: true });
        try {
            const response = await this.callAdapter('listCatalogEntries');
            this.setState({ entries: (response && response.entries) || [], loading: false, status: '' });
        } catch (error) {
            this.setState({ entries: [], loading: false, status: `Fehler: ${error.message || error}` });
        }
    }

    async updateEntry(entry, values) {
        try {
            await this.callAdapter('updateCatalogEntryAdmin', { sourceId: entry.sourceId, ...values });
            await this.loadEntries();
        } catch (error) {
            this.setState({ status: `Fehler: ${error.message || error}` });
        }
    }

    async removeEntry(entry) {
        try {
            await this.callAdapter('removeCatalogEntry', { sourceId: entry.sourceId });
            await this.loadEntries();
        } catch (error) {
            this.setState({ status: `Fehler: ${error.message || error}` });
        }
    }

    async runCommand(command, runningText, successText) {
        this.setState({ status: runningText });
        this.startProgressPolling();
        try {
            const response = await this.callAdapter(command);
            this.setState({ status: response && response.error ? `Fehler: ${response.error}` : successText });
            await this.loadEntries();
        } catch (error) {
            this.setState({ status: `Fehler: ${error.message || error}` });
        } finally {
            if (this.progressTimer) {
                clearInterval(this.progressTimer);
                this.progressTimer = null;
            }
        }
    }

    startProgressPolling() {
        if (this.progressTimer) clearInterval(this.progressTimer);
        const readProgress = async () => {
            try {
                const state = await this.props.oContext.socket.getState(`ai-analytics.${this.props.oContext.instance}.catalogSync`);
                if (!state || !state.val) return;
                const progress = typeof state.val === 'string' ? JSON.parse(state.val) : state.val;
                this.setState({ progress });
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

        const text = await file.text();
        const rows = parseCsv(text);
        if (!rows.length) {
            this.setState({ status: 'Fehler: CSV-Datei ist leer.' });
            return;
        }

        const header = rows[0];
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

            const values = {};
            fieldIndexes.forEach(({ field, index }) => {
                if (row[index] === undefined || row[index] === '') return;
                values[field] = field === 'ignored' ? row[index].toLowerCase() === 'true' : row[index];
            });

            this.setState({ status: `CSV-Import laeuft (${i + 1}/${dataRows.length}) ...` });
            try {
                await this.callAdapter('updateCatalogEntryAdmin', { sourceId, ...values });
                updatedCount++;
            } catch (error) {
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
    }

    renderRow(entry) {
        const update = values => this.updateEntry(entry, values);
        return (
            <tr key={entry.sourceId}>
                <td>{entry.sourceId}</td>
                <td><input defaultValue={entry.description || ''} onBlur={event => update({ description: event.target.value })} /></td>
                <td><select defaultValue={entry.category || ''} onChange={event => update({ category: event.target.value })}>
                    {CATEGORIES.map(category => <option key={category} value={category}>{category}</option>)}
                </select></td>
                <td><select defaultValue={entry.valueKind || ''} onChange={event => event.target.value && update({ valueKind: event.target.value })}>
                    <option value="">nicht klassifiziert</option>
                    {VALUE_KINDS.map(kind => <option key={kind} value={kind}>{kind}</option>)}
                </select></td>
                <td>{entry.unit || ''}</td>
                <td><input defaultValue={entry.room || ''} onBlur={event => update({ room: event.target.value })} /></td>
                <td>{entry.ignored ? 'ignoriert' : entry.active === false ? 'inaktiv' : entry.needsReview ? 'Prüfung nötig' : 'aktiv'}</td>
                <td>
                    <button onClick={() => update({ ignored: !entry.ignored })}>{entry.ignored ? 'Aktivieren' : 'Ignorieren'}</button>
                    <button onClick={() => this.removeEntry(entry)}>Entfernen</button>
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
                    <button onClick={() => this.exportCsv()}>Als CSV exportieren</button>
                    <button onClick={() => this.triggerCsvImport()}>CSV importieren</button>
                    <input
                        ref={this.fileInputRef}
                        type="file"
                        accept=".csv,text/csv"
                        style={{ display: 'none' }}
                        onChange={event => this.handleCsvFileSelected(event)}
                    />
                    <input placeholder="Filtern ..." value={this.state.filter} onChange={event => this.setState({ filter: event.target.value })} />
                </div>
                {this.state.status ? <div style={{ marginBottom: 8 }}>{this.state.status}</div> : null}
                {this.state.progress && this.state.progress.running ? <div style={{ marginBottom: 8 }}>
                    {this.state.progress.message || 'Verarbeitung läuft ...'}
                    <progress max="100" value={this.state.progress.total ? Math.round((this.state.progress.processed / this.state.progress.total) * 100) : 0} style={{ width: '100%' }} />
                    <span>{this.state.progress.total ? Math.round((this.state.progress.processed / this.state.progress.total) * 100) : 0}%</span>
                </div> : null}
                {this.state.loading ? <div>Geräte werden geladen ...</div> : <div style={{ overflowX: 'auto', maxHeight: 600 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead><tr><th>Objekt-ID</th><th>Beschreibung</th><th>Kategorie</th><th>Verhalten</th><th>Einheit</th><th>Raum</th><th>Status</th><th>Aktionen</th></tr></thead>
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
        lines.push(SETTINGS_COLUMNS.map(key => csvEscape(data[key])).join(','));
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
        const rows = parseCsv(await file.text());
        if (rows.length < 2) {
            this.setState({ status: 'Fehler: Settings-CSV enthält keine Datenzeile.' });
            return;
        }
        const header = rows[0];
        const values = rows[1];
        const nextData = { ...(this.props.data || {}) };
        let imported = 0;
        SETTINGS_COLUMNS.forEach(key => {
            const index = header.indexOf(key);
            if (index === -1 || values[index] === undefined) return;
            let value = values[index];
            if (SETTINGS_NUMBER_COLUMNS.has(key)) value = value === '' ? 0 : Number(value);
            if (SETTINGS_BOOLEAN_COLUMNS.has(key)) value = value.toLowerCase() === 'true';
            nextData[key] = value;
            imported++;
        });
        this.onChange(nextData);
        this.setState({ status: `${imported} Settings importiert. Bitte mit Speichern übernehmen.` });
    }

    renderItem() {
        return <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => this.exportCsv()}>Settings als CSV exportieren</button>
            <button onClick={() => this.fileInputRef.current && this.fileInputRef.current.click()}>Settings aus CSV importieren</button>
            <input ref={this.fileInputRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={event => this.handleFileSelected(event)} />
            <span>{this.state.status}</span>
        </div>;
    }
}
