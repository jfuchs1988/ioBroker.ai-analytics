import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CatalogDevicesComponent from '../../src-admin/src/CatalogDevices/CatalogDevicesComponent.jsx';

function makeFakeSocket(responders) {
    let lastRequest = null;
    return {
        setState: vi.fn(async (_id, { val }) => {
            lastRequest = JSON.parse(val);
        }),
        getState: vi.fn(async () => {
            const responder = responders[lastRequest.command];
            const result = typeof responder === 'function' ? responder(lastRequest.message) : responder;
            return { ack: true, val: JSON.stringify({ id: lastRequest.id, ok: true, result }) };
        }),
    };
}

function baseOContext(socket) {
    return { hostInfo: {}, themeType: 'light', adapterName: 'ai-analytics', instance: 0, socket };
}

const ENTRIES = [
    { sourceId: 'javascript.0.b', description: 'Bravo', category: 'lighting', valueKind: 'boolean_state', room: 'Keller' },
    { sourceId: 'javascript.0.a', description: 'Alpha', category: 'consumption', valueKind: 'gauge', room: 'Wohnzimmer' },
];

describe('CatalogDevicesComponent', () => {
    beforeEach(() => {
        window.localStorage.removeItem('ai-analytics.catalogDevices.columns.0.v1');
    });

    it('loads and renders entries sorted by load order, then re-sorts on header click', async () => {
        const user = userEvent.setup();
        const socket = makeFakeSocket({ listCatalogEntries: () => ({ entries: ENTRIES }) });
        render(<CatalogDevicesComponent schema={{}} data={{}} attr="catalogDevices" onChange={() => {}} onError={() => {}} oContext={baseOContext(socket)} />);

        await waitFor(() => expect(screen.getByText('javascript.0.b')).toBeTruthy());
        const rowsBefore = screen.getAllByRole('row').slice(1).map(row => row.textContent);
        expect(rowsBefore[0]).toContain('javascript.0.b');

        await user.click(screen.getByLabelText('Nach Objekt-ID sortieren'));
        const rowsAfter = screen.getAllByRole('row').slice(1).map(row => row.textContent);
        expect(rowsAfter[0]).toContain('javascript.0.a');
    });

    it('shows all catalog columns and persists hidden columns per instance', async () => {
        const user = userEvent.setup();
        window.localStorage.removeItem('ai-analytics.catalogDevices.columns.0.v1');
        const socket = makeFakeSocket({ listCatalogEntries: () => ({ entries: ENTRIES }) });
        const view = render(<CatalogDevicesComponent schema={{}} data={{}} attr="catalogDevices" onChange={() => {}} onError={() => {}} oContext={baseOContext(socket)} />);

        await waitFor(() => expect(screen.getByRole('columnheader', { name: 'Schreibbar' })).toBeTruthy());
        expect(screen.getByRole('columnheader', { name: 'Update-Frequenz' })).toBeTruthy();

        await user.click(screen.getByText('Spalten anzeigen/ausblenden'));
        await user.click(screen.getByRole('checkbox', { name: 'Kategorie' }));
        expect(screen.queryByRole('columnheader', { name: 'Kategorie' })).toBeNull();

        view.unmount();
        render(<CatalogDevicesComponent schema={{}} data={{}} attr="catalogDevices" onChange={() => {}} onError={() => {}} oContext={baseOContext(socket)} />);
        await waitFor(() => expect(screen.queryByRole('columnheader', { name: 'Kategorie' })).toBeNull());
    });

    it('saves a single field change immediately and reloads entries', async () => {
        const user = userEvent.setup();
        const updateSpy = vi.fn(() => ({ entry: { ...ENTRIES[1], category: 'device_usage' } }));
        const socket = makeFakeSocket({
            listCatalogEntries: () => ({ entries: ENTRIES }),
            updateCatalogEntryAdmin: updateSpy,
        });
        render(<CatalogDevicesComponent schema={{}} data={{}} attr="catalogDevices" onChange={() => {}} onError={() => {}} oContext={baseOContext(socket)} />);

        await waitFor(() => expect(screen.getByText('javascript.0.a')).toBeTruthy());
        await user.selectOptions(screen.getByLabelText('Kategorie für javascript.0.a'), 'device_usage');

        await waitFor(() => expect(updateSpy).toHaveBeenCalledWith({ sourceId: 'javascript.0.a', category: 'device_usage' }));
    });

    it('shows the bulk toolbar once a row is selected and applies a bulk value', async () => {
        const user = userEvent.setup();
        const updateSpy = vi.fn(() => ({ entry: {} }));
        const socket = makeFakeSocket({
            listCatalogEntries: () => ({ entries: ENTRIES }),
            updateCatalogEntryAdmin: updateSpy,
        });
        render(<CatalogDevicesComponent schema={{}} data={{}} attr="catalogDevices" onChange={() => {}} onError={() => {}} oContext={baseOContext(socket)} />);

        await waitFor(() => expect(screen.getByText('javascript.0.a')).toBeTruthy());
        expect(screen.queryByRole('region', { name: 'Bulk-Aktionen' })).toBeNull();

        await user.click(screen.getByLabelText('javascript.0.a auswählen'));
        expect(screen.getByRole('region', { name: 'Bulk-Aktionen' })).toBeTruthy();

        await user.selectOptions(screen.getByLabelText('Wert für Bulk-Kategorie'), 'lighting');
        await user.click(screen.getByRole('button', { name: /Auf 1 ausgewählte Geräte anwenden/ }));

        await waitFor(() => expect(updateSpy).toHaveBeenCalledWith({ sourceId: 'javascript.0.a', category: 'lighting' }));
    });
});
