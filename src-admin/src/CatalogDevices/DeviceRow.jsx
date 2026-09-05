import React from 'react';
import GroupIdPicker from './GroupIdPicker.jsx';

const CATEGORIES = ['consumption', 'generation_pv', 'lighting', 'device_usage', 'environment'];
const VALUE_KINDS = ['gauge', 'boolean_state', 'daily_reset_counter', 'cumulative_total', 'event_count'];
const DERIVED_METRIC_ROLES = ['pv_generation', 'grid_feed_in', 'grid_import', 'battery_charge', 'battery_discharge', 'consumption'];
const HVAC_ROLES = ['window', 'heating'];
const UPDATE_FREQUENCIES = ['unknown', 'seconds', 'minutes', 'hourly', 'daily', 'weekly_or_slower', 'event_driven'];
const DATA_COMPLETENESS = ['unknown', 'complete', 'gaps', 'stale'];
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_ROOM_LENGTH = 200;

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
            pendingRole: undefined,
        };
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

    async save(fields) {
        const result = await this.props.onFieldChange(fields);
        const changedKeys = Object.keys(fields);
        this.setState(state => {
            const fieldErrors = { ...state.fieldErrors };
            changedKeys.forEach(key => {
                if (result && result.error) fieldErrors[key] = result.error;
                else delete fieldErrors[key];
            });
            return { fieldErrors };
        });
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
        const role = this.state.pendingRole || this.props.entry.derivedMetricRole;
        this.setState({ pendingRole: undefined });
        this.save({ derivedMetricRole: role, derivedMetricGroupId: nextGroup });
    }

    render() {
        const { entry, selected, expanded, existingGroups } = this.props;
        const { fieldErrors, pendingRole } = this.state;
        const effectiveRole = pendingRole !== undefined ? pendingRole : (entry.derivedMetricRole || '');
        const hvacDisabled = entry.valueKind !== 'boolean_state';

        return (
            <>
                <tr>
                    <td>
                        <button aria-label={`${entry.sourceId} Details ${expanded ? 'schließen' : 'öffnen'}`} onClick={() => this.props.onToggleExpanded()}>
                            {expanded ? '▾' : '▸'}
                        </button>
                        <input type="checkbox" aria-label={`${entry.sourceId} auswählen`} checked={selected} onChange={() => this.props.onToggleSelected()} />
                    </td>
                    <td>{entry.sourceId}</td>
                    <td>
                        <input
                            aria-label={`Beschreibung für ${entry.sourceId}`}
                            maxLength={MAX_DESCRIPTION_LENGTH}
                            value={this.state.description}
                            onChange={event => this.setState({ description: event.target.value })}
                            onBlur={() => this.handleTextBlur('description', MAX_DESCRIPTION_LENGTH)}
                        />
                        {fieldErrors.description ? <span role="alert">{fieldErrors.description}</span> : null}
                    </td>
                    <td>
                        <select aria-label={`Kategorie für ${entry.sourceId}`} value={entry.category || ''} onChange={event => this.save({ category: event.target.value })}>
                            {CATEGORIES.map(category => <option key={category} value={category}>{category}</option>)}
                        </select>
                        {fieldErrors.category ? <span role="alert">{fieldErrors.category}</span> : null}
                    </td>
                    <td>
                        <select aria-label={`Verhalten für ${entry.sourceId}`} value={entry.valueKind || ''} onChange={event => this.save({ valueKind: event.target.value })}>
                            <option value="">nicht klassifiziert</option>
                            {VALUE_KINDS.map(kind => <option key={kind} value={kind}>{kind}</option>)}
                        </select>
                        {fieldErrors.valueKind ? <span role="alert">{fieldErrors.valueKind}</span> : null}
                    </td>
                    <td>{entry.unit || ''}</td>
                    <td>{entry.writable === true ? '✓' : entry.writable === false ? '–' : ''}</td>
                    <td>
                        <input
                            aria-label={`Raum für ${entry.sourceId}`}
                            maxLength={MAX_ROOM_LENGTH}
                            value={this.state.room}
                            placeholder="z. B. Keller"
                            onChange={event => this.setState({ room: event.target.value })}
                            onBlur={() => this.handleTextBlur('room', MAX_ROOM_LENGTH)}
                        />
                        {fieldErrors.room ? <span role="alert">{fieldErrors.room}</span> : null}
                    </td>
                    <td>{statusLabelOf(entry)}</td>
                    <td>
                        <button aria-label={`${entry.sourceId} ${entry.ignored ? 'aktivieren' : 'ignorieren'}`} onClick={() => this.save({ ignored: !entry.ignored })}>
                            {entry.ignored ? 'Aktivieren' : 'Ignorieren'}
                        </button>
                        <button aria-label={`${entry.sourceId} entfernen`} onClick={() => this.props.onRemove()}>Entfernen</button>
                    </td>
                </tr>
                {expanded ? (
                    <tr>
                        <td colSpan={10}>
                            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: 8 }}>
                                <label>
                                    Update-Frequenz{' '}
                                    <select aria-label={`Update-Frequenz für ${entry.sourceId}`} value={entry.updateFrequency || ''} onChange={event => this.save({ updateFrequency: event.target.value })}>
                                        {UPDATE_FREQUENCIES.map(item => <option key={item} value={item}>{item}</option>)}
                                    </select>
                                </label>
                                <label>
                                    Vollständigkeit{' '}
                                    <select aria-label={`Vollständigkeit für ${entry.sourceId}`} value={entry.dataCompleteness || ''} onChange={event => this.save({ dataCompleteness: event.target.value })}>
                                        {DATA_COMPLETENESS.map(item => <option key={item} value={item}>{item}</option>)}
                                    </select>
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
