import { describe, it, expect } from 'vitest';
import {
    csvEscape,
    parseCsv,
    normalizeHeader,
    validateFile,
    parseBoolean,
    validateCatalogImportValue,
    validateSettingImportValue,
} from '../../src-admin/src/Components.jsx';

describe('admin CSV helpers', () => {
    it('neutralizes spreadsheet formulas before CSV escaping', () => {
        expect(csvEscape('=HYPERLINK("https://example.invalid")')).toBe(`"'=HYPERLINK(""https://example.invalid"")"`);
        expect(csvEscape('  +1+1')).toBe("'  +1+1");
        expect(csvEscape('ordinary')).toBe('ordinary');
    });

    it('normalizes BOM and whitespace and rejects duplicate headers', () => {
        expect(normalizeHeader(['﻿ sourceId ', ' category '])).toEqual(['sourceId', 'category']);
        expect(() => normalizeHeader(['sourceId', ' sourceId '])).toThrow('doppelte');
    });

    it('rejects malformed and oversized CSV fields', () => {
        expect(() => parseCsv('sourceId,description\na,"unterminated')).toThrow('nicht geschlossen');
        expect(() => parseCsv(`sourceId,description\na,${'x'.repeat(4097)}`)).toThrow('überschreitet');
    });

    it('enforces CSV file and row limits', () => {
        expect(() => validateFile({ size: 5 * 1024 * 1024 + 1 })).toThrow('5 MB');
        expect(() => parseCsv(Array.from({ length: 10001 }, () => 'a,b').join('\n'))).toThrow('10000 Zeilen');
    });

    it('strictly validates catalog enum and boolean values', () => {
        expect(parseBoolean(' TRUE ', 'ignored')).toBe(true);
        expect(() => parseBoolean('yes', 'ignored')).toThrow('true oder false');
        expect(validateCatalogImportValue('valueKind', 'gauge')).toBe('gauge');
        expect(() => validateCatalogImportValue('valueKind', 'command')).toThrow('valueKind');
    });

    it('strictly validates settings numbers, booleans, and providers', () => {
        expect(validateSettingImportValue('dailyBudgetEur', '42')).toBe(42);
        expect(validateSettingImportValue('silentIfNothingFound', 'false')).toBe(false);
        expect(validateSettingImportValue('providerType', 'openrouter')).toBe('openrouter');
        expect(validateSettingImportValue('providerType', 'opencode')).toBe('opencode');
        expect(() => validateSettingImportValue('checkIntervalHours', '0')).toThrow('checkIntervalHours');
        expect(() => validateSettingImportValue('dailyBudgetEur', 'NaN')).toThrow('dailyBudgetEur');
        expect(() => validateSettingImportValue('providerType', 'unknown')).toThrow('providerType');
    });
});
