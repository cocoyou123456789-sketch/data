const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');

function loadWorkbench() {
  const elements = new Map();
  const fakeElement = () => ({
    value: '', files: [], hidden: false, textContent: '', className: '', innerHTML: '',
    onclick: null, onchange: null, onsubmit: null, parentNode: { insertBefore() {} },
    addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; },
  });
  global.document = {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, fakeElement());
      return elements.get(selector);
    },
    createElement() { return fakeElement(); },
  };
  global.URL = { createObjectURL() { return 'blob:test'; }, revokeObjectURL() {} };
  global.Blob = class {};
  const root = path.join(__dirname, '..', 'github-pages');
  let source = fs.readFileSync(path.join(root, 'exafs-fit.js'), 'utf8');
  source += '\nglobalThis.__fitCore={numbers,dft,equationValue};';
  vm.runInThisContext(source, { filename: 'exafs-fit.js' });
  source = fs.readFileSync(path.join(root, 'exafs-online.js'), 'utf8');
  source += '\nglobalThis.__onlineCore={preprocessEnergy,polynomialFit,morletMap};';
  vm.runInThisContext(source, { filename: 'exafs-online.js' });
  return elements;
}

const elements = loadWorkbench();

test('energy preprocessing produces normalized spectrum and monotonic k', () => {
  const values = {
    '#energy-col': '0', '#mu-col': '1', '#energy-unit': 'eV', '#energy-e0': '7200',
    '#pre1': '-150', '#pre2': '-30', '#norm1': '80', '#norm2': '300',
  };
  for (const [selector, value] of Object.entries(values)) document.querySelector(selector).value = value;
  const lines = [];
  for (let energy = 7000; energy <= 7600; energy += 2) {
    const baseline = 0.0002 * (energy - 7000);
    const step = energy >= 7200 ? 1 + 0.0003 * (energy - 7200) : 0;
    const oscillation = energy > 7200 ? 0.05 * Math.sin(Math.sqrt((energy - 7200) / 3.80998212) * 4) : 0;
    lines.push(`${energy} ${baseline + step + oscillation}`);
  }
  const result = __onlineCore.preprocessEnergy(lines.join('\n'));
  assert.equal(result.e0, 7200);
  assert.ok(result.edgeStep > 0.9 && result.edgeStep < 1.1);
  assert.ok(result.k.length > 100);
  assert.ok(result.k.every((value, index) => index === 0 || value > result.k[index - 1]));
  assert.ok(result.normalized.every(Number.isFinite));
});

test('Morlet diagnostic exports finite R by k matrices', () => {
  const k = Array.from({ length: 121 }, (_, i) => 2 + i * 0.1);
  const signal = k.map(value => Math.sin(4 * value) * Math.exp(-0.01 * value * value));
  const wavelet = __onlineCore.morletMap(k, signal, 6, 32, 24);
  assert.equal(wavelet.k.length, 32);
  assert.equal(wavelet.r.length, 24);
  assert.equal(wavelet.magnitude.length, 24);
  assert.ok(wavelet.magnitude.flat().every(Number.isFinite));
});
