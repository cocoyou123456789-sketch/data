const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {WebsiteGestureSurface} = require('../github-pages/website-gesture-core.js');

function harness() {
  const nodes = [], pageScroll = [], cursor = {hidden: true, dataset: {}, style: {}};
  function element(props = {}) {
    const node = {tagName: 'DIV', style: {}, children: [], events: [], clicks: 0, scrollTop: 0,
      scrollHeight: 0, clientHeight: 0, offsetWidth: 260, offsetHeight: 100, isConnected: true,
      attributes: {}, classList: {add() {}, remove() {}}, ...props};
    node.closest = selector => {
      for (let item = node; item; item = item.parentElement) {
        if (selector.startsWith('button,') && item.interactive) return item;
        if (selector.startsWith('#cubeViewport,') && item.draggable) return item;
        if (selector === 'label' && item.tagName === 'LABEL') return item;
        if (selector.includes('[inert]') && (item.inert || item.hidden || item.ariaDisabled)) return item;
      }
      return null;
    };
    node.matches = selector => selector === '.cube-face' ? !!node.cubeFace : !!node.modal;
    node.setAttribute = (key, value) => { node.attributes[key] = value; };
    node.getAttribute = key => node.attributes[key];
    node.appendChild = child => { node.children.push(child); child.parentElement = node; };
    node.contains = child => child === node || node.children.some(item => item.contains(child));
    node.remove = () => { node.isConnected = false; };
    const listeners = {};
    node.addEventListener = (type, fn) => { listeners[type] = fn; };
    node.dispatchEvent = event => { node.events.push(event); listeners[event.type]?.(event); };
    node.click = () => { node.clicks++; node.dispatchEvent({type: 'click'}); };
    node.focus = () => { node.focused = true; };
    node.scrollBy = (x, y) => { node.scrollTop += y; };
    node.getBoundingClientRect = () => ({left: 0, bottom: 100, width: 1000});
    nodes.push(node); return node;
  }
  const body = element(), document = {body, elementFromPoint: () => hit,
    createElement: tag => element({tagName: tag.toUpperCase(), interactive: tag === 'button'}), getElementById: () => null};
  const window = {innerWidth: 1000, innerHeight: 600, Event, PointerEvent: class {constructor(type, init) {this.type = type; Object.assign(this, init);}},
    getComputedStyle: node => ({overflowY: node.overflow || 'visible', direction: 'ltr'}), scrollBy: (x, y) => pageScroll.push(y)};
  const surface = new WebsiteGestureSurface(document, window, cursor);
  let hit = element({tagName: 'BUTTON', interactive: true});
  const point = (phase, x = .5, y = .4) => surface.handle({kind: 'pointer', phase, down: phase !== 'up', point: {x, y}, delta: {x: 0, y: 0}});
  const click = () => {point('down'); return point('up');};
  return {surface, cursor, document, window, element, body, pageScroll, point, click, setHit(node) {hit = node;}};
}

test('website pinch clicks buttons, focuses fields, and ignores disabled/inert controls', () => {
  const h = harness();
  for (const tagName of ['BUTTON', 'TEXTAREA', 'INPUT', 'SUMMARY']) {
    const node = h.element({tagName, interactive: true}); h.setHit(node); h.click();
    assert.equal(node.clicks, 1); assert.equal(node.focused, true);
    node.disabled = true; h.click(); assert.equal(node.clicks, 1);
    node.disabled = false; node.parentElement = h.element({inert: true}); h.click(); assert.equal(node.clicks, 1);
  }
});

test('pinch dragging anchors pointer events to a model or element, never clicks on release', () => {
  const h = harness(), model = h.element({draggable: true}), elsewhere = h.element();
  h.setHit(model); h.point('down'); h.setHit(elsewhere); h.point('move', .7); h.point('up', .7);
  assert.deepEqual(model.events.map(e => e.type), ['pointerdown', 'pointermove', 'pointerup']);
  assert.equal(model.events[1].clientX, 700); assert.equal(model.events[1].pointerType, 'pen');
  assert.equal(model.clicks, 0); assert.equal(elsewhere.clicks, 0);
});

test('tracking loss, changing gesture, or navigating to a hidden region cancels a drag without a drop', () => {
  for (const action of [{kind: 'lost'}, {kind: 'zoom', scale: 1.1}]) {
    const h = harness(), element = h.element({draggable: true}); h.setHit(element); h.point('down');
    h.surface.handle(action); h.point('up');
    assert.deepEqual(element.events.map(e => e.type), ['pointerdown', 'pointercancel']); assert.equal(element.clicks, 0);
  }
  const h = harness(), node = h.element({draggable: true}); h.setHit(node); h.point('down');
  node.parentElement = h.element({hidden: true}); h.point('move', .7); h.point('up');
  assert.equal(node.events.at(-1).type, 'pointercancel');
});

