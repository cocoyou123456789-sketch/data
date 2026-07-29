const assert = require("node:assert/strict");

const Core = require("../github-pages/bohrium-openlam.js");

assert.equal(Core.structureExtension("sample.cif"), "cif");
assert.equal(Core.structureExtension("POSCAR"), "poscar");
assert.equal(Core.structureExtension("relaxed.CONTCAR"), "contcar");
assert.throws(
  () => Core.validateStructureMetadata({ name: "bands.dat", size: 120 }),
  /UNSUPPORTED_STRUCTURE/
);
assert.throws(
  () => Core.validateStructureMetadata({ name: "sample.xyz", size: Core.MAX_STRUCTURE_BYTES + 1 }),
  /STRUCTURE_TOO_LARGE/
);

const manifest = Core.createHandoffManifest({
  file: {
    name: "FeSe.cif",
    size: 2048,
    lastModified: 123456789,
    type: "chemical/x-cif"
  },
  sha256: "a".repeat(64),
  task: "relax",
  bandEngine: "quantum_espresso",
  createdAt: "2026-07-29T00:00:00.000Z",
  arpesContext: {
    fingerprint: "source-fingerprint",
    sourceId: "source-1",
    filename: "sample.h5",
    path: "/entry/data",
    dtype: "float32",
    shape: [141, 747]
  }
});

assert.equal(manifest.schema, "arpes-bohrium-openlam-handoff/v1");
assert.equal(manifest.structure.sha256, "a".repeat(64));
assert.equal(manifest.structure.file_included, false);
assert.equal(manifest.workflow[0].stage, "openlam");
assert.equal(manifest.workflow[1].task, "scf+nscf+bands");
assert.ok(manifest.workflow[1].expected_outputs.includes("bands.dat.gnu"));
assert.equal(manifest.arpes_reference.source_id, "source-1");
assert.equal(manifest.data_policy.access_key_stored_by_this_site, false);
assert.equal(manifest.data_policy.remote_job_submitted_by_this_site, false);
assert.doesNotMatch(JSON.stringify(manifest), /BOHR_ACCESS_KEY|accessKey|apiKey/);

assert.throws(
  () => Core.createHandoffManifest({ file: { name: "FeSe.cif", size: 10 }, task: "paid_submit" }),
  /UNSUPPORTED_TASK/
);
assert.throws(
  () => Core.createHandoffManifest({ file: { name: "FeSe.cif", size: 10 }, bandEngine: "vasp" }),
  /UNSUPPORTED_BAND_ENGINE/
);

console.log("Bohrium/OpenLAM handoff tests passed");
