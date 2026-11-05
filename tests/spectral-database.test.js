const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const pages = path.join(__dirname, '..', 'github-pages');
const database = fs.readFileSync(path.join(pages, 'spectral-database.js'), 'utf8');
const loader = fs.readFileSync(path.join(pages, 'materials-literature-search.js'), 'utf8');
const xpsHtml = fs.readFileSync(path.join(pages, 'xps-fit.html'), 'utf8');
const xpsJs = fs.readFileSync(path.join(pages, 'xps-fit.js'), 'utf8');

test('chemistry module mounts a persistent searchable spectroscopy database', () => {
  assert.match(loader, /id='spectral-database'/);
  assert.match(loader, /上传数据库 JSON/);
  assert.match(loader, /spectral-database\.js/);
  assert.match(database, /indexedDB\.open\(DB_NAME,1\)/);
  assert.match(database, /createObjectStore\(STORE,\{keyPath:'id'\}\)/);
  assert.match(database, /synchrochem\.spectral-record\/v1/);
  assert.match(database, /hard_xas_exafs/);
  assert.match(database, /record_type==='xps'/);
});

test('database handoff validates origins and has JSON backup import/export', () => {
  assert.match(database, /water0623\.github\.io/);
  assert.match(database, /cocoyou123456789-sketch\.github\.io/);
  assert.match(database, /event\.origin/);
  assert.match(database, /synchrochem:spectral-ack/);
  assert.match(database, /synchrochem\.spectral-export\/v1/);
  assert.match(database, /MAX_BYTES=25\*1024\*1024/);
});

test('XPS fitting exports complete database records and can save them locally', () => {
  for (const id of ['sampleName','sampleFormula','sampleId','databaseNotes','downloadDbRecord','saveToChemistryDb']) {
    assert.match(xpsHtml, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(xpsHtml, /id="experimentDate"/);
  assert.match(xpsJs, /function buildDatabaseRecord\(\)/);
  assert.match(xpsJs, /record_type:'xps'/);
  assert.match(xpsJs, /raw_intensity:data\.raw/);
  assert.match(xpsJs, /background:last\.bg/);
  assert.match(xpsJs, /components/);
  assert.match(xpsJs, /SpectralDatabase\.put\(record\)/);
});

test('XPS fitting accepts separate C 1s and target spectra with automatic calibration', () => {
  for (const id of ['c1sFile','file','calibrationMin','calibrationMax','autoCalibrate','calibrationStatus']) {
    assert.match(xpsHtml, new RegExp(`id="${id}"`));
  }
  assert.match(xpsHtml, /C–C\/C–H 主峰并校准到 284\.80 eV/);
  assert.match(xpsJs, /function detectC1s\(rows\)/);
  assert.match(xpsJs, /target-measured/);
  assert.match(xpsJs, /automatic_detection:calibration/);
  assert.match(xpsJs, /uncorrected_energy:data\.rawEnergy/);
});

test('element selection supplies constrained peak recommendations', () => {
  for (const id of ['element','region','recommendation','applyTemplate']) {
    assert.match(xpsHtml, new RegExp(`id="${id}"`));
  }
  for (const key of ['c','o','ir','pb','pt','au']) {
    assert.match(xpsJs, new RegExp(`${key}:\\[`));
  }
  assert.match(xpsJs, /split:3\.0,ratio:\.75/);
  assert.match(xpsJs, /split:4\.86,ratio:\.75/);
  assert.doesNotMatch(xpsJs, /p\.center=mid/);
  assert.match(xpsJs, /推荐峰位不在当前数据范围/);
  assert.match(xpsJs, /NIST XPS Database/);
  assert.match(xpsJs, /automatic_peak_assignments_are_starting_suggestions:true/);
});
