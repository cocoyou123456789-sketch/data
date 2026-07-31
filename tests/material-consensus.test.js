const assert = require("node:assert/strict");

process.env.MATERIAL_CONSENSUS_TEST_ADAPTER = "1";
const Core = require("../github-pages/material-consensus.js");
delete process.env.MATERIAL_CONSENSUS_TEST_ADAPTER;
const fixtureEvidenceId = input => `fixture:${Buffer.from(String(input.model_family || input.model || "model")).toString("hex").slice(0, 48).padEnd(8, "0")}`;
const trusted = input => Core.__testNormalizeTrustedCandidate({
  evidence_id: Object.prototype.hasOwnProperty.call(input, "evidence_id")
    ? input.evidence_id
    : fixtureEvidenceId(input),
  ...input,
  ...(input.structure_id && !input.structure_namespace && !input.structure_hash ? { structure_namespace: "test-fixture" } : {})
}, {
  verified: true,
  trustedSourceFamily: true,
  eligibleForConsensus: true,
  trustedEvidence: true,
  conditionsComplete: true
});

const hematiteA = Core.canonicalComposition("Fe2O3");
const hematiteB = Core.canonicalComposition("O3Fe2");
const hematiteC = Core.canonicalComposition("Fe4O6");
assert.equal(hematiteA.key, hematiteB.key);
assert.equal(hematiteA.key, hematiteC.key);
assert.equal(hematiteA.reducedFormula, "Fe2O3");
assert.deepEqual(Core.canonicalComposition("Ca(OH)2").counts, { Ca: 1, H: 2, O: 2 });
assert.ok(Core.canonicalComposition("La1.9Sr0.1CuO4").key.includes("Sr:1"));
assert.notEqual(Core.canonicalComposition("Fe0.00001O").key, Core.canonicalComposition("Fe0.00002O").key, "ppm-scale stoichiometry does not silently collide");
assert.throws(() => Core.canonicalComposition("Fe0.000000001O"), /STOICHIOMETRY_PRECISION_EXCEEDED/);
assert.throws(() => Core.canonicalComposition("Xx2O"), /INVALID_ELEMENT/);
assert.throws(() => Core.canonicalComposition("Fe-1O"), /INVALID_ELEMENT/);
assert.notEqual(
  Core.ownerNamespaceForUser({ email: "alpha@example.org" }),
  Core.ownerNamespaceForUser({ email: "beta@example.org" })
);

const normalized = trusted({
  model: "MatterSim-v1",
  model_version: "1.0.0-5M",
  model_family: "MatterSim",
  formula: "FeSe",
  structure_id: "structure-1",
  stage: "ml",
  e_above_hull_eV_atom: 0.03,
  confidence: 0.8,
  calibration: { e_above_hull_eV_atom: { q90: 0.02, unit: "eV/atom", applicability: 0.9, validation_set: "fixture-validation" } },
  recommendation: "Verify with DFT and phonons.",
  novelty_checked: true,
  data_cutoff: "2026-01-01",
  source: "model run 1"
});
assert.equal(normalized.schema, Core.SCHEMA);
assert.equal(normalized.claim_state, "model_candidate");
assert.equal(normalized.novelty_status, "screened_unverified");
assert.equal(normalized.properties.e_above_hull_eV_atom, 0.03);
assert.equal(Core.normalizeCandidate({ model: "A", formula: "FeSe", target: "tc_K", tc_K: 8, recommendation: "target" }).target_definition, "tc_K");

for (const stage of ["not_experiment", "non_experimental", "not_reproduced", "not_dft"]) {
  assert.equal(trusted({ model: stage, model_family: `${stage}-family`, formula: "FeSe", structure_id: "negative-stage", stage, tc_K: 9, recommendation: "negative evidence label" }).stage, "unknown");
}
assert.equal(trusted({ model: "Unvalidated", model_family: "unvalidated-family", formula: "FeSe", structure_id: "unvalidated", stage: "unvalidated_ml", tc_K: 9, recommendation: "unvalidated" }).stage, "ml");
assert.equal(trusted({ model: "LLM report", model_family: "llm-family", formula: "FeSe", structure_id: "llm-report", stage: "reported_by_llm", tc_K: 9, recommendation: "language model" }).stage, "llm");

const sameIdentity = [
  normalized,
  trusted({
    model: "CHGNet",
    model_version: "0.4.2",
    model_family: "CHGNet",
    formula: "SeFe",
    structure_id: "structure-1",
    stage: "validated_ml",
    e_above_hull_eV_atom: 0.05,
    calibration: { e_above_hull_eV_atom: { q90: 0.025, unit: "eV/atom", applicability: 0.82, validation_set: "fixture-validation" } },
    recommendation: "Run DFT relaxation and phonon verification.",
    novelty_checked: true,
    source: "model run 2"
  }),
  trusted({
    model: "CHGNet",
    model_version: "0.4.2",
    model_family: "CHGNet",
    formula: "FeSe",
    structure_id: "structure-1",
    stage: "validated_ml",
    e_above_hull_eV_atom: 0.05,
    calibration: { e_above_hull_eV_atom: { q90: 0.025, unit: "eV/atom", applicability: 0.82, validation_set: "fixture-validation" } },
    recommendation: "Run DFT relaxation and phonon verification.",
    novelty_checked: true,
    source: "model run 2"
  })
];
const merged = Core.analyzeRecords(sameIdentity);
assert.equal(merged.candidate_count, 1);
assert.equal(merged.normalized_count, 2, "duplicate submission from one model is removed");
assert.equal(merged.groups[0].models.length, 2);
assert.equal(merged.groups[0].evidence_model_families.length, 2);
assert.equal(merged.agreement_count, 1);
assert.equal(merged.groups[0].properties.e_above_hull_eV_atom.count, 2);

const polymorphs = Core.analyzeRecords([
  { model: "A", formula: "TiO2", structure_id: "rutile", stage: "dft", band_gap_eV: 3.0, recommendation: "Rutile phase" },
  { model: "B", formula: "TiO2", structure_id: "anatase", stage: "dft", band_gap_eV: 3.2, recommendation: "Anatase phase" },
  { model: "C", formula: "TiO2", stage: "llm", band_gap_eV: 3.1, recommendation: "Structure unspecified" }
]);
assert.equal(polymorphs.candidate_count, 3, "distinct structures and unspecified polymorphs remain separate");

const pressureSplit = Core.analyzeRecords([
  { model: "A", formula: "H3S", structure_id: "phase-1", target: "tc_K", pressure_GPa: 0, stage: "dft", tc_K: 10, recommendation: "Ambient pressure" },
  { model: "B", formula: "H3S", structure_id: "phase-1", target: "tc_K", pressure_GPa: 200, stage: "dft", tc_K: 200, recommendation: "High pressure" }
]);
assert.equal(pressureSplit.candidate_count, 2, "different pressure conditions do not merge");

const conflict = Core.analyzeRecords([
  trusted({ model: "A", model_family: "family-a", formula: "MgB2", structure_id: "s1", target: "tc_K", stage: "dft", tc_K: 10.0, recommendation: "Verify phonons" }),
  trusted({ model: "B", model_family: "family-b", formula: "MgB2", structure_id: "s1", target: "tc_K", stage: "dft", tc_K: 10.2, recommendation: "Verify phonon calculation" }),
  trusted({ model: "C", model_family: "family-c", formula: "MgB2", structure_id: "s1", target: "tc_K", stage: "dft", tc_K: 30.0, recommendation: "Audit calculation conditions" }),
  { model: "LLM", model_family: "general-llm", formula: "MgB2", structure_namespace: "test-fixture", structure_id: "s1", target: "tc_K", stage: "llm", tc_K: 100, recommendation: "Language model number must not enter numeric consensus" }
]);
assert.equal(conflict.candidate_count, 1);
assert.equal(conflict.groups[0].properties.tc_K.count, 3, "LLM numbers are excluded from numeric aggregation");
assert.ok(conflict.groups[0].properties.tc_K.value <= 10.2);
assert.equal(conflict.groups[0].properties.tc_K.conflict, true);
assert.equal(conflict.conflict_count, 1);
assert.equal(conflict.agreement_count, 0, "a conflicting numeric claim is not counted as consensus");

const unresolvedIdentity = Core.analyzeRecords([
  trusted({ model: "A", model_family: "family-a", formula: "FeSe", target: "tc_K", stage: "dft", tc_K: 8.0, recommendation: "Structure not specified" }),
  trusted({ model: "B", model_family: "family-b", formula: "FeSe", target: "tc_K", stage: "dft", tc_K: 8.2, recommendation: "Structure still not specified" })
]);
assert.equal(unresolvedIdentity.candidate_count, 1, "composition-level suggestions can share a display group");
assert.equal(unresolvedIdentity.groups[0].identity_resolved, false);
assert.equal(unresolvedIdentity.agreement_count, 0, "unknown structure identity cannot become scientific consensus");
assert.equal(unresolvedIdentity.groups[0].properties.tc_K.incomparable, true, "numeric values from unresolved structures are listed but not merged");
assert.equal(unresolvedIdentity.groups[0].properties.tc_K.value, null);

