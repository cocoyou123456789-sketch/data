const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const html = fs.readFileSync(path.join(__dirname, '..', 'github-pages', 'chemistry.html'), 'utf8');

test('spectroscopy hub exposes complete EXAFS and XPS fitting launch cards', () => {
  assert.match(html, /硬 X 射线与 XPS 拟合中心/);
  assert.match(html, /class="fit-hub-grid"/);
  assert.match(html, /href="\.\/exafs-fit\.html"/);
  assert.match(html, /href="\.\/xps-fit\.html"/);
  assert.match(html, /硬 X 射线 \/ EXAFS 结构拟合/);
  assert.match(html, /XPS 化学态约束拟合/);
});

test('EXAFS launch card names the real native tools and identifiability standards', () => {
  for (const text of ['Athena 标准化', 'Materials Project / CIF', 'Demeter + FEFF6', 'Artemis K/R 拟合', 'HAMA 小波']) {
    assert.match(html, new RegExp(text.replace(/[+]/g, '\\+')));
  }
  assert.match(html, /区分提取 E₀ 与拟合 ΔE₀/);
  assert.match(html, /标准样固定晶体学 N 拟合 S₀²/);
  assert.match(html, /固定为第一配位层模型/);
});

test('XPS launch card exposes fitting tools, physical constraints, and exports', () => {
  for (const text of ['Shirley / Tougaard', 'GL(30/50/70)', '非对称金属峰', '双峰联动']) {
    assert.match(html, new RegExp(text.replace(/[()]/g, '\\$&')));
  }
  assert.match(html, /自旋轨道双峰按有依据的分裂、面积比和一致 FWHM 联动/);
  assert.match(html, /不以高 R² 单独判定归属/);
  assert.match(html, /SVG、CSV、JSON 可审计文件/);
});
