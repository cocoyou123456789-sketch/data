const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..', 'github-pages');
const html = fs.readFileSync(path.join(root, 'exafs-fit.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'exafs-native.js'), 'utf8');
const fitSource = fs.readFileSync(path.join(root, 'exafs-fit.js'), 'utf8');
const materialsSource = fs.readFileSync(path.join(root, 'exafs-materials-project.js'), 'utf8');
const suggestionSource = fs.readFileSync(path.join(root, 'exafs-suggestions.js'), 'utf8');

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

test('page offers one complete environment installer without a portable download', () => {
  assert.match(html, /releases\/latest\/download\/XAFS-Native-Bridge-Setup\.exe/);
  assert.match(html, /id="install-complete-environment"/);
  assert.match(html, /一键安装本机桥接和全部拟合环境/);
  assert.doesNotMatch(html, /XAFS-Native-Bridge-Portable\.zip/);
});

test('missing native tools can still be repaired from the connected bridge', () => {
  assert.match(source, /\/api\/native-tools\/\$\{tool\}\/install/);
  assert.match(source, /\/api\/native-tools\/install-status/);
  assert.match(source, /data-install-tool/);
  assert.match(source, /安装向导已打开/);
});

test('connection failure directs users to the packaged bridge', () => {
  assert.match(source, /一键安装本机桥接和全部拟合环境/);
  assert.match(source, /源码开发环境才需要运行 start-native-bridge\.ps1/);
});

test('native status distinguishes installation from running processes', () => {
  assert.match(source, /item\.running \? '正在运行'/);
  assert.match(source, /process_ids/);
  assert.match(source, /xafs-native-status/);
  assert.match(html, /id="bridge-health"/);
  assert.match(source, /const visibleTools = \['athena', 'artemis', 'hama', 'hephaestus'\]/);
  assert.doesNotMatch(source, /visibleTools = \[[^\]]*'feff'/);
});

test('workbench exposes staged navigation and sample amplitude roles', () => {
  assert.match(html, /data-scroll-target="native-panel"/);
  assert.match(html, /data-scroll-target="result-dashboard"/);
  assert.match(html, /id="analysis-role"/);
  assert.match(html, /晶体标准样：固定 N，拟合 S₀²/);
  assert.match(html, /未知样：固定 S₀²，拟合 N/);
  assert.match(html, /exafs-workbench\.js/);
});

test('EXAFS parameters use explicit literature and professional acceptance rules', () => {
  assert.match(html, /id="constraint-profile"/);
  assert.match(html, /S₀²=0\.75–1\.20、N=4–13/);
  assert.match(html, /相关系数&gt;0\.95/);
  assert.match(fitSource, /EXAFS_PARAMETER_RULES/);
  assert.match(fitSource, /禁止从同一条谱同时自由拟合 N 与 S₀²/);
  assert.match(fitSource, /命中拟合边界/);
  assert.match(source, /paper_metal_domain/);
  assert.match(source, /analysis_role/);
});

test('native detection runs only after the user clicks refresh', () => {
  assert.match(source, /refresh-native'\)\.onclick = \(\) => detectNative\(true\)/);
  assert.doesNotMatch(source, /setInterval\(/);
  assert.doesNotMatch(source, /^detectNative\(\);/m);
  assert.match(html, /页面不会自动轮询/);
});

test('native fitting generates first-shell FEFF input from CIF without a FEFF upload field', () => {
  assert.doesNotMatch(html, /id="native-feff-file"/);
  assert.match(html, /name="max_shell" type="hidden" value="1"/);
  assert.match(html, /解析 CIF 并准备第一壳层路径/);
  assert.match(source, /xafsGeneratedFeffInput/);
  assert.match(source, /encodeTextFile\(generated\.name, generated\.content, 'feff_input'\)/);
});

test('Materials Project element picker loads a selected CIF into the native first-shell workflow', () => {
  assert.match(html, /id="mp-elements"/);
  assert.match(html, /Materials Project 在线选择/);
  assert.match(html, /exafs-materials-project\.js/);
  assert.match(materialsSource, /data-element/);
  assert.match(materialsSource, /materials-structure/);
  assert.match(materialsSource, /globalThis\.xafsCifSelection/);
  assert.match(materialsSource, /material_id/);
  assert.match(materialsSource, /selected\.size > 1 \? \[\.\.\.selected\]\.join\('-'\)/);
  assert.match(fitSource, /structure_source=source\.source/);
  assert.match(source, /window\.xafsCifSelection\.content, 'structure_cif'/);
});

test('curve and CIF can generate traceable parameter suggestions before fitting', () => {
  assert.match(html, /id="suggest-fit-parameters"/);
  assert.match(html, /id="apply-fit-suggestions"/);
  assert.match(html, /exafs-suggestions\.js/);
  assert.match(fitSource, /first_shell=firstShellFromFeffInput/);
  assert.match(suggestionSource, /proposal_not_fit/);
  assert.match(suggestionSource, /estimated_from_curve: false/);
  assert.match(suggestionSource, /uncorrected_r_peak_A/);
  assert.match(source, /parameter_suggestion: globalThis\.xafsParameterSuggestion/);
  assert.match(fitSource, /lastResult\.parameter_suggestion/);
});
