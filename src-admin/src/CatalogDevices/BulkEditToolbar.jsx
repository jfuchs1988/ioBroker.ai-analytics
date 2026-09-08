import React from 'react';
import GroupIdPicker from './GroupIdPicker.jsx';

const CATEGORIES = ['consumption', 'generation_pv', 'lighting', 'device_usage', 'environment'];
const VALUE_KINDS = ['gauge', 'boolean_state', 'daily_reset_counter', 'cumulative_total', 'event_count'];
const DERIVED_METRIC_ROLES = ['pv_generation', 'grid_feed_in', 'grid_import', 'battery_charge', 'battery_discharge', 'consumption', 'grid_power', 'battery_power'];
const HVAC_ROLES = ['window', 'heating'];
const UPDATE_FREQUENCIES = ['unknown', 'seconds', 'minutes', 'hourly', 'daily', 'weekly_or_slower', 'event_driven'];
const DATA_COMPLETENESS = ['unknown', 'complete', 'gaps', 'stale'];
const MAX_ROOM_LENGTH = 200;
const FIELD_OPTIONS = [
    { value: 'category', label: 'Kategorie' },
    { value: 'room', label: 'Raum' },
    { value: 'valueKind', label: 'Verhalten' },
    { value: 'updateFrequency', label: 'Update-Frequenz' },
    { value: 'dataCompleteness', label: 'Vollständigkeit' },
    { value: 'derivedMetricRole', label: 'Energie-Rolle' },
    { value: 'hvacRole', label: 'HVAC-Rolle' },
];

export default class BulkEditToolbar extends React.Component {
    constructor(props) {
        super(props);
        this.state = { field: 'category', value: '', groupId: '' };
    }

    async apply() {
        const { field, value, groupId } = this.state;
        const fields = field === 'derivedMetricRole' ? { derivedMetricRole: value, derivedMetricGroupId: groupId } : { [field]: value };
        await this.props.onApplyField(fields);
    }

    async handleDelete() {
        if (!window.confirm(`${this.props.count} ausgewählte Geräte wirklich entfernen?`)) return;
        await this.props.onDelete();
    }

    get canApply() {
        const { field, value, groupId } = this.state;
        if (field === 'derivedMetricRole') return value === '' || Boolean(groupId);
        if (field === 'room' || field === 'hvacRole') return true;
        return value !== '';
    }

    renderValueInput() {
        const { field, value } = this.state;
        if (field === 'category') {
            return <select aria-label="Wert für Bulk-Kategorie" value={value} onChange={event => this.setState({ value: event.target.value })}>
                <option value="">-</option>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>;
        }
        if (field === 'valueKind') {
            return <select aria-label="Wert für Bulk-Verhalten" value={value} onChange={event => this.setState({ value: event.target.value })}>
                <option value="">-</option>{VALUE_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>;
        }
        if (field === 'updateFrequency') {
            return <select aria-label="Wert für Bulk-Update-Frequenz" value={value} onChange={event => this.setState({ value: event.target.value })}>
                <option value="">-</option>{UPDATE_FREQUENCIES.map(k => <option key={k} value={k}>{k}</option>)}
            </select>;
        }
        if (field === 'dataCompleteness') {
            return <select aria-label="Wert für Bulk-Vollständigkeit" value={value} onChange={event => this.setState({ value: event.target.value })}>
                <option value="">-</option>{DATA_COMPLETENESS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>;
        }
        if (field === 'hvacRole') {
            return <select aria-label="Wert für Bulk-HVAC-Rolle" value={value} onChange={event => this.setState({ value: event.target.value })}>
                <option value="">keine</option>{HVAC_ROLES.map(k => <option key={k} value={k}>{k}</option>)}
            </select>;
        }
        if (field === 'derivedMetricRole') {
            return <>
                <select aria-label="Wert für Bulk-Energie-Rolle" value={value} onChange={event => this.setState({ value: event.target.value, groupId: '' })}>
                    <option value="">keine</option>{DERIVED_METRIC_ROLES.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
                {value ? (
                    <GroupIdPicker
                        ariaLabel="Wert für Bulk-Energiebilanz-Gruppe"
                        value={this.state.groupId}
                        existingGroups={this.props.existingGroups}
                        onChange={groupId => this.setState({ groupId })}
                    />
                ) : null}
            </>;
        }
        return <input aria-label="Wert für Bulk-Raum" maxLength={MAX_ROOM_LENGTH} value={value} onChange={event => this.setState({ value: event.target.value })} />;
    }

    render() {
        const { count, busy } = this.props;
        return (
            <div role="region" aria-label="Bulk-Aktionen">
                <span>{count} ausgewählt</span>
                <select aria-label="Bulk-Feld" value={this.state.field} onChange={event => this.setState({ field: event.target.value, value: '', groupId: '' })}>
                    {FIELD_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                {this.renderValueInput()}
                <button disabled={busy || !this.canApply} onClick={() => this.apply()}>Auf {count} ausgewählte Geräte anwenden</button>
                <button disabled={busy} onClick={() => this.props.onIgnore()}>Ignorieren</button>
                <button disabled={busy} onClick={() => this.props.onActivate()}>Aktivieren</button>
                <button disabled={busy} onClick={() => this.props.onReviewComplete()}>Prüfung erledigen</button>
                <button disabled={busy} onClick={() => this.props.onReviewRequired()}>Prüfung wieder öffnen</button>
                <button disabled={busy} onClick={() => this.handleDelete()}>Löschen</button>
            </div>
        );
    }
}