const noSharedClaim = Core.analyzeRecords([
  trusted({ model: "A", model_family: "family-a", formula: "FeSe", structure_id: "s1", target: "tc_K", stage: "dft", tc_K: 8.0, recommendation: "Numeric claim" }),
  trusted({ model: "B", model_family: "family-b", formula: "FeSe", structure_id: "s1", target: "tc_K", stage: "dft", recommendation: "Recommendation without this property" })
]);
assert.equal(noSharedClaim.agreement_count, 0, "a source without the shared claim does not raise consensus");

const planningOnly = Core.analyzeRecords([
  { model: "GPT", model_family: "llm-a", formula: "FeSe", stage: "task_planning", recommendation: "Run DFT" },
  { model: "DeepSeek", model_family: "llm-b", formula: "FeSe", stage: "task_planning", recommendation: "Run a DFT calculation" }
]);
assert.equal(planningOnly.agreement_count, 0, "task previews never count as scientific agreement");
assert.equal(Object.keys(planningOnly.groups[0].properties).length, 0);

const demoIsolation = Core.analyzeRecords([
  Core.normalizeCandidate({ model: "Demo", formula: "FeSe", structure_id: "s1", stage: "dft", tc_K: 9, target: "tc_K", demo: true, recommendation: "Demonstration only" }),
  Core.normalizeCandidate({ model: "Real import", formula: "FeSe", structure_id: "s1", stage: "dft", tc_K: 8, target: "tc_K", recommendation: "Separate imported result" })
]);
assert.equal(demoIsolation.candidate_count, 2, "demo records never merge into non-demo candidate groups");
assert.equal(demoIsolation.groups.some(group => group.demo_only), true);

const weakExperiment = Core.normalizeCandidate({
  model: "Free text",
  formula: "FeSe",
  stage: "experiment",
  recommendation: "Claimed observation without structured evidence"
});
assert.notEqual(weakExperiment.claim_state, "experimental_observation");
const structuredExperiment = Core.__testNormalizeTrustedCandidate({
  model: "Lab record",
  formula: "FeSe",
  stage: "experiment",
  experimental_method: "XRD and transport",
  raw_data_url: "https://example.org/raw-data",
  recommendation: "Observed in this sample"
}, { verified: true, trustedSourceFamily: true, eligibleForConsensus: true, trustedEvidence: true });
assert.equal(structuredExperiment.claim_state, "experimental_observation");

const untrustedImported = Core.normalizeCandidate({
  model: "Uploaded result",
  formula: "FeSe",
  structure_id: "s1",
  stage: "dft",
  tc_K: 8.5,
  recommendation: "User-declared DFT result"
});
assert.equal(untrustedImported.verification_status, "imported_unverified");
assert.equal(untrustedImported.eligible_for_consensus, false);

const unverifiedHijack = Core.analyzeRecords([
  trusted({ model: "Trusted A", model_family: "family-a", formula: "MgB2", structure_id: "s-hijack", target: "tc_K", stage: "dft", tc_K: 10, recommendation: "trusted" }),
  trusted({ model: "Trusted B", model_family: "family-b", formula: "MgB2", structure_id: "s-hijack", target: "tc_K", stage: "dft", tc_K: 10.2, recommendation: "trusted" }),
  ...Array.from({ length: 5 }, (_, index) => ({
    model: `Unverified ${index}`,
    model_family: `fake-${index}`,
    formula: "MgB2",
    structure_namespace: "test-fixture",
    structure_id: "s-hijack",
    target: "tc_K",
    stage: "dft",
    tc_K: 100,
    calibration_q90: 1000,
    calibration_unit: "K",
    applicability: 1,
    validation_set: "self-declared",
    recommendation: "unverified"
  }))
]);
assert.equal(unverifiedHijack.agreement_count, 1, "unverified uploads cannot erase agreement among verified families");
assert.ok(unverifiedHijack.groups[0].properties.tc_K.value <= 10.2, "unverified uploads cannot move the verified center");
assert.equal(unverifiedHijack.groups[0].properties.tc_K.conflict, true, "unverified disagreement remains visible");

const sameFamilyClaim = Core.analyzeRecords([
  trusted({ model: "A1", model_family: "family-a", formula: "FeSe", structure_id: "shared-claim", target: "tc_K", stage: "dft", tc_K: 10, recommendation: "claim" }),
  trusted({ model: "A2", model_family: "family-a", formula: "FeSe", structure_id: "shared-claim", target: "tc_K", stage: "dft", tc_K: 10.1, recommendation: "same family" }),
  trusted({ model: "B", model_family: "family-b", formula: "FeSe", structure_id: "shared-claim", target: "tc_K", stage: "dft", recommendation: "no Tc value" })
]);
assert.equal(sameFamilyClaim.groups[0].properties.tc_K.eligible_family_count, 1);
assert.equal(sameFamilyClaim.agreement_count, 0, "two models from one family are not two independent property claims");

const missingFamilyA = Core.__testNormalizeTrustedCandidate({ model: "MatterSim-v1", formula: "FeSe", structure_namespace: "test-fixture", structure_id: "missing-family", stage: "ml", tc_K: 9, recommendation: "missing family" }, { verified: true, trustedSourceFamily: true, eligibleForConsensus: true, trustedEvidence: true });
const missingFamilyB = Core.__testNormalizeTrustedCandidate({ model: "MatterSim-v2", formula: "FeSe", structure_namespace: "test-fixture", structure_id: "missing-family", stage: "ml", tc_K: 9.1, recommendation: "missing family" }, { verified: true, trustedSourceFamily: true, eligibleForConsensus: true, trustedEvidence: true });
assert.equal(missingFamilyA.eligible_for_consensus, false);
assert.equal(Core.analyzeRecords([missingFamilyA, missingFamilyB]).agreement_count, 0, "model versions without an explicit family are not independent families");

const outOfDomain = Core.analyzeRecords([
  trusted({ model: "Applicable", model_family: "family-a", formula: "FeSe", structure_id: "domain", stage: "ml", tc_K: 9, calibration: { tc_K: { q90: 1, unit: "K", applicability: 1, validation_set: "inside-domain" } }, recommendation: "inside domain" }),
  trusted({ model: "Out of domain", model_family: "family-b", formula: "FeSe", structure_id: "domain", stage: "ml", tc_K: 9.1, calibration: { tc_K: { q90: 1, unit: "K", applicability: 0, validation_set: "outside-domain" } }, recommendation: "outside domain" })
]);
assert.equal(outOfDomain.groups[0].properties.tc_K.eligible_family_count, 1);
assert.equal(outOfDomain.agreement_count, 0, "zero-applicability output cannot be the second supporting family");
const bareOutOfDomain = Core.analyzeRecords([
  trusted({ model: "Applicable bare", model_family: "family-a", formula: "FeSe", structure_id: "bare-domain", stage: "ml", tc_K: 9, recommendation: "inside domain" }),
  trusted({ model: "Out bare", model_family: "family-b", formula: "FeSe", structure_id: "bare-domain", stage: "ml", tc_K: 9.1, applicability: 0, recommendation: "explicitly outside domain" })
]);
assert.equal(bareOutOfDomain.groups[0].properties.tc_K.eligible_family_count, 1);
assert.equal(bareOutOfDomain.agreement_count, 0, "applicability zero is preserved even without q90 metadata");
const multiPropertyOut = trusted({ model: "Out multi", model_family: "family-out", formula: "FeSe", structure_id: "multi-domain", stage: "ml", tc_K: 9, band_gap_eV: 0.2, applicability: 0, recommendation: "outside for all outputs" });
assert.equal(multiPropertyOut.applicability_by_property.tc_K, 0);
assert.equal(multiPropertyOut.applicability_by_property.band_gap_eV, 0);
const percentOutOfDomain = Core.analyzeRecords([
  trusted({ model: "Percent inside", model_family: "family-a", formula: "FeSe", structure_id: "percent-domain", stage: "ml", tc_K: 9, recommendation: "inside" }),
  trusted({ model: "Percent outside", model_family: "family-b", formula: "FeSe", structure_id: "percent-domain", stage: "ml", tc_K: 9.1, applicability: "0%", recommendation: "outside" })
]);
assert.equal(percentOutOfDomain.groups[0].properties.tc_K.eligible_family_count, 1);
assert.equal(percentOutOfDomain.agreement_count, 0, "percentage-form zero applicability is out of domain");
assert.equal(trusted({ model: "Spaced percent", model_family: "family-space", formula: "FeSe", structure_id: "space-percent", stage: "ml", tc_K: 9, applicability: "0 %", recommendation: "outside" }).applicability_by_property.tc_K, 0);
assert.throws(() => trusted({ model: "Bad applicability", model_family: "family-bad", formula: "FeSe", structure_id: "bad-app", stage: "ml", tc_K: 9, applicability: "unknown", recommendation: "invalid" }), /INVALID_APPLICABILITY/);

