const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const page = name => fs.readFileSync(path.join(__dirname, '..', 'github-pages', name), 'utf8');
const exafsHtml = page('exafs-fit.html');
const exafsJs = page('exafs-fit.js');
const xpsHtml = page('xps-fit.html');
const xpsJs = page('xps-fit.js');

test('EXAFS workbench is explicitly limited to literature-constrained first-shell fitting', () => {
  assert.match(exafsHtml, /第一配位层拟合标准（仅首壳）/);
  assert.match(exafsHtml, /nleg=2/);
  assert.match(exafsHtml, /严禁第二配位层和多重散射进入模型/);
  assert.match(exafsHtml, /S₀²=0\.75–1\.20/);
  assert.match(exafsHtml, /本区仅说明第一配位层模型/);
  assert.match(exafsHtml, /10\.1021\/photonsci\.5c00040/);
  assert.match(exafsHtml, /10\.1016\/j\.jcat\.2025\.116145/);
  assert.match(exafsJs, /if\(nleg!==2\)throw new Error/);
  assert.doesNotMatch(exafsJs, /shell2-equation-panel/);
});

test('XPS workbench exposes Gaussian/Lorentzian choices and defensible FWHM policies', () => {
  assert.match(xpsHtml, /<option value="gaussian">Gaussian<\/option>/);
  assert.match(xpsHtml, /<option value="lorentzian">Lorentzian<\/option>/);
  assert.match(xpsHtml, /同批同元素：容差联动/);
  assert.match(xpsHtml, /同一元素不同化学态的 FWHM 宜保持相近/);
  assert.match(xpsJs, /function applyWidthPolicy/);
  assert.match(xpsJs, /fwhm_policy/);
});

test('XPS background audit blocks over- and under-subtracted baselines', () => {
  assert.match(xpsJs, /function backgroundDiagnostics/);
  assert.match(xpsJs, /if\(baseline\.over\)throw Error/);
  assert.match(xpsJs, /if\(baseline\.under\)throw Error/);
  assert.match(xpsHtml, /背景高于实验谱造成负面积属于过扣/);
  assert.match(xpsHtml, /SSE \/ DOF/);
  assert.doesNotMatch(xpsHtml, /<b>Reduced χ²<\/b>/);
});
