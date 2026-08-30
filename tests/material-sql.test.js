const assert = require("node:assert/strict");
const test = require("node:test");
const { z } = require("zod");
const { createMaterialSqlStore, materialSqlQuerySchema } = require("../lib/material-sql");
const { queryMaterialDatabase } = require("../lib/arpes-research-agent");

const fixture = (material, tc, elements = ["Fe"], extras = {}) => ({
  material, display_name: material, topic: "superconductivity", family: "Iron-based",
  elements, transition_temperature_K: tc, verification_status: "test_fixture", ...extras
});
const store = createMaterialSqlStore([
  fixture("Zero", 0), fixture("Boundary", 30), fixture("High", 39),
  fixture("Unknown", null, ["F"]), fixture("Cuprate", 90, ["Cu"], { family: "Cuprates" }),
  fixture("literal%_", null, ["C"], { topic: "two_dimensional_materials", bandgap_eV: 0 })
]);

test("SQLite compares Tc numerically and distinguishes strict and inclusive thresholds", async () => {
  const gt = await store.query({ tc: { operator: "gt", value: 30 }, sort: "tc_desc" });
  assert.deepEqual(gt.matches.map(row => row.material), ["Cuprate", "High"]);
  const gte = await store.query({ tc: { operator: "gte", value: 30 }, sort: "tc_asc" });
  assert.deepEqual(gte.matches.map(row => row.material), ["Boundary", "High", "Cuprate"]);
  assert.equal((await store.query({ tc: { operator: "lt", value: 30 } })).total_matches, 1);
  assert.equal((await store.query({ tc: { operator: "lte", value: 30 } })).total_matches, 2);
});

test("unknown Tc remains NULL and is never treated as zero", async () => {
  const result = await store.query({ tc: { operator: "eq", value: 0 } });
  assert.deepEqual(result.matches.map(row => row.material), ["Zero"]);
  assert.equal((await store.query({ query: "Unknown" })).matches[0].transition_temperature_K, null);
  const sorted = await store.query({ sort: "tc_asc" });
  assert.deepEqual(sorted.matches.slice(-2).map(row => row.transition_temperature_K), [null, null]);
  assert.equal((await store.query({ query: "%_" })).matches[0].bandgap_eV, 0);
});

test("SQLite combines topic, family, literal text, and exact case-insensitive element filters", async () => {
  const result = await store.query({ topic: "superconductivity", family: "IRON", element: "fe", tc: { operator: "gt", value: 30 } });
  assert.deepEqual(result.matches.map(row => row.material), ["High"]);
  assert.deepEqual((await store.query({ element: "F" })).matches.map(row => row.material), ["Unknown"]);
  assert.equal((await store.query({ topic: "two_dimensional_materials" })).total_matches, 1);
  assert.equal((await store.query({ query: "HIGH", element: "Cu" })).total_matches, 0);
});

test("SQL-looking strings and wildcard characters are literal data and cannot mutate the catalog", async () => {
  for (const query of ["' OR 1=1 --", "'; DROP TABLE materials; --", "ATTACH DATABASE '/tmp/secret' AS x"]) {
    assert.equal((await store.query({ query })).total_matches, 0);
  }
  assert.deepEqual((await store.query({ query: "%_" })).matches.map(row => row.material), ["literal%_"]);
  assert.equal((await store.query()).total_matches, 6);
  assert.deepEqual(Object.keys(store), ["query"]);
});

test("query schema rejects raw SQL, unsafe sorting, and oversized or invalid filters", async () => {
  for (const filters of [{ sql: "SELECT * FROM materials" }, { sort: "tc_k; DROP TABLE materials" },
    { limit: 10000 }, { limit: -1 }, { limit: 1.5 }, { tc: { operator: "gt", value: "30" } },
    { tc: { operator: "gt", value: NaN } }, { query: "x".repeat(121) }, { element: "Fe'" }, [], null]) {
    await assert.rejects(store.query(filters), error => error.code === "MATERIAL_SQL_INVALID_FILTERS");
  }
});

test("limited results report total count, truncation, provenance, and seed-data limitations", async () => {
  const result = await store.query({ limit: 2, sort: "tc_desc" });
  assert.equal(result.source, "local_arpes_sqlite_catalog");
  assert.equal(result.read_only, true);
  assert.equal(result.total_matches, 6);
  assert.equal(result.matches.length, 2);
  assert.equal(result.truncated, true);
  assert.equal(result.matches[0].source_file, "data/superconductivity.json");
  assert.match(result.warning, /not verified measurements/);
  assert.equal((await store.query({ query: "absent" })).truncated, false);
});

test("concurrent SQLite queries do not leak bindings or previous results", async () => {
  const results = await Promise.all(Array.from({ length: 20 }, (_, index) => store.query({ element: index % 2 ? "Cu" : "F" })));
  results.forEach((result, index) => assert.equal(result.matches[0].material, index % 2 ? "Cuprate" : "Unknown"));
});

test("registered function schema has only required typed filters and no SQL parameter", () => {
  const schema = z.toJSONSchema(materialSqlQuerySchema);
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required.sort(), Object.keys(schema.properties).sort());
  assert.equal(schema.properties.sql, undefined);
});

test("real ARPES catalogs are queried through SQLite without network calls or new credentials", async () => {
  const result = await queryMaterialDatabase({ element: "Cu", tc: { operator: "gt", value: 30 }, sort: "tc_desc" });
  assert.ok(result.matches.length > 0);
  assert.ok(result.matches.every(row => row.elements.includes("Cu") && row.transition_temperature_K > 30));
  assert.ok(result.matches.every(row => row.verification_status && row.source_file && row.tc_note));
  const graphene = await queryMaterialDatabase({ query: "graphene", tc: { operator: "eq", value: 0 } });
  assert.equal(graphene.total_matches, 0);
});
