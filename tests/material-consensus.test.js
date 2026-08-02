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

// The local chair creates one independent report per worker, remains outside the
// evidence count, and is deterministic under import-order changes.
const chairInputs = [
  { model: "GPT planning", model_family: "gpt", formula: "FeSe", stage: "task_planning", recommendation: "Resolve the structure and run DFT." },
  { model: "DeepSeek planning", model_family: "deepseek", formula: "SeFe", stage: "task_planning", recommendation: "Check structure, stability, and literature." }
];
const chairA = Core.createOrchestration(chairInputs, { target: "stability" });
const chairB = Core.createOrchestration([...chairInputs].reverse(), { target: "stability" });
assert.equal(chairA.schema, Core.ORCHESTRATION_SCHEMA);
assert.equal(chairA.model_reports.length, 2);
assert.equal(chairA.host.scientific_evidence_contribution, 0);
assert.equal(chairA.synthesis.analysis.model_count, 2);
assert.equal(chairA.orchestration_id, chairB.orchestration_id);
assert.deepEqual(chairA.model_reports.map(report => report.report_id), chairB.model_reports.map(report => report.report_id));
assert.deepEqual(chairA.tasks.map(task => task.task_id), chairB.tasks.map(task => task.task_id));

const equivalentFormulaForward = Core.createOrchestration([
  { model: "Equivalent", model_family: "equivalent", formula: "FeSe", stage: "task_planning", recommendation: "Same plan" },
  { model: "Equivalent", model_family: "equivalent", formula: "SeFe", stage: "task_planning", recommendation: "Same plan" }
]);
const equivalentFormulaReverse = Core.createOrchestration([
  { model: "Equivalent", model_family: "equivalent", formula: "SeFe", stage: "task_planning", recommendation: "Same plan" },
  { model: "Equivalent", model_family: "equivalent", formula: "FeSe", stage: "task_planning", recommendation: "Same plan" }
]);
assert.equal(equivalentFormulaForward.orchestration_id, equivalentFormulaReverse.orchestration_id, "equivalent formula display aliases have a deterministic winner");
assert.deepEqual(equivalentFormulaForward.model_reports, equivalentFormulaReverse.model_reports);

const hostExcluded = Core.analyzeRecords([
  ...chairInputs,
  { role: "host", model: "Materials Research Chair", model_family: "chair", formula: "FeSe", stage: "dft", tc_K: 999, recommendation: "Host narrative must not become evidence." }
]);
assert.equal(hostExcluded.model_count, 2);
assert.equal(hostExcluded.groups.some(group => group.models.includes("Materials Research Chair")), false);

const oneWorkerPlan = Core.createOrchestration([chairInputs[0]]);
const twoWorkerPlan = Core.createOrchestration(chairInputs);
const oneWorkerTaskIds = new Set(oneWorkerPlan.tasks.map(task => task.task_id));
assert.equal(twoWorkerPlan.tasks.some(task => oneWorkerTaskIds.has(task.task_id)), false, "changing the source/owner manifest creates new tamper-evident task IDs");
assert.ok(twoWorkerPlan.tasks.every(task => /^task-manifest-[a-f0-9]{16}$/.test(task.manifest_digest)));

const taskPackage = Core.createTaskPackage(chairA);
assert.equal(taskPackage.schema, Core.TASK_PACKAGE_SCHEMA);
assert.equal(taskPackage.security.credentials_included, false);
assert.equal(taskPackage.security.paid_job_submitted, false);
assert.ok(taskPackage.tasks.every(task => task.paid_job_submitted === false));
assert.doesNotMatch(JSON.stringify(taskPackage), /api[_-]?key|client[_-]?secret|bearer\s+/i);
const redactedCampaignPlan = Core.createOrchestration(chairInputs, { target: "api_key=TOP-SECRET" });
assert.doesNotMatch(JSON.stringify(redactedCampaignPlan), /TOP-SECRET/);

// Canonical records remain idempotent after JSON persistence, including empty
// or custom condition maps and task/evidence links.
const roundTripTaskId = chairA.tasks[0].task_id;
const roundTripA = Core.normalizeCandidate({
  model: "Roundtrip",
  model_family: "roundtrip-family",
  formula: "FeSe",
  structure_namespace: "test-fixture",
  structure_id: "roundtrip-structure",
  stage: "dft",
  tc_K: 8,
  extra_conditions: { k_mesh: "8x8x8" },
  evidence_ids: ["run:roundtrip-001"],
  assigned_task_id: roundTripTaskId,
  recommendation: "Round-trip record"
});
const roundTripB = Core.normalizeCandidate(JSON.parse(JSON.stringify(roundTripA)));
assert.deepEqual(roundTripB.extra_conditions, { k_mesh: "8x8x8" });
assert.equal(roundTripB.extra_conditions_invalid, false);
assert.deepEqual(roundTripB.evidence_ids, ["run:roundtrip-001"]);
assert.equal(roundTripB.assigned_task_id, roundTripTaskId);
const emptyExtraRoundTrip = Core.normalizeCandidate(Core.normalizeCandidate({ model: "Empty extra", formula: "FeSe", recommendation: "empty extra" }));
assert.equal(emptyExtraRoundTrip.extra_conditions_invalid, false);
const kMeshSplit = Core.analyzeRecords([
  Core.normalizeCandidate(Core.normalizeCandidate({ model: "Mesh A", formula: "FeSe", structure_namespace: "test-fixture", structure_id: "mesh", stage: "dft", tc_K: 8, extra_conditions: { k_mesh: "8x8x8" }, recommendation: "mesh" })),
  Core.normalizeCandidate(Core.normalizeCandidate({ model: "Mesh B", formula: "FeSe", structure_namespace: "test-fixture", structure_id: "mesh", stage: "dft", tc_K: 8, extra_conditions: { k_mesh: "12x12x12" }, recommendation: "mesh" }))
]);
assert.equal(kMeshSplit.candidate_count, 2);

assert.throws(() => Core.normalizeCandidate({ model: "Bad", formula: "FeSe", tc_K: { value: 8, mean: false }, recommendation: "bad" }), /INVALID_PROPERTY_VALUE/);
assert.throws(() => Core.normalizeCandidate({ model: "Bad", formula: "FeSe", tc_K: { value: 8, mean: 100 }, recommendation: "bad" }), /CONFLICTING_PROPERTY_ALIASES/);
assert.throws(() => Core.normalizeCandidate({ model: "Bad", formula: "FeSe", pressure_GPa: { value: 0, mean: 10 }, recommendation: "bad" }), /CONFLICTING_PRESSURE_VALUE_ALIASES/);
assert.throws(() => Core.normalizeCandidate({ model: "Bad", formula: "FeSe", functional: "PBE", dft_functional: "LDA", recommendation: "bad" }), /CONFLICTING_CONDITION_ALIASES/);
assert.throws(() => Core.normalizeCandidate({ model: "Bad", formula: "FeSe", conditions: { api_key: "SECRET" }, recommendation: "bad" }), /SENSITIVE_CREDENTIAL/);
assert.throws(() => Core.normalizeCandidate({ model: "Bad", formula: "FeSe", tc_K: "0x10", recommendation: "bad" }), /INVALID_PROPERTY_VALUE/);
assert.equal(Core.normalizeCandidate({ model: "Legal", model_family: "robotbcontroller", formula: "FeSe", structure_namespace: "test-fixture", structure_id: "testbatch-run-001", recommendation: "legal identifiers" }).structure_identity_resolved, true);
assert.equal(Object.isFrozen(Core.PROPERTY_META.tc_K), true);

const noFormulaDifferentStructures = Core.analyzeRecords([
  trusted({ model: "Text structure A", model_family: "text-structure-a", structure_namespace: "test-fixture", structure_id: "structure-1", stage: "dft", tc_K: 8.1, recommendation: "Identical recommendation for the candidate" }),
  trusted({ model: "Text structure B", model_family: "text-structure-b", structure_namespace: "test-fixture", structure_id: "structure-2", stage: "dft", tc_K: 8.2, recommendation: "Identical recommendation for the candidate" })
]);
assert.equal(noFormulaDifferentStructures.candidate_count, 2, "text similarity never merges distinct structure identities");
assert.equal(noFormulaDifferentStructures.agreement_count, 0);

const trustedWithCompleteness = (input, conditionsComplete) => Core.__testNormalizeTrustedCandidate({
  evidence_id: input.evidence_id || `run:${String(input.model || "executor").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${String(input.structure_id || "candidate").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${String(input.assigned_task_id || "seed").slice(-8)}`,
  ...input,
  ...(input.structure_id && !input.structure_namespace && !input.structure_hash ? { structure_namespace: "test-fixture" } : {})
}, {
  verified: true,
  trustedSourceFamily: true,
  eligibleForConsensus: true,
  trustedEvidence: true,
  conditionsComplete
});

// Structure returns create independent polymorph branches; the unresolved
// parent leaves active synthesis but remains in the audit/task history.
const unresolvedSeedForTasks = trustedWithCompleteness({
  model: "Seed model",
  model_family: "seed-family",
  evidence_id: "run:seed-unresolved-001",
  formula: "FeSe",
  target: "tc_K",
  stage: "dft",
  tc_K: 8,
  recommendation: "Resolve this composition"
}, false);
const unresolvedPlan = Core.createOrchestration([unresolvedSeedForTasks], { target: "tc_K" });
const structureTask = unresolvedPlan.tasks.find(task => task.step === "structure");
assert.ok(structureTask);
const polymorphAResult = trustedWithCompleteness({
  model: "CrystalStructureGen",
  model_family: "crystalstructuregen",
  evidence_id: "run:polymorph-a-001",
  formula: "FeSe",
  structure_id: "polymorph-a",
  target: "tc_K",
  stage: "dft",
  tc_K: 8,
  assigned_task_id: structureTask.task_id,
  recommendation: "Resolved polymorph A"
}, false);
const polymorphBResult = trustedWithCompleteness({
  model: "CrystalStructureGen",
  model_family: "crystalstructuregen",
  evidence_id: "run:polymorph-b-001",
  formula: "FeSe",
  structure_id: "polymorph-b",
  target: "tc_K",
  stage: "dft",
  tc_K: 8,
  assigned_task_id: structureTask.task_id,
  recommendation: "Resolved polymorph B"
}, false);
const branchedPlan = Core.createOrchestration(
  [unresolvedSeedForTasks, polymorphAResult, polymorphBResult],
  { target: "tc_K" },
  { tasks: unresolvedPlan.tasks }
);
assert.equal(branchedPlan.synthesis.analysis.candidate_count, 2);
assert.ok(branchedPlan.synthesis.analysis.groups.every(group => group.identity_resolved));
assert.equal(branchedPlan.tasks.find(task => task.task_id === structureTask.task_id).status, "verified");
const branchConditionTasks = branchedPlan.tasks.filter(task => task.step === "conditions" && task.status !== "superseded");
assert.equal(branchConditionTasks.length, 2);
assert.equal(new Set(branchConditionTasks.map(task => task.candidate_key)).size, 2);
assert.equal(new Set(branchedPlan.tasks.map(task => task.task_id)).size, branchedPlan.tasks.length, "task IDs are unique across branches");
assert.ok(branchedPlan.final_report.superseded_task_ids.length > 0);
const branchedPackage = Core.createTaskPackage(branchedPlan);
assert.equal(branchedPackage.tasks.some(task => task.status === "superseded"), false);
assert.ok(branchedPackage.superseded_tasks.length > 0);

