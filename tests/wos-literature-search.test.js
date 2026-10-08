const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { runWosLiteratureSearch } = require("../lib/materials-literature-search");

test("pure WoS search needs no Materials Project key and preserves article links", async () => {
  let requestedUrl = "";
  let requestedHeaders = null;
  const result = await runWosLiteratureSearch({ query: "BaTiO3 dielectric properties", limit: 10 }, {
    wosApiKey: "test-wos-key",
    disableCache: true,
    fetchImpl: async (url, options) => {
      requestedUrl = String(url);
      requestedHeaders = options.headers;
      return {
        ok: true,
        json: async () => ({
          metadata: { total: 1 },
          hits: [{
            uid: "WOS:000000001",
            title: "Dielectric properties of BaTiO3",
            identifiers: { doi: "10.1000/example" },
            names: { authors: [{ displayName: "A. Researcher" }] },
            source: { sourceTitle: "Journal of Test Materials", publishYear: 2026 },
            keywords: { authorKeywords: ["dielectric properties"] },
            citations: [{ count: 4 }]
          }]
        })
      };
    }
  });
  assert.match(requestedUrl, /TS%3D%28BaTiO3\+dielectric\+properties%29/);
  assert.equal(requestedHeaders["X-ApiKey"], "test-wos-key");
  assert.equal(result.count, 1);
  assert.equal(result.articles[0].doi, "10.1000/example");
  assert.equal(result.articles[0].authors[0], "A. Researcher");
  assert.match(result.articles[0].url, /webofscience\.com/);
});

test("browser panel is WoS-only and exposes clickable knowledge-card searches", () => {
  const script = fs.readFileSync(path.join(__dirname, "../github-pages/materials-literature-search.js"), "utf8");
  assert.match(script, /<h4>Web of Science<\/h4>/);
  assert.doesNotMatch(script, /Materials Project|MP_API_KEY/);
  assert.match(script, /\.cats \.cat/);
  assert.match(script, /\.cats \.tag/);
  assert.match(script, /打开 WoS 记录/);
  assert.match(script, /https:\/\/doi\.org/);
  assert.match(script, /fetchWithFallback/);
  assert.match(script, /unavailableEndpoints\.has\(storedEndpoint\) \? compatibilityEndpoint/);
});
