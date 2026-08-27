const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const script = fs.readFileSync(
  path.join(__dirname, "..", "github-pages", "netlify-handoff.js"),
  "utf8"
);

function runAt(url) {
  let replacement = "";
  const current = new URL(url);
  const location = {
    href: current.href,
    hostname: current.hostname,
    replace(value) { replacement = String(value); }
  };
  vm.runInNewContext(script, { URL, window: { location } });
  return replacement;
}

test("GitHub material catalog stays on GitHub Pages for reliable round trips", () => {
  assert.equal(
    runAt("https://cocoyou123456789-sketch.github.io/data/?arkfix=1#materials"),
    ""
  );
});

test("GitHub subpages preserve their path, query, and fragment", () => {
  assert.equal(
    runAt("https://cocoyou123456789-sketch.github.io/data/model-test.html?probe=1#results"),
    "https://arpes-materials-explorer-cocoyou.netlify.app/model-test.html?probe=1#results"
  );
  assert.equal(
    runAt("https://cocoyou123456789-sketch.github.io/data/agent.html?topic=Bi2212#chat"),
    "https://arpes-materials-explorer-cocoyou.netlify.app/agent.html?topic=Bi2212#chat"
  );
});

test("Netlify and the explicit GitHub escape hatch do not redirect", () => {
  assert.equal(runAt("https://arpes-materials-explorer-cocoyou.netlify.app/?probe=1"), "");
  assert.equal(
    runAt("https://cocoyou123456789-sketch.github.io/data/?stay_on_github=1"),
    ""
  );
});

test("chemical materials links support repeated GitHub Pages round trips", () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, "..", "github-pages", "index.html"), "utf8");
  const chemistryHtml = fs.readFileSync(path.join(__dirname, "..", "github-pages", "chemistry.html"), "utf8");
  assert.match(indexHtml, /href="\.\/chemistry\.html\?v=20260827-4"/);
  assert.match(indexHtml, /同步辐射材料化学入口/);
  assert.match(indexHtml, /点击进入 · 同步辐射/);
  assert.match(indexHtml, /onclick="window\.location\.assign\(this\.href\); return false;"/);
  assert.match(chemistryHtml, /href="\.\/\?stay_on_github=1&amp;v=20260827-2"/);
  assert.equal(runAt("https://cocoyou123456789-sketch.github.io/data/?stay_on_github=1&v=20260827-2"), "");
});

test("all browser entry pages load the handoff before application code", () => {
  for (const file of ["index.html", "model-test.html", "agent.html"]) {
    const html = fs.readFileSync(path.join(__dirname, "..", "github-pages", file), "utf8");
    const match = html.match(/<script src="\.\/netlify-handoff\.js\?v=\d+"><\/script>/);
    const handoffIndex = match ? html.indexOf(match[0]) : -1;
    assert.ok(handoffIndex >= 0, `${file} loads the Netlify handoff`);
    assert.ok(handoffIndex < html.indexOf("</head>"), `${file} loads the handoff in <head>`);
  }
});
