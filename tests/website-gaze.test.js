const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const gaze = require('../github-pages/website-gaze-core.js');

const face = {x: 0.35, y: 0.25, width: 0.3, height: 0.4};
const eye = (x, y) => ({features: [x * 0.4 - 0.2, y * 0.3 - 0.15, 0.5, 0.45, 0, 0], faceBounds: face});
const targets = [0.12, 0.5, 0.88].flatMap(y => [0.12, 0.5, 0.88].map(x => ({x, y})));
const checks = [{x: 0.25, y: 0.25}, {x: 0.75, y: 0.25}, {x: 0.5, y: 0.5}, {x: 0.25, y: 0.75}, {x: 0.75, y: 0.75}];

function settle(session, sample) {
  let time = 0;
  for (let step = 0; step < 1000 && session.phase !== 'ready' && session.phase !== 'failed'; step++) {
    const target = session.target;
    time += 0.1;
    session.consume(sample(session.phase, target), time);
  }
  return session;
}

test('gaze regression matches the desktop model, including rejected pupils and poses', () => {
  const model = gaze.GazeModel.fit(targets.map(target => ({eye: eye(target.x, target.y), target})));
  const predicted = model.predict(eye(0.25, 0.75));
  assert.ok(Math.hypot(predicted.x - 0.25, predicted.y - 0.75) < 0.01);
  assert.equal(gaze.GazeModel.fit(targets.map(target => ({eye: eye(0.5, 0.5), target}))), null);
  const moved = {features: eye(0.5, 0.5).features, faceBounds: {x: 0.1, y: 0.1, width: 0.6, height: 0.7}};
  assert.equal(model.predict(moved), null);
  const invalid = eye(0.5, 0.5).features.slice(); invalid[0] = NaN;
  assert.equal(model.predict({features: invalid, faceBounds: face}), null);
});

test('nine-point calibration requires an independent check before gaze can select', () => {
  const good = settle(new gaze.GazeCalibration(targets, checks, {width: 1920, height: 1080}), (_, target) => eye(target.x, target.y));
  assert.equal(good.phase, 'ready'); assert.ok(good.meanError < 20);
  const bad = settle(new gaze.GazeCalibration(targets, checks, {width: 1920, height: 1080}), (phase, target) => phase === 'training' ? eye(target.x, target.y) : eye(1 - target.x, 1 - target.y));
  assert.equal(bad.phase, 'failed');
  const controller = new gaze.GazeController();
  controller.begin({width: 1920, height: 1080});
  assert.equal(controller.enable(), false);
  let time = 0;
  while (controller.session && controller.session.phase !== 'ready' && controller.session.phase !== 'failed' && time < 100) {
    time += 0.1;
    const result = controller.update(eye(controller.session.target.x, controller.session.target.y), time);
    assert.equal(result.kind, 'calibrating');
  }
  assert.equal(controller.session.phase, 'ready'); assert.equal(controller.enable(), true);
});

test('steady gaze selects once; blinking does not, and looking away arms the next selection', () => {
  const dwell = new gaze.GazeDwell();
  dwell.update({x: 500, y: 500}, 0);
  assert.equal(dwell.update({x: 502, y: 501}, 1.3).click, true);
  dwell.update(null, 1.5);
  assert.equal(dwell.update({x: 500, y: 500}, 3).click, false);
  dwell.update({x: 650, y: 500}, 3.1);
  assert.equal(dwell.update({x: 650, y: 500}, 4.4).click, true);

  const controller = new gaze.GazeController();
  controller.model = gaze.GazeModel.fit(targets.map(target => ({eye: eye(target.x, target.y), target})));
  controller.active = true; controller.size = {width: 1920, height: 1080};
  assert.equal(controller.update(null, 0.4).kind, 'lost');
  assert.equal(controller.update(eye(0.5, 0.5), 0.5).phase, 'move');
  assert.equal(controller.update(null, 1).kind, 'lost');
  assert.equal(controller.update(eye(0.5, 0.5), 1.2).phase, 'move');
  assert.equal(controller.update(eye(0.5, 0.5), 2.5).phase, 'down');
  assert.equal(controller.update(null, 2.6).phase, 'up');
  const held = controller.update(eye(0.5, 0.5), 3);
  assert.equal(held.phase, 'move');
  assert.match(held.zh, /移开/);
  assert.match(held.en, /1\.2|Look away/);
  assert.equal(controller.update(eye(0.9, 0.5), 3.1).phase, 'move');
  assert.equal(controller.update(eye(0.9, 0.5), 4.4).phase, 'down');
});

