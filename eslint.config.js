const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
    {
        ignores: ['dist/', 'node_modules/', 'src-admin/', 'admin/custom/'],
    },
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 'latest',
            globals: {
                ...globals.es2022,
                ...globals.node,
                ...globals.browser,
            },
        },
        rules: {
            'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
            'no-undef': 'error',
        },
    },
    {
        files: ['test/**/*.js'],
        languageOptions: {
            globals: {
                ...globals.mocha,
            },
        },
    },
];
