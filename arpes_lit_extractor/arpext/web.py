from __future__ import annotations

import json
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from .config import load_materials
from .corpus import load_articles, load_elements, search_articles, search_elements
from .extract import extract_from_text
from .knowledge import describe_materials
from .scholar import parse_scholar_bibtex
from .wos import load_imported_articles, parse_wos_export, save_imported_articles


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8767


class ArpesWebHandler(BaseHTTPRequestHandler):
    server_version = "ArpesLitWeb/0.1"

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path in {"/", "/index.html"}:
            self._send_text(INDEX_HTML, "text/html; charset=utf-8")
            return
        if path == "/health":
            self._send_json({"ok": True})
            return
        if path == "/api/sources":
            self._send_json({"sources": _load_search_sources()})
            return
        self.send_error(HTTPStatus.NOT_FOUND, "Not found")

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path not in {"/api/analyze", "/api/search", "/api/import-wos", "/api/import-scholar"}:
            self.send_error(HTTPStatus.NOT_FOUND, "Not found")
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            if path == "/api/import-wos":
                text = str(payload.get("text", ""))
                source = str(payload.get("source_file", "wos-export"))
                if not text.strip():
                    self._send_json({"error": "请上传或粘贴 Web of Science 导出文件内容。"}, HTTPStatus.BAD_REQUEST)
                    return
                articles = parse_wos_export(text, ROOT / "config" / "materials.json", source)
                save_imported_articles(ROOT / "data" / "imported_wos_articles.json", articles)
                self._send_json({"imported": len(articles), "articles": articles[:20]})
                return

            if path == "/api/import-scholar":
                text = str(payload.get("text", ""))
                source = str(payload.get("source_file", "google-scholar.bib"))
                if not text.strip():
                    self._send_json({"error": "请粘贴 Google Scholar BibTeX 内容。"}, HTTPStatus.BAD_REQUEST)
                    return
                articles = parse_scholar_bibtex(text, ROOT / "config" / "materials.json", source)
                save_imported_articles(ROOT / "data" / "imported_scholar_articles.json", articles)
                self._send_json({"imported": len(articles), "articles": articles[:20]})
                return

            if path == "/api/search":
                query = str(payload.get("query", ""))
                if not query.strip():
                    self._send_json({"error": "请输入材料名、元素或关键词。"}, HTTPStatus.BAD_REQUEST)
                    return
                articles = load_articles(ROOT / "data" / "articles.json")
                articles += load_imported_articles(ROOT / "data" / "imported_wos_articles.json")
                articles += load_imported_articles(ROOT / "data" / "imported_scholar_articles.json")
                result = search_articles(query, articles)
                result["trusted_elements"] = search_elements(query, load_elements(ROOT / "data" / "elements.json"))
                result["data_note"] = (
                    "元素数据来自 RSC Periodic Table；文章记录仅为带链接的文献线索，"
                    "具体温度、光子能量、band gap 需下载全文后核验。"
                )
                self._send_json(result)
                return

            text = str(payload.get("text", ""))
            source = str(payload.get("source_file", "browser-input"))
            if not text.strip():
                self._send_json({"error": "请输入论文文本、摘要或实验记录。"}, HTTPStatus.BAD_REQUEST)
                return

            materials = load_materials(ROOT / "config" / "materials.json")
            record = extract_from_text(text, source, materials).to_dict()
            record["material_properties"] = describe_materials(
                list(record.get("materials", [])),
                list(record.get("dopants", [])),
            )
            record["confidence"] = _confidence(record)
            self._send_json(record)
        except Exception as exc:  # pragma: no cover - defensive server boundary
            self._send_json({"error": str(exc)}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def log_message(self, fmt: str, *args) -> None:
        print("%s - %s" % (self.address_string(), fmt % args))

    def _send_json(self, payload: dict[str, object], status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_text(self, text: str, content_type: str, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = text.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def _confidence(record: dict[str, object]) -> dict[str, object]:
    score = 0
    reasons = []
    if record.get("materials"):
        score += 35
        reasons.append("识别到目标材料")
    if record.get("techniques"):
        score += 20
        reasons.append("识别到实验/计算技术")
    if record.get("dopants"):
        score += 15
        reasons.append("识别到掺杂或处理方式")
    if record.get("photon_energies_eV") or record.get("temperatures_K"):
        score += 15
        reasons.append("识别到 ARPES 实验条件")
    if record.get("band_gaps") or record.get("fermi_velocities"):
        score += 15
        reasons.append("识别到物性参数")
    return {"score": min(score, 100), "reasons": reasons}


def _load_search_sources() -> list[dict[str, object]]:
    return json.loads((ROOT / "data" / "search_sources.json").read_text(encoding="utf-8"))


def run(host: str = DEFAULT_HOST, port: int = DEFAULT_PORT) -> None:
    server = ThreadingHTTPServer((host, port), ArpesWebHandler)
    print(f"ARPES literature web app running at http://{host}:{port}")
    server.serve_forever()


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Run the ARPES literature extractor web app.")
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    args = parser.parse_args()
    run(args.host, args.port)


INDEX_HTML = r"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ARPES 材料识别</title>
  <style>
    :root {
      --bg: #f5f7f8;
      --panel: #ffffff;
      --ink: #172026;
      --muted: #63717a;
      --line: #dbe3e7;
      --accent: #0f766e;
      --accent-2: #b42318;
      --soft: #e7f4f2;
      --soft-2: #fff7df;
      --trusted: #e8f0ff;
      --chip: #eef2f4;
      --shadow: 0 16px 40px rgba(23, 32, 38, 0.08);
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--ink);
    }

    header {
      min-height: 84px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
      padding: 18px clamp(18px, 4vw, 56px);
      border-bottom: 1px solid var(--line);
      background: #ffffff;
    }

    h1 {
      margin: 0;
      font-size: clamp(22px, 3vw, 34px);
      line-height: 1.15;
      letter-spacing: 0;
    }

    .subtitle {
      margin: 6px 0 0;
      color: var(--muted);
      font-size: 14px;
    }

    main {
      width: min(1440px, 100%);
      margin: 0 auto;
      padding: 24px clamp(14px, 3vw, 36px) 36px;
      display: grid;
      grid-template-columns: minmax(340px, 0.9fr) minmax(420px, 1.1fr);
      gap: 20px;
      align-items: start;
    }

    .search-band {
      width: min(1440px, 100%);
      margin: 0 auto;
      padding: 20px clamp(14px, 3vw, 36px) 0;
      display: grid;
      gap: 14px;
    }

    section {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: var(--shadow);
      overflow: hidden;
    }

    .section-head {
      min-height: 56px;
      padding: 14px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      border-bottom: 1px solid var(--line);
    }

    h2 {
      margin: 0;
      font-size: 16px;
      line-height: 1.25;
      letter-spacing: 0;
    }

    .controls {
      padding: 16px;
      display: grid;
      gap: 12px;
    }

    input[type="search"], textarea {
      width: 100%;
      resize: vertical;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 12px;
      color: var(--ink);
      background: #fbfcfd;
    }

    input[type="search"] {
      min-height: 44px;
      font: 16px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    textarea {
      min-height: 340px;
      font: 14px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }

    textarea.compact {
      min-height: 130px;
    }

    .row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
    }

    button, .file-label {
      min-height: 38px;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 8px 12px;
      background: #ffffff;
      color: var(--ink);
      cursor: pointer;
      font-weight: 650;
    }

    button.primary {
      background: var(--accent);
      border-color: var(--accent);
      color: #ffffff;
    }

    button:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    input[type="file"] { display: none; }

    .status {
      color: var(--muted);
      font-size: 13px;
      min-height: 20px;
    }

    .results {
      padding: 16px;
      display: grid;
      gap: 14px;
    }

    .empty {
      min-height: 520px;
      display: grid;
      place-items: center;
      color: var(--muted);
      text-align: center;
      padding: 24px;
    }

    .summary {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }

    .metric {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      background: #fbfcfd;
      min-height: 86px;
    }

    .metric .label {
      color: var(--muted);
      font-size: 12px;
      margin-bottom: 8px;
    }

    .metric .value {
      font-size: 20px;
      font-weight: 760;
      overflow-wrap: anywhere;
    }

    .block {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
      background: #ffffff;
    }

    .block h3 {
      margin: 0 0 10px;
      font-size: 15px;
      letter-spacing: 0;
    }

    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .chip {
      background: var(--chip);
      border-radius: 999px;
      padding: 6px 9px;
      font-size: 13px;
      line-height: 1.15;
    }

    .chip.good { background: var(--soft); color: #0b5f59; }
    .chip.note { background: var(--soft-2); color: #765600; }
    .chip.trusted { background: var(--trusted); color: #174ea6; }
    .chip.warn { background: #fff0ee; color: var(--accent-2); }

    .table-wrap {
      overflow-x: auto;
      border: 1px solid var(--line);
      border-radius: 8px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 760px;
      font-size: 13px;
    }

    th, td {
      padding: 10px;
      border-bottom: 1px solid var(--line);
      text-align: left;
      vertical-align: top;
    }

    th {
      color: var(--muted);
      font-size: 12px;
      background: #f8fafb;
    }

    tr:last-child td { border-bottom: 0; }

    .link {
      color: var(--accent);
      font-weight: 700;
      text-decoration: none;
    }

    .element-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }

    .source-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .source-card {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fbfcfd;
      padding: 12px;
      min-height: 154px;
    }

    .source-title {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 8px;
    }

    .source-title strong {
      font-size: 15px;
    }

    .source-meta {
      color: var(--muted);
      font-size: 12px;
      margin-bottom: 8px;
    }

    .element-card {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      background: #fbfcfd;
      min-height: 188px;
    }

    .element-symbol {
      font-size: 30px;
      font-weight: 820;
      line-height: 1;
    }

    .element-name {
      color: var(--muted);
      margin-top: 4px;
      font-size: 13px;
    }

    .facts {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
      margin-top: 12px;
      font-size: 12px;
    }

    .fact {
      background: #ffffff;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 7px;
    }

    .fact span {
      display: block;
      color: var(--muted);
      margin-bottom: 2px;
    }

    ul {
      margin: 8px 0 0;
      padding-left: 20px;
    }

    li { margin: 5px 0; }

    pre {
      margin: 0;
      max-height: 280px;
      overflow: auto;
      background: #101820;
      color: #d7e0e5;
      border-radius: 8px;
      padding: 12px;
      font-size: 12px;
      line-height: 1.5;
    }

    @media (max-width: 980px) {
      main { grid-template-columns: 1fr; }
      textarea { min-height: 260px; }
      .summary { grid-template-columns: 1fr; }
      .element-grid { grid-template-columns: 1fr; }
      .source-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>ARPES 材料识别</h1>
      <p class="subtitle">SnSe2、二茂钴掺杂 SnSe2、SnSeS、SnS2、SnSe、SnS</p>
    </div>
    <button id="demoBtn" title="填入示例文本">示例</button>
  </header>

  <div class="search-band">
    <section>
      <div class="section-head">
        <h2>搜索材料或元素</h2>
        <span class="status" id="searchStatus"></span>
      </div>
      <div class="controls">
        <input id="searchInput" type="search" placeholder="输入 Sn、Se、S、SnSe2、二茂钴、ARPES、band gap">
        <div class="row">
          <button class="primary" id="searchBtn" title="从文章数据中搜索">搜索数据库</button>
          <button id="snBtn" title="搜索 Sn 相关材料">Sn</button>
          <button id="seBtn" title="搜索 Se 相关材料">Se</button>
          <button id="sBtn" title="搜索 S 相关材料">S</button>
          <button id="snse2Btn" title="搜索 SnSe2">SnSe2</button>
        </div>
      </div>
    </section>

    <section>
      <div class="section-head">
        <h2>导入 Web of Science</h2>
        <span class="status" id="wosStatus"></span>
      </div>
      <div class="controls">
        <textarea id="wosInput" class="compact" spellcheck="false" placeholder="粘贴 WoS 导出的 CSV/TSV 内容，或选择导出文件。建议字段包含 Article Title、Abstract、Author Keywords、Publication Year、DOI、UT。"></textarea>
        <div class="row">
          <label class="file-label" for="wosFile" title="读取 Web of Science 导出文件">选择 WoS 文件</label>
          <input id="wosFile" type="file" accept=".csv,.tsv,.txt">
          <button id="importWosBtn" title="导入 Web of Science 记录">导入 WoS</button>
        </div>
      </div>
    </section>

    <section>
      <div class="section-head">
        <h2>导入 Google Scholar</h2>
        <span class="status" id="scholarStatus"></span>
      </div>
      <div class="controls">
        <textarea id="scholarInput" class="compact" spellcheck="false" placeholder="在 Google Scholar 点“引用”-> BibTeX，复制粘贴到这里。也可粘贴多条 BibTeX。"></textarea>
        <div class="row">
          <label class="file-label" for="scholarFile" title="读取 BibTeX 文件">选择 BibTeX</label>
          <input id="scholarFile" type="file" accept=".bib,.txt">
          <button id="importScholarBtn" title="导入 Google Scholar BibTeX">导入 Scholar</button>
        </div>
      </div>
    </section>

    <section>
      <div class="section-head">
        <h2>可用搜索源</h2>
        <span class="status" id="sourceStatus"></span>
      </div>
      <div id="sourceList" class="controls">
        <div class="status">加载中</div>
      </div>
    </section>
  </div>

  <main>
    <section>
      <div class="section-head">
        <h2>单篇文章分析</h2>
        <span class="status" id="fileName"></span>
      </div>
      <div class="controls">
        <textarea id="textInput" spellcheck="false" placeholder="粘贴论文摘要、实验记录、PDF 转出的文本，或上传 txt/md/xml 文件。"></textarea>
        <div class="row">
          <label class="file-label" for="fileInput" title="读取文本文件">选择文件</label>
          <input id="fileInput" type="file" accept=".txt,.md,.xml,.tei,.csv,.json">
          <button class="primary" id="analyzeBtn" title="分析输入文本">分析</button>
          <button id="clearBtn" title="清空输入和结果">清空</button>
        </div>
        <div class="status" id="status"></div>
      </div>
    </section>

    <section>
      <div class="section-head">
        <h2>结果与对比</h2>
        <span class="status" id="confidence"></span>
      </div>
      <div id="results" class="empty">等待输入</div>
    </section>
  </main>

  <script>
    const textInput = document.querySelector("#textInput");
    const searchInput = document.querySelector("#searchInput");
    const wosInput = document.querySelector("#wosInput");
    const wosFile = document.querySelector("#wosFile");
    const scholarInput = document.querySelector("#scholarInput");
    const scholarFile = document.querySelector("#scholarFile");
    const fileInput = document.querySelector("#fileInput");
    const fileName = document.querySelector("#fileName");
    const statusEl = document.querySelector("#status");
    const resultsEl = document.querySelector("#results");
    const confidenceEl = document.querySelector("#confidence");
    const analyzeBtn = document.querySelector("#analyzeBtn");
    const searchBtn = document.querySelector("#searchBtn");
    const searchStatus = document.querySelector("#searchStatus");
    const wosStatus = document.querySelector("#wosStatus");
    const importWosBtn = document.querySelector("#importWosBtn");
    const scholarStatus = document.querySelector("#scholarStatus");
    const importScholarBtn = document.querySelector("#importScholarBtn");
    const sourceList = document.querySelector("#sourceList");
    const sourceStatus = document.querySelector("#sourceStatus");

    const demoText = `Direct observation of band structure in cobaltocene-doped SnSe2
DOI: 10.1234/example.2026.1

Angle-resolved photoemission spectroscopy (ARPES) measurements were performed at 20 K
with photon energy of 70 eV on beamline BL03U. Samples were grown by chemical vapor
transport and doped by cobaltocene. The band gap of 0.8 eV was observed.`;

    document.querySelector("#demoBtn").addEventListener("click", () => {
      textInput.value = demoText;
      fileName.textContent = "demo";
      statusEl.textContent = "";
    });

    document.querySelector("#snBtn").addEventListener("click", () => quickSearch("Sn"));
    document.querySelector("#seBtn").addEventListener("click", () => quickSearch("Se"));
    document.querySelector("#sBtn").addEventListener("click", () => quickSearch("S"));
    document.querySelector("#snse2Btn").addEventListener("click", () => quickSearch("SnSe2"));

    document.querySelector("#clearBtn").addEventListener("click", () => {
      textInput.value = "";
      fileInput.value = "";
      fileName.textContent = "";
      confidenceEl.textContent = "";
      resultsEl.className = "empty";
      resultsEl.textContent = "等待输入";
      statusEl.textContent = "";
      searchStatus.textContent = "";
      wosStatus.textContent = "";
      scholarStatus.textContent = "";
    });

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files[0];
      if (!file) return;
      fileName.textContent = file.name;
      textInput.value = await file.text();
    });

    analyzeBtn.addEventListener("click", analyze);
    searchBtn.addEventListener("click", searchCorpus);
    importWosBtn.addEventListener("click", importWos);
    importScholarBtn.addEventListener("click", importScholar);
    wosFile.addEventListener("change", async () => {
      const file = wosFile.files[0];
      if (!file) return;
      wosStatus.textContent = file.name;
      wosInput.value = await file.text();
    });
    scholarFile.addEventListener("change", async () => {
      const file = scholarFile.files[0];
      if (!file) return;
      scholarStatus.textContent = file.name;
      scholarInput.value = await file.text();
    });
    searchInput.addEventListener("keydown", event => {
      if (event.key === "Enter") searchCorpus();
    });
    loadSources();

    async function loadSources() {
      try {
        const response = await fetch("/api/sources");
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "加载失败");
        renderSources(data.sources || []);
      } catch (error) {
        sourceStatus.textContent = error.message;
        sourceList.innerHTML = `<div class="status">${escapeHtml(error.message)}</div>`;
      }
    }

    function renderSources(sources) {
      sourceStatus.textContent = `${sources.length} 个来源`;
      sourceList.innerHTML = `<div class="source-grid">${sources.map(sourceCard).join("")}</div>`;
    }

    function sourceCard(source) {
      const statusTone = source.can_integrate_now ? "good" : "warn";
      const statusText = source.can_integrate_now ? "可接入/已支持" : "需授权或后续接入";
      return `
        <div class="source-card">
          <div class="source-title">
            <strong>${escapeHtml(source.name)}</strong>
            <span class="chip ${statusTone}">${escapeHtml(statusText)}</span>
          </div>
          <div class="source-meta">${escapeHtml(source.category)} · ${escapeHtml(source.access)} · ${escapeHtml(source.trust_level)}</div>
          ${chips(source.best_for || [], "trusted")}
          <ul>
            <li>${escapeHtml(source.notes || "")}</li>
            <li>${escapeHtml(source.limits || "")}</li>
          </ul>
          <a class="chip trusted link" href="${escapeAttr(source.official_url || "")}" target="_blank" rel="noreferrer">official source</a>
        </div>
      `;
    }

    function quickSearch(query) {
      searchInput.value = query;
      searchCorpus();
    }

    async function searchCorpus() {
      const query = searchInput.value.trim();
      if (!query) {
        searchStatus.textContent = "请输入材料或元素";
        return;
      }
      searchBtn.disabled = true;
      searchStatus.textContent = "搜索中";
      try {
        const response = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "搜索失败");
        renderSearch(data);
        searchStatus.textContent = `${data.total_articles} 篇`;
      } catch (error) {
        searchStatus.textContent = error.message;
      } finally {
        searchBtn.disabled = false;
      }
    }

    async function importWos() {
      const text = wosInput.value.trim();
      if (!text) {
        wosStatus.textContent = "请粘贴或选择 WoS 导出文件";
        return;
      }
      importWosBtn.disabled = true;
      wosStatus.textContent = "导入中";
      try {
        const response = await fetch("/api/import-wos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, source_file: wosFile.files[0]?.name || "wos-export" })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "导入失败");
        wosStatus.textContent = `已导入 ${data.imported} 条`;
        renderImport(data);
      } catch (error) {
        wosStatus.textContent = error.message;
      } finally {
        importWosBtn.disabled = false;
      }
    }

    async function importScholar() {
      const text = scholarInput.value.trim();
      if (!text) {
        scholarStatus.textContent = "请粘贴 Scholar BibTeX";
        return;
      }
      importScholarBtn.disabled = true;
      scholarStatus.textContent = "导入中";
      try {
        const response = await fetch("/api/import-scholar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, source_file: scholarFile.files[0]?.name || "google-scholar.bib" })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "导入失败");
        scholarStatus.textContent = `已导入 ${data.imported} 条`;
        renderImport(data, "Google Scholar BibTeX");
      } catch (error) {
        scholarStatus.textContent = error.message;
      } finally {
        importScholarBtn.disabled = false;
      }
    }

    function renderImport(data, sourceName = "Web of Science") {
      confidenceEl.textContent = `${sourceName} ${data.imported} 条`;
      resultsEl.className = "results";
      resultsEl.innerHTML = `
        <div class="summary">
          ${metric("导入来源", sourceName)}
          ${metric("记录数", String(data.imported || 0))}
          ${metric("状态", "metadata only")}
        </div>
        <div class="block"><h3>导入记录预览</h3>${articleTable(data.articles || [])}</div>
        <div class="block"><h3>可信度说明</h3>${list([
          "导入记录代表题录元数据来源，不等于全文实验指标已核验。",
          "温度、光子能量、band gap 等实验指标如果只来自摘要/关键词，仍需全文核验。",
          "导入后可在上方搜索材料或元素，结果会合并这些记录。"
        ])}</div>
      `;
    }

    async function analyze() {
      const text = textInput.value.trim();
      if (!text) {
        statusEl.textContent = "请输入内容";
        return;
      }
      analyzeBtn.disabled = true;
      statusEl.textContent = "分析中";
      try {
        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, source_file: fileName.textContent || "browser-input" })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "分析失败");
        render(data);
        statusEl.textContent = "完成";
      } catch (error) {
        statusEl.textContent = error.message;
      } finally {
        analyzeBtn.disabled = false;
      }
    }

    function render(data) {
      const confidence = data.confidence || { score: 0, reasons: [] };
      confidenceEl.textContent = `置信度 ${confidence.score || 0}%`;
      resultsEl.className = "results";
      resultsEl.innerHTML = `
        <div class="summary">
          ${metric("材料", join(data.materials) || "未识别")}
          ${metric("技术", join(data.techniques) || "未识别")}
          ${metric("掺杂", join(data.dopants) || "未识别")}
        </div>
        ${block("文章信息", chips([data.title, data.doi && `DOI ${data.doi}`, data.arxiv_id && `arXiv ${data.arxiv_id}`]))}
        ${propertiesBlock(data.material_properties || [])}
        ${block("实验条件", chips([
          ...prefix(data.photon_energies_eV, "hν ", " eV"),
          ...prefix(data.temperatures_K, "", " K"),
          ...(data.beamline_snippets || []),
          ...(data.analyzer_snippets || [])
        ], "good"))}
        ${block("物性参数", chips([
          ...prefix(data.band_gaps, "gap "),
          ...prefix(data.fermi_velocities, "vF ")
        ], "good"))}
        ${block("样品与制备", list(data.preparation_snippets || []))}
        ${block("证据与备注", list([...(confidence.reasons || []), ...(data.notes || [])]))}
        <div class="block"><h3>JSON</h3><pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre></div>
      `;
    }

    function renderSearch(data) {
      confidenceEl.textContent = `${data.total_articles} 篇文章`;
      resultsEl.className = "results";
      const candidates = data.candidate_materials || [];
      const articles = data.articles || [];
      resultsEl.innerHTML = `
        <div class="summary">
          ${metric("搜索", data.query || "")}
          ${metric("候选材料", String(candidates.length))}
          ${metric("文章记录", String(data.total_articles || 0))}
        </div>
        ${elementBlock(data.trusted_elements || [], data.data_note)}
        ${candidateBlock(candidates)}
        ${comparisonTable(candidates)}
        ${articleTable(articles)}
        <div class="block"><h3>判断逻辑</h3>${list([
          "元素卡片来自可信元素网站，适合作为判断材料组成的基础数据。",
          "文献线索只用于提示可能相关的文章；具体温度、光子能量和 band gap 必须从全文核验后才能入库。",
          "材料排名按材料名、元素、掺杂、技术、关键词和证据命中加权。",
          "没有核验过的指标不会用演示值填充，页面会显示为空。"
        ])}</div>
      `;
    }

    function elementBlock(elements, note) {
      if (!elements.length) return block("可信元素数据", chips(["没有匹配到本地可信元素库"], "warn"));
      const cards = elements.map(item => `
        <div class="element-card">
          <div class="element-symbol">${escapeHtml(item.symbol)}</div>
          <div class="element-name">${escapeHtml(item.name)} / ${escapeHtml(item.chinese_name || "")}</div>
          <div class="facts">
            ${fact("原子序数", item.atomic_number)}
            ${fact("相对原子质量", item.relative_atomic_mass)}
            ${fact("族 / 周期", `${item.group} / ${item.period}`)}
            ${fact("20°C 状态", item.state_at_20c)}
            ${fact("熔点", `${item.melting_point_c} °C`)}
            ${fact("沸点", `${item.boiling_point_c} °C`)}
            ${fact("密度", `${item.density_g_cm3} g/cm³`)}
            ${fact("电负性", item.electronegativity_pauling)}
          </div>
          ${list(item.relevance || [])}
          <div class="chips">
            <span class="chip trusted">RSC verified element data</span>
            <a class="chip trusted link" href="${escapeAttr(item.source?.url || "")}" target="_blank" rel="noreferrer">${escapeHtml(item.source?.name || "source")}</a>
          </div>
        </div>
      `).join("");
      return `<div class="block"><h3>可信元素数据</h3>${chips([note], "note")}<div class="element-grid">${cards}</div></div>`;
    }

    function fact(label, value) {
      return `<div class="fact"><span>${escapeHtml(label)}</span>${escapeHtml(value ?? "-")}</div>`;
    }

    function candidateBlock(candidates) {
      if (!candidates.length) return block("候选材料", chips(["没有匹配到文章数据"], "warn"));
      return `<div class="block"><h3>候选材料</h3><div class="chips">${
        candidates.map(item => `<span class="chip good">${escapeHtml(item.material)} · ${item.article_count} 篇 · score ${item.score}</span>`).join("")
      }</div></div>`;
    }

    function comparisonTable(candidates) {
      if (!candidates.length) return "";
      const rows = candidates.map(item => `
        <tr>
          <td><strong>${escapeHtml(item.material)}</strong></td>
          <td>${escapeHtml(String(item.article_count))}</td>
          <td>${rangeText(item.temperatures_K, "K")}</td>
          <td>${rangeText(item.photon_energies_eV, "eV")}</td>
          <td>${rangeText(item.band_gaps_eV, "eV")}</td>
          <td>${escapeHtml((item.dopants || []).join("、") || "-")}</td>
          <td>${escapeHtml((item.properties || []).join("、") || "-")}</td>
        </tr>
      `).join("");
      return `<div class="block"><h3>指标对比</h3><div class="table-wrap"><table>
        <thead><tr><th>候选物质</th><th>文章数</th><th>温度</th><th>光子能量</th><th>band gap</th><th>掺杂</th><th>文章特征</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div></div>`;
    }

    function articleTable(articles) {
      if (!articles.length) return "";
      const rows = articles.map(item => `
        <tr>
          <td>${escapeHtml((item.materials || []).join("、"))}</td>
          <td>${item.url ? `<a class="link" href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.title)}</a>` : escapeHtml(item.title)}</td>
          <td>${escapeHtml(item.year || "-")}</td>
          <td>${escapeHtml((item.techniques || []).join("、"))}</td>
          <td>${escapeHtml(metricText(item.temperature_K, "K"))}</td>
          <td>${escapeHtml(metricText(item.photon_energy_eV, "eV"))}</td>
          <td>${escapeHtml(metricText(item.band_gap_eV, "eV"))}</td>
          <td>${escapeHtml((item.evidence || []).join("；"))}<br><span class="chip note">${escapeHtml(statusText(item.verification_status))}</span></td>
        </tr>
      `).join("");
      return `<div class="block"><h3>相关文章数据</h3><div class="table-wrap"><table>
        <thead><tr><th>材料</th><th>文章</th><th>年份</th><th>技术</th><th>温度</th><th>光子能量</th><th>band gap</th><th>证据</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div></div>`;
    }

    function propertiesBlock(properties) {
      if (!properties.length) return block("材料特性", chips(["未匹配到已配置材料"], "warn"));
      return properties.map(item => `
        <div class="block">
          <h3>${escapeHtml(item.name)} · ${escapeHtml(item.family || "")}</h3>
          ${list([...(item.traits || []), ...(item.dopant_notes || [])])}
          <div class="chips">${(item.watch || []).map(v => `<span class="chip good">${escapeHtml(v)}</span>`).join("")}</div>
        </div>
      `).join("");
    }

    function metric(label, value) {
      return `<div class="metric"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div></div>`;
    }

    function block(title, content) {
      return `<div class="block"><h3>${escapeHtml(title)}</h3>${content || `<span class="chip warn">暂无</span>`}</div>`;
    }

    function chips(values, tone = "") {
      const clean = values.filter(Boolean);
      if (!clean.length) return "";
      return `<div class="chips">${clean.map(v => `<span class="chip ${tone}">${escapeHtml(v)}</span>`).join("")}</div>`;
    }

    function list(values) {
      const clean = values.filter(Boolean);
      if (!clean.length) return "";
      return `<ul>${clean.map(v => `<li>${escapeHtml(v)}</li>`).join("")}</ul>`;
    }

    function prefix(values, before = "", after = "") {
      return (values || []).map(v => `${before}${v}${after}`);
    }

    function join(values) {
      return (values || []).join("、");
    }

    function rangeText(value, unit) {
      if (!value || !value.count) return "-";
      if (value.min === value.max) return `${value.min} ${unit}`;
      return `${value.min}-${value.max} ${unit}；avg ${value.avg}`;
    }

    function metricText(value, unit) {
      return typeof value === "number" ? `${value} ${unit}` : "-";
    }

    function statusText(status) {
      if (status === "lead_needs_fulltext_check") return "文献线索，待全文核验";
      if (status === "wos_metadata_only") return "Web of Science 元数据，待全文核验";
      if (status === "google_scholar_bibtex_metadata") return "Google Scholar BibTeX 元数据，待全文核验";
      return status || "未标注";
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
      }[char]));
    }

    function escapeAttr(value) {
      return escapeHtml(value).replace(/`/g, "&#096;");
    }
  </script>
</body>
</html>
"""


if __name__ == "__main__":
    main()
