const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "github-pages", "index.html"), "utf8");
const center = html.match(/<div class="roundtable-center">([\s\S]*?)<div class="crucible-panel/);

assert.ok(center, "roundtable center exists");
assert.match(center[1], />综合研判模型</);
assert.match(center[1], /Consensus Synthesizer/);
assert.doesNotMatch(center[1], />GPT</);
assert.doesNotMatch(center[1], /gpt-5\.6-luna/);
assert.match(html, /consensus-synthesizer-local-v1/);
assert.match(html, /不调用 GPT/);
assert.match(html, /return \[synthesisRow, \.\.\.workerRows\]/);

console.log("Roundtable synthesizer tests passed");
