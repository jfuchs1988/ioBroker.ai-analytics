const { expect } = require('chai');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const DOCUMENTATION_ROOTS = [
    'README.md',
    'README.de.md',
    'CHANGELOG.md',
    'CONTRIBUTING.md',
    'WORKLOG.md',
    'LICENSES',
    'docs/README.md',
    'docs/roadmap.md',
    'docs/agents',
    'docs/architecture',
    'docs/adr',
    'docs/plans',
    'docs/specs',
];

function markdownFiles(target) {
    const absolute = path.join(ROOT, target);
    if (!fs.statSync(absolute).isDirectory()) return [absolute];
    return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
        const child = path.join(absolute, entry.name);
        if (entry.isDirectory()) return markdownFiles(path.relative(ROOT, child));
        return entry.name.endsWith('.md') ? [child] : [];
    });
}

function relativeLinks(content) {
    const withoutCode = content.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
    return [...withoutCode.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)]
        .map((match) => match[1].trim().replace(/^<|>$/g, ''))
        .filter((target) => target && !/^(?:https?:|mailto:)/i.test(target));
}

function headingAnchors(content) {
    const anchors = new Set();
    const occurrences = new Map();
    for (const match of content.matchAll(/^#{1,6}\s+(.+)$/gm)) {
        const base = match[1]
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/[`*_~]/g, '')
            .trim()
            .toLowerCase()
            .replace(/[^\p{L}\p{N}\s-]/gu, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-');
        const occurrence = occurrences.get(base) || 0;
        anchors.add(occurrence ? `${base}-${occurrence}` : base);
        occurrences.set(base, occurrence + 1);
    }
    return anchors;
}

describe('documentation', () => {
    it('keeps relative links in maintained documents valid', () => {
        const missing = [];
        for (const file of DOCUMENTATION_ROOTS.flatMap(markdownFiles)) {
            const content = fs.readFileSync(file, 'utf8');
            for (const link of relativeLinks(content)) {
                const [rawTarget, fragment] = link.split('#', 2);
                const target = decodeURIComponent(rawTarget.split('?', 1)[0]);
                const resolved = target ? path.resolve(path.dirname(file), target) : file;
                if (!fs.existsSync(resolved)) {
                    missing.push(`${path.relative(ROOT, file)} -> ${link}`);
                } else if (fragment && fs.statSync(resolved).isFile()) {
                    const anchors = headingAnchors(fs.readFileSync(resolved, 'utf8'));
                    if (!anchors.has(decodeURIComponent(fragment).toLowerCase())) {
                        missing.push(`${path.relative(ROOT, file)} -> ${link}`);
                    }
                }
            }
        }
        expect(missing, `missing relative links:\n${missing.join('\n')}`).to.deep.equal([]);
    });

    it('does not hard-code a current version in readme status sections', () => {
        for (const file of ['README.md', 'README.de.md']) {
            const status = fs.readFileSync(path.join(ROOT, file), 'utf8').split(/^## Status$/m)[1] || '';
            expect(status).not.to.match(/\b\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\b/);
        }
    });

    it('keeps package versions synchronized', () => {
        const packageJson = require('../../package.json');
        const packageLock = require('../../package-lock.json');
        const ioPackage = require('../../io-package.json');
        expect(packageLock.version).to.equal(packageJson.version);
        expect(packageLock.packages[''].version).to.equal(packageJson.version);
        expect(ioPackage.common.version).to.equal(packageJson.version);
    });

    it('keeps durable agent context free of volatile counts and beta patches', () => {
        for (const file of markdownFiles('docs/agents')) {
            const content = fs.readFileSync(file, 'utf8');
            expect(content, path.relative(ROOT, file)).not.to.match(/\b\d+\s+Unit-Tests\b/i);
            expect(content, path.relative(ROOT, file)).not.to.match(/\b0\.0\.\d+-beta\.\d+\b/);
        }
    });

    it('keeps sponsor-required inventory and source headers aligned', () => {
        const terms = fs.readFileSync(path.join(ROOT, 'LICENSES/SPONSOR-REQUIRED.md'), 'utf8');
        const componentSection = terms.split('## Sponsoring terms', 1)[0];
        const entries = [...componentSection.matchAll(/^- `([^`]+)`/gm)].map((match) => match[1]);
        const coveredFiles = entries.flatMap((entry) => {
            const absolute = path.join(ROOT, entry);
            if (!entry.endsWith('/')) return [absolute];
            return fs.readdirSync(absolute, { withFileTypes: true })
                .filter((item) => item.isFile() && item.name.endsWith('.js'))
                .map((item) => path.join(absolute, item.name));
        });
        const missingHeaders = coveredFiles
            .filter((file) => !fs.readFileSync(file, 'utf8').includes('Sponsor-required component.'))
            .map((file) => path.relative(ROOT, file));
        const unlistedHeaders = fs.readdirSync(path.join(ROOT, 'lib'), { recursive: true, withFileTypes: true })
            .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
            .map((entry) => path.join(entry.parentPath, entry.name))
            .filter((file) => fs.readFileSync(file, 'utf8').includes('Sponsor-required component.'))
            .filter((file) => !coveredFiles.includes(file))
            .map((file) => path.relative(ROOT, file));

        expect(entries).not.to.deep.equal([]);
        expect(missingHeaders, 'listed components without source header').to.deep.equal([]);
        expect(unlistedHeaders, 'source headers missing from license inventory').to.deep.equal([]);
    });
});
