(function () {
  'use strict';
  const widget = document.createElement('div');
  widget.id = 'websiteGestureWidget';
  widget.innerHTML = `
    <button id="websiteGestureToggle" type="button" aria-expanded="false" aria-controls="websiteGesturePanel"><span aria-hidden="true">✋</span> <span data-gesture-en="Gesture control" data-gesture-zh="手势操控">Gesture control</span><span class="website-gesture-dot" aria-hidden="true"></span></button>
    <section id="websiteGesturePanel" aria-labelledby="websiteGestureTitle" hidden>
      <div class="website-gesture-heading"><strong id="websiteGestureTitle" data-gesture-en="Camera gestures" data-gesture-zh="摄像头手势">Camera gestures</strong><button id="websiteGestureClose" type="button" aria-label="Close gesture settings">×</button></div>
      <p data-gesture-en="Point to move. Pinch and release to click. Hold a pinch to drag. Raise two fingers and move up/down to scroll the area you point at." data-gesture-zh="食指移动光标；捏合后松开点击；保持捏合拖动；伸出双指上下移动，滚动所指区域。"></p>
      <div class="website-gesture-actions"><button id="gestureStart" type="button" aria-pressed="false" data-gesture-en="Enable camera" data-gesture-zh="开启摄像头">Enable camera</button><button id="gestureStop" type="button" hidden data-gesture-en="Stop camera" data-gesture-zh="关闭摄像头">Stop camera</button><button id="gesturePreviewToggle" type="button" hidden data-gesture-en="Show / hide preview" data-gesture-zh="显示 / 隐藏预览">Show / hide preview</button></div>
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
  window.PhotonGestureAdapter = new window.WebsiteGestureSurface(document, window, cursor);
  const toggle = document.getElementById('websiteGestureToggle'), panel = document.getElementById('websiteGesturePanel');
  function open(value) { panel.hidden = !value; toggle.setAttribute('aria-expanded', String(value)); }
  toggle.addEventListener('click', () => open(panel.hidden));
  document.getElementById('websiteGestureClose').addEventListener('click', () => { open(false); toggle.focus({preventScroll: true}); });
  window.addEventListener('keydown', event => { if (event.key === 'Escape') open(false); });
  function translate() {
    const zh = document.documentElement.lang.startsWith('zh');
    for (const node of document.querySelectorAll('[data-gesture-en]')) node.textContent = node.dataset[zh ? 'gestureZh' : 'gestureEn'];
    document.getElementById('websiteGestureClose').setAttribute('aria-label', zh ? '关闭手势设置' : 'Close gesture settings');
    const start = document.getElementById('gestureStart');
    if (!start.disabled && start.getAttribute('aria-pressed') !== 'true') document.getElementById('gestureStatus').textContent = zh ? '摄像头已关闭' : 'Camera off';
  }
  translate(); new MutationObserver(translate).observe(document.documentElement, {attributes: true, attributeFilter: ['lang']});
  new MutationObserver(() => { widget.dataset.active = String(document.getElementById('gestureStart').getAttribute('aria-pressed') === 'true'); })
    .observe(document.getElementById('gestureStart'), {attributes: true, attributeFilter: ['aria-pressed']});
})();