const polymorphAConditionTask = branchConditionTasks.find(task => task.source_identity_key === polymorphAResult.identity_key);
assert.ok(polymorphAConditionTask);
const conditionsResultA = trustedWithCompleteness({
  model: "CrystalStructureGen",
  model_family: "crystalstructuregen",
  evidence_id: "run:conditions-a-001",
  formula: "FeSe",
  structure_id: "polymorph-a",
  target: "tc_K",
  stage: "dft",
  tc_K: 8,
  extra_conditions: { sample: "batch-a" },
  assigned_task_id: polymorphAConditionTask.task_id,
  recommendation: "Completed batch-A conditions"
}, true);
const conditionsPlan = Core.createOrchestration(
  [unresolvedSeedForTasks, polymorphAResult, polymorphBResult, conditionsResultA],
  { target: "tc_K" },
  { tasks: branchedPlan.tasks }
);
assert.equal(conditionsPlan.synthesis.analysis.candidate_count, 2);
assert.ok(conditionsPlan.synthesis.analysis.groups.some(group => group.extra_conditions.sample === "batch-a"));
assert.equal(conditionsPlan.tasks.find(task => task.task_id === polymorphAConditionTask.task_id).status, "verified");
const batchAStabilityTask = conditionsPlan.tasks.find(task => task.step === "stability"
  && task.status !== "superseded"
  && task.condition_state.extra_conditions.sample === "batch-a");
assert.ok(batchAStabilityTask);
const wrongOldConditionResult = trustedWithCompleteness({
  model: "Quantum Espresso",
  model_family: "quantum-espresso",
  evidence_id: "run:wrong-old-condition-001",
  formula: "FeSe",
  structure_id: "polymorph-a",
  target: "tc_K",
  stage: "dft",
  formation_energy_eV_atom: -0.2,
  assigned_task_id: batchAStabilityTask.task_id,
  recommendation: "Wrongly omitted batch-A condition"
}, true);
const wrongConditionPlan = Core.createOrchestration(
  [unresolvedSeedForTasks, polymorphAResult, polymorphBResult, conditionsResultA, wrongOldConditionResult],
  { target: "tc_K" },
  { tasks: conditionsPlan.tasks }
);
assert.notEqual(wrongConditionPlan.tasks.find(task => task.task_id === batchAStabilityTask.task_id).status, "verified");
assert.ok(wrongConditionPlan.synthesis.mismatched_return_task_ids.includes(batchAStabilityTask.task_id));
assert.equal(wrongConditionPlan.synthesis.analysis.groups.some(group => group.extra_conditions.sample === "batch-a"), true);

// Space group and executor authorization are part of task lineage.
const spaceGroupSeed = trusted({
  model: "Quantum Espresso",
  model_family: "quantum-espresso",
  evidence_id: "run:space-group-seed-001",
  formula: "FeSe",
  structure_id: "sg-structure",
  space_group: "P4/nmm",
  target: "stability",
  stage: "dft",
  recommendation: "Need stability"
});
const spaceGroupPlan = Core.createOrchestration([spaceGroupSeed], { target: "stability" });
const spaceGroupStabilityTask = spaceGroupPlan.tasks.find(task => task.step === "stability");
const validSpaceGroupReturn = trusted({
  model: "Quantum Espresso",
  model_family: "quantum-espresso",
  evidence_id: "run:space-group-valid-001",
  formula: "FeSe",
  structure_id: "sg-structure",
  space_group: "P4/nmm",
  target: "stability",
  stage: "dft",
  e_above_hull_eV_atom: 0.01,
  assigned_task_id: spaceGroupStabilityTask.task_id,
  recommendation: "Same-space-group stability"
});
const validSpaceGroupPlan = Core.createOrchestration([spaceGroupSeed, validSpaceGroupReturn], { target: "stability" }, { tasks: spaceGroupPlan.tasks });
assert.equal(validSpaceGroupPlan.tasks.find(task => task.task_id === spaceGroupStabilityTask.task_id).status, "verified");
const wrongSpaceGroupReturn = trusted({
  model: "Quantum Espresso",
  model_family: "quantum-espresso",
  evidence_id: "run:space-group-wrong-001",
  formula: "FeSe",
  structure_id: "sg-structure",
  space_group: "Fm-3m",
  target: "stability",
  stage: "dft",
  e_above_hull_eV_atom: 0.01,
  assigned_task_id: spaceGroupStabilityTask.task_id,
  recommendation: "Different-space-group result"
});
const wrongSpaceGroupPlan = Core.createOrchestration([spaceGroupSeed, wrongSpaceGroupReturn], { target: "stability" }, { tasks: spaceGroupPlan.tasks });
assert.notEqual(wrongSpaceGroupPlan.tasks.find(task => task.task_id === spaceGroupStabilityTask.task_id).status, "verified");
assert.ok(wrongSpaceGroupPlan.synthesis.mismatched_return_task_ids.includes(spaceGroupStabilityTask.task_id));

const ownerSeed = trustedWithCompleteness({
  model: "OwnerA",
  model_family: "owner-a",
  evidence_id: "run:owner-seed-001",
  formula: "FeSe",
  structure_id: "owner-structure",
  target: "tc_K",
  stage: "dft",
  tc_K: 8,
  recommendation: "Conditions incomplete"
}, false);
const ownerPlan = Core.createOrchestration([ownerSeed], { target: "tc_K" });
const ownerConditionTask = ownerPlan.tasks.find(task => task.step === "conditions");
const intruderReturn = trustedWithCompleteness({
  model: "Intruder",
  model_family: "intruder",
  evidence_id: "run:intruder-001",
  formula: "FeSe",
  structure_id: "owner-structure",
  target: "tc_K",
  stage: "dft",
  tc_K: 8.1,
  assigned_task_id: ownerConditionTask.task_id,
  recommendation: "Unauthorized completion"
}, true);
const intruderPlan = Core.createOrchestration([ownerSeed, intruderReturn], { target: "tc_K" }, { tasks: ownerPlan.tasks });
assert.notEqual(intruderPlan.tasks.find(task => task.task_id === ownerConditionTask.task_id).status, "verified");
assert.ok(intruderPlan.synthesis.unauthorized_return_task_ids.includes(ownerConditionTask.task_id));
assert.equal(intruderPlan.synthesis.quarantined_return_record_count, 1);
assert.equal(intruderPlan.synthesis.analysis.groups[0].models.includes("Intruder"), false);

const unknownTaskReturn = trusted({
  model: "Unknown return",
  model_family: "unknown-return",
  evidence_id: "run:return-task-001",
  formula: "FeSe",
  structure_id: "unknown-task-structure",
  stage: "dft",
  tc_K: 8,
  assigned_task_id: "material-task-1234567890abcdef",
  recommendation: "Unknown task return"
});
const unknownTaskPlan = Core.createOrchestration([unknownTaskReturn]);
assert.ok(unknownTaskPlan.synthesis.unmatched_return_task_ids.includes("material-task-1234567890abcdef"));
assert.equal(unknownTaskPlan.synthesis.analysis.candidate_count, 0, "unknown linked returns are quarantined from synthesis");
assert.equal(unknownTaskPlan.final_report.execution_status, "partial");

// Conflict closure requires an accepted, same-lineage, trusted supersession.
const conflictARecord = trusted({ model: "Conflict A", model_family: "conflict-a", evidence_id: "run:conflict-a-001", formula: "MgB2", structure_id: "conflict-structure", target: "tc_K", stage: "dft", tc_K: 8, recommendation: "Conflict A" });
const conflictBRecord = trusted({ model: "Conflict B", model_family: "conflict-b", evidence_id: "run:conflict-b-001", formula: "MgB2", structure_id: "conflict-structure", target: "tc_K", stage: "dft", tc_K: 100, recommendation: "Conflict B" });
const conflictPlan = Core.createOrchestration([conflictARecord, conflictBRecord], { target: "tc_K" });
const conflictTask = conflictPlan.tasks.find(task => task.step === "conflict");
assert.ok(conflictTask);
const wrongConflictCorrection = trusted({
  model: "Conflict B",
  model_family: "conflict-b",
  evidence_id: "run:conflict-wrong-001",
  formula: "MgB2",
  structure_id: "conflict-structure",
  target: "tc_K",
  stage: "independent_reproduction",
  tc_K: 8.1,
  supersedes_evidence_id: "run:absent-ref-999",
  assigned_task_id: conflictTask.task_id,
  recommendation: "Invalid supersession reference"
});
const wrongConflictPlan = Core.createOrchestration([conflictARecord, conflictBRecord, wrongConflictCorrection], { target: "tc_K" }, { tasks: conflictPlan.tasks });
assert.notEqual(wrongConflictPlan.tasks.find(task => task.task_id === conflictTask.task_id).status, "verified");
assert.equal(wrongConflictPlan.synthesis.superseded_evidence_ids.length, 0);
assert.equal(wrongConflictPlan.synthesis.conflict_count, 1, "same-model contradictory runs stay visible until explicitly superseded");
const validConflictCorrection = trusted({
  model: "Conflict B",
  model_family: "conflict-b",
  evidence_id: "run:conflict-valid-001",
  formula: "MgB2",
  structure_id: "conflict-structure",
  target: "tc_K",
  stage: "independent_reproduction",
  tc_K: 8.1,
  supersedes_evidence_ids: [conflictBRecord.evidence_id],
  assigned_task_id: conflictTask.task_id,
  recommendation: "Audited correction"
});
const resolvedConflictPlan = Core.createOrchestration([conflictARecord, conflictBRecord, validConflictCorrection], { target: "tc_K" }, { tasks: conflictPlan.tasks });
assert.equal(resolvedConflictPlan.tasks.find(task => task.task_id === conflictTask.task_id).status, "verified");
assert.equal(resolvedConflictPlan.synthesis.conflict_count, 0);
assert.deepEqual(resolvedConflictPlan.synthesis.superseded_evidence_ids, [conflictBRecord.evidence_id]);

// A target-specific experiment cannot be completed with an unrelated stability
// measurement, and a fully satisfied candidate needs no artificial task.
const targetExperimentSeed = trusted({ model: "Target seed", model_family: "target-seed", evidence_id: "run:target-seed-001", formula: "FeSe", structure_id: "target-experiment", target: "tc_K", stage: "dft", tc_K: 8, recommendation: "Need experiment" });
const targetExperimentPlan = Core.createOrchestration([targetExperimentSeed], { target: "tc_K" });
const targetExperimentTask = targetExperimentPlan.tasks.find(task => task.step === "experiment");
const unrelatedExperimentReturn = trusted({
  model: "NSRL",
  model_family: "nsrl",
  evidence_id: "run:unrelated-experiment-001",
  formula: "FeSe",
  structure_id: "target-experiment",
  target: "tc_K",
  stage: "experiment",
  e_above_hull_eV_atom: 0.01,
  experimental_method: "XRD and calorimetry",
  raw_data_url: "https://example.org/raw/unrelated-experiment",
  assigned_task_id: targetExperimentTask.task_id,
  recommendation: "Stability only"
});
const unrelatedExperimentPlan = Core.createOrchestration([targetExperimentSeed, unrelatedExperimentReturn], { target: "tc_K" }, { tasks: targetExperimentPlan.tasks });
assert.notEqual(unrelatedExperimentPlan.tasks.find(task => task.task_id === targetExperimentTask.task_id).status, "verified");

