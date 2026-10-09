'use strict';

(() => {
  const byId = id => document.getElementById(id);
  const form = byId('fit-form');
  const mode = byId('execution-mode');
  const role = byId('analysis-role');

  function setModePresentation() {
    const nativeMode = mode.value === 'native';
    document.body.classList.toggle('mode-native', nativeMode);
    document.body.classList.toggle('mode-browser', !nativeMode);
    const run = byId('run-fit');
    if (nativeMode) {
      run.textContent = byId('native-input-stage').value === 'raw'
        ? '建立原生任务并打开 Athena'
        : '运行 Demeter / FEFF 拟合';
    } else {
      run.textContent = '运行浏览器探索拟合';
    }
    updateReadiness();
  }

  function amplitudeConflict() {
    if (!form.elements.vary_s02?.checked) return false;
    if (byId('core-vary-n')?.checked) return true;
    return false;
  }

  function applyRole() {
    const varyS02 = form.elements.vary_s02;
    const varyN = byId('core-vary-n');
    if (!varyS02 || !varyN || role.value === 'manual') return updateReadiness();
    const standard = role.value === 'standard';
    varyS02.checked = standard;
    varyN.checked = !standard;
    updateReadiness();
  }

  function readinessItems() {
    const nativeMode = mode.value === 'native';
    const rawStage = byId('native-input-stage').value === 'raw';
    const hasData = Boolean(byId('data-file').files?.length);
    const kmin = Number(form.elements.kmin.value);
    const kmax = Number(form.elements.kmax.value);
    const rmin = Number(form.elements.fit_rmin.value);
    const rmax = Number(form.elements.fit_rmax.value);
    const validRanges = Number.isFinite(kmin) && Number.isFinite(kmax) && kmax > kmin && rmax > rmin && rmin >= 0;
    const hasPaths = Boolean(byId('path-files').files?.length);
    const hasNativeFeff = Boolean(byId('native-feff-file').files?.length);
    const bridgeConnected = Boolean(window.xafsNativeState?.connected);
    return [
      { label: '实验数据', ok: hasData },
      { label: 'k / R 范围', ok: validRanges },
      { label: nativeMode ? '本机桥接' : 'FEFF 路径', ok: nativeMode ? bridgeConnected : hasPaths },
      { label: nativeMode && !rawStage ? 'feff.inp' : '振幅约束', ok: nativeMode && !rawStage ? hasNativeFeff : !amplitudeConflict() },
    ];
  }

  function updateReadiness() {
    const items = readinessItems();
    byId('readiness-list').innerHTML = items.map(item => `<li class="${item.ok ? 'ok' : ''}">${item.ok ? '✓' : '○'} ${item.label}</li>`).join('');
    const complete = items.every(item => item.ok);
    byId('readiness-strip').classList.toggle('ready', complete);
    byId('readiness-summary').textContent = complete ? '必要条件已满足，可开始运行' : `${items.filter(item => item.ok).length}/${items.length} 项已就绪`;
  }

  document.querySelectorAll('[data-scroll-target]').forEach(button => {
    button.addEventListener('click', () => byId(button.dataset.scrollTarget)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  });

  const sections = [...document.querySelectorAll('.workbench-section')];
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      document.querySelectorAll('[data-scroll-target]').forEach(button => button.classList.toggle('active', button.dataset.scrollTarget === visible.target.id));
    }, { rootMargin: '-80px 0px -55% 0px', threshold: [0, .2, .5] });
    sections.forEach(section => observer.observe(section));
  }

  form.addEventListener('input', updateReadiness);
  form.addEventListener('change', updateReadiness);
  form.addEventListener('submit', event => {
    if (mode.value === 'browser' && amplitudeConflict()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      byId('status').className = 'status error';
      byId('status').textContent = '单条谱不能同时自由拟合 S₀² 与配位数 N。标准样请固定 N；未知样请固定或外部约束 S₀²。';
      return;
    }
    byId('result-dashboard').classList.add('has-results');
  }, true);
  mode.addEventListener('change', setModePresentation);
  byId('native-input-stage').addEventListener('change', setModePresentation);
  role.addEventListener('change', applyRole);
  window.addEventListener('xafs-native-status', updateReadiness);
  setModePresentation();
  applyRole();
})();
