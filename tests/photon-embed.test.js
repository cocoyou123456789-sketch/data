const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {labUrl, mount} = require('../github-pages/photon-embed.js');
const Lab = require('../github-pages/photon-lab-core.js');

function harness(url = 'https://example.com/data/') {
  const nodes = {}, frames = [], timers = new Map(), handlers = {}, events = [], restored = [], languages = [];
  const session = {version: 1, mode: 'crucible', counts: [{symbol: 'Mg', count: 1}, {symbol: 'B', count: 2}],
    beamline: 'BL05', exploded: true, yaw: -.4, pitch: .6, zoom: 1.2, energy: 80, temperature: 25};
  const doc = {baseURI: url, documentElement: {lang: 'en'}, body: {style: {overflow: 'auto'}},
    getElementById: id => nodes[id], querySelectorAll: () => [], addEventListener: (name, fn) => handlers['doc:' + name] = fn};
  class Node {
    constructor() { this.children = []; this.handlers = {}; this.attributes = {}; this.dataset = {}; this.isConnected = true; }
    setAttribute(name, value) { this.attributes[name] = value; }
    addEventListener(name, fn) { this.handlers[name] = fn; }
    emit(name, event = {}) { this.handlers[name]?.(event); }
    append(child) { this.children.push(child); child.parent = this; }
    remove() { this.parent.children = this.parent.children.filter(child => child !== this); this.isConnected = false; }
    focus() { doc.activeElement = this; }
    closest(selector) { return selector === '[data-photon-open]' && this.launcher ? this : null; }
  }
  for (const id of ['photonLabDialog', 'photonLabFrameHost', 'photonLabLoading', 'photonLabError', 'photonLabBack',
    'photonLabStandalone', 'photonLabLanguage', 'photonLabRetry', 'photonLabFullscreen']) nodes[id] = new Node();
  const dialog = nodes.photonLabDialog;
  dialog.showModal = () => { dialog.open = true; };
  dialog.close = () => { dialog.open = false; };
  doc.createElement = tag => {
    assert.equal(tag, 'iframe');
    const node = new Node();
    node.contentWindow = {
      Event: class {constructor(type) {this.type = type;}},
      dispatchEvent: event => events.push(event.type),
      PhotonControls: {snapshot: () => structuredClone(session), restore: value => restored.push(value), setLanguage: lang => languages.push(lang)},
    };
    frames.push(node); return node;
  };
  let timer = 0, navigated;
  const env = {document: doc, location: {href: url, assign: value => navigated = value},
    setTimeout: fn => {timers.set(++timer, fn); return timer;}, clearTimeout: id => timers.delete(id),
    addEventListener: (name, fn) => handlers[name] = fn,
    switchLang: lang => {doc.documentElement.lang = lang;},
  };
  const opener = new Node(); opener.launcher = true; doc.activeElement = opener;
  const api = mount(env);
  return {api, doc, env, nodes, frames, timers, handlers, events, restored, languages, session, opener, get navigated() {return navigated;}};
}

test('embedded URL stays on the existing site under GitHub, Netlify, localhost, and file previews', () => {
  for (const base of ['https://cocoyou123456789-sketch.github.io/data/', 'https://arpes-materials-explorer-cocoyou.netlify.app/', 'http://127.0.0.1:4191/index.html', 'file:///Users/cocoyou/data/github-pages/index.html']) {
    const url = new URL(labUrl(base, 'zh-CN'));
    assert.equal(url.origin, new URL(base).origin);
    assert.equal(url.searchParams.get('embedded'), '1');
    assert.equal(url.searchParams.get('lang'), 'zh');
    assert.equal(url.searchParams.get('stay_on_github'), '1');
    assert.match(url.pathname, /photon-lab\.html$/);
  }
});

test('main page loads no lab until explicitly opened, without requesting microphone access', () => {
  const h = harness(); assert.equal(h.frames.length, 0);
  h.api.open();
  assert.equal(h.nodes.photonLabDialog.open, true);
  assert.equal(h.doc.body.style.overflow, 'hidden');
  assert.equal(h.frames.length, 1);
  assert.equal(h.frames[0].hidden, true);
  assert.doesNotMatch(h.frames[0].attributes.allow, /microphone/);
  h.frames[0].emit('load');
  assert.equal(h.frames[0].hidden, false);
  assert.equal(h.nodes.photonLabLoading.hidden, true);
});

test('close stops camera/audio, unloads the iframe, restores focus and scrolling, and preserves composition', () => {
  const h = harness(); h.api.open(); h.frames[0].emit('load'); h.api.close();
  assert.deepEqual(h.events, ['photon:deactivate']);
  assert.equal(h.nodes.photonLabFrameHost.children.length, 0);
  assert.equal(h.doc.body.style.overflow, 'auto');
  assert.equal(h.doc.activeElement, h.opener);
  assert.equal(h.nodes.photonLabDialog.open, false);
  h.api.open(); h.frames[1].emit('load');
  assert.deepEqual(h.restored, [h.session]);
});