const completeRecords = [
  trusted({ model: "Stable A", model_family: "stable-a", evidence_id: "run:stable-a-001", formula: "FeSe", structure_id: "complete-candidate", target: "stability", stage: "dft", e_above_hull_eV_atom: 0.01, novelty_status: "known_reference", source: "https://example.org/reference/a", recommendation: "Stable A" }),
  trusted({ model: "Stable B", model_family: "stable-b", evidence_id: "run:stable-b-001", formula: "FeSe", structure_id: "complete-candidate", target: "stability", stage: "dft", e_above_hull_eV_atom: 0.012, novelty_status: "known_reference", source: "https://example.org/reference/b", recommendation: "Stable B" }),
  trusted({ model: "Complete lab", model_family: "complete-lab", evidence_id: "run:complete-lab-001", formula: "FeSe", structure_id: "complete-candidate", target: "stability", stage: "experiment", e_above_hull_eV_atom: 0.011, novelty_status: "known_reference", source: "https://example.org/reference/lab", experimental_method: "XRD and calorimetry", raw_data_url: "https://example.org/raw/complete-lab", recommendation: "Experimental support" })
];
const completePlan = Core.createOrchestration(completeRecords, { target: "stability" });
assert.equal(completePlan.tasks.length, 0);
assert.equal(completePlan.final_report.execution_status, "complete");
assert.equal(completePlan.final_report.claim_status, "experimentally_supported_candidate");

const rewrittenStructureResult = trustedWithCompleteness({
  model: "CrystalStructureGen",
  model_family: "crystalstructuregen",
  evidence_id: "run:rewritten-structure-001",
  formula: "FeSe",
  structure_id: "rewritten-polymorph",
  target: "tc_K",
  stage: "dft",
  tc_K: 200,
  assigned_task_id: structureTask.task_id,
  recommendation: "Structure result must not rewrite Tc"
}, false);
const rewrittenStructurePlan = Core.createOrchestration(
  [unresolvedSeedForTasks, rewrittenStructureResult],
  { target: "tc_K" },
  { tasks: unresolvedPlan.tasks }
);
assert.notEqual(rewrittenStructurePlan.tasks.find(task => task.task_id === structureTask.task_id).status, "verified");
assert.ok(rewrittenStructurePlan.synthesis.invalid_return_task_ids.includes(structureTask.task_id));
assert.equal(rewrittenStructurePlan.synthesis.analysis.groups[0].identity_resolved, false);

const unresolvedStructureSourceA = trustedWithCompleteness({ model: "Structure source A", model_family: "structure-source-a", evidence_id: "run:structure-source-a", formula: "FeSe", target: "tc_K", stage: "dft", tc_K: 8, recommendation: "source A" }, false);
const unresolvedStructureSourceB = trustedWithCompleteness({ model: "Structure source B", model_family: "structure-source-b", evidence_id: "run:structure-source-b", formula: "FeSe", target: "tc_K", stage: "dft", tc_K: 9, recommendation: "source B" }, false);
const multiSourceStructurePlan = Core.createOrchestration([unresolvedStructureSourceA, unresolvedStructureSourceB], { target: "tc_K" });
const multiSourceStructureTask = multiSourceStructurePlan.tasks.find(task => task.step === "structure");
const onlyFirstStructureReturn = trustedWithCompleteness({ model: "CrystalStructureGen", model_family: "crystalstructuregen", evidence_id: "run:structure-only-first", formula: "FeSe", structure_id: "coverage-polymorph", target: "tc_K", stage: "dft", tc_K: 8, assigned_task_id: multiSourceStructureTask.task_id, recommendation: "only source A covered" }, false);
const incompleteStructureCoveragePlan = Core.createOrchestration(
  [unresolvedStructureSourceA, unresolvedStructureSourceB, onlyFirstStructureReturn],
  { target: "tc_K" },
  { tasks: multiSourceStructurePlan.tasks }
);
assert.notEqual(incompleteStructureCoveragePlan.tasks.find(task => task.task_id === multiSourceStructureTask.task_id).status, "verified");
assert.ok(incompleteStructureCoveragePlan.synthesis.invalid_return_task_ids.includes(multiSourceStructureTask.task_id));
assert.equal(incompleteStructureCoveragePlan.synthesis.analysis.groups[0].identity_resolved, false);
assert.deepEqual(incompleteStructureCoveragePlan.synthesis.analysis.groups[0].records.map(record => record.properties.tc_K).sort((a, b) => a - b), [8, 9]);
const secondStructureReturn = trustedWithCompleteness({ model: "CrystalStructureGen", model_family: "crystalstructuregen", evidence_id: "run:structure-second", formula: "FeSe", structure_id: "coverage-polymorph", target: "tc_K", stage: "dft", tc_K: 9, assigned_task_id: multiSourceStructureTask.task_id, recommendation: "source B covered" }, false);
const completeStructureCoveragePlan = Core.createOrchestration(
  [unresolvedStructureSourceA, unresolvedStructureSourceB, onlyFirstStructureReturn, secondStructureReturn],
  { target: "tc_K" },
  { tasks: multiSourceStructurePlan.tasks }
);
assert.equal(completeStructureCoveragePlan.tasks.find(task => task.task_id === multiSourceStructureTask.task_id).status, "verified");
assert.ok(completeStructureCoveragePlan.synthesis.analysis.groups.every(group => group.identity_resolved));
assert.deepEqual(completeStructureCoveragePlan.synthesis.analysis.groups.flatMap(group => group.records.map(record => record.properties.tc_K)).sort((a, b) => a - b), [8, 9]);

const lateStructureSourceA = trustedWithCompleteness({
  model: "Late structure source A",
  model_family: "late-structure-source-a",
  evidence_id: "run:late-structure-source-a",
  formula: "FeSe",
  target: "tc_K",
  stage: "dft",
  tc_K: 8,
  recommendation: "Create a frozen structure task for source A"
}, false);
const lateStructureInitialPlan = Core.createOrchestration([lateStructureSourceA], { target: "tc_K" });
const lateStructureOriginalTask = lateStructureInitialPlan.tasks.find(task => task.step === "structure");
const lateStructureSourceB = trustedWithCompleteness({
  model: "Late structure source B",
  model_family: "late-structure-source-b",
  evidence_id: "run:late-structure-source-b",
  formula: "FeSe",
  target: "tc_K",
  stage: "dft",
  tc_K: 9,
  recommendation: "Arrived after source A's task snapshot"
}, false);
const lateStructureReturnA = trustedWithCompleteness({
  model: "CrystalStructureGen",
  model_family: "crystalstructuregen",
  evidence_id: "run:late-structure-return-a",
  formula: "FeSe",
  structure_id: "late-structure-polymorph-a",
  target: "tc_K",
  stage: "dft",
  tc_K: 8,
  assigned_task_id: lateStructureOriginalTask.task_id,
  recommendation: "Resolve only frozen source A"
}, false);
const lateStructureMigrationPlan = Core.createOrchestration(
  [lateStructureSourceA, lateStructureSourceB, lateStructureReturnA],
  { target: "tc_K" },
  { tasks: lateStructureInitialPlan.tasks }
);
assert.equal(lateStructureMigrationPlan.tasks.find(task => task.task_id === lateStructureOriginalTask.task_id).status, "verified");
const activeLateStructureSourceB = lateStructureMigrationPlan.synthesis.analysis.groups.flatMap(group => group.records)
  .find(record => record.evidence_ids.includes(lateStructureSourceB.evidence_id));
assert.ok(activeLateStructureSourceB, "a source added after the frozen migration snapshot remains active");
assert.equal(activeLateStructureSourceB.properties.tc_K, 9);
const lateStructureRemainderTasks = lateStructureMigrationPlan.tasks.filter(task => task.step === "structure"
  && task.task_id !== lateStructureOriginalTask.task_id
  && task.status !== "superseded");
assert.equal(lateStructureRemainderTasks.length, 1);
assert.deepEqual(lateStructureRemainderTasks[0].required_property_values.tc_K, [9]);
assert.deepEqual(lateStructureRemainderTasks[0].required_source_claims.flatMap(claim => claim.evidence_ids), [lateStructureSourceB.evidence_id]);

const duplicateStructureExpandedPlan = Core.createOrchestration(
  [lateStructureSourceA, lateStructureSourceB],
  { target: "tc_K" }
);
const duplicateStructureExpandedTask = duplicateStructureExpandedPlan.tasks.find(task => task.step === "structure");
const duplicateStructureNarrowReturn = trustedWithCompleteness({
  model: "CrystalStructureGen",
  model_family: "crystalstructuregen",
  evidence_id: "run:duplicate-structure-narrow-return",
  formula: "FeSe",
  structure_id: "duplicate-authority-polymorph-x",
  target: "tc_K",
  stage: "dft",
  tc_K: 8,
  assigned_task_id: lateStructureOriginalTask.task_id,
  recommendation: "One return for the narrow structure task"
}, false);
const duplicateStructureExpandedReturnA = trustedWithCompleteness({
  model: "CrystalStructureGen",
  model_family: "crystalstructuregen",
  evidence_id: "run:duplicate-structure-expanded-return-a",
  formula: "FeSe",
  structure_id: "duplicate-authority-polymorph-x",
  target: "tc_K",
  stage: "dft",
  tc_K: 8,
  assigned_task_id: duplicateStructureExpandedTask.task_id,
  recommendation: "Expanded task return covering source A"
}, false);
const duplicateStructureExpandedReturnB = trustedWithCompleteness({
  model: "CrystalStructureGen",
  model_family: "crystalstructuregen",
  evidence_id: "run:duplicate-structure-expanded-return-b",
  formula: "FeSe",
  structure_id: "duplicate-authority-polymorph-x",
  target: "tc_K",
  stage: "dft",
  tc_K: 9,
  assigned_task_id: duplicateStructureExpandedTask.task_id,
  recommendation: "Expanded task return covering source B"
}, false);
const duplicateStructureAuthorityPlan = Core.createOrchestration(
  [
    lateStructureSourceA,
    lateStructureSourceB,
    duplicateStructureNarrowReturn,
    duplicateStructureExpandedReturnA,
    duplicateStructureExpandedReturnB
  ],
  { target: "tc_K" },
  { tasks: [...lateStructureInitialPlan.tasks, ...duplicateStructureExpandedPlan.tasks] }
);
assert.equal(duplicateStructureAuthorityPlan.tasks.find(task => task.task_id === duplicateStructureExpandedTask.task_id).status, "verified");
assert.equal(duplicateStructureAuthorityPlan.tasks.find(task => task.task_id === lateStructureOriginalTask.task_id).status, "superseded");
const duplicateStructureBranchRecords = duplicateStructureAuthorityPlan.synthesis.analysis.groups
  .flatMap(group => group.records)
  .filter(record => record.structure_id === "duplicate-authority-polymorph-x");
assert.deepEqual(new Set(duplicateStructureBranchRecords.map(record => record.evidence_id)), new Set([
  duplicateStructureNarrowReturn.evidence_id,
  duplicateStructureExpandedReturnA.evidence_id,
  duplicateStructureExpandedReturnB.evidence_id
]));
const duplicateStructureDownstreamTasks = duplicateStructureAuthorityPlan.tasks.filter(task =>
  task.status !== "superseded"
  && task.source_identity_key === duplicateStructureExpandedReturnA.identity_key
  && task.step !== "structure");
assert.ok(duplicateStructureDownstreamTasks.length > 0);
duplicateStructureDownstreamTasks.forEach(task => {
  assert.ok(task.depends_on.includes(duplicateStructureExpandedTask.task_id));
  assert.equal(task.depends_on.includes(lateStructureOriginalTask.task_id), false);
});

