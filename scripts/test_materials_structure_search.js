const assert = require("node:assert/strict");

const {
  buildSearchParams,
  handleMaterialsStructureRequest,
  normalizeRequest,
  runMaterialsStructureSearch,
  structureToCif,
  structureToPoscar
} = require("../lib/materials-structure-search");

const structure = {
  charge: 0,
  lattice: {
    matrix: [[3.1, 0, 0], [0, 3.1, 0], [0, 0, 5.2]],
    a: 3.1,
    b: 3.1,
    c: 5.2,
    alpha: 90,
    beta: 90,
    gamma: 90,
    volume: 49.972
  },
  sites: [
    { label: "Ti", species: [{ element: "Ti", occu: 1 }], abc: [0, 0, 0], xyz: [0, 0, 0] },
    { label: "O", species: [{ element: "O", occu: 1 }], abc: [0.5, 0.5, 0.5], xyz: [1.55, 1.55, 2.6] }
  ]
};

const sampleDoc = {
  material_id: "mp-test",
  formula_pretty: "TiO",
  elements: ["Ti", "O"],
  nelements: 2,
  nsites: 2,
  symmetry: { symbol: "P4/mmm", number: 123, crystal_system: "Tetragonal", point_group: "4/mmm" },
  structure,
  band_gap: 1.25,
  is_gap_direct: false,
  is_metal: false,
  is_stable: true,
  energy_above_hull: 0,
  formation_energy_per_atom: -2.4,
  density: 4.2,
  volume: 49.972,
  theoretical: true,
  has_props: ["dos", "bandstructure"],
  ordering: "NM",
  total_magnetization: 0
};

async function main() {
  const normalized = normalizeRequest({
    query: "Li-Fe-O",
    elements: "Li, O",
    band_gap_min: 0.5,
    band_gap_max: 1.5,
    stable: "true",
    metallic: "false",
    has_dos: true,
    crystal_system: "cubic",
    limit: 99
  });
  assert.equal(normalized.chemsys, "Li-Fe-O");
  assert.deepEqual(normalized.elements, ["Li", "O"]);
  assert.equal(normalized.limit, 40);
  const params = buildSearchParams(normalized);
  assert.equal(params.get("chemsys"), "Li-Fe-O");
  assert.equal(params.get("band_gap_max"), "1.5");
  assert.equal(params.get("is_stable"), "true");
  assert.equal(params.get("is_metal"), "false");
  assert.equal(params.get("has_props"), "dos");
  assert.match(params.get("_fields"), /structure/);

  const cif = structureToCif(structure, { materialId: "mp-test", formula: "TiO", symmetrySymbol: "P4/mmm" });
  assert.match(cif, /_cell_length_a 3\.1/);
  assert.match(cif, /Ti1 Ti 1\.0 0\.0 0\.0 0\.0/);
  const poscar = structureToPoscar(structure, { materialId: "mp-test", formula: "TiO" });
  assert.match(poscar, /Ti O/);
  assert.match(poscar, /1 1/);
  assert.match(poscar, /Direct/);
  const disordered = structuredClone(structure);
  disordered.sites[0].species = [{ element: "Ti", occu: 0.5 }, { element: "Zr", occu: 0.5 }];
  assert.equal(structureToPoscar(disordered, { formula: "Ti0.5Zr0.5O" }), null);
  assert.match(structureToCif(disordered, { formula: "Ti0.5Zr0.5O" }), /Ti 0\.5/);

  let requestedUrl = "";
  let requestedHeaders = null;
  const fetchImpl = async (url, options) => {
    requestedUrl = String(url);
    requestedHeaders = options.headers;
    return new Response(JSON.stringify({ data: [sampleDoc], meta: { total_doc: 1 } }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };
  const result = await runMaterialsStructureSearch({
    query: "TiO",
    band_gap_max: 1.5,
    stable: true,
    limit: 10
  }, { mpApiKey: "mp-test-key", fetchImpl, disableCache: true });
  assert.match(requestedUrl, /formula=TiO/);
  assert.match(requestedUrl, /band_gap_max=1.5/);
  assert.equal(requestedHeaders["X-API-KEY"], "mp-test-key");
  assert.equal(result.materials[0].material_id, "mp-test");
  assert.equal(result.materials[0].structure.sites.length, 2);
  assert.ok(result.materials[0].files.cif);
  assert.ok(result.materials[0].files.poscar);
  assert.equal(result.materials[0].has_dos, true);

  const invalid = await handleMaterialsStructureRequest({
    method: "POST",
    body: { query: "not a material query" },
    ip: "test-invalid"
  }, { mpApiKey: "mp-test-key", fetchImpl, disableCache: true });
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.payload.ok, false);

  const success = await handleMaterialsStructureRequest({
    method: "POST",
    body: { query: "mp-test" },
    ip: "test-success"
  }, { mpApiKey: "mp-test-key", fetchImpl, disableCache: true });
  assert.equal(success.statusCode, 200);
  assert.equal(success.payload.statistics.cif_available, 1);

  process.stdout.write(JSON.stringify({
    ok: true,
    query: normalized.chemsys,
    cif: Boolean(cif),
    poscar: Boolean(poscar),
    material: result.materials[0].material_id
  }));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
