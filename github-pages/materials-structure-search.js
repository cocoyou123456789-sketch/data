(() => {
  const module = document.querySelector("#m2");
  if (!module || document.querySelector("#mpStructurePanel")) return;

  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
  const number = (value, digits = 3) => value === null || value === undefined || value === ""
    ? "—"
    : Number(value).toLocaleString("zh-CN", { maximumFractionDigits: digits });
  const booleanLabel = value => value === null || value === undefined ? "未知" : value ? "是" : "否";
  const host = location.hostname;
  const hostedBackend = host.endsWith("vercel.app") || host.endsWith("netlify.app") || host === "localhost" || host === "127.0.0.1";
  const defaultEndpoint = hostedBackend
    ? "/api/materials-structure"
    : "https://arpes-materials-explorer-cocoyou-361.netlify.app/.netlify/functions/materials-structure";
  const legacyEndpoints = new Set([
    "https://arpes-materials-explorer-cocoyou.netlify.app/.netlify/functions/materials-structure"
  ]);
  const storedEndpoint = localStorage.getItem("materialsStructureApiEndpoint");
  const savedEndpoint = storedEndpoint && !legacyEndpoints.has(storedEndpoint) ? storedEndpoint : defaultEndpoint;
  if (storedEndpoint !== savedEndpoint) localStorage.setItem("materialsStructureApiEndpoint", savedEndpoint);

  const panel = document.createElement("section");
  panel.id = "mpStructurePanel";
  panel.className = "mp-structure-explorer";
  panel.innerHTML = `
    <header class="mpx-head">
      <div><strong>Materials Project Materials & Spectroscopy Explorer</strong><span>STRUCTURE · PROPERTIES · DOS · BAND · XAS · OPTICS</span></div>
      <div class="mpx-head-actions"><span>NEW · MP SPECTRA</span><button type="button" id="mpxReset">Reset all</button></div>
    </header>
    <div class="mpx-layout">
      <form class="mpx-filters" id="mpxForm">
        <h4>Search Structures</h4>
        <label>化学式 / MP ID / 元素体系<input id="mpxQuery" type="search" placeholder="MoS2、mp-2815、Li-Fe-O（可留空）"></label>
        <div class="mpx-examples" aria-label="检索示例"><button type="button" data-query="BaTiO3">BaTiO3</button><button type="button" data-query="MoS2">MoS2</button><button type="button" data-query="Li-Fe-O">Li-Fe-O</button></div>
        <label>必须包含的元素<input id="mpxElements" type="text" placeholder="例如：Li, O"></label>
        <div class="mpx-label">带隙范围 (eV)</div>
        <div class="mpx-range"><input id="mpxGapMin" type="number" min="0" step="0.05" placeholder="Min"><span>—</span><input id="mpxGapMax" type="number" min="0" step="0.05" placeholder="Max"></div>
        <label>稳定性<select id="mpxStable"><option value="all">全部</option><option value="true">仅稳定相</option><option value="false">仅亚稳相</option></select></label>
        <label>电子类型<select id="mpxMetal"><option value="all">全部</option><option value="false">半导体 / 绝缘体</option><option value="true">金属</option></select></label>
        <label>晶系<select id="mpxCrystal"><option value="">全部晶系</option><option value="cubic">立方</option><option value="hexagonal">六方</option><option value="trigonal">三方</option><option value="tetragonal">四方</option><option value="orthorhombic">正交</option><option value="monoclinic">单斜</option><option value="triclinic">三斜</option></select></label>
        <label>可用电子数据<select id="mpxAvailable"><option value="">不限</option><option value="dos">具有 DOS</option><option value="band">具有能带</option><option value="both">DOS 与能带均有</option></select></label>
        <label>最多返回<select id="mpxLimit"><option>10</option><option selected>20</option><option>30</option><option>40</option></select></label>
        <button class="mpx-search" id="mpxSubmit" type="submit">Search Materials Project</button>
        <details class="mpx-config"><summary>API 设置</summary><label>后端地址<input id="mpxEndpoint" type="text" inputmode="url" value="${escapeHtml(savedEndpoint)}"></label><p>支持同源相对路径或完整 HTTPS 地址。MP_API_KEY 仅保存在服务器环境变量中，浏览器不会接触密钥。</p></details>
      </form>
      <main class="mpx-main">
        <div class="mpx-resultbar"><div><b>Search Results</b><span id="mpxMeta">输入条件后检索 Materials Project 晶体结构</span></div><div class="mpx-tabs"><button type="button" class="active" data-view="table">Table</button><button type="button" data-view="structure">Structure</button></div></div>
        <div class="mpx-status" id="mpxStatus" role="status">支持结构检索、性质汇总、DOS/能带任务、XAS与光学曲线，可下载 CIF 与 VASP。</div>
        <div class="mpx-results" id="mpxResults"><div class="mpx-empty"><strong>Start a structure search</strong><span>例如输入 MoS2，或设置带隙 ≤ 1.5 eV 后检索。</span></div></div>
        <footer>Data source: Materials Project · Computed structures and properties · 同一化学式可能包含多个晶型</footer>
      </main>
    </div>`;
  module.querySelector(".tools").after(panel);

  const form = panel.querySelector("#mpxForm");
  const queryInput = panel.querySelector("#mpxQuery");
  const endpointInput = panel.querySelector("#mpxEndpoint");
  const submit = panel.querySelector("#mpxSubmit");
  const status = panel.querySelector("#mpxStatus");
  const meta = panel.querySelector("#mpxMeta");
  const results = panel.querySelector("#mpxResults");
  let resultMap = new Map();
  const detailCache = new Map();
  let activeView = "table";

  function elementColor(element) {
    let hash = 0;
    for (const char of String(element || "X")) hash = (hash * 31 + char.charCodeAt(0)) % 360;
    return `hsl(${hash} 70% 48%)`;
  }

  function projectedStructure(material) {
    const sites = material.structure?.sites || [];
    if (!sites.length) return '<div class="mpx-no-structure">没有可显示的原子坐标</div>';
    const projected = sites.map((site, index) => {
      const [a = 0, b = 0, c = 0] = site.abc || [];
      return { site, index, x: a + c * .34, y: b + c * .22, z: c };
    });
    const xs = projected.map(point => point.x);
    const ys = projected.map(point => point.y);
    const minX = Math.min(...xs, 0);
    const maxX = Math.max(...xs, 1);
    const minY = Math.min(...ys, 0);
    const maxY = Math.max(...ys, 1);
    const scaleX = value => 28 + (value - minX) / Math.max(maxX - minX, .01) * 304;
    const scaleY = value => 232 - (value - minY) / Math.max(maxY - minY, .01) * 190;
    const corners = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]]
      .map(([a,b,c]) => ({ x: scaleX(a + c * .34), y: scaleY(b + c * .22) }));
    const edges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
    const edgeSvg = edges.map(([from,to]) => `<line x1="${corners[from].x}" y1="${corners[from].y}" x2="${corners[to].x}" y2="${corners[to].y}"/>`).join("");
    const atomSvg = [...projected].sort((a,b) => a.z - b.z).map(point => {
      const species = point.site.species?.[0] || { element: point.site.label || "X", occupancy: 1 };
      const element = species.element || point.site.label || "X";
      const radius = 8 + Math.min(1, Number(species.occupancy ?? 1)) * 5;
      return `<g><circle cx="${scaleX(point.x)}" cy="${scaleY(point.y)}" r="${radius}" fill="${elementColor(element)}"/><text x="${scaleX(point.x)}" y="${scaleY(point.y) + 3}">${escapeHtml(element)}</text><title>${escapeHtml(element)} · (${point.site.abc.map(value => number(value, 4)).join(", ")})</title></g>`;
    }).join("");
    return `<div class="mpx-crystal"><svg viewBox="0 0 360 260" role="img" aria-label="${escapeHtml(material.formula_pretty)} 晶体结构分数坐标投影"><g class="mpx-cell">${edgeSvg}</g><g class="mpx-atoms">${atomSvg}</g></svg><span>Fractional-coordinate projection · ${sites.length} sites</span></div>`;
  }

  function atomTable(material) {
    const sites = material.structure?.sites || [];
    if (!sites.length) return "";
    const rows = sites.slice(0, 80).map((site, index) => {
      const species = (site.species || []).map(item => `${item.element} ${number(item.occupancy, 3)}`).join(" + ");
      return `<tr><td>${index + 1}</td><td>${escapeHtml(species || site.label)}</td><td>${(site.abc || []).map(value => number(value, 6)).join("</td><td>")}</td></tr>`;
    }).join("");
    return `<div class="mpx-atom-table"><table><thead><tr><th>#</th><th>Species / occupancy</th><th>a</th><th>b</th><th>c</th></tr></thead><tbody>${rows}</tbody></table>${sites.length > 80 ? `<p>仅预览前 80 / ${sites.length} 个位点，下载 CIF 查看完整结构。</p>` : ""}</div>`;
  }

  function metric(label, value, unit = "") {
    const display = value === null || value === undefined || value === "" ? "—" : `${escapeHtml(number(value))}${unit ? ` ${escapeHtml(unit)}` : ""}`;
    return `<div class="mpx-metric"><span>${escapeHtml(label)}</span><b>${display}</b></div>`;
  }

  function emptyData(title, message) {
    return `<div class="mpx-data-empty"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span></div>`;
  }

  function lineChart(xValues, yValues, options = {}) {
    const points = (xValues || []).map((x, index) => [Number(x), Number((yValues || [])[index])]).filter(pair => pair.every(Number.isFinite));
    if (points.length < 2) return emptyData("暂无曲线", "Materials Project 当前记录没有可绘制的数据数组。");
    const width = 680, height = 250, left = 52, right = 18, top = 22, bottom = 42;
    const xs = points.map(pair => pair[0]), ys = points.map(pair => pair[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const scaleX = value => left + (value - minX) / Math.max(maxX - minX, 1e-12) * (width - left - right);
    const scaleY = value => height - bottom - (value - minY) / Math.max(maxY - minY, 1e-12) * (height - top - bottom);
    const path = points.map((pair, index) => `${index ? "L" : "M"}${scaleX(pair[0]).toFixed(2)},${scaleY(pair[1]).toFixed(2)}`).join(" ");
    return `<figure class="mpx-chart"><figcaption><b>${escapeHtml(options.title || "Materials Project spectrum")}</b><span>${escapeHtml(options.subtitle || `${points.length} points`)}</span></figcaption><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(options.title || "spectrum")}"><line class="axis" x1="${left}" y1="${height-bottom}" x2="${width-right}" y2="${height-bottom}"/><line class="axis" x1="${left}" y1="${top}" x2="${left}" y2="${height-bottom}"/><line class="zero" x1="${left}" y1="${scaleY(0)}" x2="${width-right}" y2="${scaleY(0)}"/><path d="${path}"/><text x="${left}" y="${height-15}">${number(minX)}</text><text x="${width-right}" y="${height-15}" text-anchor="end">${number(maxX)}</text><text x="${left-8}" y="${top+5}" text-anchor="end">${number(maxY)}</text><text x="${left-8}" y="${height-bottom}" text-anchor="end">${number(minY)}</text><text class="label" x="${(left+width-right)/2}" y="${height-7}" text-anchor="middle">${escapeHtml(options.xLabel || "Energy (eV)")}</text></svg></figure>`;
  }

  function propertiesPanel(material, data) {
    const electronic = data.properties?.electronic || {};
    const dielectric = data.properties?.dielectric || {};
    const elasticity = data.properties?.elasticity || {};
    const magnetism = data.properties?.magnetism || {};
    return `<div class="mpx-property-groups"><section><h6>热力学与结构</h6><div class="mpx-metrics">${metric("形成能", material.formation_energy_eV_atom, "eV/atom")}${metric("凸包能", material.energy_above_hull_eV_atom, "eV/atom")}${metric("密度", material.density_g_cm3, "g/cm³")}${metric("体积", material.volume_A3, "Å³")}</div></section><section><h6>电子与介电</h6><div class="mpx-metrics">${metric("带隙", electronic.band_gap_eV ?? material.band_gap_eV, "eV")}${metric("费米能级", electronic.efermi_eV, "eV")}${metric("介电常数", dielectric.total)}${metric("折射率", dielectric.refractive_index)}</div></section><section><h6>力学与磁性</h6><div class="mpx-metrics">${metric("体积模量", elasticity.bulk_modulus_GPa, "GPa")}${metric("剪切模量", elasticity.shear_modulus_GPa, "GPa")}${metric("德拜温度", elasticity.debye_temperature_K, "K")}${metric("总磁矩", magnetism.total_magnetization_uB_cell, "μB/cell")}</div><p class="mpx-source-note">磁序：${escapeHtml(magnetism.ordering || material.magnetic_ordering || "—")} · 磁性位点：${number(magnetism.magnetic_sites, 0)} · 泊松比：${number(elasticity.poisson_ratio)}</p></section></div>`;
  }

  function dosPanel(data) {
    const dos = data.dos;
    if (!dos) return emptyData("暂无 DOS", "该材料没有 Materials Project DOS 任务记录。");
    return `<div class="mpx-summary-panel"><div class="mpx-data-state">真实 Materials Project DOS 任务摘要</div><div class="mpx-metrics">${metric("DOS 带隙", dos.band_gap_eV, "eV")}${metric("VBM", dos.vbm_eV, "eV")}${metric("CBM", dos.cbm_eV, "eV")}${metric("费米能级", dos.efermi_eV, "eV")}</div><dl><div><dt>Task ID</dt><dd>${escapeHtml(dos.task_id || "—")}</dd></div><div><dt>元素投影</dt><dd>${escapeHtml((dos.elements || []).join(" · ") || "—")}</dd></div><div><dt>轨道投影</dt><dd>${escapeHtml((dos.orbitals || []).join(" · ") || "—")}</dd></div></dl><p>当前 Materials Project REST 文档提供 DOS 任务及带边摘要；完整 DOS 数组位于官方数据湖。本页面不会用估算数据生成曲线。</p></div>`;
  }

  function bandPanel(data) {
    const labels = { setyawan_curtarolo: "Setyawan–Curtarolo", hinuma: "Hinuma", latimer_munro: "Latimer–Munro" };
    const rows = Object.entries(data.band_structure || {}).filter(([, value]) => value).map(([key, band]) => `<article class="mpx-band-card"><h6>${labels[key] || key}</h6><div class="mpx-metrics">${metric("带隙", band.band_gap_eV, "eV")}${metric("直接带隙", band.direct_gap_eV, "eV")}${metric("VBM", band.vbm_eV, "eV")}${metric("CBM", band.cbm_eV, "eV")}</div><p>Task ${escapeHtml(band.task_id || "—")} · ${number(band.nbands, 0)} bands · VBM ${escapeHtml(band.vbm_label || "—")} / CBM ${escapeHtml(band.cbm_label || "—")}</p></article>`).join("");
    return rows ? `<div class="mpx-data-state">真实 Materials Project 能带任务摘要</div><div class="mpx-band-grid">${rows}</div><p class="mpx-source-note">完整能带数组由 Materials Project 数据湖提供；当前页面不绘制来源不明的能带曲线。</p>` : emptyData("暂无能带", "该材料没有 Materials Project 高对称路径能带任务。");
  }

  function spectraPanel(data) {
    const xas = data.spectra?.xas || [];
    const optical = data.spectra?.optical_absorption;
    const xasCharts = xas.slice(0, 4).map(item => lineChart(item.energy_eV, item.intensity, { title: `${item.absorbing_element || "?"} ${item.edge || ""} · ${item.spectrum_type || "XAS"}`, subtitle: `Task ${item.task_id || item.id}`, xLabel: "Photon energy (eV)" })).join("");
    const opticalChart = optical ? lineChart(optical.energy_eV, optical.coefficient_cm_inverse, { title: "Optical absorption coefficient", subtitle: `Band gap ${number(optical.band_gap_eV)} eV · ${number(optical.nkpoints, 0)} k-points`, xLabel: "Photon energy (eV)" }) : "";
    if (!xasCharts && !opticalChart) return emptyData("暂无谱学曲线", "该化学式当前没有可用 XAS 或光学吸收数组。");
    return `<div class="mpx-spectra-intro">曲线直接来自 Materials Project API；XAS 按化学式、吸收元素和吸收边组织。</div>${xasCharts ? `<h6 class="mpx-section-title">XAS / XANES / EXAFS</h6><div class="mpx-chart-grid">${xasCharts}</div>` : ""}${opticalChart ? `<h6 class="mpx-section-title">光学吸收</h6>${opticalChart}` : ""}`;
  }

  function renderDetailData(card, material, data) {
    card.querySelector('[data-detail-panel="properties"]').innerHTML = propertiesPanel(material, data);
    card.querySelector('[data-detail-panel="dos"]').innerHTML = dosPanel(data);
    card.querySelector('[data-detail-panel="band"]').innerHTML = bandPanel(data);
    card.querySelector('[data-detail-panel="spectra"]').innerHTML = spectraPanel(data);
    card.querySelectorAll("[data-detail-tab]").forEach(button => {
      const key = button.dataset.detailTab;
      if (key === "dos" && !data.availability?.dos || key === "band" && !data.availability?.band_structure || key === "spectra" && !data.availability?.xas && !data.availability?.optical_absorption) button.classList.add("unavailable");
    });
  }

  async function loadDetails(card, material) {
    if (detailCache.has(material.material_id)) {
      renderDetailData(card, material, detailCache.get(material.material_id));
      return;
    }
    card.querySelectorAll('[data-detail-panel]:not([data-detail-panel="structure"])').forEach(panel => { panel.innerHTML = '<div class="mpx-data-loading">正在读取 Materials Project 性质与谱学数据……</div>'; });
    const response = await fetch(endpointInput.value.trim(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "details", material_id: material.material_id, formula: material.formula_pretty }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || `详情服务返回 HTTP ${response.status}`);
    detailCache.set(material.material_id, data);
    renderDetailData(card, material, data);
  }

  function selectDetailTab(card, tab) {
    card.querySelectorAll("[data-detail-tab]").forEach(button => button.classList.toggle("active", button.dataset.detailTab === tab));
    card.querySelectorAll("[data-detail-panel]").forEach(panel => { panel.hidden = panel.dataset.detailPanel !== tab; });
  }

  function materialRow(material) {
    const symmetry = material.symmetry || {};
    const structure = material.structure;
    const detailId = `mpx-detail-${material.material_id.replace(/[^a-z0-9_-]/gi, "-")}`;
    const poscarDisabled = material.files?.poscar ? "" : "disabled";
    return `<article class="mpx-material" data-material-id="${escapeHtml(material.material_id)}">
      <div class="mpx-row">
        <div class="mpx-identity"><strong>${escapeHtml(material.formula_pretty)}</strong><a href="${escapeHtml(material.source?.url)}" target="_blank" rel="noopener">${escapeHtml(material.material_id)} ↗</a><div>${(material.elements || []).map(element => `<span>${escapeHtml(element)}</span>`).join("")}</div></div>
        <div><span>Band gap</span><b>${number(material.band_gap_eV)} eV</b></div>
        <div><span>Space group</span><b>${escapeHtml(symmetry.symbol || "—")} ${symmetry.number ? `#${escapeHtml(symmetry.number)}` : ""}</b></div>
        <div><span>Crystal system</span><b>${escapeHtml(symmetry.crystal_system || "—")}</b></div>
        <div><span>Sites</span><b>${number(material.nsites, 0)}</b></div>
        <div><span>Stable</span><b>${booleanLabel(material.is_stable)}</b></div>
        <div class="mpx-row-actions"><button type="button" data-action="view" aria-controls="${detailId}">性质与谱学</button><button type="button" data-action="cif" ${material.files?.cif ? "" : "disabled"}>CIF</button><button type="button" data-action="poscar" ${poscarDisabled}>VASP</button></div>
      </div>
      <div class="mpx-detail" id="${detailId}" hidden>
        <div class="mpx-detail-kicker"><b>Materials Project 数据详情</b><span>点击标签切换结构、性质和谱学数据；缺失数据不会生成模拟曲线。</span></div><nav class="mpx-detail-tabs"><button type="button" data-detail-tab="structure">01 结构</button><button type="button" class="active" data-detail-tab="properties">02 性质</button><button type="button" data-detail-tab="dos">03 DOS${material.has_dos ? " ✓" : ""}</button><button type="button" data-detail-tab="band">04 能带${material.has_band_structure ? " ✓" : ""}</button><button type="button" data-detail-tab="spectra">05 XAS / 光学</button></nav>
        <section data-detail-panel="structure" hidden><div class="mpx-detail-grid">
          ${projectedStructure(material)}
          <div class="mpx-lattice"><h5>Structure & lattice</h5><dl><div><dt>a / b / c</dt><dd>${number(structure?.lattice?.a)} / ${number(structure?.lattice?.b)} / ${number(structure?.lattice?.c)} Å</dd></div><div><dt>α / β / γ</dt><dd>${number(structure?.lattice?.alpha)}° / ${number(structure?.lattice?.beta)}° / ${number(structure?.lattice?.gamma)}°</dd></div><div><dt>Volume</dt><dd>${number(material.volume_A3)} Å³</dd></div><div><dt>Density</dt><dd>${number(material.density_g_cm3)} g/cm³</dd></div><div><dt>E above hull</dt><dd>${number(material.energy_above_hull_eV_atom)} eV/atom</dd></div><div><dt>Electronic data</dt><dd>${material.has_dos ? "DOS" : "—"} ${material.has_band_structure ? "/ Band structure" : ""}</dd></div></dl>${material.files?.poscar_note ? `<p class="mpx-warning">${escapeHtml(material.files.poscar_note)}</p>` : ""}</div>
        </div>
        ${atomTable(material)}</section><section data-detail-panel="properties"></section><section data-detail-panel="dos" hidden></section><section data-detail-panel="band" hidden></section><section data-detail-panel="spectra" hidden></section>
      </div>
    </article>`;
  }

  function render(data) {
    resultMap = new Map((data.materials || []).map(material => [material.material_id, material]));
    detailCache.clear();
    meta.textContent = `${data.statistics?.total_returned ?? 0} materials · ${data.statistics?.structures_available ?? 0} structures · ${data.statistics?.cif_available ?? 0} CIF · ${data.statistics?.poscar_available ?? 0} POSCAR`;
    results.innerHTML = data.materials?.length
      ? data.materials.map(materialRow).join("")
      : '<div class="mpx-empty"><strong>No matching structures</strong><span>请放宽带隙、稳定性或晶系条件后重试。</span></div>';
    results.dataset.view = activeView;
    status.className = "mpx-status success";
    status.textContent = `已从 Materials Project 获取 ${data.statistics?.total_returned ?? 0} 条真实结构记录。点击“查看结构”可检查晶格与原子坐标。`;
  }

  function downloadText(filename, content, mimeType = "text/plain;charset=utf-8") {
    if (!content) return;
    const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  results.addEventListener("click", event => {
    const tabButton = event.target.closest("button[data-detail-tab]");
    if (tabButton) {
      const card = tabButton.closest(".mpx-material");
      const material = resultMap.get(card.dataset.materialId);
      selectDetailTab(card, tabButton.dataset.detailTab);
      if (tabButton.dataset.detailTab !== "structure") loadDetails(card, material).catch(error => { card.querySelector(`[data-detail-panel="${tabButton.dataset.detailTab}"]`).innerHTML = emptyData("数据载入失败", error.message); });
      return;
    }
    const button = event.target.closest("button[data-action]");
    if (!button || button.disabled) return;
    const card = button.closest(".mpx-material");
    const material = resultMap.get(card.dataset.materialId);
    if (!material) return;
    if (button.dataset.action === "view") {
      const detail = card.querySelector(".mpx-detail");
      detail.hidden = !detail.hidden;
      button.textContent = detail.hidden ? "性质与谱学" : "收起详情";
      if (!detail.hidden) {
        selectDetailTab(card, "properties");
        loadDetails(card, material).catch(error => { card.querySelector('[data-detail-panel="properties"]').innerHTML = emptyData("数据载入失败", error.message); });
      }
    } else if (button.dataset.action === "cif") {
      downloadText(`${material.material_id}_${material.formula_pretty}.cif`, material.files.cif);
    } else if (button.dataset.action === "poscar") {
      downloadText(`${material.material_id}_${material.formula_pretty}.vasp`, material.files.poscar, "application/octet-stream");
    }
  });

  panel.querySelectorAll(".mpx-examples button").forEach(button => button.addEventListener("click", () => {
    queryInput.value = button.dataset.query;
    queryInput.focus();
  }));
  panel.querySelectorAll(".mpx-tabs button").forEach(button => button.addEventListener("click", () => {
    activeView = button.dataset.view;
    panel.querySelectorAll(".mpx-tabs button").forEach(item => item.classList.toggle("active", item === button));
    results.dataset.view = activeView;
    if (activeView === "structure") panel.querySelectorAll(".mpx-material").forEach(card => { card.querySelector(".mpx-detail").hidden = false; selectDetailTab(card, "structure"); });
    if (activeView === "table") panel.querySelectorAll(".mpx-detail").forEach(detail => { detail.hidden = true; });
    panel.querySelectorAll('[data-action="view"]').forEach(item => { item.textContent = activeView === "structure" ? "收起详情" : "性质与谱学"; });
  }));
  endpointInput.addEventListener("change", () => {
    if (endpointInput.value.trim()) localStorage.setItem("materialsStructureApiEndpoint", endpointInput.value.trim());
  });
  panel.querySelector("#mpxReset").addEventListener("click", () => {
    form.reset();
    queryInput.value = "";
    results.innerHTML = '<div class="mpx-empty"><strong>Start a structure search</strong><span>例如输入 MoS2，或设置带隙 ≤ 1.5 eV 后检索。</span></div>';
    meta.textContent = "输入条件后检索 Materials Project 晶体结构";
    status.className = "mpx-status";
    status.textContent = "筛选条件与结果已清空。";
    resultMap.clear();
    detailCache.clear();
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const endpoint = endpointInput.value.trim();
    if (!endpoint) {
      status.className = "mpx-status error";
      status.textContent = "请先填写 materials-structure 后端 API 地址。";
      panel.querySelector(".mpx-config").open = true;
      return;
    }
    const availability = panel.querySelector("#mpxAvailable").value;
    const payload = {
      query: queryInput.value.trim(),
      elements: panel.querySelector("#mpxElements").value,
      band_gap_min: panel.querySelector("#mpxGapMin").value,
      band_gap_max: panel.querySelector("#mpxGapMax").value,
      stable: panel.querySelector("#mpxStable").value,
      metallic: panel.querySelector("#mpxMetal").value,
      crystal_system: panel.querySelector("#mpxCrystal").value,
      has_dos: availability === "dos" || availability === "both" ? true : null,
      has_band_structure: availability === "band" || availability === "both" ? true : null,
      limit: Number(panel.querySelector("#mpxLimit").value)
    };
    submit.disabled = true;
    results.innerHTML = '<div class="mpx-empty loading"><strong>Querying Materials Project</strong><span>正在读取结构、晶格、性质与文件数据……</span></div>';
    status.className = "mpx-status loading";
    status.textContent = "正在连接 Materials Project API……";
    try {
      localStorage.setItem("materialsStructureApiEndpoint", endpoint);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || `结构服务返回 HTTP ${response.status}`);
      render(data);
    } catch (error) {
      status.className = "mpx-status error";
      status.textContent = `${error.message} 请检查后端地址以及服务器上的 MP_API_KEY。`;
      results.innerHTML = '<div class="mpx-empty error"><strong>Structure search failed</strong><span>密钥不会在浏览器端传输，请检查 Serverless 环境变量。</span></div>';
    } finally {
      submit.disabled = false;
    }
  });

  const localSearch = module.querySelector(".local");
  localSearch?.addEventListener("input", () => {
    const value = localSearch.value.trim().toLowerCase();
    panel.querySelectorAll(".mpx-material").forEach(card => card.classList.toggle("hidden", Boolean(value) && !card.textContent.toLowerCase().includes(value)));
  });
})();