const mev = Core.normalizeCandidate({ model: "A", formula: "FeSe", target: "band_gap_eV", value: 250, unit: "meV", recommendation: "Converted value" });
assert.equal(mev.properties.band_gap_eV, 0.25);
assert.equal(Core.normalizeCandidate({ model: "A", formula: "FeSe", band_gap: 250, unit: "meV", recommendation: "Alias conversion" }).properties.band_gap_eV, 0.25);
assert.equal(Core.normalizeCandidate({ model: "A", formula: "FeSe", e_hull: 50, unit: "meV/atom", recommendation: "Alias conversion" }).properties.e_above_hull_eV_atom, 0.05);
assert.throws(
  () => Core.normalizeCandidate({ model: "A", formula: "FeSe", target: "band_gap_eV", value: 1, unit: "kelvin", recommendation: "Wrong unit" }),
  /UNSUPPORTED_PROPERTY_UNIT/
);
assert.throws(() => Core.normalizeCandidate({ model: "A", formula: "FeSe", tc: 25, unit: "C", recommendation: "Wrong Tc unit" }), /UNSUPPORTED_PROPERTY_UNIT/);
assert.throws(() => Core.normalizeCandidate({ model: "A", formula: "FeSe", band_gap: 250, unit: "meV\/atom", recommendation: "Wrong gap unit" }), /UNSUPPORTED_PROPERTY_UNIT/);
assert.throws(() => Core.normalizeCandidate({ model: "A", formula: "FeSe", e_hull: 50, unit: "meV", recommendation: "Wrong hull unit" }), /UNSUPPORTED_PROPERTY_UNIT/);
assert.throws(() => Core.normalizeCandidate({ model: "A", formula: "FeSe", tc_K: -5, recommendation: "Negative Tc" }), /INVALID_PROPERTY_RANGE/);
assert.throws(() => Core.normalizeCandidate({ model: "A", formula: "FeSe", band_gap_eV: -1, recommendation: "Negative gap" }), /INVALID_PROPERTY_RANGE/);
assert.throws(() => Core.normalizeCandidate({ model: "A", formula: "FeSe", e_above_hull_eV_atom: -0.1, recommendation: "Negative hull" }), /INVALID_PROPERTY_RANGE/);

const conditionSplits = Core.analyzeRecords([
  trusted({ model: "Direct", model_family: "family-a", formula: "Si", structure_id: "mp-149", structure_namespace: "materials_project", stage: "dft", functional: "PBE", gap_type: "direct", band_gap_eV: 1, recommendation: "direct gap" }),
  trusted({ model: "Indirect", model_family: "family-b", formula: "Si", structure_id: "mp-149", structure_namespace: "materials_project", stage: "dft", functional: "PBE", gap_type: "indirect", band_gap_eV: 1.1, recommendation: "indirect gap" }),
  trusted({ model: "SOC on", model_family: "family-c", formula: "Bi2Se3", structure_id: "mp-541837", structure_namespace: "materials_project", stage: "dft", spin_orbit_coupling: "on", band_gap_eV: 0.1, recommendation: "SOC" }),
  trusted({ model: "SOC off", model_family: "family-d", formula: "Bi2Se3", structure_id: "mp-541837", structure_namespace: "materials_project", stage: "dft", spin_orbit_coupling: "off", band_gap_eV: 0.2, recommendation: "no SOC" })
]);
assert.equal(conditionSplits.candidate_count, 4, "gap type and SOC settings remain separate identities");

const zeroConditionSplit = Core.analyzeRecords([
  trusted({ model: "U zero", model_family: "family-a", formula: "FeO", structure_id: "u-condition", stage: "dft", hubbard_u_eV: 0, band_gap_eV: 1, recommendation: "explicit U zero" }),
  trusted({ model: "U unknown", model_family: "family-b", formula: "FeO", structure_id: "u-condition", stage: "dft", band_gap_eV: 1.1, recommendation: "U unspecified" })
]);
assert.equal(zeroConditionSplit.candidate_count, 2, "explicit zero conditions are distinct from unspecified conditions");

const unitConditions = Core.analyzeRecords([
  trusted({ model: "Units A", model_family: "family-a", formula: "H3S", structure_id: "unit-condition", stage: "dft", pressure: 1, pressure_unit: "GPa", temperature: 300, temperature_unit: "K", tc_K: 100, recommendation: "canonical conditions" }),
  trusted({ model: "Units B", model_family: "family-b", formula: "H3S", structure_id: "unit-condition", stage: "dft", pressure: 1000, pressure_unit: "MPa", temperature: 26.85, temperature_unit: "C", tc_K: 100.2, recommendation: "converted conditions" })
]);
assert.equal(unitConditions.candidate_count, 1, "equivalent pressure and temperature units normalize to the same conditions");

const incompleteConditions = Core.analyzeRecords([
  Core.__testNormalizeTrustedCandidate({ model: "H3S A", model_family: "family-a", formula: "H3S", structure_namespace: "test-fixture", structure_id: "h3s-pressure", stage: "dft", tc_K: 190, recommendation: "pressure missing" }, { verified: true, trustedSourceFamily: true, eligibleForConsensus: true, trustedEvidence: true }),
  Core.__testNormalizeTrustedCandidate({ model: "H3S B", model_family: "family-b", formula: "H3S", structure_namespace: "test-fixture", structure_id: "h3s-pressure", stage: "dft", tc_K: 200, recommendation: "pressure missing" }, { verified: true, trustedSourceFamily: true, eligibleForConsensus: true, trustedEvidence: true })
]);
assert.equal(incompleteConditions.agreement_count, 0, "unknown critical conditions cannot create formal Tc consensus");
const selfDeclaredConditions = Core.analyzeRecords([
  Core.__testNormalizeTrustedCandidate({ model: "Self A", model_family: "family-a", formula: "H3S", structure_namespace: "test-fixture", structure_id: "self-complete", stage: "dft", conditions_complete: true, tc_K: 190, recommendation: "self declared" }, { verified: true, trustedSourceFamily: true, eligibleForConsensus: true, trustedEvidence: true }),
  Core.__testNormalizeTrustedCandidate({ model: "Self B", model_family: "family-b", formula: "H3S", structure_namespace: "test-fixture", structure_id: "self-complete", stage: "dft", conditions_complete: true, tc_K: 200, recommendation: "self declared" }, { verified: true, trustedSourceFamily: true, eligibleForConsensus: true, trustedEvidence: true })
]);
assert.equal(selfDeclaredConditions.agreement_count, 0, "a payload cannot self-certify condition completeness");
const placeholderConditions = Core.analyzeRecords([
  trusted({ model: "Placeholder A", model_family: "family-a", formula: "H3S", structure_id: "placeholder-condition", stage: "dft", pressure_GPa: 200, doping: "N/A", functional: "unknown", tc_K: 190, recommendation: "placeholder conditions" }),
  trusted({ model: "Placeholder B", model_family: "family-b", formula: "H3S", structure_id: "placeholder-condition", stage: "dft", pressure_GPa: 200, doping: "N/A", functional: "unknown", tc_K: 200, recommendation: "placeholder conditions" })
]);
assert.equal(placeholderConditions.agreement_count, 0, "placeholder condition values are not complete even when an adapter asserts completeness");
for (const placeholder of ["N/A", "n.a.", "not specified"]) {
  const singlePlaceholderCondition = Core.analyzeRecords([
    trusted({ model: `Single A ${placeholder}`, model_family: "family-a", formula: "H3S", structure_id: "single-placeholder", stage: "dft", pressure_GPa: 200, doping: placeholder, functional: "PBE", tc_K: 190, recommendation: "placeholder doping only" }),
    trusted({ model: `Single B ${placeholder}`, model_family: "family-b", formula: "H3S", structure_id: "single-placeholder", stage: "dft", pressure_GPa: 200, doping: placeholder, functional: "PBE", tc_K: 200, recommendation: "placeholder doping only" })
  ]);
  assert.equal(singlePlaceholderCondition.agreement_count, 0, `${placeholder} doping cannot be hidden by normalization`);
}
assert.throws(
  () => trusted({ model: "Nested condition", model_family: "family-a", formula: "H3S", structure_id: "nested-condition", stage: "dft", conditions: { doping: "N/A", k_mesh: "unknown" }, tc_K: 190, recommendation: "nested placeholder" }),
  /TYPED_CONDITION_MUST_BE_TOP_LEVEL/,
  "typed physical conditions must use the validated top-level schema"
);
for (const conditions of ["N/A", "pressure=10GPa"]) {
  const malformedConditions = Core.analyzeRecords([
    trusted({ model: `Malformed A ${conditions}`, model_family: "family-a", formula: "H3S", structure_id: "malformed-conditions", stage: "dft", conditions, tc_K: 190, recommendation: "malformed conditions" }),
    trusted({ model: `Malformed B ${conditions}`, model_family: "family-b", formula: "H3S", structure_id: "malformed-conditions", stage: "dft", conditions, tc_K: 200, recommendation: "malformed conditions" })
  ]);
  assert.equal(malformedConditions.agreement_count, 0, "explicit non-object conditions cannot be ignored");
}