test('cube faces remain clickable and buttons in draggable panel headers do not start a drag', () => {
  const h = harness(), model = h.element({draggable: true});
  const face = h.element({interactive: true, cubeFace: true, parentElement: model}); h.setHit(face); h.click();
  assert.equal(face.clicks, 1); assert.deepEqual(model.events.map(e => e.type), ['pointerdown', 'pointerup']);
  const panel = h.element({draggable: true}), close = h.element({interactive: true, parentElement: panel});
  h.setHit(close); h.click(); assert.equal(close.clicks, 1); assert.equal(panel.events.length, 0);
});

test('sliders update within min/max and emit input and change, not click', () => {
  const h = harness(), range = h.element({tagName: 'INPUT', interactive: true, type: 'range', min: '0.5', max: '3', step: '0.1'});
  h.setHit(range); h.point('down'); h.point('move', .8); h.point('up', .8);
  assert.equal(range.value, '2.5'); assert.equal(range.events.at(-1).type, 'change'); assert.equal(range.clicks, 0);
});

test('two fingers scroll the pointed nested area in both directions, not the background', () => {
  const h = harness(), overlay = h.element({modal: true, overflow: 'auto', scrollHeight: 1600, clientHeight: 600});
  const list = h.element({overflow: 'auto', scrollHeight: 800, clientHeight: 200, scrollTop: 100, parentElement: overlay});
  h.setHit(h.element({parentElement: list}));
  const scroll = (delta, start = false) => h.surface.handle({kind: 'scroll', point: {x: .5, y: .4}, delta, start});
  scroll(0, true); scroll(.04); assert.ok(list.scrollTop > 100); assert.equal(overlay.scrollTop, 0);
  const lower = list.scrollTop; scroll(-.04); assert.ok(list.scrollTop < lower); assert.equal(h.pageScroll.length, 0);
  list.scrollTop = 600; scroll(.04); assert.ok(overlay.scrollTop > 0);
  overlay.scrollTop = 1000; scroll(.04); assert.equal(h.pageScroll.length, 0);
});

test('normal document scrolling falls back to window, while the scroll anchor stays fixed', () => {
  const h = harness(); h.setHit(h.element({parentElement: h.body}));
  h.surface.handle({kind: 'scroll', start: true, point: {x: .3, y: .4}, delta: .02});
  h.surface.handle({kind: 'scroll', point: {x: .9, y: .9}, delta: -.02});
  assert.ok(h.pageScroll[0] > 0); assert.ok(h.pageScroll[1] < 0); assert.equal(h.cursor.style.left, '300px');
});

test('gesture dropdown choices change the actual select and preserve disabled options', () => {
  const h = harness(), select = h.element({tagName: 'SELECT', interactive: true});
  select.options = [{label: 'ChatGPT', index: 0, selected: true}, {label: 'DeepSeek', index: 1}, {label: 'Unavailable', index: 2, disabled: true}];
  h.setHit(select); h.click(); const menu = h.surface.menu;
  assert.equal(menu.children.length, 3); assert.equal(menu.children[2].disabled, true);
  h.setHit(menu.children[1]); h.click();
  assert.equal(select.selectedIndex, 1); assert.deepEqual(select.events.map(e => e.type), ['input', 'change']);
  assert.equal(h.surface.menu, null); assert.equal(select.focused, true);
});

test('system file pickers are not opened by an untrusted camera click', () => {
  const h = harness(), file = h.element({tagName: 'INPUT', type: 'file', interactive: true}); h.setHit(file);
  assert.match(h.click()[0], /mouse/); assert.equal(file.clicks, 0);
});

test('original login and five-tab navigation are preserved, with an optional separate gesture widget', () => {
  const html = fs.readFileSync('github-pages/index.html', 'utf8');
  assert.ok(!html.includes('photonLabDialog')); assert.ok(!html.includes('data-photon-open'));
  assert.equal((html.match(/class="top-menu-btn[^\"]*"/g) || []).length, 5);
  for (const asset of ['website-gesture.css', 'website-gesture-core.js', 'website-gesture.js', 'photon-gesture-core.js', 'photon-gesture.js']) assert.ok(html.includes(asset));
  assert.ok(html.indexOf('website-gesture.js?') < html.indexOf('src="photon-gesture.js?'));
  for (const line of html.split('\n').filter(line => line.includes('setPointerCapture'))) assert.match(line, /event\.isTrusted/);
  const ui = fs.readFileSync('github-pages/website-gesture.js', 'utf8');
  assert.match(ui, /document\.body\.appendChild\(widget\)/); assert.match(ui, /id="websiteGesturePanel"[^>]*hidden/);
  assert.ok(!ui.includes('getUserMedia')); assert.ok(!ui.includes('localStorage'));
  const css = fs.readFileSync('github-pages/website-gesture.css', 'utf8');
  assert.match(css, /website-gesture-cursor[^}]*pointer-events:none/);
});