test('one front camera is reported even when a second camera is present', () => {
  for (const found of [0, 1, 2]) {
    const report = gaze.cameraReport(found);
    assert.equal(report.used, found > 0 ? 1 : 0);
    assert.equal(report.secondConnected, false);
    assert.match(report.zh, /第二台/);
    assert.match(report.en, /second/i);
  }
  assert.match(gaze.cameraReport(2).zh, /只用前置/);
  const unknown = gaze.cameraStatus('');
  assert.equal(unknown.used, null);
  assert.equal(unknown.secondConnected, false);
  assert.match(unknown.zh, /第二台不用于定位/);
  assert.doesNotMatch(unknown.zh, /使用 1 个/);
});

test('iris landmarks become the same six gaze features, and a missing iris does not', () => {
  const left = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
  const right = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398];
  const frame = shift => {
    const landmarks = Array.from({length: 478}, () => ({x: 0.5, y: 0.45}));
    landmarks[10] = {x: 0.32, y: 0.22}; landmarks[152] = {x: 0.68, y: 0.78}; landmarks[1] = {x: 0.5, y: 0.52};
    const place = (indices, cx, cy, iris) => {
      landmarks[indices[0]] = {x: cx - 0.04, y: cy}; landmarks[indices[1]] = {x: cx + 0.04, y: cy};
      landmarks[indices[2]] = {x: cx, y: cy - 0.015}; landmarks[indices[3]] = {x: cx, y: cy + 0.015};
      landmarks[iris] = {x: cx + shift, y: cy};
    };
    place(left, 0.42, 0.4, 468); place(right, 0.58, 0.4, 473);
    return gaze.eyeFrameFromLandmarks(landmarks);
  };
  const center = frame(0), shifted = frame(0.01);
  assert.equal(center.features.length, 6);
  assert.ok(shifted.features[0] > center.features[0]);
  assert.equal(gaze.eyeFrameFromLandmarks(Array.from({length: 468}, () => ({x: 0.5, y: 0.5}))), null);
});

