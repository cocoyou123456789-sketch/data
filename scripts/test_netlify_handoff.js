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

test("GitHub root hands off to the same-origin Netlify site", () => {
  assert.equal(
    runAt("https://cocoyou123456789-sketch.github.io/data/?arkfix=1#materials"),
    "https://arpes-materials-explorer-cocoyou.netlify.app/?arkfix=1#materials"
  );
});

test("GitHub subpages preserve their path, query, and fragment", () => {
  assert.equal(
    runAt("https://cocoyou123456789-sketch.github.io/data/model-test.html?probe=1#results"),
    "https://arpes-materials-explorer-cocoyou.netlify.app/model-test.html?probe=1#results"
  );
});

test("Netlify and the explicit GitHub escape hatch do not redirect", () => {
  assert.equal(runAt("https://arpes-materials-explorer-cocoyou.netlify.app/?probe=1"), "");
  assert.equal(
    runAt("https://cocoyou123456789-sketch.github.io/data/?stay_on_github=1"),
    ""
  );
});

test("both browser entry pages load the handoff before application code", () => {
  for (const file of ["index.html", "model-test.html"]) {
    const html = fs.readFileSync(path.join(__dirname, "..", "github-pages", file), "utf8");
    const handoffIndex = html.indexOf('<script src="./netlify-handoff.js?v=20260817"></script>');
    assert.ok(handoffIndex >= 0, `${file} loads the Netlify handoff`);
    assert.ok(handoffIndex < html.indexOf("</head>"), `${file} loads the handoff in <head>`);
  }
});