test('Escape and a native close both release the lab; stale load/close events cannot destroy a reopened lab', () => {
  const h = harness(); h.api.open(); let prevented = false;
  h.nodes.photonLabDialog.emit('cancel', {preventDefault() {prevented = true;}});
  assert.ok(prevented); assert.equal(h.nodes.photonLabFrameHost.children.length, 0);
  h.api.open(); h.frames[0].emit('load'); h.nodes.photonLabDialog.emit('close');
  assert.equal(h.nodes.photonLabFrameHost.children.length, 1);
  h.frames[1].emit('load'); assert.equal(h.frames[1].hidden, false);
  h.nodes.photonLabDialog.close(); h.nodes.photonLabDialog.emit('close');
  assert.equal(h.nodes.photonLabFrameHost.children.length, 0);
});
test('focus returns to the re-rendered NSRL entry after switching the lab language', () => {
  const h = harness(), replacement = {isConnected: true, closest: () => null, focus() {h.doc.activeElement = this;}};
  const container = {querySelector: () => replacement};
  h.opener.closest = selector => selector === '#nsrlCatalogScreen, #magicBookScreen' ? container : null;
  h.api.open(); h.opener.isConnected = false; h.api.close();
  assert.equal(h.doc.activeElement, replacement);
});

test('missing lab runtime, network errors, and timeouts show a retry instead of an empty view', () => {
  for (const kind of ['missing', 'error', 'timeout']) {
    const h = harness(); h.api.open();
    if (kind === 'missing') {delete h.frames[0].contentWindow.PhotonControls; h.frames[0].emit('load');}
    if (kind === 'error') h.frames[0].emit('error');
    if (kind === 'timeout') [...h.timers.values()][0]();
    assert.equal(h.nodes.photonLabError.hidden, false);
    assert.equal(h.nodes.photonLabLoading.hidden, true);
    assert.equal(h.nodes.photonLabFrameHost.children.length, 0);
    h.nodes.photonLabRetry.emit('click'); h.frames[1].emit('load');
    assert.equal(h.nodes.photonLabError.hidden, true);
    assert.equal(h.frames[1].hidden, false);
  }
});

test('language follows the main site and Research Agent opens in the parent instead of inside the lab', () => {
  const h = harness(); h.doc.documentElement.lang = 'zh-CN'; h.api.open(); h.frames[0].emit('load');
  assert.equal(new URL(h.frames[0].src).searchParams.get('lang'), 'zh');
  h.api.setLanguage('en'); assert.equal(h.doc.documentElement.lang, 'en'); assert.equal(h.languages.at(-1), 'en');
  h.api.openAgent(); assert.equal(h.nodes.photonLabDialog.open, false);
  assert.equal(h.navigated, 'https://example.com/data/agent.html?stay_on_github=1');
});

test('delegated launch works for NSRL catalog links and main-site buttons but preserves modified clicks', () => {
  const h = harness(); let prevented = 0;
  const event = {target: h.opener, preventDefault() {prevented++;}};
  h.handlers['doc:click']({...event, metaKey: true}); assert.equal(h.frames.length, 0);
  h.handlers['doc:click'](event); assert.equal(h.frames.length, 1); assert.equal(prevented, 1);
  h.handlers['doc:click'](event); assert.equal(h.frames.length, 1);
});

test('page hide releases a pending lab and back/forward restoration reloads it without losing the modal', () => {
  const h = harness(); h.api.open(); h.handlers.pagehide();
  assert.equal(h.nodes.photonLabFrameHost.children.length, 0);
  h.handlers.pageshow(); assert.equal(h.frames.length, 2);
  h.frames[1].emit('load'); assert.equal(h.frames[1].hidden, false);
});

test('a main-site ?lab=1 deep link opens the embedded view directly', () => {
  const h = harness('https://example.com/data/?lab=1');
  assert.equal(h.nodes.photonLabDialog.open, true); assert.equal(h.frames.length, 1);
});

test('saved lab state is bounded, validated, and never contains authorization or camera state', () => {
  const h = harness();
  const raw = {...h.session, token: 'not-a-real-token', camera: true, auto: true};
  const saved = Lab.sessionState(raw);
  assert.deepEqual(saved, h.session); assert.equal(saved.token, undefined); assert.equal(saved.camera, undefined); assert.equal(saved.auto, undefined);
  saved.counts[0].count = 5; assert.equal(raw.counts[0].count, 1);
  for (const patch of [{version: 2}, {mode: 'unknown'}, {counts: [{symbol: 'Bad', count: 1}]}, {beamline: 'BL99'}, {zoom: Infinity}, {pitch: 0}, {energy: 0}, {temperature: 999}, {yaw: NaN}]) {
    assert.equal(Lab.sessionState({...h.session, ...patch}), null);
  }
});

test('main-site entry points and native modal are wired to the same lazy-loading controller', () => {
  const home = fs.readFileSync('github-pages/index.html', 'utf8');
  assert.match(home, /script defer src="photon-embed\.js/);
  assert.match(home, /<dialog id="photonLabDialog" aria-labelledby="photonLabTitle">/);
  assert.equal((home.match(/data-photon-open /g) || []).length, 3);
  assert.doesNotMatch(home, /<iframe[^>]+photon-lab/);
  assert.match(fs.readFileSync('github-pages/nsrl-catalog.js', 'utf8'), /data-photon-open data-photon-lang/);
});
