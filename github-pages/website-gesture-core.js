/* Website interaction adapter. Camera capture and hand recognition live in photon-gesture.js. */
(function (root) {
  'use strict';
  const clickable = 'button,a[href],input:not([type="hidden"]),select,textarea,summary,[role="button"],[role="tab"],[contenteditable="true"]';
  const draggable = '#cubeViewport,.element-cell[data-symbol],[data-model-element],#chatResizeHandle,#chatHeightResizeHandle,#chatCornerResizeHandle,#floatingCompareHeader,#floatingFigureHeader,.floating-figure-lightbox-head,.floating-resize-handle';
  class WebsiteGestureSurface {
    constructor(document, window, cursor) {
      this.document = document; this.window = window; this.cursor = cursor;
      this.press = null; this.hover = null; this.scrollAnchor = null; this.menu = null;
    }
    enabled(node) {
      return node && node.isConnected !== false && !node.disabled && !node.closest('[inert],[hidden],[aria-disabled="true"]');
    }
    pointer(type, node, point) {
      // An anchored target replaces native pointer capture for camera-generated drags.
      node?.dispatchEvent(new this.window.PointerEvent(type, {
        bubbles: true, cancelable: true, pointerId: 8080, pointerType: 'pen', isPrimary: true,
        clientX: point.x, clientY: point.y, button: type === 'pointermove' ? -1 : 0,
        buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1
      }));
    }
    cancelPress() {
      if (this.press?.source) this.pointer('pointercancel', this.press.source, this.press.last);
      this.press = null;
    }
    cancel() {
      this.cancelPress(); this.scrollAnchor = null;
      this.hover?.classList.remove('gesture-hover'); this.hover = null;
      this.cursor.hidden = true; this.closeMenu();
    }
    closeMenu() { this.menu?.remove(); this.menu = null; }
    showOptions(select) {
      this.closeMenu();
      const menu = this.document.createElement('div');
      menu.className = 'website-gesture-options'; menu.setAttribute('role', 'listbox');
      menu.setAttribute('aria-label', select.getAttribute('aria-label') || 'Options');
      for (const option of select.options) {
        const button = this.document.createElement('button');
        button.type = 'button'; button.textContent = option.label;
        button.disabled = option.disabled || option.parentElement?.disabled || false;
        button.setAttribute('role', 'option'); button.setAttribute('aria-selected', String(option.selected));
        button.addEventListener('click', () => {
          if (!this.enabled(select)) { this.closeMenu(); return; }
          select.selectedIndex = option.index;
          select.dispatchEvent(new this.window.Event('input', {bubbles: true}));
          select.dispatchEvent(new this.window.Event('change', {bubbles: true}));
          this.closeMenu(); select.focus({preventScroll: true});
        });
        menu.appendChild(button);
      }
      this.document.body.appendChild(menu); this.menu = menu;
      const rect = select.getBoundingClientRect();
      menu.style.left = `${Math.max(8, Math.min(rect.left, this.window.innerWidth - menu.offsetWidth - 8))}px`;
      menu.style.top = `${Math.max(8, Math.min(rect.bottom + 6, this.window.innerHeight - menu.offsetHeight - 8))}px`;
    }
    scrollAt(node, pixels) {
      for (let candidate = node; candidate && candidate !== this.document.body; candidate = candidate.parentElement) {
        const overflow = this.window.getComputedStyle(candidate).overflowY;
        if (!/(auto|scroll|overlay)/.test(overflow) || candidate.scrollHeight <= candidate.clientHeight + 1) continue;
        const room = pixels > 0 ? candidate.scrollTop + candidate.clientHeight < candidate.scrollHeight - 1 : candidate.scrollTop > 0;
        if (room) { candidate.scrollBy(0, pixels); return; }
        // Do not scroll the blurred workbench behind a full-screen login/catalog overlay.
        if (candidate.matches('[aria-modal="true"],#nsrlCatalogScreen,#magicBookScreen')) return;
      }
      this.window.scrollBy(0, pixels);
    }
    moveRange(input, x) {
      const rect = input.getBoundingClientRect(); if (!rect.width) return;
      const min = Number(input.min || 0), max = Number(input.max || 100), step = Number(input.step || 1);
      let fraction = Math.max(0, Math.min(1, (x - rect.left) / rect.width));
      if (this.window.getComputedStyle(input).direction === 'rtl') fraction = 1 - fraction;
      const raw = min + fraction * (max - min);
      const snapped = Number.isFinite(step) && step > 0 ? min + Math.round((raw - min) / step) * step : raw;
      input.value = String(Math.max(min, Math.min(max, snapped)));
      input.dispatchEvent(new this.window.Event('input', {bubbles: true}));
    }
    handle(action) {
      const {document, window, cursor} = this;
      if (action.kind === 'lost') { this.cancel(); return ['Show one hand to point', '举起一只手以移动光标']; }
      if (action.kind === 'zoom') {
        this.cancelPress(); this.scrollAnchor = null; cursor.hidden = true;
        this.hover?.classList.remove('gesture-hover'); this.hover = null;
        return ['Use two fingers to scroll; pinch to click or drag', '双指滚动；捏合点击或拖动'];
      }
      if (action.kind === 'scroll') {
        this.cancelPress(); this.hover?.classList.remove('gesture-hover'); this.hover = null;
        if (action.start || !this.scrollAnchor) {
          const x = action.point.x * window.innerWidth, y = action.point.y * window.innerHeight;
          this.scrollAnchor = {x, y, node: document.elementFromPoint(x, y)};
        }
        cursor.hidden = false; cursor.dataset.mode = 'scroll'; cursor.dataset.down = 'false';
        cursor.style.left = `${this.scrollAnchor.x}px`; cursor.style.top = `${this.scrollAnchor.y}px`;
        const speed = Number(document.getElementById('gestureScrollSpeed')?.value || 1.4);
        const pixels = Math.abs(action.delta) < .0008 ? 0 : Math.max(-120, Math.min(120, action.delta * window.innerHeight * speed * 2));
        if (pixels && this.enabled(this.scrollAnchor.node)) this.scrollAt(this.scrollAnchor.node, pixels);
        return ['Two fingers · scroll up / down', '双指上下移动 · 滚动中'];
      }
      this.scrollAnchor = null;
      const point = {x: action.point.x * window.innerWidth, y: action.point.y * window.innerHeight};
      cursor.hidden = false; cursor.dataset.mode = 'pointer'; cursor.dataset.down = String(action.down);
      cursor.style.left = `${point.x}px`; cursor.style.top = `${point.y}px`;
      const under = document.elementFromPoint(point.x, point.y);
      const candidate = under?.closest(clickable) || under?.closest('label')?.control;
      const target = this.enabled(candidate) ? candidate : null;
      if (this.hover !== target) {
        this.hover?.classList.remove('gesture-hover'); this.hover = target; this.hover?.classList.add('gesture-hover');
      }
      if (action.phase === 'down') {
        if (this.menu && !this.menu.contains(under)) this.closeMenu();
        const source = under?.closest(draggable);
        // Ordinary buttons nested inside a draggable header must remain ordinary buttons.
        const drag = this.enabled(source) && (!target || source === target || target.matches('.cube-face')) ? source : null;
        this.press = {start: point, last: point, target, source: drag, dragged: false,
          range: target?.tagName === 'INPUT' && target.type === 'range' ? target : null};
        if (drag) this.pointer('pointerdown', drag, point);
      }
      if (this.press && action.down) {
        const press = this.press;
        if ((press.source && !this.enabled(press.source)) || (press.target && !this.enabled(press.target))) { this.cancelPress(); return ['Point to a visible control', '请指向可见控件']; }
        if (Math.hypot(point.x - press.start.x, point.y - press.start.y) > 18) press.dragged = true;
        if (press.range) { this.moveRange(press.range, point.x); press.dragged = true; }
        if (press.source && press.dragged) this.pointer('pointermove', press.source, point);
        press.last = point;
      }
      if (action.phase === 'up' && this.press) {
        const press = this.press; this.press = null;
        if (press.source) this.pointer(this.enabled(press.source) ? 'pointerup' : 'pointercancel', press.source, point);
        if (press.range) press.range.dispatchEvent(new window.Event('change', {bubbles: true}));
        if (!press.dragged && press.target === target && target) {
          target.focus?.({preventScroll: true});
          if (target.tagName === 'SELECT') this.showOptions(target);
          else if (target.type === 'file') return ['Use your mouse to choose a local file', '请用鼠标选择本地文件'];
          else target.click();
        }
      }
      return action.down ? ['Pinch held · move to drag', '保持捏合 · 移动以拖动'] : ['Point · pinch and release to click', '指向 · 捏合后松开以点击'];
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = {WebsiteGestureSurface};
  else root.WebsiteGestureSurface = WebsiteGestureSurface;
})(typeof window !== 'undefined' ? window : globalThis);
