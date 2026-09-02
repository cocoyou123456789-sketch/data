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
      <div><strong>Materials Project Structure Explorer</strong><span>LIVE CRYSTAL STRUCTURE SEARCH</span></div>
      <div class="mpx-head-actions"><span>MP API</span><button type="button" id="mpxReset">Reset all</button></div>
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
        <div class="mpx-status" id="mpxStatus" role="status">支持化学式、Materials Project ID 和元素体系检索，可下载 CIF 与 POSCAR。</div>
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
        <div class="mpx-row-actions"><button type="button" data-action="view" aria-controls="${detailId}">查看结构</button><button type="button" data-action="cif" ${material.files?.cif ? "" : "disabled"}>CIF</button><button type="button" data-action="poscar" ${poscarDisabled}>POSCAR</button></div>
      </div>
      <div class="mpx-detail" id="${detailId}" hidden>
        <div class="mpx-detail-grid">
          ${projectedStructure(material)}
          <div class="mpx-lattice"><h5>Structure & lattice</h5><dl><div><dt>a / b / c</dt><dd>${number(structure?.lattice?.a)} / ${number(structure?.lattice?.b)} / ${number(structure?.lattice?.c)} Å</dd></div><div><dt>α / β / γ</dt><dd>${number(structure?.lattice?.alpha)}° / ${number(structure?.lattice?.beta)}° / ${number(structure?.lattice?.gamma)}°</dd></div><div><dt>Volume</dt><dd>${number(material.volume_A3)} Å³</dd></div><div><dt>Density</dt><dd>${number(material.density_g_cm3)} g/cm³</dd></div><div><dt>E above hull</dt><dd>${number(material.energy_above_hull_eV_atom)} eV/atom</dd></div><div><dt>Electronic data</dt><dd>${material.has_dos ? "DOS" : "—"} ${material.has_band_structure ? "/ Band structure" : ""}</dd></div></dl>${material.files?.poscar_note ? `<p class="mpx-warning">${escapeHtml(material.files.poscar_note)}</p>` : ""}</div>
        </div>
        ${atomTable(material)}
      </div>
    </article>`;
  }

  function render(data) {
    resultMap = new Map((data.materials || []).map(material => [material.material_id, material]));
    meta.textContent = `${data.statistics?.total_returned ?? 0} materials · ${data.statistics?.structures_available ?? 0} structures · ${data.statistics?.cif_available ?? 0} CIF · ${data.statistics?.poscar_available ?? 0} POSCAR`;
    results.innerHTML = data.materials?.length
      ? data.materials.map(materialRow).join("")
      : '<div class="mpx-empty"><strong>No matching structures</strong><span>请放宽带隙、稳定性或晶系条件后重试。</span></div>';
    results.dataset.view = activeView;
    status.className = "mpx-status success";
    status.textContent = `已从 Materials Project 获取 ${data.statistics?.total_returned ?? 0} 条真实结构记录。点击“查看结构”可检查晶格与原子坐标。`;
  }

  function downloadText(filename, content) {
    if (!content) return;
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  results.addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");
    if (!button || button.disabled) return;
    const card = button.closest(".mpx-material");
    const material = resultMap.get(card.dataset.materialId);
    if (!material) return;
    if (button.dataset.action === "view") {
      const detail = card.querySelector(".mpx-detail");
      detail.hidden = !detail.hidden;
      button.textContent = detail.hidden ? "查看结构" : "收起结构";
    } else if (button.dataset.action === "cif") {
      downloadText(`${material.material_id}_${material.formula_pretty}.cif`, material.files.cif);
    } else if (button.dataset.action === "poscar") {
      downloadText(`POSCAR_${material.material_id}_${material.formula_pretty}`, material.files.poscar);
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
    if (activeView === "structure") panel.querySelectorAll(".mpx-detail").forEach(detail => { detail.hidden = false; });
    if (activeView === "table") panel.querySelectorAll(".mpx-detail").forEach(detail => { detail.hidden = true; });
    panel.querySelectorAll('[data-action="view"]').forEach(item => { item.textContent = activeView === "structure" ? "收起结构" : "查看结构"; });
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