const dopingSplits = Core.analyzeRecords([
  trusted({ model: "Doping A", model_family: "family-a", formula: "La2CuO4", structure_id: "doping-condition", stage: "dft", doping: { value: 0.1, unit: "holes/f.u." }, tc_K: 30, recommendation: "doping 0.1" }),
  trusted({ model: "Doping B", model_family: "family-b", formula: "La2CuO4", structure_id: "doping-condition", stage: "dft", doping: { value: 0.2, unit: "holes/f.u." }, tc_K: 35, recommendation: "doping 0.2" }),
  trusted({ model: "Doping C", model_family: "family-c", formula: "La2CuO4", structure_id: "doping-condition", stage: "dft", doping: 0.1, doping_unit: "cm^-3", tc_K: 25, recommendation: "different unit" })
]);
assert.equal(dopingSplits.candidate_count, 3, "doping values and units remain separate identities");
assert.throws(() => trusted({ model: "Doping missing unit", model_family: "family-a", formula: "La2CuO4", structure_id: "doping-missing", stage: "dft", doping: 0.1, tc_K: 30, recommendation: "ambiguous doping" }), /MISSING_DOPING_UNIT/);
const deepDopingPlaceholder = Core.analyzeRecords([
  trusted({ model: "Deep doping A", model_family: "family-a", formula: "La2CuO4", structure_id: "deep-doping", stage: "dft", doping: { meta: { value: "N/A" } }, tc_K: 30, recommendation: "nested doping placeholder" }),
  trusted({ model: "Deep doping B", model_family: "family-b", formula: "La2CuO4", structure_id: "deep-doping", stage: "dft", doping: { meta: { value: "N/A" } }, tc_K: 31, recommendation: "nested doping placeholder" })
]);
assert.equal(deepDopingPlaceholder.agreement_count, 0, "deep condition placeholders cannot form consensus");

const hubbardUnitSplits = Core.analyzeRecords([
  trusted({ model: "U eV", model_family: "family-a", formula: "FeO", structure_id: "u-unit", stage: "dft", hubbard_u: 5, hubbard_u_unit: "eV", band_gap_eV: 1, recommendation: "U eV" }),
  trusted({ model: "U Ry", model_family: "family-b", formula: "FeO", structure_id: "u-unit", stage: "dft", hubbard_u: 5, hubbard_u_unit: "Ry", band_gap_eV: 1.1, recommendation: "U Ry" })
]);
assert.equal(hubbardUnitSplits.candidate_count, 2, "Hubbard U units cannot silently merge");
assert.throws(() => trusted({ model: "U missing", model_family: "family-a", formula: "FeO", structure_id: "u-missing", stage: "dft", hubbard_u: 5, band_gap_eV: 1, recommendation: "ambiguous U" }), /MISSING_HUBBARD_U_UNIT/);
const functionalObjects = Core.analyzeRecords([
  trusted({ model: "PBE object", model_family: "family-a", formula: "FeO", structure_id: "functional-object", stage: "dft", functional: { name: "PBE" }, band_gap_eV: 1, recommendation: "PBE" }),
  trusted({ model: "HSE object", model_family: "family-b", formula: "FeO", structure_id: "functional-object", stage: "dft", functional: { name: "HSE06" }, band_gap_eV: 1.1, recommendation: "HSE" })
]);
assert.equal(functionalObjects.candidate_count, 2, "structured functional names cannot collapse to object placeholders");
const nestedNamedPlaceholder = Core.analyzeRecords([
  trusted({ model: "Named placeholder A", model_family: "family-a", formula: "Si", structure_id: "named-placeholder", stage: "dft", gap_type: { value: "N/A" }, soc: { value: "unknown" }, band_gap_eV: 1, recommendation: "placeholder objects" }),
  trusted({ model: "Named placeholder B", model_family: "family-b", formula: "Si", structure_id: "named-placeholder", stage: "dft", gap_type: { value: "N/A" }, soc: { value: "unknown" }, band_gap_eV: 1.1, recommendation: "placeholder objects" })
]);
assert.equal(nestedNamedPlaceholder.agreement_count, 0, "nested named-condition placeholders block formal consensus");

const equivalentStrain = Core.analyzeRecords([
  trusted({ model: "Percent strain", model_family: "family-a", formula: "FeSe", structure_id: "strain-unit", stage: "dft", strain: 1, strain_unit: "%", band_gap_eV: 0.1, recommendation: "one percent" }),
  trusted({ model: "Fraction strain", model_family: "family-b", formula: "FeSe", structure_id: "strain-unit", stage: "dft", strain: 0.01, strain_unit: "fraction", band_gap_eV: 0.11, recommendation: "same strain" })
]);
assert.equal(equivalentStrain.candidate_count, 1, "equivalent strain units normalize together");

const spinAliasSplit = Core.analyzeRecords([
  trusted({ model: "SOC alias on", model_family: "family-a", formula: "Bi2Se3", structure_id: "soc-alias", stage: "dft", spin_orbit: true, band_gap_eV: 0.1, recommendation: "SOC on" }),
  trusted({ model: "SOC alias off", model_family: "family-b", formula: "Bi2Se3", structure_id: "soc-alias", stage: "dft", spin_orbit: false, band_gap_eV: 0.2, recommendation: "SOC off" })
]);
assert.equal(spinAliasSplit.candidate_count, 2, "spin_orbit alias participates in identity");

const structureSplits = Core.analyzeRecords([
  trusted({ model: "MP", model_family: "family-a", formula: "TiO2", structure_namespace: "materials_project", structure_id: "42", space_group: "P4_2/mnm", stage: "dft", band_gap_eV: 3, recommendation: "MP structure" }),
  trusted({ model: "COD", model_family: "family-b", formula: "TiO2", structure_namespace: "cod", structure_id: "42", space_group: "P4_2/mnm", stage: "dft", band_gap_eV: 3.1, recommendation: "COD structure" }),
  trusted({ model: "Conflicting SG", model_family: "family-c", formula: "TiO2", structure_namespace: "materials_project", structure_id: "42", space_group: "Cmcm", stage: "dft", band_gap_eV: 3.2, recommendation: "different SG" })
]);
assert.equal(structureSplits.candidate_count, 3, "database namespace and conflicting space groups stay separate");
const placeholderStructure = Core.analyzeRecords([
  trusted({ model: "Placeholder structure A", model_family: "family-a", formula: "FeSe", structure_id: "N/A", structure_namespace: "unknown", stage: "dft", tc_K: 8, recommendation: "placeholder structure" }),
  trusted({ model: "Placeholder structure B", model_family: "family-b", formula: "FeSe", structure_id: "N/A", structure_namespace: "unknown", stage: "dft", tc_K: 8.1, recommendation: "placeholder structure" })
]);
assert.equal(placeholderStructure.groups[0].identity_resolved, false);
assert.equal(placeholderStructure.agreement_count, 0, "placeholder structure identifiers never resolve identity");
const punctuatedPlaceholders = Core.analyzeRecords([
  Core.__testNormalizeTrustedCandidate({ model: "Punctuated A", model_family: "N.A.", formula: "FeSe", structure_id: "N.A.", structure_namespace: "unknown.", stage: "dft", tc_K: 8, recommendation: "punctuated placeholders" }, { verified: true, trustedSourceFamily: true, eligibleForConsensus: true, trustedEvidence: true, conditionsComplete: true }),
  Core.__testNormalizeTrustedCandidate({ model: "Punctuated B", model_family: "T.B.D.", formula: "FeSe", structure_id: "N.A.", structure_namespace: "unknown.", stage: "dft", tc_K: 8.1, recommendation: "punctuated placeholders" }, { verified: true, trustedSourceFamily: true, eligibleForConsensus: true, trustedEvidence: true, conditionsComplete: true })
]);
assert.equal(punctuatedPlaceholders.groups[0].identity_resolved, false);
assert.equal(punctuatedPlaceholders.agreement_count, 0, "punctuated placeholders cannot become structures or independent families");
const structuredSpaceGroups = Core.analyzeRecords([
  trusted({ model: "Space group A", model_family: "family-a", formula: "FeSe", structure_id: "space-group-object", space_group: { symbol: "P4/nmm" }, stage: "dft", tc_K: 8, recommendation: "P4/nmm" }),
  trusted({ model: "Space group B", model_family: "family-b", formula: "FeSe", structure_id: "space-group-object", space_group: { symbol: "Fm-3m" }, stage: "dft", tc_K: 8.1, recommendation: "Fm-3m" })
]);
assert.equal(structuredSpaceGroups.candidate_count, 2, "structured space groups cannot collapse to object strings");

