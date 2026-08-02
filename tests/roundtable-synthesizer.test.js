const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "github-pages", "index.html"), "utf8");
const consensusSource = fs.readFileSync(path.join(__dirname, "..", "github-pages", "material-consensus.js"), "utf8");
const centerStart = html.indexOf('<div class="roundtable-center" data-roundtable-host="materials-research-chair">');
const centerEnd = html.indexOf('<section class="mixture-analysis-panel"', centerStart);
const center = html.slice(centerStart, centerEnd);

assert.ok(centerStart >= 0 && centerEnd > centerStart, "roundtable center exists");
assert.match(center, /aria-label="材料研究主持人中央坩埚"/);
assert.match(center, /crucible-visual[\s\S]*data-roundtable-model-title>材料研究主持人</);
assert.match(center, /id="roundtableChairOpenBtn"/);
assert.match(center, />进入主持工作台</);
assert.doesNotMatch(center, />综合研判模型</);
assert.doesNotMatch(center, />GPT</);
assert.doesNotMatch(center, /gpt-5\.6-luna/);
assert.match(html, /materials-chair-local-v1/);
assert.doesNotMatch(html, /consensus-synthesizer-local-v1/);
assert.match(html, /不调用 GPT/);
assert.match(html, /<script defer src="material-synthesizer\.js"><\/script>/);
assert.match(html, /window\.ARPESMaterialSynthesizer\.synthesize/);
assert.match(html, /evidence_eligible: row\.evidenceEligible === true/);
assert.match(html, /claims: Object\.freeze/);
assert.match(html, /return \[synthesisRow, \.\.\.workerRows\]/);
assert.match(html, /name: zh \? "材料研究主持人" : "Materials Research Chair"/);
assert.match(html, /role: "host"/);
assert.match(html, /evidenceEligible: false/);
assert.match(consensusSource, /snapshot\?\.rows\) \? snapshot\.rows\.filter\(row => row\?\.role !== "host"\)/);
assert.match(html, /\$\("#roundtableChairOpenBtn"\)\?\.addEventListener\("click", openRoundtableChair\)/);
assert.match(html, /function openRoundtableChair\(event\)/);

console.log("Roundtable synthesizer tests passed");
