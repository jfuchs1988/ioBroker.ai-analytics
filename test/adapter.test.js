// test/adapter.test.js
const path = require('path');
const { tests } = require('@iobroker/testing');

tests.unit(path.join(__dirname, '..'), {
    allowedExitCodes: [11],
});
