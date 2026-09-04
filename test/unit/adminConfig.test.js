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
            expect(settings[field].type).to.equal('text');
        }
    });

    it('provides the required size for the onboarding section header', () => {
        const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'admin', 'jsonConfig.json'), 'utf8'));
        expect(config.items.settingsTab.items.onboardingHeader.size).to.equal(3);
    });

    it('links OpenRouter, OpenCode Zen, and GitHub Sponsors from the configuration', () => {
        const configText = fs.readFileSync(path.join(ROOT, 'admin', 'jsonConfig.json'), 'utf8');

        expect(configText).to.include('https://openrouter.ai/settings/keys');
        expect(configText).to.include('https://opencode.ai/auth');
        expect(configText).to.include(SPONSOR_URL);
    });

    it('keeps the catalog editor in its own adapter settings tab', () => {
        const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'admin', 'jsonConfig.json'), 'utf8'));
        expect(Object.keys(config.items)).to.deep.equal(['settingsTab', 'catalogTab']);
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

    it('declares GitHub Sponsors funding metadata', () => {
        const funding = fs.readFileSync(path.join(ROOT, '.github', 'FUNDING.yml'), 'utf8');
        const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

        expect(funding).to.include('github: [jfuchs1988]');
        expect(packageJson.funding).to.equal(SPONSOR_URL);
    });
});
