"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const core = require("../github-pages/arpes-dft.js");

function near(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`);
}

const qe = core.parseDftText([
  "# QE bands.dat.gnu",
  "0.0 -1.0",
  "1.0  0.0",
  "2.0  1.0",
  "",
  "0.0 -2.0",
  "1.0 -1.0",
  "2.0  0.0"
].join("\n"), "bands.dat.gnu");
assert.equal(qe.bands.length, 2);
assert.equal(qe.pointCount, 6);
assert.equal(qe.format, "QE blocks (k, E)");

const matrix = core.parseDftText([
  "k,E1,E2",
  "0.0,-1.0,-2.0",
  "1.0, 0.0,-1.0",
  "2.0, 1.0, 0.0"
].join("\n"), "bands.csv");
assert.equal(matrix.bands.length, 2);
assert.deepEqual(matrix.bands[1].energy, [-2, -1, 0]);

const repeatedPath = core.parseDftText([
  "0.0 -1.0",
  "1.0  0.0",
  "2.0  1.0",
  "0.0 -2.0",
  "1.0 -1.0",
  "2.0  0.0"
].join("\n"), "repeated.dat");
assert.equal(repeatedPath.bands.length, 1);
assert.equal(repeatedPath.format, "two-column path (k, E)");
assert.deepEqual(repeatedPath.bands[0].k, [0, 1, 2, 0, 1, 2]);

const matrixWithGap = core.parseDftText([
  "k,E1,E2,E3",
  "0,-1,,3",
  "1,0,2,4",
  "2,1,3,5"
].join("\n"), "gapped.csv");
assert.equal(matrixWithGap.bands.length, 3);
assert.deepEqual(matrixWithGap.bands[2].energy, [3, 4, 5], "empty fields must not shift later columns");

const longTable = core.parseDftText([
  "band,k,energy",
  "1,0,-1",
  "1,1,0",
  "2,0,-2",
  "2,1,-1"
].join("\n"), "bands-long.csv");
assert.equal(longTable.bands.length, 2);
assert.equal(longTable.format, "long table (band, k, E)");

const commentedLongTable = core.parseDftText([
  "# exported by post-processing",
  "band index,k (1/A),energy (eV)",
  "1,0,-1",
  "1,1,0",
  "2,0,-2",
  "2,1,-1"
].join("\n"), "bands-units.csv");
assert.equal(commentedLongTable.bands.length, 2);
assert.throws(
  () => core.parseDftText("kx (1/A),ky (1/A),energy (eV)\n0,0,-1\n1,1,0\n", "cartesian.csv"),
  /scalar k-path/i
);

const gappedBand = core.parseDftText([
  "k,E1",
  "0,-1",
  "1,",
  "2,1",
  "3,2"
].join("\n"), "gap.csv");
assert.deepEqual(gappedBand.bands[0].k, [0, 1, 2, 3]);
assert.ok(Number.isNaN(gappedBand.bands[0].energy[1]), "missing energies must remain a drawing break");
const restoredGap = core.validateProject(JSON.parse(JSON.stringify({
  kind: core.PROJECT_KIND,
  version: core.PROJECT_VERSION,
  dft: gappedBand,
  settings: {}
})));
assert.ok(Number.isNaN(restoredGap.dft.bands[0].energy[1]), "project JSON must preserve band gaps");

assert.throws(
  () => core.parseDftText("&plot\n nbnd=4, nks=10\n", "bands.dat"),
  /bands\.dat\.gnu/i
);

const fortranExponent = core.parseDftText("0.0 1.0D+00\n1.0 2.0D+00\n", "fortran.gnu");
assert.deepEqual(fortranExponent.bands[0].energy, [1, 2]);

const merged = core.mergeDftDatasets([qe, matrix]);
assert.equal(merged.bands.length, 4);
assert.equal(merged.pointCount, 12);
assert.deepEqual(merged.sourceFiles, ["bands.dat.gnu", "bands.csv"]);

const shortPath = core.parseDftText("0 -1\n1 0\n", "short.gnu");
const longPath = core.parseDftText("0 -2\n10 1\n", "long.gnu");
const differentlyScaledPaths = core.mergeDftDatasets([shortPath, longPath]);
assert.equal(differentlyScaledPaths.bands[0].sourceKMax, 1);
assert.equal(differentlyScaledPaths.bands[1].sourceKMax, 10);
near(core.mapKToRange(0.5, 0, 1, -2, 2), 0, 1e-12, "per-file k range mapping");
near(core.mapKToRange(5, 0, 10, -2, 2), 0, 1e-12, "per-file k range mapping with a different extent");

assert.deepEqual(core.parseSymmetryPoints("Γ=0, M=1.25; X:-0.5"), [
  { label: "X", position: -0.5 },
  { label: "Γ", position: 0 },
  { label: "M", position: 1.25 }
]);

near(core.interpolateBandEnergy(qe.bands[0], 0.5), -0.5, 1e-12, "linear interpolation");
assert.ok(Number.isNaN(core.interpolateBandEnergy(qe.bands[0], 3)));

const rows = 101;
const cols = 9;
const fermi = 0.08;
const values = new Float64Array(rows * cols);
for (let row = 0; row < rows; row += 1) {
  const energy = -0.5 + row / (rows - 1);
  const edge = 1 / (1 + Math.exp((energy - fermi) / 0.018));
  for (let col = 0; col < cols; col += 1) values[row * cols + col] = edge * (1 + col * 0.002);
}
const estimatedFermi = core.estimateFermiFromMatrix(values, rows, cols, { first: -0.5, last: 0.5 }, 2);
near(estimatedFermi, fermi, 0.02, "Fermi edge estimate");

const bindingValues = new Float64Array(rows * cols);
for (let row = 0; row < rows; row += 1) {
  const energy = -0.5 + row / (rows - 1);
  const edge = 1 / (1 + Math.exp((fermi - energy) / 0.018));
  for (let col = 0; col < cols; col += 1) bindingValues[row * cols + col] = edge;
}
const bindingEstimate = core.estimateFermiFromMatrix(
  bindingValues,
  rows,
  cols,
  { first: -0.5, last: 0.5 },
  2,
  { direction: "binding", details: true }
);
near(bindingEstimate.value, fermi, 0.02, "Binding-energy Fermi edge estimate");
assert.ok(bindingEstimate.confidence > 1);
assert.throws(
  () => core.estimateFermiFromMatrix(new Float64Array(rows * 3).fill(4), rows, 3, { first: -0.5, last: 0.5 }, 2),
  /no measurable/i
);

assert.deepEqual(core.clipSegmentToRect(-1, 0.5, 2, 0.5, { x: 0, y: 0, w: 1, h: 1 }), {
  x1: 0,
  y1: 0.5,
  x2: 1,
  y2: 0.5
});
assert.equal(core.sameArpesContext(
  core.arpesContextFromPlan({ path: "/data", dtype: "f4", shape: [2, 2] }, { filename: "same.h5", sourceId: "source-a" }),
  core.arpesContextFromPlan({ path: "/data", dtype: "f4", shape: [2, 2] }, { filename: "same.h5", sourceId: "source-b" })
), false, "repository source ids must distinguish same-name datasets");

const restored = core.validateProject({
  kind: core.PROJECT_KIND,
  version: core.PROJECT_VERSION,
  savedAt: "2026-07-25T00:00:00.000Z",
  settings: { dftFermi: 0.15, alignK: true },
  arpesContext: core.arpesContextFromPlan({
    path: "/entry/data",
    name: "data",
    dtype: "float32",
    shape: [50, 100]
  }, { filename: "sample.h5" }),
  dft: qe
});
assert.equal(restored.settings.dftFermi, 0.15);
assert.equal(restored.dft.bands.length, 2);
assert.deepEqual(restored.dft.bands[0].energy, qe.bands[0].energy);
assert.equal(restored.arpesContext.filename, "sample.h5");

const browserContext = {
  console,
  setTimeout,
  clearTimeout,
  requestAnimationFrame: callback => callback(),
  cancelAnimationFrame() {},
  devicePixelRatio: 1,
  document: {
    readyState: "loading",
    addEventListener() {},
    documentElement: { lang: "zh-CN" }
  }
};
browserContext.window = browserContext;
browserContext.globalThis = browserContext;
vm.createContext(browserContext);
vm.runInContext(fs.readFileSync(require.resolve("../github-pages/arpes-dft.js"), "utf8"), browserContext);
const workbench = browserContext.ArpesDftWorkbench;
const basePlan = {
  path: "/entry/data",
  name: "data",
  dtype: "float32",
  shape: [2, 2],
  xDim: 0,
  yDim: 1,
  xLabel: "k",
  yLabel: "Energy (eV)",
  xRange: { first: -1, last: 1 },
  yRange: { first: 10, last: 12 }
};
workbench.bindPreviewContext({ plan: basePlan, filename: "sample.h5" }, { resetWhenChanged: false });
workbench.getState().settings.arpesFermi = 0.4;
const shiftedPlan = workbench.transformPreviewPlan(basePlan, { filename: "sample.h5" });
near(shiftedPlan.yRange.first, 9.6, 1e-12, "ARPES EF shift");
near(workbench.transformPreviewPlan(shiftedPlan, { filename: "sample.h5" }).yRange.first, 9.6, 1e-12, "ARPES EF idempotency");

const base3dPlan = {
  path: "/entry/cube",
  name: "cube",
  dtype: "float32",
  shape: [4, 5, 6],
  xDim: 0,
  yDim: 1,
  fixedDim: 2,
  xLabel: "Theta (deg)",
  yLabel: "Energy (eV)",
  fixedLabel: "Temperature (K)",
  xRange: { first: -2, last: 2 },
  yRange: { first: 10, last: 12 },
  fixedRange: { first: 20, last: 30 }
};
workbench.bindPreviewContext({ plan: base3dPlan, filename: "cube.h5" }, { resetWhenChanged: false });
const shifted3dPlan = workbench.transformPreviewPlan(base3dPlan, { filename: "cube.h5" });
const reoriented3dPlan = {
  ...shifted3dPlan,
  xDim: 1,
  yDim: 2,
  fixedDim: 0,
  xLabel: "Energy (eV)",
  yLabel: "Temperature (K)",
  fixedLabel: "Theta (deg)",
  xRange: shifted3dPlan.yRange,
  yRange: shifted3dPlan.fixedRange,
  fixedRange: shifted3dPlan.xRange
};
const transformedReoriented = workbench.transformPreviewPlan(reoriented3dPlan, { filename: "cube.h5" });
near(transformedReoriented.xRange.first, 9.6, 1e-12, "3D reorientation uses the energy dimension raw range");
near(transformedReoriented.yRange.first, 20, 1e-12, "3D reorientation preserves non-energy raw ranges");

const mismatchedPlan = workbench.transformPreviewPlan(basePlan, { filename: "another.h5" });
near(mismatchedPlan.yRange.first, 10, 1e-12, "mismatched ARPES must remain uncalibrated");
const restoredRawPlan = workbench.transformPreviewPlan(shiftedPlan, { filename: "another.h5" });
near(restoredRawPlan.yRange.first, 10, 1e-12, "context mismatch must restore the raw axis");

workbench.getState().settings.energyDirection = "binding";
workbench.getState().settings.arpesFermi = 0.2;
const bindingPlan = {
  ...basePlan,
  yLabel: "Binding Energy (eV)",
  yRange: { first: 0, last: 1 }
};
workbench.bindPreviewContext({ plan: bindingPlan, filename: "binding.h5" }, { resetWhenChanged: false });
const convertedBindingPlan = workbench.transformPreviewPlan(bindingPlan, { filename: "binding.h5" });
near(convertedBindingPlan.yRange.first, 0.2, 1e-12, "Binding Energy first endpoint");
near(convertedBindingPlan.yRange.last, -0.8, 1e-12, "Binding Energy last endpoint");

const meVPlan = {
  ...basePlan,
  yLabel: "Binding Energy (meV)",
  yRange: { first: 0, last: 500 }
};
workbench.getState().settings.arpesFermi = 0;
workbench.bindPreviewContext({ plan: meVPlan, filename: "millielectronvolt.h5" }, { resetWhenChanged: false });
const convertedMeVPlan = workbench.transformPreviewPlan(meVPlan, { filename: "millielectronvolt.h5" });
near(convertedMeVPlan.yRange.last, -0.5, 1e-12, "meV axes must be converted to eV");
assert.equal(convertedMeVPlan.yLabel, "E − EF (eV)");

const photonPlan = {
  ...basePlan,
  yLabel: "Photon Energy (eV)",
  yRange: { first: 20, last: 30 }
};
workbench.getState().settings.arpesFermi = 5;
workbench.bindPreviewContext({ plan: photonPlan, filename: "photon-scan.h5" }, { resetWhenChanged: false });
const untouchedPhotonPlan = workbench.transformPreviewPlan(photonPlan, { filename: "photon-scan.h5" });
near(untouchedPhotonPlan.yRange.first, 20, 1e-12, "photon-energy axes must not receive electron EF calibration");

workbench.getState().settings.energyDirection = "electron";
workbench.getState().settings.arpesFermi = 0.4;
workbench.bindPreviewContext({ plan: basePlan, filename: "sample.h5" }, { resetWhenChanged: false });

workbench.getState().dft = {
  kMin: 0,
  kMax: 1,
  bands: [{ name: "Band 1", k: [0, 1], energy: [-1, 1] }]
};
const drawingCalls = [];
const mockContext = new Proxy({}, {
  get(target, key) {
    if (!(key in target)) target[key] = (...args) => drawingCalls.push([key, ...args]);
    return target[key];
  },
  set(target, key, value) {
    target[key] = value;
    return true;
  }
});
const momentumOverlayPlan = workbench.transformPreviewPlan(basePlan, { filename: "sample.h5" });
assert.equal(workbench.drawOverlay(mockContext, {
  filename: "sample.h5",
  sample: { xLen: 2, yLen: 2 },
  plan: momentumOverlayPlan,
  layout: {
    margin: { left: 0, top: 0 },
    plotW: 100,
    plotH: 100,
    flipX: false,
    flipY: false
  }
}), true);
assert.ok(drawingCalls.some(call => call[0] === "stroke"), "DFT overlay should draw at least one path");

const angleBasePlan = { ...basePlan, xLabel: "Theta (deg)" };
workbench.bindPreviewContext({ plan: angleBasePlan, filename: "sample.h5" }, { resetWhenChanged: false });
const angleOverlayPlan = workbench.transformPreviewPlan(angleBasePlan, { filename: "sample.h5" });
assert.equal(workbench.drawOverlay(mockContext, {
  filename: "sample.h5",
  sample: { xLen: 2, yLen: 2 },
  plan: angleOverlayPlan,
  layout: {
    margin: { left: 0, top: 0 },
    plotW: 100,
    plotH: 100,
    flipX: false,
    flipY: false
  }
}), true, "angle-energy overlays remain available as an explicitly visual comparison");
assert.equal(workbench.getState().lastStatusKey, "angleOverlayWarning");

const temperatureBasePlan = { ...basePlan, xLabel: "Temperature (K)" };
workbench.bindPreviewContext({ plan: temperatureBasePlan, filename: "sample.h5" }, { resetWhenChanged: false });
const temperatureOverlayPlan = workbench.transformPreviewPlan(temperatureBasePlan, { filename: "sample.h5" });
assert.equal(workbench.drawOverlay(mockContext, {
  filename: "sample.h5",
  sample: { xLen: 2, yLen: 2 },
  plan: temperatureOverlayPlan,
  layout: {
    margin: { left: 0, top: 0 },
    plotW: 100,
    plotH: 100,
    flipX: false,
    flipY: false
  }
}), false, "non-momentum horizontal axes must not receive DFT overlays");
assert.equal(workbench.drawOverlay(mockContext, {
  filename: "other.h5",
  sample: { xLen: 2, yLen: 2 },
  plan: basePlan,
  layout: {
    margin: { left: 0, top: 0 },
    plotW: 100,
    plotH: 100,
    flipX: false,
    flipY: false
  }
}), false, "DFT overlay must refuse a different ARPES source");

console.log("ARPES–DFT core tests passed");
