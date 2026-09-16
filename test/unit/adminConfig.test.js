const { expect } = require('chai');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SPONSOR_URL = 'https://github.com/sponsors/jfuchs1988';

describe('admin configuration links and model discovery', () => {
    it('opens the settings tab by default', () => {
        const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'admin', 'jsonConfig.json'), 'utf8'));
        expect(config.defaultTab).to.equal('settingsTab');
    });
    it('uses a plain manual text field for both model fields', () => {
        const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'admin', 'jsonConfig.json'), 'utf8'));
        const settings = config.items.settingsTab ? config.items.settingsTab.items : config.items;

        for (const field of ['model', 'onboardingModel']) {
            expect(settings[field].name).to.equal('AiAnalyticsConfig/Components/ModelSelectComponent');
        }
    });

    it('offers OpenCode Zen and auto-fills its endpoint through custom provider selectors', () => {
        const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'admin', 'jsonConfig.json'), 'utf8'));
        const settings = config.items.settingsTab.items;
        expect(settings.providerType.name).to.equal('AiAnalyticsConfig/Components/ProviderSelectComponent');
        expect(settings.providerType).to.not.have.property('urlField');
        expect(settings.onboardingProviderType).to.not.have.property('urlField');
        expect(settings.onboardingProviderType.includeEmpty).to.equal(true);
        expect(fs.readFileSync(path.join(ROOT, 'src-admin', 'src', 'Components.jsx'), 'utf8')).to.include('OpenCode Zen');
        expect(fs.readFileSync(path.join(ROOT, 'src-admin', 'src', 'Components.jsx'), 'utf8')).to.include('https://opencode.ai/zen/v1');
    });

    it('exposes configurable safe workload limits', () => {
        const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'admin', 'jsonConfig.json'), 'utf8'));
        const settings = config.items.settingsTab.items;
        expect(settings.maxToolCalls.max).to.equal(128);
        expect(settings.maxPeriodsPerRequest.max).to.equal(1024);
        expect(settings.maxPeriodsPerToolCall.max).to.equal(120);
    });

    it('provides a token counter reset component', () => {
        const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'admin', 'jsonConfig.json'), 'utf8'));
        expect(config.items.settingsTab.items.usageReset.name).to.equal('AiAnalyticsConfig/Components/UsageResetComponent');
    });

    it('exposes activation without allowing the backend URL to be changed', () => {
        const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'admin', 'jsonConfig.json'), 'utf8'));
        const settings = config.items.settingsTab.items;
        expect(settings.licenseBackendUrl).to.equal(undefined);
        expect(settings.licenseToken).to.equal(undefined);
        expect(settings.licenseActivation.name).to.equal('AiAnalyticsConfig/Components/LicenseActivationComponent');
        expect(fs.readFileSync(path.join(ROOT, 'lib', 'adminBridge.js'), 'utf8')).to.include('clearLicenseToken');
        const component = fs.readFileSync(path.join(ROOT, 'src-admin', 'src', 'Components.js'), 'utf8');
        const activation = fs.readFileSync(path.join(ROOT, 'src-admin', 'src', 'Components.jsx'), 'utf8');
        expect(component).to.include('LicenseActivationComponent');
        expect(activation).to.include('waitForActivation');
        expect(activation).to.include('Token erfolgreich gespeichert');
    });

    it('provides the required size for the onboarding section header', () => {
        const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'admin', 'jsonConfig.json'), 'utf8'));
        expect(config.items.settingsTab.items.onboardingHeader.size).to.equal(3);
    });

    it('uses the streamlined settings layout and exposes the How To tab', () => {
        const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'admin', 'jsonConfig.json'), 'utf8'));
        const settings = config.items.settingsTab.items;
        expect(settings.settingsCsv).to.equal(undefined);
        expect(settings.apiKey.label).to.equal('API-Key Chat & Prüfung');
        expect(Object.keys(settings).indexOf('apiKey')).to.be.greaterThan(Object.keys(settings).indexOf('model'));
        expect(Object.keys(settings).indexOf('onboardingApiKey')).to.be.greaterThan(Object.keys(settings).indexOf('onboardingModel'));
        expect(settings.maxAgentIterations.default).to.equal(32);
        expect(settings.maxToolCalls.default).to.equal(128);
        expect(settings.maxPeriodsPerRequest.default).to.equal(1024);
        expect(settings.maxPeriodsPerToolCall.default).to.equal(120);
        expect(config.items.howToTab.items.howToContent.name).to.equal('AiAnalyticsConfig/Components/HowToComponent');
        expect(fs.readFileSync(path.join(ROOT, 'src-admin', 'src', 'Components.js'), 'utf8')).to.include('HowToComponent');
    });

    it('links OpenRouter, OpenCode Zen, and GitHub Sponsors from the configuration', () => {
        const configText = fs.readFileSync(path.join(ROOT, 'admin', 'jsonConfig.json'), 'utf8');

        expect(configText).to.include('https://openrouter.ai/settings/keys');
        expect(configText).to.include('https://opencode.ai/auth');
        expect(configText).to.include(SPONSOR_URL);
    });

    it('keeps the catalog editor in its own adapter settings tab', () => {
        const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'admin', 'jsonConfig.json'), 'utf8'));
        expect(Object.keys(config.items)).to.deep.equal(['settingsTab', 'howToTab', 'catalogTab']);
        expect(config.items.catalogTab.label).to.equal('Historisierte Datenpunkte');
        expect(config.items.catalogTab.items.catalogDevices.name).to.equal('AiAnalyticsConfig/Components/CatalogDevicesComponent');
    });

    it('shows the sponsor link globally in the custom tab', () => {
        const html = fs.readFileSync(path.join(ROOT, 'admin', 'tab.html'), 'utf8');
        const navEnd = html.indexOf('</div>', html.indexOf('<div id="nav">'));
        const sponsorPosition = html.indexOf(SPONSOR_URL);

        expect(sponsorPosition).to.be.greaterThan(html.indexOf('<div id="nav">'));
        expect(sponsorPosition).to.be.lessThan(navEnd);
    });

    it('shows a thinking status while the chat request is running', () => {
        const html = fs.readFileSync(path.join(ROOT, 'admin', 'tab.html'), 'utf8');
        expect(html).to.include('id="chat-thinking"');
        expect(html).to.include('Denkt nach');
        expect(html).to.include('id="chat-thinking-progress"');
    });

    it('declares GitHub Sponsors funding metadata', () => {
        const funding = fs.readFileSync(path.join(ROOT, '.github', 'FUNDING.yml'), 'utf8');
        const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

        expect(funding).to.include('github: [jfuchs1988]');
        expect(packageJson.funding).to.equal(SPONSOR_URL);
    });
});