assert.equal(Core.normalizeCandidate({ model: "A", formula: "FeSe", structure_namespace: "materials_project", structure_id: "mp-1", novelty_status: "no_match", data_cutoff: "2026-01-01", source: "Materials Project snapshot", recommendation: "screened" }).novelty_status, "screened_unverified");
assert.equal(Core.normalizeCandidate({ model: "A", formula: "FeSe", novelty_status: "unknown", recommendation: "unknown" }).novelty_status, "not_checked");
assert.equal(Core.normalizeCandidate({ model: "A", formula: "FeSe", structure_namespace: "materials_project", structure_id: "mp-1", novelty_status: "not_reported", data_cutoff: "2026-01-01", source: "Literature snapshot", recommendation: "screened" }).novelty_status, "screened_unverified");
const unsupportedNoveltyClaim = Core.analyzeRecords([{ model: "A", formula: "FeSe", structure_namespace: "materials_project", structure_id: "mp-1", novelty_status: "no_match", novelty_checked: true, recommendation: "self-declared no match" }]);
assert.equal(unsupportedNoveltyClaim.groups[0].novelty_status, "not_checked");
assert.ok(unsupportedNoveltyClaim.groups[0].next_steps.includes("novelty"));
const mixedNovelty = Core.analyzeRecords([
  { model: "A", formula: "FeSe", structure_namespace: "materials_project", structure_id: "mp-1", novelty_status: "screened_unverified", data_cutoff: "2026-01-01", source: "Materials Project snapshot", recommendation: "screened result" },
  { model: "B", formula: "FeSe", structure_namespace: "materials_project", structure_id: "mp-1", novelty_status: "not_checked", recommendation: "unchecked result" }
]);
assert.equal(mixedNovelty.groups[0].novelty_status, "mixed", "partial novelty screening is reported as mixed");

const trustedDemo = Core.analyzeRecords([
  trusted({ model: "Demo A", model_family: "family-a", formula: "FeSe", structure_id: "demo-s", target: "tc_K", stage: "dft", tc_K: 8, demo: true, recommendation: "demo" }),
  trusted({ model: "Demo B", model_family: "family-b", formula: "FeSe", structure_id: "demo-s", target: "tc_K", stage: "dft", tc_K: 8.1, demo: true, recommendation: "demo" })
]);
assert.equal(trustedDemo.agreement_count, 0, "demo records never create formal consensus");
const stringDemo = Core.analyzeRecords([
  trusted({ model: "String demo A", model_family: "family-a", formula: "FeSe", structure_id: "string-demo", target: "tc_K", stage: "dft", tc_K: 8, demo: "true", recommendation: "demo" }),
  trusted({ model: "String demo B", model_family: "family-b", formula: "FeSe", structure_id: "string-demo", target: "tc_K", stage: "dft", tc_K: 8.1, demo: "1", recommendation: "demo" })
]);
assert.equal(stringDemo.groups[0].demo_only, true);
assert.equal(stringDemo.agreement_count, 0, "string demo flags cannot create formal consensus");
const onDemo = trusted({ model: "On demo", model_family: "family-a", formula: "FeSe", structure_id: "on-demo", target: "tc_K", stage: "dft", tc_K: 8, demo: "on", recommendation: "demo" });
assert.equal(onDemo.demo, true);
assert.equal(onDemo.eligible_for_consensus, false);

const crossPropertyCalibration = trusted({
  model: "Calibrated Tc only",
  model_family: "family-a",
  formula: "FeSe",
  structure_id: "calibration-s",
  stage: "dft",
  tc_K: 10,
  e_above_hull_eV_atom: 0.02,
  calibration: { tc_K: { q90: 2, unit: "K", applicability: 0.9, validation_set: "tc-validation" } },
  recommendation: "property-specific calibration"
});
assert.ok(crossPropertyCalibration.calibration.tc_K);
assert.equal(crossPropertyCalibration.calibration.e_above_hull_eV_atom, undefined, "Tc error bars do not apply to hull energy");

const lowTemperatureConflict = Core.analyzeRecords([
  trusted({ model: "Low A", model_family: "family-a", formula: "FeSe", structure_id: "low-tc", target: "tc_K", stage: "dft", tc_K: 1, recommendation: "low Tc" }),
  trusted({ model: "Low B", model_family: "family-b", formula: "FeSe", structure_id: "low-tc", target: "tc_K", stage: "dft", tc_K: 9, recommendation: "higher Tc" })
]);
assert.equal(lowTemperatureConflict.groups[0].properties.tc_K.conflict, true);
assert.equal(lowTemperatureConflict.agreement_count, 0, "1 K and 9 K are not a low-temperature consensus");
const zeroTemperatureConflict = Core.analyzeRecords([
  trusted({ model: "Zero Tc", model_family: "family-a", formula: "FeSe", structure_id: "zero-tc", target: "tc_K", stage: "dft", tc_K: 0, recommendation: "no transition" }),
  trusted({ model: "One K", model_family: "family-b", formula: "FeSe", structure_id: "zero-tc", target: "tc_K", stage: "dft", tc_K: 1, recommendation: "finite transition" })
]);
assert.equal(zeroTemperatureConflict.groups[0].properties.tc_K.conflict, true);
assert.equal(zeroTemperatureConflict.agreement_count, 0, "0 K and a finite Tc are not consensus");

const weakExperimentConsensus = Core.analyzeRecords([
  trusted({ model: "Weak lab A", model_family: "lab-a", formula: "FeSe", structure_id: "weak-lab", target: "tc_K", stage: "experiment", tc_K: 8, recommendation: "no raw evidence" }),
  trusted({ model: "Weak lab B", model_family: "lab-b", formula: "FeSe", structure_id: "weak-lab", target: "tc_K", stage: "experiment", tc_K: 8.1, recommendation: "no raw evidence" })
]);
assert.equal(weakExperimentConsensus.agreement_count, 0, "unstructured experimental claims do not form numeric consensus");
const placeholderExperiment = trusted({ model: "Placeholder lab", model_family: "lab-placeholder", formula: "FeSe", structure_id: "placeholder-lab", target: "tc_K", stage: "experiment", tc_K: 8, experimental_method: "N/A", raw_data_url: "-", recommendation: "placeholder evidence" });
assert.equal(placeholderExperiment.claim_state, "model_candidate");
assert.equal(placeholderExperiment.eligible_for_consensus, false);
for (const raw_data_url of ["https://", "doi:", "urn:", "ipfs://", "s3://bucket", "https://example.org/%4e%2f%41", "doi:10.1234/n/a", "doi:10.1234/dataset/n/a"]) {
  const invalidReference = trusted({ model: `Bad raw ${raw_data_url}`, model_family: `bad-${raw_data_url}`, formula: "FeSe", structure_id: "bad-raw", target: "tc_K", stage: "experiment", tc_K: 8, experimental_method: "XRD", raw_data_url, recommendation: "invalid raw reference" });
  assert.equal(invalidReference.claim_state, "model_candidate");
  assert.equal(invalidReference.eligible_for_consensus, false);
}
for (const experimental_method of ["N/A.", "none."]) {
  const invalidMethod = trusted({ model: `Bad method ${experimental_method}`, model_family: `bad-method-${experimental_method}`, formula: "FeSe", structure_id: "bad-method", target: "tc_K", stage: "experiment", tc_K: 8, experimental_method, raw_data_url: "https://example.org/raw-data", recommendation: "invalid method" });
  assert.equal(invalidMethod.claim_state, "model_candidate");
  assert.equal(invalidMethod.eligible_for_consensus, false);
}
for (const experimental_method of [{ value: "N/A" }, { value: "unknown" }]) {
  assert.throws(
    () => trusted({ model: `Bad method object ${JSON.stringify(experimental_method)}`, model_family: `bad-method-object-${JSON.stringify(experimental_method)}`, formula: "FeSe", structure_id: "bad-method-object", target: "tc_K", stage: "experiment", tc_K: 8, experimental_method, raw_data_url: "https://example.org/raw-data", recommendation: "invalid method object" }),
    /INVALID_EXPERIMENTAL_METHOD/
  );
}

