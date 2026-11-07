(function () {
  'use strict';
  const widget = document.createElement('div');
  widget.id = 'websiteGestureWidget';
  widget.innerHTML = `
    <button id="websiteGestureToggle" type="button" aria-expanded="false" aria-controls="websiteGesturePanel"><span aria-hidden="true">✋</span> <span data-gesture-en="Gesture" data-gesture-zh="手势">Gesture</span><span aria-hidden="true">·</span><span data-gesture-en="Eye control" data-gesture-zh="眼球控制">Eye control</span><span class="website-gesture-dot" aria-hidden="true"></span></button>
    <section id="websiteGesturePanel" aria-labelledby="websiteGestureTitle" hidden>
      <div class="website-gesture-heading"><strong id="websiteGestureTitle" data-gesture-en="Camera control" data-gesture-zh="摄像头操控">Camera control</strong><button id="websiteGestureClose" type="button" aria-label="Close gesture settings">×</button></div>
      <div class="website-gesture-modes" role="group" aria-label="Control method">
        <button id="gestureModeHand" type="button" aria-pressed="true" data-gesture-en="Gesture" data-gesture-zh="手势操控">Gesture</button>
        <button id="gestureModeEye" type="button" aria-pressed="false" data-gesture-en="Eye control" data-gesture-zh="眼球控制">Eye control</button>
      </div>
      <p id="gestureHandHelp" data-gesture-en="Point to move. Pinch and release to click. Hold a pinch to drag. Raise two fingers and move up/down to scroll the area you point at." data-gesture-zh="食指移动光标；捏合后松开点击；保持捏合拖动；伸出双指上下移动，滚动所指区域。"></p>
      <p id="gestureEyeHelp" hidden data-gesture-en="Look to move the cursor. Selection is a steady gaze on the same spot for 1.2 seconds. Look away to arm the next selection. Blinking does not select. Calibration and the Enable gaze click button must finish before anything is selected." data-gesture-zh="看向目标移动光标。选择确认是在同一位置稳定注视 1.2 秒。移开视线后才能再次确认。眨眼不会确认。校准完成并按下启用注视点击之前，不会选择。"></p>
      <p id="gestureCameraNote" hidden></p>
      <div class="website-gesture-actions"><button id="gestureStart" type="button" aria-pressed="false" data-gesture-en="Enable camera" data-gesture-zh="开启摄像头">Enable camera</button><button id="gestureStop" type="button" hidden data-gesture-en="Stop camera" data-gesture-zh="关闭摄像头">Stop camera</button><button id="gesturePreviewToggle" type="button" hidden data-gesture-en="Show / hide preview" data-gesture-zh="显示 / 隐藏预览">Show / hide preview</button></div>
      <div id="gazeActions" class="website-gesture-actions" hidden><button id="gazeEnable" type="button" disabled data-gesture-en="Enable gaze click" data-gesture-zh="启用注视点击">Enable gaze click</button><button id="gazeRetry" type="button" data-gesture-en="Retry calibration" data-gesture-zh="重新校准">Retry calibration</button></div>
      <label class="website-gesture-speed"><span data-gesture-en="Scroll speed" data-gesture-zh="滚动速度">Scroll speed</span><input id="gestureScrollSpeed" type="range" min="0.5" max="3" step="0.1" value="1.4"></label>
      <p id="gestureStatus" role="status" aria-live="polite">Camera off</p>
      <p class="website-gesture-privacy" data-gesture-en="Video stays on this device. No audio. Esc stops the camera. Controls this website only, not your Mac desktop." data-gesture-zh="视频仅在本机处理，不使用话筒。Esc 关闭摄像头。仅操控本站，不操控 Mac 桌面。"></p>
    </section>`;
  // Outside the login/workbench inert regions: available without changing either layout.
  document.body.appendChild(widget);
  const preview = document.createElement('div'); preview.id = 'gesturePreview';
  preview.className = 'gesture-preview website-gesture-preview'; preview.hidden = true;
  preview.innerHTML = '<video id="gestureVideo" muted playsinline></video><canvas id="gestureSkeleton" width="320" height="240"></canvas><p data-gesture-en="Local camera preview · Esc to stop" data-gesture-zh="本地摄像头预览 · Esc 关闭"></p>';
  document.body.appendChild(preview);
  const cursor = document.createElement('div'); cursor.id = 'gestureCursor'; cursor.className = 'gesture-cursor website-gesture-cursor';
  cursor.hidden = true; cursor.setAttribute('aria-hidden', 'true'); document.body.appendChild(cursor);
  const calibration = document.createElement('div'); calibration.id = 'gazeCalibration';
  calibration.className = 'website-gaze-calibration'; calibration.hidden = true;
  calibration.innerHTML = '<div id="gazeDot" class="website-gaze-dot" hidden></div><p id="gazeCalibrationText"></p>';
  document.body.appendChild(calibration);
  window.PhotonGestureAdapter = new window.WebsiteGestureSurface(document, window, cursor);
  const toggle = document.getElementById('websiteGestureToggle'), panel = document.getElementById('websiteGesturePanel');
  function open(value) { panel.hidden = !value; toggle.setAttribute('aria-expanded', String(value)); }
  toggle.addEventListener('click', () => open(panel.hidden));
  document.getElementById('websiteGestureClose').addEventListener('click', () => { open(false); toggle.focus({preventScroll: true}); });
  window.addEventListener('keydown', event => { if (event.key === 'Escape') open(false); });
  function eyeMode() { return document.getElementById('gestureModeEye').getAttribute('aria-pressed') === 'true'; }
  function renderCameraNote() {
    const note = document.getElementById('gestureCameraNote');
    if (!eyeMode()) { note.hidden = true; return; }
    note.hidden = false;
    if (!window.WebsiteGaze) {
      note.textContent = document.documentElement.lang.startsWith('zh') ? '眼球控制没有加载，请刷新页面。' : 'Eye control failed to load. Reload the page.';
      return;
    }
    const report = window.WebsiteGaze.cameraStatus(widget.dataset.cameras);
    note.textContent = document.documentElement.lang.startsWith('zh') ? report.zh : report.en;
  }
  function setMode(mode) {
    const eye = mode === 'eye';
    document.getElementById('gestureModeHand').setAttribute('aria-pressed', String(!eye));
    document.getElementById('gestureModeEye').setAttribute('aria-pressed', String(eye));
    document.getElementById('gestureHandHelp').hidden = eye;
    document.getElementById('gestureEyeHelp').hidden = !eye;
    document.getElementById('gazeActions').hidden = !eye;
    document.querySelector('.website-gesture-speed').hidden = eye;
    widget.dataset.mode = mode;
    const start = document.getElementById('gestureStart');
    start.dataset.gestureEn = eye ? 'Start eye calibration' : 'Enable camera';
    start.dataset.gestureZh = eye ? '开始眼球校准' : '开启摄像头';
    window.dispatchEvent(new CustomEvent('website-gesture-mode', {detail: mode}));
    translate();
  }
  function translate() {
    const zh = document.documentElement.lang.startsWith('zh');
    for (const node of document.querySelectorAll('[data-gesture-en]')) node.textContent = node.dataset[zh ? 'gestureZh' : 'gestureEn'];
    document.getElementById('websiteGestureClose').setAttribute('aria-label', zh ? '关闭手势设置' : 'Close camera control');
    const start = document.getElementById('gestureStart');
    if (!start.disabled && start.getAttribute('aria-pressed') !== 'true') document.getElementById('gestureStatus').textContent = zh ? '摄像头已关闭' : 'Camera off';
    renderCameraNote();
  }
  document.getElementById('gestureModeHand').addEventListener('click', () => setMode('hand'));
  document.getElementById('gestureModeEye').addEventListener('click', () => setMode('eye'));
  new MutationObserver(renderCameraNote).observe(widget, {attributes: true, attributeFilter: ['data-cameras']});
  translate(); new MutationObserver(translate).observe(document.documentElement, {attributes: true, attributeFilter: ['lang']});
  new MutationObserver(() => { widget.dataset.active = String(document.getElementById('gestureStart').getAttribute('aria-pressed') === 'true'); })
    .observe(document.getElementById('gestureStart'), {attributes: true, attributeFilter: ['aria-pressed']});
})();
