module.exports = {
    env: {
        es2022: true,
        node: true,
        browser: true,
    },
    extends: ['eslint:recommended'],
    parserOptions: {
        ecmaVersion: 'latest',
    },
    ignorePatterns: ['dist/', 'node_modules/', 'src-admin/', 'admin/custom/'],
    rules: {
        'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
        'no-undef': 'error',
    },
    overrides: [
        {
            files: ['test/**/*.js'],
            env: { mocha: true },
        },
    ],
};
