(function initBohriumOpenlamBridge(global) {
  "use strict";

  const TASKS = new Set(["relax", "energy_force", "md"]);
  const BAND_ENGINES = new Set(["quantum_espresso", "abacus"]);
  const STRUCTURE_EXTENSIONS = new Set(["cif", "vasp", "poscar", "contcar", "xyz"]);
  const MAX_STRUCTURE_BYTES = 25 * 1024 * 1024;

  function structureExtension(filename) {
    const name = String(filename || "").trim().toLowerCase();
    if (name === "poscar" || name === "contcar") return name;
    const match = name.match(/\.([a-z0-9]+)$/);
    return match ? match[1] : "";
  }

  function validateStructureMetadata(file) {
    const name = String(file?.name || "").trim();
    const size = Number(file?.size);
    if (!name || !STRUCTURE_EXTENSIONS.has(structureExtension(name))) {
      throw new Error("UNSUPPORTED_STRUCTURE");
    }
    if (!Number.isFinite(size) || size <= 0) throw new Error("EMPTY_STRUCTURE");
    if (size > MAX_STRUCTURE_BYTES) throw new Error("STRUCTURE_TOO_LARGE");
    return {
      name,
      size,
      lastModified: Number.isFinite(Number(file?.lastModified)) ? Number(file.lastModified) : null,
      type: String(file?.type || "")
    };
  }

  function normalizedArpesReference(value) {
    if (!value || typeof value !== "object") return null;
    return {
      fingerprint: String(value.fingerprint || ""),
      source_id: String(value.sourceId || ""),
      source_archive: String(value.sourceArchive || ""),
      filename: String(value.filename || ""),
      dataset_path: String(value.path || ""),
      dataset_name: String(value.name || ""),
      dtype: String(value.dtype || ""),
      shape: Array.from(value.shape || []).map(Number).filter(Number.isFinite),
      axes: Array.isArray(value.axes) ? value.axes.map(axis => ({
        dimension: String(axis?.dimension || ""),
        label: String(axis?.label || ""),
        first: axis?.first == null ? null : Number(axis.first),
        last: axis?.last == null ? null : Number(axis.last),
        length: axis?.length == null ? null : Number(axis.length)
      })) : []
    };
  }

  function createHandoffManifest(input = {}) {
    const structure = validateStructureMetadata(input.file);
    const task = String(input.task || "relax");
    const bandEngine = String(input.bandEngine || "quantum_espresso");
    if (!TASKS.has(task)) throw new Error("UNSUPPORTED_TASK");
    if (!BAND_ENGINES.has(bandEngine)) throw new Error("UNSUPPORTED_BAND_ENGINE");
    const sha256 = /^[a-f0-9]{64}$/i.test(String(input.sha256 || "")) ? String(input.sha256).toLowerCase() : null;
    return {
      schema: "arpes-bohrium-openlam-handoff/v1",
      created_at: String(input.createdAt || new Date().toISOString()),
      mode: "manual-secure-handoff",
      structure: {
        ...structure,
        sha256,
        file_included: false
      },
      workflow: [
        {
          stage: "openlam",
          task,
          purpose: "atomistic energy/force evaluation, pre-relaxation, or molecular dynamics",
          output: "relaxed atomic structure or atomistic trajectory"
        },
        {
          stage: "electronic_structure",
          engine: bandEngine,
          task: "scf+nscf+bands",
          purpose: "calculate electronic bands from the selected or relaxed structure",
          expected_outputs: bandEngine === "quantum_espresso"
            ? ["bands.dat.gnu", "bands.dat", "scf.out"]
            : ["BANDS_1.dat", "running_scf.log", "running_band.log"]
        },
        {
          stage: "arpes_comparison",
          task: "import_theoretical_bands",
          accepted_formats: ["QE bands.dat.gnu", "k + multi-band matrix", "named band/k/energy table"]
        }
      ],
      arpes_reference: normalizedArpesReference(input.arpesContext),
      data_policy: {
        structure_uploaded_by_this_site: false,
        access_key_stored_by_this_site: false,
        remote_job_submitted_by_this_site: false,
        note: "Upload the structure separately in Bohrium. Configure credentials only in Bohrium or a trusted server environment."
      },
      scientific_boundary: "OpenLAM predicts atomistic energies and forces; a separate electronic-structure calculation is required before ARPES band comparison.",
      official_resources: {
        bohrium: "https://www.bohrium.com/",
        bohrium_docs: "https://bohrium-doc.dp.tech/",
        openlam: "https://www.aissquare.com/openlam",
        openlam_source: "https://github.com/deepmodeling/openlam",
        deepmd_kit: "https://github.com/deepmodeling/deepmd-kit"
      }
    };
  }

  const Core = Object.freeze({
    BAND_ENGINES,
    MAX_STRUCTURE_BYTES,
    STRUCTURE_EXTENSIONS,
    TASKS,
    createHandoffManifest,
    normalizedArpesReference,
    structureExtension,
    validateStructureMetadata
  });

  if (typeof module === "object" && module.exports) module.exports = Core;
  global.BohriumOpenlamBridge = { Core };
  if (!global.document) return;

  const TEXT = {
    zh: {
      title: "玻尔空间站 · OpenLAM 计算接力",
      summary: "结构预处理 → 电子能带 → ARPES 对照",
      mode: "安全移交模式",
      whatTitle: "OpenLAM 在这里负责什么",
      whatBody: "OpenLAM / DeePMD 适合预测原子结构的能量、力并做预弛豫或分子动力学；它不是电子能带模型，不能直接生成 ARPES 色散。",
      stepOne: "选择 CIF、POSCAR 或 XYZ 原子结构。",
      stepTwo: "在 Bohrium 用 OpenLAM 做结构弛豫、能量/力评估或 MD。",
      stepThree: "对弛豫后的结构运行 Quantum Espresso / ABACUS 能带计算。",
      stepFour: "把 bands.dat.gnu 等结果重新导入上方 DFT 预览，与 ARPES 对照。",
      privacy: "结构文件只在浏览器本地校验；本站不会保存或上传 Bohrium AccessKey，也不会自动产生计费任务。",
      chooseStructure: "选择原子结构",
      noStructure: "尚未选择结构文件",
      openlamTask: "OpenLAM 阶段",
      taskRelax: "结构预弛豫",
      taskEnergyForce: "能量 / 力评估",
      taskMd: "分子动力学",
      bandEngine: "后续能带计算",
      exportHandoff: "导出计算接力清单",
      openBohrium: "打开玻尔空间站",
      openOpenlam: "查看 OpenLAM 模型",
      handoffHint: "导出的 JSON 只记录结构文件指纹、任务选择和 ARPES 数据引用；请把结构文件本身一同上传到 Bohrium。",
      hashing: "正在本地计算文件指纹…",
      ready: "{name} · {size} · 本地指纹 {hash}",
      readyNoHash: "{name} · {size} · 当前浏览器无法计算 SHA-256，仍可导出清单",
      unsupported: "请选择 CIF、VASP/POSCAR/CONTCAR 或 XYZ 结构文件",
      empty: "结构文件为空",
      tooLarge: "结构文件超过 25 MB；请先精简结构或轨迹",
      exported: "计算接力清单已导出；请将 JSON 与原子结构文件一同上传到 Bohrium"
    },
    en: {
      title: "Bohrium · OpenLAM compute handoff",
      summary: "structure preparation → electronic bands → ARPES comparison",
      mode: "Secure handoff",
      whatTitle: "What OpenLAM does here",
      whatBody: "OpenLAM / DeePMD predicts atomistic energies and forces for pre-relaxation or molecular dynamics. It is not an electronic-band model and cannot directly generate ARPES dispersion.",
      stepOne: "Choose a CIF, POSCAR, or XYZ atomic structure.",
      stepTwo: "Use OpenLAM in Bohrium for relaxation, energy/force evaluation, or MD.",
      stepThree: "Run a Quantum Espresso / ABACUS band calculation on the relaxed structure.",
      stepFour: "Import bands.dat.gnu or an equivalent result above for ARPES comparison.",
      privacy: "The structure is validated only in your browser. This site never stores a Bohrium AccessKey or automatically starts a billable job.",
      chooseStructure: "Choose atomic structure",
      noStructure: "No structure selected",
      openlamTask: "OpenLAM stage",
      taskRelax: "Structure pre-relaxation",
      taskEnergyForce: "Energy / force evaluation",
      taskMd: "Molecular dynamics",
      bandEngine: "Electronic-band stage",
      exportHandoff: "Export compute handoff",
      openBohrium: "Open Bohrium",
      openOpenlam: "View OpenLAM models",
      handoffHint: "The JSON records only the file fingerprint, workflow choices, and ARPES reference. Upload the structure file itself to Bohrium as well.",
      hashing: "Computing a local file fingerprint…",
      ready: "{name} · {size} · local fingerprint {hash}",
      readyNoHash: "{name} · {size} · SHA-256 is unavailable in this browser; the handoff can still be exported",
      unsupported: "Choose a CIF, VASP/POSCAR/CONTCAR, or XYZ structure",
      empty: "The structure file is empty",
      tooLarge: "The structure exceeds 25 MB; reduce the structure or trajectory first",
      exported: "Compute handoff exported. Upload the JSON and atomic structure together in Bohrium."
    }
  };

  const state = { file: null, metadata: null, sha256: null };
  const nodes = {};

  function language() {
    return String(document.documentElement.lang || "zh").toLowerCase().startsWith("zh") ? "zh" : "en";
  }

  function phrase(key, params = {}) {
    let value = TEXT[language()][key] || TEXT.zh[key] || key;
    Object.entries(params).forEach(([name, replacement]) => {
      value = value.split(`{${name}}`).join(String(replacement));
    });
    return value;
  }

  function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) return `${value} B`;
    if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 ** 2)).toFixed(1)} MB`;
  }

  function setSummary(text, tone = "") {
    if (!nodes.summary) return;
    nodes.summary.textContent = text;
    nodes.summary.dataset.tone = tone;
  }

  function renderSelectedFile() {
    if (!state.metadata) {
      setSummary(phrase("noStructure"));
      return;
    }
    const params = {
      name: state.metadata.name,
      size: formatBytes(state.metadata.size),
      hash: state.sha256 ? state.sha256.slice(0, 12) : "–"
    };
    setSummary(phrase(state.sha256 ? "ready" : "readyNoHash", params), "good");
  }

  function translate() {
    document.querySelectorAll("[data-bohrium-i18n]").forEach(node => {
      const key = node.dataset.bohriumI18n;
      if (key) node.textContent = phrase(key);
    });
    renderSelectedFile();
  }

  async function sha256File(file) {
    if (!global.crypto?.subtle || typeof file?.arrayBuffer !== "function") return null;
    const digest = await global.crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
  }

  function errorText(error) {
    if (error?.message === "EMPTY_STRUCTURE") return phrase("empty");
    if (error?.message === "STRUCTURE_TOO_LARGE") return phrase("tooLarge");
    return phrase("unsupported");
  }

  async function selectStructure(file) {
    state.file = null;
    state.metadata = null;
    state.sha256 = null;
    if (nodes.exportButton) nodes.exportButton.disabled = true;
    try {
      const metadata = Core.validateStructureMetadata(file);
      state.file = file;
      state.metadata = metadata;
      setSummary(phrase("hashing"));
      try { state.sha256 = await sha256File(file); }
      catch { state.sha256 = null; }
      renderSelectedFile();
      if (nodes.exportButton) nodes.exportButton.disabled = false;
    } catch (error) {
      setSummary(errorText(error), "error");
    }
  }

  function safeFilename(value) {
    return String(value || "structure")
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-z0-9_-]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "structure";
  }

  function exportHandoff() {
    if (!state.file || !state.metadata) return;
    const arpesContext = global.ArpesDftWorkbench?.getState?.().arpesContext || null;
    const manifest = Core.createHandoffManifest({
      file: state.metadata,
      sha256: state.sha256,
      task: nodes.task?.value,
      bandEngine: nodes.bandEngine?.value,
      arpesContext
    });
    const blob = new Blob([`${JSON.stringify(manifest, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `bohrium-openlam-handoff-${safeFilename(state.metadata.name)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    if (nodes.hint) nodes.hint.textContent = phrase("exported");
  }

  function init() {
    nodes.input = document.querySelector("#bohriumStructureInput");
    nodes.chooseButton = document.querySelector("#bohriumChooseStructureBtn");
    nodes.summary = document.querySelector("#bohriumStructureSummary");
    nodes.task = document.querySelector("#bohriumOpenlamTask");
    nodes.bandEngine = document.querySelector("#bohriumBandEngine");
    nodes.exportButton = document.querySelector("#bohriumExportHandoffBtn");
    nodes.hint = document.querySelector("#bohriumOpenlamHint");
    if (!nodes.input || !nodes.chooseButton || !nodes.exportButton) return;
    nodes.chooseButton.addEventListener("click", () => nodes.input.click());
    nodes.input.addEventListener("change", () => selectStructure(nodes.input.files?.[0] || null));
    nodes.exportButton.addEventListener("click", exportHandoff);
    translate();
    if ("MutationObserver" in global) {
      new MutationObserver(translate).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})(typeof window !== "undefined" ? window : globalThis);
