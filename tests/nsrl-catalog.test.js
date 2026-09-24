const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { categories } = require('../github-pages/nsrl-catalog.js');
const html = fs.readFileSync(require.resolve('../github-pages/index.html'), 'utf8');

test('NSRL taxonomy has two bilingual top-level categories', () => {
  assert.deepEqual(categories.map(c => c.zh), ['智能化加速器', '智能化线站']);
  assert.equal(new Set(categories.map(c => c.id)).size, 2);
  for (const c of categories) {
    assert.ok(c.en && c.modules.length >= 3);
    for (const m of c.modules) assert.ok(m.en && m.zh);
  }
});

function routing() {
  const calls = [];
  const region = () => ({ hidden: true, style: {} });
  const context = {
    pendingWorkbenchUser: null, currentLang: 'en', loginScreen: region(), magicBookScreen: region(),
    loadUser: () => ({}),
    document: { body: { classList: { add() {}, remove() {} } } },
    setInterfaceStage: stage => calls.push(stage),
    returnToLoginFromMagicBook() {}, switchLang() {}, resetMagicBook() {}, enterWorkbenchFromMagicBook() {},
    window: { NSRLCatalog: { open: options => calls.push(options) }, scrollTo() {} }
  };
  const fn = html.match(/function unlockWorkbench\(user, \{ entrance = "materials" \} = \{\}\) \{[\s\S]*?\n    \}/);
  assert.ok(fn);
  vm.runInNewContext(fn[0], context);
  return { context, calls };
}

test('left entrance opens NSRL; materials shortcut returns to original catalog', () => {
  const { context, calls } = routing();
  const user = { account_mode: 'nsrl_preview' };
  context.unlockWorkbench(user, { entrance: 'nsrl' });
  assert.equal(calls[0], 'nsrl');
  assert.equal(context.magicBookScreen.hidden, true);
  assert.equal(context.loginScreen.style.display, 'none');
  assert.equal(context.pendingWorkbenchUser, user);
  calls[1].onMaterials();
  assert.equal(calls[2], 'catalog');
  assert.equal(context.magicBookScreen.hidden, false);
});

test('right entrance retains the four-subject catalog by default', () => {
  const { context, calls } = routing();
  context.unlockWorkbench({ account_mode: 'guest' });
  assert.deepEqual(calls, ['catalog']);
  assert.equal(context.magicBookScreen.hidden, false);
});

test('both left login paths explicitly choose NSRL', () => {
  assert.match(html, /unlockWorkbench\(user, \{ entrance: "nsrl" \}\);\s*probeChatEndpoint/);
  const preview = html.slice(html.indexOf('ustcGuestBtn?.addEventListener'), html.indexOf('magicBookEnterBtn?.addEventListener'));
  assert.match(preview, /unlockWorkbench\(guest, \{ entrance: "nsrl" \}\)/);
});
