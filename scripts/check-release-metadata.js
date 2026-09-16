const fs = require('node:fs');

const ioPackage = JSON.parse(fs.readFileSync('io-package.json', 'utf8'));
const news = ioPackage.common?.news;
const versions = news && Object.keys(news);

if (!versions || versions.length > 7) {
    throw new Error(`io-package.json common.news must contain at most 7 entries (found ${versions?.length ?? 0}).`);
}

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
if (ioPackage.common.version !== packageJson.version || !news[packageJson.version]) {
    throw new Error('package.json and io-package.json versions/news are out of sync.');
}

console.log(`Release metadata valid: ${packageJson.version}, ${versions.length} news entries.`);
