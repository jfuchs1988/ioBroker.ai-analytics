import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProviderSelectComponent } from '../../src-admin/src/Components.jsx';

function baseOContext() {
    return {
        hostInfo: {},
        themeType: 'light',
        adapterName: 'ai-analytics',
        instance: 0,
        socket: {},
    };
}

describe('ProviderSelectComponent', () => {
    it('renders the current provider and reports a change', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn().mockResolvedValue(undefined);

        render(
            <ProviderSelectComponent
                schema={{ label: 'LLM-Provider' }}
                data={{ providerType: 'anthropic' }}
                attr="providerType"
                onChange={onChange}
                onError={() => {}}
                oContext={baseOContext()}
            />
        );

        const select = await screen.findByLabelText('LLM-Provider');
        expect(select).toHaveValue('anthropic');

        await user.selectOptions(select, 'openrouter');

        await waitFor(() => {
            expect(onChange).toHaveBeenCalledWith({ providerType: 'openrouter' }, undefined, expect.any(Function));
        });
    });

    it('sets the OpenCode Zen base URL when opencode is selected via the urlField', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn().mockResolvedValue(undefined);

        render(
            <ProviderSelectComponent
                schema={{ label: 'LLM-Provider', urlField: 'baseUrl' }}
                data={{ providerType: 'anthropic' }}
                attr="providerType"
                onChange={onChange}
                onError={() => {}}
                oContext={baseOContext()}
            />
        );

        const select = await screen.findByLabelText('LLM-Provider');
        await user.selectOptions(select, 'opencode');

        await waitFor(() => {
            expect(onChange).toHaveBeenCalledWith({ providerType: 'opencode' }, undefined, expect.any(Function));
        });
        await waitFor(() => {
            expect(onChange).toHaveBeenCalledWith({ providerType: 'anthropic', baseUrl: 'https://opencode.ai/zen/v1' }, undefined, expect.any(Function));
        });
    });
});
