import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GroupIdPicker from '../../src-admin/src/CatalogDevices/GroupIdPicker.jsx';

describe('GroupIdPicker', () => {
    it('lists existing groups and reports a selection', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<GroupIdPicker ariaLabel="Gruppe" value="pv-1" existingGroups={['pv-1', 'pv-2']} onChange={onChange} />);

        const select = screen.getByLabelText('Gruppe');
        expect(select).toHaveValue('pv-1');
        await user.selectOptions(select, 'pv-2');

        expect(onChange).toHaveBeenCalledWith('pv-2');
    });

    it('reveals a text input for a new group and commits it on blur', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<GroupIdPicker ariaLabel="Gruppe" value="" existingGroups={['pv-1']} onChange={onChange} />);

        await user.selectOptions(screen.getByLabelText('Gruppe'), '__new__');
        const input = screen.getByLabelText('Gruppe');
        await user.type(input, 'neue-gruppe');
        await user.tab();

        expect(onChange).toHaveBeenCalledWith('neue-gruppe');
    });

    it('does not call onChange when the new-group input is left blank', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<GroupIdPicker ariaLabel="Gruppe" value="" existingGroups={[]} onChange={onChange} />);

        await user.selectOptions(screen.getByLabelText('Gruppe'), '__new__');
        await user.tab();

        expect(onChange).not.toHaveBeenCalled();
    });

    it('commits the new group on Enter without needing a blur', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<GroupIdPicker ariaLabel="Gruppe" value="" existingGroups={[]} onChange={onChange} />);

        await user.selectOptions(screen.getByLabelText('Gruppe'), '__new__');
        await user.type(screen.getByLabelText('Gruppe'), 'sofort{Enter}');

        expect(onChange).toHaveBeenCalledWith('sofort');
    });

    it('shows validation errors for an overly long new group ID', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<GroupIdPicker ariaLabel="Gruppe" value="" existingGroups={[]} onChange={onChange} />);

        await user.selectOptions(screen.getByLabelText('Gruppe'), '__new__');
        await user.type(screen.getByLabelText('Gruppe'), 'a'.repeat(129));
        await user.tab();

        expect(screen.getByRole('alert')).toHaveTextContent('maximal 128');
        expect(onChange).not.toHaveBeenCalled();
    });
});