for (const raw_data_url of ["https://example.org/%252D", "https://example.org/dataset%2Fn%2Fa", "doi:10.1234/%256e%252f%2561"]) {
  const encodedPlaceholderReference = trusted({ model: `Encoded ${raw_data_url}`, model_family: `encoded-${raw_data_url}`, formula: "FeSe", structure_id: "encoded-raw", target: "tc_K", stage: "experiment", tc_K: 8, experimental_method: "XRD", raw_data_url, recommendation: "encoded placeholder evidence" });
  assert.equal(encodedPlaceholderReference.claim_state, "model_candidate");
  assert.equal(encodedPlaceholderReference.eligible_for_consensus, false, "encoded placeholder references fail closed");
}
const deeplyEncodedPlaceholder = Array.from({ length: 12 }).reduce(value => encodeURIComponent(value), "N/A");
const deeplyEncodedConditions = Core.analyzeRecords([
  trusted({ model: "Deep encoding A", model_family: "deep-encoding-a", formula: "FeSe", structure_id: "deep-encoding", functional: { name: deeplyEncodedPlaceholder }, stage: "dft", tc_K: 8, recommendation: "deep encoding" }),
  trusted({ model: "Deep encoding B", model_family: "deep-encoding-b", formula: "FeSe", structure_id: "deep-encoding", functional: { name: deeplyEncodedPlaceholder }, stage: "dft", tc_K: 8.1, recommendation: "deep encoding" })
]);
assert.equal(deeplyEncodedConditions.agreement_count, 0, "residual percent encoding fails closed in conditions");
const deeplyEncodedReference = trusted({ model: "Deep encoded raw", model_family: "deep-encoded-raw", formula: "FeSe", structure_id: "deep-encoded-raw", stage: "experiment", experimental_method: "XRD", raw_data_url: `https://example.org/${deeplyEncodedPlaceholder}`, tc_K: 8, recommendation: "deep encoded reference" });
assert.equal(deeplyEncodedReference.eligible_for_consensus, false, "residual percent encoding fails closed in raw evidence");

for (const placeholder of ["not applicable", "not known", "not determined", "to be determined", "not measured", "not calculated", "no data", "N/D", "pending", "pending review", "ｐｅｎｄｉｎｇ", "nil", "unavailable", "unknown (not measured)", "ＵＮＫＮＯＷＮ", "TBA", "ＴＢＡ", "TBA - will update", "Ｎ／Ａ", "undetermined", "无数据", "未确定", "未提供", "未提供，稍后更新", "未报告", "未测量", "未计算", "待定", "待定（稍后补充）", "待补充", "N%2FA", "N%252FA"]) {
  const placeholderPair = Core.analyzeRecords([
    trusted({ model: `Placeholder ${placeholder} A`, model_family: `placeholder-${placeholder}-a`, formula: "FeSe", structure_id: "expanded-placeholder", functional: placeholder, stage: "dft", tc_K: 8, recommendation: "placeholder" }),
    trusted({ model: `Placeholder ${placeholder} B`, model_family: `placeholder-${placeholder}-b`, formula: "FeSe", structure_id: "expanded-placeholder", functional: placeholder, stage: "dft", tc_K: 8.1, recommendation: "placeholder" })
  ]);
  assert.equal(placeholderPair.agreement_count, 0, `${placeholder} cannot certify complete conditions`);
}

const nestedNumericPlaceholder = Core.analyzeRecords([
  trusted({ model: "Nested numeric A", model_family: "nested-numeric-a", formula: "La2CuO4", structure_id: "nested-numeric", doping: { value: 0.1, unit: "holes/f.u.", carrier_type: "unknown" }, stage: "dft", tc_K: 20, recommendation: "nested placeholder" }),
  trusted({ model: "Nested numeric B", model_family: "nested-numeric-b", formula: "La2CuO4", structure_id: "nested-numeric", doping: { value: 0.1, unit: "holes/f.u.", carrier_type: "unknown" }, stage: "dft", tc_K: 20.1, recommendation: "nested placeholder" })
]);
assert.equal(nestedNumericPlaceholder.agreement_count, 0, "metadata beside a numeric condition value is validated");
assert.equal(trusted({ model: "Placeholder unit", model_family: "placeholder-unit", formula: "La2CuO4", structure_id: "placeholder-unit", doping: 0.1, doping_unit: "N/A", stage: "dft", tc_K: 20, recommendation: "placeholder unit" }).doping, "not provided");
assert.throws(() => trusted({ model: "Long unit", model_family: "long-unit", formula: "La2CuO4", structure_id: "long-unit", doping: 0.1, doping_unit: `${"u".repeat(80)}a`, stage: "dft", tc_K: 20, recommendation: "overlong unit" }), /CONDITION_UNIT_TOO_LONG/);

const objectFamily = Core.__testNormalizeTrustedCandidate({ model: "Object family", model_family: { value: "N/A" }, formula: "FeSe", structure_id: "object-family", stage: "dft", tc_K: 8, recommendation: "object family" }, { verified: true, trustedSourceFamily: true, eligibleForConsensus: true, trustedEvidence: true, conditionsComplete: true });
assert.equal(objectFamily.source_family_verified, false);
assert.equal(objectFamily.eligible_for_consensus, false, "structured placeholders cannot masquerade as a model family");

assert.equal(Core.normalizeCandidate({ model: "Object source", formula: "FeSe", structure_namespace: "test-fixture", structure_id: "object-source", novelty_status: "no_match", source: { value: "N/A" }, data_cutoff: "2026-01-01", recommendation: "object source" }).novelty_status, "not_checked");
for (const data_cutoff of ["0000-01-01", "2999-01-01"]) {
  assert.equal(Core.normalizeCandidate({ model: "Bad date", formula: "FeSe", structure_namespace: "test-fixture", structure_id: "bad-date", novelty_status: "no_match", source: "database snapshot", data_cutoff, recommendation: "bad snapshot date" }).novelty_status, "not_checked");
}

assert.throws(() => trusted({ model: "Long ID", model_family: "long-id", formula: "FeSe", structure_id: `${"x".repeat(240)}a`, stage: "dft", tc_K: 8, recommendation: "overlong identity" }), /STRUCTURE_ID_TOO_LONG/);
assert.throws(() => trusted({ model: "Long condition", model_family: "long-condition", formula: "FeSe", structure_id: "long-condition", functional: `${"x".repeat(240)}PBE`, stage: "dft", tc_K: 8, recommendation: "overlong condition" }), /CONDITION_TOO_LONG/);

const sharedExperimentEvidence = Core.analyzeRecords([
  trusted({ model: "Lab A", model_family: "lab-a", formula: "FeSe", structure_id: "shared-evidence", stage: "experiment", experimental_method: "XRD and transport", raw_data_url: "https://example.org/raw/shared-run", tc_K: 8, recommendation: "same run" }),
  trusted({ model: "Lab B", model_family: "lab-b", formula: "FeSe", structure_id: "shared-evidence", stage: "experiment", experimental_method: "XRD and transport", raw_data_url: "https://example.org/raw/shared-run", tc_K: 8.1, recommendation: "same run" })
]);
assert.equal(sharedExperimentEvidence.groups[0].properties.tc_K.eligible_family_count, 1);
assert.equal(sharedExperimentEvidence.agreement_count, 0, "one raw experiment cannot count as two independent supports");
const sharedExperimentFragment = Core.analyzeRecords([
  trusted({ model: "Fragment lab A", model_family: "fragment-lab-a", formula: "FeSe", structure_id: "shared-fragment", stage: "experiment", experimental_method: "XRD", raw_data_url: "https://example.org/raw/same", tc_K: 8, recommendation: "same raw data" }),
  trusted({ model: "Fragment lab B", model_family: "fragment-lab-b", formula: "FeSe", structure_id: "shared-fragment", stage: "experiment", experimental_method: "transport", raw_data_url: "https://example.org/raw/same#download", tc_K: 8.1, recommendation: "same raw data alias" })
]);
assert.equal(sharedExperimentFragment.groups[0].properties.tc_K.eligible_family_count, 1);
assert.equal(sharedExperimentFragment.agreement_count, 0, "URL fragments do not manufacture an independent experiment");
const sharedExperimentDoi = Core.analyzeRecords([
  trusted({ model: "DOI lab A", model_family: "doi-lab-a", formula: "FeSe", structure_id: "shared-doi-experiment", stage: "experiment", doi: "10.1234/same", experimental_method: "XRD", raw_data_url: "https://mirror-a.example.org/run", tc_K: 8, recommendation: "same publication" }),
  trusted({ model: "DOI lab B", model_family: "doi-lab-b", formula: "FeSe", structure_id: "shared-doi-experiment", stage: "experiment", doi: "doi:10.1234/SAME", experimental_method: "transport", raw_data_url: "https://mirror-b.example.org/run", tc_K: 8.1, recommendation: "same publication" })
]);
assert.equal(sharedExperimentDoi.groups[0].properties.tc_K.eligible_family_count, 1);
assert.equal(sharedExperimentDoi.agreement_count, 0, "different mirrors of one DOI are one publication-level support");