test('the lab eye path uses one front camera and selects only after the explicit dwell', async () => {
  const html = fs.readFileSync('github-pages/photon-lab.html', 'utf8');
  assert.match(html, /id="gestureModeEye"/);
  assert.match(html, /眼球控制/);
  assert.match(html, /1\.2/);
  assert.match(html, /眨眼不会确认/);
  assert.ok(html.includes('website-gaze-core.js'));
  assert.ok(html.indexOf('website-gaze-core.js') < html.indexOf('photon-gesture.js'));
  const guide = fs.readFileSync('github-pages/photon-lab-guide.html', 'utf8');
  assert.match(guide, /眼球控制/);
  assert.match(guide, /第二台/);

  const handlers = {}, nodes = {}, workers = [];
  const classes = () => ({add() {}, remove() {}});
  for (const id of ['gestureVideo', 'gestureCursor', 'gesturePreview', 'gestureStart', 'gestureStop', 'gesturePreviewToggle', 'gestureStatus', 'gestureSkeleton', 'gestureModeEye', 'gestureModeHand', 'gestureCameraNote', 'gestureEyeHelp', 'gestureHandHelp', 'gazeCalibration', 'gazeDot', 'gazeCalibrationText', 'gazeEnable', 'gazeRetry']) {
    nodes[id] = {hidden: id === 'gazeCalibration' || id === 'gazeDot' || id === 'gestureEyeHelp', disabled: id === 'gazeEnable', style: {setProperty() {}}, dataset: {}, textContent: '', attributes: {}, classList: classes(),
      setAttribute(name, value) { this.attributes[name] = value; }, getAttribute(name) { return this.attributes[name]; },
      addEventListener(name, fn) { handlers[id + ':' + name] = fn; }};
  }
  nodes.gestureModeEye.attributes['aria-pressed'] = 'true';
  nodes.gestureModeHand.attributes['aria-pressed'] = 'false';
  nodes.gestureSkeleton.getContext = () => Object.fromEntries(['clearRect', 'beginPath', 'arc', 'fill'].map(name => [name, () => {}]));
  nodes.gestureVideo.play = async () => {};
  const button = {clicks: 0, disabled: false, isConnected: true, classList: classes(), closest(selector) { return selector === '[inert]' ? null : this; }, click() { this.clicks++; }, focus() {}};
  class Worker {
    constructor() { workers.push(this); this.sent = []; }
    postMessage(data) { this.sent.push(data); }
    terminate() { this.terminated = true; }
  }
  const stream = {getTracks: () => [{stop() {}}], getVideoTracks: () => [{addEventListener() {}}]};
  const scope = {window: {isSecureContext: true, WebsiteGaze: gaze, PhotonGestureCore: {GestureTracker: class {reset() {} update() { return {kind: 'lost'}; }}}, addEventListener() {}},
    document: {documentElement: {lang: 'zh'}, baseURI: 'http://localhost/photon-lab.html', hidden: false, getElementById: id => nodes[id], elementFromPoint: () => button, addEventListener() {}},
    navigator: {mediaDevices: {getUserMedia: async () => stream, enumerateDevices: async () => [{kind: 'videoinput'}, {kind: 'videoinput'}]}},
    Worker, URL, Event, performance: {now: () => 0}, innerWidth: 1000, innerHeight: 600, requestAnimationFrame: () => 1, cancelAnimationFrame() {}, setTimeout: () => 1, clearTimeout() {}, console: {warn() {}}};
  vm.runInNewContext(fs.readFileSync('github-pages/photon-gesture.js', 'utf8'), scope);
  await handlers['gestureStart:click']();
  assert.equal(workers[0].sent[0].mode, 'face');
  assert.equal(nodes.gestureCameraNote.dataset.cameras, '2');
  assert.match(nodes.gestureCameraNote.textContent, /只用前置/);
  assert.match(nodes.gestureCameraNote.textContent, /第二台/);
  assert.equal(nodes.gestureCameraNote.textContent.includes('第二台定位摄像头已连接'), false);
  workers[0].onmessage({data: {type: 'ready'}});
  const left = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
  const right = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398];
  const landmarksFor = target => {
    const shiftX = (target.x - 0.5) * 0.08, shiftY = (target.y - 0.5) * 0.06;
    const landmarks = Array.from({length: 478}, () => ({x: 0.5, y: 0.45}));
    landmarks[10] = {x: 0.32, y: 0.22}; landmarks[152] = {x: 0.68, y: 0.78}; landmarks[1] = {x: 0.5, y: 0.52};
    const place = (indices, cx, cy, iris) => {
      landmarks[indices[0]] = {x: cx - 0.04, y: cy}; landmarks[indices[1]] = {x: cx + 0.04, y: cy};
      landmarks[indices[2]] = {x: cx, y: cy - 0.015}; landmarks[indices[3]] = {x: cx, y: cy + 0.015};
      landmarks[iris] = {x: cx + shiftX, y: cy + shiftY};
    };
    place(left, 0.42, 0.4, 468); place(right, 0.58, 0.4, 473);
    return landmarks;
  };
  const dot = () => ({x: parseFloat(nodes.gazeDot.style.left) / 1000, y: parseFloat(nodes.gazeDot.style.top) / 600});
  let time = 0;
  for (let step = 0; step < 800 && nodes.gazeEnable.disabled; step++) {
    time += 100;
    workers[0].onmessage({data: {type: 'face', landmarks: landmarksFor(dot()), time}});
  }
  assert.equal(button.clicks, 0);
  assert.equal(nodes.gazeEnable.disabled, false, nodes.gazeCalibrationText.textContent);
  assert.match(nodes.gazeCalibrationText.textContent, /才会选择|不会选择/);
  handlers['gazeEnable:click']();
  assert.match(nodes.gestureStatus.textContent, /1\.2/);
  const send = marks => { time += 50; workers[0].onmessage({data: {type: 'face', landmarks: marks, time}}); };
  const center = landmarksFor({x: 0.5, y: 0.5});
  send(center);
  assert.equal(button.clicks, 0);
  time += 1250;
  send(center);
  assert.equal(button.clicks, 0);
  send(center);
  assert.equal(button.clicks, 1);
  send([]);
  send(center);
  assert.equal(button.clicks, 1);
  assert.match(nodes.gestureStatus.textContent, /移开|眨眼/);
  const away = landmarksFor({x: 0.88, y: 0.18});
  send(away);
  time += 1250;
  send(away);
  send(away);
  assert.equal(button.clicks, 2);
});
