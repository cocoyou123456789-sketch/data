(() => {
  "use strict";

  const DB_NAME = "arpes-band-ai-v1";
  const DB_VERSION = 1;
  const SAMPLE_STORE = "samples";
  const META_STORE = "meta";
  const FEATURE_WIDTH = 24;
  const FEATURE_HEIGHT = 18;
  const MAX_EVALUATION_SAMPLES = 80;
  const adapters = new Map();

  const uid = () => globalThis.crypto?.randomUUID?.() ||
    `sample-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error || new Error("IndexedDB unavailable"));
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(SAMPLE_STORE)) {
          const samples = db.createObjectStore(SAMPLE_STORE, { keyPath: "id" });
          samples.createIndex("material", "material", { unique: false });
          samples.createIndex("createdAt", "createdAt", { unique: false });
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
    });
  }

  async function withStore(storeName, mode, callback) {
    const db = await openDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        let result;
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error || new Error("Database transaction failed"));
        transaction.onabort = () => reject(transaction.error || new Error("Database transaction aborted"));
        try {
          result = callback(store, transaction);
        } catch (error) {
          transaction.abort();
          reject(error);
        }
      });
    } finally {
      db.close();
    }
  }

  const requestResult = request => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Database request failed"));
  });

  async function getAllSamples() {
    return withStore(SAMPLE_STORE, "readonly", store => requestResult(store.getAll()));
  }

  async function putSample(sample) {
    return withStore(SAMPLE_STORE, "readwrite", store => requestResult(store.put(sample)));
  }

  async function putSamples(samples) {
    if (!samples.length) return 0;
    await withStore(SAMPLE_STORE, "readwrite", store => {
      samples.forEach(sample => store.put(sample));
      return samples.length;
    });
    return samples.length;
  }

  async function deleteSample(id) {
    return withStore(SAMPLE_STORE, "readwrite", store => requestResult(store.delete(id)));
  }

  async function getMeta(key, fallback = null) {
    const value = await withStore(META_STORE, "readonly", store => requestResult(store.get(key)));
    return value?.value ?? fallback;
  }

  async function setMeta(key, value) {
    return withStore(META_STORE, "readwrite", store => requestResult(store.put({ key, value })));
  }

  async function incrementModelVersion() {
    const next = Number(await getMeta("modelVersion", 0)) + 1;
    await setMeta("modelVersion", next);
    return next;
  }

  function roundFeature(value) {
    return Number.isFinite(value) ? Math.round(value * 10000) / 10000 : 0;
  }

  function canvasCrop(sourceCanvas, crop) {
    if (!crop) return { x: 0, y: 0, w: sourceCanvas.width, h: sourceCanvas.height };
    const x = Math.max(0, Math.min(sourceCanvas.width - 1, Number(crop.x) || 0));
    const y = Math.max(0, Math.min(sourceCanvas.height - 1, Number(crop.y) || 0));
    const w = Math.max(1, Math.min(sourceCanvas.width - x, Number(crop.w) || sourceCanvas.width));
    const h = Math.max(1, Math.min(sourceCanvas.height - y, Number(crop.h) || sourceCanvas.height));
    return { x, y, w, h };
  }

  function extractCanvasFeature(sourceCanvas, crop = null) {
    const canvas = document.createElement("canvas");
    canvas.width = FEATURE_WIDTH;
    canvas.height = FEATURE_HEIGHT;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    const source = canvasCrop(sourceCanvas, crop);
    context.drawImage(sourceCanvas, source.x, source.y, source.w, source.h, 0, 0, FEATURE_WIDTH, FEATURE_HEIGHT);
    const pixels = context.getImageData(0, 0, FEATURE_WIDTH, FEATURE_HEIGHT).data;
    const luminance = [];
    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3] / 255;
      const value = (0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2]) / 255;
      luminance.push(value * alpha);
    }
    const mean = luminance.reduce((sum, value) => sum + value, 0) / Math.max(1, luminance.length);
    const variance = luminance.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, luminance.length);
    const deviation = Math.sqrt(variance) || 1;
    const normalized = luminance.map(value => (value - mean) / deviation);
    const edges = normalized.map((value, index) => {
      const x = index % FEATURE_WIDTH;
      const y = Math.floor(index / FEATURE_WIDTH);
      const right = x + 1 < FEATURE_WIDTH ? normalized[index + 1] : value;
      const below = y + 1 < FEATURE_HEIGHT ? normalized[index + FEATURE_WIDTH] : value;
      return Math.hypot(right - value, below - value);
    });
    const xProfile = Array.from({ length: FEATURE_WIDTH }, (_, x) => {
      let sum = 0;
      for (let y = 0; y < FEATURE_HEIGHT; y += 1) sum += normalized[y * FEATURE_WIDTH + x];
      return sum / FEATURE_HEIGHT;
    });
    const yProfile = Array.from({ length: FEATURE_HEIGHT }, (_, y) => {
      let sum = 0;
      for (let x = 0; x < FEATURE_WIDTH; x += 1) sum += normalized[y * FEATURE_WIDTH + x];
      return sum / FEATURE_WIDTH;
    });
    return [...normalized, ...edges, ...xProfile, ...yProfile].map(roundFeature);
  }

  function makeThumbnail(sourceCanvas) {
    const scale = Math.min(1, 260 / sourceCanvas.width, 170 / sourceCanvas.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sourceCanvas.width * scale));
    canvas.height = Math.max(1, Math.round(sourceCanvas.height * scale));
    const context = canvas.getContext("2d");
    context.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.72);
  }

  function cosineSimilarity(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return -1;
    let dot = 0;
    let leftNorm = 0;
    let rightNorm = 0;
    for (let index = 0; index < left.length; index += 1) {
      const a = Number(left[index]) || 0;
      const b = Number(right[index]) || 0;
      dot += a * b;
      leftNorm += a * a;
      rightNorm += b * b;
    }
    if (!leftNorm || !rightNorm) return -1;
    return dot / Math.sqrt(leftNorm * rightNorm);
  }

  function predictLocal(features, samples, options = {}) {
    const usable = samples.filter(sample =>
      sample.id !== options.excludeId &&
      sample.material &&
      Array.isArray(sample.features) &&
      sample.features.length === features.length
    );
    if (!usable.length) return [];
    const neighbours = usable
      .map(sample => ({ sample, similarity: cosineSimilarity(features, sample.features) }))
      .filter(item => Number.isFinite(item.similarity))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, Math.min(options.k || 9, usable.length));
    const groups = new Map();
    neighbours.forEach((item, rank) => {
      const label = String(item.sample.material).trim();
      const similarity = Math.max(0, (item.similarity + 1) / 2);
      const weight = Math.pow(similarity, 6) / Math.sqrt(rank + 1);
      const current = groups.get(label) || { material: label, score: 0, support: 0, bestSimilarity: -1, neighbours: [] };
      current.score += weight;
      current.support += 1;
      current.bestSimilarity = Math.max(current.bestSimilarity, item.similarity);
      current.neighbours.push({ id: item.sample.id, sourceName: item.sample.sourceName, similarity: item.similarity });
      groups.set(label, current);
    });
    const total = [...groups.values()].reduce((sum, group) => sum + group.score, 0) || 1;
    return [...groups.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(group => ({
        ...group,
        confidence: group.score / total,
        evidence: `${group.support} 个近邻样本，最高相似度 ${Math.max(0, group.bestSimilarity * 100).toFixed(1)}%`
      }));
  }

  adapters.set("local-knn", {
    label: "本地增量基线",
    async predict({ features, samples, excludeId }) {
      return predictLocal(features, samples, { excludeId });
    },
    async train() {
      return { mode: "incremental" };
    }
  });

  function styleText() {
    return `
      :host { display: block; color: #e7eef7; font-family: inherit; }
      * { box-sizing: border-box; }
      .workbench { border: 1px solid #243648; background: #111a24; border-radius: 8px; overflow: hidden; }
      .header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; padding: 20px 22px; border-bottom: 1px solid #243648; }
      .header h2 { margin: 0; font-size: 20px; letter-spacing: 0; }
      .header p { margin: 6px 0 0; color: #93a6b9; font-size: 13px; }
      .version { flex: 0 0 auto; color: #86d8cf; background: #102b2c; border: 1px solid #20575a; padding: 7px 10px; border-radius: 5px; font-size: 12px; }
      .tabs { display: flex; gap: 0; border-bottom: 1px solid #243648; padding: 0 22px; }
      .tab { appearance: none; border: 0; border-bottom: 2px solid transparent; background: transparent; color: #93a6b9; padding: 13px 16px 11px; font: inherit; font-weight: 700; cursor: pointer; }
      .tab[aria-selected="true"] { color: #37c7bb; border-bottom-color: #37c7bb; }
      .page { display: none; padding: 20px 22px 22px; }
      .page.active { display: block; }
      .metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 16px; }
      .metric { min-width: 0; background: #16222f; border: 1px solid #26394b; border-radius: 6px; padding: 12px 14px; }
      .metric span { display: block; color: #8296aa; font-size: 12px; }
      .metric strong { display: block; margin-top: 4px; color: #f4f8fb; font-size: 22px; letter-spacing: 0; }
      .workspace { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(320px, .95fr); gap: 14px; align-items: start; }
      .panel { min-width: 0; border: 1px solid #26394b; background: #141f2a; border-radius: 6px; padding: 16px; }
      .panel h3 { margin: 0 0 13px; font-size: 15px; letter-spacing: 0; }
      .source { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 14px; align-items: center; margin-bottom: 14px; }
      .preview { aspect-ratio: 3 / 2; width: 100%; background: #0a1118; border: 1px solid #2b4052; border-radius: 5px; display: grid; place-items: center; overflow: hidden; color: #708397; font-size: 12px; }
      .preview img { width: 100%; height: 100%; object-fit: contain; }
      .source-info { min-width: 0; }
      .source-info strong { display: block; overflow-wrap: anywhere; }
      .source-info small { display: block; margin-top: 5px; color: #879aad; line-height: 1.45; }
      .row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      label { display: block; color: #a9bac9; font-size: 12px; margin-bottom: 10px; }
      input, select, textarea { width: 100%; margin-top: 5px; border: 1px solid #30465a; border-radius: 5px; background: #0f1822; color: #eef4f8; font: inherit; font-size: 13px; padding: 9px 10px; outline: none; }
      input:focus, select:focus, textarea:focus { border-color: #35bfb5; box-shadow: 0 0 0 2px rgba(53,191,181,.15); }
      textarea { min-height: 70px; resize: vertical; }
      .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
      button.command, .file-command { appearance: none; display: inline-flex; align-items: center; justify-content: center; min-height: 36px; border: 1px solid #30465a; border-radius: 5px; background: #182635; color: #e7eef7; padding: 8px 12px; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
      button.command.primary { border-color: #168e85; background: #147f78; color: #fff; }
      button.command:hover, .file-command:hover { border-color: #42cfc3; }
      button.command:disabled { cursor: not-allowed; opacity: .45; }
      .file-command input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
      .status { min-height: 20px; margin-top: 11px; color: #8fa3b5; font-size: 12px; line-height: 1.5; }
      .status.error { color: #ff9a96; }
      .status.success { color: #76d9b5; }
      .predictions { display: grid; gap: 9px; min-height: 142px; }
      .empty { display: grid; place-items: center; min-height: 142px; border: 1px dashed #30465a; border-radius: 5px; color: #72879a; text-align: center; padding: 20px; }
      .prediction { display: grid; grid-template-columns: 34px minmax(0, 1fr) 70px; gap: 10px; align-items: center; border-bottom: 1px solid #26394b; padding: 10px 0; }
      .prediction:last-child { border-bottom: 0; }
      .rank { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: #203449; color: #71ddd4; font-weight: 800; }
      .prediction strong, .prediction small { display: block; overflow-wrap: anywhere; }
      .prediction small { color: #8398aa; margin-top: 3px; }
      .confidence { text-align: right; font-variant-numeric: tabular-nums; color: #f0c971; font-weight: 800; }
      .model-note { margin-top: 12px; padding-top: 12px; border-top: 1px solid #26394b; color: #8498aa; font-size: 12px; line-height: 1.5; }
      .library-tools { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
      .prototype-title { margin: 18px 0 10px; font-size: 14px; }
      .prototype-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; margin-bottom: 18px; }
      .prototype { min-width: 0; border: 1px solid #26394b; border-radius: 6px; background: #111a24; overflow: hidden; }
      .prototype-media { aspect-ratio: 3 / 2; background: #080f16; display: grid; place-items: center; color: #6f8497; font-size: 11px; }
      .prototype-media img { width: 100%; height: 100%; object-fit: cover; }
      .prototype-copy { padding: 9px 10px; }
      .prototype-copy strong, .prototype-copy small { display: block; overflow-wrap: anywhere; }
      .prototype-copy small { margin-top: 3px; color: #8195a7; }
      .samples { width: 100%; border-collapse: collapse; font-size: 13px; }
      .samples th, .samples td { border-bottom: 1px solid #26394b; padding: 10px 8px; text-align: left; vertical-align: middle; }
      .samples th { color: #8498aa; font-weight: 700; }
      .samples td { overflow-wrap: anywhere; }
      .samples button { border: 0; background: transparent; color: #e8938f; cursor: pointer; font: inherit; }
      .storage-note { margin: 12px 0 0; color: #8498aa; font-size: 12px; }
      @media (max-width: 900px) {
        .workspace { grid-template-columns: 1fr; }
        .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (max-width: 560px) {
        .header { padding: 16px; }
        .tabs { padding: 0 8px; overflow-x: auto; }
        .page { padding: 14px; }
        .row, .source { grid-template-columns: 1fr; }
        .metrics { grid-template-columns: 1fr 1fr; }
        .samples th:nth-child(3), .samples td:nth-child(3) { display: none; }
      }
    `;
  }

  class ArpesBandAi extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this.current = null;
      this.predictions = [];
      this.samples = [];
      this.modelVersion = 0;
      this.activeTab = "label";
      this.render();
    }

    connectedCallback() {
      this.bindEvents();
      this.refresh().catch(error => this.setStatus(error.message, "error"));
      document.addEventListener("arpes:hdf5-preview", this.handlePreviewEvent);
    }

    disconnectedCallback() {
      document.removeEventListener("arpes:hdf5-preview", this.handlePreviewEvent);
    }

    handlePreviewEvent = event => {
      const detail = event.detail || {};
      if (detail.canvas instanceof HTMLCanvasElement) {
        this.useCanvas(detail.canvas, detail.name || "HDF5 preview", detail.kind || "unknown", detail.crop || null);
      }
    };

    render() {
      this.shadowRoot.innerHTML = `
        <style>${styleText()}</style>
        <section class="workbench" aria-labelledby="bandAiTitle">
          <header class="header">
            <div>
              <h2 id="bandAiTitle">能带识别训练台</h2>
              <p>标注实验谱图、识别候选材料，并持续积累可训练数据。</p>
            </div>
            <div class="version" id="versionBadge">本地模型 v0</div>
          </header>
          <div class="tabs" role="tablist" aria-label="能带识别训练台视图">
            <button class="tab" type="button" role="tab" aria-selected="true" data-tab="label">标注与识别</button>
            <button class="tab" type="button" role="tab" aria-selected="false" data-tab="library">训练数据</button>
          </div>
          <div class="page active" data-page="label">
            <div class="metrics">
              <div class="metric"><span>已标注谱图</span><strong id="sampleCount">0</strong></div>
              <div class="metric"><span>材料类别</span><strong id="materialCount">0</strong></div>
              <div class="metric"><span>留一验证</span><strong id="accuracy">待评估</strong></div>
              <div class="metric"><span>当前特征</span><strong id="featureState">未载入</strong></div>
            </div>
            <div class="workspace">
              <section class="panel">
                <h3>数据与正确答案</h3>
                <div class="source">
                  <div class="preview" id="preview"><span>未选择谱图</span></div>
                  <div class="source-info">
                    <strong id="sourceName">尚未载入数据</strong>
                    <small id="sourceMeta">可读取上方当前 HDF5/ZIP 预览，也可直接选择谱图图片。</small>
                    <div class="actions">
                      <button class="command primary" type="button" id="useCurrent">使用当前谱图</button>
                      <label class="file-command">选择谱图图片<input id="imageInput" type="file" accept="image/png,image/jpeg,image/webp"></label>
                    </div>
                  </div>
                </div>
                <div class="row">
                  <label>正确材料名称 *<input id="materialInput" autocomplete="off" placeholder="例如：Bi2Sr2CaCu2O8+x"></label>
                  <label>化学式<input id="formulaInput" autocomplete="off" placeholder="例如：Bi-2212"></label>
                </div>
                <div class="row">
                  <label>谱图类型<select id="kindInput"><option value="cut">CUT（二维切面）</option><option value="map">MAP（三维扫描）</option><option value="fermi">费米面</option><option value="other">其他</option></select></label>
                  <label>材料家族<input id="familyInput" autocomplete="off" placeholder="例如：铜氧化物超导体"></label>
                </div>
                <div class="row">
                  <label>温度（K）<input id="temperatureInput" type="number" step="any" inputmode="decimal"></label>
                  <label>光子能量（eV）<input id="photonInput" type="number" step="any" inputmode="decimal"></label>
                </div>
                <label>实验条件与备注<textarea id="notesInput" placeholder="偏振、样品方向、能量范围、仪器条件等"></textarea></label>
                <div class="actions">
                  <button class="command primary" type="button" id="saveLabel">保存正确答案并学习</button>
                  <button class="command" type="button" id="predict">识别当前谱图</button>
                  <button class="command" type="button" id="clearCurrent">清空当前输入</button>
                </div>
                <div class="status" id="status" role="status" aria-live="polite"></div>
              </section>
              <section class="panel">
                <h3>候选材料</h3>
                <label>识别器<select id="adapterSelect"></select></label>
                <div class="predictions" id="predictions"><div class="empty">载入谱图后运行识别</div></div>
                <div class="actions" id="correctionActions" hidden>
                  <button class="command primary" type="button" id="confirmPrediction">确认第一候选并学习</button>
                  <button class="command" type="button" id="correctPrediction">按左侧答案纠正并学习</button>
                </div>
                <div class="model-note">当前为浏览器内增量相似度基线，用于建立可验证的数据闭环；置信度是训练集内的相对分数，不等同于物理结论。后续服务器模型可通过适配器接入。</div>
              </section>
            </div>
          </div>
          <div class="page" data-page="library">
            <div class="library-tools">
              <label class="file-command">批量导入 JSONL / JSON<input id="datasetInput" type="file" accept=".jsonl,.ndjson,.json,application/json,application/x-ndjson"></label>
              <button class="command" type="button" id="exportDataset">导出 JSONL</button>
            </div>
            <h3 class="prototype-title">材料原型图</h3>
            <div class="prototype-gallery" id="prototypeGallery"></div>
            <div id="sampleTable"></div>
            <p class="storage-note">样本保存在当前浏览器的 IndexedDB 中。导出 JSONL 可用于备份、跨设备迁移或服务器端训练。</p>
          </div>
        </section>
      `;
      this.populateAdapters();
    }

    bindEvents() {
      this.shadowRoot.querySelectorAll("[data-tab]").forEach(button => {
        button.addEventListener("click", () => this.switchTab(button.dataset.tab));
      });
      this.$("useCurrent").addEventListener("click", () => this.captureCurrentPreview());
      this.$("imageInput").addEventListener("change", event => this.loadImageFile(event.target.files?.[0]));
      this.$("saveLabel").addEventListener("click", () => this.saveCurrentLabel());
      this.$("predict").addEventListener("click", () => this.predictCurrent());
      this.$("clearCurrent").addEventListener("click", () => this.clearCurrent());
      this.$("confirmPrediction").addEventListener("click", () => this.confirmPrediction());
      this.$("correctPrediction").addEventListener("click", () => this.saveCurrentLabel());
      this.$("datasetInput").addEventListener("change", event => this.importDataset(event.target.files?.[0]));
      this.$("exportDataset").addEventListener("click", () => this.exportDataset());
      this.$("sampleTable").addEventListener("click", event => {
        const button = event.target.closest("button[data-delete]");
        if (button) this.removeSample(button.dataset.delete);
      });
    }

    $(id) {
      return this.shadowRoot.getElementById(id);
    }

    switchTab(name) {
      this.activeTab = name;
      this.shadowRoot.querySelectorAll("[data-tab]").forEach(button => {
        button.setAttribute("aria-selected", String(button.dataset.tab === name));
      });
      this.shadowRoot.querySelectorAll("[data-page]").forEach(page => {
        page.classList.toggle("active", page.dataset.page === name);
      });
    }

    populateAdapters() {
      const select = this.$("adapterSelect");
      if (!select) return;
      const selected = select.value;
      select.replaceChildren();
      adapters.forEach((adapter, id) => {
        const option = document.createElement("option");
        option.value = id;
        option.textContent = adapter.label || id;
        select.append(option);
      });
      if (adapters.has(selected)) select.value = selected;
    }

    async refresh() {
      this.samples = await getAllSamples();
      this.modelVersion = Number(await getMeta("modelVersion", 0));
      const materials = new Set(this.samples.map(sample => sample.material).filter(Boolean));
      this.$("sampleCount").textContent = String(this.samples.length);
      this.$("materialCount").textContent = String(materials.size);
      this.$("versionBadge").textContent = `本地模型 v${this.modelVersion}`;
      this.$("featureState").textContent = this.current ? "已提取" : "未载入";
      this.$("accuracy").textContent = this.evaluateModel();
      this.renderPrototypeGallery();
      this.renderSampleTable();
    }

    evaluateModel() {
      const materials = new Set(this.samples.map(sample => sample.material).filter(Boolean));
      if (this.samples.length < 6 || materials.size < 2) return "待评估";
      const candidates = this.samples.slice(-MAX_EVALUATION_SAMPLES);
      let correct = 0;
      let evaluated = 0;
      candidates.forEach(sample => {
        const result = predictLocal(sample.features, this.samples, { excludeId: sample.id, k: 5 });
        if (!result.length) return;
        evaluated += 1;
        if (result[0].material === sample.material) correct += 1;
      });
      return evaluated ? `${Math.round(correct / evaluated * 100)}%` : "待评估";
    }

    findPreviewCanvas() {
      const direct = document.getElementById("hdf5PreviewCanvas");
      if (direct instanceof HTMLCanvasElement && direct.width > 20 && direct.height > 20) return direct;
      return [...document.querySelectorAll("canvas")].find(canvas =>
        canvas.width > 200 && canvas.height > 120 &&
        (canvas.closest("#section-hdf5") || canvas.dataset.arpesPreview !== undefined)
      ) || null;
    }

    captureCurrentPreview() {
      try {
        const canvas = this.findPreviewCanvas();
        if (!canvas) throw new Error("上方还没有可读取的 HDF5/ZIP 谱图，请先完成数据导入和预览。 ");
        const state = canvas.__hdf5PreviewState || {};
        if (!state.sample && !state.staticPreview && !canvas.dataset.arpesPreview) {
          throw new Error("当前预览还是空的，请先在数据管理页载入一个 HDF5、ZIP、PXT 或原始 MAP 数据集。 ");
        }
        const datasetText = state.filename || state.plan?.name || document.querySelector("#hdf5DatasetName, #hdf5PreviewTitle, [data-hdf5-dataset]")?.textContent?.trim();
        const descriptor = `${state.filename || ""} ${state.plan?.name || ""} ${state.plan?.fixedLabel || ""}`.toLowerCase();
        const dimensions = Array.isArray(state.plan?.shape) ? state.plan.shape.length : 0;
        const kind = descriptor.includes("map") || dimensions >= 3
          ? "map"
          : descriptor.includes("cut") || dimensions === 2
            ? "cut"
            : "unknown";
        const crop = state.layout?.erlabStyle
          ? state.layout.mainRect
          : state.layout?.margin
            ? { x: state.layout.margin.left, y: state.layout.margin.top, w: state.layout.plotW, h: state.layout.plotH }
            : state.staticPreview?.rect || null;
        this.useCanvas(canvas, datasetText || "当前 HDF5/ZIP 预览", kind, crop, {
          shape: state.plan?.shape || null,
          axes: [state.plan?.xLabel, state.plan?.yLabel, state.plan?.fixedLabel].filter(Boolean)
        });
        this.setStatus("已提取当前谱图特征，可以填写正确答案或运行识别。", "success");
      } catch (error) {
        this.setStatus(error.message, "error");
      }
    }

    useCanvas(canvas, name, kind = "unknown", crop = null, metadata = {}) {
      const features = extractCanvasFeature(canvas, crop);
      const thumbnail = makeThumbnail(canvas);
      this.current = { features, thumbnail, sourceName: name, kind, metadata, capturedAt: new Date().toISOString() };
      this.$("sourceName").textContent = name;
      const shapeText = Array.isArray(metadata.shape) ? ` · ${metadata.shape.join("×")}` : "";
      this.$("sourceMeta").textContent = `${features.length} 维标准化主图特征 · ${kind.toUpperCase()}${shapeText}`;
      const image = document.createElement("img");
      image.alt = `${name} 谱图缩略图`;
      image.src = thumbnail;
      this.$("preview").replaceChildren(image);
      if (["cut", "map", "fermi", "other"].includes(kind)) this.$("kindInput").value = kind;
      this.predictions = [];
      this.renderPredictions();
      this.refresh().catch(error => this.setStatus(error.message, "error"));
    }

    async loadImageFile(file) {
      if (!file) return;
      try {
        const url = URL.createObjectURL(file);
        const image = new Image();
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = () => reject(new Error("无法读取这张谱图图片。"));
          image.src = url;
        });
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        canvas.getContext("2d").drawImage(image, 0, 0);
        URL.revokeObjectURL(url);
        this.useCanvas(canvas, file.name, "other");
        this.setStatus("图片已载入，可以填写正确答案或运行识别。", "success");
      } catch (error) {
        this.setStatus(error.message, "error");
      } finally {
        this.$("imageInput").value = "";
      }
    }

    formValue(id) {
      return this.$(id).value.trim();
    }

    buildSample(materialOverride = "") {
      if (!this.current) throw new Error("请先载入当前 HDF5/ZIP 预览或谱图图片。 ");
      const material = materialOverride || this.formValue("materialInput");
      if (!material) throw new Error("请输入正确材料名称。 ");
      return {
        id: uid(),
        schemaVersion: 1,
        material,
        formula: this.formValue("formulaInput"),
        family: this.formValue("familyInput"),
        kind: this.$("kindInput").value,
        temperatureK: this.formValue("temperatureInput") || null,
        photonEnergyEv: this.formValue("photonInput") || null,
        notes: this.formValue("notesInput"),
        sourceName: this.current.sourceName,
        sourceMetadata: this.current.metadata || {},
        thumbnail: this.current.thumbnail,
        features: this.current.features,
        createdAt: new Date().toISOString()
      };
    }

    async saveCurrentLabel(materialOverride = "") {
      try {
        const sample = this.buildSample(materialOverride);
        await putSample(sample);
        const adapter = adapters.get(this.$("adapterSelect").value);
        await adapter?.train?.({ sample, samples: this.samples });
        await incrementModelVersion();
        this.$("materialInput").value = sample.material;
        await this.refresh();
        this.setStatus(`已学习“${sample.material}”，模型版本更新为 v${this.modelVersion}。`, "success");
        this.dispatchEvent(new CustomEvent("band-ai:trained", { bubbles: true, detail: { sample, modelVersion: this.modelVersion } }));
      } catch (error) {
        this.setStatus(error.message, "error");
      }
    }

    async predictCurrent() {
      try {
        if (!this.current) throw new Error("请先载入当前谱图。 ");
        if (!this.samples.length) throw new Error("训练库还是空的，请先保存至少一个带正确答案的样本。 ");
        const adapter = adapters.get(this.$("adapterSelect").value);
        if (!adapter?.predict) throw new Error("当前识别器不可用。 ");
        this.setStatus("正在计算候选材料…");
        this.predictions = await adapter.predict({
          features: this.current.features,
          source: this.current,
          samples: this.samples
        });
        this.renderPredictions();
        this.setStatus(this.predictions.length ? "识别完成。请确认候选或填写正确答案进行纠正。" : "没有可比较的同维度样本。", this.predictions.length ? "success" : "error");
      } catch (error) {
        this.setStatus(error.message, "error");
      }
    }

    renderPredictions() {
      const container = this.$("predictions");
      container.replaceChildren();
      if (!this.predictions.length) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = this.current ? "点击“识别当前谱图”查看候选材料" : "载入谱图后运行识别";
        container.append(empty);
        this.$("correctionActions").hidden = true;
        return;
      }
      this.predictions.forEach((prediction, index) => {
        const row = document.createElement("div");
        row.className = "prediction";
        const rank = document.createElement("span");
        rank.className = "rank";
        rank.textContent = String(index + 1);
        const copy = document.createElement("div");
        const material = document.createElement("strong");
        material.textContent = prediction.material;
        const evidence = document.createElement("small");
        evidence.textContent = prediction.evidence || `${prediction.support || 0} 个训练样本`;
        copy.append(material, evidence);
        const confidence = document.createElement("span");
        confidence.className = "confidence";
        confidence.textContent = `${Math.round((prediction.confidence || 0) * 100)}%`;
        row.append(rank, copy, confidence);
        container.append(row);
      });
      this.$("correctionActions").hidden = false;
    }

    async confirmPrediction() {
      const material = this.predictions[0]?.material;
      if (!material) return;
      this.$("materialInput").value = material;
      await this.saveCurrentLabel(material);
    }

    clearCurrent() {
      this.current = null;
      this.predictions = [];
      this.$("preview").innerHTML = "<span>未选择谱图</span>";
      this.$("sourceName").textContent = "尚未载入数据";
      this.$("sourceMeta").textContent = "可读取上方当前 HDF5/ZIP 预览，也可直接选择谱图图片。";
      ["materialInput", "formulaInput", "familyInput", "temperatureInput", "photonInput", "notesInput"].forEach(id => { this.$(id).value = ""; });
      this.renderPredictions();
      this.setStatus("");
      this.refresh().catch(error => this.setStatus(error.message, "error"));
    }

    async removeSample(id) {
      await deleteSample(id);
      await incrementModelVersion();
      await this.refresh();
      this.setStatus("样本已删除，模型版本已更新。", "success");
    }

    renderSampleTable() {
      const container = this.$("sampleTable");
      container.replaceChildren();
      if (!this.samples.length) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "还没有训练样本";
        container.append(empty);
        return;
      }
      const table = document.createElement("table");
      table.className = "samples";
      table.innerHTML = "<thead><tr><th>材料</th><th>类型</th><th>来源</th><th>时间</th><th></th></tr></thead>";
      const body = document.createElement("tbody");
      [...this.samples].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 100).forEach(sample => {
        const row = document.createElement("tr");
        [sample.material, String(sample.kind || "-").toUpperCase(), sample.sourceName || "-", new Date(sample.createdAt).toLocaleString()].forEach(value => {
          const cell = document.createElement("td");
          cell.textContent = value;
          row.append(cell);
        });
        const action = document.createElement("td");
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.delete = sample.id;
        button.textContent = "删除";
        action.append(button);
        row.append(action);
        body.append(row);
      });
      table.append(body);
      container.append(table);
    }

    renderPrototypeGallery() {
      const container = this.$("prototypeGallery");
      if (!container) return;
      container.replaceChildren();
      const groups = new Map();
      [...this.samples].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).forEach(sample => {
        const material = String(sample.material || "").trim();
        if (!material) return;
        const group = groups.get(material) || { material, count: 0, sample: null };
        group.count += 1;
        if (!group.sample && sample.thumbnail) group.sample = sample;
        groups.set(material, group);
      });
      if (!groups.size) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "完成材料标注后，这里会显示各材料的代表性谱图";
        container.append(empty);
        return;
      }
      [...groups.values()].slice(0, 12).forEach(group => {
        const card = document.createElement("article");
        card.className = "prototype";
        const media = document.createElement("div");
        media.className = "prototype-media";
        if (group.sample?.thumbnail) {
          const image = document.createElement("img");
          image.src = group.sample.thumbnail;
          image.alt = `${group.material} 代表性谱图`;
          media.append(image);
        } else {
          media.textContent = "暂无缩略图";
        }
        const copy = document.createElement("div");
        copy.className = "prototype-copy";
        const title = document.createElement("strong");
        title.textContent = group.material;
        const count = document.createElement("small");
        count.textContent = `${group.count} 个已验证样本`;
        copy.append(title, count);
        card.append(media, copy);
        container.append(card);
      });
    }

    async importDataset(file) {
      if (!file) return;
      try {
        this.setStatus("正在导入训练数据…");
        let imported = 0;
        let rejected = 0;
        const normalizeRecord = record => {
          const features = record?.features || record?.feature;
          if (!record?.material || !Array.isArray(features) || features.length < 20) {
            rejected += 1;
            return null;
          }
          return {
            ...record,
            id: record.id || uid(),
            schemaVersion: 1,
            features: features.map(roundFeature),
            createdAt: record.createdAt || new Date().toISOString()
          };
        };
        const writeBatch = async records => {
          const normalized = records.map(normalizeRecord).filter(Boolean);
          imported += await putSamples(normalized);
        };
        if (file.name.toLowerCase().endsWith(".json")) {
          const text = await file.text();
          const parsed = JSON.parse(text);
          const records = Array.isArray(parsed) ? parsed : parsed.samples;
          if (!Array.isArray(records)) throw new Error("文件中没有样本数组。 ");
          for (let offset = 0; offset < records.length; offset += 500) {
            await writeBatch(records.slice(offset, offset + 500));
          }
        } else {
          const reader = file.stream().getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let lineNumber = 0;
          let batch = [];
          while (true) {
            const { value, done } = await reader.read();
            buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
            const lines = buffer.split(/\r?\n/);
            buffer = done ? "" : lines.pop() || "";
            for (const line of lines) {
              lineNumber += 1;
              if (!line.trim()) continue;
              try { batch.push(JSON.parse(line)); }
              catch { throw new Error(`JSONL 第 ${lineNumber} 行格式错误。`); }
              if (batch.length >= 250) {
                await writeBatch(batch);
                batch = [];
              }
            }
            if (done) break;
          }
          if (buffer.trim()) {
            lineNumber += 1;
            try { batch.push(JSON.parse(buffer)); }
            catch { throw new Error(`JSONL 第 ${lineNumber} 行格式错误。`); }
          }
          if (batch.length) await writeBatch(batch);
        }
        if (!imported) throw new Error("没有找到包含 material 和 features 的有效样本。 ");
        await incrementModelVersion();
        await this.refresh();
        this.switchTab("library");
        this.setStatus(`已导入 ${imported} 个训练样本${rejected ? `，跳过 ${rejected} 个无效条目` : ""}。`, "success");
      } catch (error) {
        this.setStatus(error.message, "error");
      } finally {
        this.$("datasetInput").value = "";
      }
    }

    async exportDataset() {
      const samples = await getAllSamples();
      if (!samples.length) {
        this.setStatus("训练库还是空的，没有可导出的样本。", "error");
        return;
      }
      const text = samples.map(sample => JSON.stringify(sample)).join("\n") + "\n";
      const blob = new Blob([text], { type: "application/x-ndjson" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `arpes-band-training-${new Date().toISOString().slice(0, 10)}.jsonl`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      this.setStatus(`已导出 ${samples.length} 个训练样本。`, "success");
    }

    setStatus(message, kind = "") {
      const status = this.$("status");
      status.textContent = message;
      status.className = `status${kind ? ` ${kind}` : ""}`;
    }
  }

  globalThis.ARPESBandAI = {
    registerAdapter(id, adapter) {
      if (!id || typeof adapter?.predict !== "function") throw new Error("Adapter requires an id and predict function");
      adapters.set(id, adapter);
      document.querySelectorAll("arpes-band-ai").forEach(element => element.populateAdapters?.());
    },
    listAdapters() {
      return [...adapters.entries()].map(([id, adapter]) => ({ id, label: adapter.label || id }));
    },
    extractCanvasFeature,
    predictLocal
  };

  if (!customElements.get("arpes-band-ai")) customElements.define("arpes-band-ai", ArpesBandAi);
})();