const duplicateStructureDistinctBranchReturn = trustedWithCompleteness({
  model: "CrystalStructureGen",
  model_family: "crystalstructuregen",
  evidence_id: "run:duplicate-structure-distinct-branch",
  formula: "FeSe",
  structure_id: "duplicate-authority-polymorph-y",
  target: "tc_K",
  stage: "dft",
  tc_K: 8,
  assigned_task_id: lateStructureOriginalTask.task_id,
  recommendation: "A distinct resolved branch retains its own migration provenance"
}, false);
const distinctStructureBranchesPlan = Core.createOrchestration(
  [
    lateStructureSourceA,
    lateStructureSourceB,
    duplicateStructureDistinctBranchReturn,
    duplicateStructureExpandedReturnA,
    duplicateStructureExpandedReturnB
  ],
  { target: "tc_K" },
  { tasks: [...lateStructureInitialPlan.tasks, ...duplicateStructureExpandedPlan.tasks] }
);
assert.equal(distinctStructureBranchesPlan.tasks.find(task => task.task_id === duplicateStructureExpandedTask.task_id).status, "verified");
assert.equal(distinctStructureBranchesPlan.tasks.find(task => task.task_id === lateStructureOriginalTask.task_id).status, "verified");
for (const [branchRecord, expectedParentId, excludedParentId] of [
  [duplicateStructureExpandedReturnA, duplicateStructureExpandedTask.task_id, lateStructureOriginalTask.task_id],
  [duplicateStructureDistinctBranchReturn, lateStructureOriginalTask.task_id, duplicateStructureExpandedTask.task_id]
]) {
  const downstream = distinctStructureBranchesPlan.tasks.filter(task => task.status !== "superseded"
    && task.source_identity_key === branchRecord.identity_key
    && task.step !== "structure");
  assert.ok(downstream.length > 0);
  downstream.forEach(task => {
    assert.ok(task.depends_on.includes(expectedParentId));
    assert.equal(task.depends_on.includes(excludedParentId), false);
  });
}

const nestedNarrowStructureBranchPlan = Core.createOrchestration(
  [lateStructureSourceA, duplicateStructureNarrowReturn],
  { target: "tc_K" },
  { tasks: lateStructureInitialPlan.tasks }
);
const nestedExpandedStructureBranchPlan = Core.createOrchestration(
  [lateStructureSourceA, lateStructureSourceB, duplicateStructureExpandedReturnA, duplicateStructureExpandedReturnB],
  { target: "tc_K" },
  { tasks: duplicateStructureExpandedPlan.tasks }
);
const nestedNarrowConditionsTask = nestedNarrowStructureBranchPlan.tasks.find(task => task.step === "conditions"
  && task.source_identity_key === duplicateStructureNarrowReturn.identity_key
  && task.status !== "superseded");
const nestedExpandedConditionsTask = nestedExpandedStructureBranchPlan.tasks.find(task => task.step === "conditions"
  && task.source_identity_key === duplicateStructureExpandedReturnA.identity_key
  && task.status !== "superseded");
assert.ok(nestedNarrowConditionsTask.depends_on.includes(lateStructureOriginalTask.task_id));
assert.ok(nestedExpandedConditionsTask.depends_on.includes(duplicateStructureExpandedTask.task_id));
assert.equal(nestedNarrowConditionsTask.candidate_key, nestedExpandedConditionsTask.candidate_key);
assert.equal(nestedNarrowConditionsTask.source_identity_key, nestedExpandedConditionsTask.source_identity_key);
const nestedNarrowConditionsReturn = trustedWithCompleteness({
  model: "CrystalStructureGen",
  model_family: "crystalstructuregen",
  evidence_id: "run:nested-narrow-conditions-return",
  formula: "FeSe",
  structure_id: "duplicate-authority-polymorph-x",
  target: "tc_K",
  stage: "dft",
  tc_K: 8,
  extra_conditions: { sample: "nested-alpha" },
  assigned_task_id: nestedNarrowConditionsTask.task_id,
  recommendation: "Complete the narrow branch conditions"
}, true);
const nestedExpandedConditionsReturnA = trustedWithCompleteness({
  model: "CrystalStructureGen",
  model_family: "crystalstructuregen",
  evidence_id: "run:nested-expanded-conditions-return-a",
  formula: "FeSe",
  structure_id: "duplicate-authority-polymorph-x",
  target: "tc_K",
  stage: "dft",
  tc_K: 8,
  extra_conditions: { sample: "nested-beta" },
  assigned_task_id: nestedExpandedConditionsTask.task_id,
  recommendation: "Complete expanded source A conditions"
}, true);
const nestedExpandedConditionsReturnB = trustedWithCompleteness({
  model: "CrystalStructureGen",
  model_family: "crystalstructuregen",
  evidence_id: "run:nested-expanded-conditions-return-b",
  formula: "FeSe",
  structure_id: "duplicate-authority-polymorph-x",
  target: "tc_K",
  stage: "dft",
  tc_K: 9,
  extra_conditions: { sample: "nested-beta" },
  assigned_task_id: nestedExpandedConditionsTask.task_id,
  recommendation: "Complete expanded source B conditions"
}, true);
const nestedDuplicateMigrationTasks = [
  ...lateStructureInitialPlan.tasks,
  ...duplicateStructureExpandedPlan.tasks,
  ...nestedNarrowStructureBranchPlan.tasks,
  ...nestedExpandedStructureBranchPlan.tasks
];
const nestedDuplicateMigrationPlan = Core.createOrchestration(
  [
    lateStructureSourceA,
    lateStructureSourceB,
    duplicateStructureNarrowReturn,
    duplicateStructureExpandedReturnA,
    duplicateStructureExpandedReturnB,
    nestedNarrowConditionsReturn,
    nestedExpandedConditionsReturnA,
    nestedExpandedConditionsReturnB
  ],
  { target: "tc_K" },
  { tasks: nestedDuplicateMigrationTasks }
);
for (const taskId of [
  lateStructureOriginalTask.task_id,
  duplicateStructureExpandedTask.task_id,
  nestedNarrowConditionsTask.task_id,
  nestedExpandedConditionsTask.task_id
]) {
  assert.equal(nestedDuplicateMigrationPlan.tasks.find(task => task.task_id === taskId).status, "verified");
}
const nestedActiveTasks = nestedDuplicateMigrationPlan.tasks.filter(task => task.status !== "superseded");
const nestedActiveTaskIds = new Set(nestedActiveTasks.map(task => task.task_id));
nestedActiveTasks.forEach(task => task.depends_on.forEach(dependencyId => {
  assert.ok(nestedActiveTaskIds.has(dependencyId), `protected nested migration task ${task.task_id} has an active dependency closure`);
}));
assert.ok(nestedDuplicateMigrationPlan.tasks.find(task => task.task_id === nestedNarrowConditionsTask.task_id)
  .depends_on.every(dependencyId => nestedDuplicateMigrationPlan.tasks.find(task => task.task_id === dependencyId).status === "verified"));

const partialDuplicateMigrationBaseRecords = [
  lateStructureSourceA,
  lateStructureSourceB,
  duplicateStructureNarrowReturn,
  duplicateStructureExpandedReturnA,
  duplicateStructureExpandedReturnB
];
const partialDuplicateMigrationRun = (conditionReturns, previousTasks) => Core.createOrchestration(
  [...partialDuplicateMigrationBaseRecords, ...conditionReturns],
  { target: "tc_K" },
  { tasks: previousTasks }
);
const partialMigrationActiveSignature = plan => plan.tasks.filter(task => task.status !== "superseded")
  .map(task => ({
    task_id: task.task_id,
    status: task.status,
    depends_on: task.depends_on,
    required_source_record_keys: task.required_source_claims.map(claim => claim.source_record_key)
  }))
  .sort((left, right) => left.task_id.localeCompare(right.task_id));
const assertPartialConditionsRemainder = (plan, expectedEvidenceIds) => {
  const activeTasks = plan.tasks.filter(task => task.status !== "superseded");
  const activeTaskIds = new Set(activeTasks.map(task => task.task_id));
  activeTasks.forEach(task => task.depends_on.forEach(dependencyId => assert.ok(activeTaskIds.has(dependencyId))));
  const remainderTasks = activeTasks.filter(task => task.step === "conditions"
    && ![nestedNarrowConditionsTask.task_id, nestedExpandedConditionsTask.task_id].includes(task.task_id));
  assert.equal(remainderTasks.length, 1, "the still-incomplete assigned structure returns receive one remainder conditions task");
  assert.deepEqual(remainderTasks[0].required_source_claims.flatMap(claim => claim.evidence_ids).sort(), [...expectedEvidenceIds].sort());
  assert.ok(remainderTasks[0].candidate_key.includes("|remainder:"));
};

const narrowOnlyPartialForwardPlan = partialDuplicateMigrationRun(
  [nestedNarrowConditionsReturn],
  nestedDuplicateMigrationTasks
);
const narrowOnlyPartialReversePlan = partialDuplicateMigrationRun(
  [nestedNarrowConditionsReturn],
  [...nestedDuplicateMigrationTasks].reverse()
);
for (const plan of [narrowOnlyPartialForwardPlan, narrowOnlyPartialReversePlan]) {
  assert.equal(plan.tasks.find(task => task.task_id === nestedNarrowConditionsTask.task_id).status, "verified");
  assertPartialConditionsRemainder(plan, [
    duplicateStructureExpandedReturnA.evidence_id,
    duplicateStructureExpandedReturnB.evidence_id
  ]);
}
assert.deepEqual(partialMigrationActiveSignature(narrowOnlyPartialForwardPlan), partialMigrationActiveSignature(narrowOnlyPartialReversePlan));

const expandedOnlyPartialForwardPlan = partialDuplicateMigrationRun(
  [nestedExpandedConditionsReturnA, nestedExpandedConditionsReturnB],
  nestedDuplicateMigrationTasks
);
const expandedOnlyPartialReversePlan = partialDuplicateMigrationRun(
  [nestedExpandedConditionsReturnA, nestedExpandedConditionsReturnB],
  [...nestedDuplicateMigrationTasks].reverse()
);
for (const plan of [expandedOnlyPartialForwardPlan, expandedOnlyPartialReversePlan]) {
  assert.equal(plan.tasks.find(task => task.task_id === nestedExpandedConditionsTask.task_id).status, "verified");
  assertPartialConditionsRemainder(plan, [duplicateStructureNarrowReturn.evidence_id]);
}
assert.deepEqual(partialMigrationActiveSignature(expandedOnlyPartialForwardPlan), partialMigrationActiveSignature(expandedOnlyPartialReversePlan));

