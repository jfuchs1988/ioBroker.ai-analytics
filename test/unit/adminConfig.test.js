const { expect } = require('chai');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SPONSOR_URL = 'https://github.com/sponsors/jfuchs1988';

describe('admin configuration links and model discovery', () => {
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

    it('shows GitHub Sponsors on every JSON configuration tab', () => {
        const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'admin', 'jsonConfig.json'), 'utf8'));
        const tabs = Object.values(config.items).filter((item) => item.type === 'panel');

        for (const tab of tabs) {
            expect(JSON.stringify(tab)).to.include(SPONSOR_URL);
        }
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