const sharedLiteratureEvidence = Core.analyzeRecords([
  trusted({ model: "Paper parser A", model_family: "paper-a", formula: "FeSe", structure_id: "shared-paper", stage: "literature", doi: "10.1234/shared.paper", tc_K: 8, recommendation: "same paper" }),
  trusted({ model: "Paper parser B", model_family: "paper-b", formula: "FeSe", structure_id: "shared-paper", stage: "literature", doi: "https://doi.org/10.1234/shared.paper", tc_K: 8.1, recommendation: "same paper" })
]);
assert.equal(sharedLiteratureEvidence.groups[0].properties.tc_K.eligible_family_count, 1);
assert.equal(sharedLiteratureEvidence.agreement_count, 0, "one DOI cannot count as two independent supports");

const sharedDftEvidence = Core.analyzeRecords([
  trusted({ model: "DFT parser A", model_family: "dft-a", formula: "FeSe", structure_id: "shared-dft", stage: "dft", doi: "10.1234/shared.dft", raw_data_url: "https://example.org/calculation/shared", source: "shared DFT run", tc_K: 8, recommendation: "same calculation" }),
  trusted({ model: "DFT parser B", model_family: "dft-b", formula: "FeSe", structure_id: "shared-dft", stage: "dft", doi: "doi:10.1234/SHARED.DFT", raw_data_url: "https://example.org/calculation/shared", source: "shared DFT run", tc_K: 8.1, recommendation: "same calculation" })
]);
assert.equal(sharedDftEvidence.groups[0].properties.tc_K.eligible_family_count, 1);
assert.equal(sharedDftEvidence.agreement_count, 0, "one DFT run or publication cannot count as two independent model supports");

const distinctDftSourceUrls = Core.analyzeRecords([
  trusted({ model: "URL DFT A", model_family: "url-dft-a", evidence_id: "", formula: "FeSe", structure_id: "source-url-dft", stage: "dft", source: "https://example.org/runs/a", tc_K: 8, recommendation: "independent URL A" }),
  trusted({ model: "URL DFT B", model_family: "url-dft-b", evidence_id: "", formula: "FeSe", structure_id: "source-url-dft", stage: "dft", source: "https://example.org/runs/b", tc_K: 8.1, recommendation: "independent URL B" })
]);
assert.equal(distinctDftSourceUrls.agreement_count, 1, "distinct run URLs remain independent supports");
const aliasedDftSourceUrls = Core.analyzeRecords([
  trusted({ model: "Alias DFT A", model_family: "alias-dft-a", evidence_id: "", formula: "FeSe", structure_id: "source-url-alias", stage: "dft", source: "https://example.org/runs/same", tc_K: 8, recommendation: "same URL" }),
  trusted({ model: "Alias DFT B", model_family: "alias-dft-b", evidence_id: "", formula: "FeSe", structure_id: "source-url-alias", stage: "dft", source: "https://example.org/runs/same?utm_source=mirror#download", tc_K: 8.1, recommendation: "same URL alias" })
]);
assert.equal(aliasedDftSourceUrls.agreement_count, 0, "fragment aliases of one run URL count once");
const crossFieldDftUrl = Core.analyzeRecords([
  trusted({ model: "Cross field A", model_family: "cross-field-a", evidence_id: "", formula: "FeSe", structure_id: "cross-field-url", stage: "dft", source: "https://example.org/run/shared#source", tc_K: 8, recommendation: "URL in source" }),
  trusted({ model: "Cross field B", model_family: "cross-field-b", evidence_id: "", formula: "FeSe", structure_id: "cross-field-url", stage: "dft", raw_data_url: "https://example.org/run/shared", tc_K: 8.1, recommendation: "URL in raw data" })
]);
assert.equal(crossFieldDftUrl.agreement_count, 0, "the same URL deduplicates across source and raw-data fields");
const credentialAliasDftUrl = Core.analyzeRecords([
  trusted({ model: "Credential A", model_family: "credential-a", evidence_id: "", formula: "FeSe", structure_id: "credential-url", stage: "dft", raw_data_url: "https://alice@example.org/run/shared", tc_K: 8, recommendation: "credential alias" }),
  trusted({ model: "Credential B", model_family: "credential-b", evidence_id: "", formula: "FeSe", structure_id: "credential-url", stage: "dft", raw_data_url: "https://bob:secret@example.org/run/shared#download", tc_K: 8.1, recommendation: "credential alias" })
]);
assert.equal(credentialAliasDftUrl.agreement_count, 0, "URL credentials do not manufacture an independent evidence resource");
const dnsRootDotAlias = Core.analyzeRecords([
  trusted({ model: "DNS alias A", model_family: "dns-alias-a", evidence_id: "", formula: "FeSe", structure_id: "dns-root-dot", stage: "dft", raw_data_url: "https://example.org/run/same", tc_K: 8, recommendation: "DNS name" }),
  trusted({ model: "DNS alias B", model_family: "dns-alias-b", evidence_id: "", formula: "FeSe", structure_id: "dns-root-dot", stage: "dft", raw_data_url: "https://example.org./run/same", tc_K: 8.1, recommendation: "absolute DNS name" })
]);
assert.equal(dnsRootDotAlias.agreement_count, 0, "a trailing DNS root dot does not manufacture a new evidence host");
const distinctEvidenceIds = Core.analyzeRecords([
  trusted({ model: "Run ID A", model_family: "run-id-a", evidence_id: "run:alpha", formula: "FeSe", structure_id: "run-id-dft", stage: "dft", source: "shared compute service", tc_K: 8, recommendation: "run A" }),
  trusted({ model: "Run ID B", model_family: "run-id-b", evidence_id: "run:beta", formula: "FeSe", structure_id: "run-id-dft", stage: "dft", source: "shared compute service", tc_K: 8.1, recommendation: "run B" })
]);
assert.equal(distinctEvidenceIds.agreement_count, 1, "distinct stable run IDs override a generic shared service label");
const sharedSourceWithDistinctIds = Core.analyzeRecords([
  trusted({ model: "Shared source ID A", model_family: "shared-source-id-a", evidence_id: "declared-a", formula: "FeSe", structure_id: "shared-source-ids", stage: "dft", source: "https://example.org/runs/shared", tc_K: 8, recommendation: "same underlying source" }),
  trusted({ model: "Shared source ID B", model_family: "shared-source-id-b", evidence_id: "declared-b", formula: "FeSe", structure_id: "shared-source-ids", stage: "dft", source: "https://example.org/runs/shared#mirror", tc_K: 8.1, recommendation: "same underlying source" })
]);
assert.equal(sharedSourceWithDistinctIds.agreement_count, 0, "a shared source URL links records even when declared evidence IDs differ");

for (const stage of ["dft", "ml", "literature", "independent_reproduction"]) {
  const noProvenance = Core.analyzeRecords([
    Core.__testNormalizeTrustedCandidate({ model: `No provenance ${stage} A`, model_family: `no-provenance-${stage}-a`, formula: "FeSe", structure_namespace: "test-fixture", structure_id: `no-provenance-${stage}`, stage, tc_K: 8, recommendation: "missing provenance" }, { verified: true, trustedSourceFamily: true, eligibleForConsensus: true, trustedEvidence: true, conditionsComplete: true }),
    Core.__testNormalizeTrustedCandidate({ model: `No provenance ${stage} B`, model_family: `no-provenance-${stage}-b`, formula: "FeSe", structure_namespace: "test-fixture", structure_id: `no-provenance-${stage}`, stage, tc_K: 8.1, recommendation: "missing provenance" }, { verified: true, trustedSourceFamily: true, eligibleForConsensus: true, trustedEvidence: true, conditionsComplete: true })
  ]);
  assert.equal(noProvenance.agreement_count, 0, `${stage} claims without traceable provenance cannot form consensus`);
}
const freeTextProvenance = Core.analyzeRecords([
  trusted({ model: "Text source A", model_family: "text-source-a", evidence_id: "", formula: "FeSe", structure_id: "text-source", stage: "dft", source: "calculation A", tc_K: 8, recommendation: "free text is not a traceable run" }),
  trusted({ model: "Text source B", model_family: "text-source-b", evidence_id: "", formula: "FeSe", structure_id: "text-source", stage: "dft", source: "calculation B", tc_K: 8.1, recommendation: "free text is not a traceable run" })
]);
assert.equal(freeTextProvenance.agreement_count, 0, "free-text provenance labels do not satisfy the traceability gate");
assert.equal(freeTextProvenance.groups[0].records.every(record => !record.eligible_for_consensus), true);

