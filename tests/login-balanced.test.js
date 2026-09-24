const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../github-pages');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'login-balanced.css'), 'utf8');

test('login screen omits the three explanatory captions in both languages', () => {
  for (const key of ['loginHint', 'loginGuestHint', 'loginPrivacy']) {
    assert.ok(!html.includes(`data-i18n="${key}"`), key);
  }
});

test('entrance styling loads after legacy rules and keeps equal media sizing', () => {
  assert.ok(html.indexOf('href="login-balanced.css') > html.indexOf('</style>'));
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.ustc-orbit,\s*#loginScreen \.virtual-access-orbit\s*\{[^}]*aspect-ratio: 16 \/ 9/s);
  assert.match(css, /@media \(max-width: 760px\)/);
});

test('AI entrance stays on the left; visitor entrance stays on the right, with unique controls', () => {
  const left = html.indexOf('<div class="login-column">');
  const right = html.indexOf('<div class="login-feature">', left);
  assert.ok(html.indexOf('id="ustcLoginEmail"', left) < right);
  assert.ok(html.indexOf('id="loginEmail"', left) > right);
  for (const id of ['ustcLoginEmail', 'ustcLoginBtn', 'ustcGuestBtn', 'loginEmail', 'signInTab', 'createAccountTab', 'quickGuestLoginBtn']) {
    assert.equal(html.split(`id="${id}"`).length - 1, 1, id);
  }
  for (const source of [...html.matchAll(/(?:src|poster)="(assets\/(?:nsrl-login|virtual-analysis)[^"]+)"/g)]) {
    assert.ok(fs.existsSync(path.join(root, source[1])), source[1]);
  }
});
