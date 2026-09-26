/* Presentation-only taxonomy. No accelerator or beamline control requests. */
(function (global) {
  'use strict';
  const categories = [
    { id: 'accelerator', en: 'Intelligent Accelerator', zh: '智能化加速器',
      modules: [
        { en: 'Intelligent Storage Ring', zh: '智能储存环' },
        { en: 'Automated Beam Tuning', zh: '自动化调束' },
        { en: 'Operations Monitoring', zh: '运行监测' }
      ] },
    { id: 'beamline', en: 'Intelligent Beamlines', zh: '智能化线站',
      modules: [
        { en: 'Experiment Planning', zh: '实验规划' },
        { en: 'Unattended Experiments', zh: '无人化实验' },
        { en: 'Online Analysis', zh: '在线分析' },
        { en: 'Data Management', zh: '数据管理' }
      ] }
  ];
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { categories };
    return;
  }
  const host = document.createElement('div');
  host.id = 'nsrlCatalogScreen';
  host.hidden = true;
  host.setAttribute('inert', '');
  host.setAttribute('aria-hidden', 'true');
  host.setAttribute('role', 'dialog');
  host.setAttribute('aria-modal', 'true');
  host.setAttribute('aria-labelledby', 'nsrlCatalogTitle');
  document.body.append(host);
  let lang = 'en', selected = null, callbacks = {};
  const word = (en, zh) => lang === 'zh' ? zh : en;
  const label = item => item[lang];

  function illustration(id) {
    const isRing = id === 'accelerator';
    const magnets = Array.from({ length: 16 }, (_, i) =>
      `<g transform="rotate(${i * 22.5} 300 175)"><rect x="285" y="45" width="30" height="44" rx="5" fill="#247b97" stroke="#a2e9fa" stroke-width="2"/><path d="M290 54h20m-20 8h20m-20 8h20" stroke="#4deddf" stroke-width="2"/></g>`).join('');
    return `<svg viewBox="0 0 600 350" aria-hidden="true" focusable="false">
      <defs><radialGradient id="${id}-bg"><stop stop-color="#16455e"/><stop offset="1" stop-color="#061321"/></radialGradient>
      <linearGradient id="${id}-metal" x2="0" y2="1"><stop stop-color="#d8f0f7"/><stop offset=".5" stop-color="#357896"/><stop offset="1" stop-color="#0e2b42"/></linearGradient></defs>
      <rect width="600" height="350" fill="url(#${id}-bg)"/>
      <g stroke="#4394ac" opacity=".15">${Array.from({length: 12}, (_,i)=>`<path d="M${i*55} 0v350M0 ${i*35}h600"/>`).join('')}</g>
      ${isRing ? `<g transform="translate(0 34) scale(1 .8)">
        <circle cx="300" cy="175" r="145" fill="#071828" stroke="#356381" stroke-width="10"/>
        <circle cx="300" cy="175" r="110" fill="none" stroke="#bdedff" stroke-width="13"/>
        <circle cx="300" cy="175" r="110" fill="none" stroke="#3ffff0" stroke-width="3"/>
        ${magnets}<circle class="nsrl-orbit-pulse" cx="300" cy="175" r="110" fill="none" stroke="#fff" stroke-width="5" stroke-dasharray="22 669"/>
        <circle cx="300" cy="175" r="60" fill="#0b253c" stroke="#558b9e"/>
        <path d="M264 175h72M300 139v72" stroke="#64e6ea" stroke-width="2"/>
        <circle cx="300" cy="175" r="17" fill="none" stroke="#bcfaff" stroke-width="2"/>
        </g><path d="M414 192h129" stroke="#63e9ec" stroke-width="3"/>
        <circle cx="540" cy="192" r="7" fill="#b2fff2"/>`
      : `<g transform="translate(25 16)">
        <path d="M50 258h445l35 18H18Z" fill="#14384d" stroke="#6196b1"/>
        <path d="M92 184v72m135-72v72m163-72v72" stroke="#6594ad" stroke-width="14"/>
        <rect x="64" y="144" width="415" height="40" rx="20" fill="url(#${id}-metal)" stroke="#a6ddf0"/>
        ${[85,160,245,340].map(x=>`<rect x="${x}" y="121" width="34" height="86" rx="10" fill="url(#${id}-metal)" stroke="#a6ddf0"/><rect x="${x+8}" y="131" width="7" height="66" rx="3" fill="#80e7fa"/>`).join('')}
        <rect x="402" y="107" width="92" height="107" rx="14" fill="#16354a" stroke="#88b8d4" stroke-width="3"/>
        <circle cx="448" cy="160" r="34" fill="#082236" stroke="#82def5" stroke-width="5"/>
        <circle cx="448" cy="160" r="17" fill="#67ddea"/>
        <path class="nsrl-beam-pulse" d="M34 163h450" stroke="#92fff4" stroke-width="4"/>
        <path d="M275 120V65h95" fill="none" stroke="#6ccadc" stroke-width="3"/>
        <rect x="330" y="36" width="135" height="64" rx="6" fill="#092237" stroke="#4c9bb6"/>
        <path d="M344 80l15-15 15 5 15-20 16 26 14-12 23 5" fill="none" stroke="#64eade" stroke-width="2"/>
        </g>`}
      <g fill="#8dc4d8" font-family="monospace" font-size="11"><text x="25" y="30">NSRL / ${isRing ? 'ACCELERATOR' : 'BEAMLINE'}</text><text x="25" y="327">${isRing ? '01' : '02'} — ${word('CONCEPT', '概念')}</text></g>
    </svg>`;
  }

  function render(focus = true) {
    const category = categories.find(c => c.id === selected);
    host.innerHTML = `<div class="nsrl-catalog-shell">
      <div class="nsrl-catalog-nav" role="navigation" aria-label="${word('Light source navigation', '光源导航')}">
        <button type="button" data-nsrl-action="back">← ${word(category ? 'Categories' : 'Login', category ? '返回分类' : '返回登录')}</button>
        <span class="nsrl-catalog-brand">NSRL <span>/</span> LIGHT SOURCE</span>
        <button type="button" data-nsrl-action="language">${word('中文', 'EN')}</button>
      </div>
      <div class="nsrl-catalog-heading"><span class="nsrl-catalog-eyebrow">${category ? 'NSRL / '+(selected === 'accelerator' ? '01' : '02') : 'NSRL / INTELLIGENT FACILITY'}</span>
        <h1 id="nsrlCatalogTitle" tabindex="-1">${category ? label(category) : word('Intelligent Light Source', '智能化光源')}</h1>
      </div>
      ${!category || selected === 'beamline' ? `<a class="nsrl-photon-entry" href="./photon-lab.html?lang=${lang}"><strong>◈ HALF / PHOTON</strong><span>${word('Phase I · Explore 10 beamlines in 3D', '一期十条线站 · 进入三维展厅')} ↗</span></a>` : ''}
      ${category ? `<div class="nsrl-category-detail">
        <div class="nsrl-detail-art">${illustration(category.id)}</div>
        <div class="nsrl-module-list">${category.modules.map((m,i)=>`<article class="nsrl-module"><span>0${i+1}</span><h2>${label(m)}</h2><small>${word('Planned', '待建设')}</small></article>`).join('')}</div>
      </div>` : `<div class="nsrl-category-grid">${categories.map((c,i)=>`<button type="button" class="nsrl-category-card ${c.id}" data-nsrl-category="${c.id}">
        <div class="nsrl-card-art">${illustration(c.id)}</div>
        <div class="nsrl-card-body"><span class="nsrl-card-number">0${i+1}</span><h2>${label(c)}</h2>
        <div class="nsrl-card-tags">${c.modules.map(m=>`<span>${label(m)}</span>`).join('')}</div>
        <span class="nsrl-card-enter">${word('Explore category', '进入分类')} <b>↗</b></span></div>
      </button>`).join('')}</div>`}
      <footer class="nsrl-catalog-footer"><span>${word('FACILITY / MATERIALS / DISCOVERY', '光源 · 材料 · 发现')}</span>
        <button type="button" data-nsrl-action="materials">${word('Materials database', '材料数据库')} ↗</button>
      </footer>
    </div>`;
    if (focus) host.querySelector('h1').focus({preventScroll:true});
    host.scrollTop = 0;
  }
  host.addEventListener('click', event => {
    const card = event.target.closest('[data-nsrl-category]');
    if (card && categories.some(c => c.id === card.dataset.nsrlCategory)) {
      selected = card.dataset.nsrlCategory; render(); return;
    }
    const action = event.target.closest('[data-nsrl-action]')?.dataset.nsrlAction;
    if (action === 'back') {
      if (selected) { selected = null; render(); } else callbacks.onBack?.();
    } else if (action === 'materials') callbacks.onMaterials?.();
    else if (action === 'language') {
      lang = lang === 'en' ? 'zh' : 'en'; callbacks.onLanguage?.(lang); render();
    }
  });
  host.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (selected) {selected = null; render();} else callbacks.onBack?.();
    }
    if (event.key === 'Tab') {
      const focusable = [...host.querySelectorAll('button, a[href]')];
      const first=focusable[0], last=focusable.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement.tagName === 'H1')) {event.preventDefault(); last.focus();}
      else if (!event.shiftKey && document.activeElement === last) {event.preventDefault(); first.focus();}
    }
  });
  global.NSRLCatalog = { open(options = {}) {
    callbacks = options; lang = options.lang === 'zh' ? 'zh' : 'en'; selected = null;
    host.hidden = false; host.removeAttribute('inert'); host.removeAttribute('aria-hidden'); render();
  }};
})(typeof window !== 'undefined' ? window : globalThis);