for (const [leftReference, rightReference] of [
  ["https://doi.org/10.1234/same.raw", "doi:10.1234/SAME.RAW"],
  ["https://doi.org/10.1234/same.raw?utm_source=mirror#download", "doi:10.1234/SAME.RAW"],
  ["https://dx.doi.org/10.1234/same.raw/", "doi:10.1234/SAME.RAW"],
  ["https://example.org/raw/%7Erun", "https://example.org/raw/~run#download"],
  ["s3://DATA-BUCKET/path/%7Erun", "s3://data-bucket/path/~run#download"]
]) {
  const aliasedRawEvidence = Core.analyzeRecords([
    trusted({ model: `Raw alias A ${leftReference}`, model_family: `raw-alias-a-${leftReference}`, evidence_id: "", formula: "FeSe", structure_id: "raw-aliases", stage: "experiment", experimental_method: "XRD", raw_data_url: leftReference, tc_K: 8, recommendation: "raw alias" }),
    trusted({ model: `Raw alias B ${rightReference}`, model_family: `raw-alias-b-${rightReference}`, evidence_id: "", formula: "FeSe", structure_id: "raw-aliases", stage: "experiment", experimental_method: "transport", raw_data_url: rightReference, tc_K: 8.1, recommendation: "raw alias" })
  ]);
  assert.equal(aliasedRawEvidence.agreement_count, 0, "equivalent raw-reference aliases count once");
}
const ipfsCid = `Qm${"1".repeat(44)}`;
const ipfsCidV1 = `b${"a".repeat(24)}`;
for (const [leftReference, rightReference] of [
  [`ipfs://${ipfsCid}/data`, `ipfs://${ipfsCid}/data#download`],
  [`ipfs://${ipfsCid}/data?download=1`, `ipfs://${ipfsCid}/data?download=2`],
  ["urn:example:run123", "urn:example:run123#download"],
  ["urn:example:run123?download=1", "urn:example:run123?download=2"],
  ["urn:example:run123", "URN:EXAMPLE:run123"],
  ["urn:example:%72un%2D123", "urn:example:run-123"],
  [`ipfs://${ipfsCidV1}/data`, `IPFS://${ipfsCidV1.toUpperCase()}/data`],
  ["doi:10.1234/nonhttp", "doi:10.1234/nonhttp#download"]
]) {
  const nonHttpAlias = Core.analyzeRecords([
    trusted({ model: `Non-HTTP A ${leftReference}`, model_family: `non-http-a-${leftReference}`, evidence_id: "", formula: "FeSe", structure_id: "non-http-alias", stage: "experiment", experimental_method: "XRD", raw_data_url: leftReference, tc_K: 8, recommendation: "non-HTTP alias" }),
    trusted({ model: `Non-HTTP B ${rightReference}`, model_family: `non-http-b-${rightReference}`, evidence_id: "", formula: "FeSe", structure_id: "non-http-alias", stage: "experiment", experimental_method: "transport", raw_data_url: rightReference, tc_K: 8.1, recommendation: "non-HTTP alias" })
  ]);
  assert.equal(nonHttpAlias.agreement_count, 0, "URI fragments do not manufacture a second evidence resource");
}
for (const [leftReference, rightReference] of [
  ["https://example.org/run.json?cacheBust=1", "https://example.org/run.json?cacheBust=2"],
  ["https://storage.googleapis.com/bucket/object?X-Goog-Algorithm=A&X-Goog-Signature=111", "https://storage.googleapis.com/bucket/object?X-Goog-Algorithm=B&X-Goog-Signature=222"],
  ["https://bucket.s3.amazonaws.com/object?AWSAccessKeyId=AAA&Signature=111&Expires=1", "https://bucket.s3.amazonaws.com/object?AWSAccessKeyId=BBB&Signature=222&Expires=2"],
  ["https://account.blob.core.windows.net/container/object?sv=1&se=1&sp=r&sig=111", "https://account.blob.core.windows.net/container/object?sv=2&se=2&sp=rw&sig=222"]
]) {
  const signedUrlAlias = Core.analyzeRecords([
    trusted({ model: `Signed A ${leftReference}`, model_family: `signed-a-${leftReference}`, evidence_id: "", formula: "FeSe", structure_id: "signed-url-alias", stage: "dft", raw_data_url: leftReference, tc_K: 8, recommendation: "signed URL" }),
    trusted({ model: `Signed B ${rightReference}`, model_family: `signed-b-${rightReference}`, evidence_id: "", formula: "FeSe", structure_id: "signed-url-alias", stage: "dft", raw_data_url: rightReference, tc_K: 8.1, recommendation: "refreshed signed URL" })
  ]);
  assert.equal(signedUrlAlias.agreement_count, 0, "refreshed cloud signatures do not manufacture independent evidence");
}

const frozenTrustedRecord = trusted({ model: "Frozen", model_family: "frozen-family", formula: "FeSe", structure_id: "frozen-record", stage: "dft", tc_K: 8, recommendation: "immutable trusted record" });
assert.equal(Object.isFrozen(frozenTrustedRecord), true);
assert.equal(Object.isFrozen(frozenTrustedRecord.properties), true, "trusted records and nested values are immutable");

const publicTrustAttempt = Core.normalizeCandidate({ model: "Public A", model_family: "public-a", formula: "FeSe", structure_namespace: "test-fixture", structure_id: "public-trust", stage: "dft", tc_K: 8, recommendation: "public trust attempt" }, { verified: true, trustedSourceFamily: true, eligibleForConsensus: true, trustedEvidence: true, conditionsComplete: true });
assert.equal(publicTrustAttempt.eligible_for_consensus, false, "public defaults cannot enable trusted evidence");
const forgedSchemaConsensus = Core.analyzeRecords([
  { ...publicTrustAttempt, model: "Forged A", model_family: "forged-a", source_family_verified: true, eligible_for_consensus: true, conditions_complete: true },
  { ...publicTrustAttempt, model: "Forged B", model_family: "forged-b", source_family_verified: true, eligible_for_consensus: true, conditions_complete: true, properties: { tc_K: 8.1 } }
]);
assert.equal(forgedSchemaConsensus.agreement_count, 0, "a caller cannot forge trust flags on a schema-shaped object");

const metalGapConflict = Core.analyzeRecords([
  trusted({ model: "Metal", model_family: "family-a", formula: "Si", structure_id: "gap-phase", stage: "dft", band_gap_eV: 0, recommendation: "metal" }),
  trusted({ model: "Gapped", model_family: "family-b", formula: "Si", structure_id: "gap-phase", stage: "dft", band_gap_eV: 0.2, recommendation: "finite gap" })
]);
assert.equal(metalGapConflict.groups[0].properties.band_gap_eV.conflict, true, "metallic and finite-gap states are a qualitative conflict");
assert.equal(metalGapConflict.agreement_count, 0);

const unverifiedReview = Core.analyzeRecords([{
  model: "Unverified DFT",
  model_family: "declared-family",
  formula: "FeSe",
  structure_id: "mp-1",
  stage: "dft",
  target: "tc_K",
  tc_K: 20,
  e_above_hull_eV_atom: 0.01,
  recommendation: "self-declared calculation"
}]);
assert.equal(unverifiedReview.groups[0].priority.level, "insufficient");
assert.ok(unverifiedReview.groups[0].next_steps.includes("verification"));
assert.ok(unverifiedReview.groups[0].next_steps.includes("stability"));
assert.ok(unverifiedReview.groups[0].next_steps.includes("target"));

const parsedCsv = Core.parseInputText("model,formula,stage,tc_K,recommendation\nA,FeSe,dft,8.5,Verify\n", "result.csv");
assert.equal(parsedCsv.length, 1);
assert.equal(Core.normalizePayload(parsedCsv).records[0].properties.tc_K, 8.5);

const campaign = Core.campaignManifest({
  target: "tc_K",
  target_value: 40,
  allowed_elements: "Fe, Se, S",
  excluded_elements: "Pb, Cd"
});
assert.equal(campaign.schema, Core.CAMPAIGN_SCHEMA);
assert.deepEqual(campaign.objective.allowed_elements, ["Fe", "Se", "S"]);
assert.equal(campaign.security.credentials_included, false);
assert.equal(campaign.security.paid_job_submitted, false);
assert.doesNotMatch(JSON.stringify(campaign), /api[_-]?key|access[_-]?key|token/i);

const markdown = Core.createMarkdownReport(conflict, { target: "tc_K", target_value: 40 }, "zh");
assert.match(markdown, /不能证明材料从未被发现/);
assert.match(markdown, /不是材料成功概率或模型置信度/);
assert.match(markdown, /MgB2/);

const modulePath = require.resolve("../github-pages/material-consensus.js");
delete require.cache[modulePath];
const publicCore = require(modulePath);
assert.equal(publicCore.__testNormalizeTrustedCandidate, undefined, "the trusted test adapter is absent from the default CommonJS and browser API");

console.log("Material consensus tests passed");
