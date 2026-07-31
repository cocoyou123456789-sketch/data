const assert = require("node:assert/strict");

require("../github-pages/data/material_baseline_v1.js");
const Baseline = require("../github-pages/material-baseline.js");

const encoded = Baseline.featurize([
  { symbol: "Mg", count: 1 },
  { symbol: "B", count: 2 }
]);
assert.equal(encoded.features.length, 128);
assert.ok(Math.abs(encoded.features[4] - 2 / 3) < 1e-7);
assert.ok(Math.abs(encoded.features[11] - 1 / 3) < 1e-7);

const prediction = Baseline.predictCounts([
  { symbol: "Mg", count: 1 },
  { symbol: "B", count: 2 }
]);
assert.equal(prediction.state, "ready");
assert.equal(prediction.domain, "inside");
assert.ok(Number.isFinite(prediction.formation_energy_eV_atom));
assert.ok(prediction.metallic_tendency_score >= 0 && prediction.metallic_tendency_score <= 1);
assert.ok(Number.isFinite(prediction.conditional_nonmetal_band_gap_eV));
assert.ok(Number.isFinite(prediction.conditional_known_superconductor_tc_K));
assert.ok(prediction.warnings.some(value => value.includes("not a probability")));

console.log("Material baseline tests passed");
