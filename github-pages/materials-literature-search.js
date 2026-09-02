(() => {
  const module = document.querySelector("#m2");
  if (!module || document.querySelector("#wosMpPanel")) return;

  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
  const number = (value, digits = 3) => value === null || value === undefined || value === ""
    ? "—"
    : Number(value).toLocaleString("zh-CN", { maximumFractionDigits: digits });
  const yesNo = value => value === null || value === undefined ? "未知" : value ? "是" : "否";
  const host = location.hostname;
  const hostedBackend = host.endsWith("vercel.app") || host.endsWith("netlify.app") || host === "localhost" || host === "127.0.0.1";
  const defaultEndpoint = hostedBackend
    ? "/api/materials-search"
    : "https://arpes-materials-explorer-cocoyou.netlify.app/.netlify/functions/materials-search";
  const savedEndpoint = localStorage.getItem("materialsSearchApiEndpoint") || defaultEndpoint;

  const panel = document.createElement("section");
  panel.id = "wosMpPanel";
  panel.className = "wos-mp-panel";
  panel.innerHTML = `
    <div class="wos-mp-heading">
      <div><span class="wos-mp-kicker">LIVE LITERATURE + CALCULATED PROPERTIES</span><h4>Web of Science × Materials Project</h4></div>
      <span class="wos-mp-source">可追溯数据</span>
    </div>
    <p class="wos-mp-intro">输入 WoS 主题关键词或材料化学式。系统从论文题录识别材料，再按 Materials Project ID 返回计算性质；不会把摘要推测当作实验事实。</p>
    <form class="wos-mp-form" id="wosMpForm">
      <label><span>Web of Science 关键词</span><input id="wosMpQuery" type="search" placeholder='例如：perovskite solar cell band gap；MoS2 photocatalysis' required></label>
      <label><span>WoS 返回篇数</span><select id="wosMpLimit"><option>10</option><option selected>15</option><option>20</option><option>30</option></select></label>
      <button type="submit" id="wosMpSubmit">搜索论文与材料性质</button>
    </form>
    <details class="wos-mp-config"><summary>检索服务设置</summary><label>后端 API 地址<input id="wosMpEndpoint" type="url" value="${escapeHtml(savedEndpoint)}" placeholder="https://your-project.vercel.app/api/materials-search"></label><p>GitHub Pages 不能保存 API 密钥；WOS_API_KEY 与 MP_API_KEY 必须配置在 Vercel/Netlify 后端。</p></details>
    <div class="wos-mp-status" id="wosMpStatus" role="status">等待检索。可以输入材料名称、性能、表征方法或应用关键词。</div>
    <div class="wos-mp-result-tools" id="wosMpResultTools" hidden><label>在结果中继续筛选<input id="wosMpResultFilter" type="search" placeholder="带隙、DOS、结构、稳定、金属、mp-2815……"></label><button type="button" id="wosMpClear">清空结果</button></div>
    <div class="wos-mp-results" id="wosMpResults"></div>`;
  module.querySelector(".tools").after(panel);

  const form = panel.querySelector("#wosMpForm");
  const queryInput = panel.querySelector("#wosMpQuery");
  const endpointInput = panel.querySelector("#wosMpEndpoint");
  const submit = panel.querySelector("#wosMpSubmit");
  const status = panel.querySelector("#wosMpStatus");
  const results = panel.querySelector("#wosMpResults");
  const resultTools = panel.querySelector("#wosMpResultTools");
  const resultFilter = panel.querySelector("#wosMpResultFilter");
  let latestData = null;

  function materialSearchText(material, articleMap) {
    const symmetry = material.symmetry || {};
    const articleText = (material.article_ids || []).map(id => {
      const article = articleMap.get(id);
      return article ? `${article.title} ${article.doi} ${article.source_title}` : "";
    }).join(" ");
    return [
      material.material_id, material.formula_pretty, material.formula_query, (material.elements || []).join(" "),
      material.band_gap_eV, material.is_metal ? "金属 metal" : "半导体 semiconductor band gap 带隙",
      material.is_stable ? "稳定 stable" : "亚稳 metastable", material.has_dos ? "DOS 态密度" : "",
      material.has_band_structure ? "band structure 能带" : "", material.structure ? "structure 晶体结构" : "",
      symmetry.symbol, symmetry.crystal_system, symmetry.number, material.density_g_cm3, material.magnetic_ordering,
      articleText
    ].join(" ").toLowerCase();
  }

  function render(data) {
    latestData = data;
    const articleMap = new Map((data.articles || []).map(article => [article.id, article]));
    const materialCards = (data.materials || []).map(material => {
      const symmetry = material.symmetry || {};
      const linked = (material.article_ids || []).map(id => articleMap.get(id)).filter(Boolean);
      const articleLinks = linked.slice(0, 3).map(article => {
        const href = article.doi ? `https://doi.org/${encodeURIComponent(article.doi)}` : article.url;
        return href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(article.title)}</a>` : `<span>${escapeHtml(article.title)}</span>`;
      }).join("");
      const searchText = materialSearchText(material, articleMap);
      return `<article class="wos-material-result" data-search="${escapeHtml(searchText)}">
        <header><div><strong>${escapeHtml(material.formula_pretty)}</strong><span>${escapeHtml(material.material_id)}</span></div><a href="${escapeHtml(material.source?.url)}" target="_blank" rel="noopener">Materials Project ↗</a></header>
        <div class="wos-property-grid">
          <div><span>带隙</span><b>${number(material.band_gap_eV)} eV</b></div>
          <div><span>电子类型</span><b>${material.is_metal === null ? "未知" : material.is_metal ? "金属" : "半导体/绝缘体"}</b></div>
          <div><span>稳定相</span><b>${yesNo(material.is_stable)}</b></div>
          <div><span>凸包能</span><b>${number(material.energy_above_hull_eV_atom)} eV/atom</b></div>
          <div><span>密度</span><b>${number(material.density_g_cm3)} g/cm³</b></div>
          <div><span>空间群</span><b>${escapeHtml(symmetry.symbol || "—")} ${symmetry.number ? `(${escapeHtml(symmetry.number)})` : ""}</b></div>
          <div><span>晶体结构</span><b>${material.structure ? "可获取" : "暂无"}</b></div>
          <div><span>DOS / 能带</span><b>${material.has_dos ? "DOS" : "—"} ${material.has_band_structure ? "/ Band" : ""}</b></div>
        </div>
        <div class="wos-elements">${(material.elements || []).map(element => `<span>${escapeHtml(element)}</span>`).join("")}</div>
        <details class="wos-evidence"><summary>关联 WoS 论文 ${linked.length} 篇</summary><div>${articleLinks || "当前返回页中没有直接关联论文；该化学式来自检索词。"}</div></details>
      </article>`;
    }).join("");
    const articlesWithoutMaterials = (data.articles || []).filter(article => !(data.materials || []).some(material => (material.article_ids || []).includes(article.id)));
    const unmatched = articlesWithoutMaterials.length ? `<details class="wos-unmatched"><summary>另外 ${articlesWithoutMaterials.length} 篇论文未识别出可直接查询的确定化学式</summary><ul>${articlesWithoutMaterials.slice(0, 8).map(article => `<li>${escapeHtml(article.title)}</li>`).join("")}</ul></details>` : "";
    results.innerHTML = materialCards || '<div class="wos-mp-empty">WoS 返回了论文，但未识别到可用于 Materials Project 精确查询的化学式。请尝试加入具体材料名称，例如 MoS2、BaTiO3 或 FeSe。</div>';
    results.insertAdjacentHTML("beforeend", unmatched);
    resultTools.hidden = false;
    status.className = "wos-mp-status success";
    status.textContent = `WoS 返回 ${data.statistics?.wos_records ?? 0} 篇，识别 ${data.statistics?.formulas_identified ?? 0} 个化学式，获得 ${data.statistics?.mp_materials ?? 0} 个 Materials Project 结构记录。`;
  }

  function filterRendered(term) {
    const value = String(term || "").trim().toLowerCase();
    panel.querySelectorAll(".wos-material-result").forEach(card => card.classList.toggle("hidden", Boolean(value) && !card.dataset.search.includes(value)));
  }

  endpointInput.addEventListener("change", () => {
    const value = endpointInput.value.trim();
    if (value) localStorage.setItem("materialsSearchApiEndpoint", value);
  });
  resultFilter.addEventListener("input", () => filterRendered(resultFilter.value));
  panel.querySelector("#wosMpClear").addEventListener("click", () => {
    latestData = null;
    results.innerHTML = "";
    resultTools.hidden = true;
    resultFilter.value = "";
    status.className = "wos-mp-status";
    status.textContent = "结果已清空，可以开始新的检索。";
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const query = queryInput.value.trim();
    const endpoint = endpointInput.value.trim();
    if (!endpoint) {
      status.className = "wos-mp-status error";
      status.textContent = "请先填写 Vercel 或 Netlify 的 materials-search API 地址。";
      panel.querySelector(".wos-mp-config").open = true;
      return;
    }
    localStorage.setItem("materialsSearchApiEndpoint", endpoint);
    submit.disabled = true;
    results.innerHTML = "";
    resultTools.hidden = true;
    status.className = "wos-mp-status loading";
    status.textContent = "正在检索 Web of Science，并匹配 Materials Project 计算性质……";
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, limit: Number(panel.querySelector("#wosMpLimit").value), max_materials: 12 })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || `检索服务返回 HTTP ${response.status}`);
      render(data);
    } catch (error) {
      status.className = "wos-mp-status error";
      status.textContent = `${error.message} 请检查 API 地址以及服务器上的 WOS_API_KEY、MP_API_KEY。`;
    } finally {
      submit.disabled = false;
    }
  });

  const localSearch = module.querySelector(".local");
  localSearch.addEventListener("input", () => setTimeout(() => {
    filterRendered(localSearch.value);
    const visibleRemote = [...panel.querySelectorAll(".wos-material-result")].some(card => !card.classList.contains("hidden"));
    if (visibleRemote) module.querySelector(".cats .empty")?.remove();
  }));
  const globalSearch = document.querySelector("#q");
  globalSearch.addEventListener("input", () => setTimeout(() => {
    if (!latestData) return;
    filterRendered(globalSearch.value);
    const visibleRemote = [...panel.querySelectorAll(".wos-material-result")].some(card => !card.classList.contains("hidden"));
    if (visibleRemote) {
      module.classList.remove("hidden");
      module.open = true;
    }
  }));
})();
