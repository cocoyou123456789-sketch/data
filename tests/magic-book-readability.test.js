const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const html = fs.readFileSync(path.join(__dirname, "..", "github-pages", "index.html"), "utf8");

function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n    \\}`));
  assert.ok(match, `missing CSS rule: ${selector}`);
  return match[1];
}

test("closed material books keep readable dimensions and perspective", () => {
  const tome = rule(".magic-tome");
  assert.match(tome, /width:\s*clamp\(160px,\s*18vw,\s*220px\)/);
  assert.match(tome, /font-size:\s*clamp\(21px,\s*2\.25vw,\s*32px\)/);
  assert.match(tome, /rotateX\(42deg\)/);
});

test("book subtitles remain legible on long English labels", () => {
  const subtitle = rule(".magic-tome small");
  assert.match(subtitle, /max-width:\s*94%/);
  assert.match(subtitle, /font-size:\s*clamp\(12px,\s*1\.15vw,\s*15px\)/);
  assert.match(subtitle, /line-height:\s*1\.34/);
});
