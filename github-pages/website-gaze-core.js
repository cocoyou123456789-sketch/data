/* Gaze control shared with the Mac app's GazeCore path: ridge-regression calibration, independent checks, and 1.2s dwell confirm. */
(function (root) {
  'use strict';
  const LEFT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
  const RIGHT_EYE = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398];
  const clamp01 = value => Math.max(0, Math.min(1, value));
  function valid(eye) {
    return !!eye && eye.features?.length === 6 && eye.features.every(Number.isFinite)
      && eye.faceBounds && eye.faceBounds.width > 0.05 && eye.faceBounds.height > 0.05
      && Number.isFinite(eye.faceBounds.x) && Number.isFinite(eye.faceBounds.y);
  }
  function mid(bounds) { return {x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2}; }
  function pupilInEye(outline, pupil) {
    if (!outline || outline.length < 4 || !pupil || !Number.isFinite(pupil.x) || !Number.isFinite(pupil.y)) return null;
    let pair = [outline[0], outline[1]], width = 0;
    for (const a of outline) for (const b of outline) {
      const span = Math.hypot(a.x - b.x, a.y - b.y);
      if (span > width) { width = span; pair = [a, b]; }
    }
    if (width <= 0.015) return null;
    if (pair[0].x > pair[1].x) pair = [pair[1], pair[0]];
    const dx = (pair[1].x - pair[0].x) / width, dy = (pair[1].y - pair[0].y) / width;
    const center = {x: (pair[0].x + pair[1].x) / 2, y: (pair[0].y + pair[1].y) / 2};
    const heights = outline.map(point => (point.x - center.x) * (-dy) + (point.y - center.y) * dx);
    if ((Math.max(...heights) - Math.min(...heights)) / width <= 0.1) return null;
    const x = ((pupil.x - center.x) * dx + (pupil.y - center.y) * dy) / width;
    const y = ((pupil.x - center.x) * (-dy) + (pupil.y - center.y) * dx) / width;
    if (Math.abs(x) >= 0.65 || Math.abs(y) >= 0.5) return null;
    return {x, y};
  }
  function eyeFrameFromLandmarks(landmarks) {
    if (!landmarks || landmarks.length < 478) return null;
    if (landmarks.some(point => !point || !Number.isFinite(point.x) || !Number.isFinite(point.y))) return null;
    const outline = indices => indices.map(index => landmarks[index]);
    const left = pupilInEye(outline(LEFT_EYE), landmarks[468]);
    const right = pupilInEye(outline(RIGHT_EYE), landmarks[473]);
    if (!left || !right) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const point of landmarks) {
      minX = Math.min(minX, point.x); minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y);
    }
    const faceBounds = {x: minX, y: minY, width: maxX - minX, height: maxY - minY};
    const nose = landmarks[1], center = mid(faceBounds);
    const eye = {
      features: [(left.x + right.x) / 2, (left.y + right.y) / 2, center.x, center.y,
        (nose.x - center.x) / faceBounds.width, (nose.y - center.y) / faceBounds.height],
      faceBounds
    };
    return valid(eye) ? eye : null;
  }
  function solve(gram, values) {
    const a = gram.map((row, index) => row.concat([values[index]]));
    for (let i = 0; i < 7; i++) {
      let pivot = i;
      for (let row = i + 1; row < 7; row++) if (Math.abs(a[row][i]) > Math.abs(a[pivot][i])) pivot = row;
      if (Math.abs(a[pivot][i]) <= 1e-9) return null;
      [a[i], a[pivot]] = [a[pivot], a[i]];
      const scale = a[i][i];
      for (let column = i; column <= 7; column++) a[i][column] /= scale;
      for (let row = 0; row < 7; row++) if (row !== i) {
        const factor = a[row][i];
        for (let column = i; column <= 7; column++) a[row][column] -= factor * a[i][column];
      }
    }
    return a.map(row => row[7]);
  }
  class GazeModel {
    constructor(mean, scale, xWeights, yWeights, face) {
      this.mean = mean; this.scale = scale; this.xWeights = xWeights; this.yWeights = yWeights; this.face = face;
    }
    static fit(samples) {
      if (!samples || samples.length < 9 || samples.some(sample => !valid(sample.eye) || !Number.isFinite(sample.target.x) || !Number.isFinite(sample.target.y))) return null;
      for (const column of [0, 1]) {
        const values = samples.map(sample => sample.eye.features[column]);
        if (Math.max(...values) - Math.min(...values) <= 0.015) return null;
      }
      const mean = Array.from({length: 6}, (_, index) => samples.reduce((sum, sample) => sum + sample.eye.features[index], 0) / samples.length);
      const scale = mean.map((center, index) => Math.max(0.015, Math.sqrt(samples.reduce((sum, sample) => sum + (sample.eye.features[index] - center) ** 2, 0) / samples.length)));
      const rows = samples.map(sample => [1, ...sample.eye.features.map((value, index) => (value - mean[index]) / scale[index])]);
      const gram = Array.from({length: 7}, () => Array(7).fill(0));
      const bx = Array(7).fill(0), by = Array(7).fill(0);
      rows.forEach((row, index) => {
        for (let i = 0; i < 7; i++) {
          bx[i] += row[i] * samples[index].target.x; by[i] += row[i] * samples[index].target.y;
          for (let j = 0; j < 7; j++) gram[i][j] += row[i] * row[j];
        }
      });
      for (let i = 0; i < 7; i++) gram[i][i] += i === 0 ? 0.000001 : 0.02;
      const xWeights = solve(gram, bx), yWeights = solve(gram, by);
      if (!xWeights || !yWeights) return null;
      const face = {
        x: samples.reduce((sum, sample) => sum + sample.eye.faceBounds.x, 0) / samples.length,
        y: samples.reduce((sum, sample) => sum + sample.eye.faceBounds.y, 0) / samples.length,
        width: samples.reduce((sum, sample) => sum + sample.eye.faceBounds.width, 0) / samples.length,
        height: samples.reduce((sum, sample) => sum + sample.eye.faceBounds.height, 0) / samples.length
      };
      return new GazeModel(mean, scale, xWeights, yWeights, face);
    }
    predict(eye) {
      if (!valid(eye)) return null;
      const ratio = eye.faceBounds.width / this.face.width;
      const eyeMid = mid(eye.faceBounds), faceMid = mid(this.face);
      if (ratio <= 0.75 || ratio >= 1.25 || Math.hypot(eyeMid.x - faceMid.x, eyeMid.y - faceMid.y) >= 0.12) return null;
      const z = eye.features.map((value, index) => (value - this.mean[index]) / this.scale[index]);
      if (z.some(value => Math.abs(value) >= 8)) return null;
      const row = [1, ...z];
      const x = row.reduce((sum, value, index) => sum + value * this.xWeights[index], 0);
      const y = row.reduce((sum, value, index) => sum + value * this.yWeights[index], 0);
      if (![x, y].every(Number.isFinite) || x <= -0.15 || x >= 1.15 || y <= -0.15 || y >= 1.15) return null;
      return {x: clamp01(x), y: clamp01(y)};
    }
  }
  class GazeCalibration {
    constructor(training, validation, desktopSize) {
      this.training = training; this.validation = validation; this.desktopSize = desktopSize;
      this.phase = 'training'; this.index = 0; this.model = null; this.meanError = 0; this.maxError = 0;
      this.code = 'wait'; this.message = '请看圆点，保持头部稳定';
      this.since = null; this.buffer = []; this.samples = []; this.errors = [];
    }
    get target() {
      const points = this.phase === 'training' ? this.training : this.validation;
      return points[Math.min(this.index, points.length - 1)];
    }
    get progress() { return Math.min(1, this.buffer.length / 15); }
    consume(eye, time) {
      if (this.phase !== 'training' && this.phase !== 'validation') return;
      if (!valid(eye)) {
        this.buffer = []; this.since = null; this.code = 'nopupil';
        this.message = '未检测到清晰瞳孔，请调整光线并看圆点'; return;
      }
      if (this.since === null) this.since = time;
      if (time - this.since <= 0.8) return;
      this.buffer.push(eye);
      this.code = this.phase;
      this.message = this.phase === 'training'
        ? `九点校准 ${this.index + 1} / ${this.training.length}`
        : `独立验证 ${this.index + 1} / ${this.validation.length}`;
      if (this.buffer.length < 15) return;
      const count = this.buffer.length;
      const frame = {
        features: Array.from({length: 6}, (_, index) => this.buffer.reduce((sum, item) => sum + item.features[index], 0) / count),
        faceBounds: eye.faceBounds
      };
      const jitter = Math.max(...[0, 1].map(index => Math.sqrt(this.buffer.reduce((sum, item) => sum + (item.features[index] - frame.features[index]) ** 2, 0) / count)));
      if (jitter >= 0.06) {
        this.buffer = []; this.since = time; this.code = 'unstable';
        this.message = '瞳孔定位不稳定，请保持不动并重新采样'; return;
      }
      if (this.phase === 'training') {
        this.samples.push({eye: frame, target: this.target});
        this.index += 1;
        if (this.index === this.training.length) {
          const fitted = GazeModel.fit(this.samples);
          if (!fitted) {
            this.phase = 'failed'; this.code = 'failed'; this.model = null;
            this.message = '眼部变化不足，无法建立可靠眼控；请调整摄像头后重试'; return;
          }
          this.model = fitted; this.phase = 'validation'; this.index = 0; this.code = 'validation';
          this.message = `独立验证 1 / ${this.validation.length}`;
        }
      } else {
        const prediction = this.model?.predict(frame);
        if (!prediction) {
          this.phase = 'failed'; this.code = 'failed';
          this.message = '验证时姿势变化过大，请重新校准'; return;
        }
        this.errors.push(Math.hypot((prediction.x - this.target.x) * this.desktopSize.width, (prediction.y - this.target.y) * this.desktopSize.height));
        this.index += 1;
        if (this.index === this.validation.length) {
          this.meanError = this.errors.reduce((sum, value) => sum + value, 0) / this.errors.length;
          this.maxError = Math.max(...this.errors);
          this.phase = this.meanError <= 100 && this.maxError <= 180 ? 'ready' : 'failed';
          this.code = this.phase;
          this.message = this.phase === 'ready'
            ? `验证平均误差 ${Math.round(this.meanError)} 点。按启用注视点击后才会选择`
            : `验证未通过（平均误差 ${Math.round(this.meanError)} 点）。请重新校准`;
        }
      }
      this.buffer = []; this.since = time;
    }
  }
  class GazeDwell {
    constructor() { this.reset(); }
    reset() { this.anchor = null; this.since = null; this.fired = false; }
    update(point, time) {
      if (!point) {
        if (!this.fired) this.reset();
        return {progress: 0, click: false};
      }
      if (this.anchor && Math.hypot(point.x - this.anchor.x, point.y - this.anchor.y) <= 40) {
        if (this.fired) return {progress: 0, click: false};
        const progress = Math.min(1, (time - (this.since ?? time)) / 1.2);
        if (progress === 1) { this.fired = true; return {progress: 1, click: true}; }
        return {progress, click: false};
      }
      this.anchor = point; this.since = time; this.fired = false;
      return {progress: 0, click: false};
    }
  }
  function calibrationTargets() {
    const training = [];
    for (const y of [0.18, 0.5, 0.82]) for (const x of [0.12, 0.5, 0.88]) training.push({x, y});
    return {training, validation: [{x: 0.25, y: 0.25}, {x: 0.75, y: 0.25}, {x: 0.5, y: 0.5}, {x: 0.25, y: 0.75}, {x: 0.75, y: 0.75}]};
  }
  function cameraReport(found) {
    const count = Math.max(0, found | 0);
    const used = count > 0 ? 1 : 0;
    if (count >= 2) return {
      found: count, used, secondConnected: false,
      en: `Found ${count} cameras. Eye control uses only the front camera; the second camera is not connected for localization.`,
      zh: `发现 ${count} 个摄像头。眼球控制只用前置这一路；第二台没有接入定位。`
    };
    if (count === 1) return {
      found: 1, used: 1, secondConnected: false,
      en: 'Eye control uses 1 front camera. Both eyes come from that one image. A second localization camera is not connected.',
      zh: '眼球控制使用 1 个前置摄像头。左右眼来自同一画面。第二台定位摄像头未连接。'
    };
    return {
      found: 0, used: 0, secondConnected: false,
      en: 'No camera found. Eye control needs the front camera; a second localization camera is not connected.',
      zh: '未找到摄像头。眼球控制需要前置摄像头；第二台定位摄像头未连接。'
    };
  }
  function labels(session) {
    const error = Math.round(session.meanError);
    switch (session.code) {
      case 'nopupil': return ['No clear pupils. Look at the dot. Calibration does not select.', session.message];
      case 'unstable': return ['Pupil estimate is unstable. Hold still. Calibration does not select.', session.message];
      case 'training': return [`Nine-point calibration ${session.index + 1} / ${session.training.length}. Looking here does not select.`, session.message];
      case 'validation': return [`Independent check ${session.index + 1} / ${session.validation.length}. Still not selecting.`, session.message];
      case 'ready': return [`Check passed (mean error ${error} px). Press “Enable gaze click”. A steady 1.2 second gaze selects; blinking does not.`, session.message];
      case 'failed': return [`Check failed${session.errors.length ? ` (mean error ${error} px)` : ''}. Press retry. Eye control stays off.`, session.message];
      default: return ['Look at the green dot and keep your head still. Calibration does not select.', session.message];
    }
  }
  class GazeController {
    constructor() { this.reset(); }
    reset() {
      this.session = null; this.model = null; this.active = false; this.dwell = new GazeDwell();
      this.pendingUp = false; this.lastPoint = null; this.size = {width: 1000, height: 600};
    }
    begin(size) {
      this.reset();
      this.size = {width: size.width, height: size.height};
      const points = calibrationTargets();
      this.session = new GazeCalibration(points.training, points.validation, this.size);
    }
    enable() {
      if (!this.session || this.session.phase !== 'ready' || !this.session.model) return false;
      this.model = this.session.model; this.session = null; this.active = true;
      this.dwell.reset(); this.pendingUp = false; this.lastPoint = null; return true;
    }
    update(eye, time, size) {
      if (size?.width && size?.height) this.size = size;
      if (this.pendingUp) {
        this.pendingUp = false;
        return {kind: 'pointer', phase: 'up', down: false, point: this.lastPoint, dwell: 0,
          en: 'Gaze selected. Look away before the next selection.', zh: '注视已确认。移开视线后才能再次确认。'};
      }
      if (this.session) {
        this.session.consume(valid(eye) ? eye : null, time);
        const [en, zh] = labels(this.session);
        const live = this.session.phase === 'training' || this.session.phase === 'validation';
        return {kind: 'calibrating', phase: this.session.phase, index: this.session.index, progress: this.session.progress,
          target: live ? this.session.target : null, ready: this.session.phase === 'ready', failed: this.session.phase === 'failed', en, zh};
      }
      const prediction = this.active && valid(eye) ? this.model.predict(eye) : null;
      if (!prediction) {
        this.dwell.update(null, time); this.lastPoint = null;
        return {kind: 'lost', en: 'Gaze unavailable. Look at the screen and hold your head still.', zh: '视线暂不可用。请看向屏幕并保持头部稳定。'};
      }
      const dwell = this.dwell.update({x: prediction.x * this.size.width, y: prediction.y * this.size.height}, time);
      this.lastPoint = prediction;
      if (dwell.click) {
        this.pendingUp = true;
        return {kind: 'pointer', phase: 'down', down: true, point: prediction, dwell: 1,
          en: 'Steady gaze confirmed the selection.', zh: '稳定注视已确认选择。'};
      }
      return {kind: 'pointer', phase: 'move', down: false, point: prediction, dwell: dwell.progress,
        en: 'Eye control: hold a steady gaze for 1.2 seconds to select. Blinking does not select.',
        zh: '眼球控制：稳定注视 1.2 秒确认选择。眨眼不确认。'};
    }
  }
  const api = {GazeModel, GazeCalibration, GazeDwell, GazeController, eyeFrameFromLandmarks, calibrationTargets, cameraReport, pupilInEye};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WebsiteGaze = api;
})(typeof window !== 'undefined' ? window : globalThis);
