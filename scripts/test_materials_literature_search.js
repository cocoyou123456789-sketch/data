const assert = require("node:assert/strict");
const {
  extractFormulas,
  runMaterialsLiteratureSearch
} = require("../lib/materials-literature-search");

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

async function mockFetch(url, options = {}) {
  assert.ok(options.headers["X-ApiKey"] === "wos-test" || options.headers["X-API-KEY"] === "mp-test");
  if (url.startsWith("https://wos.test/")) {
    return jsonResponse({
      metadata: { total: 2 },
      hits: [
        {
          uid: "WOS:TEST001",
          title: "Electronic structure and photocatalysis of monolayer MoS2",
          abstract: "The calculated band gap and density of states of MoS2 are discussed.",
          identifiers: { doi: "10.1000/mos2" },
          source: { sourceTitle: "TEST JOURNAL", publishYear: 2025 },
          keywords: ["band gap", "DOS"]
        },
        {
          uid: "WOS:TEST002",
          title: "Magnetic and superconducting properties of FeSe",
          identifiers: { doi: "10.1000/fese" },
          source: { sourceTitle: "TEST MATERIALS", publishYear: 2024 }
        }
      ]
    });
  }
  if (url.startsWith("https://mp.test/")) {
    const formula = new URL(url).searchParams.get("formula");
    const docs = {
      MoS2: [{
        material_id: "mp-2815", formula_pretty: "MoS2", elements: ["Mo", "S"],
        symmetry: { symbol: "P6_3/mmc", number: 194 }, structure: { sites: [] },
        band_gap: 1.2, is_gap_direct: false, is_metal: false, is_stable: true,
        energy_above_hull: 0, formation_energy_per_atom: -1.1, density: 5.0,
        volume: 106, ordering: "NM", total_magnetization: 0,
        has_props: ["dos", "bandstructure"], deprecated: false
      }],
      FeSe: [{
        material_id: "mp-123", formula_pretty: "FeSe", elements: ["Fe", "Se"],
        symmetry: { symbol: "P4/nmm", number: 129 }, structure: { sites: [] },
        band_gap: 0, is_metal: true, is_stable: true, energy_above_hull: 0,
        density: 5.7, has_props: ["dos"], deprecated: false
      }]
    };
    return jsonResponse({ data: docs[formula] || [] });
  }
  throw new Error(`Unexpected URL: ${url}`);
}

async function main() {
  assert.deepEqual(extractFormulas("MoS2 and iron selenide FeSe"), ["MoS2", "FeSe"]);
  const result = await runMaterialsLiteratureSearch(
    { query: "2D materials band gap", limit: 10, max_materials: 5 },
    {
      fetchImpl: mockFetch,
      wosApiKey: "wos-test",
      mpApiKey: "mp-test",
      wosEndpoint: "https://wos.test/documents",
      mpEndpoint: "https://mp.test/summary/",
      disableCache: true
    }
  );
  assert.equal(result.statistics.wos_records, 2);
  assert.equal(result.materials.length, 2);
  const mos2 = result.materials.find(item => item.material_id === "mp-2815");
  assert.equal(mos2.band_gap_eV, 1.2);
  assert.equal(mos2.has_dos, true);
  assert.equal(mos2.article_ids[0], "WOS:TEST001");
  assert.ok(result.articles.every(article => !("abstract" in article)));
  console.log(JSON.stringify({ ok: true, statistics: result.statistics, formulas: result.formulas }));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
