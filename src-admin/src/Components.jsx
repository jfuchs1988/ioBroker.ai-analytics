import React from 'react';
import { ConfigGeneric } from '@iobroker/json-config';
import CatalogDevicesComponent from './CatalogDevices/CatalogDevicesComponent.jsx';
import {
    csvEscape,
    parseCsv,
    normalizeHeader,
    validateFile,
    parseBoolean,
    validateCatalogImportValue,
} from './csvHelpers.js';

export { csvEscape, parseCsv, normalizeHeader, validateFile, parseBoolean, validateCatalogImportValue };

const SETTINGS_COLUMNS = [
    'providerType', 'baseUrl', 'model', 'apiKey',
    'chatPricePerMillionInputTokens', 'chatPricePerMillionOutputTokens',
    'onboardingProviderType', 'onboardingBaseUrl', 'onboardingModel', 'onboardingApiKey',
    'onboardingPricePerMillionInputTokens', 'onboardingPricePerMillionOutputTokens',
    'checkIntervalHours', 'dailyBudgetEur', 'maxAgentIterations', 'maxToolCalls', 'maxPeriodsPerRequest', 'maxPeriodsPerToolCall', 'silentIfNothingFound', 'enableValueKindBackfill', 'enableDataQualityBackfill',
];
const SETTINGS_NUMBER_COLUMNS = new Set([
    'chatPricePerMillionInputTokens', 'chatPricePerMillionOutputTokens',
    'onboardingPricePerMillionInputTokens', 'onboardingPricePerMillionOutputTokens',
    'checkIntervalHours', 'dailyBudgetEur', 'maxAgentIterations', 'maxToolCalls', 'maxPeriodsPerRequest', 'maxPeriodsPerToolCall',
]);
const SETTINGS_BOOLEAN_COLUMNS = new Set(['silentIfNothingFound', 'enableValueKindBackfill', 'enableDataQualityBackfill']);
const SETTINGS_SECRET_COLUMNS = new Set(['apiKey', 'onboardingApiKey']);
const PROVIDER_TYPES = new Set(['anthropic', 'openai', 'openrouter', 'opencode', 'local']);
const OPENCODE_ZEN_BASE_URL = 'https://opencode.ai/zen/v1';
const OPENCODE_ZEN_MODELS = ['mimo-v2.5-free', 'ling-3.0-flash-fin-free', 'nemotron-3-ultra-free', 'nemotron-3.5-lightning-free', 'muse-spark-1.3-contributor-free', 'muse-spark-1.2-contributor-free'];
const MAX_CSV_FIELD_LENGTH = 4096;

export function validateSettingImportValue(key, rawValue) {
    if (rawValue.length > MAX_CSV_FIELD_LENGTH) throw new Error(`${key} ist zu lang.`);
    let value = rawValue;
    if (SETTINGS_NUMBER_COLUMNS.has(key)) {
        value = value === '' ? 0 : Number(value);
        if (!Number.isFinite(value) || value < 0 || (key === 'checkIntervalHours' && value < 1)) {
            throw new Error(`${key} enthält keine gültige nicht-negative Zahl.`);
        }
    }
    if (SETTINGS_BOOLEAN_COLUMNS.has(key)) value = parseBoolean(value, key);
    if (key === 'providerType' && !PROVIDER_TYPES.has(value)) throw new Error(`Ungültiger providerType: ${value}`);
    if (key === 'onboardingProviderType' && value !== '' && !PROVIDER_TYPES.has(value)) throw new Error(`Ungültiger onboardingProviderType: ${value}`);
    return value;
}

export class ProviderSelectComponent extends ConfigGeneric {
    renderItem() {
        const value = (this.props.data && this.props.data[this.props.attr]) || '';
        const options = [ ...(this.props.schema.includeEmpty ? [['', 'Wie oben (Chat/Pruefung)']] : []), ['anthropic', 'Anthropic'], ['openai', 'OpenAI'], ['openrouter', 'OpenRouter'], ['opencode', 'OpenCode Zen'], ['local', 'Lokal (OpenAI-kompatibel)'] ];
        return <select value={value} aria-label={this.props.schema.label || 'LLM-Provider'} onChange={async event => {
            const next = event.target.value;
            await this.onChange(this.props.attr, next);
            if (next === 'opencode' && this.props.schema.urlField) await this.onChange(this.props.schema.urlField, OPENCODE_ZEN_BASE_URL);
        }}>{options.map(([optionValue, label]) => <option key={optionValue} value={optionValue}>{label}</option>)}</select>;
    }
}

