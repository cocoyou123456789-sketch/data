const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Host = require("../github-pages/material-host.js");

const feSe = [
  { symbol: "Fe", count: 1 },
  { symbol: "Se", count: 1 }
];

test("the host selects programs from the request", () => {
  assert.deepEqual(Host.selectPrograms({ request: "预测 FeSe 的形成能" }).programs, ["prediction"]);
  assert.deepEqual(
    Host.selectPrograms({ request: "检索 FeSe 的晶体结构，并查相关文献" }).programs,
    ["structure", "literature"]
  );
  assert.deepEqual(Host.selectPrograms({ request: "全面看一下 MgB2，包括 XAS 谱" }).programs, [
    "prediction",
    "structure",
    "literature",
    "spectrum"
  ]);
  assert.equal(Host.selectPrograms({ request: "MgB2" }).selection, "fallback-prediction");
  assert.deepEqual(Host.selectPrograms({ request: "MgB2" }).programs, ["prediction"]);
  assert.equal(Host.selectPrograms({ request: "你好" }).selection, "unmatched");
  assert.deepEqual(Host.selectPrograms({ request: "你好" }).programs, []);
  assert.equal(Host.selectPrograms({}).selection, "empty");
});

test("the host assembles one conclusion and records an unavailable program", async () => {
  const report = await Host.runHost({
    request: "预测 FeSe 的形成能，并检索晶体结构和相关文献",
    language: "zh",
    counts: feSe
  }, {
    runners: {
      prediction: async () => ({
        available: true,
        data: {
          state: "ready",
          formation_energy_eV_atom: -0.15,
          formation_error_q90_eV_atom: 0.21,
          metallic_tendency_score: 0.66
        }
      }),
      structure: async () => {
        throw new Error("服务器尚未配置 MP_API_KEY。");
      }
    }
  });

  assert.deepEqual(report.programs, ["prediction", "structure", "literature"]);
  assert.equal(report.calls.find(call => call.id === "prediction").status, "returned");
  assert.equal(report.calls.find(call => call.id === "structure").status, "unavailable");
  assert.equal(report.calls.find(call => call.id === "literature").status, "unavailable");
  assert.match(report.conclusion, /关于 FeSe/);
  assert.match(report.conclusion, /形成能 -0\.15 eV\/atom/);
  assert.match(report.conclusion, /未能使用：结构检索（服务器尚未配置 MP_API_KEY。）/);
  assert.match(report.conclusion, /文献检索（当前页面没有接上这个程序。）/);
  assert.match(report.conclusion, /一条结论/);
  assert.equal(report.conclusion.split("以上是主持人").length, 2);
  assert.doesNotMatch(report.conclusion, /\{/);
  assert.equal(typeof report.calls.find(call => call.id === "structure").data, "object");
  assert.equal(report.calls.find(call => call.id === "structure").data, null);
});

test("spectrum waits for a structure id and prediction is not called when it was not selected", async () => {
  let spectrumId = "";
  const report = await Host.runHost({
    request: "查 FeSe 的晶体结构和 XAS 谱",
    language: "zh",
    counts: feSe
  }, {
    runners: {
      prediction: async () => {
        throw new Error("prediction should not run");
      },
      structure: async () => ({
        available: true,
        data: {
          materials: [{
            material_id: "mp-20311",
            formula_pretty: "FeSe",
            symmetry: { crystal_system: "tetragonal", symbol: "P4/nmm" }
          }]
        }
      }),
      spectrum: async job => {
        spectrumId = job.materialId;
        return {
          available: true,
          data: { spectra: { xas: [{ edge: "K" }], optical_absorption: null } }
        };
      }
    }
  });

  assert.deepEqual(report.programs, ["structure", "spectrum"]);
  assert.equal(spectrumId, "mp-20311");
  assert.match(report.conclusion, /mp-20311/);
  assert.match(report.conclusion, /1 条 XAS 曲线/);
  assert.doesNotMatch(report.conclusion, /材料预测/);
});

test("page runners fall back when a program endpoint is unavailable", async () => {
  const runners = Host.createPageRunners({
    endpoints: {
      structure: "/api/materials-structure",
      literature: "/api/materials-search"
    },
    fetchImpl: async () => {
      throw new Error("offline");
    },
    baseline: {
      predictCounts(counts) {
        assert.equal(counts.length, 2);
        return {
          state: "ready",
          formation_energy_eV_atom: -0.42,
          formation_error_q90_eV_atom: 0.3,
          metallic_tendency_score: 0.2
        };
      }
    }
  });
  const report = await Host.runHost({
    request: "全面看一下",
    language: "zh",
    counts: [
      { symbol: "Mg", count: 1 },
      { symbol: "B", count: 2 }
    ]
  }, { runners });

  assert.equal(report.selection, "broad");
  assert.equal(report.calls.find(call => call.id === "prediction").status, "returned");
  assert.equal(report.calls.find(call => call.id === "structure").status, "unavailable");
  assert.equal(report.calls.find(call => call.id === "literature").status, "unavailable");
  assert.match(report.calls.find(call => call.id === "structure").fallback, /offline/);
  assert.match(report.conclusion, /形成能 -0\.42/);
  assert.match(report.conclusion, /结构检索（offline）/);
  assert.doesNotMatch(report.conclusion, /"materials"/);
});

test("the chair page exposes the host desk", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "github-pages", "index.html"), "utf8");
  assert.match(html, /<script defer src="material-host\.js"><\/script>/);
  assert.match(html, /id="materialHostForm"/);
  assert.match(html, /id="materialHostCalls"/);
  assert.match(html, /id="materialHostConclusion"/);
  assert.match(html, /window\.ARPESMaterialHostContext/);
});
