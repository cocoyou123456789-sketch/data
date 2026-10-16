const test = require('node:test');
const assert = require('node:assert/strict');
const { estimateCurveSuggestions, buildSuggestion } = require('../github-pages/exafs-suggestions.js');

function syntheticCurve() {
  const k = Array.from({ length: 141 }, (_, index) => 1.5 + index * 0.1);
  const chi = k.map(value => Math.sin(4 * value + 0.3) * Math.exp(-0.018 * value * value) + 0.0008 * Math.sin(37 * value));
  return { k, chi };
}

test('curve diagnostics propose measured k limits and a first-shell R interval', () => {
  const curve = syntheticCurve();
  const result = estimateCurveSuggestions(curve.k, curve.chi, 2.05);
  assert.ok(result.suggested_k_range_Ainv[0] >= curve.k[0]);
  assert.ok(result.suggested_k_range_Ainv[1] < curve.k.at(-1));
  assert.ok(result.suggested_k_range_Ainv[1] > result.suggested_k_range_Ainv[0]);
  assert.ok(result.suggested_r_range_A[1] > result.suggested_r_range_A[0]);
  assert.ok(result.uncorrected_r_peak_A > 0.6);
  assert.ok(result.nind_estimate > 2);
});

test('CIF coordination outside the metal training domain selects general review without inventing S02', () => {
  const curve = syntheticCurve();
  const suggestion = buildSuggestion(curve, {
    formula: 'M2O3', absorber: 'M', edge: 'K', structure_source: { database: 'test' },
    first_shell: {
      coordination_number: 3, scatterers: { O: 3 }, distance_mean_A: 1.95,
      distance_min_A: 1.91, distance_max_A: 2.01,
      assignment_method: 'first significant radial gap', confidence: 'medium',
    },
  }, { role: 'unknown', profile: 'paper-metal', s02: 0.88 });
  assert.equal(suggestion.recommended_profile, 'professional-general');
  assert.equal(suggestion.parameters.n.initial, 3);
  assert.equal(suggestion.parameters.s02.initial, 0.88);
  assert.equal(suggestion.parameters.s02.estimated_from_curve, false);
  assert.match(suggestion.parameters.s02.status, /fixed_external/);
});
