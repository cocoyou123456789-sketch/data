const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  buildSearchParams,
  handleMaterialsStructureRequest,
  normalizeRequest,
  runMaterialsSpectroscopy,
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
  assert.match(cif, /# Original Materials Project space group: P4\/mmm/);
  assert.match(cif, /_symmetry_space_group_name_H-M 'P 1'/);
  assert.match(cif, /_symmetry_Int_Tables_number 1/);
  assert.match(cif, /_space_group_symop_operation_xyz\n'x, y, z'/);
  assert.match(cif, /Ti1 Ti 1\.0 0\.0 0\.0 0\.0/);
  const poscar = structureToPoscar(structure, { materialId: "mp-test", formula: "TiO" });
  assert.match(poscar, /Ti O/);
  assert.match(poscar, /1 1/);
  assert.match(poscar, /Direct/);
  const wrappedStructure = structuredClone(structure);
  wrappedStructure.sites[1].abc = [1, -0.5, 1.5];
  const wrappedCif = structureToCif(wrappedStructure, { formula: "TiO", symmetrySymbol: "P4/mmm" });
  const wrappedPoscar = structureToPoscar(wrappedStructure, { formula: "TiO" });
  assert.match(wrappedCif, /O1 O 1\.0 0\.0 0\.5 0\.5/);
  assert.match(wrappedPoscar, /0\.0\s+0\.5\s+0\.5/);
  const browserSource = fs.readFileSync(path.join(__dirname, "..", "github-pages", "materials-structure-search.js"), "utf8");
  assert.match(browserSource, /\.vasp`/);
  assert.match(browserSource, /application\/octet-stream/);
  assert.match(browserSource, /data-detail-tab="properties"/);
  assert.match(browserSource, /data-detail-tab="dos"/);
  assert.match(browserSource, /data-detail-tab="band"/);
  assert.match(browserSource, /data-detail-tab="spectra"/);
  assert.match(browserSource, /action: "details"/);
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

  const propertyEndpoints = Object.fromEntries(["electronic", "absorption", "dielectric", "elasticity", "magnetism", "xas"]
    .map(name => [name, `https://mock.test/${name}`]));
  const detailFetch = async url => {
    const route = new URL(String(url)).pathname.slice(1);
    const docs = {
      electronic: [{ material_id: "mp-test", band_gap: 1.25, cbm: 2.1, vbm: 0.85, efermi: 1.0, is_gap_direct: false, is_metal: false, magnetic_ordering: "NM", dos: { task_id: "task-dos", total: { "1": { band_gap: 1.2, cbm: 2.1, vbm: 0.9, efermi: 1.0 } }, elemental: { Ti: {} }, orbital: { d: {} } }, bandstructure: { setyawan_curtarolo: { task_id: "task-band", band_gap: 1.25, direct_gap: 1.8, efermi: 1.0, cbm: { energy: 2.1, kpoint: { label: "X" } }, vbm: { energy: 0.85, kpoint: { label: "GAMMA" } }, nbands: 24, is_gap_direct: false, is_metal: false } } }],
      absorption: [{ material_id: "mp-test", energies: [0, 1, 2], absorption_coefficient: [0, 10, 30], bandgap: 1.25, nkpoints: 64 }],
      dielectric: [{ material_id: "mp-test", e_total: 12, e_ionic: 2, e_electronic: 10, n: 3.46, total: [[12, 0, 0], [0, 12, 0], [0, 0, 12]] }],
      elasticity: [{ material_id: "mp-test", bulk_modulus: { vrh: 100 }, shear_modulus: { vrh: 60 }, universal_anisotropy: 0.2, homogeneous_poisson: 0.25, debye_temperature: 500 }],
      magnetism: [{ material_id: "mp-test", ordering: "NM", is_magnetic: false, num_magnetic_sites: 0, types_of_magnetic_species: [], total_magnetization: 0 }],
      xas: [{ formula_pretty: "TiO", task_id: "task-xas", absorbing_element: "Ti", edge: "K", spectrum_type: "XANES", spectrum: { x: [4960, 4970, 4980], y: [0, 0.4, 1] } }]
    };
    return new Response(JSON.stringify({ data: docs[route] || [] }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const details = await runMaterialsSpectroscopy({ action: "details", material_id: "mp-test", formula: "TiO" }, {
    mpApiKey: "mp-test-key", fetchImpl: detailFetch, propertyEndpoints, disableCache: true
  });
  assert.equal(details.availability.dos, true);
  assert.equal(details.availability.band_structure, true);
  assert.equal(details.availability.xas, true);
  assert.equal(details.availability.optical_absorption, true);
  assert.equal(details.dos.task_id, "task-dos");
  assert.equal(details.band_structure.setyawan_curtarolo.task_id, "task-band");
  assert.deepEqual(details.spectra.xas[0].energy_eV, [4960, 4970, 4980]);
  assert.deepEqual(details.spectra.optical_absorption.coefficient_cm_inverse, [0, 10, 30]);
  assert.equal(details.properties.elasticity.bulk_modulus_GPa, 100);

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

  const detailResponse = await handleMaterialsStructureRequest({
    method: "POST",
    body: { action: "details", material_id: "mp-test", formula: "TiO" },
    ip: "test-details"
  }, { mpApiKey: "mp-test-key", fetchImpl: detailFetch, propertyEndpoints, disableCache: true });
  assert.equal(detailResponse.statusCode, 200);
  assert.equal(detailResponse.payload.action, "details");

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
