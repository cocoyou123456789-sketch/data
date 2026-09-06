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

function loadInterfaceStage(elements) {
  const surfaceMatch = html.match(/const appSurfaceElements = \[[\s\S]*?\]\.filter\(Boolean\);/);
  const interactiveMatch = html.match(/function setRegionInteractive\(element, interactive\) \{[\s\S]*?\n    \}/);
  const stageMatch = html.match(/function setInterfaceStage\(stage\) \{[\s\S]*?\n    \}/);
  assert.ok(surfaceMatch, "app surface selection must remain testable in the page source");
  assert.ok(interactiveMatch, "setRegionInteractive must remain testable in the page source");
  assert.ok(stageMatch, "setInterfaceStage must remain testable in the page source");

  const context = {
    document: {
      querySelector(selector) {
        return elements[selector] || null;
      }
    },
    loginScreen: elements["#loginScreen"],
    magicBookScreen: elements["#magicBookScreen"]
  };
  vm.runInNewContext(
    `${surfaceMatch[0]}\n${interactiveMatch[0]}\n${stageMatch[0]}\n` +
      "globalThis.setInterfaceStage = setInterfaceStage;",
    context
  );
  return context.setInterfaceStage;
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

test("entering the workbench unlocks the visible application main instead of the hidden chemistry main", () => {
  const header = new NonReflectingInertElement();
  const topicBar = new NonReflectingInertElement();
  const topMenu = new NonReflectingInertElement();
  const chemistryMain = new NonReflectingInertElement();
  const appMain = new NonReflectingInertElement();
  const loginScreen = new NonReflectingInertElement();
  const magicBookScreen = new NonReflectingInertElement();
  const setInterfaceStage = loadInterfaceStage({
    header,
    ".topic-switch-bar": topicBar,
    ".top-menu-bar": topMenu,
    main: chemistryMain,
    "#appMain": appMain,
    "#loginScreen": loginScreen,
    "#magicBookScreen": magicBookScreen
  });

  setInterfaceStage("workbench");

  assert.equal(appMain.hasAttribute("inert"), false, "the visible workbench must accept clicks and text input");
  assert.equal(chemistryMain.hasAttribute("inert"), true, "the hidden chemistry surface stays inactive");
});
