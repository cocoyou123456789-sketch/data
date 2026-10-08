const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..', 'github-pages');
const html = fs.readFileSync(path.join(root, 'exafs-fit.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'exafs-native.js'), 'utf8');

test('native Demeter mode is the default and browser mode is explicitly labelled', () => {
  assert.match(html, /option value="native" selected/);
  assert.match(html, /option value="browser">[^<]*非 Demeter/);
  assert.match(html, /exafs-native\.js/);
});

test('native client uses fixed bridge routes and paper fit weights', () => {
  assert.match(source, /127\.0\.0\.1:8766/);
  assert.match(source, /\/api\/native-tools\/\$\{tool\}\/launch/);
  assert.match(source, /final_kweights: \[1, 2, 3\]/);
  assert.match(source, /stopImmediatePropagation/);
});

test('page offers installable and portable bridge downloads', () => {
  assert.match(html, /releases\/latest\/download\/XAFS-Native-Bridge-Setup\.exe/);
  assert.match(html, /releases\/latest\/download\/XAFS-Native-Bridge-Portable\.zip/);
});
