import React from 'react';
import { ConfigGeneric } from '@iobroker/json-config';

const CATEGORIES = ['consumption', 'generation_pv', 'lighting', 'device_usage', 'environment'];
const VALUE_KINDS = ['gauge', 'boolean_state', 'daily_reset_counter', 'cumulative_total', 'event_count'];

export default class CatalogDevicesComponent extends ConfigGeneric {
    constructor(props) {
        super(props);
        this.state = { ...this.state, entries: [], filter: '', loading: true, status: '' };
    }

    async componentDidMount() {
        super.componentDidMount();
        await this.loadEntries();
    }

    async callAdapter(command, message = {}) {
        const instance = `ai-analytics.${this.props.oContext.instance}`;
        return this.props.oContext.socket.sendTo(instance, command, message);
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
        try {
            const response = await this.callAdapter(command);
            this.setState({ status: response && response.error ? `Fehler: ${response.error}` : successText });
            await this.loadEntries();
        } catch (error) {
            this.setState({ status: `Fehler: ${error.message || error}` });
        }
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
                    <button onClick={() => this.runCommand('runProactiveCheckNow', 'Prüfung läuft ...', 'Prüfung gestartet.')}>Prüfung jetzt ausführen</button>
                    <input placeholder="Filtern ..." value={this.state.filter} onChange={event => this.setState({ filter: event.target.value })} />
                </div>
                {this.state.status ? <div style={{ marginBottom: 8 }}>{this.state.status}</div> : null}
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