const lateConditionsSourceA = trustedWithCompleteness({
  model: "Late conditions source A",
  model_family: "late-conditions-source-a",
  evidence_id: "run:late-conditions-source-a",
  formula: "FeSe",
  structure_id: "late-conditions-structure",
  target: "tc_K",
  stage: "dft",
  tc_K: 8,
  recommendation: "Create a frozen conditions task for source A"
}, false);
const lateConditionsInitialPlan = Core.createOrchestration([lateConditionsSourceA], { target: "tc_K" });
const lateConditionsOriginalTask = lateConditionsInitialPlan.tasks.find(task => task.step === "conditions");
const lateConditionsSourceB = trustedWithCompleteness({
  model: "Late conditions source B",
  model_family: "late-conditions-source-b",
  evidence_id: "run:late-conditions-source-b",
  formula: "FeSe",
  structure_id: "late-conditions-structure",
  target: "tc_K",
  stage: "dft",
  tc_K: 9,
  recommendation: "Arrived after source A's conditions snapshot"
}, false);
const lateConditionsReturnA = trustedWithCompleteness({
  model: "Late conditions source A",
  model_family: "late-conditions-source-a",
  evidence_id: "run:late-conditions-return-a",
  formula: "FeSe",
  structure_id: "late-conditions-structure",
  target: "tc_K",
  stage: "dft",
  tc_K: 8,
  extra_conditions: { sample: "late-batch-a" },
  assigned_task_id: lateConditionsOriginalTask.task_id,
  recommendation: "Complete only frozen source A conditions"
}, true);
const lateConditionsMigrationPlan = Core.createOrchestration(
  [lateConditionsSourceA, lateConditionsSourceB, lateConditionsReturnA],
  { target: "tc_K" },
  { tasks: lateConditionsInitialPlan.tasks }
);
assert.equal(lateConditionsMigrationPlan.tasks.find(task => task.task_id === lateConditionsOriginalTask.task_id).status, "verified");
const activeLateConditionsSourceB = lateConditionsMigrationPlan.synthesis.analysis.groups.flatMap(group => group.records)
  .find(record => record.evidence_ids.includes(lateConditionsSourceB.evidence_id));
assert.ok(activeLateConditionsSourceB, "a late source survives a frozen conditions migration");
assert.equal(activeLateConditionsSourceB.properties.tc_K, 9);
const lateConditionsRemainderTasks = lateConditionsMigrationPlan.tasks.filter(task => task.step === "conditions"
  && task.task_id !== lateConditionsOriginalTask.task_id
  && task.status !== "superseded");
assert.equal(lateConditionsRemainderTasks.length, 1);
assert.deepEqual(lateConditionsRemainderTasks[0].required_property_values.tc_K, [9]);
assert.deepEqual(lateConditionsRemainderTasks[0].required_source_claims.flatMap(claim => claim.evidence_ids), [lateConditionsSourceB.evidence_id]);

const truncatedStructureManifest = JSON.parse(JSON.stringify(multiSourceStructurePlan.tasks));
const truncatedStructureTask = truncatedStructureManifest.find(task => task.task_id === multiSourceStructureTask.task_id);
truncatedStructureTask.required_source_claims = truncatedStructureTask.required_source_claims.slice(0, 1);
const rejectedTruncatedManifestPlan = Core.createOrchestration(
  [unresolvedStructureSourceA, unresolvedStructureSourceB, onlyFirstStructureReturn],
  { target: "tc_K" },
  { tasks: truncatedStructureManifest }
);
assert.notEqual(rejectedTruncatedManifestPlan.tasks.find(task => task.task_id === multiSourceStructureTask.task_id).status, "verified");
assert.ok(rejectedTruncatedManifestPlan.synthesis.manifest_missing_return_task_ids.includes(multiSourceStructureTask.task_id));
assert.equal(rejectedTruncatedManifestPlan.synthesis.analysis.groups[0].identity_resolved, false);
assert.deepEqual(rejectedTruncatedManifestPlan.synthesis.analysis.groups[0].records.map(record => record.properties.tc_K).sort((a, b) => a - b), [8, 9]);

const manyValueStructureSources = Array.from({ length: 101 }, (_, index) => trustedWithCompleteness({
  model: `Many-value source ${index + 1}`,
  model_family: `many-value-family-${index + 1}`,
  evidence_id: `run:many-value-${String(index + 1).padStart(3, "0")}`,
  formula: "FeSe",
  target: "tc_K",
  stage: "dft",
  tc_K: index + 1,
  recommendation: "many-value manifest round-trip"
}, false));
const manyValueStructurePlan = Core.createOrchestration(manyValueStructureSources, { target: "tc_K" });
const manyValueStructureTask = manyValueStructurePlan.tasks.find(task => task.step === "structure");
assert.equal(manyValueStructureTask.required_property_values.tc_K.length, 101);
const manyValueSingleReturn = trustedWithCompleteness({ model: "CrystalStructureGen", model_family: "crystalstructuregen", evidence_id: "run:many-value-single-return", formula: "FeSe", structure_id: "many-value-polymorph", target: "tc_K", stage: "dft", tc_K: 1, assigned_task_id: manyValueStructureTask.task_id, recommendation: "only one of 101 source claims" }, false);
const manyValueRoundTripPlan = Core.createOrchestration(
  [...manyValueStructureSources, manyValueSingleReturn],
  { target: "tc_K" },
  { tasks: manyValueStructurePlan.tasks }
);
assert.equal(manyValueRoundTripPlan.synthesis.manifest_missing_return_task_ids.includes(manyValueStructureTask.task_id), false);
assert.ok(manyValueRoundTripPlan.synthesis.invalid_return_task_ids.includes(manyValueStructureTask.task_id));

const manyEvidenceStructureSeed = trustedWithCompleteness({
  model: "Many evidence source",
  model_family: "many-evidence-source",
  evidence_id: "run:multi-ref-primary-001",
  evidence_ids: Array.from({ length: 40 }, (_, index) => `run:multi-ref-${String(index + 1).padStart(3, "0")}`),
  formula: "FeSe",
  target: "tc_K",
  stage: "dft",
  tc_K: 8,
  recommendation: "evidence-list manifest round-trip"
}, false);
const manyEvidenceStructurePlan = Core.createOrchestration([manyEvidenceStructureSeed], { target: "tc_K" });
const manyEvidenceStructureTask = manyEvidenceStructurePlan.tasks.find(task => task.step === "structure");
assert.ok(manyEvidenceStructureTask.required_source_claims[0].evidence_ids.length > 32);
const manyEvidenceStructureReturn = trustedWithCompleteness({ model: "CrystalStructureGen", model_family: "crystalstructuregen", evidence_id: "run:multi-ref-structure-return", formula: "FeSe", structure_id: "multi-ref-polymorph", target: "tc_K", stage: "dft", tc_K: 8, assigned_task_id: manyEvidenceStructureTask.task_id, recommendation: "resolved structure with a long source evidence list" }, false);
const manyEvidenceRoundTripPlan = Core.createOrchestration(
  [manyEvidenceStructureSeed, manyEvidenceStructureReturn],
  { target: "tc_K" },
  { tasks: manyEvidenceStructurePlan.tasks }
);
assert.equal(manyEvidenceRoundTripPlan.synthesis.manifest_missing_return_task_ids.includes(manyEvidenceStructureTask.task_id), false);
assert.equal(manyEvidenceRoundTripPlan.tasks.find(task => task.task_id === manyEvidenceStructureTask.task_id).status, "verified");

const driftedConditionsReturn = trustedWithCompleteness({
  model: "OwnerA",
  model_family: "owner-a",
  evidence_id: "run:conditions-drift-001",
  formula: "FeSe",
  structure_id: "owner-structure",
  target: "tc_K",
  pressure_GPa: 200,
  stage: "dft",
  tc_K: 200,
  assigned_task_id: ownerConditionTask.task_id,
  recommendation: "Changed value is a recomputation, not a condition annotation"
}, true);
const driftedConditionsPlan = Core.createOrchestration([ownerSeed, driftedConditionsReturn], { target: "tc_K" }, { tasks: ownerPlan.tasks });
assert.notEqual(driftedConditionsPlan.tasks.find(task => task.task_id === ownerConditionTask.task_id).status, "verified");
assert.ok(driftedConditionsPlan.synthesis.invalid_return_task_ids.includes(ownerConditionTask.task_id));
assert.equal(driftedConditionsPlan.synthesis.analysis.groups[0].properties.tc_K.value, 8);

const sameExecutorIncompleteA = trustedWithCompleteness({ model: "Same executor", model_family: "same-executor", evidence_id: "run:same-executor-a", formula: "FeSe", structure_id: "same-executor-structure", target: "tc_K", stage: "dft", tc_K: 8, recommendation: "first run" }, false);
const sameExecutorIncompleteB = trustedWithCompleteness({ model: "Same executor", model_family: "same-executor", evidence_id: "run:same-executor-b", formula: "FeSe", structure_id: "same-executor-structure", target: "tc_K", stage: "dft", tc_K: 9, recommendation: "second run" }, false);
const sameExecutorPlan = Core.createOrchestration([sameExecutorIncompleteA, sameExecutorIncompleteB], { target: "tc_K" });
const sameExecutorConditionsTask = sameExecutorPlan.tasks.find(task => task.step === "conditions");
const oneOfTwoConditionsReturns = trustedWithCompleteness({ model: "Same executor", model_family: "same-executor", evidence_id: "run:same-executor-return", formula: "FeSe", structure_id: "same-executor-structure", target: "tc_K", stage: "dft", tc_K: 8, extra_conditions: { sample: "only-one-run" }, assigned_task_id: sameExecutorConditionsTask.task_id, recommendation: "only one source run covered" }, true);
const incompleteCoveragePlan = Core.createOrchestration([sameExecutorIncompleteA, sameExecutorIncompleteB, oneOfTwoConditionsReturns], { target: "tc_K" }, { tasks: sameExecutorPlan.tasks });
assert.notEqual(incompleteCoveragePlan.tasks.find(task => task.task_id === sameExecutorConditionsTask.task_id).status, "verified");
assert.ok(incompleteCoveragePlan.synthesis.invalid_return_task_ids.includes(sameExecutorConditionsTask.task_id));

const snapshotConditionSeed = trustedWithCompleteness({ model: "OwnerA", model_family: "owner-a", evidence_id: "run:snapshot-condition-seed", formula: "FeSe", structure_id: "snapshot-condition", target: "tc_K", stage: "dft", tc_K: 8, recommendation: "needs conditions" }, false);
const snapshotConditionPlan = Core.createOrchestration([snapshotConditionSeed], { target: "tc_K" });
const snapshotConditionTask = snapshotConditionPlan.tasks.find(task => task.step === "conditions");
const snapshotStabilityTask = snapshotConditionPlan.tasks.find(task => task.step === "stability");
const snapshotConditionReturn = trustedWithCompleteness({ model: "OwnerA", model_family: "owner-a", evidence_id: "run:snapshot-condition-return", formula: "FeSe", structure_id: "snapshot-condition", target: "tc_K", stage: "dft", tc_K: 8, extra_conditions: { sample: "batch-a" }, assigned_task_id: snapshotConditionTask.task_id, recommendation: "conditions completed" }, true);
const unrelatedOldLineageStabilityReturn = trustedWithCompleteness({ model: "Quantum Espresso", model_family: "quantum-espresso", evidence_id: "run:snapshot-unrelated-stability", formula: "FeSe", structure_id: "snapshot-condition", target: "tc_K", stage: "dft", e_above_hull_eV_atom: 0.01, assigned_task_id: snapshotStabilityTask.task_id, recommendation: "unrelated later task return" }, true);
const snapshotConditionResult = Core.createOrchestration(
  [snapshotConditionSeed, snapshotConditionReturn, unrelatedOldLineageStabilityReturn],
  { target: "tc_K" },
  { tasks: snapshotConditionPlan.tasks }
);
assert.equal(snapshotConditionResult.tasks.find(task => task.task_id === snapshotConditionTask.task_id).status, "verified");
assert.ok(snapshotConditionResult.synthesis.analysis.groups.some(group => group.extra_conditions.sample === "batch-a"));

