(() => {
  'use strict';

  const endpoint = 'https://arpes-materials-explorer-cocoyou-361.netlify.app/.netlify/functions/materials-structure';
  const rows = [
    [['H', 1], ['He', 18]],
    [['Li', 1], ['Be', 2], ['B', 13], ['C', 14], ['N', 15], ['O', 16], ['F', 17], ['Ne', 18]],
    [['Na', 1], ['Mg', 2], ['Al', 13], ['Si', 14], ['P', 15], ['S', 16], ['Cl', 17], ['Ar', 18]],
    [['K', 1], ['Ca', 2], ['Sc', 3], ['Ti', 4], ['V', 5], ['Cr', 6], ['Mn', 7], ['Fe', 8], ['Co', 9], ['Ni', 10], ['Cu', 11], ['Zn', 12], ['Ga', 13], ['Ge', 14], ['As', 15], ['Se', 16], ['Br', 17], ['Kr', 18]],
    [['Rb', 1], ['Sr', 2], ['Y', 3], ['Zr', 4], ['Nb', 5], ['Mo', 6], ['Tc', 7], ['Ru', 8], ['Rh', 9], ['Pd', 10], ['Ag', 11], ['Cd', 12], ['In', 13], ['Sn', 14], ['Sb', 15], ['Te', 16], ['I', 17], ['Xe', 18]],
    [['Cs', 1], ['Ba', 2], ['La', 3], ['Hf', 4], ['Ta', 5], ['W', 6], ['Re', 7], ['Os', 8], ['Ir', 9], ['Pt', 10], ['Au', 11], ['Hg', 12], ['Tl', 13], ['Pb', 14], ['Bi', 15], ['Po', 16], ['At', 17], ['Rn', 18]],
    [['Fr', 1], ['Ra', 2], ['Ac', 3], ['Rf', 4], ['Db', 5], ['Sg', 6], ['Bh', 7], ['Hs', 8], ['Mt', 9], ['Ds', 10], ['Rg', 11], ['Cn', 12], ['Nh', 13], ['Fl', 14], ['Mc', 15], ['Lv', 16], ['Ts', 17], ['Og', 18]]
  ];
  const lanthanides = ['Ce', 'Pr', 'Nd', 'Pm', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Er', 'Tm', 'Yb', 'Lu'];
  const actinides = ['Th', 'Pa', 'U', 'Np', 'Pu', 'Am', 'Cm', 'Bk', 'Cf', 'Es', 'Fm', 'Md', 'No', 'Lr'];
  const selected = new Set();
  const materialMap = new Map();
  const q = selector => document.querySelector(selector);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const format = (value, digits = 3) => Number.isFinite(Number(value)) ? Number(value).toFixed(digits).replace(/\.?0+$/, '') : '—';

  function elementButton(symbol, row, column, kind = '') {
    return `<button class="mp-element ${kind}" type="button" data-element="${symbol}" style="grid-row:${row};grid-column:${column}" aria-pressed="false">${symbol}</button>`;
  }

  function renderElements() {
    const grid = q('#mp-elements');
    const main = rows.flatMap((items, row) => items.map(([symbol, column]) => elementButton(symbol, row + 1, column)));
    const f = lanthanides.map((symbol, index) => elementButton(symbol, 8, index + 4, 'lanthanide'));
    const a = actinides.map((symbol, index) => elementButton(symbol, 9, index + 4, 'actinide'));
    grid.innerHTML = [...main, ...f, ...a].join('');
    grid.addEventListener('click', event => {
      const button = event.target.closest('[data-element]');
      if (!button) return;
      const symbol = button.dataset.element;
      selected.has(symbol) ? selected.delete(symbol) : selected.add(symbol);
      button.classList.toggle('selected', selected.has(symbol));
      button.setAttribute('aria-pressed', String(selected.has(symbol)));
      updateSelected();
    });
  }

  function updateSelected() {
    q('#mp-selected-elements').textContent = selected.size ? [...selected].join(' · ') : '无';
    const absorber = q('#cif-absorber');
    if (selected.size && (!absorber.value || !selected.has(absorber.value))) absorber.value = [...selected][0];
  }

  function setPickerMode(mode) {
    const online = mode === 'materials';
    q('#materials-project-picker').hidden = !online;
    q('#local-cif-picker').hidden = online;
    q('#cif-source-materials').classList.toggle('active', online);
    q('#cif-source-local').classList.toggle('active', !online);
  }

  function renderResults(materials) {
    materialMap.clear();
    materials.forEach(material => materialMap.set(material.material_id, material));
    q('#mp-results').innerHTML = materials.length ? materials.map(material => {
      const symmetry = material.symmetry || {};
      return `<article class="mp-result" data-material-id="${escapeHtml(material.material_id)}">
        <div><strong>${escapeHtml(material.formula_pretty)}</strong><span class="mp-id">${escapeHtml(material.material_id)}</span></div>
        <div><small>空间群</small><span>${escapeHtml(symmetry.symbol || '—')} ${symmetry.number ? `#${symmetry.number}` : ''}</span></div>
        <div><small>晶系 / 位点</small><span>${escapeHtml(symmetry.crystal_system || '—')} · ${format(material.nsites, 0)}</span></div>
        <div><small>凸包能</small><span>${format(material.energy_above_hull_eV_atom, 4)} eV/atom</span></div>
        <button type="button" data-use-material="${escapeHtml(material.material_id)}" ${material.files?.cif ? '' : 'disabled'}>用于 EXAFS</button>
      </article>`;
    }).join('') : '<p class="status">没有匹配结构，请减少元素或改用化学式检索。</p>';
  }

  async function searchMaterials() {
    const typedQuery = q('#mp-query').value.trim();
    if (!selected.size && !typedQuery) throw new Error('请至少点击一个元素，或输入化学式/Materials Project ID。');
    const exactChemsys = !typedQuery && selected.size > 1 ? [...selected].join('-') : '';
    const query = typedQuery || exactChemsys;
    const elements = exactChemsys ? [] : [...selected];
    const button = q('#mp-search');
    const status = q('#mp-status');
    button.disabled = true;
    status.className = 'status';
    status.textContent = '正在查询 Materials Project 晶体数据库……';
    q('#mp-results').innerHTML = '';
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({query, elements, stable: q('#mp-stability').value, limit: 20})
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || `Materials Project 服务返回 HTTP ${response.status}`);
      renderResults(data.materials || []);
      status.className = 'status ok';
      status.textContent = `找到 ${data.statistics?.total_returned ?? 0} 个候选结构${exactChemsys ? `（精确元素体系 ${exactChemsys}）` : ''}；请核对化学式、空间群和 Materials Project ID。`;
    } finally {
      button.disabled = false;
    }
  }

  async function useMaterial(material) {
    if (!material?.files?.cif) throw new Error('该记录没有可用 CIF。');
    const name = `${material.material_id}_${material.formula_pretty}.cif`;
    globalThis.xafsCifSelection = {
      name,
      content: material.files.cif,
      source: {
        database: 'Materials Project',
        material_id: material.material_id,
        formula: material.formula_pretty,
        url: material.source?.url || `https://materialsproject.org/materials/${material.material_id}`,
        retrieved_at: new Date().toISOString()
      }
    };
    globalThis.xafsGeneratedFeffInput = null;
    q('#cif-file').value = '';
    q('#cif-source-summary').className = 'cif-source-summary ready';
    q('#cif-source-summary').textContent = `已选择 ${material.formula_pretty} · ${material.material_id} · ${material.symmetry?.symbol || '空间群未知'}；结构来源已记录。`;
    q('#mp-results').querySelectorAll('.mp-result').forEach(card => card.classList.toggle('selected', card.dataset.materialId === material.material_id));
    const absorber = q('#cif-absorber');
    const elements = material.elements || [];
    if (!elements.includes(absorber.value)) absorber.value = [...selected].find(element => elements.includes(element)) || elements[0] || absorber.value;
    window.dispatchEvent(new CustomEvent('xafs-cif-source-changed', {detail: globalThis.xafsCifSelection.source}));
    await globalThis.prepareFeffFromCif();
  }

  q('#cif-source-materials').addEventListener('click', () => setPickerMode('materials'));
  q('#cif-source-local').addEventListener('click', () => setPickerMode('local'));
  q('#mp-clear-elements').addEventListener('click', () => {
    selected.clear();
    q('#mp-elements').querySelectorAll('.selected').forEach(button => {
      button.classList.remove('selected');
      button.setAttribute('aria-pressed', 'false');
    });
    updateSelected();
  });
  q('#mp-search').addEventListener('click', () => searchMaterials().catch(error => {
    q('#mp-status').className = 'status error';
    q('#mp-status').textContent = error.message;
  }));
  q('#mp-results').addEventListener('click', event => {
    const button = event.target.closest('[data-use-material]');
    if (!button) return;
    useMaterial(materialMap.get(button.dataset.useMaterial)).catch(error => {
      q('#mp-status').className = 'status error';
      q('#mp-status').textContent = error.message;
    });
  });
  q('#cif-file').addEventListener('change', event => {
    const file = event.target.files[0];
    if (!file) return;
    globalThis.xafsCifSelection = null;
    globalThis.xafsGeneratedFeffInput = null;
    q('#cif-source-summary').className = 'cif-source-summary ready';
    q('#cif-source-summary').textContent = `已选择本地文件 ${file.name}。`;
    window.dispatchEvent(new CustomEvent('xafs-cif-source-changed', {detail: {database: 'local', name: file.name}}));
  });

  renderElements();
  setPickerMode('materials');
})();
