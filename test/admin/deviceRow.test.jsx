import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DeviceRow from '../../src-admin/src/CatalogDevices/DeviceRow.jsx';

function renderRow(overrides = {}) {
    const entry = { sourceId: 'javascript.0.x', description: 'Lampe', category: 'lighting', valueKind: 'gauge', room: 'Keller', ...overrides.entry };
    const props = {
        selected: false,
        expanded: false,
        existingGroups: [],
        onToggleSelected: vi.fn(),
        onToggleExpanded: vi.fn(),
        onFieldChange: vi.fn().mockResolvedValue({}),
        onRemove: vi.fn(),
        ...overrides,
        entry,
    };
    return { ...render(
        <table><tbody><DeviceRow {...props} /></tbody></table>
    ), props };
}

describe('DeviceRow', () => {
    it('saves a dropdown change immediately via onChange', async () => {
        const user = userEvent.setup();
        const { props } = renderRow();

        await user.selectOptions(screen.getByLabelText('Kategorie für javascript.0.x'), 'device_usage');

        expect(props.onFieldChange).toHaveBeenCalledWith({ category: 'device_usage' });
    });

    it('saves a text field only on blur, not per keystroke', async () => {
        const user = userEvent.setup();
        const { props } = renderRow();

        const input = screen.getByLabelText('Beschreibung für javascript.0.x');
        await user.clear(input);
        await user.type(input, 'Neue Beschreibung');
        expect(props.onFieldChange).not.toHaveBeenCalled();

        await user.tab();
        expect(props.onFieldChange).toHaveBeenCalledWith({ description: 'Neue Beschreibung' });
    });

    it('does not save on blur when the text field value is unchanged', async () => {
        const user = userEvent.setup();
        const { props } = renderRow();

        await user.click(screen.getByLabelText('Beschreibung für javascript.0.x'));
        await user.tab();

        expect(props.onFieldChange).not.toHaveBeenCalled();
    });

    it('shows an inline error next to the field when onFieldChange fails', async () => {
        const user = userEvent.setup();
        renderRow({ onFieldChange: vi.fn().mockResolvedValue({ error: 'Server abgelehnt' }) });

        await user.selectOptions(screen.getByLabelText('Kategorie für javascript.0.x'), 'device_usage');

        await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Server abgelehnt'));
    });

    it('toggles the detail panel via onToggleExpanded', async () => {
        const user = userEvent.setup();
        const { props } = renderRow();

        await user.click(screen.getByLabelText('javascript.0.x Details öffnen'));

        expect(props.onToggleExpanded).toHaveBeenCalled();
    });

    it('disables the HVAC role dropdown unless valueKind is boolean_state', () => {
        renderRow({ expanded: true, entry: { valueKind: 'gauge' } });
        expect(screen.getByLabelText('HVAC-Rolle für javascript.0.x')).toBeDisabled();
    });

    it('enables the HVAC role dropdown for boolean_state and saves the chosen role', async () => {
        const user = userEvent.setup();
        const { props } = renderRow({ expanded: true, entry: { valueKind: 'boolean_state' } });

        const select = screen.getByLabelText('HVAC-Rolle für javascript.0.x');
        expect(select).toBeEnabled();
        await user.selectOptions(select, 'window');

        expect(props.onFieldChange).toHaveBeenCalledWith({ hvacRole: 'window' });
    });

    it('holds a newly chosen energy role until a group is picked, then saves both together', async () => {
        const user = userEvent.setup();
        const { props } = renderRow({ expanded: true, existingGroups: ['pv-1'], entry: { derivedMetricRole: undefined, derivedMetricGroupId: undefined } });

        await user.selectOptions(screen.getByLabelText('Energie-Rolle für javascript.0.x'), 'pv_generation');
        expect(props.onFieldChange).not.toHaveBeenCalled();

        await user.selectOptions(screen.getByLabelText('Energiebilanz-Gruppe für javascript.0.x'), 'pv-1');

        expect(props.onFieldChange).toHaveBeenCalledWith({ derivedMetricRole: 'pv_generation', derivedMetricGroupId: 'pv-1' });
    });

    it('clears the energy role via the empty-string sentinel when "keine" is chosen', async () => {
        const user = userEvent.setup();
        const { props } = renderRow({ expanded: true, entry: { derivedMetricRole: 'pv_generation', derivedMetricGroupId: 'pv-1' } });

        await user.selectOptions(screen.getByLabelText('Energie-Rolle für javascript.0.x'), '');

        expect(props.onFieldChange).toHaveBeenCalledWith({ derivedMetricRole: '' });
    });

    it('calls onRemove when the Entfernen button is clicked', async () => {
        const user = userEvent.setup();
        const { props } = renderRow();

        await user.click(screen.getByLabelText('javascript.0.x entfernen'));

        expect(props.onRemove).toHaveBeenCalled();
    });
});