const parallelSnapshotSeed = trusted({
  model: "Parallel snapshot seed",
  model_family: "parallel-snapshot-seed",
  evidence_id: "run:parallel-snapshot-seed",
  formula: "FeSe",
  structure_id: "parallel-snapshot-structure",
  target: "tc_K",
  stage: "dft",
  tc_K: 8,
  recommendation: "Parallel snapshot baseline"
});
const parallelSnapshotPlan = Core.createOrchestration([parallelSnapshotSeed], { target: "tc_K" });
const parallelNoveltyTask = parallelSnapshotPlan.tasks.find(task => task.step === "novelty");
const parallelTaskByStep = new Map(parallelSnapshotPlan.tasks.map(task => [task.step, task]));
const parallelNoveltyReturn = trusted({
  model: "Materials Project",
  model_family: "materials-project",
  evidence_id: "run:parallel-snapshot-novelty",
  formula: "FeSe",
  structure_id: "parallel-snapshot-structure",
  target: "tc_K",
  stage: "database",
  novelty_status: "known_reference",
  data_cutoff: "2026-01-01",
  source: "https://example.org/snapshots/parallel-snapshot",
  assigned_task_id: parallelNoveltyTask.task_id,
  recommendation: "Known reference without unrelated numeric claims"
});
const parallelSnapshotResult = Core.createOrchestration(
  [parallelSnapshotSeed, parallelNoveltyReturn],
  { target: "tc_K" },
  { tasks: parallelSnapshotPlan.tasks }
);
for (const step of ["stability", "target", "experiment"]) {
  const originalTask = parallelTaskByStep.get(step);
  const activeLogicalTasks = parallelSnapshotResult.tasks.filter(task => task.status !== "superseded"
    && task.candidate_key === originalTask.candidate_key
    && task.source_identity_key === originalTask.source_identity_key
    && task.step === step);
  assert.equal(activeLogicalTasks.length, 1, `a parallel novelty return must not duplicate the active ${step} task`);
  assert.equal(activeLogicalTasks[0].task_id, originalTask.task_id, `the frozen ${step} manifest remains authoritative`);
}
assert.equal(parallelSnapshotResult.synthesis.invalid_task_manifest_ids.length, 0);
assert.equal(parallelSnapshotResult.synthesis.quarantined_return_record_count, 0);

const ancestorSnapshotStabilityTask = parallelTaskByStep.get("stability");
const ancestorSnapshotTargetTask = parallelTaskByStep.get("target");
const ancestorSnapshotExperimentTask = parallelTaskByStep.get("experiment");
const ancestorSnapshotStabilityReturn = trusted({
  model: "MatterSim",
  model_family: "MatterSim",
  evidence_id: "run:ancestor-snapshot-stability",
  formula: "FeSe",
  structure_id: "parallel-snapshot-structure",
  target: "tc_K",
  stage: "ml",
  e_above_hull_eV_atom: 0.01,
  assigned_task_id: ancestorSnapshotStabilityTask.task_id,
  recommendation: "A valid ancestor result must not expand descendant source manifests"
});
const ancestorSnapshotResult = Core.createOrchestration(
  [parallelSnapshotSeed, ancestorSnapshotStabilityReturn],
  { target: "tc_K" },
  { tasks: parallelSnapshotPlan.tasks }
);
assert.equal(ancestorSnapshotResult.tasks.find(task => task.task_id === ancestorSnapshotStabilityTask.task_id).status, "verified");
assert.equal(ancestorSnapshotResult.synthesis.quarantined_return_record_count, 0);
assert.equal(ancestorSnapshotResult.synthesis.invalid_task_manifest_ids.includes(ancestorSnapshotTargetTask.task_id), false,
  "a valid stability return must not invalidate the frozen target manifest");
assert.equal(ancestorSnapshotResult.synthesis.invalid_task_manifest_ids.includes(ancestorSnapshotExperimentTask.task_id), false,
  "a valid stability return must not invalidate the frozen experiment manifest");
assert.ok(ancestorSnapshotResult.tasks.some(task => task.task_id === ancestorSnapshotTargetTask.task_id));
assert.ok(ancestorSnapshotResult.tasks.some(task => task.task_id === ancestorSnapshotExperimentTask.task_id));

const historicalParallelObservation = trusted({
  model: "Materials Project",
  model_family: "materials-project",
  evidence_id: "run:historical-parallel-observation",
  formula: "FeSe",
  structure_id: "parallel-snapshot-structure",
  target: "tc_K",
  stage: "database",
  novelty_status: "known_reference",
  data_cutoff: "2026-01-01",
  source: "https://example.org/snapshots/historical-parallel",
  recommendation: "Independent observation added after the original task snapshot"
});
const expandedParallelPlan = Core.createOrchestration(
  [parallelSnapshotSeed, historicalParallelObservation],
  { target: "tc_K" }
);
const expandedParallelStabilityTask = expandedParallelPlan.tasks.find(task => task.step === "stability");
assert.notEqual(expandedParallelStabilityTask.task_id, ancestorSnapshotStabilityTask.task_id);
assert.equal(expandedParallelStabilityTask.candidate_key, ancestorSnapshotStabilityTask.candidate_key);
assert.equal(expandedParallelStabilityTask.source_identity_key, ancestorSnapshotStabilityTask.source_identity_key);
const historicalDuplicateRoundTrip = Core.createOrchestration(
  [parallelSnapshotSeed, historicalParallelObservation],
  { target: "tc_K" },
  { tasks: [ancestorSnapshotStabilityTask, expandedParallelStabilityTask] }
);
const preservedOriginalLogicalTask = historicalDuplicateRoundTrip.tasks.find(task => task.task_id === ancestorSnapshotStabilityTask.task_id);
const auditedDuplicateLogicalTask = historicalDuplicateRoundTrip.tasks.find(task => task.task_id === expandedParallelStabilityTask.task_id);
assert.equal(historicalDuplicateRoundTrip.synthesis.invalid_task_manifest_ids.length, 0);
assert.notEqual(preservedOriginalLogicalTask.status, "superseded");
assert.equal(auditedDuplicateLogicalTask.status, "superseded");
assert.equal(auditedDuplicateLogicalTask.superseded_reason, "duplicate_logical_task");
assert.deepEqual(auditedDuplicateLogicalTask.superseded_by, [ancestorSnapshotStabilityTask.task_id]);

const expandedParallelStabilityReturn = trusted({
  model: "MatterSim",
  model_family: "MatterSim",
  evidence_id: "run:expanded-parallel-stability-return",
  formula: "FeSe",
  structure_id: "parallel-snapshot-structure",
  target: "tc_K",
  stage: "ml",
  e_above_hull_eV_atom: 0.012,
  assigned_task_id: expandedParallelStabilityTask.task_id,
  recommendation: "Complete the expanded two-source stability task"
});
const returnedExpandedDuplicatePlan = Core.createOrchestration(
  [parallelSnapshotSeed, historicalParallelObservation, expandedParallelStabilityReturn],
  { target: "tc_K" },
  { tasks: [ancestorSnapshotStabilityTask, expandedParallelStabilityTask] }
);
const returnedExpandedTask = returnedExpandedDuplicatePlan.tasks.find(task => task.task_id === expandedParallelStabilityTask.task_id);
const supersededNarrowTask = returnedExpandedDuplicatePlan.tasks.find(task => task.task_id === ancestorSnapshotStabilityTask.task_id);
assert.equal(returnedExpandedTask.status, "verified", "the duplicate manifest with a valid return becomes authoritative");
assert.equal(supersededNarrowTask.status, "superseded");
assert.deepEqual(supersededNarrowTask.superseded_by, [expandedParallelStabilityTask.task_id]);

const oldParallelTargetTask = parallelSnapshotPlan.tasks.find(task => task.step === "target");
const oldParallelExperimentTask = parallelSnapshotPlan.tasks.find(task => task.step === "experiment");
const expandedParallelTargetTask = expandedParallelPlan.tasks.find(task => task.step === "target");
const expandedParallelExperimentTask = expandedParallelPlan.tasks.find(task => task.step === "experiment");
const duplicateGenerationTasks = [...parallelSnapshotPlan.tasks, ...expandedParallelPlan.tasks];
const coherentDuplicateGenerationPlan = previousTasks => Core.createOrchestration(
  [parallelSnapshotSeed, historicalParallelObservation, expandedParallelStabilityReturn],
  { target: "tc_K" },
  { tasks: previousTasks }
);
const coherentForwardPlan = coherentDuplicateGenerationPlan(duplicateGenerationTasks);
const coherentReversePlan = coherentDuplicateGenerationPlan([...duplicateGenerationTasks].reverse());
for (const plan of [coherentForwardPlan, coherentReversePlan]) {
  const activeTasks = plan.tasks.filter(task => task.status !== "superseded");
  const activeTaskIds = new Set(activeTasks.map(task => task.task_id));
  activeTasks.forEach(task => task.depends_on.forEach(dependencyId => {
    assert.ok(activeTaskIds.has(dependencyId), `active task ${task.task_id} must not depend on superseded ${dependencyId}`);
  }));
  assert.equal(plan.tasks.find(task => task.task_id === expandedParallelStabilityTask.task_id).status, "verified");
  assert.notEqual(plan.tasks.find(task => task.task_id === expandedParallelTargetTask.task_id).status, "superseded");
  assert.notEqual(plan.tasks.find(task => task.task_id === expandedParallelExperimentTask.task_id).status, "superseded");
  assert.equal(plan.tasks.find(task => task.task_id === oldParallelTargetTask.task_id).status, "superseded");
  assert.equal(plan.tasks.find(task => task.task_id === oldParallelExperimentTask.task_id).status, "superseded");
}
const activeTaskSignature = plan => plan.tasks.filter(task => task.status !== "superseded")
  .map(task => ({ task_id: task.task_id, status: task.status, depends_on: task.depends_on }))
  .sort((left, right) => left.task_id.localeCompare(right.task_id));
assert.deepEqual(activeTaskSignature(coherentForwardPlan), activeTaskSignature(coherentReversePlan),
  "authoritative manifest generation selection must not depend on previousTasks order");

const betaTargetReturn = trusted({
  model: "Quantum Espresso",
  model_family: "quantum-espresso",
  evidence_id: "run:beta-target-return",
  formula: "FeSe",
  structure_id: "parallel-snapshot-structure",
  target: "tc_K",
  stage: "dft",
  tc_K: 10,
  calibration: { tc_K: { q90: 1, unit: "K", applicability: 0.9, validation_set: "beta-target-validation" } },
  assigned_task_id: expandedParallelTargetTask.task_id,
  recommendation: "A valid downstream Beta result should select its full dependency cohort"
});
const betaCohortPlan = previousTasks => Core.createOrchestration(
  [parallelSnapshotSeed, historicalParallelObservation, betaTargetReturn],
  { target: "tc_K" },
  { tasks: previousTasks }
);
const betaCohortForwardPlan = betaCohortPlan(duplicateGenerationTasks);
const betaCohortReversePlan = betaCohortPlan([...duplicateGenerationTasks].reverse());
for (const plan of [betaCohortForwardPlan, betaCohortReversePlan]) {
  const activeTasks = plan.tasks.filter(task => task.status !== "superseded");
  const activeTaskIds = new Set(activeTasks.map(task => task.task_id));
  assert.equal(plan.tasks.find(task => task.task_id === expandedParallelTargetTask.task_id).status, "verified");
  assert.equal(plan.final_report.pending_task_ids.includes(expandedParallelTargetTask.task_id), false,
    "a valid early target return must not be scheduled for rerun while its stability dependency is pending");
  assert.notEqual(plan.tasks.find(task => task.task_id === expandedParallelStabilityTask.task_id).status, "superseded",
    "the downstream verified return score propagates to its Beta stability ancestor");
  assert.equal(plan.tasks.find(task => task.task_id === ancestorSnapshotStabilityTask.task_id).status, "superseded");
  activeTasks.forEach(task => task.depends_on.forEach(dependencyId => assert.ok(activeTaskIds.has(dependencyId))));
}
assert.deepEqual(activeTaskSignature(betaCohortForwardPlan), activeTaskSignature(betaCohortReversePlan),
  "global cohort selection with a downstream return remains order-independent");

