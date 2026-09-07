const test = require("node:test");
const assert = require("node:assert/strict");
const Lab = require("../github-pages/photon-lab-core.js");

test("composition edits preserve ratios and reject unsupported or oversized inputs", () => {
  assert.deepEqual(Lab.parseFormula("YBa2Cu3O7"), [
    { symbol: "Y", count: 1 },
    { symbol: "Ba", count: 2 },
    { symbol: "Cu", count: 3 },
    { symbol: "O", count: 7 },
  ]);
  assert.equal(Lab.formula(Lab.parseFormula("Fe0.5Se0.5")), "Fe0.5Se0.5");
  assert.equal(
    Lab.formula(
      Lab.normalize([
        { symbol: "Cu", count: 1 },
        { symbol: "Cu", count: 2 },
      ]),
    ),
    "Cu3",
  );
  for (const bad of [
    "Mg(B2)",
    "Cu0",
    "Xx2",
    "Fe100",
    "Fe-2",
    "Cu1e3",
    "<img>",
    "H0.001",
  ])
    assert.throws(() => Lab.parseFormula(bad));
  assert.throws(() =>
    Lab.normalize([
      { symbol: "Cu", count: 99 },
      { symbol: "Cu", count: 1 },
    ]),
  );
});

test("all four scenes export self-contained finite indexed glTF geometry", () => {
  for (const mode of ["ring", "beamline", "crucible", "crystal"])
    for (const exploded of [false, true]) {
      const objects = Lab.scene(mode, Lab.parseFormula("MgB2"), exploded);
      const exported = Lab.gltf(objects);
      assert.equal(exported.asset.version, "2.0");
      assert.equal(exported.nodes.length, objects.length);
      const bytes = Buffer.from(
        exported.buffers[0].uri.split(",")[1],
        "base64",
      );
      assert.equal(bytes.length, exported.buffers[0].byteLength);
      for (const view of exported.bufferViews) {
        assert.equal(view.byteOffset % 4, 0);
        assert.ok(view.byteOffset + view.byteLength <= bytes.length);
      }
      for (const obj of objects) {
        assert.ok(obj.vertices.flat().every(Number.isFinite));
        for (const face of obj.faces)
          for (const index of face)
            assert.ok(index >= 0 && index < obj.vertices.length);
      }
      for (const access of exported.accessors) {
        assert.ok(access.count > 0);
        if (access.min)
          for (let i = 0; i < 3; i++) assert.ok(access.min[i] <= access.max[i]);
      }
      for (const mesh of exported.meshes) {
        const accessor =
          exported.accessors[mesh.primitives[0].attributes.NORMAL];
        const view = exported.bufferViews[accessor.bufferView];
        for (let i = 0; i < accessor.count; i++) {
          const offset = view.byteOffset + i * 12;
          const length = Math.hypot(
            bytes.readFloatLE(offset),
            bytes.readFloatLE(offset + 4),
            bytes.readFloatLE(offset + 8),
          );
          assert.ok(
            Math.abs(length - 1) < 1e-5,
            "exported normals must have unit length, including at sphere poles",
          );
        }
      }
      assert.ok(
        exported.materials.every((m) =>
          m.pbrMetallicRoughness.baseColorFactor.every(Number.isFinite),
        ),
      );
    }
});
