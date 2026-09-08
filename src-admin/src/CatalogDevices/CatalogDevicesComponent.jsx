import React from 'react';
import { ConfigGeneric } from '@iobroker/json-config';
import DeviceRow from './DeviceRow.jsx';
import BulkEditToolbar from './BulkEditToolbar.jsx';
import { filterEntries, sortEntries, nextSortState } from './catalogTableUtils.js';
import { CATALOG_COLUMNS, DEFAULT_VISIBLE_COLUMNS } from './catalogColumns.js';
import { csvEscape, parseCsv, normalizeHeader, validateFile, validateCatalogImportValue, MAX_SOURCE_ID_LENGTH } from '../csvHelpers.js';

const CSV_COLUMNS = ['sourceId', 'description', 'category', 'valueKind', 'unit', 'room', 'ignored', 'active', 'needsReview', 'writable', 'writePattern', 'updateFrequency', 'dataCompleteness', 'derivedMetricRole', 'derivedMetricGroupId', 'derivedMetricInverted', 'hvacRole'];
const CSV_EDITABLE_COLUMNS = ['description', 'category', 'room', 'valueKind', 'ignored', 'updateFrequency', 'dataCompleteness', 'derivedMetricRole', 'derivedMetricGroupId', 'derivedMetricInverted', 'hvacRole'];
const COLUMN_STORAGE_VERSION = 1;
const BRIDGE_TIMEOUT_MS = 60000;
const LONG_RUNNING_COMMAND_TIMEOUT_MS = 10 * 60 * 1000;
const LONG_RUNNING_COMMANDS = new Set(['runDiscoveryNow', 'runDiscoveryOnly']);

export function bridgeTimeoutForCommand(command) {
    return LONG_RUNNING_COMMANDS.has(command) ? LONG_RUNNING_COMMAND_TIMEOUT_MS : BRIDGE_TIMEOUT_MS;
}

function readVisibleColumns(key) {
    try {
        const stored = window.localStorage.getItem(key);
        if (!stored) return DEFAULT_VISIBLE_COLUMNS;
        const parsed = JSON.parse(stored);
        if (!Array.isArray(parsed) || !parsed.length) return DEFAULT_VISIBLE_COLUMNS;
        const valid = new Set(CATALOG_COLUMNS.map(column => column.key));
        const columns = parsed.filter(column => valid.has(column));
        return columns.length ? columns : DEFAULT_VISIBLE_COLUMNS;
    } catch (_error) {
        return DEFAULT_VISIBLE_COLUMNS;
    }
}