const competingProgressPlan = previousTasks => Core.createOrchestration(
  [parallelSnapshotSeed, historicalParallelObservation, ancestorSnapshotStabilityReturn, betaTargetReturn],
  { target: "tc_K" },
  { tasks: previousTasks }
);
const competingProgressForwardPlan = competingProgressPlan(duplicateGenerationTasks);
const competingProgressReversePlan = competingProgressPlan([...duplicateGenerationTasks].reverse());
for (const plan of [competingProgressForwardPlan, competingProgressReversePlan]) {
  const activeTasks = plan.tasks.filter(task => task.status !== "superseded");
  const activeTaskIds = new Set(activeTasks.map(task => task.task_id));
  assert.equal(plan.tasks.find(task => task.task_id === expandedParallelTargetTask.task_id).status, "verified");
  assert.notEqual(plan.tasks.find(task => task.task_id === expandedParallelStabilityTask.task_id).status, "superseded",
    "target-stage progress outranks an earlier stability-stage return when selecting the dependency cohort");
  assert.equal(plan.tasks.find(task => task.task_id === ancestorSnapshotStabilityTask.task_id).status, "superseded");
  assert.equal(plan.final_report.pending_task_ids.includes(expandedParallelTargetTask.task_id), false);
  activeTasks.forEach(task => task.depends_on.forEach(dependencyId => assert.ok(activeTaskIds.has(dependencyId))));
}
assert.deepEqual(activeTaskSignature(competingProgressForwardPlan), activeTaskSignature(competingProgressReversePlan),
  "downstream-ranked cohort selection is deterministic under reversed previousTasks input");

const publicVerificationSeed = Core.normalizeCandidate({ model: "Verifier", model_family: "verifier", formula: "FeSe", structure_namespace: "test-fixture", structure_id: "verification-structure", target: "tc_K", stage: "dft", tc_K: 8, recommendation: "Unverified source claim" });
const verificationPlan = Core.createOrchestration([publicVerificationSeed], { target: "tc_K" });
const verificationTask = verificationPlan.tasks.find(task => task.step === "verification");
const emptyVerificationReturn = trusted({ model: "Verifier", model_family: "verifier", evidence_id: "run:empty-verification", formula: "FeSe", structure_id: "verification-structure", target: "tc_K", stage: "dft", assigned_task_id: verificationTask.task_id, recommendation: "Empty shell" });
const emptyVerificationPlan = Core.createOrchestration([publicVerificationSeed, emptyVerificationReturn], { target: "tc_K" }, { tasks: verificationPlan.tasks });
assert.notEqual(emptyVerificationPlan.tasks.find(task => task.task_id === verificationTask.task_id).status, "verified");
const rewrittenVerificationReturn = trusted({ model: "Verifier", model_family: "verifier", evidence_id: "run:rewritten-verification", formula: "FeSe", structure_id: "verification-structure", target: "tc_K", stage: "dft", tc_K: 200, assigned_task_id: verificationTask.task_id, recommendation: "Changed claim" });
const rewrittenVerificationPlan = Core.createOrchestration([publicVerificationSeed, rewrittenVerificationReturn], { target: "tc_K" }, { tasks: verificationPlan.tasks });
assert.notEqual(rewrittenVerificationPlan.tasks.find(task => task.task_id === verificationTask.task_id).status, "verified");
const validVerificationReturn = trusted({ model: "Verifier", model_family: "verifier", evidence_id: "run:valid-verification", formula: "FeSe", structure_id: "verification-structure", target: "tc_K", stage: "dft", tc_K: 8, assigned_task_id: verificationTask.task_id, recommendation: "Verified original claim" });
const validVerificationPlan = Core.createOrchestration([publicVerificationSeed, validVerificationReturn], { target: "tc_K" }, { tasks: verificationPlan.tasks });
assert.equal(validVerificationPlan.tasks.find(task => task.task_id === verificationTask.task_id).status, "verified");
const verificationSnapshotStabilityTask = verificationPlan.tasks.find(task => task.step === "stability");
const verificationSnapshotStabilityReturn = trusted({ model: "Quantum Espresso", model_family: "quantum-espresso", evidence_id: "run:verification-snapshot-stability", formula: "FeSe", structure_id: "verification-structure", target: "tc_K", stage: "dft", e_above_hull_eV_atom: 0.01, assigned_task_id: verificationSnapshotStabilityTask.task_id, recommendation: "later stability return" });
const verificationSnapshotPlan = Core.createOrchestration(
  [publicVerificationSeed, validVerificationReturn, verificationSnapshotStabilityReturn],
  { target: "tc_K" },
  { tasks: verificationPlan.tasks }
);
assert.equal(verificationSnapshotPlan.tasks.find(task => task.task_id === verificationTask.task_id).status, "verified");

const noveltySeed = trusted({ model: "Novelty seed", model_family: "novelty-seed", evidence_id: "run:novelty-seed", formula: "FeSe", structure_id: "novelty-structure", target: "stability", stage: "dft", e_above_hull_eV_atom: 0.01, recommendation: "Novelty not checked" });
const noveltyPlan = Core.createOrchestration([noveltySeed], { target: "stability" });
const noveltyTask = noveltyPlan.tasks.find(task => task.step === "novelty");
const tamperedNoveltyManifest = JSON.parse(JSON.stringify(noveltyPlan.tasks));
tamperedNoveltyManifest.find(task => task.task_id === noveltyTask.task_id).assigned_to = ["Evil adapter"];
const evilNoveltyReturn = trusted({ model: "Evil adapter", model_family: "evil-adapter", evidence_id: "run:tampered-owner-return", formula: "FeSe", structure_id: "novelty-structure", target: "stability", stage: "database", e_above_hull_eV_atom: 0.01, novelty_status: "known_reference", data_cutoff: "2026-01-01", source: "https://example.org/tampered-owner/snapshot", assigned_task_id: noveltyTask.task_id, recommendation: "must not self-authorize by changing the task owner" });
const rejectedOwnerTamperPlan = Core.createOrchestration([noveltySeed, evilNoveltyReturn], { target: "stability" }, { tasks: tamperedNoveltyManifest });
assert.notEqual(rejectedOwnerTamperPlan.tasks.find(task => task.task_id === noveltyTask.task_id).status, "verified");
assert.ok(rejectedOwnerTamperPlan.synthesis.manifest_missing_return_task_ids.includes(noveltyTask.task_id));
assert.notEqual(rejectedOwnerTamperPlan.synthesis.analysis.groups[0].novelty_status, "known_reference");
const noveltyReturn = trusted({ model: "Materials Project", model_family: "materials-project", evidence_id: "run:novelty-return", formula: "FeSe", structure_id: "novelty-structure", target: "stability", stage: "database", e_above_hull_eV_atom: 0.01, novelty_status: "known_reference", data_cutoff: "2026-01-01", source: "https://example.org/materials-project/snapshot", assigned_task_id: noveltyTask.task_id, recommendation: "Known reference match" });
const resolvedNoveltyPlan = Core.createOrchestration([noveltySeed, noveltyReturn], { target: "stability" }, { tasks: noveltyPlan.tasks });
assert.equal(resolvedNoveltyPlan.tasks.find(task => task.task_id === noveltyTask.task_id).status, "verified");
assert.equal(resolvedNoveltyPlan.synthesis.analysis.groups[0].novelty_status, "known_reference");
assert.equal(resolvedNoveltyPlan.synthesis.analysis.groups[0].next_steps.includes("novelty"), false);
const spoofedNoveltyReturn = trusted({ model: "Project", model_family: "unrelated-project", evidence_id: "run:spoofed-novelty", formula: "FeSe", structure_id: "novelty-structure", target: "stability", stage: "database", e_above_hull_eV_atom: 0.01, novelty_status: "known_reference", data_cutoff: "2026-01-01", source: "https://example.org/spoofed/snapshot", assigned_task_id: noveltyTask.task_id, recommendation: "Substring spoof" });
const spoofedNoveltyPlan = Core.createOrchestration([noveltySeed, spoofedNoveltyReturn], { target: "stability" }, { tasks: noveltyPlan.tasks });
assert.ok(spoofedNoveltyPlan.synthesis.unauthorized_return_task_ids.includes(noveltyTask.task_id));

const targetCalibrationSeeds = [
  trusted({ model: "Target stability A", model_family: "target-stability-a", evidence_id: "run:target-stability-a", formula: "FeSe", structure_id: "target-calibration", target: "tc_K", stage: "dft", e_above_hull_eV_atom: 0.01, novelty_status: "known_reference", source: "https://example.org/ref/target-a", recommendation: "stable" }),
  trusted({ model: "Target stability B", model_family: "target-stability-b", evidence_id: "run:target-stability-b", formula: "FeSe", structure_id: "target-calibration", target: "tc_K", stage: "dft", e_above_hull_eV_atom: 0.012, novelty_status: "known_reference", source: "https://example.org/ref/target-b", recommendation: "stable" })
];
const targetCalibrationPlan = Core.createOrchestration(targetCalibrationSeeds, { target: "tc_K" });
const targetTask = targetCalibrationPlan.tasks.find(task => task.step === "target");
const uncalibratedTargetReturn = trusted({ model: "Quantum Espresso", model_family: "quantum-espresso", evidence_id: "run:uncalibrated-target", formula: "FeSe", structure_id: "target-calibration", target: "tc_K", stage: "dft", tc_K: 40, assigned_task_id: targetTask.task_id, recommendation: "No calibration metadata" });
const uncalibratedTargetPlan = Core.createOrchestration([...targetCalibrationSeeds, uncalibratedTargetReturn], { target: "tc_K" }, { tasks: targetCalibrationPlan.tasks });
assert.notEqual(uncalibratedTargetPlan.tasks.find(task => task.task_id === targetTask.task_id).status, "verified");

const generalExperimentSeeds = [
  trusted({ model: "General A", model_family: "general-a", evidence_id: "run:general-a", formula: "FeSe", structure_id: "general-experiment", stage: "dft", tc_K: 8, e_above_hull_eV_atom: 0.01, novelty_status: "known_reference", source: "https://example.org/ref/general-a", recommendation: "general evidence" }),
  trusted({ model: "General B", model_family: "general-b", evidence_id: "run:general-b", formula: "FeSe", structure_id: "general-experiment", stage: "dft", tc_K: 8.1, e_above_hull_eV_atom: 0.012, novelty_status: "known_reference", source: "https://example.org/ref/general-b", recommendation: "general evidence" })
];
const generalExperimentPlan = Core.createOrchestration(generalExperimentSeeds, { target: "custom" });
const generalExperimentTask = generalExperimentPlan.tasks.find(task => task.step === "experiment");
const unrelatedGeneralExperiment = trusted({ model: "NSRL", model_family: "nsrl", evidence_id: "run:general-unrelated", formula: "FeSe", structure_id: "general-experiment", stage: "experiment", band_gap_eV: 2, experimental_method: "Optical spectroscopy", raw_data_url: "https://example.org/raw/general-unrelated", assigned_task_id: generalExperimentTask.task_id, recommendation: "Unrelated property" });
const unrelatedGeneralPlan = Core.createOrchestration([...generalExperimentSeeds, unrelatedGeneralExperiment], { target: "custom" }, { tasks: generalExperimentPlan.tasks });
assert.notEqual(unrelatedGeneralPlan.tasks.find(task => task.task_id === generalExperimentTask.task_id).status, "verified");

