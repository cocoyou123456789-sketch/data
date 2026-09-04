const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "github-pages", "index.html"), "utf8");

function loadSetRegionInteractive() {
  const match = html.match(/function setRegionInteractive\(element, interactive\) \{[\s\S]*?\n    \}/);
  assert.ok(match, "setRegionInteractive must remain testable in the page source");
  const context = {};
  vm.runInNewContext(`${match[0]}; globalThis.setRegionInteractive = setRegionInteractive;`, context);
  return context.setRegionInteractive;
}

class NonReflectingInertElement {
  constructor() {
    this.inert = true;
    this.attributes = new Set(["inert", "aria-hidden"]);
  }

  setAttribute(name) {
    this.attributes.add(name);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }
}

test("unlocking explicitly removes inert for browsers without property reflection", () => {
  const element = new NonReflectingInertElement();
  loadSetRegionInteractive()(element, true);
  assert.equal(element.inert, false);
  assert.equal(element.hasAttribute("inert"), false);
  assert.equal(element.hasAttribute("aria-hidden"), false);
});

test("locking explicitly restores inert and aria-hidden", () => {
  const element = new NonReflectingInertElement();
  element.attributes.clear();
  loadSetRegionInteractive()(element, false);
  assert.equal(element.inert, true);
  assert.equal(element.hasAttribute("inert"), true);
  assert.equal(element.hasAttribute("aria-hidden"), true);
});