export class ModelSelectComponent extends ConfigGeneric {
    renderItem() {
        const value = (this.props.data && this.props.data[this.props.attr]) || '';
        const isPreset = OPENCODE_ZEN_MODELS.includes(value);
        return <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <select aria-label="Modellvorschläge" value={isPreset ? value : '__custom__'} onChange={event => {
                if (event.target.value !== '__custom__') this.onChange(this.props.attr, event.target.value);
            }}>
                <option value="__custom__">Benutzerdefiniertes Modell</option>
                {OPENCODE_ZEN_MODELS.map(model => <option key={model} value={model}>{model}</option>)}
            </select>
            <input aria-label={this.props.schema.label || 'Modell'} value={value} placeholder="Modellname frei eingeben" onChange={event => this.onChange(this.props.attr, event.target.value)} />
        </div>;
    }
}

export class UsageResetComponent extends ConfigGeneric {
    async reset() {
        if (!window.confirm('Tokenzähler und Kostenhistorie wirklich zurücksetzen?')) return;
        const socket = this.props.socket || this.props.oContext.socket;
        const instance = `ai-analytics.${this.props.oContext.instance}`;
        const requestId = `usage-reset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        await socket.setState(`${instance}.admin.bridge`, { val: JSON.stringify({ id: requestId, command: 'resetUsage', message: {} }), ack: false });
        const deadline = Date.now() + 60000;
        while (Date.now() < deadline) {
            const state = await socket.getState(`${instance}.admin.bridge`);
            if (state && state.ack === true && typeof state.val === 'string') {
                const response = JSON.parse(state.val);
                if (response.id === requestId) {
                    if (!response.ok) throw new Error(response.error || 'Zurücksetzen fehlgeschlagen.');
                    this.setState({ status: 'Tokenzähler und Kostenhistorie wurden zurückgesetzt.' });
                    return;
                }
            }
            await new Promise(resolve => setTimeout(resolve, 400));
        }
        throw new Error('Keine Antwort beim Zurücksetzen.');
    }

    renderItem() {
        return <div>
            <button onClick={() => this.reset().catch(error => this.setState({ status: `Fehler: ${error.message}` }))}>Tokenzähler zurücksetzen</button>
            <span role="status" aria-live="polite" style={{ marginLeft: 8 }}>{this.state.status || 'Setzt usage.today und usage.history zurück.'}</span>
        </div>;
    }
}

export class SettingsCsvComponent extends ConfigGeneric {
    constructor(props) {
        super(props);
        this.state = { ...this.state, status: '' };
        this.fileInputRef = React.createRef();
    }

    exportCsv() {
        const data = this.props.data || {};
        const lines = [SETTINGS_COLUMNS.join(',')];
        lines.push(SETTINGS_COLUMNS.map(key => csvEscape(SETTINGS_SECRET_COLUMNS.has(key) ? '' : data[key])).join(','));
        const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `ai-analytics-settings-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    async handleFileSelected(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        try {
            validateFile(file);
            const rows = parseCsv(await file.text());
            if (rows.length < 2) {
                this.setState({ status: 'Fehler: Settings-CSV enthält keine Datenzeile.' });
                return;
            }
            if (rows.length > 2) throw new Error('Settings-CSV darf nur eine Datenzeile enthalten.');
            const header = normalizeHeader(rows[0]);
            const values = rows[1];
            const importedValues = [];
            let imported = 0;
            SETTINGS_COLUMNS.forEach(key => {
                const index = header.indexOf(key);
                if (index === -1 || values[index] === undefined) return;
                if (SETTINGS_SECRET_COLUMNS.has(key)) return;
                const value = validateSettingImportValue(key, values[index]);
                importedValues.push([key, value]);
                imported++;
            });
            for (const [key, value] of importedValues) {
                await this.onChangeAsync(key, value);
            }
            this.setState({ status: `${imported} Settings importiert. Bitte mit Speichern übernehmen.` });
        } catch (error) {
            this.setState({ status: `Fehler: ${error.message || error}` });
        }
    }

    renderItem() {
        return <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => this.exportCsv()}>Settings als CSV exportieren</button>
            <button onClick={() => {
                if (this.fileInputRef.current) {
                    this.fileInputRef.current.value = '';
                    this.fileInputRef.current.click();
                }
            }}>Settings aus CSV importieren</button>
            <input ref={this.fileInputRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={event => this.handleFileSelected(event)} />
            <span role="status" aria-live="polite">{this.state.status}</span>
        </div>;
    }
}

export default CatalogDevicesComponent;
