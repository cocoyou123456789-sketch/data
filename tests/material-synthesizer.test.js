const assert = require("node:assert/strict");
const Synthesizer = require("../github-pages/material-synthesizer.js");

const idle = Synthesizer.synthesize({ language: "zh", hasComposition: false, rows: [] });
assert.equal(idle.state, "idle");
assert.match(idle.summary, /至少两种元素/);
assert.match(idle.summary, /材料研究主持人/);

const baseRows = [
  { name: "ARPES Rules", modelFamily: "arpes-rules", stage: "rule", state: "ready" },
  {
    name: "JARVIS",
    modelFamily: "jarvis",
    stage: "ml",
    state: "ready",
    evidenceEligible: false,
    claims: [{ property: "formation_energy_eV_atom", value: -0.2, unit: "eV/atom", uncertainty: 0.4, contextKey: "composition-only|structure-unresolved" }]
  },
  { name: "Quantum Espresso", modelFamily: "qe", stage: "task_planning", state: "idle" }
];
const screening = Synthesizer.synthesize({
  language: "zh",
  hasComposition: true,
  formula: "MgB",
  score: 42,
  classificationLabel: "值得进入下一轮验证",
  rows: baseRows
});
assert.equal(screening.returnedCount, 2);
assert.equal(screening.planningCount, 1);
assert.equal(screening.numeric.claimCount, 1);
assert.equal(screening.numeric.agreements.length, 0);
assert.match(screening.summary, /不能形成正式数值共识/);
assert.match(screening.summary, /不是超导概率/);

const comparable = contextKey => [
  {
    name: "DFT A",
    modelFamily: "family-a",
    stage: "dft",
    state: "ready",
    evidenceEligible: true,
    structureResolved: true,
    claims: [{ property: "band_gap_eV", value: 1.2, unit: "eV", uncertainty: 0.1, contextKey, eligibleForConsensus: true }]
  },
  {
    name: "DFT B",
    modelFamily: "family-b",
    stage: "independent_reproduction",
    state: "ready",
    evidenceEligible: true,
    structureResolved: true,
    claims: [{ property: "band_gap_eV", value: 1.32, unit: "eV", uncertainty: 0.1, contextKey, eligibleForConsensus: true }]
  }
];
const agreement = Synthesizer.synthesize({ language: "zh", hasComposition: true, formula: "FeSe", rows: comparable("structure:mp-1|PBE|0GPa") });
assert.equal(agreement.numeric.agreements.length, 1);
assert.equal(agreement.numeric.conflicts.length, 0);
assert.match(agreement.status, /数值共识/);

const conflictRows = comparable("structure:mp-1|PBE|0GPa");
conflictRows[1] = {
  ...conflictRows[1],
  claims: [{ property: "band_gap_eV", value: 2.1, unit: "eV", uncertainty: 0.1, contextKey: "structure:mp-1|PBE|0GPa", eligibleForConsensus: true }]
};
const conflict = Synthesizer.synthesize({ language: "zh", hasComposition: true, formula: "FeSe", rows: conflictRows });
assert.equal(conflict.numeric.conflicts.length, 1);
assert.match(conflict.summary, /数值冲突/);
assert.ok(conflict.nextActions.includes("conflict_audit"));

const differentContexts = comparable("structure:mp-1|PBE|0GPa");
differentContexts[1] = {
  ...differentContexts[1],
  claims: [{ property: "band_gap_eV", value: 1.3, unit: "eV", uncertainty: 0.1, contextKey: "structure:mp-2|PBE|0GPa", eligibleForConsensus: true }]
};
const incomparable = Synthesizer.synthesize({ language: "zh", hasComposition: true, formula: "FeSe", rows: differentContexts });
assert.equal(incomparable.numeric.agreements.length, 0);
assert.ok(incomparable.numeric.incomparableProperties.includes("band_gap_eV"));

const sameFamilyDuplicates = [
  {
    name: "DFT A run 1",
    modelFamily: "family-a",
    stage: "dft",
    state: "ready",
    evidenceEligible: true,
    structureResolved: true,
    claims: [{ property: "band_gap_eV", value: 1.1, contextKey: "structure:mp-1|PBE|0GPa", eligibleForConsensus: true }]
  },
  {
    name: "DFT A run 2",
    modelFamily: "family-a",
    stage: "dft",
    state: "ready",
    evidenceEligible: true,
    structureResolved: true,
    claims: [{ property: "band_gap_eV", value: 1.3, contextKey: "structure:mp-1|PBE|0GPa", eligibleForConsensus: true }]
  }
];
const oneFamily = Synthesizer.synthesize({ language: "zh", hasComposition: true, formula: "FeSe", rows: sameFamilyDuplicates });
assert.equal(oneFamily.numeric.agreements.length, 0, "repeat runs from one model family are not independent consensus");

const nullClaim = Synthesizer.synthesize({
  language: "zh",
  hasComposition: true,
  formula: "FeSe",
  rows: [{
    name: "Incomplete DFT",
    modelFamily: "family-c",
    stage: "dft",
    state: "ready",
    evidenceEligible: true,
    claims: [{ property: "band_gap_eV", value: null, contextKey: "structure:mp-1|PBE|0GPa", eligibleForConsensus: true }]
  }]
});
assert.equal(nullClaim.numeric.claimCount, 0, "missing numeric values are not converted to zero");

const reversed = Synthesizer.synthesize({ language: "zh", hasComposition: true, formula: "MgB", score: 42, classificationLabel: "值得进入下一轮验证", rows: [...baseRows].reverse() });
assert.equal(reversed.summary, screening.summary);

console.log("Material synthesizer tests passed");
