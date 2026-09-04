const { expect } = require('chai');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadHelpers() {
    const filename = path.resolve(__dirname, '..', '..', 'src-admin', 'src', 'Components.jsx');
    const source = fs.readFileSync(filename, 'utf8');
    const helpers = source
        .slice(source.indexOf('const CATEGORIES'), source.indexOf('export class ProviderSelectComponent'))
        .replace(/^export /gm, '');
    const context = { module: { exports: {} } };
    vm.runInNewContext(
        `${helpers}\nmodule.exports = { csvEscape, parseCsv, normalizeHeader, validateFile, parseBoolean, validateCatalogImportValue, validateSettingImportValue };`,
        context,
        { filename }
    );
    return context.module.exports;
}

const {
    csvEscape,
    parseCsv,
    normalizeHeader,
    validateFile,
    parseBoolean,
    validateCatalogImportValue,
    validateSettingImportValue,
} = loadHelpers();

describe('admin CSV helpers', () => {
    it('neutralizes spreadsheet formulas before CSV escaping', () => {
        expect(csvEscape('=HYPERLINK("https://example.invalid")')).to.equal(`"'=HYPERLINK(""https://example.invalid"")"`);
        expect(csvEscape('  +1+1')).to.equal("'  +1+1");
        expect(csvEscape('ordinary')).to.equal('ordinary');
    });

    it('normalizes BOM and whitespace and rejects duplicate headers', () => {
        expect(normalizeHeader(['\uFEFF sourceId ', ' category '])).to.deep.equal(['sourceId', 'category']);
        expect(() => normalizeHeader(['sourceId', ' sourceId '])).to.throw('doppelte');
    });

    it('rejects malformed and oversized CSV fields', () => {
        expect(() => parseCsv('sourceId,description\na,"unterminated')).to.throw('nicht geschlossen');
        expect(() => parseCsv(`sourceId,description\na,${'x'.repeat(4097)}`)).to.throw('überschreitet');
    });

    it('enforces CSV file and row limits', () => {
        expect(() => validateFile({ size: 5 * 1024 * 1024 + 1 })).to.throw('5 MB');
        expect(() => parseCsv(Array.from({ length: 10001 }, () => 'a,b').join('\n'))).to.throw('10000 Zeilen');
    });

    it('strictly validates catalog enum and boolean values', () => {
        expect(parseBoolean(' TRUE ', 'ignored')).to.equal(true);
        expect(() => parseBoolean('yes', 'ignored')).to.throw('true oder false');
        expect(validateCatalogImportValue('valueKind', 'gauge')).to.equal('gauge');
        expect(() => validateCatalogImportValue('valueKind', 'command')).to.throw('valueKind');
    });

    it('strictly validates settings numbers, booleans, and providers', () => {
        expect(validateSettingImportValue('dailyBudgetEur', '42')).to.equal(42);
        expect(validateSettingImportValue('silentIfNothingFound', 'false')).to.equal(false);
        expect(validateSettingImportValue('providerType', 'openrouter')).to.equal('openrouter');
        expect(validateSettingImportValue('providerType', 'opencode')).to.equal('opencode');
        expect(() => validateSettingImportValue('checkIntervalHours', '0')).to.throw('checkIntervalHours');
        expect(() => validateSettingImportValue('dailyBudgetEur', 'NaN')).to.throw('dailyBudgetEur');
        expect(() => validateSettingImportValue('providerType', 'unknown')).to.throw('providerType');
    });
});
