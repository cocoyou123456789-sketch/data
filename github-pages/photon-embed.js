/* Same-origin, lazy-loaded lab. No account, camera, or microphone is started here. */
(function (root) {
  'use strict';
  const locale = value => String(value || '').startsWith('zh') ? 'zh' : 'en';
  function labUrl(base, lang) {
    const url = new URL('./photon-lab.html', base);
    url.search = new URLSearchParams({embedded: '1', lang: locale(lang), stay_on_github: '1', v: '20261018'}).toString();
    return url.href;
  }
  function mount(env) {
    const doc = env.document, get = id => doc.getElementById(id);
    const dialog = get('photonLabDialog');
    if (!dialog) return null;
    const holder = get('photonLabFrameHost'), loading = get('photonLabLoading'), error = get('photonLabError');
    const back = get('photonLabBack'), standalone = get('photonLabStandalone'), language = get('photonLabLanguage');
    let frame = null, snapshot = null, opener = null, openerContainer = null, timer = 0, previousOverflow = '', lang = locale(doc.documentElement.lang);
    const word = (en, zh) => lang === 'zh' ? zh : en;
    function labels() {
      doc.querySelectorAll('[data-photon-en]').forEach(node => {
        node.textContent = node.dataset[lang === 'zh' ? 'photonZh' : 'photonEn'];
      });
      language.textContent = lang === 'zh' ? 'EN' : '中文';
      standalone.href = new URL(`./photon-lab.html?lang=${lang}&stay_on_github=1`, doc.baseURI).href;
      if (frame) frame.title = word('PHOTON interactive 3D lab', 'PHOTON 三维交互实验室');
    }
    function release() {
      env.clearTimeout(timer);
      if (!frame) return;
      try {
        const child = frame.contentWindow;
        snapshot = child.PhotonControls?.snapshot?.() || snapshot;
        // Cancel pending camera acquisition as well as active streams before unloading.
        child.dispatchEvent(new child.Event('photon:deactivate'));
      } catch { /* A failed/unavailable frame still gets destroyed below. */ }
      frame.remove();
      frame = null;
    }
    function failed(candidate) {
      if (candidate !== frame || !dialog.open) return;
      release();
      loading.hidden = true;
      error.hidden = false;
      get('photonLabRetry').focus();
    }
    function load() {
      release();
      loading.hidden = false;
      error.hidden = true;
      const candidate = doc.createElement('iframe');
      frame = candidate;
      candidate.hidden = true;
      candidate.setAttribute('allow', 'camera; fullscreen');
      candidate.setAttribute('allowfullscreen', '');
      candidate.setAttribute('referrerpolicy', 'same-origin');
      candidate.title = word('PHOTON interactive 3D lab', 'PHOTON 三维交互实验室');
      candidate.addEventListener('load', () => {
        if (frame !== candidate || !dialog.open) return;
        try {
          const controls = candidate.contentWindow.PhotonControls;
          if (!controls?.snapshot || !controls?.restore || !controls?.setLanguage) return failed(candidate);
          if (snapshot) controls.restore(snapshot);
          controls.setLanguage(lang);
          env.clearTimeout(timer);
          loading.hidden = true;
          candidate.hidden = false;
        } catch { failed(candidate); }
      });
      candidate.addEventListener('error', () => failed(candidate));
      candidate.src = labUrl(doc.baseURI, lang);
      holder.append(candidate);
      timer = env.setTimeout(() => failed(candidate), 20000);
    }
    function open(options = {}) {
      if (dialog.open) { back.focus(); return; }
      opener = options.trigger || doc.activeElement;
      openerContainer = opener?.closest('#nsrlCatalogScreen, #magicBookScreen');
      lang = locale(options.lang || doc.documentElement.lang);
      labels();
      if (typeof dialog.showModal !== 'function') { env.location.assign(standalone.href); return; }
      previousOverflow = doc.body.style.overflow;
      dialog.showModal();
      doc.body.style.overflow = 'hidden';
      load();
      back.focus();
    }
    function cleanup() {
      release();
      doc.body.style.overflow = previousOverflow;
      const target = opener?.isConnected ? opener : openerContainer?.querySelector('[data-photon-open]');
      if (target?.isConnected && !target.closest('[inert]')) target.focus({preventScroll: true});
    }
    function close() {
      if (!dialog.open) return;
      dialog.close();
      cleanup();
      if (doc.fullscreenElement === dialog) doc.exitFullscreen().catch(() => {});
    }
    function setLanguage(next) {
      lang = locale(next);
      if (locale(doc.documentElement.lang) !== lang && typeof env.switchLang === 'function') env.switchLang(lang);
      labels();
      env.NSRLCatalog?.setLanguage?.(lang);
      try { frame?.contentWindow.PhotonControls?.setLanguage?.(lang); } catch { /* Loading/error state. */ }
    }
    back.addEventListener('click', close);
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('close', () => { if (!dialog.open && frame) cleanup(); });
    get('photonLabRetry').addEventListener('click', load);
    language.addEventListener('click', () => setLanguage(lang === 'en' ? 'zh' : 'en'));
    const fullscreen = get('photonLabFullscreen');
    fullscreen.hidden = typeof dialog.requestFullscreen !== 'function';
    fullscreen.addEventListener('click', async () => {
      try {
        if (doc.fullscreenElement === dialog) await doc.exitFullscreen();
        else await dialog.requestFullscreen();
      } catch { /* The integrated dialog already fills the browser viewport. */ }
    });
    doc.addEventListener('click', event => {
      const trigger = event.target.closest('[data-photon-open]');
      if (!trigger || event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      open({trigger, lang: trigger.dataset.photonLang || doc.documentElement.lang});
    });
    if (env.MutationObserver) new env.MutationObserver(() => {
      const next = locale(doc.documentElement.lang);
      if (next !== lang) setLanguage(next); else labels();
    }).observe(doc.documentElement, {attributes: true, attributeFilter: ['lang']});
    env.addEventListener('pagehide', release);
    env.addEventListener('pageshow', () => { if (dialog.open && !frame) load(); });
    labels();
    if (new URL(env.location.href).searchParams.get('lab') === '1') open();
    return {
      open, close, setLanguage,
      openAgent() {
        close();
        env.location.assign(new URL('./agent.html?stay_on_github=1', doc.baseURI).href);
      },
    };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = {labUrl, mount};
  else root.PhotonLabHost = mount(root);
})(typeof window !== 'undefined' ? window : globalThis);
