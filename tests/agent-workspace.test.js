const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "github-pages", "agent.html"), "utf8");
const script = fs.readFileSync(path.join(ROOT, "github-pages", "agent-workspace.js"), "utf8");
const mainHtml = fs.readFileSync(path.join(ROOT, "github-pages", "index.html"), "utf8");

test("standalone agent workspace is linked from the main chat and uses the GitHub handoff", () => {
  assert.match(mainHtml, /href="\.\/agent\.html"[^>]*>独立工作台/);
  assert.match(html, /href="\.\/agent-demo-prototype\.html\?variant=A"[^>]*>\s*<span>无需登录 Demo<\/span>/);
  assert.match(html, /<script src="\.\/netlify-handoff\.js\?v=\d+"><\/script>/);
  assert.match(html, /<script src="\.\/agent-workspace\.js\?v=\d+"><\/script>/);
  assert.ok(html.indexOf("netlify-handoff.js") < html.indexOf("</head>"));
});

test("standalone workspace sends only the fixed server agent mode through the existing auth session", () => {
  assert.match(script, /TOKEN_KEY\s*=\s*"arpes-ai-chat-session-v1"/);
  assert.match(script, /provider:\s*"openai",\s*\n\s*mode:\s*"arpes_research_agent"/);
  assert.match(script, /session_token:\s*token\(\)/);
  assert.match(script, /"Content-Type":\s*"text\/plain;charset=UTF-8"/);
  assert.doesNotMatch(script, /OPENAI_API_KEY|api[_-]?key/i);
});

test("standalone workspace renders model markdown through textContent-only DOM paths", () => {
  assert.match(script, /function renderRichText\(container, value\)/);
  assert.match(script, /element\.textContent\s*=\s*tokenValue/);
  assert.match(script, /codeNode\.textContent\s*=\s*code\.join/);
  assert.doesNotMatch(script, /innerHTML|insertAdjacentHTML|document\.write/);
  assert.doesNotThrow(() => new Function(script));
});

test("standalone workspace provides bounded context, history, export, and manual retry behavior", () => {
  assert.match(html, /id="contextInput"[^>]*maxlength="6000"/);
  assert.match(html, /id="questionInput"[^>]*maxlength="8000"/);
  assert.match(script, /MAX_MESSAGES\s*=\s*14/);
  assert.match(html, /Dropbox 知识库/);
  assert.match(script, /knowledge\.search_configured/);
  assert.match(script, /text\/markdown;charset=utf-8/);
  assert.match(script, /系统没有自动重试，避免重复计费/);
  assert.doesNotMatch(script, /fetch\([^)]*\)\s*\.catch\([^)]*fetch/s);
});
