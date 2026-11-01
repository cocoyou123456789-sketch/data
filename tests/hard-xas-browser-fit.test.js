const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');

const root = path.join(__dirname, '..', 'github-pages');
const html = fs.readFileSync(path.join(root, 'browser-fit.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'static', 'browser-fit.js'), 'utf8');

test('hard-line browser fit exposes literature-constrained protocol controls', () => {
  assert.match(html, /硬线 XAS \/ EXAFS 文献约束拟合/);
  assert.match(html, /未知样：固定 S₀²，拟合 N/);
  assert.match(html, /标准样：固定 N，标定 S₀²/);
  assert.match(html, /先首壳，再联合第二壳/);
  assert.match(html, /multi-start-count/);
  assert.match(html, /audit_kweight/);
  assert.match(html, /PMC2816928/);
  assert.match(html, /10\.1103\/PhysRevB\.48\.9825/);
});

test('hard-line engine enforces identifiability and independent-point guard', () => {
  assert.match(js, /function applyAmplitudePolicy/);
  assert.match(js, /form\.vary_s02\.checked=false/);
  assert.match(js, /paths\.filter\(p=>p\.nleg===2\)\.forEach\(p=>p\.vary_cn=false\)/);
  assert.match(js, /S₀² 与配位数 N 不能同时自由拟合/);
  assert.match(js, /if\(nvar>=nind\)throw new Error/);
  assert.match(js, /1\+2\*\(Number\(form\.kmax\.value\)-Number\(form\.kmin\.value\)\)/);
});

test('hard-line engine implements staged, seeded multi-start and k-weight audits', () => {
  assert.match(js, /deterministic candidate-screened multi-start/);
  assert.match(js, /function mulberry32/);
  assert.match(js, /stage:'first_shell'/);
  assert.match(js, /kweights_audited/);
  assert.match(js, /near_best_count/);
  assert.match(js, /inspired by, but not identical to/);
  assert.match(js, /paper2agent_package:'\.\/methods\/hard-xas-methods\/'/);
  assert.match(js, /paper2agent_review_status:'reviewed_with_limitations'/);
});

test('second-shell expressions and wavelet output are safe and explicit', () => {
  assert.match(js, /function equationValue/);
  assert.match(js, /N1、dR1、sigma1、Reff1、R1、S02/);
  assert.doesNotMatch(js, /\beval\s*\(/);
  assert.doesNotMatch(js, /new Function\s*\(/);
  assert.match(js, /function morletMap/);
  assert.match(html, /wavelet-residual/);
  assert.match(js, /diagnostic only; not an independent coordination-number measurement/);
  new vm.Script(js, { filename: 'browser-fit.js' });
});

test('reviewed Paper2Agent package is published with the hard-line page', () => {
  const skillRoot = path.join(root, 'methods', 'hard-xas-methods');
  const skill = fs.readFileSync(path.join(skillRoot, 'SKILL.md'), 'utf8');
  const paper = fs.readFileSync(path.join(skillRoot, 'references', 'paper.md'), 'utf8');
  const supplement = fs.readFileSync(path.join(skillRoot, 'references', 'supplement.md'), 'utf8');
  assert.match(skill, /name: hard-xas-methods/);
  assert.match(skill, /Source review is complete with documented limitations/);
  assert.match(paper, /10\.1107\/S090904950904655X/);
  assert.match(paper, /Monte Carlo-based search procedure/);
  assert.match(supplement, /S0²/);
  assert.match(supplement, /Nind/);
});
