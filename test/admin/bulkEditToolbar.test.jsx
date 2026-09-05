import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BulkEditToolbar from '../../src-admin/src/CatalogDevices/BulkEditToolbar.jsx';

function renderToolbar(overrides = {}) {
    const props = {
        count: 3,
        existingGroups: ['pv-1'],
        onApplyField: vi.fn().mockResolvedValue({ succeeded: 3, failed: 0 }),
        onIgnore: vi.fn().mockResolvedValue({ succeeded: 3, failed: 0 }),
        onActivate: vi.fn().mockResolvedValue({ succeeded: 3, failed: 0 }),
        onDelete: vi.fn().mockResolvedValue({ succeeded: 3, failed: 0 }),
        ...overrides,
    };
    render(<BulkEditToolbar {...props} />);
    return props;
}

describe('BulkEditToolbar', () => {
    it('applies a chosen category value to the selection', async () => {
        const user = userEvent.setup();
        const props = renderToolbar();

        await user.selectOptions(screen.getByLabelText('Wert für Bulk-Kategorie'), 'device_usage');
        await user.click(screen.getByRole('button', { name: /Auf 3 ausgewählte Geräte anwenden/ }));

        expect(props.onApplyField).toHaveBeenCalledWith({ category: 'device_usage' });
        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('3 gespeichert, 0 fehlgeschlagen.'));
    });

    it('requires both a role and a group before enabling apply for derivedMetricRole', async () => {
        const user = userEvent.setup();
        const props = renderToolbar();

        await user.selectOptions(screen.getByLabelText('Bulk-Feld'), 'derivedMetricRole');
        await user.selectOptions(screen.getByLabelText('Wert für Bulk-Energie-Rolle'), 'pv_generation');
        expect(screen.getByRole('button', { name: /Auf 3 ausgewählte Geräte anwenden/ })).toBeDisabled();

        await user.selectOptions(screen.getByLabelText('Wert für Bulk-Energiebilanz-Gruppe'), 'pv-1');
        expect(screen.getByRole('button', { name: /Auf 3 ausgewählte Geräte anwenden/ })).toBeEnabled();

        await user.click(screen.getByRole('button', { name: /Auf 3 ausgewählte Geräte anwenden/ }));
        expect(props.onApplyField).toHaveBeenCalledWith({ derivedMetricRole: 'pv_generation', derivedMetricGroupId: 'pv-1' });
    });

    it('keeps apply enabled for derivedMetricRole when the role is left at keine', async () => {
        const user = userEvent.setup();
        renderToolbar();

        await user.selectOptions(screen.getByLabelText('Bulk-Feld'), 'derivedMetricRole');

        expect(screen.getByRole('button', { name: /Auf 3 ausgewählte Geräte anwenden/ })).toBeEnabled();
    });

    it('calls onIgnore/onActivate directly without a value', async () => {
        const user = userEvent.setup();
        const props = renderToolbar();

        await user.click(screen.getByRole('button', { name: 'Ignorieren' }));
        expect(props.onIgnore).toHaveBeenCalled();

        await user.click(screen.getByRole('button', { name: 'Aktivieren' }));
        expect(props.onActivate).toHaveBeenCalled();
    });

    describe('delete confirmation', () => {
        beforeEach(() => {
            vi.spyOn(window, 'confirm');
        });
        afterEach(() => {
            window.confirm.mockRestore();
        });

        it('does not call onDelete when the confirm dialog is declined', async () => {
            window.confirm.mockReturnValue(false);
            const user = userEvent.setup();
            const props = renderToolbar();

            await user.click(screen.getByRole('button', { name: 'Löschen' }));

            expect(window.confirm).toHaveBeenCalledWith('3 ausgewählte Geräte wirklich entfernen?');
            expect(props.onDelete).not.toHaveBeenCalled();
        });

        it('calls onDelete when the confirm dialog is accepted', async () => {
            window.confirm.mockReturnValue(true);
            const user = userEvent.setup();
            const props = renderToolbar();

            await user.click(screen.getByRole('button', { name: 'Löschen' }));

            expect(props.onDelete).toHaveBeenCalled();
        });
    });

    it('reports partial failures after a bulk action', async () => {
        const user = userEvent.setup();
        renderToolbar({ onIgnore: vi.fn().mockResolvedValue({ succeeded: 2, failed: 1 }) });

        await user.click(screen.getByRole('button', { name: 'Ignorieren' }));

        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('2 gespeichert, 1 fehlgeschlagen.'));
    });
});
