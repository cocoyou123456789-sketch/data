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

test('connection failure directs users to the packaged bridge', () => {
  assert.match(source, /下载安装本机桥接器/);
  assert.match(source, /源码开发环境才需要运行 start-native-bridge\.ps1/);
});

test('native status distinguishes installation from running processes', () => {
  assert.match(source, /item\.running \? '正在运行'/);
  assert.match(source, /process_ids/);
  assert.match(source, /xafs-native-status/);
  assert.match(html, /id="bridge-health"/);
});

test('workbench exposes staged navigation and sample amplitude roles', () => {
  assert.match(html, /data-scroll-target="native-panel"/);
  assert.match(html, /data-scroll-target="result-dashboard"/);
  assert.match(html, /id="analysis-role"/);
  assert.match(html, /晶体标准样：固定 N，拟合 S₀²/);
  assert.match(html, /未知样：固定 S₀²，拟合 N/);
  assert.match(html, /exafs-workbench\.js/);
});