export default class CatalogDevicesComponent extends ConfigGeneric {
    constructor(props) {
        super(props);
        const instance = props.oContext && props.oContext.instance !== undefined ? props.oContext.instance : 'default';
        this.columnStorageKey = `ai-analytics.catalogDevices.columns.${instance}.v${COLUMN_STORAGE_VERSION}`;
        this.state = { ...this.state, entries: [], filter: '', loading: true, status: '', progress: null, selected: [], expandedRows: new Set(), sort: null, visibleColumns: readVisibleColumns(this.columnStorageKey) };
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
        const deadline = Date.now() + bridgeTimeoutForCommand(command);
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
        if (this.state.entries.length === 0) this.setState({ loading: true });
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
            }));
        } catch (error) {
            if (!this.unmounted && generation === this.loadGeneration) this.setState({ loading: false, status: `Fehler: ${error.message || error}` });
        }
    }

    async handleRowFieldChange(sourceId, fields) {
        try {
            const response = await this.callAdapter('updateCatalogEntryAdmin', { sourceId, ...fields });
            if (response && response.error) return { error: response.error };
            await this.loadEntries();
            return {};
        } catch (error) {
            return { error: error.message || String(error) };
        }
    }

    async applyToSelected(fields) {
        const selected = this.state.selected;
        let succeeded = 0;
        const failedIds = [];
        for (const sourceId of selected) {
            try {
                const response = await this.callAdapter('updateCatalogEntryAdmin', { sourceId, ...fields });
                if (response && response.error) throw new Error(response.error);
                succeeded += 1;
            } catch (_error) {
                failedIds.push(sourceId);
            }
        }
        this.setState({ selected: failedIds });
        await this.loadEntries();
        return { succeeded, failed: failedIds.length };
    }

    async deleteSelected() {
        const selected = this.state.selected;
        let succeeded = 0;
        const failedIds = [];
        for (const sourceId of selected) {
            try {
                const response = await this.callAdapter('removeCatalogEntry', { sourceId });
                if (response && response.error) throw new Error(response.error);
                succeeded += 1;
            } catch (_error) {
                failedIds.push(sourceId);
            }
        }
        this.setState({ selected: failedIds });
        await this.loadEntries();
        return { succeeded, failed: failedIds.length };
    }

    async runBulkAction(action, label) {
        const result = await action();
        const summary = `${result.succeeded} gespeichert, ${result.failed} fehlgeschlagen.`;
        this.setState({ status: label ? `${label}: ${summary}` : summary });
        return result;
    }

    async removeEntry(entry) {
        if (!window.confirm(`Katalogeintrag "${entry.sourceId}" wirklich entfernen?`)) return;
        try {
            const response = await this.callAdapter('removeCatalogEntry', { sourceId: entry.sourceId });
            if (response && response.error) throw new Error(response.error);
            this.setState(state => ({
                selected: state.selected.filter(id => id !== entry.sourceId),
                status: `${entry.sourceId} entfernt.`,
            }));
            await this.loadEntries();
        } catch (error) {
            this.setState({ status: `Fehler: ${error.message || error}` });
        }
    }

    toggleSelected(sourceId) {
        this.setState(state => ({ selected: state.selected.includes(sourceId) ? state.selected.filter(id => id !== sourceId) : [...state.selected, sourceId] }));
    }

    toggleExpanded(sourceId) {
        this.setState(state => {
            const expandedRows = new Set(state.expandedRows);
            if (expandedRows.has(sourceId)) expandedRows.delete(sourceId);
            else expandedRows.add(sourceId);
            return { expandedRows };
        });
    }

    setVisibleColumns(visibleColumns) {
        if (!visibleColumns.length) return;
        this.setState({ visibleColumns });
        try {
            window.localStorage.setItem(this.columnStorageKey, JSON.stringify(visibleColumns));
        } catch (_error) {
            // A restricted browser storage must not disable the device table.
        }
    }

    toggleColumn(columnKey) {
        const visible = new Set(this.state.visibleColumns);
        if (visible.has(columnKey)) visible.delete(columnKey);
        else visible.add(columnKey);
        this.setVisibleColumns(CATALOG_COLUMNS.map(column => column.key).filter(key => visible.has(key)));
    }

    resetVisibleColumns() {
        this.setVisibleColumns(DEFAULT_VISIBLE_COLUMNS);
    }

    getExistingGroups() {
        return Array.from(new Set(this.state.entries.map(entry => entry.derivedMetricGroupId).filter(Boolean))).sort();
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
        this.state.entries.forEach(entry => {
            lines.push(CSV_COLUMNS.map(key => csvEscape(entry[key])).join(','));
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
            const fieldIndexes = CSV_EDITABLE_COLUMNS.map(field => ({ field, index: header.indexOf(field) })).filter(
                entry => entry.index !== -1
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

    renderSortHeader(key, label) {
        const { sort } = this.state;
        const active = sort && sort.key === key;
        const indicator = active ? (sort.direction === 'asc' ? ' ▲' : ' ▼') : '';
        return (
            <th key={key}>
                <button aria-label={`Nach ${label} sortieren`} onClick={() => this.setState({ sort: nextSortState(sort, key) })}>
                    {label}{indicator}
                </button>
            </th>
        );
    }

    renderColumnSelector() {
        const visible = new Set(this.state.visibleColumns);
        return (
            <details style={{ marginBottom: 8 }}>
                <summary>Spalten anzeigen/ausblenden</summary>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: 8 }}>
                    {CATALOG_COLUMNS.map(column => (
                        <label key={column.key}>
                            <input
                                type="checkbox"
                                checked={visible.has(column.key)}
                                disabled={visible.has(column.key) && visible.size === 1}
                                onChange={() => this.toggleColumn(column.key)}
                            />{' '}
                            {column.label}
                        </label>
                    ))}
                    <button type="button" onClick={() => this.resetVisibleColumns()}>Alle anzeigen</button>
                </div>
            </details>
        );
    }

    renderItem() {
        const filtered = filterEntries(this.state.entries, this.state.filter);
        const entries = sortEntries(filtered, this.state.sort);
        const existingGroups = this.getExistingGroups();

        return (
            <div style={{ width: '100%' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
                    <button onClick={() => this.runCommand('runDiscoveryNow', 'Re-Scan läuft ...', 'Re-Scan abgeschlossen.')}>Geräte neu einlesen</button>
                    <button onClick={() => this.runCommand('runDiscoveryOnly', 'Sync läuft ...', 'Sync abgeschlossen.')}>Nur Updates einlesen</button>
                    <button onClick={() => this.runCommand('runProactiveCheckNow', 'Prüfung läuft ...', 'Prüfung gestartet.')}>Prüfung jetzt ausführen</button>
                    <button onClick={() => this.setState({ selected: entries.map(entry => entry.sourceId) })}>Alle auswählen</button>
                    <button onClick={() => this.setState({ selected: [] })}>Auswahl aufheben</button>
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
                <div style={{ marginBottom: 8, fontSize: 12 }}>Verhalten: <b>Gauge</b> = kontinuierlicher Messwert, z. B. Temperatur. Update-Frequenz, Vollständigkeit sowie Energie-/HVAC-Rolle stehen im aufklappbaren Detail-Panel jeder Zeile (▸). Räume sind freie Eingaben.</div>
                {this.renderColumnSelector()}
                {this.state.selected.length > 0 ? (
                    <BulkEditToolbar
                        count={this.state.selected.length}
                        existingGroups={existingGroups}
                        onApplyField={fields => this.runBulkAction(() => this.applyToSelected(fields))}
                        onIgnore={() => this.runBulkAction(() => this.applyToSelected({ ignored: true }), 'Ignorieren')}
                        onActivate={() => this.runBulkAction(() => this.applyToSelected({ ignored: false }), 'Aktivieren')}
                        onDelete={() => this.runBulkAction(() => this.deleteSelected(), 'Löschen')}
                    />
                ) : null}
                {this.state.loading ? <div>Geräte werden geladen ...</div> : <div style={{ overflowX: 'auto', maxHeight: 600 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                <th>Auswahl</th>
                                {CATALOG_COLUMNS.filter(column => this.state.visibleColumns.includes(column.key)).map(column => column.sortable
                                    ? this.renderSortHeader(column.key, column.label)
                                    : <th key={column.key}>{column.label}</th>)}
                            </tr>
                        </thead>
                        <tbody>{entries.map(entry => (
                            <DeviceRow
                                key={entry.sourceId}
                                entry={entry}
                                selected={this.state.selected.includes(entry.sourceId)}
                                expanded={this.state.expandedRows.has(entry.sourceId)}
                                existingGroups={existingGroups}
                                visibleColumns={this.state.visibleColumns}
                                onToggleSelected={() => this.toggleSelected(entry.sourceId)}
                                onToggleExpanded={() => this.toggleExpanded(entry.sourceId)}
                                onFieldChange={fields => this.handleRowFieldChange(entry.sourceId, fields)}
                                onRemove={() => this.removeEntry(entry)}
                            />
                        ))}</tbody>
                    </table>
                </div>}
            </div>
        );
    }
}
