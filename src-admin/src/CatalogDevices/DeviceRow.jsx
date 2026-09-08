import React from 'react';
import GroupIdPicker from './GroupIdPicker.jsx';

const CATEGORIES = ['consumption', 'generation_pv', 'lighting', 'device_usage', 'environment'];
const VALUE_KINDS = ['gauge', 'boolean_state', 'daily_reset_counter', 'cumulative_total', 'event_count'];
const DERIVED_METRIC_ROLES = ['pv_generation', 'grid_feed_in', 'grid_import', 'battery_charge', 'battery_discharge', 'consumption', 'grid_power', 'battery_power'];
const HVAC_ROLES = ['window', 'heating'];
const UPDATE_FREQUENCIES = ['unknown', 'seconds', 'minutes', 'hourly', 'daily', 'weekly_or_slower', 'event_driven'];
const DATA_COMPLETENESS = ['unknown', 'complete', 'gaps', 'stale'];
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_ROOM_LENGTH = 200;
const FIELD_OK_TIMEOUT_MS = 3000;

function statusLabelOf(entry) {
    if (entry.ignored) return 'ignoriert';
    if (entry.active === false) return 'inaktiv';
    if (entry.needsReview) return 'Prüfung nötig';
    return 'aktiv';
}

export default class DeviceRow extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            description: props.entry.description || '',
            room: props.entry.room || '',
            fieldErrors: {},
            fieldOk: {},
            pendingRole: undefined,
        };
        this.fieldOkTimers = {};
    }

    componentDidUpdate(prevProps) {
        if (prevProps.entry !== this.props.entry) {
            this.setState({
                description: this.props.entry.description || '',
                room: this.props.entry.room || '',
                pendingRole: undefined,
            });
        }
    }

    componentWillUnmount() {
        this.unmounted = true;
        Object.keys(this.fieldOkTimers).forEach(key => clearTimeout(this.fieldOkTimers[key]));
        this.fieldOkTimers = {};
    }

    clearFieldOkTimer(key) {
        if (this.fieldOkTimers[key]) {
            clearTimeout(this.fieldOkTimers[key]);
            delete this.fieldOkTimers[key];
        }
    }

    scheduleFieldOkClear(key) {
        this.clearFieldOkTimer(key);
        this.fieldOkTimers[key] = setTimeout(() => {
            delete this.fieldOkTimers[key];
            if (this.unmounted) return;
            this.setState(state => {
                const fieldOk = { ...state.fieldOk };
                delete fieldOk[key];
                return { fieldOk };
            });
        }, FIELD_OK_TIMEOUT_MS);
    }

    async save(fields) {
        const changedKeys = Object.keys(fields);
        // Clear any pending success indicator/timer for these fields immediately so a fast
        // successive edit doesn't leave a stale "saved" flag or double-fire a clear.
        changedKeys.forEach(key => this.clearFieldOkTimer(key));
        this.setState(state => {
            const fieldOk = { ...state.fieldOk };
            changedKeys.forEach(key => delete fieldOk[key]);
            return { fieldOk };
        });

        const result = await this.props.onFieldChange(fields);
        if (this.unmounted) return;
        const hasError = Boolean(result && result.error);
        this.setState(state => {
            const fieldErrors = { ...state.fieldErrors };
            const fieldOk = { ...state.fieldOk };
            changedKeys.forEach(key => {
                if (hasError) {
                    fieldErrors[key] = result.error;
                    delete fieldOk[key];
                } else {
                    delete fieldErrors[key];
                    fieldOk[key] = true;
                }
            });
            return { fieldErrors, fieldOk };
        });
        if (!hasError) changedKeys.forEach(key => this.scheduleFieldOkClear(key));
    }

    handleTextBlur(field, maxLength) {
        const value = this.state[field].slice(0, maxLength);
        if (value === (this.props.entry[field] || '')) return;
        this.save({ [field]: value });
    }

    handleRoleChange(nextRole) {
        if (nextRole === '') {
            this.save({ derivedMetricRole: '' });
            return;
        }
        if (!this.props.entry.derivedMetricGroupId) {
            this.setState({ pendingRole: nextRole });
            return;
        }
        this.save({ derivedMetricRole: nextRole, derivedMetricGroupId: this.props.entry.derivedMetricGroupId });
    }

    handleGroupChange(nextGroup) {
        this.setState({ pendingRole: undefined });
        if (!nextGroup) {
            this.save({ derivedMetricRole: '' });
            return;
        }
        const role = this.state.pendingRole || this.props.entry.derivedMetricRole;
        this.save({ derivedMetricRole: role, derivedMetricGroupId: nextGroup });
    }

    feedback(field) {
        if (this.state.fieldErrors[field]) return <span role="alert">{this.state.fieldErrors[field]}</span>;
        return this.state.fieldOk[field] ? <span role="status">Gespeichert</span> : null;
    }

    renderColumnCell(column, entry, effectiveRole, hvacDisabled) {
        switch (column) {
            case 'sourceId': return <td key={column}>{entry.sourceId}</td>;
            case 'description': return <td key={column}>
                <input aria-label={`Beschreibung für ${entry.sourceId}`} maxLength={MAX_DESCRIPTION_LENGTH} value={this.state.description} onChange={event => this.setState({ description: event.target.value })} onBlur={() => this.handleTextBlur('description', MAX_DESCRIPTION_LENGTH)} />
                {this.feedback('description')}
            </td>;
            case 'category': return <td key={column}>
                <select aria-label={`Kategorie für ${entry.sourceId}`} value={entry.category || ''} onChange={event => this.save({ category: event.target.value })}>
                    {CATEGORIES.map(value => <option key={value} value={value}>{value}</option>)}
                </select>{this.feedback('category')}
            </td>;
            case 'valueKind': return <td key={column}>
                <select aria-label={`Verhalten für ${entry.sourceId}`} value={entry.valueKind || ''} onChange={event => this.save({ valueKind: event.target.value })}>
                    <option value="">nicht klassifiziert</option>{VALUE_KINDS.map(value => <option key={value} value={value}>{value}</option>)}
                </select>{this.feedback('valueKind')}
            </td>;
            case 'unit': return <td key={column}>{entry.unit || ''}</td>;
            case 'writable': return <td key={column}>{entry.writable === true ? 'Ja' : entry.writable === false ? 'Nein' : ''}</td>;
            case 'room': return <td key={column}>
                <input aria-label={`Raum für ${entry.sourceId}`} maxLength={MAX_ROOM_LENGTH} value={this.state.room} placeholder="z. B. Keller" onChange={event => this.setState({ room: event.target.value })} onBlur={() => this.handleTextBlur('room', MAX_ROOM_LENGTH)} />
                {this.feedback('room')}
            </td>;
            case 'ignored': return <td key={column}>
                {entry.ignored ? 'Ja' : 'Nein'} <button onClick={() => this.save({ ignored: !entry.ignored })}>{entry.ignored ? 'Aktivieren' : 'Ignorieren'}</button>{this.feedback('ignored')}
            </td>;
            case 'active': return <td key={column}>{entry.active === false ? 'Nein' : 'Ja'}</td>;
            case 'needsReview': return <td key={column}>
                {entry.needsReview ? 'Ja' : 'Nein'}{' '}
                <button onClick={() => this.save({ needsReview: !entry.needsReview })}>
                    {entry.needsReview ? 'Als geprüft markieren' : 'Prüfung wieder öffnen'}
                </button>{this.feedback('needsReview')}
            </td>;
            case 'writePattern': return <td key={column}>{entry.writePattern || ''}</td>;
            case 'updateFrequency': return <td key={column}>
                <select aria-label={`Update-Frequenz für ${entry.sourceId}`} value={entry.updateFrequency || ''} onChange={event => this.save({ updateFrequency: event.target.value })}>
                    {UPDATE_FREQUENCIES.map(value => <option key={value} value={value}>{value}</option>)}
                </select>{this.feedback('updateFrequency')}
            </td>;
            case 'dataCompleteness': return <td key={column}>
                <select aria-label={`Vollständigkeit für ${entry.sourceId}`} value={entry.dataCompleteness || ''} onChange={event => this.save({ dataCompleteness: event.target.value })}>
                    {DATA_COMPLETENESS.map(value => <option key={value} value={value}>{value}</option>)}
                </select>{this.feedback('dataCompleteness')}
            </td>;
            case 'derivedMetricRole': return <td key={column}>
                <select aria-label={`Energie-Rolle für ${entry.sourceId}`} value={effectiveRole} onChange={event => this.handleRoleChange(event.target.value)}>
                    <option value="">keine</option>{DERIVED_METRIC_ROLES.map(value => <option key={value} value={value}>{value}</option>)}
                </select>{this.feedback('derivedMetricRole')}
            </td>;
            case 'derivedMetricGroupId': return <td key={column}>
                {effectiveRole ? <GroupIdPicker ariaLabel={`Energiebilanz-Gruppe für ${entry.sourceId}`} value={entry.derivedMetricGroupId} existingGroups={this.props.existingGroups} onChange={group => this.handleGroupChange(group)} /> : null}
                {this.feedback('derivedMetricGroupId')}
            </td>;
            case 'derivedMetricInverted': return <td key={column}>{entry.derivedMetricInverted ? 'Ja' : ''}</td>;
            case 'hvacRole': return <td key={column}>
                <select aria-label={`HVAC-Rolle für ${entry.sourceId}`} value={entry.hvacRole || ''} disabled={hvacDisabled} title={hvacDisabled ? 'Nur für Verhalten boolean_state verfügbar' : undefined} onChange={event => this.save({ hvacRole: event.target.value })}>
                    <option value="">keine</option>{HVAC_ROLES.map(value => <option key={value} value={value}>{value}</option>)}
                </select>{this.feedback('hvacRole')}
            </td>;
            case 'status': return <td key={column}>{statusLabelOf(entry)}</td>;
            case 'actions': return <td key={column}>
                <button aria-label={`${entry.sourceId} entfernen`} onClick={() => this.props.onRemove()}>Entfernen</button>
            </td>;
            default: return null;
        }
    }

    render() {
        const { entry, selected, expanded, existingGroups } = this.props;
        const { fieldErrors, pendingRole } = this.state;
        const effectiveRole = pendingRole !== undefined ? pendingRole : (entry.derivedMetricRole || '');
        const hvacDisabled = entry.valueKind !== 'boolean_state';
        const visibleColumns = this.props.visibleColumns || ['sourceId', 'description', 'category', 'valueKind', 'unit', 'writable', 'room', 'status', 'actions'];

        return (
            <>
                <tr>
                    <td>
                        <button aria-label={`${entry.sourceId} Details ${expanded ? 'schließen' : 'öffnen'}`} onClick={() => this.props.onToggleExpanded()}>
                            {expanded ? '▾' : '▸'}
                        </button>
                        <input type="checkbox" aria-label={`${entry.sourceId} auswählen`} checked={selected} onChange={() => this.props.onToggleSelected()} />
                    </td>
                    {visibleColumns.map(column => this.renderColumnCell(column, entry, effectiveRole, hvacDisabled))}
                </tr>
                {expanded ? (
                    <tr>
                        <td colSpan={visibleColumns.length + 1}>
                            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: 8 }}>
                                <label>
                                    Update-Frequenz{' '}
                                    <select aria-label={`Update-Frequenz für ${entry.sourceId}`} value={entry.updateFrequency || ''} onChange={event => this.save({ updateFrequency: event.target.value })}>
                                        {UPDATE_FREQUENCIES.map(item => <option key={item} value={item}>{item}</option>)}
                                    </select>
                                    {fieldErrors.updateFrequency ? <span role="alert">{fieldErrors.updateFrequency}</span> : null}
                                </label>
                                <label>
                                    Vollständigkeit{' '}
                                    <select aria-label={`Vollständigkeit für ${entry.sourceId}`} value={entry.dataCompleteness || ''} onChange={event => this.save({ dataCompleteness: event.target.value })}>
                                        {DATA_COMPLETENESS.map(item => <option key={item} value={item}>{item}</option>)}
                                    </select>
                                    {fieldErrors.dataCompleteness ? <span role="alert">{fieldErrors.dataCompleteness}</span> : null}
                                </label>
                                <label>
                                    Energie-Rolle{' '}
                                    <select aria-label={`Energie-Rolle für ${entry.sourceId}`} value={effectiveRole} onChange={event => this.handleRoleChange(event.target.value)}>
                                        <option value="">keine</option>
                                        {DERIVED_METRIC_ROLES.map(role => <option key={role} value={role}>{role}</option>)}
                                    </select>
                                </label>
                                {effectiveRole ? (
                                    <GroupIdPicker
                                        ariaLabel={`Energiebilanz-Gruppe für ${entry.sourceId}`}
                                        value={entry.derivedMetricGroupId}
                                        existingGroups={existingGroups}
                                        onChange={group => this.handleGroupChange(group)}
                                    />
                                ) : null}
                                {fieldErrors.derivedMetricRole ? <span role="alert">{fieldErrors.derivedMetricRole}</span> : null}
                                {(effectiveRole === 'grid_power' || effectiveRole === 'battery_power') ? (
                                    <label>
                                        <input
                                            type="checkbox"
                                            aria-label={`Vorzeichen invertiert für ${entry.sourceId}`}
                                            checked={Boolean(entry.derivedMetricInverted)}
                                            onChange={event => this.save({ derivedMetricInverted: event.target.checked })}
                                        />
                                        {' '}Vorzeichen invertiert
                                    </label>
                                ) : null}
                                <label>
                                    HVAC-Rolle{' '}
                                    <select
                                        aria-label={`HVAC-Rolle für ${entry.sourceId}`}
                                        value={entry.hvacRole || ''}
                                        disabled={hvacDisabled}
                                        title={hvacDisabled ? 'Nur für Verhalten boolean_state verfügbar' : undefined}
                                        onChange={event => this.save({ hvacRole: event.target.value })}
                                    >
                                        <option value="">keine</option>
                                        {HVAC_ROLES.map(role => <option key={role} value={role}>{role}</option>)}
                                    </select>
                                </label>
                                {fieldErrors.hvacRole ? <span role="alert">{fieldErrors.hvacRole}</span> : null}
                            </div>
                        </td>
                    </tr>
                ) : null}
            </>
        );
    }
}