const unverifiedSideClaim = Core.normalizeCandidate({ model: "Unverified optics", model_family: "unverified-optics", evidence_id: "run:unverified-side-claim", formula: "FeSe", structure_namespace: "test-fixture", structure_id: "general-experiment", target: "general", stage: "ml", band_gap_eV: 2, novelty_status: "known_reference", source: "https://example.org/unverified-side", recommendation: "comparative side claim" });
const sideClaimExperimentPlan = Core.createOrchestration([...generalExperimentSeeds, unverifiedSideClaim], { target: "custom" });
const sideClaimExperimentTask = sideClaimExperimentPlan.tasks.find(task => task.step === "experiment");
assert.deepEqual(sideClaimExperimentTask.required_experiment_properties.sort(), ["e_above_hull_eV_atom", "tc_K"]);
const sideClaimOnlyExperiment = trusted({ model: "NSRL", model_family: "nsrl", evidence_id: "run:side-claim-only-experiment", formula: "FeSe", structure_id: "general-experiment", target: "general", stage: "experiment", band_gap_eV: 2, experimental_method: "Optical spectroscopy", raw_data_url: "https://example.org/raw/side-claim-only", assigned_task_id: sideClaimExperimentTask.task_id, recommendation: "measured only the unverified side claim" });
const rejectedSideClaimExperimentPlan = Core.createOrchestration(
  [...generalExperimentSeeds, unverifiedSideClaim, sideClaimOnlyExperiment],
  { target: "custom" },
  { tasks: sideClaimExperimentPlan.tasks }
);
assert.notEqual(rejectedSideClaimExperimentPlan.tasks.find(task => task.task_id === sideClaimExperimentTask.task_id).status, "verified");
assert.ok(rejectedSideClaimExperimentPlan.synthesis.invalid_return_task_ids.includes(sideClaimExperimentTask.task_id));
assert.equal(rejectedSideClaimExperimentPlan.final_report.execution_status, "partial");
assert.equal(rejectedSideClaimExperimentPlan.final_report.claim_status, "computational_candidate");

const targetAlignedSeeds = [
  trusted({ model: "Target aligned A", model_family: "target-aligned-a", evidence_id: "run:target-aligned-a", formula: "FeSe", structure_id: "target-aligned", target: "tc_K", stage: "dft", tc_K: 40, e_above_hull_eV_atom: 0.01, novelty_status: "known_reference", source: "https://example.org/target-aligned/a", recommendation: "target evidence" }),
  trusted({ model: "Target aligned B", model_family: "target-aligned-b", evidence_id: "run:target-aligned-b", formula: "FeSe", structure_id: "target-aligned", target: "tc_K", stage: "dft", tc_K: 40.2, e_above_hull_eV_atom: 0.012, novelty_status: "known_reference", source: "https://example.org/target-aligned/b", recommendation: "target evidence" })
];
const stabilityOnlyStandaloneExperiment = trusted({ model: "NSRL", model_family: "nsrl", evidence_id: "run:stability-only-standalone", formula: "FeSe", structure_id: "target-aligned", target: "tc_K", stage: "experiment", e_above_hull_eV_atom: 0.011, novelty_status: "known_reference", source: "https://example.org/target-aligned/experiment", experimental_method: "Calorimetry", raw_data_url: "https://example.org/raw/stability-only", recommendation: "stability measured without Tc" });
const targetAlignedPlan = Core.createOrchestration([...targetAlignedSeeds, stabilityOnlyStandaloneExperiment], { target: "tc_K" });
assert.ok(targetAlignedPlan.tasks.some(task => task.step === "experiment"));
assert.ok(targetAlignedPlan.synthesis.analysis.groups[0].next_steps.includes("experiment"));
assert.equal(targetAlignedPlan.final_report.execution_status, "partial");
assert.equal(targetAlignedPlan.final_report.claim_status, "computational_candidate");

const missingManifestSeeds = [
  trusted({ model: "Missing manifest A", model_family: "manifest-a", evidence_id: "run:orphaned-task-a-001", formula: "FeSe", structure_id: "orphaned-task-structure", target: "stability", stage: "dft", e_above_hull_eV_atom: 0.01, novelty_status: "known_reference", source: "https://example.org/orphaned/a", recommendation: "stable" }),
  trusted({ model: "Missing manifest B", model_family: "manifest-b", evidence_id: "run:orphaned-task-b-001", formula: "FeSe", structure_id: "orphaned-task-structure", target: "stability", stage: "dft", e_above_hull_eV_atom: 0.012, novelty_status: "known_reference", source: "https://example.org/orphaned/b", recommendation: "stable" })
];
const missingManifestBasePlan = Core.createOrchestration(missingManifestSeeds, { target: "stability" });
const missingManifestExperimentTask = missingManifestBasePlan.tasks.find(task => task.step === "experiment");
const missingManifestReturn = trusted({ model: "NSRL", model_family: "nsrl", evidence_id: "run:orphaned-task-return-001", formula: "FeSe", structure_id: "orphaned-task-structure", target: "stability", stage: "experiment", e_above_hull_eV_atom: 0.011, novelty_status: "known_reference", source: "https://example.org/orphaned/experiment", experimental_method: "Calorimetry", raw_data_url: "https://example.org/raw/orphaned-task", assigned_task_id: missingManifestExperimentTask.task_id, recommendation: "valid result without original task manifest" });
const missingManifestPlan = Core.createOrchestration([...missingManifestSeeds, missingManifestReturn], { target: "stability" });
const rebuiltMissingManifestTask = missingManifestPlan.tasks.find(task => task.task_id === missingManifestExperimentTask.task_id);
assert.notEqual(rebuiltMissingManifestTask.status, "verified");
assert.equal(rebuiltMissingManifestTask.returned_record_count, 0);
assert.ok(missingManifestPlan.synthesis.manifest_missing_return_task_ids.includes(missingManifestExperimentTask.task_id));
assert.equal(missingManifestPlan.synthesis.analysis.groups[0].records.some(record => record.stage === "experiment"), false);

const campaignScopePlan = Core.createOrchestration([
  trusted({ model: "Lead oxide", model_family: "lead-oxide", evidence_id: "run:lead-oxide", formula: "PbO", structure_id: "lead-oxide", stage: "dft", e_above_hull_eV_atom: 0.01, recommendation: "out of scope" })
], { target: "stability", allowed_elements: "Fe, Se", excluded_elements: "Pb" });
assert.equal(campaignScopePlan.synthesis.candidate_count, 0);
assert.equal(campaignScopePlan.synthesis.out_of_scope_candidate_count, 1);
assert.equal(Core.createTaskPackage(campaignScopePlan).tasks.length, 0);
const belowThresholdPlan = Core.createOrchestration([
  trusted({ model: "Low target", model_family: "low-target", evidence_id: "run:low-target", formula: "FeSe", structure_id: "low-target", target: "tc_K", stage: "dft", tc_K: 8, recommendation: "below threshold" })
], { target: "tc_K", target_value: 40 });
assert.equal(belowThresholdPlan.synthesis.candidate_count, 0);
assert.equal(belowThresholdPlan.synthesis.out_of_scope_candidates[0].reason, "below_target_threshold");

const conflictWithExtraPropertyA = trusted({ model: "Conflict extra A", model_family: "conflict-extra-a", evidence_id: "run:conflict-extra-a", formula: "MgB2", structure_id: "conflict-extra", target: "tc_K", stage: "dft", tc_K: 8, e_above_hull_eV_atom: 0.02, recommendation: "Tc and stability" });
const conflictWithExtraPropertyB = trusted({ model: "Conflict extra B", model_family: "conflict-extra-b", evidence_id: "run:conflict-extra-b", formula: "MgB2", structure_id: "conflict-extra", target: "tc_K", stage: "dft", tc_K: 100, recommendation: "Tc conflict" });
const conflictExtraPlan = Core.createOrchestration([conflictWithExtraPropertyA, conflictWithExtraPropertyB], { target: "tc_K" });
const conflictExtraTask = conflictExtraPlan.tasks.find(task => task.step === "conflict");
const incompleteConflictReplacement = trusted({ model: "Conflict extra A", model_family: "conflict-extra-a", evidence_id: "run:conflict-extra-replacement", formula: "MgB2", structure_id: "conflict-extra", target: "tc_K", stage: "independent_reproduction", tc_K: 99, supersedes_evidence_ids: [conflictWithExtraPropertyA.evidence_id], assigned_task_id: conflictExtraTask.task_id, recommendation: "Would drop e-hull" });
const incompleteConflictReplacementPlan = Core.createOrchestration([conflictWithExtraPropertyA, conflictWithExtraPropertyB, incompleteConflictReplacement], { target: "tc_K" }, { tasks: conflictExtraPlan.tasks });
assert.notEqual(incompleteConflictReplacementPlan.tasks.find(task => task.task_id === conflictExtraTask.task_id).status, "verified");
assert.equal(incompleteConflictReplacementPlan.synthesis.analysis.groups[0].properties.e_above_hull_eV_atom.value, 0.02);

const scaleSeeds = Array.from({ length: 230 }, (_, index) => trustedWithCompleteness({
  model: `Scale model ${index}`,
  model_family: `scale-family-${index}`,
  evidence_id: `run:scale-${index}`,
  formula: "FeSe",
  structure_id: `scale-structure-${index}`,
  target: "tc_K",
  stage: "dft",
  tc_K: 8 + (index % 10) / 10,
  recommendation: "large task-manifest regression"
}, false));
const scalePlan = Core.createOrchestration(scaleSeeds, { target: "tc_K" });
assert.ok(scalePlan.tasks.length > 1000);
const lateExperimentTask = scalePlan.tasks.find((task, index) => index >= 1000 && task.step === "experiment");
assert.ok(lateExperimentTask, "a task beyond the old 1000-task cutoff exists");
const lateSeedIndex = Number(lateExperimentTask.structure_id.replace("scale-structure-", ""));
const lateExperimentReturn = trustedWithCompleteness({
  model: "NSRL",
  model_family: "nsrl",
  evidence_id: "run:scale-late-experiment",
  formula: "FeSe",
  structure_id: lateExperimentTask.structure_id,
  target: "tc_K",
  stage: "experiment",
  tc_K: 8 + (lateSeedIndex % 10) / 10,
  experimental_method: "Transport",
  raw_data_url: "https://example.org/raw/scale-late",
  assigned_task_id: lateExperimentTask.task_id,
  recommendation: "late manifest task return"
}, true);
const scaleReturnPlan = Core.createOrchestration([...scaleSeeds, lateExperimentReturn], { target: "tc_K" }, { tasks: scalePlan.tasks });
assert.equal(scaleReturnPlan.synthesis.manifest_missing_return_task_ids.includes(lateExperimentTask.task_id), false);
assert.ok(scaleReturnPlan.synthesis.analysis.groups.some(group => group.records.some(record => record.evidence_id === lateExperimentReturn.evidence_id)));

const modulePath = require.resolve("../github-pages/material-consensus.js");
delete require.cache[modulePath];
const publicCore = require(modulePath);
assert.equal(publicCore.__testNormalizeTrustedCandidate, undefined, "the trusted test adapter is absent from the default CommonJS and browser API");

console.log("Material consensus tests passed");
