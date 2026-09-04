const { expect } = require('chai');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/**
 * SettingsCsvComponent.renderItem() contains JSX, which plain `vm` cannot parse.
 * We slice out only the JSX-free parts (helper consts/functions + the
 * SettingsCsvComponent constructor/exportCsv/handleFileSelected methods) and
 * evaluate them against a mock ConfigGeneric base class, mirroring the
 * extraction approach already used in adminComponents.test.js.
 */
function loadSettingsCsvComponent() {
    const filename = path.resolve(__dirname, '..', '..', 'src-admin', 'src', 'Components.jsx');
    const source = fs.readFileSync(filename, 'utf8');
    const helpers = source
        .slice(source.indexOf('const CATEGORIES'), source.indexOf('export class ProviderSelectComponent'))
        .replace(/^export /gm, '');
    const classStart = source.indexOf('export class SettingsCsvComponent');
    const classBody = source
        .slice(classStart, source.indexOf('renderItem() {', classStart))
        .replace(/^export /, '')
        .concat('}');

    const context = {
        module: { exports: {} },
        React: { createRef: () => ({ current: null }) },
        ConfigGeneric: class {
            constructor(props) {
                this.props = props;
                this.state = {};
            }
            setState(patch) {
                Object.assign(this.state, patch);
            }
        },
    };
    vm.createContext(context);
    vm.runInContext(`${helpers}\n${classBody}\nmodule.exports = { SettingsCsvComponent };`, context, { filename });
    return context.module.exports.SettingsCsvComponent;
}

const SettingsCsvComponent = loadSettingsCsvComponent();

/**
 * Mirrors the real @iobroker/json-config framework behaviour for `type: "custom"`
 * widgets: `onChange(attr, value, cb)` resolves its returned promise immediately
 * (see ConfigGeneric.js `async onChange()`, which ends with `return Promise.resolve()`
 * without awaiting `cb`), while the actual merge into `props.data` only happens
 * later, when `cb` fires. `onChangeAsync` is the variant that actually awaits `cb`.
 * A component that awaits plain `onChange` in a loop therefore fires the next call
 * before the previous change has landed, so each call captures a stale snapshot of
 * `props.data` and overwrites the merge target once its own `cb` fires later.
 */
function makeAdapter(initialData) {
    let data = { ...initialData };
    const applyOrder = [];
    return {
        get data() {
            return data;
        },
        onChange(attr, newValue, cb) {
            const staleBase = { ...data };
            setTimeout(() => {
                data = { ...staleBase, [attr]: newValue };
                applyOrder.push(attr);
                cb && cb();
            }, 0);
            return Promise.resolve();
        },
        onChangeAsync(attr, newValue) {
            return new Promise(resolve => this.onChange(attr, newValue, resolve));
        },
        applyOrder,
    };
}

function makeComponent(adapter) {
    const component = new SettingsCsvComponent({ data: adapter.data });
    component.onChange = adapter.onChange.bind(adapter);
    component.onChangeAsync = adapter.onChangeAsync.bind(adapter);
    return component;
}

describe('SettingsCsvComponent settings import', () => {
    it('applies every imported settings column, not just the last one', async () => {
        const adapter = makeAdapter({
            checkIntervalHours: 24,
            dailyBudgetEur: 0,
            maxAgentIterations: 8,
            maxToolCalls: 32,
        });
        const component = makeComponent(adapter);
        const file = {
            text: async () =>
                'checkIntervalHours,dailyBudgetEur,maxAgentIterations,maxToolCalls\n48,999,7,31\n',
        };

        await component.handleFileSelected({ target: { files: [file] } });
        // Let the mock framework's deferred `cb` (macrotask) callbacks settle,
        // mirroring the real ConfigGeneric state update happening after onChange returns.
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(adapter.data).to.deep.equal({
            checkIntervalHours: 48,
            dailyBudgetEur: 999,
            maxAgentIterations: 7,
            maxToolCalls: 31,
        });
        expect(component.state.status).to.equal('4 Settings importiert. Bitte mit Speichern übernehmen.');
    });
});
