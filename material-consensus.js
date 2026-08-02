(function initMaterialConsensus(global) {
  "use strict";

  const SCHEMA = "material-consensus-candidate/v1";
  const REPORT_SCHEMA = "material-consensus-report/v1";
  const CAMPAIGN_SCHEMA = "material-discovery-campaign/v1";
  const ORCHESTRATION_SCHEMA = "material-research-orchestration/v1";
  const MODEL_REPORT_SCHEMA = "material-model-report/v1";
  const EXECUTION_REPORT_SCHEMA = "material-execution-report/v1";
  const TASK_PACKAGE_SCHEMA = "material-task-package/v1";
  const MAX_RECORDS = 5000;
  const MAX_TASKS = MAX_RECORDS * 8;
  const MAX_FILE_BYTES = 5 * 1024 * 1024;
  const MAX_FALLBACK_BYTES = 3.5 * 1024 * 1024;
  const STORAGE_KEY = "arpes-material-consensus-v1";
  const USER_STORAGE_KEY = "arpes-explorer-user-v1";
  const DATABASE_NAME = "arpes-material-consensus";
  const DATABASE_VERSION = 1;
  const TRUSTED_ADAPTER_TOKEN = Object.freeze({});
  const TRUSTED_NORMALIZED_RECORDS = new WeakSet();

  const ELEMENTS = new Set([
    "H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne", "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar", "K", "Ca",
    "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn", "Ga", "Ge", "As", "Se", "Br", "Kr", "Rb", "Sr", "Y", "Zr",
    "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd", "In", "Sn", "Sb", "Te", "I", "Xe", "Cs", "Ba", "La", "Ce", "Pr", "Nd",
    "Pm", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Tm", "Yb", "Lu", "Hf", "Ta", "W", "Re", "Os", "Ir", "Pt", "Au", "Hg",
    "Tl", "Pb", "Bi", "Po", "At", "Rn", "Fr", "Ra", "Ac", "Th", "Pa", "U", "Np", "Pu", "Am", "Cm", "Bk", "Cf", "Es", "Fm",
    "Md", "No", "Lr", "Rf", "Db", "Sg", "Bh", "Hs", "Mt", "Ds", "Rg", "Cn", "Nh", "Fl", "Mc", "Lv", "Ts", "Og"
  ]);

  const STAGE_WEIGHT = Object.freeze({
    independent_reproduction: 1,
    experiment: 0.96,
    literature: 0.86,
    database: 0.82,
    dft: 0.78,
    validated_ml: 0.68,
    ml: 0.55,
    llm: 0.28,
    rule: 0.24,
    task_planning: 0.16,
    unknown: 0.12
  });
  const NUMERIC_EVIDENCE_STAGES = new Set(["independent_reproduction", "experiment", "literature", "database", "dft", "validated_ml", "ml"]);

  const PROPERTY_META = Object.freeze({
    tc_K: Object.freeze({ unit: "K", labelZh: "Tc", labelEn: "Tc", tolerance: 1, min: 0, max: 1000 }),
    band_gap_eV: Object.freeze({ unit: "eV", labelZh: "带隙", labelEn: "Band gap", tolerance: 0.25, min: 0, max: 100 }),
    formation_energy_eV_atom: Object.freeze({ unit: "eV/atom", labelZh: "形成能", labelEn: "Formation energy", tolerance: 0.08, min: -100, max: 100 }),
    e_above_hull_eV_atom: Object.freeze({ unit: "eV/atom", labelZh: "凸包能", labelEn: "Energy above hull", tolerance: 0.04, min: 0, max: 100 }),
    magnetic_moment_muB: Object.freeze({ unit: "μB", labelZh: "磁矩", labelEn: "Magnetic moment", tolerance: 0.25, min: -1000, max: 1000 })
  });

  const TEXT = {
    zh: {
      kicker: "材料智能中枢",
      title: "多模型预测与共识报告",
      subtitle: "汇总不同模型的候选、数值与建议，保守合并相同成分和相似结论，突出共识、分歧及下一步验证。",
      mode: "本地归纳 · 不替代实验",
      priorityStability: "身份与稳定性闸门",
      priorityStabilityHint: "先核对结构、条件与版本，再比较弛豫、形成能、凸包能和动力学稳定性。",
      priorityProperty: "目标性质",
      priorityPropertyHint: "再筛选 Tc、带隙、磁性、催化或用户指定性质。",
      priorityNovelty: "新颖性与可合成性",
      priorityNoveltyHint: "数据库和文献查重后，才标记为“待验证的新候选”。",
      targetProperty: "预测目标",
      targetStability: "热力学 / 结构稳定性",
      targetTc: "超导转变温度 Tc",
      targetBandGap: "带隙",
      targetMagnetic: "磁性",
      targetCustom: "自定义性质",
      targetValue: "目标值 / 下限",
      allowedElements: "允许元素",
      excludedElements: "排除元素",
      importResults: "导入模型结果",
      collectCurrent: "收集当前模型建议",
      openConsensus: "查看共识报告",
      loadExample: "载入示例",
      clear: "清空",
      emptyStatus: "尚未导入模型结果。支持统一 JSON、普通 JSON 数组、CSV 或 TSV。",
      pasteTitle: "粘贴模型返回内容或查看接入格式",
      pastePlaceholder: '[{"model":"MatterSim","formula":"FeSe","stage":"ml","e_above_hull_eV_atom":0.03,"confidence":0.78,"recommendation":"建议 DFT 与声子验证"}]',
      addPasted: "加入归纳",
      downloadTemplate: "下载 JSON 模板",
      formatHint: "建议包含 model、model_family、formula、结构命名空间/ID、evidence_id / run_id、单位、计算条件、数值性质、recommendation 与 source。外部导入默认未核验；也可调用 window.MaterialConsensusHub.ingest(...)。",
      pipelineTitle: "预测新材料的推荐模型链",
      pipelineGenerate: "按目标性质生成晶体候选。",
      pipelineScreen: "快速弛豫并筛查能量、力和稳定性。",
      pipelineVerify: "复算形成能、能带、声子与目标性质。",
      pipelineDatabaseTitle: "数据库与实验",
      pipelineDatabase: "查重、合成并用结构和物性实验验证。",
      chairTitle: "材料研究主持人",
      chairSubtitle: "收集各模型的独立报告，合并结论与冲突，分配下一轮任务，并持续更新执行报告。",
      chairMode: "本地主持规则 v1 · 不计入科学共识",
      chairStepReports: "收取模型报告",
      chairStepSynthesis: "归纳与冲突审计",
      chairStepTasks: "分配验证任务",
      chairStepExecution: "生成执行报告",
      chairRun: "生成 / 更新主持方案",
      chairTaskPackage: "下载任务包",
      chairExecutionReport: "下载执行报告",
      chairModelReports: "各模型独立报告",
      chairTaskBoard: "主持人任务板",
      chairFinalSummary: "执行摘要",
      chairEmpty: "导入或收集至少一份模型建议后，主持人会生成独立报告、任务分工与执行摘要。",
      chairReportsMetric: "模型报告",
      chairTasksMetric: "分配任务",
      chairReturnedMetric: "已返回结果",
      chairPendingMetric: "待执行",
      chairColOwner: "负责模型 / 团队",
      chairColTask: "任务",
      chairColCandidate: "候选",
      chairColDeliverable: "交付物",
      chairColStatus: "状态",
      chairStatusAssigned: "待执行",
      chairStatusReturned: "结果已返回 · 待核验",
      chairStatusVerified: "已核验",
      chairStatusBlocked: "前置条件不足",
      chairStatusSuperseded: "已归档 · 被新分支替代",
      chairGenerated: "主持方案已更新：{reports} 份模型报告，{tasks} 项任务。",
      chairDownloadedTasks: "主持人任务包已下载。",
      chairDownloadedReport: "执行报告已下载。",
      chairBoundary: "主持人只组织已有结果并安排验证，不调用付费计算、不修改证据等级，也不把模型意见当作新材料发现。",
      metricCandidates: "归并候选",
      metricModels: "模型来源",
      metricAgreement: "有效数值共识",
      metricConflicts: "数值分歧",
      emptyTitle: "等待多模型结果",
      emptyHint: "导入各模型输出后，这里会生成归并表格、共识摘要和验证优先级。",
      colCandidate: "候选材料",
      colConsensus: "核查优先级",
      colModels: "模型来源",
      colProperties: "关键性质",
      colNovelty: "新颖性状态",
      colSummary: "合并结论与分歧",
      colNext: "下一步",
      exportReport: "下载分析报告",
      exportJson: "导出归一 JSON",
      exportCampaign: "导出新材料预测任务",
      boundary: "“历史未收录”只表示当前查重结果，不能证明材料从未被发现。所有生成候选均须经过数据库、文献、DFT 与实验验证后才能作为发现结论。",
      imported: "已加入 {added} 条有效结果；{errors} 条未通过格式检查。导入内容按“未核验来源”处理。",
      collected: "已收集当前页面的 {added} 条模型建议；它们按任务建议而非已完成计算处理。",
      noCurrent: "当前元素组合还没有可收集的模型建议。",
      exampleLoaded: "已载入演示数据；示例只用于展示归并与分歧，不代表新的科学结论。",
      cleared: "已清空多模型结果。",
      invalidPaste: "无法解析粘贴内容，请检查 JSON、CSV 或 TSV 格式。",
      fileTooLarge: "文件超过 5 MB，请拆分后导入。",
      readFailed: "文件读取失败：{name}",
      known: "已有参考记录",
      screened: "当前快照未匹配 · 待验证",
      unchecked: "尚未查重",
      mixedNovelty: "查重状态不一致",
      priorityHigh: "优先核查",
      priorityReview: "需补证据",
      priorityInsufficient: "证据不足",
      notConfidence: "这是透明的核查排序，不是材料成功概率或模型置信度。",
      uncalibrated: "未提供外部校准误差",
      unverifiedSources: "未核验导入，不计入有效数值共识",
      calibrated: "{count} 个模型提供校准信息",
      conflict: "数值分歧",
      noConflict: "未检出明显数值分歧",
      noNumeric: "尚无可聚合的数值性质",
      incomparableValues: "结构身份未解析，数值仅逐条列出、不做合并",
      models: "{count} 个结果来源",
      unspecifiedStructure: "结构未指定；同成分多晶型未自动合并",
      nextStructure: "补充 CIF、结构 ID、空间群及模型版本，分开核查多晶型。",
      nextConditions: "补齐 pressure、doping、gap type、SOC、functional、U / strain 等关键条件；未知条件不计正式共识。",
      nextVerification: "通过受控适配器核验模型家族、版本、运行记录、来源与条件完整性；未核验导入只用于比较。",
      nextNovelty: "按带日期的 Materials Project / COD / 文献快照完成组成与结构查重。",
      nextStability: "用弛豫、形成能、凸包能和声子计算建立稳定性证据。",
      nextConflict: "核对压力、温度、掺杂、泛函、模型版本和单位，解释模型分歧。",
      nextTarget: "用目标专属且经过校准的模型或 DFT 复算目标性质。",
      nextExperiment: "合成后用结构表征和目标物性实验验证；模型共识不能替代实验。",
      reportTitle: "多模型材料候选共识分析报告",
      reportDownloaded: "分析报告已下载。",
      jsonDownloaded: "归一结果 JSON 已导出。",
      campaignDownloaded: "新材料预测任务已导出；它是计算计划，不会自动提交付费作业。",
      templateDownloaded: "模型结果模板已下载。",
      restored: "已恢复本机保存的 {count} 条模型结果。",
      storageFailed: "本地保存空间不足；当前结果仍可导出，但刷新页面前请先下载报告。",
      demo: "演示数据 · 不进入正式证据"
    },
    en: {
      kicker: "MATERIAL INTELLIGENCE",
      title: "Multi-model prediction consensus",
      subtitle: "Consolidate candidates, values, and recommendations from different models; conservatively merge matching compositions and similar conclusions while surfacing agreement, conflicts, and validation work.",
      mode: "Local synthesis · not experimental proof",
      priorityStability: "Identity and stability gate",
      priorityStabilityHint: "Verify structure, conditions, and versions before relaxation, formation energy, hull, and dynamic stability.",
      priorityProperty: "Target property",
      priorityPropertyHint: "Then screen Tc, band gap, magnetism, catalysis, or a user-defined property.",
      priorityNovelty: "Novelty and feasibility",
      priorityNoveltyHint: "Only label an unverified new candidate after database and literature matching.",
      targetProperty: "Prediction target",
      targetStability: "Thermodynamic / structural stability",
      targetTc: "Superconducting Tc",
      targetBandGap: "Band gap",
      targetMagnetic: "Magnetism",
      targetCustom: "Custom property",
      targetValue: "Target / lower bound",
      allowedElements: "Allowed elements",
      excludedElements: "Excluded elements",
      importResults: "Import model results",
      collectCurrent: "Collect current suggestions",
      openConsensus: "View consensus report",
      loadExample: "Load example",
      clear: "Clear",
      emptyStatus: "No model results yet. Unified JSON, ordinary JSON arrays, CSV, and TSV are supported.",
      pasteTitle: "Paste a model response or view the integration format",
      pastePlaceholder: '[{"model":"MatterSim","formula":"FeSe","stage":"ml","e_above_hull_eV_atom":0.03,"confidence":0.78,"recommendation":"Verify with DFT and phonons"}]',
      addPasted: "Add to consensus",
      downloadTemplate: "Download JSON template",
      formatHint: "Include model, model_family, formula, a namespaced structure ID, evidence_id / run_id, units, calculation conditions, numeric properties, recommendation, and source. External imports remain unverified and may also call window.MaterialConsensusHub.ingest(...).",
      pipelineTitle: "Recommended model chain for new candidates",
      pipelineGenerate: "Generate crystal candidates under property constraints.",
      pipelineScreen: "Relax and screen energy, forces, and stability.",
      pipelineVerify: "Recalculate formation energy, bands, phonons, and target properties.",
      pipelineDatabaseTitle: "Databases and experiment",
      pipelineDatabase: "Deduplicate, synthesize, and validate structure and properties.",
      chairTitle: "Materials research chair",
      chairSubtitle: "Collect independent model reports, merge conclusions and conflicts, assign the next validation tasks, and maintain an execution report.",
      chairMode: "Local chair rules v1 · excluded from scientific consensus",
      chairStepReports: "Collect model reports",
      chairStepSynthesis: "Synthesize and audit",
      chairStepTasks: "Assign validation tasks",
      chairStepExecution: "Build execution report",
      chairRun: "Generate / update chair plan",
      chairTaskPackage: "Download task package",
      chairExecutionReport: "Download execution report",
      chairModelReports: "Independent model reports",
      chairTaskBoard: "Chair task board",
      chairFinalSummary: "Execution summary",
      chairEmpty: "Import or collect at least one model suggestion to generate independent reports, task assignments, and an execution summary.",
      chairReportsMetric: "Model reports",
      chairTasksMetric: "Assigned tasks",
      chairReturnedMetric: "Results returned",
      chairPendingMetric: "Pending",
      chairColOwner: "Model / team",
      chairColTask: "Task",
      chairColCandidate: "Candidate",
      chairColDeliverable: "Deliverable",
      chairColStatus: "Status",
      chairStatusAssigned: "Assigned",
      chairStatusReturned: "Result returned · unverified",
      chairStatusVerified: "Verified",
      chairStatusBlocked: "Blocked by prerequisites",
      chairStatusSuperseded: "Archived · superseded by a new branch",
      chairGenerated: "Chair plan updated: {reports} model reports and {tasks} tasks.",
      chairDownloadedTasks: "Chair task package downloaded.",
      chairDownloadedReport: "Execution report downloaded.",
      chairBoundary: "The chair only organizes existing results and validation work. It does not launch paid computation, change evidence levels, or turn model opinions into discoveries.",
      metricCandidates: "Merged candidates",
      metricModels: "Model sources",
      metricAgreement: "Valid numeric consensus",
      metricConflicts: "Numeric conflicts",
      emptyTitle: "Waiting for multi-model results",
      emptyHint: "Import model outputs to build a merged table, consensus summary, and validation priorities.",
      colCandidate: "Candidate",
      colConsensus: "Review priority",
      colModels: "Supporting models",
      colProperties: "Key properties",
      colNovelty: "Novelty status",
      colSummary: "Merged conclusion and conflicts",
      colNext: "Next step",
      exportReport: "Download analysis report",
      exportJson: "Export normalized JSON",
      exportCampaign: "Export discovery campaign",
      boundary: "Not found in a historical snapshot does not prove a material has never been discovered. Every generated candidate requires database, literature, DFT, and experimental validation before it can support a discovery claim.",
      imported: "Added {added} valid results; {errors} failed format checks. Imported sources remain unverified.",
      collected: "Collected {added} current model suggestions. They are treated as task suggestions, not completed calculations.",
      noCurrent: "There are no current model suggestions to collect.",
      exampleLoaded: "Example data loaded. It demonstrates merging and disagreement only; it is not a new scientific conclusion.",
      cleared: "Multi-model results cleared.",
      invalidPaste: "The pasted content could not be parsed. Check its JSON, CSV, or TSV format.",
      fileTooLarge: "The file exceeds 5 MB. Split it before importing.",
      readFailed: "Could not read {name}.",
      known: "Reference match",
      screened: "No match in current snapshot · unverified",
      unchecked: "Novelty not checked",
      mixedNovelty: "Mixed novelty evidence",
      priorityHigh: "Review first",
      priorityReview: "Needs evidence",
      priorityInsufficient: "Insufficient evidence",
      notConfidence: "This is a transparent review ranking, not a success probability or model confidence.",
      uncalibrated: "No external calibration error supplied",
      unverifiedSources: "Unverified imports are excluded from valid numeric consensus",
      calibrated: "{count} models supplied calibration metadata",
      conflict: "Numeric disagreement",
      noConflict: "No large numeric disagreement detected",
      noNumeric: "No numeric properties available for aggregation",
      incomparableValues: "Structure identity is unresolved; values are listed separately and are not merged",
      models: "{count} result sources",
      unspecifiedStructure: "Structure unspecified; polymorphs with one composition were not automatically merged",
      nextStructure: "Add a CIF or structure ID, space group, and model version; audit polymorphs separately.",
      nextConditions: "Complete pressure, doping, gap type, SOC, functional, U / strain, and other critical conditions; unknown conditions cannot form formal consensus.",
      nextVerification: "Use a controlled adapter to verify model family, version, run provenance, source, and condition completeness; unverified imports remain comparative only.",
      nextNovelty: "Complete composition and structure matching against dated Materials Project / COD / literature snapshots.",
      nextStability: "Build stability evidence with relaxation, formation energy, hull energy, and phonons.",
      nextConflict: "Audit pressure, temperature, doping, functional, model versions, and units to explain disagreement.",
      nextTarget: "Recalculate the target with a target-specific calibrated model or DFT.",
      nextExperiment: "After synthesis, validate structure and the target property experimentally; model agreement cannot replace experiment.",
      reportTitle: "Multi-model materials candidate consensus report",
      reportDownloaded: "Analysis report downloaded.",
      jsonDownloaded: "Normalized result JSON exported.",
      campaignDownloaded: "Discovery campaign exported. It is a compute plan and does not submit a billable job.",
      templateDownloaded: "Model result template downloaded.",
      restored: "Restored {count} locally saved model results.",
      storageFailed: "Local storage is unavailable or full. Export the current report before refreshing.",
      demo: "Demo data · excluded from formal evidence"
    }
  };

  function gcd(a, b) {
    let x = Math.abs(Math.round(a));
    let y = Math.abs(Math.round(b));
    while (y) [x, y] = [y, x % y];
    return x || 1;
  }

  function addCounts(target, source, multiplier = 1) {
    Object.entries(source).forEach(([symbol, count]) => {
      target[symbol] = (target[symbol] || 0) + count * multiplier;
    });
  }

  function canonicalComposition(value) {
    const formula = String(value ?? "").replace(/\s+/g, "").trim();
    if (!formula || formula.length > 160) throw new Error("INVALID_FORMULA");
    const decimalTokens = formula.match(/(?:\d+)?\.(\d+)/g) || [];
    if (decimalTokens.some(token => (token.split(".")[1] || "").replace(/0+$/, "").length > 8)) {
      throw new Error("STOICHIOMETRY_PRECISION_EXCEEDED");
    }
    let index = 0;

    function parseNumber() {
      const match = formula.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
      if (!match) return 1;
      index += match[0].length;
      const number = Number(match[0]);
      if (!Number.isFinite(number) || number <= 0) throw new Error("INVALID_STOICHIOMETRY");
      return number;
    }

    function parseGroup(stopCharacter = "") {
      const counts = {};
      let terms = 0;
      while (index < formula.length && (!stopCharacter || formula[index] !== stopCharacter)) {
        if (formula[index] === "(") {
          index += 1;
          const nested = parseGroup(")");
          if (formula[index] !== ")") throw new Error("UNBALANCED_FORMULA");
          index += 1;
          addCounts(counts, nested, parseNumber());
          terms += 1;
          continue;
        }
        const match = formula.slice(index).match(/^([A-Z][a-z]?)/);
        if (!match || !ELEMENTS.has(match[1])) throw new Error("INVALID_ELEMENT");
        index += match[1].length;
        counts[match[1]] = (counts[match[1]] || 0) + parseNumber();
        terms += 1;
      }
      if (!terms) throw new Error("EMPTY_GROUP");
      return counts;
    }

    const counts = parseGroup();
    if (index !== formula.length) throw new Error("INVALID_FORMULA");
    const symbols = Object.keys(counts).sort();
    const compositionScale = 100000000;
    const scaled = symbols.map(symbol => {
      const exact = counts[symbol] * compositionScale;
      const rounded = Math.round(exact);
      if (!Number.isSafeInteger(rounded) || rounded <= 0 || Math.abs(exact - rounded) > 1e-5) {
        throw new Error("STOICHIOMETRY_PRECISION_EXCEEDED");
      }
      return rounded;
    });
    let divisor = scaled.reduce((current, number) => gcd(current, number), 0) || 1;
    const reduced = scaled.map(number => number / divisor);
    const total = reduced.reduce((sum, number) => sum + number, 0);
    const reducedFormula = symbols.map((symbol, i) => `${symbol}${reduced[i] === 1 ? "" : reduced[i]}`).join("");
    return {
      input: formula,
      key: symbols.map((symbol, i) => `${symbol}:${reduced[i]}`).join("|"),
      reducedFormula,
      elements: symbols,
      counts: Object.fromEntries(symbols.map((symbol, i) => [symbol, reduced[i]])),
      fractions: Object.fromEntries(symbols.map((symbol, i) => [symbol, reduced[i] / total]))
    };
  }

  function firstValue(source, keys) {
    for (const key of keys) {
      const value = source?.[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") return value;
    }
    return null;
  }

  function allValues(source, keys) {
    return keys.map(key => source?.[key]).filter(value => value !== undefined && value !== null && String(value).trim() !== "");
  }

  function finiteNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value !== "string") return null;
    const text = value.trim();
    if (!/^[+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:e[+-]?\d+)?$/i.test(text)) return null;
    const number = Number(text);
    return Number.isFinite(number) ? number : null;
  }

  function bounded01(value) {
    const text = String(value ?? "").trim().replace(/\s+/g, "");
    const percent = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))%$/.exec(text);
    const number = percent ? Number(percent[1]) / 100 : finiteNumber(value);
    if (number === null) return null;
    const normalized = !percent && number > 1 && number <= 100 ? number / 100 : number;
    return normalized >= 0 && normalized <= 1 ? normalized : null;
  }

  function normalizedStage(value) {
    const stage = String(value || "unknown").trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (/^(?:not|non)_/.test(stage) || /^not(?:experiment|dft|reproduc)/.test(stage)) return "unknown";
    if (/^(?:unvalidated|uncalibrated)_?ml$/.test(stage)) return "ml";
    if (/^(?:llm|gpt|deepseek|language_model|reported_by_llm)$/.test(stage)) return "llm";
    if (/^(?:independent_reproduction|independent_replication|reproduced|replicated)$/.test(stage)) return "independent_reproduction";
    if (/^(?:experiment|experimental|measured|observed)$/.test(stage)) return "experiment";
    if (/^(?:literature|paper|peer_reviewed|literature_report)$/.test(stage)) return "literature";
    if (/^(?:database|reference|database_record)$/.test(stage)) return "database";
    if (/^(?:dft|ab_initio|first_principles|quantum_espresso|abacus)$/.test(stage)) return "dft";
    if (/^(?:validated_ml|calibrated_ml)$/.test(stage)) return "validated_ml";
    if (/^(?:machine_learning|ml|mattersim|chgnet|openlam|interatomic_potential|ml_potential)$/.test(stage)) return "ml";
    if (/^(?:rule|rules|heuristic)$/.test(stage)) return "rule";
    if (/^(?:task|task_planning|planning|suggestion|preview|task_preview)$/.test(stage)) return "task_planning";
    return "unknown";
  }

  function canonicalFamilyKey(value) {
    return scalarText(value, 160).normalize("NFKC").toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g, "");
  }

  function inferTarget(source, properties) {
    const targetValues = allValues(source, ["target_definition", "target", "property", "task"]);
    const normalizedTargets = targetValues.map(explicit => {
      if (typeof explicit === "object") {
        if (containsPlaceholderDeep(explicit)) {
          const keys = Object.keys(properties);
          return keys.length === 1 ? keys[0] : "general";
        }
        return normalizedCondition(explicit, 240);
      }
      const canonical = canonicalPropertyName(explicit);
      if (canonical) return canonical;
      const normalized = normalizedCondition(explicit, 160).replace(/[\s-]+/g, "_");
      if (["magnetic", "magnetism"].includes(normalized)) return "magnetic_moment_muB";
      return normalized;
    });
    if (new Set(normalizedTargets).size > 1) throw new Error("CONFLICTING_TARGET_ALIASES");
    if (normalizedTargets.length) {
      return normalizedTargets[0];
    }
    const keys = Object.keys(properties);
    return keys.length === 1 ? keys[0] : "general";
  }

  function validSnapshotDate(value) {
    const text = scalarText(value, 120);
    if (!/^\d{4}-\d{2}-\d{2}(?:T\S+)?$/.test(text) || !Number.isFinite(Date.parse(text))) return false;
    try {
      const date = new Date(text);
      return date.toISOString().slice(0, 10) === text.slice(0, 10)
        && date.getUTCFullYear() >= 1900
        && date.getTime() <= Date.now();
    } catch (_) {
      return false;
    }
  }

  function normalizeNovelty(source, context = {}) {
    const raw = String(firstValue(source, ["novelty_status", "novelty", "known_status"]) || "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
    const hasReference = meaningfulEvidenceText(context.sourceLabel) || meaningfulEvidenceText(context.doi);
    const hasScreenSnapshot = context.structureResolved === true && hasReference && validSnapshotDate(context.dataCutoff);
    if (!raw) return source?.novelty_checked === true && hasScreenSnapshot ? "screened_unverified" : "not_checked";
    if (/^(?:unknown|not_known|unchecked|not_checked)$/.test(raw)) return "not_checked";
    if (/^(?:no_match|not_found|not_reported|unmatched|screened_unverified|novel_candidate|new_candidate)(?:_|$)/.test(raw)) {
      return hasScreenSnapshot ? "screened_unverified" : "not_checked";
    }
    if (/^(?:known|known_reference|matched|reference_match|reported|database_match|literature_match)(?:_|$)/.test(raw)) {
      return hasReference ? "known_reference" : "not_checked";
    }
    return source?.novelty_checked === true && hasScreenSnapshot ? "screened_unverified" : "not_checked";
  }

  const PROPERTY_ALIASES = Object.freeze({
    tc_K: ["tc_K", "Tc_K", "tc", "Tc", "critical_temperature_K"],
    band_gap_eV: ["band_gap_eV", "bandgap_eV", "band_gap", "bandgap"],
    formation_energy_eV_atom: ["formation_energy_eV_atom", "formation_energy", "e_form_eV_atom"],
    e_above_hull_eV_atom: ["e_above_hull_eV_atom", "energy_above_hull", "e_hull", "ehull"],
    magnetic_moment_muB: ["magnetic_moment_muB", "magmom", "magnetic_moment"]
  });

  function canonicalPropertyName(value) {
    const raw = String(value || "").trim();
    if (PROPERTY_META[raw]) return raw;
    const lower = raw.toLowerCase();
    return Object.entries(PROPERTY_ALIASES).find(([property, aliases]) => property.toLowerCase() === lower || aliases.some(alias => alias.toLowerCase() === lower))?.[0] || "";
  }

  function normalizedUnit(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/µ/g, "μ")
      .replace(/kelvin/g, "k")
      .replace(/electronvolts?/g, "ev")
      .replace(/millielectronvolts?/g, "mev")
      .replace(/peratom/g, "/atom")
      .replace(/atom\^-?1|atom-1/g, "/atom")
      .replace(/[·*\s]+/g, "");
  }

  function normalizePressureGPa(source) {
    const aliases = [
      ["pressure_GPa", "gpa"],
      ["pressure_gpa", "gpa"],
      ["pressure_MPa", "mpa"],
      ["pressure_mpa", "mpa"],
      ["pressure_kbar", "kbar"],
      ["pressure", "gpa"]
    ];
    const values = [];
    for (const [key, defaultUnit] of aliases) {
      const raw = source?.[key];
      if (raw === undefined || raw === null || String(raw).trim() === "") continue;
      const block = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : null;
      if (block && (containsPlaceholderDeep(block) || containsOutOfRangeNumberDeep(block))) throw new Error("INVALID_PRESSURE");
      const rawValues = block ? allValues(block, ["value", "mean"]) : [raw];
      if (!rawValues.length) throw new Error("INVALID_PRESSURE");
      const unitValues = [block?.unit, source?.pressure_unit, source?.units?.pressure]
        .filter(value => value !== undefined && value !== null && String(value).trim() !== "")
        .map(value => String(value).trim().toLowerCase().replace(/gigapascals?/, "gpa").replace(/megapascals?/, "mpa").replace(/kilopascals?/, "kpa").replace(/pascals?/, "pa").replace(/\s+/g, ""));
      if (new Set(unitValues).size > 1) throw new Error("CONFLICTING_PRESSURE_UNITS");
      const unit = unitValues[0] || defaultUnit;
      if (key !== "pressure" && unit !== defaultUnit) throw new Error("CONFLICTING_PRESSURE_UNITS");
      const convertedValues = rawValues.map(rawValue => {
        const value = finiteNumber(rawValue);
        if (value === null || value < 0) throw new Error("INVALID_PRESSURE");
        const converted = unit === "gpa" ? value
          : (unit === "mpa" ? value / 1000
            : (unit === "kpa" ? value / 1e6
              : (unit === "pa" ? value / 1e9
                : (unit === "kbar" ? value * 0.1
                  : (unit === "bar" ? value / 10000 : null)))));
        if (converted === null) throw new Error("UNSUPPORTED_PRESSURE_UNIT");
        if (!Number.isFinite(converted) || converted < 0 || converted > 1e6) throw new Error("INVALID_PRESSURE");
        return converted;
      });
      if (new Set(convertedValues.map(value => value.toPrecision(12))).size > 1) throw new Error("CONFLICTING_PRESSURE_VALUE_ALIASES");
      values.push(convertedValues[0]);
    }
    if (!values.length) return null;
    const reference = values[0];
    if (values.some(value => Math.abs(value - reference) > Math.max(1e-12, Math.abs(reference) * 1e-12))) {
      throw new Error("CONFLICTING_PRESSURE_ALIASES");
    }
    return reference;
  }

  function normalizeTemperatureK(source) {
    const aliases = [
      ["temperature_K", "k"],
      ["temperature_k", "k"],
      ["temperature_C", "c"],
      ["temperature_c", "c"],
      ["temperature", "k"]
    ];
    const values = [];
    for (const [key, defaultUnit] of aliases) {
      const raw = source?.[key];
      if (raw === undefined || raw === null || String(raw).trim() === "") continue;
      const block = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : null;
      if (block && (containsPlaceholderDeep(block) || containsOutOfRangeNumberDeep(block))) throw new Error("INVALID_TEMPERATURE");
      const rawValues = block ? allValues(block, ["value", "mean"]) : [raw];
      if (!rawValues.length) throw new Error("INVALID_TEMPERATURE");
      const unitValues = [block?.unit, source?.temperature_unit, source?.units?.temperature]
        .filter(value => value !== undefined && value !== null && String(value).trim() !== "")
        .map(value => String(value).trim().toLowerCase().replace(/kelvin/, "k").replace(/degrees?celsius|celsius|degc|°c/, "c").replace(/\s+/g, ""));
      if (new Set(unitValues).size > 1) throw new Error("CONFLICTING_TEMPERATURE_UNITS");
      const unit = unitValues[0] || defaultUnit;
      if (key !== "temperature" && unit !== defaultUnit) throw new Error("CONFLICTING_TEMPERATURE_UNITS");
      const convertedValues = rawValues.map(rawValue => {
        const value = finiteNumber(rawValue);
        if (value === null) throw new Error("INVALID_TEMPERATURE");
        const kelvin = unit === "k" ? value : (unit === "c" ? value + 273.15 : null);
        if (kelvin === null) throw new Error("UNSUPPORTED_TEMPERATURE_UNIT");
        if (kelvin < 0 || kelvin > 1e7) throw new Error("INVALID_TEMPERATURE");
        return kelvin;
      });
      if (new Set(convertedValues.map(value => value.toPrecision(12))).size > 1) throw new Error("CONFLICTING_TEMPERATURE_VALUE_ALIASES");
      values.push(convertedValues[0]);
    }
    if (!values.length) return null;
    const reference = values[0];
    if (values.some(value => Math.abs(value - reference) > Math.max(1e-9, Math.abs(reference) * 1e-12))) {
      throw new Error("CONFLICTING_TEMPERATURE_ALIASES");
    }
    return reference;
  }

  function convertPropertyMeasurement(property, rawValue, rawUnit, requireUnit = false) {
    const number = finiteNumber(rawValue);
    if (number === null) return null;
    const validated = value => {
      const meta = PROPERTY_META[property];
      if (!meta || value < meta.min || value > meta.max) {
        throw new Error("INVALID_PROPERTY_RANGE");
      }
      return value;
    };
    const unit = normalizedUnit(rawUnit);
    if (!unit && requireUnit) throw new Error("MISSING_PROPERTY_UNIT");
    if (!unit) return validated(number);
    if (property === "tc_K") {
      if (unit === "k") return validated(number);
    } else if (property === "band_gap_eV") {
      if (unit === "ev") return validated(number);
      if (unit === "mev") return validated(number / 1000);
    } else if (["formation_energy_eV_atom", "e_above_hull_eV_atom"].includes(property)) {
      if (unit === "ev/atom") return validated(number);
      if (unit === "mev/atom") return validated(number / 1000);
    } else if (property === "magnetic_moment_muB") {
      if (["μb", "mub", "bohrmagneton", "bohrmagnetons"].includes(unit)) return validated(number);
    }
    throw new Error("UNSUPPORTED_PROPERTY_UNIT");
  }

  function normalizeProperties(source) {
    const measurements = new Map();
    Object.entries(PROPERTY_ALIASES).forEach(([property, aliases]) => {
      const found = [];
      for (const alias of aliases) {
        if (source?.[alias] === undefined || source?.[alias] === null || String(source[alias]).trim() === "") continue;
        found.push({ alias, raw: source[alias] });
      }
      if (found.length) measurements.set(property, found);
    });
    if (source?.properties && typeof source.properties === "object" && !Array.isArray(source.properties)) {
      Object.keys(PROPERTY_META).forEach(property => {
        if (source.properties[property] !== undefined && source.properties[property] !== null && String(source.properties[property]).trim() !== "") {
          if (!measurements.has(property)) measurements.set(property, []);
          measurements.get(property).push({ alias: property, raw: source.properties[property], nested: true });
        }
      });
    }
    const genericProperty = canonicalPropertyName(firstValue(source, ["target_definition", "target", "property"]));
    if (genericProperty && finiteNumber(source?.value) !== null) {
      if (!measurements.has(genericProperty)) measurements.set(genericProperty, []);
      measurements.get(genericProperty).push({ alias: "value", raw: source.value });
    }

    const properties = {};
    measurements.forEach((propertyMeasurements, property) => {
      const values = propertyMeasurements.flatMap(measurement => {
        const rawObject = measurement.raw && typeof measurement.raw === "object" && !Array.isArray(measurement.raw)
          ? measurement.raw
          : null;
        const rawValues = rawObject ? allValues(rawObject, ["value", "mean", "prediction"]) : [measurement.raw];
        if (!rawValues.length) throw new Error("INVALID_PROPERTY_VALUE");
        const unitValues = [
          ...allValues(source, [`${property}_unit`, `${measurement.alias}_unit`]),
          source?.units?.[property],
          source?.units?.[measurement.alias],
          rawObject?.unit
        ].filter(value => value !== undefined && value !== null && String(value).trim() !== "");
        const normalizedUnits = unitValues.map(normalizedUnit);
        if (new Set(normalizedUnits).size > 1) throw new Error("CONFLICTING_PROPERTY_UNITS");
        const specificUnit = unitValues[0] || "";
        const genericUnit = measurements.size === 1 ? source?.unit : "";
        if (measurements.size > 1 && source?.unit && !specificUnit) throw new Error("AMBIGUOUS_PROPERTY_UNIT");
        if (specificUnit && genericUnit && normalizedUnit(specificUnit) !== normalizedUnit(genericUnit)) throw new Error("CONFLICTING_PROPERTY_UNITS");
        return rawValues.map(rawValue => {
          const converted = convertPropertyMeasurement(property, rawValue, specificUnit || genericUnit, false);
          if (converted === null) throw new Error("INVALID_PROPERTY_VALUE");
          return converted;
        });
      }).filter(value => value !== null);
      if (!values.length) return;
      const reference = values[0];
      if (values.some(value => Math.abs(value - reference) > Math.max(1e-12, Math.abs(reference) * 1e-12))) {
        throw new Error("CONFLICTING_PROPERTY_ALIASES");
      }
      properties[property] = reference;
    });
    return properties;
  }

  function normalizePropertyApplicability(source, properties) {
    const applicability = {};
    const propertyNames = Object.keys(properties);
    propertyNames.forEach(property => {
      const blocks = [source?.calibration?.[property], source?.calibrations?.[property]].filter(block => block && typeof block === "object" && !Array.isArray(block));
      const rawValues = [
        ...blocks.flatMap(block => allValues(block, ["applicability", "applicability_score", "domain_score"])),
        ...allValues(source, [`${property}_applicability`]),
        source?.applicability_by_property?.[property],
        ...allValues(source, ["applicability", "applicability_score", "domain_score"])
      ].filter(value => value !== undefined && value !== null && String(value).trim() !== "");
      const values = rawValues.map(raw => {
        const value = bounded01(raw);
        if (value === null) throw new Error("INVALID_APPLICABILITY");
        return value;
      });
      if (new Set(values.map(value => value.toPrecision(12))).size > 1) throw new Error("CONFLICTING_APPLICABILITY_ALIASES");
      if (values.length) applicability[property] = values[0];
    });
    return applicability;
  }

  function normalizeCalibration(source, properties, applicabilityByProperty = {}) {
    const calibration = {};
    const propertyNames = Object.keys(properties);
    propertyNames.forEach(property => {
      const blocks = [source?.calibration?.[property], source?.calibrations?.[property]].filter(block => block && typeof block === "object" && !Array.isArray(block));
      const legacyAllowed = propertyNames.length === 1;
      const q90Values = [
        ...blocks.flatMap(block => allValues(block, ["q90", "calibration_q90", "validation_q90"])),
        ...allValues(source, [`${property}_calibration_q90`, `calibration_q90_${property}`]),
        ...(legacyAllowed ? allValues(source, ["calibration_q90", "q90", "validation_q90"]) : [])
      ];
      if (!q90Values.length) return;
      const unitValues = [
        ...blocks.flatMap(block => allValues(block, ["unit", "q90_unit"])),
        ...allValues(source, [`${property}_calibration_unit`, `calibration_unit_${property}`]),
        ...(legacyAllowed ? allValues(source, ["calibration_unit", "q90_unit"]) : [])
      ];
      if (new Set(unitValues.map(normalizedUnit)).size > 1) throw new Error("CONFLICTING_CALIBRATION_UNITS");
      const unit = unitValues[0] || "";
      const normalizedQ90 = q90Values.map(raw => {
        if (finiteNumber(raw) === null || finiteNumber(raw) <= 0) throw new Error("INVALID_CALIBRATION_Q90");
        if (!unit) throw new Error("MISSING_CALIBRATION_UNIT");
        return convertPropertyMeasurement(property, raw, unit, true);
      });
      if (new Set(normalizedQ90.map(value => value.toPrecision(12))).size > 1) throw new Error("CONFLICTING_CALIBRATION_Q90_ALIASES");
      const applicability = applicabilityByProperty[property] ?? null;
      const rawValidationSets = [
        ...blocks.flatMap(block => allValues(block, ["validation_set", "calibration_set"])),
        ...allValues(source, [`${property}_validation_set`]),
        ...(legacyAllowed ? allValues(source, ["validation_set", "calibration_set"]) : [])
      ];
      if (rawValidationSets.some(value => typeof value !== "string")) throw new Error("INVALID_VALIDATION_SET");
      const validationSets = rawValidationSets.map(value => redactSensitiveText(value, 220)).filter(Boolean);
      if (new Set(validationSets.map(value => value.normalize("NFKC").toLowerCase())).size > 1) throw new Error("CONFLICTING_VALIDATION_SET_ALIASES");
      const validationSet = validationSets[0] || "";
      if (!unit || applicability === null || !validationSet || isPlaceholderValue(validationSet) || isSyntheticIdentifier(validationSet)) return;
      calibration[property] = {
        q90: normalizedQ90[0],
        unit: PROPERTY_META[property].unit,
        applicability,
        validation_set: validationSet,
        coverage: 0.9
      };
    });
    return calibration;
  }

  function safeText(value, max = 2000) {
    return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
  }

  const SENSITIVE_CREDENTIAL_KEY = /^(?:api[_-]?key|access[_-]?token|auth(?:orization)?|password|passwd|secret|client[_-]?secret|private[_-]?key|signature|credential|x[-_]?(?:api[-_]?key|auth[-_]?token)|x[-_]amz[-_](?:credential|signature|security[-_]token)|x[-_]goog[-_](?:credential|signature)|sig|token)$/i;

  function redactSensitiveText(value, max = 2000) {
    let text = safeText(value, max);
    text = text.replace(/https?:\/\/[^\s<>"']+/gi, candidate => {
      try {
        const parsed = new URL(candidate);
        parsed.username = "";
        parsed.password = "";
        Array.from(parsed.searchParams.keys()).forEach(key => {
          if (SENSITIVE_CREDENTIAL_KEY.test(key)) parsed.searchParams.delete(key);
        });
        return parsed.toString();
      } catch (_) {
        return candidate;
      }
    });
    text = text.replace(/((?:^|[?&;\s])(?:api[_-]?key|access[_-]?token|auth(?:orization)?|password|passwd|secret|client[_-]?secret|private[_-]?key|signature|credential|x[-_]amz[-_](?:credential|signature|security[-_]token)|x[-_]goog[-_](?:credential|signature)|sig|token)\s*[=:]\s*)[^&#;\s]+/gi, "$1[REDACTED]");
    return text.replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]");
  }

  function redactSensitiveValueDeep(value, depth = 0) {
    if (depth > 6) throw new Error("CREDENTIAL_SCAN_DEPTH_EXCEEDED");
    if (Array.isArray(value)) return value.map(item => redactSensitiveValueDeep(item, depth + 1));
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, redactSensitiveValueDeep(nested, depth + 1)]));
    }
    return typeof value === "string" ? redactSensitiveText(value, 2000) : value;
  }

  function assertNoSensitiveCredentialFields(value, depth = 0) {
    if (!value || typeof value !== "object") return;
    if (depth > 8) throw new Error("CREDENTIAL_SCAN_DEPTH_EXCEEDED");
    Object.entries(value).forEach(([key, nested]) => {
      if (SENSITIVE_CREDENTIAL_KEY.test(key)) throw new Error("SENSITIVE_CREDENTIAL_FIELD");
      assertNoSensitiveCredentialFields(nested, depth + 1);
    });
  }

  function containsPotentialCredentials(value, depth = 0) {
    if (depth > 8) return true;
    if (Array.isArray(value)) return value.some(item => containsPotentialCredentials(item, depth + 1));
    if (value && typeof value === "object") {
      return Object.entries(value).some(([key, nested]) => SENSITIVE_CREDENTIAL_KEY.test(key) || containsPotentialCredentials(nested, depth + 1));
    }
    if (typeof value !== "string") return false;
    const text = value.replace(/\[REDACTED\]/gi, "");
    return /\bBearer\s+[A-Za-z0-9._~+\/-]{8,}/i.test(text)
      || /(?:^|[?&;\s])(?:api[_-]?key|access[_-]?token|auth(?:orization)?|password|passwd|secret|client[_-]?secret|private[_-]?key|signature|credential|sig|token)\s*[=:]\s*[^&#;\s]{4,}/i.test(text)
      || /https?:\/\/[^/@\s]+:[^/@\s]+@/i.test(text);
  }

  function scalarText(value, max = 2000) {
    if (typeof value !== "string") return "";
    return safeText(value, max);
  }

  function decodedText(value, rounds = 8) {
    let current = String(value ?? "").trim();
    for (let index = 0; index < rounds; index += 1) {
      let next;
      try {
        next = decodeURIComponent(current);
      } catch (_) {
        return { valid: false, value: current };
      }
      if (next === current) return { valid: true, value: current };
      current = next.trim();
    }
    return { valid: !/%[0-9a-f]{2}/i.test(current), value: current };
  }

  function conditionKeyPart(value) {
    if (value === null || value === undefined || String(value).trim() === "") return "unspecified";
    if (typeof value === "number") return Number(value).toPrecision(8);
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "object") {
      const stable = Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]]));
      return JSON.stringify(stable).toLowerCase();
    }
    return String(value).replace(/\u0000/g, "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function normalizedCondition(value, max = 160) {
    if (value === null || value === undefined || String(value).trim() === "") return "";
    if (typeof value === "boolean") return value ? "on" : "off";
    const redacted = redactSensitiveValueDeep(value);
    const raw = typeof redacted === "object"
      ? JSON.stringify(Object.fromEntries(Object.keys(redacted).sort().map(key => [key, redacted[key]])))
      : String(redacted);
    const normalized = raw.replace(/\u0000/g, "").trim().toLowerCase().replace(/\s+/g, " ");
    if (normalized.length > max) throw new Error("CONDITION_TOO_LONG");
    return normalized;
  }

  function isPlaceholderValue(value) {
    if (value !== null && typeof value === "object") return true;
    const raw = safeText(value, 240).normalize("NFKC").toLowerCase();
    const decoded = /%[0-9a-f]{2}/i.test(raw) ? decodedText(raw) : { valid: true, value: raw };
    const original = decoded.valid ? decoded.value.normalize("NFKC").toLowerCase() : "";
    const compact = original.replace(/[^a-z0-9\u3400-\u9fff]+/g, "");
    return !original
      || /^(?:na|nd|nil|none|null|unknown|unavailable|nodata|notknown|undetermined|notdetermined|tobedetermined|unspecified|notspecified|notapplicable|notavailable|notprovided|notreported|notmeasured|notcalculated|notset|notgiven|missing|pending|awaiting|tba|tbd|tbc|undefined)$/.test(compact)
      || /(?:unknown|unavailable|nodata|notmeasured|notcalculated|notdetermined|tobedetermined|pending|awaiting|notprovided|notreported|notavailable|notapplicable|missing|unspecified)/.test(compact)
      || /^(?:tba|tbd|tbc)(?:\b|[\s:;,_-])/.test(original)
      || /(?:not(?:yet|currently)?(?:provided|known|measured|supplied|reported|calculated|available|determined)|tobe(?:provided|supplied|updated|reported)|willbe(?:provided|supplied|updated|reported))/.test(compact)
      || /(?:未知|未确定|未提供|未报告|无数据|未测量|未计算|不适用|待定|待补充)/.test(original)
      || /(?:稍后|后续|尚未|待)(?:补充|提供|确定|确认|更新|测量|计算|报告)/.test(original)
      || /^(?:未知|未确定|未指定|未提供|未报告|无数据|未测量|未计算|暂无|无|不适用|不详|待定|待补充)$/.test(compact)
      || /^[?\-–—]+$/.test(original);
  }

  function isSyntheticIdentifier(value) {
    const text = scalarText(value, 260).normalize("NFKC").trim().toLowerCase();
    return isPlaceholderValue(text)
      || /^(?:placeholder|dummy|todo|tbc|temporary)(?:[-_: ]?.*)?$/.test(text)
      || /^temp(?:[-_: ]|\d|$)/.test(text);
  }

  function meaningfulCondition(value) {
    return !isPlaceholderValue(value);
  }

  function containsPlaceholderDeep(value, depth = 0) {
    if (depth > 6) return true;
    if (value === null || value === undefined) return true;
    if (typeof value !== "object") return isPlaceholderValue(value);
    const entries = Array.isArray(value) ? value : Object.values(value);
    if (!entries.length) return true;
    return entries.some(item => containsPlaceholderDeep(item, depth + 1));
  }

  function containsOutOfRangeNumberDeep(value, limit = 1e100, depth = 0) {
    if (depth > 6) return true;
    if (value === null || value === undefined) return false;
    if (typeof value !== "object") {
      const numeric = finiteNumber(value);
      return numeric !== null && Math.abs(numeric) > limit;
    }
    const entries = Array.isArray(value) ? value : Object.values(value);
    return entries.some(item => containsOutOfRangeNumberDeep(item, limit, depth + 1));
  }

  function containsNonStringLeaf(value, depth = 0) {
    if (depth > 6) return true;
    if (!value || typeof value !== "object") return typeof value !== "string";
    if (Array.isArray(value)) return true;
    const values = Object.values(value);
    return !values.length || values.some(item => containsNonStringLeaf(item, depth + 1));
  }

  function normalizeNamedCondition(source, keys, max = 240, options = {}) {
    const normalized = allValues(source, keys).map(raw => {
      if (typeof raw === "boolean" && options.allowBoolean !== true) throw new Error("INVALID_CONDITION_TYPE");
      if (typeof raw === "number" && options.allowNumber !== true) throw new Error("INVALID_CONDITION_TYPE");
      if (raw && typeof raw === "object" && containsNonStringLeaf(raw)) throw new Error("INVALID_CONDITION_TYPE");
      return containsPlaceholderDeep(raw) ? "not provided" : normalizedCondition(raw, max);
    });
    if (!normalized.length) return "";
    if (new Set(normalized).size > 1) throw new Error("CONFLICTING_CONDITION_ALIASES");
    return normalized[0];
  }

  function normalizeExperimentalMethod(source) {
    const values = allValues(source, ["experimental_method", "method_evidence"]);
    if (values.some(value => typeof value !== "string")) throw new Error("INVALID_EXPERIMENTAL_METHOD");
    return normalizeNamedCondition(source, ["experimental_method", "method_evidence"], 300);
  }

  function conditionUnit(value) {
    const raw = scalarText(value, 81);
    if (raw.length > 80) throw new Error("CONDITION_UNIT_TOO_LONG");
    return raw.toLowerCase().replace(/µ/g, "μ").replace(/\s+/g, "");
  }

  function conditionNumber(value) {
    const number = finiteNumber(value);
    return number === null ? "" : Number(number).toPrecision(12).replace(/(?:\.0+|(?:(\.\d*?[1-9]))0+)$/, "$1");
  }

  function conditionMeasurement(source, aliases, unitKeys, errorName, converter = null) {
    const selections = aliases.flatMap(alias => {
      const raw = source?.[alias.key];
      return raw !== undefined && raw !== null && String(raw).trim() !== "" ? [{ ...alias, raw }] : [];
    });
    if (!selections.length) return "";
    const topLevelUnits = allValues(source, unitKeys).map(conditionUnit);
    if (new Set(topLevelUnits).size > 1) throw new Error(`CONFLICTING_${errorName}_UNITS`);

    const normalizedSelections = selections.map(selected => {
      const block = selected.raw && typeof selected.raw === "object" && !Array.isArray(selected.raw) ? selected.raw : null;
      if (block && containsPlaceholderDeep(block)) return "not provided";
      const rawValue = block ? firstValue(block, ["value", "amount", "level", "mean"]) : selected.raw;
      const rawValues = block ? allValues(block, ["value", "amount", "level", "mean"]) : [selected.raw];
      if (!rawValues.length) throw new Error(`INVALID_${errorName}`);
      const numericValues = rawValues.map(finiteNumber);
      if (numericValues.some(value => value === null) && numericValues.some(value => value !== null)) {
        throw new Error(`CONFLICTING_${errorName}_VALUE_ALIASES`);
      }
      const numeric = numericValues[0];
      const blockUnit = block?.unit;
      if (blockUnit !== null && blockUnit !== undefined && isPlaceholderValue(blockUnit)) return "not provided";
      if (topLevelUnits.some(unit => isPlaceholderValue(unit))) return "not provided";
      const normalizedBlockUnit = blockUnit === null || blockUnit === undefined ? "" : conditionUnit(blockUnit);
      if (normalizedBlockUnit && topLevelUnits.length && normalizedBlockUnit !== topLevelUnits[0]) {
        throw new Error(`CONFLICTING_${errorName}_UNITS`);
      }
      const unit = normalizedBlockUnit || topLevelUnits[0] || conditionUnit(selected.defaultUnit || "");
      if (selected.defaultUnit && unit && conditionUnit(selected.defaultUnit) !== unit) {
        throw new Error(`CONFLICTING_${errorName}_UNITS`);
      }
      if (rawValue !== null && rawValue !== undefined && isPlaceholderValue(rawValue)) return "not provided";
      const blockMetadata = block
        ? Object.fromEntries(Object.keys(block)
          .filter(key => !["value", "amount", "level", "mean", "unit"].includes(key))
          .sort()
          .map(key => [key, block[key]]))
        : {};
      if (containsOutOfRangeNumberDeep(block || rawValue)) throw new Error(`INVALID_${errorName}`);
      if (numeric !== null) {
        if (!unit && numeric !== 0) throw new Error(`MISSING_${errorName}_UNIT`);
        const convertedValues = numericValues.map(value => converter ? converter(value, unit || "explicit_zero") : { value, unit: unit || "explicit_zero" });
        if (convertedValues.some(converted => !Number.isFinite(converted?.value) || Math.abs(converted.value) > 1e100)) throw new Error(`INVALID_${errorName}`);
        if (new Set(convertedValues.map(converted => `${conditionNumber(converted.value)}|${conditionUnit(converted.unit)}`)).size > 1) {
          throw new Error(`CONFLICTING_${errorName}_VALUE_ALIASES`);
        }
        const converted = convertedValues[0];
        const metadata = Object.keys(blockMetadata).length ? `|meta:${normalizedCondition(blockMetadata, 360)}` : "";
        return `${conditionNumber(converted.value)}|unit:${conditionUnit(converted.unit)}${metadata}`;
      }
      if (block) {
        const stable = Object.fromEntries(Object.keys(block).filter(key => key !== "unit").sort().map(key => [key, block[key]]));
        if (!Object.keys(stable).length) throw new Error(`INVALID_${errorName}`);
        if (containsPlaceholderDeep(stable)) return "not provided";
        if (!unit && Object.values(stable).some(value => finiteNumber(value) !== null)) throw new Error(`MISSING_${errorName}_UNIT`);
        return `${normalizedCondition(stable, 360)}${unit ? `|unit:${unit}` : ""}`;
      }
      const text = normalizedCondition(rawValue, 240);
      if (!text) throw new Error(`INVALID_${errorName}`);
      return `${text}${unit ? `|unit:${unit}` : ""}`;
    });
    if (new Set(normalizedSelections).size > 1) throw new Error(`CONFLICTING_${errorName}_ALIASES`);
    return normalizedSelections[0];
  }

  function normalizeDoping(source) {
    return conditionMeasurement(source, [
      { key: "doping", defaultUnit: "" },
      { key: "doping_level", defaultUnit: "" },
      { key: "carrier_concentration", defaultUnit: "" }
    ], ["doping_unit", "carrier_unit"], "DOPING");
  }

  function normalizeHubbardU(source) {
    return conditionMeasurement(source, [
      { key: "hubbard_u_eV", defaultUnit: "eV" },
      { key: "hubbard_u", defaultUnit: "" },
      { key: "hubbard_U", defaultUnit: "" },
      { key: "dft_u", defaultUnit: "" }
    ], ["hubbard_u_unit", "dft_u_unit"], "HUBBARD_U", (value, unit) => {
      const converted = ["ev", "explicit_zero"].includes(unit) ? value
        : (unit === "mev" ? value / 1000
          : (["ry", "rydberg", "rydbergs"].includes(unit) ? value * 13.605693122994 : null));
      if (converted === null) throw new Error("UNSUPPORTED_HUBBARD_U_UNIT");
      if (converted < 0 || converted > 1000) throw new Error("INVALID_HUBBARD_U");
      return { value: converted, unit: "eV" };
    });
  }

  function normalizeStrain(source) {
    return conditionMeasurement(source, [
      { key: "strain_percent", defaultUnit: "%" },
      { key: "strain", defaultUnit: "" },
      { key: "epitaxial_strain", defaultUnit: "" }
    ], ["strain_unit"], "STRAIN", (value, unit) => {
      const converted = ["%", "percent", "percentage", "explicit_zero"].includes(unit) ? value
        : (["fraction", "unitless", "1"].includes(unit) ? value * 100 : null);
      if (converted === null) throw new Error("UNSUPPORTED_STRAIN_UNIT");
      if (Math.abs(converted) > 1000) throw new Error("INVALID_STRAIN");
      return { value: converted, unit: "%" };
    });
  }

  function inferredStructureNamespace(structureId) {
    const value = scalarText(structureId, 241).toLowerCase();
    if (value.length > 240) throw new Error("STRUCTURE_ID_TOO_LONG");
    if (/^mp-\d+$/.test(value)) return "materials_project";
    if (/^cod[-_:]?\d+$/.test(value)) return "cod";
    if (/^oqmd[-_:]?\d+$/.test(value)) return "oqmd";
    if (/^icsd[-_:]?\d+$/.test(value)) return "icsd";
    if (/^aflow[:_-]/.test(value)) return "aflow";
    if (/^[a-z][a-z0-9_.-]{1,40}:[^:]+$/.test(value)) return value.split(":", 1)[0];
    return "";
  }

  function normalizedStructureId(value) {
    const text = scalarText(value, 241);
    if (text.length > 240) throw new Error("STRUCTURE_ID_TOO_LONG");
    return meaningfulCondition(text) && !isSyntheticIdentifier(text) && text.length >= 2 && !/\s/.test(text) ? text : "";
  }

  function normalizedStructureNamespace(value) {
    const raw = scalarText(value, 81);
    if (raw.length > 80) throw new Error("STRUCTURE_NAMESPACE_TOO_LONG");
    const text = raw.toLowerCase().replace(/[\s-]+/g, "_");
    return meaningfulCondition(text) && !isSyntheticIdentifier(text) && /^[a-z][a-z0-9_.]{1,79}$/.test(text) ? text : "";
  }

  function normalizedStructureHash(value) {
    const text = scalarText(value, 241);
    if (text.length > 240) throw new Error("STRUCTURE_HASH_TOO_LONG");
    if (!meaningfulCondition(text) || isSyntheticIdentifier(text)) return "";
    return /^(?:sha256|blake3):[a-f0-9]{64}$/i.test(text)
      || /^sha1:[a-f0-9]{40}$/i.test(text)
      || /^md5:[a-f0-9]{32}$/i.test(text)
      ? text.toLowerCase()
      : "";
  }

  function normalizedEvidenceId(value) {
    const text = scalarText(value, 241).normalize("NFKC");
    if (!text) return "";
    if (text.length > 240) throw new Error("EVIDENCE_ID_TOO_LONG");
    if (text.length < 8 || isSyntheticIdentifier(text) || !/^[a-z0-9][a-z0-9._:/-]{7,239}$/i.test(text)) {
      throw new Error("INVALID_EVIDENCE_ID");
    }
    return text;
  }

  function meaningfulEvidenceText(value) {
    const text = safeText(value, 500);
    if (text.length < 3) return false;
    return !isPlaceholderValue(text);
  }

  function decodedReferencePartsAreMeaningful(parts) {
    if (!parts.length) return false;
    return parts.every(part => {
      const decoded = decodedText(String(part || ""));
      if (!decoded.valid) return false;
      const decodedParts = hierarchicalReferenceParts(decoded.value);
      return decodedParts.length > 0 && decodedParts.every(item => Boolean(item.trim()) && !isPlaceholderValue(item));
    });
  }

  function hierarchicalReferenceParts(value, separator = "/") {
    const parts = String(value || "").split(separator).filter(Boolean);
    return parts.concat(parts.length > 1 ? [parts.slice(-2).join(separator)] : []);
  }

  function meaningfulRawReference(value) {
    const text = safeText(value, 500);
    if (!meaningfulEvidenceText(text)) return false;
    if (/^https?:\/\//i.test(text)) {
      try {
        const parsed = new URL(text);
        const pathParts = parsed.pathname.split("/").filter(Boolean);
        const parts = pathParts
          .concat(pathParts.length > 1 ? [pathParts.slice(-2).join("/")] : [])
          .concat(Array.from(parsed.searchParams.values()).filter(Boolean))
          .concat(parsed.hash ? [parsed.hash.slice(1)] : []);
        return Boolean(parsed.hostname) && decodedReferencePartsAreMeaningful(parts);
      } catch (_) {
        return false;
      }
    }
    if (/^doi:/i.test(text)) {
      const match = /^doi:10\.\d{4,9}\/(\S{2,})$/i.exec(text);
      return Boolean(match && decodedReferencePartsAreMeaningful(hierarchicalReferenceParts(match[1])));
    }
    if (/^urn:/i.test(text)) {
      const match = /^urn:[a-z0-9][a-z0-9-]{1,31}:(\S{3,})$/i.exec(text);
      return Boolean(match && decodedReferencePartsAreMeaningful(hierarchicalReferenceParts(match[1], ":")));
    }
    if (/^ipfs:/i.test(text)) {
      const match = /^ipfs:\/\/((?:Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,}))(?:\/(\S+))?$/i.exec(text);
      return Boolean(match && (!match[2] || decodedReferencePartsAreMeaningful(hierarchicalReferenceParts(match[2]))));
    }
    if (/^s3:/i.test(text)) {
      const match = /^s3:\/\/([^/\s]{3,63})\/(\S+)$/i.exec(text);
      return Boolean(match && decodedReferencePartsAreMeaningful(hierarchicalReferenceParts(match[2])));
    }
    return false;
  }

  function canonicalDoi(value) {
    let text = scalarText(value, 500).trim();
    if (/^https?:\/\//i.test(text)) {
      try {
        const parsed = new URL(text);
        const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
        if (!/^(?:dx\.)?doi\.org$/.test(host)) return "";
        text = parsed.pathname.replace(/^\/+|\/+$/g, "");
      } catch (_) {
        return "";
      }
    } else {
      text = text.replace(/^doi:\s*/i, "").split(/[?#]/, 1)[0].replace(/\/+$/, "");
    }
    const decoded = decodedText(text);
    if (!decoded.valid) return "";
    text = decoded.value.trim();
    const match = /^(10\.\d{4,9})\/(\S{2,})$/i.exec(text);
    if (!match || !decodedReferencePartsAreMeaningful(hierarchicalReferenceParts(match[2]))) return "";
    return `${match[1].toLowerCase()}/${match[2].toLowerCase()}`;
  }

  function normalizeEscapedUnreserved(value) {
    return String(value || "").replace(/%[0-9a-f]{2}/gi, token => {
      const character = String.fromCharCode(Number.parseInt(token.slice(1), 16));
      return /^[a-z0-9\-._~]$/i.test(character) ? character : token.toUpperCase();
    });
  }

  function isIdentityQueryParameter(key, hostname = "", protocol = "") {
    if (/^versionid$/i.test(key) && (protocol === "s3:" || /(?:^|\.)amazonaws\.com$/i.test(hostname))) return true;
    if (/^generation$/i.test(key) && /(?:^|\.)(?:googleapis\.com|storage\.googleapis\.com)$/i.test(hostname)) return true;
    if (/^(?:snapshot|versionid)$/i.test(key) && /\.blob\.core\.windows\.net$/i.test(hostname)) return true;
    return false;
  }

  function canonicalRawReference(value) {
    const text = scalarText(value, 500);
    if (!meaningfulRawReference(text)) return "";
    if (/^(?:https?|s3):\/\//i.test(text)) {
      try {
        const parsed = new URL(text);
        parsed.protocol = parsed.protocol.toLowerCase();
        const hostname = parsed.hostname.toLowerCase();
        parsed.hostname = hostname.endsWith(".") && !hostname.includes(":") ? hostname.slice(0, -1) : hostname;
        parsed.username = "";
        parsed.password = "";
        if ((parsed.protocol === "https:" && parsed.port === "443") || (parsed.protocol === "http:" && parsed.port === "80")) parsed.port = "";
        parsed.hash = "";
        const parameters = Array.from(parsed.searchParams.entries())
          .filter(([key]) => isIdentityQueryParameter(key, parsed.hostname, parsed.protocol))
          .sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue));
        parsed.search = "";
        parameters.forEach(([key, parameterValue]) => parsed.searchParams.append(key, parameterValue));
        parsed.pathname = normalizeEscapedUnreserved(parsed.pathname);
        if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, "");
        return parsed.toString();
      } catch (_) {
        return "";
      }
    }
    const doi = canonicalDoi(text);
    if (doi) return `doi:${doi}`;
    const withoutFragment = text.split(/[?#]/, 1)[0];
    const urn = /^urn:([^:]+):(.*)$/i.exec(withoutFragment);
    if (urn) return `urn:${urn[1].toLowerCase()}:${normalizeEscapedUnreserved(urn[2])}`;
    const ipfs = /^ipfs:\/\/([^/]+)(.*)$/i.exec(withoutFragment);
    if (ipfs) {
      const cid = /^b/i.test(ipfs[1]) ? ipfs[1].toLowerCase() : ipfs[1];
      return `ipfs://${cid}${normalizeEscapedUnreserved(ipfs[2])}`;
    }
    return withoutFragment.replace(/^([a-z][a-z0-9+.-]*):/i, (_, scheme) => `${scheme.toLowerCase()}:`);
  }

  function independentEvidenceKeys(record) {
    const keys = [];
    const sourceRefs = Array.isArray(record.source_refs) ? record.source_refs : [record.source];
    const rawDataRefs = Array.isArray(record.raw_data_refs) ? record.raw_data_refs : [record.raw_data_url];
    const doiRefs = Array.isArray(record.doi_refs) ? record.doi_refs : [record.doi];
    const dois = [...doiRefs, ...rawDataRefs, ...sourceRefs].map(canonicalDoi).filter(Boolean);
    dois.forEach(doi => keys.push(`doi:${doi}`));
    rawDataRefs.map(canonicalRawReference).filter(Boolean).forEach(raw => keys.push(`url:${raw}`));
    sourceRefs.map(canonicalRawReference).filter(Boolean).forEach(sourceRaw => keys.push(`url:${sourceRaw}`));
    const evidenceIds = Array.isArray(record.evidence_ids) ? record.evidence_ids : [record.evidence_id];
    evidenceIds.filter(id => meaningfulCondition(id)).forEach(id => keys.push(`evidence:${id.toLowerCase()}`));
    if (record.stage === "database" && record.structure_identity_resolved) {
      keys.push(record.structure_hash
        ? `database-hash:${record.structure_hash.toLowerCase()}`
        : `database-id:${record.structure_namespace}:${record.structure_id.toLowerCase()}`);
    }
    return Array.from(new Set(keys));
  }

  function normalizeCandidate(source, defaults = {}, adapterToken = null) {
    if (!source || typeof source !== "object" || Array.isArray(source)) throw new Error("INVALID_CANDIDATE");
    assertNoSensitiveCredentialFields(source);
    const adapterTrusted = adapterToken === TRUSTED_ADAPTER_TOKEN;
    const formulaValues = allValues(source, ["formula", "material_formula", "material", "composition"]);
    const compositions = formulaValues.map(canonicalComposition);
    if (new Set(compositions.map(item => item.key)).size > 1) throw new Error("CONFLICTING_FORMULA_ALIASES");
    const formulaValue = formulaValues[0];
    const recommendation = redactSensitiveText(firstValue(source, ["recommendation", "rationale", "summary", "suggestion", "prediction", "text"]));
    if (!formulaValue && !recommendation) throw new Error("MISSING_IDENTITY");
    const composition = compositions[0] || null;
    const properties = normalizeProperties(source);
    const applicabilityByProperty = normalizePropertyApplicability(source, properties);
    const calibration = normalizeCalibration(source, properties, applicabilityByProperty);
    const targetDefinition = inferTarget({ ...source, target: source.target || defaults.target }, properties);
    const rawStructureIds = allValues(source, ["structure_id", "material_id", "database_id"]);
    const normalizedStructureIds = rawStructureIds.map(normalizedStructureId);
    if (normalizedStructureIds.some(value => !value) && normalizedStructureIds.some(Boolean)) throw new Error("CONFLICTING_STRUCTURE_ID_ALIASES");
    const structureIds = normalizedStructureIds.filter(Boolean);
    if (new Set(structureIds.map(value => value.toLowerCase())).size > 1) throw new Error("CONFLICTING_STRUCTURE_ID_ALIASES");
    const structureId = structureIds[0] || "";
    const rawStructureHashes = allValues(source, ["structure_hash", "coordinate_hash", "cif_hash"]);
    const normalizedStructureHashes = rawStructureHashes.map(normalizedStructureHash);
    if (normalizedStructureHashes.some(value => !value) && normalizedStructureHashes.some(Boolean)) throw new Error("CONFLICTING_STRUCTURE_HASH_ALIASES");
    const structureHashes = normalizedStructureHashes.filter(Boolean);
    if (new Set(structureHashes).size > 1) throw new Error("CONFLICTING_STRUCTURE_HASH_ALIASES");
    const structureHash = structureHashes[0] || "";
    const rawStructureNamespaces = allValues(source, ["structure_namespace", "database_namespace", "database", "namespace"]);
    const normalizedStructureNamespaces = rawStructureNamespaces.map(normalizedStructureNamespace);
    if (normalizedStructureNamespaces.some(value => !value) && normalizedStructureNamespaces.some(Boolean)) throw new Error("CONFLICTING_STRUCTURE_NAMESPACE_ALIASES");
    const structureNamespaces = normalizedStructureNamespaces.filter(Boolean);
    if (new Set(structureNamespaces).size > 1) throw new Error("CONFLICTING_STRUCTURE_NAMESPACE_ALIASES");
    const structureNamespace = (structureNamespaces[0] || "")
      || normalizedStructureNamespace(inferredStructureNamespace(structureId));
    const normalizedSpaceGroup = normalizeNamedCondition(source, ["space_group", "spacegroup"], 160);
    const spaceGroup = meaningfulCondition(normalizedSpaceGroup) ? normalizedSpaceGroup : "";
    const pressureGPa = normalizePressureGPa(source);
    const temperatureK = normalizeTemperatureK(source);
    const doping = normalizeDoping(source);
    const functional = normalizeNamedCondition(source, ["functional", "dft_functional", "method"]);
    const gapType = normalizeNamedCondition(source, ["gap_type", "band_gap_type", "transition_type"]);
    const spinOrbitCoupling = normalizeNamedCondition(source, ["spin_orbit_coupling", "spin_orbit", "spin_orbit_enabled", "soc", "include_soc"], 240, { allowBoolean: true });
    const hubbardU = normalizeHubbardU(source);
    const magneticOrder = normalizeNamedCondition(source, ["magnetic_order", "spin_order", "magnetic_state"]);
    const strain = normalizeStrain(source);
    const dimensionality = normalizeNamedCondition(source, ["dimensionality", "dimension", "layer_count"], 240, { allowNumber: true });
    const substrate = normalizeNamedCondition(source, ["substrate", "support", "interface"]);
    const phaseLabel = normalizeNamedCondition(source, ["phase", "phase_label", "polymorph"]);
    const conditionsReportedComplete = source.conditions_complete === true;
    const conditionsComplete = adapterTrusted && defaults.conditionsComplete === true;
    const hasConditionsAlias = source?.conditions !== undefined && source?.conditions !== null;
    const hasCanonicalExtraConditions = source?.extra_conditions !== undefined && source?.extra_conditions !== null;
    if (hasConditionsAlias && hasCanonicalExtraConditions
      && JSON.stringify(source.conditions) !== JSON.stringify(source.extra_conditions)) {
      throw new Error("CONFLICTING_CONDITION_ALIASES");
    }
    const explicitConditions = hasConditionsAlias ? source.conditions : source.extra_conditions;
    const hasExplicitConditions = hasConditionsAlias || hasCanonicalExtraConditions;
    const validConditionsObject = hasExplicitConditions && typeof explicitConditions === "object" && !Array.isArray(explicitConditions);
    if (validConditionsObject && Object.keys(explicitConditions).length > 64) throw new Error("TOO_MANY_CONDITIONS");
    const typedConditionKey = /^(?:pressure(?:[_-]?(?:gpa|mpa|kpa|pa|kbar|bar|unit))?|temperature(?:[_-]?(?:k|c|unit))?|doping(?:[_-]?(?:level|unit))?|carrier(?:[_-]?(?:concentration|unit))?|hubbard[_-]?(?:u|u[_-]?ev|u[_-]?unit)|dft[_-]?(?:u|u[_-]?unit)|strain(?:[_-]?(?:percent|unit))?|epitaxial[_-]?strain|functional|dft[_-]?functional|gap[_-]?type|band[_-]?gap[_-]?type|transition[_-]?type|spin[_-]?orbit(?:[_-]?(?:coupling|enabled))?|soc|include[_-]?soc|magnetic[_-]?(?:order|state)|spin[_-]?order|substrate|support|interface|phase|phase[_-]?label|polymorph|space[_-]?group|spacegroup)$/i;
    if (validConditionsObject && Object.keys(explicitConditions).some(key => typedConditionKey.test(key))) {
      throw new Error("TYPED_CONDITION_MUST_BE_TOP_LEVEL");
    }
    const extraConditions = validConditionsObject
      ? Object.fromEntries(Object.keys(explicitConditions).sort().map(key => {
        const normalizedKey = scalarText(key, 81);
        if (!normalizedKey || normalizedKey.length > 80) throw new Error("CONDITION_KEY_TOO_LONG");
        if (containsOutOfRangeNumberDeep(explicitConditions[key])) throw new Error("INVALID_CONDITION_RANGE");
        return [normalizedKey, normalizedCondition(explicitConditions[key], 240)];
      }))
      : {};
    if (JSON.stringify(extraConditions).length > 6000) throw new Error("CONDITIONS_TOO_LONG");
    const extraConditionsInvalid = source.extra_conditions_invalid === true || (hasExplicitConditions
      ? (!validConditionsObject || (Object.keys(explicitConditions).length > 0 && containsPlaceholderDeep(explicitConditions)))
      : false);
    const modelAliases = allValues(source, ["model", "model_name", "source_model"]).map(value => scalarText(value, 160)).filter(Boolean);
    if (new Set(modelAliases.map(value => value.normalize("NFKC").toLowerCase())).size > 1) throw new Error("CONFLICTING_MODEL_ALIASES");
    const model = modelAliases[0] || scalarText(defaults.model || "Unspecified model", 160) || "Unspecified model";
    const modelVersions = allValues(source, ["model_version", "version", "checkpoint"]).map(value => scalarText(value, 120)).filter(Boolean);
    if (new Set(modelVersions.map(value => value.normalize("NFKC").toLowerCase())).size > 1) throw new Error("CONFLICTING_MODEL_VERSION_ALIASES");
    const modelVersion = modelVersions[0] || "";
    const roleAliases = allValues(source, ["role", "model_role", "participant_role"])
      .map(value => scalarText(value, 80).toLowerCase()).filter(Boolean);
    if (new Set(roleAliases).size > 1) throw new Error("CONFLICTING_MODEL_ROLE_ALIASES");
    const actorRole = /^(?:host|chair|orchestrator|coordinator)$/.test(roleAliases[0] || "") ? "orchestrator" : "worker";
    const familyAliases = allValues(source, ["model_family", "family"]).map(value => scalarText(value, 120).toLowerCase()).filter(Boolean);
    if (new Set(familyAliases.map(canonicalFamilyKey)).size > 1) throw new Error("CONFLICTING_MODEL_FAMILY_ALIASES");
    const rawModelFamily = familyAliases[0] || scalarText(defaults.modelFamily, 120).toLowerCase();
    const explicitModelFamily = meaningfulCondition(rawModelFamily) && !isSyntheticIdentifier(rawModelFamily) ? rawModelFamily : "";
    const modelFamily = explicitModelFamily || `unresolved:${model.toLowerCase()}`;
    const modelFamilyKey = explicitModelFamily ? canonicalFamilyKey(explicitModelFamily) : `unresolved${canonicalFamilyKey(model)}`;
    const stageAliases = allValues(source, ["stage", "evidence_level", "result_type"]).map(normalizedStage);
    if (new Set(stageAliases).size > 1) throw new Error("CONFLICTING_STAGE_ALIASES");
    const stage = stageAliases[0] || normalizedStage(defaults.stage);
    const sourceInputs = allValues(source, ["source", "provenance", "source_url", "source_refs"])
      .flatMap(value => Array.isArray(value) ? value : [value]);
    const sourceRefs = Array.from(new Set(sourceInputs.map(value => {
      const text = scalarText(value, 500);
      return canonicalRawReference(text) || redactSensitiveText(text, 500);
    }).filter(Boolean)));
    const sourceLabel = sourceRefs[0] || "";
    const doiInputs = allValues(source, ["doi", "paper_doi", "doi_refs"])
      .flatMap(value => Array.isArray(value) ? value : [value]);
    const doiRefs = Array.from(new Set(doiInputs.map(canonicalDoi).filter(Boolean)));
    const doi = doiRefs[0] || "";
    const dataCutoff = redactSensitiveText(firstValue(source, ["data_cutoff", "training_cutoff", "reference_snapshot"]), 120);
    const experimentalMethod = normalizeExperimentalMethod(source);
    const rawDataInputs = allValues(source, ["raw_data_url", "raw_evidence", "raw_data_refs"])
      .flatMap(value => Array.isArray(value) ? value : [value]);
    const rawDataRefs = Array.from(new Set(rawDataInputs.map(value => {
      const text = scalarText(value, 500);
      return canonicalRawReference(text) || redactSensitiveText(text, 500);
    }).filter(Boolean)));
    const rawDataUrl = rawDataRefs[0] || "";
    const evidenceIdValues = allValues(source, ["evidence_id", "run_id", "calculation_id", "job_id", "content_hash", "evidence_ids"])
      .flatMap(value => Array.isArray(value) ? value : [value]);
    const evidenceIds = Array.from(new Set(evidenceIdValues.map(normalizedEvidenceId)));
    const evidenceId = evidenceIds[0] || "";
    const supersededEvidenceInputs = allValues(source, ["supersedes_evidence_id", "supersedes_evidence_ids", "retracts_evidence_id", "retracts_evidence_ids"])
      .flatMap(value => Array.isArray(value) ? value : [value]);
    if (supersededEvidenceInputs.length > 64) throw new Error("TOO_MANY_SUPERSEDED_EVIDENCE_IDS");
    const supersedesEvidenceIds = Array.from(new Set(supersededEvidenceInputs.map(normalizedEvidenceId).filter(Boolean)));
    const taskIds = allValues(source, ["task_id", "assigned_task_id", "orchestration_task_id"]).map(value => scalarText(value, 241));
    if (taskIds.some(value => value.length > 240)) throw new Error("TASK_ID_TOO_LONG");
    if (new Set(taskIds).size > 1) throw new Error("CONFLICTING_TASK_ID_ALIASES");
    const assignedTaskId = meaningfulCondition(taskIds[0]) ? taskIds[0] : "";
    if (assignedTaskId && !/^material-task-[a-f0-9]{16}$/i.test(assignedTaskId)) throw new Error("INVALID_TASK_ID");
    const structureIdentityResolved = Boolean(structureHash || (structureId && structureNamespace));
    const demo = source.demo === true || /^(?:true|1|yes|on|demo)$/i.test(String(source.demo || "").trim());
    const verificationStatus = adapterTrusted && defaults.verified === true ? "verified_internal" : "imported_unverified";
    const sourceFamilyVerified = adapterTrusted && defaults.trustedSourceFamily === true && Boolean(explicitModelFamily) && Boolean(modelFamilyKey);
    const hasStructuredExperiment = adapterTrusted && defaults.trustedEvidence === true
      && stage === "experiment"
      && meaningfulEvidenceText(experimentalMethod)
      && rawDataRefs.some(meaningfulRawReference);
    const hasTraceableEvidence = independentEvidenceKeys({
      stage,
      doi,
      source: sourceLabel,
      source_refs: sourceRefs,
      raw_data_url: rawDataUrl,
      raw_data_refs: rawDataRefs,
      evidence_id: evidenceId,
      evidence_ids: evidenceIds,
      doi,
      doi_refs: doiRefs,
      assigned_task_id: assignedTaskId,
      structure_identity_resolved: structureIdentityResolved,
      structure_hash: structureHash,
      structure_namespace: structureNamespace,
      structure_id: structureId
    }).length > 0;
    const eligibleForConsensus = actorRole === "worker" && adapterTrusted && defaults.eligibleForConsensus === true
      && defaults.verified === true
      && defaults.trustedEvidence === true
      && sourceFamilyVerified
      && hasTraceableEvidence
      && NUMERIC_EVIDENCE_STAGES.has(stage)
      && !demo
      && (stage !== "experiment" || hasStructuredExperiment);
    const claimState = hasStructuredExperiment
      ? "experimental_observation"
      : (adapterTrusted && defaults.trustedEvidence === true && (doi || stage === "literature") ? "literature_report" : (stage === "dft" ? "computed_candidate" : "model_candidate"));
    const structureKey = structureHash
      ? `hash:${structureHash.toLowerCase()}|spacegroup:${conditionKeyPart(spaceGroup)}`
      : (structureIdentityResolved
        ? `namespace:${structureNamespace}|id:${structureId.toLowerCase()}|spacegroup:${conditionKeyPart(spaceGroup)}`
        : `structure:unresolved|local-id:${conditionKeyPart(structureId)}|spacegroup:${conditionKeyPart(spaceGroup)}`);
    const conditionsKey = [
      targetDefinition,
      pressureGPa,
      temperatureK,
      doping,
      functional,
      gapType,
      spinOrbitCoupling,
      hubbardU,
      magneticOrder,
      strain,
      dimensionality,
      substrate,
      phaseLabel,
      extraConditions
    ].map(conditionKeyPart).join("|");
    const identityBase = composition ? `composition:${composition.key}` : `text:${normalizedTextKey(recommendation)}`;

    const record = {
      schema: SCHEMA,
      model,
      model_version: modelVersion,
      actor_role: actorRole,
      model_family: modelFamily,
      model_family_key: modelFamilyKey,
      stage,
      stage_weight: STAGE_WEIGHT[stage],
      formula: composition?.input || "",
      reduced_formula: composition?.reducedFormula || "",
      composition_key: composition?.key || "",
      elements: composition?.elements || [],
      element_fractions: composition?.fractions || {},
      structure_id: structureId,
      structure_hash: structureHash,
      structure_namespace: structureNamespace,
      structure_identity_resolved: structureIdentityResolved,
      space_group: spaceGroup,
      target_definition: targetDefinition,
      pressure_GPa: pressureGPa,
      temperature_K: temperatureK,
      doping,
      functional,
      gap_type: gapType,
      spin_orbit_coupling: spinOrbitCoupling,
      hubbard_u: hubbardU,
      magnetic_order: magneticOrder,
      strain,
      dimensionality,
      substrate,
      phase_label: phaseLabel,
      extra_conditions: extraConditions,
      extra_conditions_invalid: extraConditionsInvalid,
      conditions_reported_complete: conditionsReportedComplete,
      conditions_complete: conditionsComplete,
      properties,
      applicability_by_property: applicabilityByProperty,
      confidence_reported: bounded01(firstValue(source, ["confidence", "score", "probability"])),
      calibration,
      data_cutoff: dataCutoff,
      recommendation,
      source: sourceLabel,
      source_refs: sourceRefs,
      doi,
      doi_refs: doiRefs,
      experimental_method: experimentalMethod,
      raw_data_url: rawDataUrl,
      raw_data_refs: rawDataRefs,
      evidence_id: evidenceId,
      evidence_ids: evidenceIds,
      supersedes_evidence_ids: supersedesEvidenceIds,
      assigned_task_id: assignedTaskId,
      novelty_status: normalizeNovelty(source, { structureResolved: structureIdentityResolved, sourceLabel, doi, dataCutoff }),
      claim_state: claimState,
      demo,
      verification_status: verificationStatus,
      source_family_verified: sourceFamilyVerified,
      eligible_for_consensus: eligibleForConsensus,
      identity_key: `${identityBase}|${structureKey}|conditions:${conditionsKey}${demo ? "|demo:yes" : ""}`
    };
    if (containsPotentialCredentials(record)) throw new Error("SENSITIVE_CREDENTIAL_MATERIAL");
    if (adapterTrusted) {
      TRUSTED_NORMALIZED_RECORDS.add(record);
      return deepFreeze(record);
    }
    return record;
  }

  function normalizedTextKey(value) {
    return safeText(value, 2000)
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/[^a-z0-9\u3400-\u9fff]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function textFeatures(value) {
    const normalized = normalizedTextKey(value);
    const features = new Set(normalized.match(/[a-z0-9]{2,}/g) || []);
    const chinese = (normalized.match(/[\u3400-\u9fff]/g) || []).join("");
    for (let index = 0; index < chinese.length - 1; index += 1) features.add(chinese.slice(index, index + 2));
    return features;
  }

  function jaccard(left, right) {
    if (!left.size || !right.size) return 0;
    let intersection = 0;
    left.forEach(value => { if (right.has(value)) intersection += 1; });
    return intersection / (left.size + right.size - intersection);
  }

  function parseDelimited(text, delimiter = "") {
    const source = String(text || "").replace(/^\uFEFF/, "");
    const selected = delimiter || ((source.split(/\r?\n/, 1)[0].match(/\t/g) || []).length > (source.split(/\r?\n/, 1)[0].match(/,/g) || []).length ? "\t" : ",");
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    for (let index = 0; index < source.length; index += 1) {
      const character = source[index];
      if (character === '"') {
        if (quoted && source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else quoted = !quoted;
      } else if (character === selected && !quoted) {
        row.push(field.trim());
        field = "";
      } else if ((character === "\n" || character === "\r") && !quoted) {
        if (character === "\r" && source[index + 1] === "\n") index += 1;
        row.push(field.trim());
        field = "";
        if (row.some(Boolean)) rows.push(row);
        row = [];
      } else field += character;
    }
    row.push(field.trim());
    if (row.some(Boolean)) rows.push(row);
    if (quoted) throw new Error("UNBALANCED_CSV_QUOTE");
    if (rows.length < 2) throw new Error("EMPTY_TABLE");
    const headers = rows[0].map(header => header.trim());
    return rows.slice(1).map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
  }

  function parseInputText(text, filename = "") {
    const source = String(text || "").trim();
    if (!source) throw new Error("EMPTY_INPUT");
    if (/\.json$/i.test(filename) || /^[\[{]/.test(source)) return JSON.parse(source);
    return parseDelimited(source, /\.tsv$/i.test(filename) ? "\t" : "");
  }

  function extractCandidateObjects(payload, defaults = {}) {
    if (Array.isArray(payload)) return payload.flatMap(item => extractCandidateObjects(item, defaults));
    if (!payload || typeof payload !== "object") return [];
    if (Array.isArray(payload.models)) {
      return payload.models.flatMap(modelBlock => extractCandidateObjects(
        modelBlock.candidates || modelBlock.results || [],
        { ...defaults, model: modelBlock.model || modelBlock.name || defaults.model }
      ));
    }
    if (Array.isArray(payload.results)) return extractCandidateObjects(payload.results, { ...defaults, model: payload.model || defaults.model });
    if (Array.isArray(payload.candidates)) return extractCandidateObjects(payload.candidates, { ...defaults, model: payload.model || defaults.model });
    return [{ source: payload, defaults }];
  }

  function normalizePayload(payload, defaults = {}) {
    const records = [];
    const errors = [];
    extractCandidateObjects(payload, defaults).slice(0, MAX_RECORDS).forEach((entry, index) => {
      try {
        records.push(normalizeCandidate(entry.source, entry.defaults));
      } catch (error) {
        errors.push({ index, message: error?.message || "INVALID_CANDIDATE" });
      }
    });
    return { records, errors };
  }

  function weightedMedian(entries, accessor = entry => entry.value) {
    if (!entries.length) return null;
    const sorted = [...entries].sort((left, right) => accessor(left) - accessor(right));
    const total = sorted.reduce((sum, entry) => sum + entry.weight, 0);
    let cumulative = 0;
    for (const entry of sorted) {
      cumulative += entry.weight;
      if (cumulative >= total / 2) return accessor(entry);
    }
    return accessor(sorted[sorted.length - 1]);
  }

  function propertyTolerance(property, center, calibratedQ90 = null) {
    const base = PROPERTY_META[property].tolerance;
    const relative = property === "tc_K" ? Math.abs(center) * 0.15 : 0;
    return Math.max(base, relative, calibratedQ90 || 0);
  }

  function propertyConditionsComplete(record, property) {
    if (record.extra_conditions_invalid) return false;
    const declaredConditions = [record.doping, record.functional, record.gap_type, record.spin_orbit_coupling, record.hubbard_u, record.magnetic_order, record.strain, record.dimensionality, record.substrate, record.phase_label];
    if (declaredConditions.some(value => value && !meaningfulCondition(value))) return false;
    return record.conditions_complete === true;
  }

  function summarizeNumericEntries(entries, property, useCalibrationTolerance = false) {
    if (!entries.length) return null;
    const median = weightedMedian(entries);
    const deviations = entries.map(entry => ({ ...entry, deviation: Math.abs(entry.value - median) }));
    const mad = weightedMedian(deviations, entry => entry.deviation) || 0;
    const values = entries.map(entry => entry.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const q90Values = entries.filter(entry => entry.calibrated).map(entry => entry.calibration.q90).sort((a, b) => a - b);
    const q90Median = q90Values.length ? q90Values[Math.floor(q90Values.length / 2)] : null;
    const tolerance = propertyTolerance(property, median, useCalibrationTolerance ? q90Median : null);
    const ratioConflict = property === "tc_K" && min > 0 && max / min > 1.75;
    const zeroVsPositive = property === "tc_K" && min <= 0 && max > 0;
    const metalVsFiniteGap = property === "band_gap_eV" && min <= 0.01 && max >= 0.05;
    const precisionLimit = Math.max(PROPERTY_META[property].tolerance * 3, Math.abs(median) * 0.35);
    return {
      value: median,
      min,
      max,
      mad: 1.4826 * mad,
      q90_median: q90Median,
      conflict: entries.length > 1 && ((max - min) > tolerance || ratioConflict || zeroVsPositive || metalVsFiniteGap),
      tolerance,
      precision_ok: q90Median === null || q90Median <= precisionLimit
    };
  }

  function capNumericFamilyWeights(entries) {
    const capped = entries.map(entry => ({ ...entry }));
    const families = new Map();
    capped.forEach(entry => {
      const family = entry.record.model_family_key || canonicalFamilyKey(entry.record.model_family || entry.record.model);
      if (!families.has(family)) families.set(family, []);
      families.get(family).push(entry);
    });
    families.forEach(familyEntries => {
      const total = familyEntries.reduce((sum, entry) => sum + entry.weight, 0);
      if (total > 1.5) familyEntries.forEach(entry => { entry.weight *= 1.5 / total; });
    });
    return capped;
  }

  function deduplicateNumericModels(entries) {
    const byModel = new Map();
    entries.forEach(entry => {
      const key = entry.record.model.toLowerCase();
      const current = byModel.get(key);
      if (!current
        || (entry.eligible && !current.eligible)
        || (entry.eligible === current.eligible && entry.weight > current.weight)) {
        byModel.set(key, entry);
      }
    });
    return Array.from(byModel.values());
  }

  function deduplicateIndependentEvidence(entries) {
    const parent = entries.map((_, index) => index);
    const keyOwner = new Map();
    const find = index => {
      let root = index;
      while (parent[root] !== root) root = parent[root];
      while (parent[index] !== index) {
        const next = parent[index];
        parent[index] = root;
        index = next;
      }
      return root;
    };
    const union = (left, right) => {
      const leftRoot = find(left);
      const rightRoot = find(right);
      if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
    };
    entries.forEach((entry, index) => {
      independentEvidenceKeys(entry.record).forEach(key => {
        if (keyOwner.has(key)) union(index, keyOwner.get(key));
        else keyOwner.set(key, index);
      });
    });
    const selected = new Map();
    entries.forEach((entry, index) => {
      const root = find(index);
      const current = selected.get(root);
      if (!current
        || (entry.eligible && !current.eligible)
        || (entry.eligible === current.eligible && entry.weight > current.weight)) {
        selected.set(root, entry);
      }
    });
    return Array.from(selected.values());
  }

  function aggregateNumeric(records, property, identityResolved = false) {
    const rawEntries = [];
    records.forEach(record => {
      if (!NUMERIC_EVIDENCE_STAGES.has(record.stage)) return;
      const value = finiteNumber(record.properties[property]);
      if (value === null) return;
      const calibration = record.eligible_for_consensus ? record.calibration?.[property] : null;
      const propertyApplicability = record.applicability_by_property?.[property];
      const propertyEligible = record.eligible_for_consensus && propertyApplicability !== 0 && propertyConditionsComplete(record, property);
      const calibrated = Boolean(propertyEligible && calibration?.q90 > 0 && calibration?.applicability > 0 && calibration?.validation_set);
      const weight = calibrated
        ? record.stage_weight * Math.min(4, calibration.applicability / (calibration.q90 ** 2 + 1e-6))
        : (propertyEligible ? record.stage_weight : 0.35);
      const entry = { record, value, weight: Math.max(0.01, weight), calibrated, calibration, eligible: propertyEligible };
      rawEntries.push(entry);
    });
    const entries = capNumericFamilyWeights(rawEntries);
    if (!entries.length) return null;
    const eligibleEntries = capNumericFamilyWeights(deduplicateIndependentEvidence(deduplicateNumericModels(rawEntries.filter(entry => entry.eligible))));
    const eligibleAuditEntries = capNumericFamilyWeights(rawEntries.filter(entry => entry.eligible));
    const allStats = summarizeNumericEntries(entries, property, false);
    const eligibleStats = summarizeNumericEntries(eligibleEntries, property, true);
    const eligibleAuditStats = summarizeNumericEntries(eligibleAuditEntries, property, true);
    const eligibleFamilies = new Set(eligibleEntries.map(entry => entry.record.model_family_key));
    if (!identityResolved && entries.length > 1) {
      return {
        property,
        value: null,
        min: allStats.min,
        max: allStats.max,
        mad: null,
        count: entries.length,
        calibrated_count: eligibleEntries.filter(entry => entry.calibrated).length,
        eligible_count: eligibleEntries.length,
        eligible_family_count: eligibleFamilies.size,
        eligible_conflict: true,
        eligible_precision_ok: false,
        conflict: false,
        tolerance: null,
        unit: PROPERTY_META[property].unit,
        incomparable: true,
        values: entries.map(entry => ({ model: entry.record.model, value: entry.value }))
      };
    }
    return {
      property,
      value: eligibleStats?.value ?? allStats.value,
      min: allStats.min,
      max: allStats.max,
      mad: eligibleStats?.mad ?? allStats.mad,
      count: entries.length,
      calibrated_count: eligibleEntries.filter(entry => entry.calibrated).length,
      eligible_count: eligibleEntries.length,
      eligible_family_count: eligibleFamilies.size,
      eligible_conflict: eligibleStats ? (eligibleStats.conflict || Boolean(eligibleAuditStats?.conflict)) : true,
      eligible_precision_ok: eligibleStats ? eligibleStats.precision_ok : false,
      conflict: allStats.conflict || Boolean(eligibleStats?.conflict) || Boolean(eligibleAuditStats?.conflict),
      tolerance: eligibleStats?.tolerance ?? allStats.tolerance,
      unit: PROPERTY_META[property].unit,
      incomparable: false,
      values: entries.map(entry => ({ model: entry.record.model, value: entry.value }))
    };
  }

  function recommendationClusters(records) {
    const statements = [];
    records.forEach(record => {
      safeText(record.recommendation).split(/[。！？!?;；\n]+/).map(text => text.trim()).filter(text => text.length >= 6).forEach(text => {
        const features = textFeatures(text);
        let cluster = statements.find(item => jaccard(item.features, features) >= 0.72);
        if (!cluster) {
          cluster = { text, features, models: new Set() };
          statements.push(cluster);
        }
        cluster.models.add(record.model);
        if (text.length > cluster.text.length && text.length < 360) cluster.text = text;
      });
    });
    return statements
      .sort((left, right) => right.models.size - left.models.size || left.text.length - right.text.length)
      .slice(0, 4)
      .map(item => ({ text: item.text, models: Array.from(item.models).sort() }));
  }

  function noveltySummary(records) {
    const statuses = new Set(records.map(record => record.novelty_status));
    if (statuses.size > 1) return "mixed";
    return statuses.values().next().value || "not_checked";
  }

  function reviewPriority(group) {
    const records = group.records;
    const evidenceRecords = records.filter(record => record.eligible_for_consensus);
    const models = new Set(evidenceRecords.map(record => record.model.toLowerCase()));
    const families = new Set(evidenceRecords.map(record => record.model_family_key));
    const highestEvidence = evidenceRecords.length ? Math.max(...evidenceRecords.map(record => record.stage_weight)) : 0;
    const hasStructure = records.some(record => record.structure_identity_resolved);
    const hasProvenance = records.some(record => record.source || record.doi);
    const hasVersion = records.some(record => record.model_version);
    const hasCalibration = evidenceRecords.some(record => Object.values(record.calibration || {}).some(item => item?.q90 > 0 && item?.applicability > 0 && item?.validation_set));
    const hasStability = group.consensus_properties.some(property => ["formation_energy_eV_atom", "e_above_hull_eV_atom"].includes(property));
    const hasTarget = group.consensus_properties.some(property => !["formation_energy_eV_atom", "e_above_hull_eV_atom"].includes(property));
    let score = 10;
    if (hasStructure) score += 10;
    if (hasProvenance) score += 7;
    if (hasVersion) score += 3;
    score += Math.min(18, Math.max(0, models.size - 1) * 9);
    score += Math.min(10, Math.max(0, families.size - 1) * 5);
    score += Math.round(highestEvidence * 15);
    if (hasCalibration) score += 8;
    if (hasStability) score += 12;
    if (hasTarget) score += 7;
    if (group.conflicts.length) score -= Math.min(18, group.conflicts.length * 8);
    score = Math.max(0, Math.min(100, score));
    if (group.demo_only) score = Math.min(score, 25);
    return {
      score,
      level: !group.demo_only && score >= 72 && hasStructure && hasStability ? "high" : (!group.demo_only && score >= 48 ? "review" : "insufficient"),
      calibrated: hasCalibration
    };
  }

  function eligibleExperimentalProperties(group) {
    return Object.keys(group.properties || {}).filter(property => !(group.conflicts || []).includes(property)
      && group.records.some(record => record.eligible_for_consensus === true
        && Object.prototype.hasOwnProperty.call(record.properties || {}, property)
        && propertyConditionsComplete(record, property)));
  }

  function requiredExperimentalPropertiesForGroup(group) {
    const target = group.target_definition || group.records?.[0]?.target_definition || "general";
    if (target === "general") {
      const consensus = (group.consensus_properties || []).filter(property => !(group.conflicts || []).includes(property));
      return (consensus.length ? consensus : eligibleExperimentalProperties(group)).sort();
    }
    if (target === "stability") return ["formation_energy_eV_atom", "e_above_hull_eV_atom"];
    return PROPERTY_META[target] ? [target] : [];
  }

  function recordIsTargetAlignedExperiment(record, group) {
    if (record.eligible_for_consensus !== true
      || record.stage !== "experiment"
      || record.claim_state !== "experimental_observation") return false;
    return requiredExperimentalPropertiesForGroup(group).some(property =>
      Object.prototype.hasOwnProperty.call(record.properties || {}, property)
      && propertyConditionsComplete(record, property));
  }

  function formalExperimentSupportProperties(group) {
    const consensus = (group.consensus_properties || []).filter(property => !(group.conflicts || []).includes(property));
    const target = group.target_definition || group.records?.[0]?.target_definition || "general";
    if (target === "general") return consensus;
    if (target === "stability") return consensus.filter(property => ["formation_energy_eV_atom", "e_above_hull_eV_atom"].includes(property));
    return consensus.includes(target) ? [target] : [];
  }

  function nextSteps(group) {
    const steps = [];
    if (!group.records.some(record => record.structure_identity_resolved)) steps.push("structure");
    if (!group.records.some(record => record.eligible_for_consensus)) steps.push("verification");
    if (group.records.some(record => record.eligible_for_consensus && Object.keys(record.properties || {}).some(property => !propertyConditionsComplete(record, property)))) steps.push("conditions");
    if (group.novelty_status !== "known_reference") steps.push("novelty");
    const stabilitySatisfied = group.consensus_properties.some(property => ["e_above_hull_eV_atom", "formation_energy_eV_atom"].includes(property));
    if (!stabilitySatisfied) steps.push("stability");
    if (group.conflicts.length) steps.push("conflict");
    const target = group.records[0]?.target_definition || "general";
    const targetSatisfied = target === "stability"
      ? stabilitySatisfied
      : group.consensus_properties.includes(target);
    if (!["general", "stability"].includes(target) && !targetSatisfied) steps.push("target");
    if (!group.records.some(record => recordIsTargetAlignedExperiment(record, group))) steps.push("experiment");
    return [...new Set(steps)].slice(0, 4);
  }

  function analyzeRecords(inputRecords = []) {
    const deduplicated = new Map();
    inputRecords.slice(0, MAX_RECORDS).forEach(record => {
      const normalized = record?.schema === SCHEMA && TRUSTED_NORMALIZED_RECORDS.has(record)
        ? record
        : normalizeCandidate(record);
      if (normalized.actor_role === "orchestrator") return;
      const evidenceInstance = canonicalRecordProjection(normalized);
      delete evidenceInstance.formula;
      const duplicateKey = JSON.stringify(evidenceInstance);
      const current = deduplicated.get(duplicateKey);
      if (!current
        || JSON.stringify(canonicalRecordProjection(normalized)).localeCompare(JSON.stringify(canonicalRecordProjection(current))) < 0) {
        deduplicated.set(duplicateKey, normalized);
      }
    });
    const records = Array.from(deduplicated.values()).sort((left, right) =>
      JSON.stringify(canonicalRecordProjection(left)).localeCompare(JSON.stringify(canonicalRecordProjection(right))));
    const buckets = new Map();
    records.forEach(record => {
      let key = record.identity_key;
      if (!record.composition_key) {
        const conditions = record.identity_key.split("|conditions:")[1] || "";
        const match = Array.from(buckets.values()).find(bucket =>
          !bucket.records[0].composition_key &&
          !bucket.records[0].structure_identity_resolved &&
          !record.structure_identity_resolved &&
          !bucket.records[0].structure_id && !record.structure_id &&
          !bucket.records[0].structure_hash && !record.structure_hash &&
          !bucket.records[0].structure_namespace && !record.structure_namespace &&
          !bucket.records[0].space_group && !record.space_group &&
          (bucket.records[0].identity_key.split("|conditions:")[1] || "") === conditions &&
          jaccard(textFeatures(bucket.records[0].recommendation), textFeatures(record.recommendation)) >= 0.78
        );
        if (match) key = match.key;
      }
      if (!buckets.has(key)) buckets.set(key, { key, records: [] });
      buckets.get(key).records.push(record);
    });

    const groups = Array.from(buckets.values()).map(bucket => {
      const identityResolved = bucket.records.every(record => record.structure_identity_resolved === true);
      const properties = {};
      Object.keys(PROPERTY_META).forEach(property => {
        const aggregate = aggregateNumeric(bucket.records, property, identityResolved);
        if (aggregate) properties[property] = aggregate;
      });
      const conflicts = Object.values(properties).filter(property => property.conflict).map(property => property.property);
      const models = Array.from(new Set(bucket.records.map(record => record.model))).sort();
      const group = {
        key: bucket.key,
        formula: bucket.records[0].formula || "",
        reduced_formula: bucket.records[0].reduced_formula || "",
        structure_id: bucket.records[0].structure_id || "",
        structure_hash: bucket.records[0].structure_hash || "",
        structure_namespace: bucket.records[0].structure_namespace || "",
        space_group: bucket.records[0].space_group || "",
        target_definition: bucket.records[0].target_definition,
        pressure_GPa: bucket.records[0].pressure_GPa,
        temperature_K: bucket.records[0].temperature_K,
        doping: bucket.records[0].doping,
        functional: bucket.records[0].functional,
        gap_type: bucket.records[0].gap_type,
        spin_orbit_coupling: bucket.records[0].spin_orbit_coupling,
        hubbard_u: bucket.records[0].hubbard_u,
        magnetic_order: bucket.records[0].magnetic_order,
        strain: bucket.records[0].strain,
        dimensionality: bucket.records[0].dimensionality,
        substrate: bucket.records[0].substrate,
        phase_label: bucket.records[0].phase_label,
        extra_conditions: bucket.records[0].extra_conditions,
        records: bucket.records,
        models,
        model_families: Array.from(new Set(bucket.records.map(record => record.model_family))),
        evidence_model_families: Array.from(new Set(bucket.records.filter(record => record.eligible_for_consensus).map(record => record.model_family_key))),
        properties,
        conflicts,
        recommendations: recommendationClusters(bucket.records),
        novelty_status: noveltySummary(bucket.records)
      };
      group.demo_only = bucket.records.every(record => record.demo === true);
      group.identity_resolved = identityResolved;
      group.consensus_properties = Object.values(group.properties)
        .filter(property => property.eligible_family_count >= 2 && !property.eligible_conflict && property.eligible_precision_ok && !property.incomparable)
        .map(property => property.property);
      group.has_consensus_claim = !group.demo_only && group.identity_resolved && group.consensus_properties.length > 0;
      group.priority = reviewPriority(group);
      group.next_steps = nextSteps(group);
      return group;
    }).sort((left, right) => right.priority.score - left.priority.score || right.models.length - left.models.length || left.key.localeCompare(right.key));

    return {
      schema: REPORT_SCHEMA,
      created_at: new Date().toISOString(),
      raw_count: inputRecords.length,
      normalized_count: records.length,
      model_count: new Set(records.map(record => record.model)).size,
      candidate_count: groups.length,
      agreement_count: groups.filter(group => group.has_consensus_claim).length,
      conflict_count: groups.filter(group => group.conflicts.length > 0).length,
      groups
    };
  }

  function stableWorkflowId(prefix, canonicalKey) {
    const canonical = String(canonicalKey || "");
    const reverse = Array.from(canonical).reverse().join("");
    return `${prefix}-${fnv1a(canonical)}${fnv1a(reverse)}`;
  }

  function canonicalRecordProjection(record) {
    return {
      schema: record.schema,
      model: record.model,
      model_version: record.model_version,
      actor_role: record.actor_role,
      model_family: record.model_family,
      model_family_key: record.model_family_key,
      stage: record.stage,
      formula: record.formula,
      composition_key: record.composition_key,
      structure_id: record.structure_id,
      structure_hash: record.structure_hash,
      structure_namespace: record.structure_namespace,
      space_group: record.space_group,
      target_definition: record.target_definition,
      pressure_GPa: record.pressure_GPa,
      temperature_K: record.temperature_K,
      doping: record.doping,
      functional: record.functional,
      gap_type: record.gap_type,
      spin_orbit_coupling: record.spin_orbit_coupling,
      hubbard_u: record.hubbard_u,
      magnetic_order: record.magnetic_order,
      strain: record.strain,
      dimensionality: record.dimensionality,
      substrate: record.substrate,
      phase_label: record.phase_label,
      extra_conditions: record.extra_conditions,
      extra_conditions_invalid: record.extra_conditions_invalid,
      conditions_complete: record.conditions_complete,
      properties: record.properties,
      applicability_by_property: record.applicability_by_property,
      calibration: record.calibration,
      recommendation: record.recommendation,
      source_refs: [...(record.source_refs || [])].sort(),
      doi_refs: [...(record.doi_refs || [])].sort(),
      raw_data_refs: [...(record.raw_data_refs || [])].sort(),
      evidence_ids: [...(record.evidence_ids || [])].sort(),
      supersedes_evidence_ids: [...(record.supersedes_evidence_ids || [])].sort(),
      data_cutoff: record.data_cutoff,
      experimental_method: record.experimental_method,
      novelty_status: record.novelty_status,
      claim_state: record.claim_state,
      verification_status: record.verification_status,
      source_family_verified: record.source_family_verified,
      eligible_for_consensus: record.eligible_for_consensus,
      demo: record.demo,
      assigned_task_id: record.assigned_task_id,
      identity_key: record.identity_key
    };
  }

  function modelReportKind(stages) {
    if (stages.includes("experiment")) return "experiment";
    if (stages.some(stage => ["dft", "validated_ml", "ml"].includes(stage))) return "calculation";
    if (stages.some(stage => ["database", "literature"].includes(stage))) return "research";
    if (stages.includes("rule")) return "rule";
    return "planning";
  }

  function createModelReports(analysis) {
    const grouped = new Map();
    analysis.groups.forEach(group => {
      group.records.forEach(record => {
        const key = record.model.toLowerCase();
        if (!grouped.has(key)) grouped.set(key, { model: record.model, records: [], candidates: new Map() });
        const bucket = grouped.get(key);
        bucket.records.push(record);
        if (!bucket.candidates.has(group.key)) {
          bucket.candidates.set(group.key, {
            candidate_key: group.key,
            formula: group.formula,
            structure_id: group.structure_id || group.structure_hash || "",
            target_definition: group.target_definition
          });
        }
      });
    });
    return Array.from(grouped.values()).map(bucket => {
      const records = bucket.records;
      const stages = Array.from(new Set(records.map(record => record.stage))).sort();
      const families = Array.from(new Set(records.map(record => record.model_family))).sort();
      const propertyClaims = records.flatMap(record => Object.entries(record.properties || {}).map(([property, value]) => ({
        candidate: record.formula || record.reduced_formula || "",
        property,
        value,
        unit: PROPERTY_META[property]?.unit || "",
        evidence_status: record.eligible_for_consensus ? "verified_adapter" : "comparative_only"
      }))).sort((left, right) => left.candidate.localeCompare(right.candidate)
        || left.property.localeCompare(right.property)
        || left.value - right.value);
      const evidenceRefs = Array.from(new Set(records.flatMap(independentEvidenceKeys))).sort();
      const recommendations = recommendationClusters(records)
        .map(item => ({ text: item.text, supporting_models: [...item.models].sort() }))
        .sort((left, right) => left.text.localeCompare(right.text));
      const canonicalKey = JSON.stringify({
        model: bucket.model,
        families,
        candidates: Array.from(bucket.candidates.keys()).sort(),
        stages,
        records: records.map(record => JSON.stringify(canonicalRecordProjection(record))).sort()
      });
      const hasVerified = records.some(record => record.eligible_for_consensus);
      const hasReturned = records.some(record => NUMERIC_EVIDENCE_STAGES.has(record.stage) || Boolean(record.assigned_task_id));
      return {
        schema: MODEL_REPORT_SCHEMA,
        report_id: stableWorkflowId("model-report", canonicalKey),
        canonical_key: canonicalKey,
        author: {
          model_id: safeText(records[0]?.model_version || bucket.model, 160),
          model_name: bucket.model,
          model_families: families,
          role: "worker"
        },
        report_kind: modelReportKind(stages),
        status: hasVerified ? "verified" : (hasReturned ? "returned_unverified" : "preview"),
        stages,
        candidate_count: bucket.candidates.size,
        candidates: Array.from(bucket.candidates.values()).sort((left, right) => left.candidate_key.localeCompare(right.candidate_key)),
        property_claims: propertyClaims,
        recommendations,
        evidence_refs: evidenceRefs,
        returned_task_ids: Array.from(new Set(records.map(record => record.assigned_task_id).filter(Boolean))).sort(),
        verification_status: hasVerified ? "verified_internal" : "imported_unverified"
      };
    }).sort((left, right) => left.author.model_name.toLowerCase().localeCompare(right.author.model_name.toLowerCase())
      || left.report_id.localeCompare(right.report_id));
  }

  function taskSpec(step, group) {
    const contributors = group.models.slice(0, 4);
    const targetOwner = group.target_definition === "tc_K"
      ? "Quantum Espresso / superconductivity model"
      : (group.target_definition === "band_gap_eV" ? "Quantum Espresso / band model" : "Target-property model / DFT");
    const specs = {
      structure: {
        owners: ["CrystalStructureGen"],
        objective_zh: "补齐并核验候选结构身份",
        objective_en: "Resolve and verify the candidate structure identity",
        deliverable_zh: "CIF、命名空间结构 ID、空间群、结构哈希，以及对原有数值声明的逐分支复算",
        deliverable_en: "CIF, namespaced structure ID, space group, structure hash, and branch-specific recalculation of existing numeric claims"
      },
      verification: {
        owners: contributors.length ? contributors : ["Source model adapter"],
        objective_zh: "核验原模型运行、版本和证据来源",
        objective_en: "Verify source-model run, version, and provenance",
        deliverable_zh: "带 evidence_id / run_id 的结构化模型报告",
        deliverable_en: "Structured model report with evidence_id / run_id"
      },
      conditions: {
        owners: contributors.length ? contributors : ["Source model adapter"],
        objective_zh: "补齐压力、温度、掺杂与计算条件",
        objective_en: "Complete pressure, temperature, doping, and calculation conditions",
        deliverable_zh: "可比较的完整条件清单与单位",
        deliverable_en: "Comparable complete condition set with units"
      },
      novelty: {
        owners: ["Materials Project / literature search"],
        objective_zh: "按带日期的数据库和文献快照查重",
        objective_en: "Check dated database and literature snapshots",
        deliverable_zh: "组成与结构匹配表、DOI 和快照日期",
        deliverable_en: "Composition/structure match table, DOI, and snapshot date"
      },
      stability: {
        owners: ["MatterSim / CHGNet", "Quantum Espresso / ABACUS"],
        objective_zh: "建立热力学与动力学稳定性证据",
        objective_en: "Build thermodynamic and dynamic stability evidence",
        deliverable_zh: "弛豫结构、形成能、凸包能和声子结果",
        deliverable_en: "Relaxed structure, formation/hull energies, and phonons"
      },
      conflict: {
        owners: contributors.length ? contributors : ["Contributing models"],
        objective_zh: "逐项复核并解释模型分歧",
        objective_en: "Audit and explain model disagreement",
        deliverable_zh: "单位、条件、版本和数值差异审计表",
        deliverable_en: "Audit table for units, conditions, versions, and values"
      },
      target: {
        owners: [targetOwner],
        objective_zh: "用目标专属模型或 DFT 复算目标性质",
        objective_en: "Recalculate the target property with a specialized model or DFT",
        deliverable_zh: "带校准误差、适用域和运行 ID 的目标性质结果",
        deliverable_en: "Target-property result with calibration error, applicability, and run ID"
      },
      experiment: {
        owners: ["NSRL / experimental team"],
        objective_zh: "完成合成、结构和目标物性实验验证",
        objective_en: "Perform synthesis, structure, and target-property validation",
        deliverable_zh: "实验方法、原始数据链接和样品记录",
        deliverable_en: "Experimental method, raw-data reference, and sample record"
      }
    };
    return specs[step] || specs.verification;
  }

  function orchestrationSteps(group) {
    const steps = new Set();
    if (!group.identity_resolved) steps.add("structure");
    if (!group.records.some(record => record.eligible_for_consensus)) steps.add("verification");
    if (group.records.some(record => record.eligible_for_consensus
      && Object.keys(record.properties || {}).some(property => !propertyConditionsComplete(record, property)))) steps.add("conditions");
    if (group.novelty_status !== "known_reference") steps.add("novelty");
    if (!group.consensus_properties.some(property => ["formation_energy_eV_atom", "e_above_hull_eV_atom"].includes(property))) steps.add("stability");
    if (group.conflicts.length) steps.add("conflict");
    if (!["general", "stability"].includes(group.target_definition) && !group.consensus_properties.includes(group.target_definition)) steps.add("target");
    if (!group.records.some(record => recordIsTargetAlignedExperiment(record, group))) steps.add("experiment");
    return Array.from(steps);
  }

  function sourceRecordKey(record) {
    return stableWorkflowId("source-record", JSON.stringify(canonicalRecordProjection(record)));
  }

  function sourceClaimSnapshot(record) {
    return {
      source_record_key: sourceRecordKey(record),
      evidence_ids: [...(record.evidence_ids || [])].sort().slice(0, MAX_RECORDS),
      model_token: executorToken(record.model),
      properties: Object.fromEntries(Object.entries(record.properties || {})
        .map(([property, value]) => [property, finiteNumber(value)])
        .filter(([, value]) => value !== null)
        .sort(([left], [right]) => left.localeCompare(right)))
    };
  }

  function sourceClaimMatchesRecord(claim, record, requireSameExecutor = false) {
    if (!claim || typeof claim !== "object") return false;
    if (requireSameExecutor && claim.model_token !== executorToken(record.model)) return false;
    return Object.entries(claim.properties || {}).every(([property, sourceValue]) => {
      const returnedValue = finiteNumber(record.properties?.[property]);
      return returnedValue !== null && Number.isFinite(sourceValue)
        && Math.abs(returnedValue - sourceValue) <= Math.max(1e-12, Math.abs(sourceValue) * 1e-12);
    });
  }

  function taskSourceRecords(step, group) {
    if (step === "structure") return group.records;
    if (step === "verification") return group.records.filter(record => record.eligible_for_consensus !== true);
    if (step === "conditions") return group.records.filter(record => record.eligible_for_consensus === true
      && Object.keys(record.properties || {}).some(property => !propertyConditionsComplete(record, property)));
    return group.records;
  }

  const TASK_PRIORITIES = Object.freeze({ structure: 100, verification: 96, conditions: 94, conflict: 90, novelty: 86, stability: 82, target: 72, experiment: 60 });
  const TASK_DEPENDENCY_STEPS = Object.freeze({
    novelty: Object.freeze(["structure"]),
    stability: Object.freeze(["structure", "conditions"]),
    conflict: Object.freeze(["conditions"]),
    target: Object.freeze(["structure", "stability"]),
    experiment: Object.freeze(["stability", "target"])
  });

  function createTaskDefinition(step, group, lineageKey, dependsOn = []) {
    const spec = taskSpec(step, group);
    const sourceRecords = taskSourceRecords(step, group);
    const requiredProperties = Array.from(new Set(sourceRecords.flatMap(record => Object.keys(record.properties || {})))).sort();
    const task = {
      task_id: "",
      canonical_key: "",
      manifest_digest: "",
      candidate_key: lineageKey,
      source_identity_key: group.key,
      candidate: group.formula || group.structure_id || "Text candidate",
      composition_key: group.records[0]?.composition_key || "",
      structure_identity_resolved: group.identity_resolved,
      structure_id: group.structure_id || "",
      structure_hash: group.structure_hash || "",
      structure_namespace: group.structure_namespace || "",
      space_group: group.space_group || "",
      target_definition: group.target_definition,
      condition_fingerprint: (group.records[0]?.identity_key.split("|conditions:")[1] || "").replace(/\|demo:(?:yes|no)$/, ""),
      condition_state: taskConditionState(group),
      conflict_properties: [...(group.conflicts || [])].sort(),
      required_properties: requiredProperties,
      required_experiment_properties: requiredExperimentalPropertiesForGroup(group),
      required_source_claims: sourceRecords.map(sourceClaimSnapshot)
        .sort((left, right) => left.source_record_key.localeCompare(right.source_record_key)),
      required_property_values: Object.fromEntries(requiredProperties.map(property => [
        property,
        Array.from(new Set(sourceRecords.map(record => finiteNumber(record.properties?.[property]))
          .filter(value => value !== null))).sort((left, right) => left - right)
      ])),
      step,
      assigned_to: spec.owners,
      objective_zh: spec.objective_zh,
      objective_en: spec.objective_en,
      deliverable_zh: spec.deliverable_zh,
      deliverable_en: spec.deliverable_en,
      expected_output_schema: SCHEMA,
      priority: TASK_PRIORITIES[step] || 50,
      status: dependsOn.length ? "blocked" : "assigned",
      depends_on: Array.from(new Set(dependsOn)).sort(),
      returned_record_count: 0,
      paid_job_submitted: false
    };
    task.manifest_digest = taskManifestDigest(task);
    task.canonical_key = taskCanonicalKey(task);
    task.task_id = stableWorkflowId("material-task", task.canonical_key);
    return task;
  }

  function taskResultSatisfies(step, record, context = {}) {
    const propertyNames = Object.keys(record.properties || {});
    const stabilityProperties = propertyNames.filter(property => ["formation_energy_eV_atom", "e_above_hull_eV_atom"].includes(property));
    const hasStability = stabilityProperties.some(property => propertyConditionsComplete(record, property));
    const target = context.target_definition || "general";
    const targetProperties = PROPERTY_META[target] ? [target] : propertyNames;
    const hasTarget = targetProperties.some(property => Object.prototype.hasOwnProperty.call(record.properties || {}, property) && propertyConditionsComplete(record, property));
    const requiredProperties = Array.isArray(context.required_properties) ? context.required_properties : [];
    const requiredSourceClaims = Array.isArray(context.required_source_claims) ? context.required_source_claims : [];
    const preservesAnySourceClaim = requiredSourceClaims.some(claim => sourceClaimMatchesRecord(
      claim,
      record,
      ["verification", "conditions"].includes(step)
    ));
    const coversRequiredProperties = requiredProperties.every(property => Object.prototype.hasOwnProperty.call(record.properties || {}, property));
    const preservesRequiredValues = requiredProperties.every(property => {
      const allowed = Array.isArray(context.required_property_values?.[property]) ? context.required_property_values[property] : [];
      const value = finiteNumber(record.properties?.[property]);
      return value !== null && (!allowed.length || allowed.some(sourceValue =>
        Math.abs(value - sourceValue) <= Math.max(1e-12, Math.abs(sourceValue) * 1e-12)));
    });
    if (step === "structure") return record.eligible_for_consensus === true
      && record.structure_identity_resolved === true
      && (requiredSourceClaims.length ? preservesAnySourceClaim : (coversRequiredProperties && preservesRequiredValues));
    if (step === "verification") return record.eligible_for_consensus === true
      && propertyNames.length > 0
      && (requiredSourceClaims.length ? preservesAnySourceClaim : (coversRequiredProperties && preservesRequiredValues));
    if (step === "conditions") {
      return record.eligible_for_consensus === true
        && propertyNames.length > 0
        && (requiredSourceClaims.length ? preservesAnySourceClaim : (requiredProperties.every(property =>
          Object.prototype.hasOwnProperty.call(record.properties || {}, property)) && preservesRequiredValues))
        && propertyNames.every(property => propertyConditionsComplete(record, property));
    }
    if (step === "novelty") return record.eligible_for_consensus === true
      && ["known_reference", "screened_unverified"].includes(record.novelty_status)
      && validSnapshotDate(record.data_cutoff)
      && independentEvidenceKeys(record).some(key => /^(?:doi|url|database-(?:hash|id)):/.test(key))
      && (!context.novelty_status || context.novelty_status === record.novelty_status);
    if (step === "stability") return record.eligible_for_consensus === true && hasStability;
    if (step === "target") {
      const hasCalibratedTarget = targetProperties.some(property => {
        const calibration = record.calibration?.[property];
        return Object.prototype.hasOwnProperty.call(record.properties || {}, property)
          && propertyConditionsComplete(record, property)
          && calibration?.q90 > 0
          && calibration?.applicability > 0
          && meaningfulCondition(calibration?.validation_set);
      });
      return record.eligible_for_consensus === true
        && hasTarget
        && hasCalibratedTarget
        && record.evidence_ids?.length > 0;
    }
    if (step === "experiment") {
      const requiredExperimentProperties = Array.isArray(context.required_experiment_properties)
        ? context.required_experiment_properties
        : requiredProperties;
      const hasGeneralOverlap = requiredExperimentProperties.some(property => Object.prototype.hasOwnProperty.call(record.properties || {}, property)
        && propertyConditionsComplete(record, property));
      const hasRequiredExperimentProperty = target === "general"
        ? (requiredExperimentProperties.length ? hasGeneralOverlap : false)
        : (target === "stability" ? hasStability : hasTarget);
      return record.eligible_for_consensus === true
        && record.stage === "experiment"
        && record.claim_state === "experimental_observation"
        && hasRequiredExperimentProperty;
    }
    if (step === "conflict") {
      const conflictProperties = Array.isArray(context.conflict_properties) ? context.conflict_properties : [];
      const coversConflict = conflictProperties.length
        ? conflictProperties.some(property => Object.prototype.hasOwnProperty.call(record.properties || {}, property))
        : propertyNames.length > 0;
      return record.eligible_for_consensus === true
        && Array.isArray(record.supersedes_evidence_ids)
        && record.supersedes_evidence_ids.length > 0
        && coversConflict
        && Array.isArray(context.conflicts)
        && context.conflicts.length === 0;
    }
    return false;
  }

  function canonicalTaskValue(value) {
    if (Array.isArray(value)) return value.map(canonicalTaskValue);
    if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort()
      .map(key => [key, canonicalTaskValue(value[key])]));
    return value;
  }

  function taskManifestProjection(task) {
    return canonicalTaskValue({
      task_schema: 2,
      candidate_key: task.candidate_key || "",
      source_identity_key: task.source_identity_key || "",
      candidate: task.candidate || "Text candidate",
      composition_key: task.composition_key || "",
      structure_identity_resolved: task.structure_identity_resolved === true,
      structure_id: task.structure_id || "",
      structure_hash: task.structure_hash || "",
      structure_namespace: task.structure_namespace || "",
      space_group: task.space_group || "",
      target_definition: task.target_definition || "general",
      condition_fingerprint: task.condition_fingerprint || "",
      condition_state: taskConditionState(task.condition_state || {}),
      conflict_properties: [...(task.conflict_properties || [])].sort(),
      required_properties: [...(task.required_properties || [])].sort(),
      required_experiment_properties: [...(task.required_experiment_properties || [])].sort(),
      required_source_claims: [...(task.required_source_claims || [])].map(claim => ({
        source_record_key: claim.source_record_key || "",
        evidence_ids: [...(claim.evidence_ids || [])].sort(),
        model_token: claim.model_token || "",
        properties: canonicalTaskValue(claim.properties || {})
      })).sort((left, right) => left.source_record_key.localeCompare(right.source_record_key)),
      required_property_values: canonicalTaskValue(task.required_property_values || {}),
      step: task.step || "",
      assigned_to: [...(task.assigned_to || [])].sort(),
      objective_zh: task.objective_zh || "",
      objective_en: task.objective_en || "",
      deliverable_zh: task.deliverable_zh || "",
      deliverable_en: task.deliverable_en || "",
      expected_output_schema: SCHEMA,
      priority: Number.isFinite(task.priority) ? task.priority : 50,
      depends_on: [...(task.depends_on || [])].sort(),
      paid_job_submitted: false
    });
  }

  function taskManifestDigest(task) {
    return stableWorkflowId("task-manifest", JSON.stringify(taskManifestProjection(task)));
  }

  function taskCanonicalKey(task) {
    return JSON.stringify({ task_schema: 2, manifest_digest: taskManifestDigest(task) });
  }

  function taskLogicalKey(task) {
    return JSON.stringify({
      candidate_key: task.candidate_key || "",
      source_identity_key: task.source_identity_key || "",
      step: task.step || ""
    });
  }

  function taskConditionState(source = {}) {
    return {
      pressure_GPa: source.pressure_GPa ?? null,
      temperature_K: source.temperature_K ?? null,
      doping: source.doping || "",
      functional: source.functional || "",
      gap_type: source.gap_type || "",
      spin_orbit_coupling: source.spin_orbit_coupling || "",
      hubbard_u: source.hubbard_u || "",
      magnetic_order: source.magnetic_order || "",
      strain: source.strain || "",
      dimensionality: source.dimensionality || "",
      substrate: source.substrate || "",
      phase_label: source.phase_label || "",
      extra_conditions: source.extra_conditions && typeof source.extra_conditions === "object" ? source.extra_conditions : {}
    };
  }

  function conditionsTransitionAllowed(task, record) {
    const before = task.condition_state || {};
    const after = taskConditionState(record);
    const unspecified = value => value === null || value === "" || value === "not provided";
    for (const key of ["pressure_GPa", "temperature_K", "doping", "functional", "gap_type", "spin_orbit_coupling", "hubbard_u", "magnetic_order", "strain", "dimensionality", "substrate", "phase_label"]) {
      if (!unspecified(before[key]) && conditionKeyPart(before[key]) !== conditionKeyPart(after[key])) return false;
    }
    return Object.entries(before.extra_conditions || {}).every(([key, value]) =>
      !meaningfulCondition(value) || conditionKeyPart(value) === conditionKeyPart(after.extra_conditions?.[key]));
  }

  function taskMatchesLineage(task, record) {
    if (task.composition_key) {
      if (record.composition_key !== task.composition_key) return false;
    } else if (record.identity_key !== task.candidate_key) {
      return false;
    }
    if (record.target_definition !== task.target_definition) return false;
    const sourceIdentity = typeof task.source_identity_key === "string" ? task.source_identity_key : "";
    const recordStructurePrefix = record.identity_key.split("|conditions:")[0] || "";
    const sourceStructurePrefix = sourceIdentity.split("|conditions:")[0] || "";
    const recordConditions = (record.identity_key.split("|conditions:")[1] || "").replace(/\|demo:(?:yes|no)$/, "");
    if (task.step === "conditions") {
      if (sourceStructurePrefix && recordStructurePrefix !== sourceStructurePrefix) return false;
      if (!conditionsTransitionAllowed(task, record)) return false;
    } else if (recordConditions !== task.condition_fingerprint) return false;
    if (!["structure", "conditions"].includes(task.step) && sourceIdentity && record.identity_key !== sourceIdentity) return false;
    if (task.step !== "structure" && record.structure_identity_resolved !== task.structure_identity_resolved) return false;
    if (task.structure_identity_resolved && task.step !== "structure") {
      if (task.structure_hash && record.structure_hash !== task.structure_hash) return false;
      if (!task.structure_hash && (record.structure_namespace !== task.structure_namespace || record.structure_id !== task.structure_id)) return false;
      if (conditionKeyPart(record.space_group) !== conditionKeyPart(task.space_group)) return false;
    }
    return true;
  }

  function executorToken(value) {
    return safeText(value, 180).normalize("NFKC").toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g, "");
  }

  function taskExecutorAuthorized(task, record) {
    const candidates = [record.model, record.model_family, record.model_family_key].map(executorToken).filter(Boolean);
    const owners = (task.assigned_to || []).flatMap(owner => String(owner).split(/(?:\s*\/\s*|\s*·\s*|\s*,\s*|\s+or\s+)/i))
      .map(executorToken).filter(Boolean);
    return candidates.some(candidate => owners.some(owner => owner === candidate));
  }

  function safePreviousTask(task) {
    if (!task || typeof task !== "object" || Array.isArray(task)) return null;
    if (containsPotentialCredentials(task)) return null;
    const step = scalarText(task.step, 40);
    const candidateRaw = typeof task.candidate_key === "string" ? task.candidate_key.replace(/\u0000/g, "").trim() : "";
    if (candidateRaw.length > 20000) return null;
    const candidateKey = candidateRaw;
    const taskId = scalarText(task.task_id, 80);
    if (!["structure", "verification", "conditions", "novelty", "stability", "conflict", "target", "experiment"].includes(step) || !candidateKey) return null;
    const assignedTo = Array.isArray(task.assigned_to)
      ? task.assigned_to.map(value => redactSensitiveText(value, 160)).filter(Boolean).slice(0, 8)
      : [];
    const sanitized = {
      task_id: taskId,
      canonical_key: "",
      manifest_digest: "",
      candidate_key: candidateKey,
      source_identity_key: typeof task.source_identity_key === "string" ? safeText(task.source_identity_key, 16000) : candidateKey,
      candidate: redactSensitiveText(task.candidate || "Text candidate", 160),
      composition_key: scalarText(task.composition_key, 500),
      structure_identity_resolved: task.structure_identity_resolved === true,
      structure_id: scalarText(task.structure_id, 240),
      structure_hash: scalarText(task.structure_hash, 240),
      structure_namespace: scalarText(task.structure_namespace, 80),
      space_group: scalarText(task.space_group, 160),
      target_definition: scalarText(task.target_definition, 160) || "general",
      condition_fingerprint: typeof task.condition_fingerprint === "string" ? safeText(task.condition_fingerprint, 16000) : "",
      condition_state: taskConditionState(task.condition_state || {}),
      conflict_properties: Array.isArray(task.conflict_properties)
        ? task.conflict_properties.map(canonicalPropertyName).filter(Boolean).slice(0, Object.keys(PROPERTY_META).length)
        : [],
      required_properties: Array.isArray(task.required_properties)
        ? task.required_properties.map(canonicalPropertyName).filter(Boolean).slice(0, Object.keys(PROPERTY_META).length)
        : [],
      required_experiment_properties: Array.isArray(task.required_experiment_properties)
        ? task.required_experiment_properties.map(canonicalPropertyName).filter(Boolean).slice(0, Object.keys(PROPERTY_META).length)
        : [],
      required_source_claims: Array.isArray(task.required_source_claims)
        ? task.required_source_claims.flatMap(claim => {
          if (!claim || typeof claim !== "object") return [];
          const sourceRecordKeyValue = scalarText(claim.source_record_key, 80);
          if (!/^source-record-[a-f0-9]{16}$/i.test(sourceRecordKeyValue)) return [];
          const properties = Object.fromEntries(Object.entries(claim.properties || {}).flatMap(([property, value]) => {
            const canonical = canonicalPropertyName(property);
            const numeric = finiteNumber(value);
            return canonical && numeric !== null ? [[canonical, numeric]] : [];
          }));
          return [{
            source_record_key: sourceRecordKeyValue,
            evidence_ids: Array.isArray(claim.evidence_ids) ? claim.evidence_ids.map(value => safeText(value, 240)).filter(Boolean).slice(0, MAX_RECORDS).sort() : [],
            model_token: executorToken(claim.model_token),
            properties
          }];
        }).slice(0, MAX_RECORDS)
        : [],
      required_property_values: Object.fromEntries(Object.entries(task.required_property_values || {}).flatMap(([property, values]) => {
        const canonical = canonicalPropertyName(property);
        if (!canonical || !Array.isArray(values)) return [];
        const normalized = Array.from(new Set(values.map(finiteNumber).filter(value => value !== null))).sort((left, right) => left - right).slice(0, MAX_RECORDS);
        return normalized.length ? [[canonical, normalized]] : [];
      })),
      step,
      assigned_to: assignedTo,
      objective_zh: redactSensitiveText(task.objective_zh, 300),
      objective_en: redactSensitiveText(task.objective_en, 300),
      deliverable_zh: redactSensitiveText(task.deliverable_zh, 300),
      deliverable_en: redactSensitiveText(task.deliverable_en, 300),
      expected_output_schema: SCHEMA,
      priority: Number.isFinite(task.priority) ? Math.max(0, Math.min(100, task.priority)) : 50,
      status: "assigned",
      depends_on: Array.isArray(task.depends_on) ? task.depends_on.filter(value => /^material-task-[a-f0-9]{16}$/i.test(String(value))).slice(0, 8) : [],
      returned_record_count: 0,
      superseded_by: Array.isArray(task.superseded_by)
        ? task.superseded_by.map(value => safeText(value, 20000)).filter(Boolean).slice(0, 32)
        : [],
      paid_job_submitted: false
    };
    const manifestDigest = taskManifestDigest(sanitized);
    const canonicalKey = taskCanonicalKey(sanitized);
    if (scalarText(task.manifest_digest, 80) !== manifestDigest
      || typeof task.canonical_key !== "string"
      || task.canonical_key !== canonicalKey
      || taskId !== stableWorkflowId("material-task", canonicalKey)) return null;
    sanitized.manifest_digest = manifestDigest;
    sanitized.canonical_key = canonicalKey;
    return sanitized;
  }

  function taskMatchesCurrentSourceManifest(task, preliminaryAnalysis) {
    const currentGroup = preliminaryAnalysis.groups.find(group => group.key === task.source_identity_key);
    if (!currentGroup) return false;
    const frozenClaims = Array.isArray(task.required_source_claims) ? task.required_source_claims : [];
    if (!frozenClaims.length) return false;
    const allowedAncestorTaskIds = new Set(task.depends_on || []);
    const availableSourceRecords = currentGroup.records.filter(record => record.assigned_task_id !== task.task_id
      && (!record.assigned_task_id || allowedAncestorTaskIds.has(record.assigned_task_id)));
    const unmatchedSourceRecords = [...availableSourceRecords];
    const frozenSourceRecords = [];
    const claimsMatch = [...frozenClaims]
      .sort((left, right) => left.source_record_key.localeCompare(right.source_record_key))
      .every(claim => {
        const matchIndex = unmatchedSourceRecords.findIndex(record => {
          if (sourceRecordKey(record) !== claim.source_record_key) return false;
          return JSON.stringify(canonicalTaskValue(sourceClaimSnapshot(record)))
            === JSON.stringify(canonicalTaskValue(claim));
        });
        if (matchIndex < 0) return false;
        frozenSourceRecords.push(unmatchedSourceRecords[matchIndex]);
        unmatchedSourceRecords.splice(matchIndex, 1);
        return true;
      });
    if (!claimsMatch || frozenSourceRecords.length !== frozenClaims.length) return false;
    const rebuiltAnalysis = analyzeRecords(frozenSourceRecords);
    const rebuiltGroup = rebuiltAnalysis.groups.find(group => group.key === task.source_identity_key);
    if (!rebuiltGroup) return false;
    const expected = createTaskDefinition(task.step, rebuiltGroup, task.candidate_key, task.depends_on || []);
    return expected.task_id === task.task_id
      && JSON.stringify(taskManifestProjection(expected)) === JSON.stringify(taskManifestProjection(task));
  }

  function createTaskPlan(analysis, previousTasks = [], taskRecords = null, acceptedConflictResolutionRecords = new Set(), acceptedMigrationRecords = new Set(), acceptedVerificationRecords = new Set(), quarantinedReturnRecords = new Set()) {
    if (previousTasks.length > MAX_TASKS) throw new Error("TASK_LIMIT_EXCEEDED");
    const priorTasks = previousTasks.map(safePreviousTask).filter(Boolean);
    const priorTaskById = new Map(priorTasks.map(task => [task.task_id, task]));
    const allRecords = Array.isArray(taskRecords) ? taskRecords : analysis.groups.flatMap(group => group.records);
    const taskReturnSummaryCache = new Map();
    const taskReturnSummary = task => {
      if (taskReturnSummaryCache.has(task.task_id)) return taskReturnSummaryCache.get(task.task_id);
      const returnedRecords = allRecords.filter(record => !quarantinedReturnRecords.has(record)
        && record.assigned_task_id === task.task_id
        && taskMatchesLineage(task, record)
        && taskExecutorAuthorized(task, record));
      const currentGroup = analysis.groups.find(group => returnedRecords.some(record => group.records.includes(record)))
        || analysis.groups.find(group => group.key === task.candidate_key)
        || { target_definition: task.target_definition, conflicts: [] };
      const verifiedRecords = returnedRecords.filter(record => (!["structure", "conditions"].includes(task.step) || acceptedMigrationRecords.has(record))
        && (task.step !== "verification" || acceptedVerificationRecords.has(record))
        && (task.step !== "conflict" || acceptedConflictResolutionRecords.has(record))
        && taskResultSatisfies(task.step, record, {
          ...currentGroup,
          conflict_properties: task.conflict_properties,
          required_properties: task.required_properties,
          required_experiment_properties: task.required_experiment_properties,
          required_source_claims: task.required_source_claims,
          required_property_values: task.required_property_values
        }));
      const summary = { returnedRecords, verifiedRecords };
      taskReturnSummaryCache.set(task.task_id, summary);
      return summary;
    };
    const priorTasksByLogicalKey = new Map();
    priorTasks.forEach(task => {
      const logicalKey = taskLogicalKey(task);
      if (!priorTasksByLogicalKey.has(logicalKey)) priorTasksByLogicalKey.set(logicalKey, []);
      priorTasksByLogicalKey.get(logicalKey).push(task);
    });
    const taskStepOrder = ["structure", "verification", "conditions", "novelty", "stability", "conflict", "target", "experiment"];
    const downstreamProgressSteps = [...taskStepOrder].reverse();
    const downstreamProgressRank = new Map(downstreamProgressSteps.map((step, index) => [step, index]));
    const emptyProgressVector = () => Array(downstreamProgressSteps.length).fill(0);
    const closureVerifiedProgress = new Map(priorTasks.map(task => {
      const progress = emptyProgressVector();
      progress[downstreamProgressRank.get(task.step) ?? progress.length - 1] = taskReturnSummary(task).verifiedRecords.length;
      return [task.task_id, progress];
    }));
    priorTasks.forEach(task => {
      const contribution = taskReturnSummary(task).verifiedRecords.length;
      if (!contribution) return;
      const contributionRank = downstreamProgressRank.get(task.step) ?? downstreamProgressSteps.length - 1;
      const visitedDependencies = new Set();
      const pendingDependencies = [...(task.depends_on || [])];
      while (pendingDependencies.length) {
        const dependencyId = pendingDependencies.pop();
        if (visitedDependencies.has(dependencyId)) continue;
        visitedDependencies.add(dependencyId);
        const dependencyTask = priorTaskById.get(dependencyId);
        if (!dependencyTask) continue;
        const dependencyProgress = closureVerifiedProgress.get(dependencyId) || emptyProgressVector();
        dependencyProgress[contributionRank] += contribution;
        closureVerifiedProgress.set(dependencyId, dependencyProgress);
        pendingDependencies.push(...(dependencyTask.depends_on || []));
      }
    });
    const taskStepRank = new Map(taskStepOrder.map((step, index) => [step, index]));
    const compareAuthoritativeTasks = (left, right) => {
      const leftProgress = closureVerifiedProgress.get(left.task_id) || emptyProgressVector();
      const rightProgress = closureVerifiedProgress.get(right.task_id) || emptyProgressVector();
      for (let index = 0; index < downstreamProgressSteps.length; index += 1) {
        if (leftProgress[index] !== rightProgress[index]) return rightProgress[index] - leftProgress[index];
      }
      const hasVerifiedProgress = leftProgress.some(Boolean);
      if (hasVerifiedProgress && left.required_source_claims.length !== right.required_source_claims.length) {
        return right.required_source_claims.length - left.required_source_claims.length;
      }
      if (!hasVerifiedProgress && left.required_source_claims.length !== right.required_source_claims.length) {
        return left.required_source_claims.length - right.required_source_claims.length;
      }
      return left.task_id.localeCompare(right.task_id);
    };
    const priorTaskByLogicalKey = new Map();
    Array.from(priorTasksByLogicalKey.entries())
      .sort(([leftKey, leftTasks], [rightKey, rightTasks]) =>
        (taskStepRank.get(leftTasks[0].step) ?? taskStepOrder.length)
          - (taskStepRank.get(rightTasks[0].step) ?? taskStepOrder.length)
        || leftKey.localeCompare(rightKey))
      .forEach(([logicalKey, candidates]) => {
        const compatibleCandidates = candidates.filter(candidate => (candidate.depends_on || []).every(dependencyId => {
          const dependencyTask = priorTaskById.get(dependencyId);
          if (!dependencyTask) return false;
          return priorTaskByLogicalKey.get(taskLogicalKey(dependencyTask))?.task_id === dependencyId;
        }));
        const authoritative = [...compatibleCandidates].sort(compareAuthoritativeTasks)[0];
        if (authoritative) priorTaskByLogicalKey.set(logicalKey, authoritative);
      });
    const migrationParentTaskByReturn = new Map();
    const protectedMigrationParentTaskIds = new Set();
    const migrationReturnKey = (taskId, destinationIdentity) => JSON.stringify([taskId, destinationIdentity]);
    const verifiedDependencyClosure = task => {
      const closure = new Set();
      const pendingDependencies = [...(task.depends_on || [])];
      while (pendingDependencies.length) {
        const dependencyId = pendingDependencies.pop();
        if (closure.has(dependencyId)) continue;
        const dependencyTask = priorTaskById.get(dependencyId);
        if (!dependencyTask || !taskReturnSummary(dependencyTask).verifiedRecords.length) return null;
        closure.add(dependencyId);
        pendingDependencies.push(...(dependencyTask.depends_on || []));
      }
      return closure;
    };
    priorTasksByLogicalKey.forEach(candidates => {
      if (!["structure", "conditions"].includes(candidates[0]?.step)) return;
      const candidatesByDestination = new Map();
      candidates.forEach(candidate => {
        const destinations = new Set(taskReturnSummary(candidate).verifiedRecords.map(record => record.identity_key));
        destinations.forEach(destinationIdentity => {
          if (!candidatesByDestination.has(destinationIdentity)) candidatesByDestination.set(destinationIdentity, []);
          candidatesByDestination.get(destinationIdentity).push(candidate);
        });
      });
      candidatesByDestination.forEach((destinationCandidates, destinationIdentity) => {
        const eligibleParents = destinationCandidates.map(candidate => ({
          candidate,
          dependencyClosure: verifiedDependencyClosure(candidate)
        })).filter(item => item.dependencyClosure !== null);
        const parentTask = eligibleParents.map(item => item.candidate).sort(compareAuthoritativeTasks)[0];
        if (!parentTask) return;
        const parentDependencyClosure = eligibleParents.find(item => item.candidate.task_id === parentTask.task_id)?.dependencyClosure || new Set();
        protectedMigrationParentTaskIds.add(parentTask.task_id);
        parentDependencyClosure.forEach(taskId => protectedMigrationParentTaskIds.add(taskId));
        destinationCandidates.forEach(candidate => {
          migrationParentTaskByReturn.set(migrationReturnKey(candidate.task_id, destinationIdentity), parentTask);
        });
      });
    });
    const migratedLineages = new Map();
    const completedMigrationSteps = new Map();
    const branchLineages = new Map();
    const migrationParentsByIdentity = new Map();
    const migrationParentsBySourceIdentity = new Map();
    allRecords.forEach(record => {
      const returnedTask = priorTaskById.get(record.assigned_task_id);
      if (!returnedTask || !["structure", "conditions"].includes(returnedTask.step)) return;
      const priorTask = migrationParentTaskByReturn.get(migrationReturnKey(returnedTask.task_id, record.identity_key));
      if (!priorTask) return;
      if (!taskMatchesLineage(returnedTask, record)
        || !taskExecutorAuthorized(returnedTask, record)
        || !acceptedMigrationRecords.has(record)
        || !taskResultSatisfies(returnedTask.step, record, returnedTask)) return;
      const branchDescriptor = priorTask.step === "structure"
        ? JSON.stringify({ namespace: record.structure_namespace, id: record.structure_id, hash: record.structure_hash, space_group: record.space_group })
        : JSON.stringify(taskConditionState(record));
      const branchLineage = `${priorTask.candidate_key}|branch:${priorTask.step}:${stableWorkflowId("lineage", branchDescriptor)}`;
      migratedLineages.set(record.identity_key, branchLineage);
      if (!migrationParentsByIdentity.has(record.identity_key)) migrationParentsByIdentity.set(record.identity_key, []);
      migrationParentsByIdentity.get(record.identity_key).push({ task_id: priorTask.task_id, step: priorTask.step, branch_lineage: branchLineage });
      const sourceIdentity = priorTask.source_identity_key || priorTask.candidate_key;
      if (!migrationParentsBySourceIdentity.has(sourceIdentity)) migrationParentsBySourceIdentity.set(sourceIdentity, []);
      migrationParentsBySourceIdentity.get(sourceIdentity).push({
        task_id: priorTask.task_id,
        step: priorTask.step,
        parent_lineage: priorTask.candidate_key
      });
      if (!completedMigrationSteps.has(priorTask.candidate_key)) completedMigrationSteps.set(priorTask.candidate_key, new Set());
      completedMigrationSteps.get(priorTask.candidate_key).add(priorTask.step);
      if (!branchLineages.has(priorTask.candidate_key)) branchLineages.set(priorTask.candidate_key, new Set());
      branchLineages.get(priorTask.candidate_key).add(branchLineage);
    });
    const tasks = [];
    analysis.groups.forEach(group => {
      const sourceMigrationParents = migrationParentsBySourceIdentity.get(group.key) || [];
      const remainingMigrationSourceRecords = Array.from(new Set(sourceMigrationParents.flatMap(parent =>
        taskSourceRecords(parent.step, group))));
      const remainingSourceRecordKeys = remainingMigrationSourceRecords.map(sourceRecordKey).sort();
      const remainderLineage = sourceMigrationParents.length && remainingSourceRecordKeys.length
        ? `${group.key}|remainder:${stableWorkflowId("lineage", JSON.stringify({
          parent_task_ids: Array.from(new Set(sourceMigrationParents.map(parent => parent.task_id))).sort(),
          remaining_source_record_keys: remainingSourceRecordKeys
        }))}`
        : "";
      const lineageKey = remainderLineage || migratedLineages.get(group.key) || group.key;
      const groupTasks = [];
      const byStep = new Map();
      priorTaskByLogicalKey.forEach(task => {
        if (task.candidate_key === lineageKey && task.source_identity_key === group.key) byStep.set(task.step, task);
      });
      orchestrationSteps(group).forEach(step => {
        const dependsOn = (TASK_DEPENDENCY_STEPS[step] || []).map(dependencyStep => byStep.get(dependencyStep)?.task_id).filter(Boolean);
        (migrationParentsByIdentity.get(group.key) || []).forEach(parent => {
          const needsParent = parent.step === "structure"
            ? step !== "structure"
            : step !== "conditions";
          if (needsParent) dependsOn.push(parent.task_id);
        });
        const logicalKey = taskLogicalKey({ candidate_key: lineageKey, source_identity_key: group.key, step });
        const task = priorTaskByLogicalKey.get(logicalKey)
          || createTaskDefinition(step, group, lineageKey, dependsOn);
        groupTasks.push(task);
        byStep.set(step, task);
      });
      tasks.push(...groupTasks);
    });
    const uniqueFreshTasks = new Map();
    tasks.forEach(task => {
      if (!uniqueFreshTasks.has(task.task_id)) uniqueFreshTasks.set(task.task_id, task);
    });
    tasks.splice(0, tasks.length, ...uniqueFreshTasks.values());
    const taskById = new Map(tasks.map(task => [task.task_id, task]));
    const taskByLogicalKey = new Map(tasks.map(task => [taskLogicalKey(task), task]));
    priorTasks.forEach(task => {
      if (!taskById.has(task.task_id)) {
        const logicalKey = taskLogicalKey(task);
        const authoritativePriorTask = priorTaskByLogicalKey.get(logicalKey);
        const generatedActiveLogicalTask = taskByLogicalKey.get(logicalKey);
        const protectedMigrationParent = protectedMigrationParentTaskIds.has(task.task_id);
        if (!protectedMigrationParent && (!authoritativePriorTask || authoritativePriorTask.task_id !== task.task_id)) {
          const activeLogicalTask = generatedActiveLogicalTask || authoritativePriorTask;
          task.status = "superseded";
          task.superseded_by = activeLogicalTask && activeLogicalTask.task_id !== task.task_id
            ? [activeLogicalTask.task_id]
            : [];
          task.superseded_reason = activeLogicalTask ? "duplicate_logical_task" : "incompatible_dependency_manifest";
          taskById.set(task.task_id, task);
          tasks.push(task);
          return;
        }
        if (!protectedMigrationParent && generatedActiveLogicalTask) {
          task.status = "superseded";
          task.superseded_by = [generatedActiveLogicalTask.task_id];
          task.superseded_reason = "duplicate_logical_task";
          taskById.set(task.task_id, task);
          tasks.push(task);
          return;
        }
        const migrationSteps = completedMigrationSteps.get(task.candidate_key);
        if (migrationSteps && !migrationSteps.has(task.step)) {
          task.status = "superseded";
          task.superseded_by = Array.from(branchLineages.get(task.candidate_key) || []).sort();
        }
        taskById.set(task.task_id, task);
        if (authoritativePriorTask?.task_id === task.task_id) taskByLogicalKey.set(taskLogicalKey(task), task);
        tasks.push(task);
      }
    });
    tasks.forEach(task => {
      if (task.status === "superseded") return;
      const { returnedRecords, verifiedRecords } = taskReturnSummary(task);
      task.returned_record_count = returnedRecords.length;
      task.status = verifiedRecords.length
        ? "verified"
        : (returnedRecords.length ? "returned_unverified" : "assigned");
    });
    const taskMap = new Map(tasks.map(task => [task.task_id, task]));
    tasks.forEach(task => {
      if (task.status !== "superseded" && task.status === "assigned"
        && task.depends_on.some(id => taskMap.get(id)?.status !== "verified")) task.status = "blocked";
    });
    if (tasks.length > MAX_TASKS) throw new Error("TASK_LIMIT_EXCEEDED");
    return tasks.sort((left, right) => right.priority - left.priority || left.candidate_key.localeCompare(right.candidate_key) || left.step.localeCompare(right.step));
  }

  function prepareActiveSynthesis(preliminaryAnalysis, previousTasks = []) {
    const allRecords = preliminaryAnalysis.groups.flatMap(group => group.records);
    if (previousTasks.length > MAX_TASKS) throw new Error("TASK_LIMIT_EXCEEDED");
    const parsedPriorTasks = previousTasks.map(safePreviousTask);
    const priorTasks = parsedPriorTasks.filter(task => task && taskMatchesCurrentSourceManifest(task, preliminaryAnalysis));
    const validPriorTaskIds = new Set(priorTasks.map(task => task.task_id));
    const invalidManifestTaskIds = Array.from(new Set(previousTasks.map(task => scalarText(task?.task_id, 80))
      .filter(taskId => taskId && !validPriorTaskIds.has(taskId)))).sort();
    const priorTaskById = new Map(priorTasks.map(task => [task.task_id, task]));
    const quarantinedRecords = new Set();
    const manifestMissingRecords = new Set();
    allRecords.forEach(record => {
      if (!record.assigned_task_id) return;
      const task = priorTaskById.get(record.assigned_task_id);
      if (!task) {
        quarantinedRecords.add(record);
        manifestMissingRecords.add(record);
        return;
      }
      if (!taskMatchesLineage(task, record) || !taskExecutorAuthorized(task, record)) quarantinedRecords.add(record);
    });
    const successfulMigrationRecordsBySource = new Map();
    const migratedSourceRecordKeysBySource = new Map();
    const acceptedMigrationRecords = new Set();
    const migrations = [];
    const migrationCandidatesByTask = new Map();
    allRecords.forEach(record => {
      if (quarantinedRecords.has(record)) return;
      const task = priorTaskById.get(record.assigned_task_id);
      if (!task || !["structure", "conditions"].includes(task.step)) return;
      if (!taskMatchesLineage(task, record) || !taskResultSatisfies(task.step, record, task)) return;
      if (!migrationCandidatesByTask.has(task.task_id)) migrationCandidatesByTask.set(task.task_id, []);
      migrationCandidatesByTask.get(task.task_id).push({ task, record });
    });
    const acceptMigration = ({ task, record }) => {
      const sourceIdentity = task.source_identity_key || task.candidate_key;
      if (!successfulMigrationRecordsBySource.has(sourceIdentity)) successfulMigrationRecordsBySource.set(sourceIdentity, new Set());
      successfulMigrationRecordsBySource.get(sourceIdentity).add(record);
      acceptedMigrationRecords.add(record);
      migrations.push({
        task_id: task.task_id,
        step: task.step,
        parent_lineage: task.candidate_key,
        source_identity_key: sourceIdentity,
        destination_identity_key: record.identity_key
      });
    };
    const sourceClaimsForTask = task => {
      const snapshots = Array.isArray(task.required_source_claims) ? task.required_source_claims : [];
      if (snapshots.length) {
        const availableKeys = new Set(allRecords.filter(record => !quarantinedRecords.has(record)).map(sourceRecordKey));
        if (snapshots.some(claim => !availableKeys.has(claim.source_record_key))) return null;
        return snapshots;
      }
      const sourceIdentity = task.source_identity_key || task.candidate_key;
      return allRecords.filter(record => record.identity_key === sourceIdentity
        && !quarantinedRecords.has(record)
        && record.assigned_task_id !== task.task_id
        && (!record.assigned_task_id || (task.depends_on || []).includes(record.assigned_task_id)))
        .map(sourceClaimSnapshot);
    };
    migrationCandidatesByTask.forEach(items => {
      const task = items[0].task;
      const sourceClaims = sourceClaimsForTask(task);
      if (!sourceClaims?.length) return;
      const itemMatchesSource = (item, claim) => sourceClaimMatchesRecord(
        claim,
        item.record,
        task.step === "conditions"
      );
      const validItems = items.filter(item => sourceClaims.some(claim => itemMatchesSource(item, claim)));
      const unmatchedItems = [...validItems].sort((left, right) => JSON.stringify(canonicalRecordProjection(left.record))
        .localeCompare(JSON.stringify(canonicalRecordProjection(right.record))));
      const sourcesCovered = [...sourceClaims].sort((left, right) => left.source_record_key.localeCompare(right.source_record_key)).every(claim => {
        const matchIndex = unmatchedItems.findIndex(item => itemMatchesSource(item, claim));
        if (matchIndex < 0) return false;
        unmatchedItems.splice(matchIndex, 1);
        return true;
      });
      if (!sourcesCovered) return;
      const sourceIdentity = task.source_identity_key || task.candidate_key;
      if (!migratedSourceRecordKeysBySource.has(sourceIdentity)) migratedSourceRecordKeysBySource.set(sourceIdentity, new Set());
      sourceClaims.forEach(claim => migratedSourceRecordKeysBySource.get(sourceIdentity).add(claim.source_record_key));
      validItems.forEach(acceptMigration);
    });

    const acceptedVerificationRecords = new Set();
    const verificationCandidatesByTask = new Map();
    allRecords.forEach(record => {
      if (quarantinedRecords.has(record)) return;
      const task = priorTaskById.get(record.assigned_task_id);
      if (!task || task.step !== "verification" || !taskResultSatisfies("verification", record, task)) return;
      if (!verificationCandidatesByTask.has(task.task_id)) verificationCandidatesByTask.set(task.task_id, []);
      verificationCandidatesByTask.get(task.task_id).push({ task, record });
    });
    verificationCandidatesByTask.forEach(items => {
      const task = items[0].task;
      const sourceClaims = sourceClaimsForTask(task);
      if (!sourceClaims?.length) return;
      const unused = [...items].sort((left, right) => JSON.stringify(canonicalRecordProjection(left.record))
        .localeCompare(JSON.stringify(canonicalRecordProjection(right.record))));
      const covered = [...sourceClaims].sort((left, right) => left.source_record_key.localeCompare(right.source_record_key)).every(claim => {
        const matchIndex = unused.findIndex(item => sourceClaimMatchesRecord(claim, item.record, true));
        if (matchIndex < 0) return false;
        unused.splice(matchIndex, 1);
        return true;
      });
      if (covered) items.forEach(item => acceptedVerificationRecords.add(item.record));
    });

    const noveltyCandidatesBySource = new Map();
    allRecords.forEach(record => {
      if (quarantinedRecords.has(record)) return;
      const task = priorTaskById.get(record.assigned_task_id);
      if (!task || task.step !== "novelty" || !taskResultSatisfies("novelty", record, {})) return;
      const sourceIdentity = task.source_identity_key || record.identity_key;
      if (!noveltyCandidatesBySource.has(sourceIdentity)) noveltyCandidatesBySource.set(sourceIdentity, []);
      noveltyCandidatesBySource.get(sourceIdentity).push({ task, record });
    });
    const noveltyResolutions = [];
    const acceptedNoveltyRecords = new Set();
    noveltyCandidatesBySource.forEach((items, sourceIdentity) => {
      const statuses = new Set(items.map(item => item.record.novelty_status));
      if (statuses.size !== 1) return;
      const selected = [...items].sort((left, right) => JSON.stringify(canonicalRecordProjection(left.record))
        .localeCompare(JSON.stringify(canonicalRecordProjection(right.record))))[0];
      noveltyResolutions.push({
        task_id: selected.task.task_id,
        source_identity_key: sourceIdentity,
        novelty_status: selected.record.novelty_status,
        evidence_id: selected.record.evidence_id
      });
      items.forEach(item => acceptedNoveltyRecords.add(item.record));
    });

    const conflictResolutionRecords = new Set();
    const supersededEvidenceByIdentity = new Map();
    const conflictResolutions = [];
    allRecords.forEach(record => {
      if (quarantinedRecords.has(record)) return;
      const task = priorTaskById.get(record.assigned_task_id);
      if (!task || task.step !== "conflict" || record.eligible_for_consensus !== true) return;
      if (!taskMatchesLineage(task, record) || !record.supersedes_evidence_ids?.length) return;
      const sourceIdentity = task.source_identity_key || record.identity_key;
      const sourceGroup = preliminaryAnalysis.groups.find(group => group.key === sourceIdentity);
      const conflictProperties = task.conflict_properties?.length ? task.conflict_properties : (sourceGroup?.conflicts || []);
      if (!conflictProperties.length
        || !conflictProperties.some(property => Object.prototype.hasOwnProperty.call(record.properties || {}, property))) return;
      const availableRecords = allRecords
        .filter(candidate => candidate !== record
          && candidate.identity_key === sourceIdentity
          && candidate.assigned_task_id !== task.task_id
          && conflictProperties.some(property => Object.prototype.hasOwnProperty.call(candidate.properties || {}, property)))
        ;
      const requested = record.supersedes_evidence_ids.map(value => value.toLowerCase());
      if (!requested.length || requested.some(value => !availableRecords.some(candidate =>
        (candidate.evidence_ids || []).some(id => id.toLowerCase() === value)))) return;
      const replacementProperties = new Set(Object.keys(record.properties || {}));
      const supersededRecordsForRequest = availableRecords.filter(candidate => (candidate.evidence_ids || [])
        .some(id => requested.includes(id.toLowerCase())));
      if (supersededRecordsForRequest.some(candidate => Object.keys(candidate.properties || {})
        .some(property => !replacementProperties.has(property)))) return;
      if (!supersededEvidenceByIdentity.has(sourceIdentity)) supersededEvidenceByIdentity.set(sourceIdentity, new Set());
      requested.forEach(value => supersededEvidenceByIdentity.get(sourceIdentity).add(value));
      conflictResolutionRecords.add(record);
      conflictResolutions.push({
        task_id: task.task_id,
        source_identity_key: sourceIdentity,
        resolution_evidence_id: record.evidence_id,
        superseded_evidence_ids: [...record.supersedes_evidence_ids].sort()
      });
    });

    const semanticallyRejectedRecords = new Set();
    allRecords.forEach(record => {
      if (!record.assigned_task_id || quarantinedRecords.has(record)) return;
      const task = priorTaskById.get(record.assigned_task_id);
      if (!task) return;
      let accepted = false;
      if (["structure", "conditions"].includes(task.step)) accepted = acceptedMigrationRecords.has(record);
      else if (task.step === "verification") accepted = acceptedVerificationRecords.has(record);
      else if (task.step === "conflict") accepted = conflictResolutionRecords.has(record);
      else if (task.step === "novelty") accepted = acceptedNoveltyRecords.has(record);
      else {
        const sourceGroup = preliminaryAnalysis.groups.find(group => group.key === (task.source_identity_key || task.candidate_key));
        accepted = taskResultSatisfies(task.step, record, { ...(sourceGroup || {}), ...task });
      }
      if (!accepted) {
        semanticallyRejectedRecords.add(record);
        quarantinedRecords.add(record);
      }
    });

    const supersededRecords = new Set();
    const activeRecords = allRecords.filter(record => {
      if (quarantinedRecords.has(record)) {
        return false;
      }
      const migratedSourceRecordKeys = migratedSourceRecordKeysBySource.get(record.identity_key);
      const migrationLeaves = successfulMigrationRecordsBySource.get(record.identity_key);
      if (migratedSourceRecordKeys?.has(sourceRecordKey(record)) && !migrationLeaves?.has(record)) {
        supersededRecords.add(record);
        return false;
      }
      const supersededIds = supersededEvidenceByIdentity.get(record.identity_key);
      if (supersededIds && !conflictResolutionRecords.has(record)
        && (record.evidence_ids || []).some(value => supersededIds.has(value.toLowerCase()))) {
        supersededRecords.add(record);
        return false;
      }
      return true;
    });
    return {
      allRecords,
      activeRecords,
      migrations,
      acceptedMigrationRecords,
      acceptedVerificationRecords,
      noveltyResolutions,
      conflictResolutions,
      acceptedConflictResolutionRecords: conflictResolutionRecords,
      validatedPreviousTasks: priorTasks,
      invalidManifestTaskIds,
      quarantinedRecords: Array.from(quarantinedRecords),
      manifestMissingRecords: Array.from(manifestMissingRecords),
      semanticallyRejectedRecords: Array.from(semanticallyRejectedRecords),
      supersededRecords: Array.from(supersededRecords),
      supersededSourceIdentities: Array.from(successfulMigrationRecordsBySource.keys()).sort(),
      supersededEvidenceIds: Array.from(new Set(conflictResolutions.flatMap(item => item.superseded_evidence_ids))).sort()
    };
  }

  function createOrchestration(inputRecords = [], campaign = {}, previousOrchestration = null) {
    const campaignData = campaignManifest(campaign);
    const previousTasks = Array.isArray(previousOrchestration)
      ? previousOrchestration
      : (Array.isArray(previousOrchestration?.tasks) ? previousOrchestration.tasks : []);
    const preliminaryAnalysis = analyzeRecords(inputRecords);
    const prepared = prepareActiveSynthesis(preliminaryAnalysis, previousTasks);
    const unscopedAnalysis = analyzeRecords(prepared.activeRecords);
    prepared.noveltyResolutions.forEach(resolution => {
      const group = unscopedAnalysis.groups.find(item => item.key === resolution.source_identity_key);
      if (!group) return;
      group.novelty_status = resolution.novelty_status;
      group.next_steps = nextSteps(group);
    });
    const allowedElements = new Set(campaignData.objective.allowed_elements || []);
    const excludedElements = new Set(campaignData.objective.excluded_elements || []);
    const thresholdProperty = {
      tc_K: "tc_K",
      band_gap_eV: "band_gap_eV",
      magnetic: "magnetic_moment_muB"
    }[campaignData.objective.target] || "";
    const threshold = campaignData.objective.target_value;
    const groupScopeReason = group => {
      const elements = new Set(group.records[0]?.elements || []);
      if (excludedElements.size && [...elements].some(element => excludedElements.has(element))) return "excluded_element";
      if (allowedElements.size && elements.size && [...elements].some(element => !allowedElements.has(element))) return "outside_allowed_elements";
      const targetAggregate = thresholdProperty ? group.properties?.[thresholdProperty] : null;
      if (threshold !== null && targetAggregate && Number.isFinite(targetAggregate.max) && targetAggregate.max < threshold) return "below_target_threshold";
      return "";
    };
    const outOfScopeCandidates = unscopedAnalysis.groups.map(group => ({ group, reason: groupScopeReason(group) })).filter(item => item.reason);
    const groups = unscopedAnalysis.groups.filter(group => !groupScopeReason(group));
    const scopedRecords = groups.flatMap(group => group.records);
    const analysis = {
      ...unscopedAnalysis,
      normalized_count: scopedRecords.length,
      model_count: new Set(scopedRecords.map(record => record.model)).size,
      candidate_count: groups.length,
      agreement_count: groups.filter(group => group.has_consensus_claim).length,
      conflict_count: groups.filter(group => group.conflicts.length > 0).length,
      groups
    };
    const modelReports = createModelReports(preliminaryAnalysis);
    const tasks = createTaskPlan(
      analysis,
      prepared.validatedPreviousTasks,
      prepared.allRecords,
      prepared.acceptedConflictResolutionRecords,
      prepared.acceptedMigrationRecords,
      prepared.acceptedVerificationRecords,
      new Set(prepared.quarantinedRecords)
    );
    const outOfScopeKeys = new Set(outOfScopeCandidates.map(item => item.group.key));
    tasks.forEach(task => {
      if (outOfScopeKeys.has(task.source_identity_key) || outOfScopeKeys.has(task.candidate_key)) {
        task.status = "superseded";
        task.superseded_reason = "campaign_scope";
      }
    });
    const inputCanonical = prepared.allRecords.map(record => JSON.stringify(canonicalRecordProjection(record))).sort().join("|");
    const inputDigest = stableWorkflowId("input", inputCanonical);
    const activeTasks = tasks.filter(task => task.status !== "superseded");
    const supersededTasks = tasks.filter(task => task.status === "superseded");
    const verifiedTasks = activeTasks.filter(task => task.status === "verified");
    const returnedTasks = activeTasks.filter(task => task.status === "returned_unverified");
    const pendingTasks = activeTasks.filter(task => ["assigned", "blocked"].includes(task.status));
    const knownTaskIds = new Set(tasks.map(task => task.task_id));
    const unmatchedReturnTaskIds = Array.from(new Set(prepared.allRecords.map(record => record.assigned_task_id)
      .filter(taskId => taskId && !knownTaskIds.has(taskId)))).sort();
    const taskByReturnId = new Map(tasks.map(task => [task.task_id, task]));
    const mismatchedReturnTaskIds = Array.from(new Set(prepared.allRecords.filter(record => {
      const task = taskByReturnId.get(record.assigned_task_id);
      return task && !taskMatchesLineage(task, record);
    }).map(record => record.assigned_task_id))).sort();
    const unauthorizedReturnTaskIds = Array.from(new Set(prepared.allRecords.filter(record => {
      const task = taskByReturnId.get(record.assigned_task_id);
      return task && taskMatchesLineage(task, record) && !taskExecutorAuthorized(task, record);
    }).map(record => record.assigned_task_id))).sort();
    const invalidReturnTaskIds = Array.from(new Set(prepared.semanticallyRejectedRecords
      .map(record => record.assigned_task_id).filter(Boolean))).sort();
    const manifestMissingReturnTaskIds = Array.from(new Set(prepared.manifestMissingRecords
      .map(record => record.assigned_task_id).filter(Boolean))).sort();
    const hasExperimentalSupport = analysis.groups.some(group => formalExperimentSupportProperties(group).some(property =>
      group.records.some(record => recordIsTargetAlignedExperiment(record, group)
        && Object.prototype.hasOwnProperty.call(record.properties || {}, property))));
    const claimStatus = hasExperimentalSupport ? "experimentally_supported_candidate" : (analysis.agreement_count ? "computational_candidate" : "planning_only");
    const status = modelReports.length > 0
      && analysis.candidate_count > 0
      && activeTasks.every(task => task.status === "verified")
      && prepared.quarantinedRecords.length === 0
      && unmatchedReturnTaskIds.length === 0
      && mismatchedReturnTaskIds.length === 0
      && unauthorizedReturnTaskIds.length === 0
      && prepared.invalidManifestTaskIds.length === 0
      ? "complete"
      : "partial";
    const canonicalKey = JSON.stringify({ input_digest: inputDigest, campaign: campaignData.objective, task_ids: tasks.map(task => task.task_id) });
    return {
      schema: ORCHESTRATION_SCHEMA,
      orchestration_id: stableWorkflowId("orchestration", canonicalKey),
      canonical_key: canonicalKey,
      input_digest: inputDigest,
      created_at: new Date().toISOString(),
      phase: modelReports.length ? (status === "complete" ? "report_ready" : "awaiting_results") : "reports_collected",
      host: {
        model_id: "materials-chair-local-v1",
        model_name: "Materials Research Chair / 材料研究主持人",
        role: "orchestrator",
        mode: "deterministic_local",
        scientific_evidence_contribution: 0
      },
      campaign: campaignData,
      model_reports: modelReports,
      synthesis: {
        analysis,
        candidate_count: analysis.candidate_count,
        agreement_count: analysis.agreement_count,
        conflict_count: analysis.conflict_count,
        unverified_record_count: prepared.allRecords.filter(record => !record.eligible_for_consensus).length,
        superseded_record_count: prepared.supersededRecords.length,
        quarantined_return_record_count: prepared.quarantinedRecords.length,
        superseded_source_identity_keys: prepared.supersededSourceIdentities,
        superseded_evidence_ids: prepared.supersededEvidenceIds,
        out_of_scope_candidate_count: outOfScopeCandidates.length,
        out_of_scope_candidates: outOfScopeCandidates.map(item => ({ candidate_key: item.group.key, candidate: item.group.formula || item.group.structure_id || "Text candidate", reason: item.reason })),
        unmatched_return_task_ids: unmatchedReturnTaskIds,
        mismatched_return_task_ids: mismatchedReturnTaskIds,
        unauthorized_return_task_ids: unauthorizedReturnTaskIds,
        invalid_return_task_ids: invalidReturnTaskIds,
        manifest_missing_return_task_ids: manifestMissingReturnTaskIds,
        invalid_task_manifest_ids: prepared.invalidManifestTaskIds,
        priority_candidates: analysis.groups.slice(0, 5).map(group => ({
          candidate_key: group.key,
          candidate: group.formula || group.structure_id || "Text candidate",
          review_priority: group.priority,
          formal_consensus: group.consensus_properties,
          conflicts: group.conflicts,
          next_steps: group.next_steps
        }))
      },
      tasks,
      final_report: {
        schema: EXECUTION_REPORT_SCHEMA,
        execution_status: status,
        claim_status: claimStatus,
        verified_task_ids: verifiedTasks.map(task => task.task_id),
        returned_unverified_task_ids: returnedTasks.map(task => task.task_id),
        pending_task_ids: pendingTasks.map(task => task.task_id),
        superseded_task_ids: supersededTasks.map(task => task.task_id),
        unmatched_return_task_ids: unmatchedReturnTaskIds,
        mismatched_return_task_ids: mismatchedReturnTaskIds,
        unauthorized_return_task_ids: unauthorizedReturnTaskIds,
        invalid_return_task_ids: invalidReturnTaskIds,
        manifest_missing_return_task_ids: manifestMissingReturnTaskIds,
        invalid_task_manifest_ids: prepared.invalidManifestTaskIds,
        limitations: [
          "The local chair does not execute external models or paid jobs.",
          "A returned task result remains unverified until a trusted adapter and traceable evidence validate it.",
          "Structure-resolution branches never inherit numeric claims from an unresolved parent; each polymorph requires new calculations.",
          "No orchestration state can by itself support a new-material discovery claim."
        ]
      },
      security: { credentials_included: prepared.allRecords.some(containsPotentialCredentials), paid_job_submitted: false },
      audit_log: [
        { event: "reports_collected", count: modelReports.length },
        { event: "deterministic_synthesis_created", candidate_count: analysis.candidate_count },
        { event: "lineage_migrations_applied", count: prepared.migrations.length, superseded_record_count: prepared.supersededRecords.length },
        { event: "novelty_resolutions_applied", count: prepared.noveltyResolutions.length },
        { event: "campaign_scope_applied", included_candidate_count: analysis.candidate_count, excluded_candidate_count: outOfScopeCandidates.length },
        { event: "conflict_resolutions_applied", count: prepared.conflictResolutions.length, superseded_evidence_ids: prepared.supersededEvidenceIds },
        { event: "task_returns_quarantined", count: prepared.quarantinedRecords.length, manifest_missing_task_ids: manifestMissingReturnTaskIds, invalid_manifest_task_ids: prepared.invalidManifestTaskIds, unauthorized_task_ids: unauthorizedReturnTaskIds, invalid_task_ids: invalidReturnTaskIds },
        { event: "tasks_assigned", count: activeTasks.length }
      ]
    };
  }

  function createTaskPackage(orchestration) {
    const serializeTask = task => ({
      task_id: task.task_id,
      manifest_digest: task.manifest_digest,
      candidate_key: task.candidate_key,
      source_identity_key: task.source_identity_key,
      candidate: task.candidate,
      composition_key: task.composition_key,
      structure_identity_resolved: task.structure_identity_resolved,
      structure_id: task.structure_id,
      structure_hash: task.structure_hash,
      structure_namespace: task.structure_namespace,
      space_group: task.space_group,
      target_definition: task.target_definition,
      condition_fingerprint: task.condition_fingerprint,
      condition_state: task.condition_state,
      conflict_properties: task.conflict_properties,
      required_properties: task.required_properties,
      required_experiment_properties: task.required_experiment_properties,
      required_source_claims: task.required_source_claims,
      required_property_values: task.required_property_values,
      step: task.step,
      assigned_to: task.assigned_to,
      objective_zh: task.objective_zh,
      objective_en: task.objective_en,
      deliverable_zh: task.deliverable_zh,
      deliverable_en: task.deliverable_en,
      expected_output_schema: task.expected_output_schema,
      priority: task.priority,
      status: task.status,
      superseded_by: task.superseded_by || [],
      superseded_reason: task.superseded_reason || "",
      depends_on: task.depends_on,
      paid_job_submitted: false
    });
    const allTasks = Array.isArray(orchestration?.tasks) ? orchestration.tasks : [];
    const tasks = allTasks.filter(task => task.status !== "superseded").map(serializeTask);
    const supersededTasks = allTasks.filter(task => task.status === "superseded").map(serializeTask);
    return {
      schema: TASK_PACKAGE_SCHEMA,
      orchestration_id: scalarText(orchestration?.orchestration_id, 100),
      input_digest: scalarText(orchestration?.input_digest, 100),
      campaign: orchestration?.campaign?.objective || {},
      return_contract: {
        schema: SCHEMA,
        required_link_fields: ["assigned_task_id", "formula", "model", "stage"],
        verification_note: "Returned records remain unverified until accepted by a trusted adapter with traceable evidence.",
        lineage_rules: [
          "The returned model/executor must match one of assigned_to; reassign a task explicitly before using another executor.",
          "Structure branches do not inherit numeric properties from an unresolved parent; recalculate properties for every returned polymorph.",
          "A conditions result must return every property listed in required_properties under the completed condition set.",
          "A general experiment result must measure at least one property in required_experiment_properties; unverified side claims cannot satisfy experimental validation.",
          "A conflict result must explicitly list same-lineage evidence IDs in supersedes_evidence_ids; history remains in the audit log."
        ]
      },
      tasks,
      superseded_tasks: supersededTasks,
      security: { credentials_included: [...tasks, ...supersededTasks].some(containsPotentialCredentials), paid_job_submitted: false }
    };
  }

  function createExecutionMarkdown(orchestration, lang = "zh") {
    const zh = lang === "zh";
    const lines = [
      `# ${zh ? "材料研究主持人执行报告" : "Materials Research Chair Execution Report"}`,
      "",
      `${zh ? "主持模式" : "Chair mode"}: ${orchestration.host.mode}`,
      `${zh ? "执行状态" : "Execution status"}: ${orchestration.final_report.execution_status}`,
      `${zh ? "科学声明状态" : "Scientific claim status"}: ${orchestration.final_report.claim_status}`,
      "",
      `> ${zh ? TEXT.zh.chairBoundary : TEXT.en.chairBoundary}`,
      "",
      `## ${zh ? "模型独立报告" : "Independent model reports"}`,
      ""
    ];
    orchestration.model_reports.forEach(report => {
      lines.push(`### ${report.author.model_name}`);
      lines.push(`- ${zh ? "状态" : "Status"}: ${report.status}`);
      lines.push(`- ${zh ? "候选数" : "Candidates"}: ${report.candidate_count}`);
      lines.push(`- ${zh ? "数值声明" : "Numeric claims"}: ${report.property_claims.length}`);
      report.recommendations.forEach(item => lines.push(`- ${item.text}`));
      lines.push("");
    });
    lines.push(`## ${zh ? "主持综合" : "Chair synthesis"}`, "");
    lines.push(`- ${zh ? "归并候选" : "Merged candidates"}: ${orchestration.synthesis.candidate_count}`);
    lines.push(`- ${zh ? "正式数值共识" : "Formal numeric consensus"}: ${orchestration.synthesis.agreement_count}`);
    lines.push(`- ${zh ? "数值冲突" : "Numeric conflicts"}: ${orchestration.synthesis.conflict_count}`);
    lines.push(`- ${zh ? "未核验记录" : "Unverified records"}: ${orchestration.synthesis.unverified_record_count}`);
    lines.push(`- ${zh ? "未知任务 ID" : "Unknown task IDs"}: ${orchestration.synthesis.unmatched_return_task_ids?.length || 0}`);
    lines.push(`- ${zh ? "候选身份不匹配的回传" : "Lineage-mismatched returns"}: ${orchestration.synthesis.mismatched_return_task_ids?.length || 0}`);
    lines.push(`- ${zh ? "执行者未授权的回传" : "Unauthorized executor returns"}: ${orchestration.synthesis.unauthorized_return_task_ids?.length || 0}`);
    lines.push(`- ${zh ? "交付内容不符合任务的回传" : "Semantically invalid task returns"}: ${orchestration.synthesis.invalid_return_task_ids?.length || 0}`);
    lines.push(`- ${zh ? "已归档旧记录" : "Superseded records"}: ${orchestration.synthesis.superseded_record_count || 0}`);
    lines.push(`- ${zh ? "已归档旧任务" : "Superseded tasks"}: ${orchestration.final_report.superseded_task_ids?.length || 0}`);
    lines.push("", `## ${zh ? "任务分配与执行" : "Task assignment and execution"}`, "");
    lines.push(`| ${zh ? "候选" : "Candidate"} | ${zh ? "任务" : "Task"} | ${zh ? "负责人" : "Owner"} | ${zh ? "状态" : "Status"} | ${zh ? "交付物" : "Deliverable"} |`);
    lines.push("|---|---|---|---|---|");
    orchestration.tasks.forEach(task => {
      lines.push(`| ${task.candidate.replace(/\|/g, "\\|")} | ${task.step} | ${task.assigned_to.join(", ").replace(/\|/g, "\\|")} | ${task.status} | ${(zh ? task.deliverable_zh : task.deliverable_en).replace(/\|/g, "\\|")} |`);
    });
    lines.push("", `## ${zh ? "限制" : "Limitations"}`, "");
    orchestration.final_report.limitations.forEach(item => lines.push(`- ${item}`));
    return `${lines.join("\n")}\n`;
  }

  function campaignManifest(campaign = {}) {
    const allowed = parseElementList(campaign.allowed_elements);
    const excluded = parseElementList(campaign.excluded_elements);
    const target = redactSensitiveText(campaign.target || "stability", 100);
    if (containsPotentialCredentials(target)) throw new Error("SENSITIVE_CAMPAIGN_VALUE");
    const objective = {
      target,
      target_value: finiteNumber(campaign.target_value),
      allowed_elements: allowed,
      excluded_elements: excluded
    };
    return {
      schema: CAMPAIGN_SCHEMA,
      created_at: new Date().toISOString(),
      status: "compute-plan-not-submitted",
      objective,
      workflow: [
        { stage: "candidate_generation", suggested_models: ["MatterGen", "CrystalStructureGen"], output: "versioned crystal structures" },
        { stage: "rapid_screening", suggested_models: ["MatterSim", "CHGNet", "OpenLAM"], output: "relaxed structures, energy, forces, stability proxies" },
        { stage: "first_principles_verification", suggested_models: ["Quantum Espresso", "ABACUS"], output: "formation energy, hull context, bands, phonons, target properties" },
        { stage: "novelty_and_experiment", suggested_tools: ["versioned database snapshots", "literature search", "structure characterization", "property measurements"] }
      ],
      claim_policy: "Outputs remain computational candidates until dated database/literature matching, first-principles verification, and structured experimental evidence are complete.",
      security: { credentials_included: containsPotentialCredentials(objective), paid_job_submitted: false }
    };
  }

  function parseElementList(value) {
    return Array.from(new Set(String(value || "").split(/[\s,;，；]+/).map(item => {
      const clean = item.trim().toLowerCase();
      return clean ? clean[0].toUpperCase() + clean.slice(1) : "";
    }).filter(item => ELEMENTS.has(item))));
  }

  function fnv1a(value) {
    let hash = 0x811c9dc5;
    for (const character of String(value || "")) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function ownerNamespaceForUser(user = {}) {
    const identity = safeText(user.email || `${user.account_mode || "guest"}:${user.name || "anonymous"}`, 320).toLowerCase();
    return `owner-${fnv1a(identity || "guest:anonymous")}`;
  }

  function formatNumber(value) {
    if (!Number.isFinite(value)) return "–";
    const absolute = Math.abs(value);
    if (absolute && absolute < 0.001) return value.toExponential(2);
    if (absolute >= 100) return value.toFixed(1);
    return value.toFixed(3).replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
  }

  function propertyLabelForReport(property, zh) {
    const meta = PROPERTY_META[property];
    return meta ? (zh ? meta.labelZh : meta.labelEn) : property;
  }

  function reportNextStepLabel(step, zh) {
    const key = {
      structure: "nextStructure",
      conditions: "nextConditions",
      verification: "nextVerification",
      novelty: "nextNovelty",
      stability: "nextStability",
      conflict: "nextConflict",
      target: "nextTarget",
      experiment: "nextExperiment"
    }[step];
    return key ? (zh ? TEXT.zh[key] : TEXT.en[key]) : step;
  }

  function createMarkdownReport(analysis, campaign = {}, lang = "zh") {
    const zh = lang === "zh";
    const lines = [
      `# ${zh ? TEXT.zh.reportTitle : TEXT.en.reportTitle}`,
      "",
      `${zh ? "生成时间" : "Generated"}: ${analysis.created_at}`,
      `${zh ? "目标" : "Target"}: ${campaign.target || "stability"}${finiteNumber(campaign.target_value) !== null ? ` ≥ ${campaign.target_value}` : ""}`,
      "",
      `> ${zh ? TEXT.zh.boundary : TEXT.en.boundary}`,
      "",
      `## ${zh ? "总览" : "Overview"}`,
      "",
      `- ${zh ? "归并候选" : "Merged candidates"}: ${analysis.candidate_count}`,
      `- ${zh ? "模型来源" : "Model sources"}: ${analysis.model_count}`,
      `- ${zh ? "多模型共识组" : "Multi-model groups"}: ${analysis.agreement_count}`,
      `- ${zh ? "含数值分歧的候选" : "Candidates with numeric disagreement"}: ${analysis.conflict_count}`,
      "",
      `## ${zh ? "候选表" : "Candidate table"}`,
      "",
      `| ${zh ? "候选" : "Candidate"} | ${zh ? "核查优先级" : "Review priority"} | ${zh ? "模型" : "Models"} | ${zh ? "关键性质" : "Properties"} | ${zh ? "新颖性" : "Novelty"} |`,
      "|---|---:|---|---|---|"
    ];
    analysis.groups.forEach(group => {
      const properties = Object.values(group.properties).map(property => {
        const meta = PROPERTY_META[property.property];
        return `${zh ? meta.labelZh : meta.labelEn} ${formatNumber(property.value)} ${property.unit}${property.conflict ? ` (${zh ? "分歧" : "conflict"})` : ""}`;
      }).join("; ") || (zh ? "无数值" : "No numeric values");
      lines.push(`| ${group.demo_only ? `[${zh ? "演示" : "DEMO"}] ` : ""}${group.formula || (zh ? "文本建议" : "Text suggestion")} | ${group.priority.score}/100 | ${group.models.join(", ")} | ${properties.replace(/\|/g, "\\|")} | ${group.novelty_status} |`);
    });
    lines.push("", `## ${zh ? "逐项审计" : "Candidate audit"}`, "");
    analysis.groups.forEach((group, index) => {
      lines.push(`### ${index + 1}. ${group.formula || (zh ? "文本建议" : "Text suggestion")}`);
      lines.push(`- ${zh ? "身份键" : "Identity key"}: \`${group.key}\``);
      lines.push(`- ${zh ? "模型" : "Models"}: ${group.models.join(", ")}`);
      lines.push(`- ${zh ? "结构身份" : "Structure identity"}: ${group.identity_resolved ? `${group.structure_namespace ? `${group.structure_namespace}:` : ""}${group.structure_id || group.structure_hash}` : (zh ? "未解析，不能形成正式数值共识" : "unresolved; formal numeric consensus is disabled")}`);
      const propertySummaries = Object.values(group.properties).map(property => {
        if (property.incomparable) {
          return `${propertyLabelForReport(property.property, zh)}: ${property.values.map(item => `${item.model}=${formatNumber(item.value)} ${property.unit}`).join("; ")} (${zh ? "未合并" : "not merged"})`;
        }
        return `${propertyLabelForReport(property.property, zh)}: ${formatNumber(property.value)} ${property.unit}${property.count > 1 ? ` [${formatNumber(property.min)}–${formatNumber(property.max)}]` : ""}${property.conflict ? ` (${zh ? "存在分歧" : "conflict"})` : ""}`;
      });
      lines.push(`- ${zh ? "数值性质" : "Numeric properties"}: ${propertySummaries.join("; ") || (zh ? "无" : "none")}`);
      lines.push(`- ${zh ? "正式数值共识" : "Formal numeric consensus"}: ${group.has_consensus_claim ? group.consensus_properties.map(property => propertyLabelForReport(property, zh)).join(", ") : (zh ? "无；当前数值仅作比较或仍有证据缺口" : "none; current values remain comparative or evidence-incomplete")}`);
      lines.push(`- ${zh ? "新颖性" : "Novelty"}: ${group.novelty_status}`);
      lines.push(`- ${zh ? "排序说明" : "Ranking note"}: ${zh ? TEXT.zh.notConfidence : TEXT.en.notConfidence}`);
      if (group.recommendations.length) {
        lines.push(`- ${zh ? "合并建议" : "Merged recommendations"}:`);
        group.recommendations.forEach(item => lines.push(`  - ${item.text} [${item.models.join(", ")}]`));
      }
      lines.push(`- ${zh ? "下一步" : "Next steps"}: ${group.next_steps.map(step => reportNextStepLabel(step, zh)).join("; ") || (zh ? "人工审查" : "manual review")}`);
      lines.push("");
    });
    lines.push(`## ${zh ? "方法与限制" : "Method and limitations"}`, "");
    lines.push(zh
      ? "- 只有相同约化成分、结构身份状态、预测目标、压力、温度、掺杂与方法条件的结果才会归并；结构未指定时不会把多晶型当成同一结构。"
      : "- Results merge only when reduced composition, structure identity state, target, pressure, temperature, doping, and method conditions match; unspecified polymorphs are not claimed to be the same structure.");
    lines.push(zh
      ? "- 只有经过可信适配器核验、带可追溯 DOI / 原始数据 / 运行 ID、且由至少两个独立模型家族对同一性质给出的结果，才可形成正式数值共识；未核验导入只能进入比较表。"
      : "- Formal numeric consensus requires verified adapter output with a traceable DOI, raw-data reference, or run ID from at least two independent model families for the same property; unverified imports remain comparative only.");
    lines.push(zh
      ? "- 关键物理条件必须明确或由可信适配器声明完整；两个相同的“未知条件”不会被视为可比证据。"
      : "- Critical physical conditions must be explicit or certified complete by a trusted adapter; two matching unknowns are not treated as comparable evidence.");
    lines.push(zh
      ? "- 数值中心采用按证据级别和性质专属校准元数据加权的中位数；重复提交同一模型，或不同模型重复引用同一 DOI、实验原始数据或数据库记录，都只计一份独立证据。"
      : "- Numeric centers use a weighted median based on evidence stage and property-specific calibration metadata; duplicate model submissions and repeated use of one DOI, raw experiment, or database record count as one independent source.");
    lines.push(`- ${zh ? TEXT.zh.notConfidence : TEXT.en.notConfidence}`);
    return `${lines.join("\n")}\n`;
  }

  const Core = Object.freeze({
    CAMPAIGN_SCHEMA,
    EXECUTION_REPORT_SCHEMA,
    MAX_FILE_BYTES,
    MAX_RECORDS,
    MAX_TASKS,
    MODEL_REPORT_SCHEMA,
    ORCHESTRATION_SCHEMA,
    PROPERTY_META,
    REPORT_SCHEMA,
    SCHEMA,
    TASK_PACKAGE_SCHEMA,
    analyzeRecords,
    campaignManifest,
    canonicalComposition,
    createExecutionMarkdown,
    createMarkdownReport,
    createModelReports,
    createOrchestration,
    createTaskPackage,
    createTaskPlan,
    jaccard,
    normalizeCandidate,
    normalizePayload,
    ownerNamespaceForUser,
    parseDelimited,
    parseElementList,
    parseInputText,
    recommendationClusters,
    textFeatures,
    weightedMedian
  });

  if (typeof module === "object" && module.exports) {
    const testAdapterEnabled = typeof process === "object" && process?.env?.MATERIAL_CONSENSUS_TEST_ADAPTER === "1";
    module.exports = testAdapterEnabled
      ? Object.freeze({
        ...Core,
        __testNormalizeTrustedCandidate(source, defaults = {}) {
          return normalizeCandidate(source, defaults, TRUSTED_ADAPTER_TOKEN);
        }
      })
      : Core;
  }
  global.MaterialConsensusCore = Core;
  if (!global.document) return;

  const document = global.document;
  const state = { records: [], analysis: null, orchestration: null, taskManifest: [] };
  const nodes = {};
  let activeOwnerKey = "";
  let databasePromise = null;
  let persistenceQueue = Promise.resolve();
  let restoringOwner = false;

  function language() {
    return String(document.documentElement.lang || "zh").toLowerCase().startsWith("zh") ? "zh" : "en";
  }

  function phrase(key, params = {}) {
    let value = TEXT[language()][key] || TEXT.zh[key] || key;
    Object.entries(params).forEach(([name, replacement]) => { value = value.split(`{${name}}`).join(String(replacement)); });
    return value;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  }

  function cloneData(value) {
    if (typeof global.structuredClone === "function") return global.structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  function immutableSnapshot(value) {
    return deepFreeze(cloneData(value));
  }

  function setStatus(message, tone = "") {
    if (!nodes.status) return;
    nodes.status.textContent = message;
    nodes.status.dataset.tone = tone;
  }

  function campaign() {
    return {
      target: nodes.target?.value || "stability",
      target_value: finiteNumber(nodes.targetValue?.value),
      allowed_elements: nodes.allowed?.value || "",
      excluded_elements: nodes.excluded?.value || ""
    };
  }

  function currentOwnerKey() {
    try {
      return ownerNamespaceForUser(JSON.parse(global.localStorage.getItem(USER_STORAGE_KEY) || "{}"));
    } catch (_) {
      return ownerNamespaceForUser({ account_mode: "guest", name: "anonymous" });
    }
  }

  function fallbackKey(ownerKey) {
    return `${STORAGE_KEY}:${ownerKey}`;
  }

  function boundedFallbackSnapshot(snapshot) {
    const reduced = cloneData(snapshot);
    reduced.records = (reduced.records || []).slice(-MAX_RECORDS);
    let serialized = JSON.stringify(reduced);
    while (serialized.length * 2 > MAX_FALLBACK_BYTES && reduced.records.length > 1) {
      reduced.records = reduced.records.slice(Math.max(1, Math.ceil(reduced.records.length * 0.1)));
      serialized = JSON.stringify(reduced);
    }
    if (serialized.length * 2 > MAX_FALLBACK_BYTES) throw new Error("FALLBACK_QUOTA_EXCEEDED");
    return serialized;
  }

  function openConsensusDatabase() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      if (!global.indexedDB) {
        reject(new Error("INDEXEDDB_UNAVAILABLE"));
        return;
      }
      const request = global.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains("reports")) database.createObjectStore("reports", { keyPath: "owner_key" });
        if (!database.objectStoreNames.contains("meta")) database.createObjectStore("meta", { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("INDEXEDDB_OPEN_FAILED"));
      request.onblocked = () => reject(new Error("INDEXEDDB_BLOCKED"));
    });
    return databasePromise;
  }

  async function readOwnerSnapshot(ownerKey) {
    const database = await openConsensusDatabase();
    return new Promise((resolve, reject) => {
      const request = database.transaction("reports", "readonly").objectStore("reports").get(ownerKey);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error("INDEXEDDB_READ_FAILED"));
    });
  }

  async function writeOwnerSnapshot(snapshot) {
    const database = await openConsensusDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(["reports", "meta"], "readwrite");
      transaction.objectStore("reports").put(snapshot);
      transaction.objectStore("meta").put({ key: `updated:${snapshot.owner_key}`, updated_at: snapshot.updated_at });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("INDEXEDDB_WRITE_FAILED"));
      transaction.onabort = () => reject(transaction.error || new Error("INDEXEDDB_WRITE_ABORTED"));
    });
  }

  function applySavedSnapshot(saved) {
    const restored = Array.isArray(saved?.records)
      ? normalizePayload(saved.records.slice(-MAX_RECORDS)).records
      : [];
    state.records = restored.map(record => deepFreeze(cloneData(record)));
    state.taskManifest = Array.isArray(saved?.task_manifest) ? cloneData(saved.task_manifest) : [];
    if (nodes.target) nodes.target.value = saved?.campaign?.target || "stability";
    if (nodes.targetValue) nodes.targetValue.value = saved?.campaign?.target_value ?? "";
    if (nodes.allowed) nodes.allowed.value = saved?.campaign?.allowed_elements || "";
    if (nodes.excluded) nodes.excluded.value = saved?.campaign?.excluded_elements || "";
  }

  async function restoreOwner(ownerKey, announce = true) {
    restoringOwner = true;
    let saved = null;
    try {
      saved = await readOwnerSnapshot(ownerKey);
    } catch (_) {
      try { saved = JSON.parse(global.localStorage.getItem(fallbackKey(ownerKey)) || "null"); } catch (_) {}
    }
    if (!saved) {
      try { saved = JSON.parse(global.localStorage.getItem(fallbackKey(ownerKey)) || "null"); } catch (_) {}
    }
    if (ownerKey === activeOwnerKey) {
      applySavedSnapshot(saved);
      if (announce && state.records.length) setStatus(phrase("restored", { count: state.records.length }), "good");
    }
    restoringOwner = false;
  }

  function safePersist() {
    if (restoringOwner) return persistenceQueue;
    const ownerKey = activeOwnerKey || currentOwnerKey();
    const snapshot = {
      owner_key: ownerKey,
      updated_at: new Date().toISOString(),
      records: cloneData(state.records.slice(-MAX_RECORDS)),
      task_manifest: cloneData(state.taskManifest),
      campaign: cloneData(campaign())
    };
    persistenceQueue = persistenceQueue.catch(() => {}).then(async () => {
      try {
        await writeOwnerSnapshot(snapshot);
      } catch (_) {
        try {
          global.localStorage.setItem(fallbackKey(ownerKey), boundedFallbackSnapshot(snapshot));
        } catch (_) {
          setStatus(phrase("storageFailed"), "error");
        }
      }
    });
    return persistenceQueue;
  }

  async function switchOwnerIfNeeded() {
    const nextOwner = currentOwnerKey();
    if (!activeOwnerKey || nextOwner === activeOwnerKey || restoringOwner) return;
    activeOwnerKey = nextOwner;
    state.records = [];
    state.analysis = null;
    state.orchestration = null;
    state.taskManifest = [];
    await restoreOwner(nextOwner, true);
    render();
  }

  function propertyLabel(property) {
    const meta = PROPERTY_META[property];
    return language() === "zh" ? meta.labelZh : meta.labelEn;
  }

  function noveltyLabel(status) {
    return phrase(status === "known_reference" ? "known" : status === "screened_unverified" ? "screened" : status === "mixed" ? "mixedNovelty" : "unchecked");
  }

  function noveltyTone(status) {
    return status === "known_reference" ? "known" : status === "screened_unverified" ? "screened" : status === "mixed" ? "conflict" : "";
  }

  function priorityLabel(priority) {
    return phrase(priority.level === "high" ? "priorityHigh" : priority.level === "review" ? "priorityReview" : "priorityInsufficient");
  }

  function nextStepLabel(step) {
    return phrase({
      structure: "nextStructure",
      conditions: "nextConditions",
      verification: "nextVerification",
      novelty: "nextNovelty",
      stability: "nextStability",
      conflict: "nextConflict",
      target: "nextTarget",
      experiment: "nextExperiment"
    }[step] || "nextExperiment");
  }

  function chairTaskStatusLabel(status) {
    return phrase({
      verified: "chairStatusVerified",
      returned_unverified: "chairStatusReturned",
      blocked: "chairStatusBlocked",
      superseded: "chairStatusSuperseded",
      assigned: "chairStatusAssigned"
    }[status] || "chairStatusAssigned");
  }

  function renderChair() {
    const orchestration = state.orchestration;
    const reports = orchestration?.model_reports || [];
    const tasks = orchestration?.tasks || [];
    const returned = tasks.filter(task => ["verified", "returned_unverified"].includes(task.status)).length;
    const pending = tasks.filter(task => ["assigned", "blocked"].includes(task.status)).length;
    if (nodes.chairReportCount) nodes.chairReportCount.textContent = reports.length;
    if (nodes.chairTaskCount) nodes.chairTaskCount.textContent = tasks.filter(task => task.status !== "superseded").length;
    if (nodes.chairReturnedCount) nodes.chairReturnedCount.textContent = returned;
    if (nodes.chairPendingCount) nodes.chairPendingCount.textContent = pending;
    const hasReports = reports.length > 0;
    if (nodes.chairEmpty) nodes.chairEmpty.hidden = hasReports;
    if (nodes.chairContent) nodes.chairContent.hidden = !hasReports;
    if (nodes.chairTaskBtn) nodes.chairTaskBtn.disabled = !tasks.length;
    if (nodes.chairReportBtn) nodes.chairReportBtn.disabled = !hasReports;
    if (nodes.chairReports) {
      nodes.chairReports.innerHTML = reports.map(report => {
        const status = report.status === "verified"
          ? phrase("chairStatusVerified")
          : (report.status === "returned_unverified" ? phrase("chairStatusReturned") : (language() === "zh" ? "任务建议预览" : "Task-preview report"));
        const highlight = report.recommendations[0]?.text || (language() === "zh" ? "暂无可合并建议" : "No mergeable recommendation yet");
        return `<article class="material-chair-report-card">
          <strong>${escapeHtml(report.author.model_name)}</strong>
          <span>${escapeHtml(status)} · ${escapeHtml(report.report_kind)}</span>
          <small>${escapeHtml(language() === "zh" ? `${report.candidate_count} 个候选 · ${report.property_claims.length} 项数值声明` : `${report.candidate_count} candidates · ${report.property_claims.length} numeric claims`)}</small>
          <small>${escapeHtml(highlight)}</small>
        </article>`;
      }).join("");
    }
    if (nodes.chairTaskBody) {
      nodes.chairTaskBody.innerHTML = tasks.map(task => `<tr>
        <td>${escapeHtml(task.assigned_to.join(" · ") || (language() === "zh" ? "待指定" : "Unassigned"))}</td>
        <td><strong>${escapeHtml(language() === "zh" ? task.objective_zh : task.objective_en)}</strong><br><small>${escapeHtml(task.step)} · ${escapeHtml(task.task_id)}</small></td>
        <td>${escapeHtml(task.candidate)}</td>
        <td>${escapeHtml(language() === "zh" ? task.deliverable_zh : task.deliverable_en)}</td>
        <td><span class="material-chair-task-status" data-status="${escapeHtml(task.status)}">${escapeHtml(chairTaskStatusLabel(task.status))}</span></td>
      </tr>`).join("");
    }
    if (nodes.chairSummary && orchestration) {
      const synthesis = orchestration.synthesis;
      const unmatched = synthesis.unmatched_return_task_ids?.length || 0;
      const mismatched = synthesis.mismatched_return_task_ids?.length || 0;
      const unauthorized = synthesis.unauthorized_return_task_ids?.length || 0;
      const invalid = synthesis.invalid_return_task_ids?.length || 0;
      const manifestMissing = synthesis.manifest_missing_return_task_ids?.length || 0;
      const invalidManifest = synthesis.invalid_task_manifest_ids?.length || 0;
      const outOfScope = synthesis.out_of_scope_candidate_count || 0;
      const superseded = orchestration.final_report.superseded_task_ids?.length || 0;
      nodes.chairSummary.textContent = language() === "zh"
        ? `主持人已归并 ${synthesis.candidate_count} 个候选、${synthesis.agreement_count} 个正式数值共识和 ${synthesis.conflict_count} 个数值分歧${outOfScope ? `，另有 ${outOfScope} 个候选不符合本轮元素或目标阈值` : ""}；${returned} 项任务已有回传，${pending} 项仍待执行${superseded ? `，${superseded} 项旧任务已归档` : ""}${invalidManifest ? `，${invalidManifest} 项任务清单校验失败` : ""}${manifestMissing ? `，${manifestMissing} 个回传缺少原任务清单` : ""}${unmatched ? `，另有 ${unmatched} 个未知任务 ID` : ""}${mismatched ? `，${mismatched} 个回传与原候选身份不匹配` : ""}${unauthorized ? `，${unauthorized} 个回传执行者未授权` : ""}${invalid ? `，${invalid} 个回传交付内容不合格` : ""}。当前声明状态为 ${orchestration.final_report.claim_status}。主持人本身不计入模型数或科学证据。`
        : `The chair merged ${synthesis.candidate_count} candidates, ${synthesis.agreement_count} formal numeric consensuses, and ${synthesis.conflict_count} numeric conflicts${outOfScope ? `, with ${outOfScope} candidates outside the element or target threshold scope` : ""}; ${returned} tasks have returned and ${pending} remain${superseded ? `, with ${superseded} obsolete tasks archived` : ""}${invalidManifest ? `, with ${invalidManifest} task manifests failing integrity checks` : ""}${manifestMissing ? `, with ${manifestMissing} returns missing their original task manifest` : ""}${unmatched ? `, with ${unmatched} unknown task IDs` : ""}${mismatched ? ` and ${mismatched} lineage-mismatched returns` : ""}${unauthorized ? ` and ${unauthorized} unauthorized-executor returns` : ""}${invalid ? ` and ${invalid} semantically invalid returns` : ""}. Current claim status: ${orchestration.final_report.claim_status}. The chair itself is excluded from model and evidence counts.`;
    }
  }

  function render() {
    state.orchestration = createOrchestration(state.records, campaign(), { tasks: state.taskManifest });
    state.analysis = state.orchestration.synthesis.analysis;
    state.taskManifest = state.orchestration.tasks.map(task => cloneData(task));
    const analysis = state.analysis;
    if (nodes.candidateCount) nodes.candidateCount.textContent = analysis.candidate_count;
    if (nodes.modelCount) nodes.modelCount.textContent = analysis.model_count;
    if (nodes.agreementCount) nodes.agreementCount.textContent = analysis.agreement_count;
    if (nodes.conflictCount) nodes.conflictCount.textContent = analysis.conflict_count;
    const hasResults = analysis.groups.length > 0;
    if (nodes.empty) nodes.empty.hidden = hasResults;
    if (nodes.tableWrap) nodes.tableWrap.hidden = !hasResults;
    [nodes.reportBtn, nodes.jsonBtn].forEach(button => { if (button) button.disabled = !hasResults; });
    renderChair();
    if (!hasResults || !nodes.tableBody) {
      if (nodes.tableBody) nodes.tableBody.innerHTML = "";
      safePersist();
      return;
    }

    nodes.tableBody.innerHTML = analysis.groups.map(group => {
      const conditions = [
        group.demo_only ? phrase("demo") : "",
        group.identity_resolved ? `${group.structure_namespace ? `${group.structure_namespace}:` : ""}${group.structure_id || group.structure_hash}` : phrase("unspecifiedStructure"),
        group.space_group ? `SG ${group.space_group}` : "",
        group.pressure_GPa !== null ? `${group.pressure_GPa} GPa` : "",
        group.temperature_K !== null ? `${group.temperature_K} K` : "",
        group.doping,
        group.functional,
        group.gap_type ? `gap ${group.gap_type}` : "",
        group.spin_orbit_coupling ? `SOC ${group.spin_orbit_coupling}` : "",
        group.hubbard_u ? `U ${group.hubbard_u}` : "",
        group.magnetic_order,
        group.strain ? `strain ${group.strain}` : "",
        group.dimensionality,
        group.substrate ? `substrate ${group.substrate}` : "",
        group.phase_label
      ].filter(Boolean).join(" · ");
      const properties = Object.values(group.properties);
      const propertyHtml = properties.length
        ? `<ul>${properties.map(property => {
          if (property.incomparable) {
            const values = property.values.map(item => `${item.model}: ${formatNumber(item.value)} ${property.unit}`).join(" · ");
            return `<li>${escapeHtml(propertyLabel(property.property))}: <span>${escapeHtml(phrase("incomparableValues"))}</span><br><small>${escapeHtml(values)}</small></li>`;
          }
          return `<li>${escapeHtml(propertyLabel(property.property))}: <strong>${escapeHtml(formatNumber(property.value))} ${escapeHtml(property.unit)}</strong>${property.count > 1 ? ` · ${escapeHtml(formatNumber(property.min))}–${escapeHtml(formatNumber(property.max))}` : ""}${property.conflict ? ` <span class="material-consensus-badge" data-tone="conflict">${escapeHtml(phrase("conflict"))}</span>` : ""}</li>`;
        }).join("")}</ul>`
        : escapeHtml(phrase("noNumeric"));
      const recommendations = group.recommendations.length
        ? `<ul>${group.recommendations.map(item => `<li>${escapeHtml(item.text)} <small>[${escapeHtml(item.models.join(", "))}]</small></li>`).join("")}</ul>`
        : escapeHtml(group.conflicts.length ? phrase("conflict") : phrase("noConflict"));
      const calibratedCount = new Set(group.records.filter(record => record.eligible_for_consensus && Object.values(record.calibration || {}).some(item => item?.q90 > 0 && item?.applicability > 0 && item?.validation_set)).map(record => record.model)).size;
      const eligibleCount = new Set(group.records.filter(record => record.eligible_for_consensus).map(record => record.model)).size;
      const calibrationText = !eligibleCount
        ? phrase("unverifiedSources")
        : (calibratedCount ? phrase("calibrated", { count: calibratedCount }) : phrase("uncalibrated"));
      return `<tr>
        <td><div class="material-consensus-candidate"><strong>${escapeHtml(group.formula || (language() === "zh" ? "文本建议" : "Text suggestion"))}</strong><small>${escapeHtml(conditions)}</small></div></td>
        <td><span class="material-consensus-score" data-level="${escapeHtml(group.priority.level)}" title="${escapeHtml(phrase("notConfidence"))}">${group.priority.score}/100</span><div class="material-consensus-summary">${escapeHtml(priorityLabel(group.priority))}<br><small>${escapeHtml(calibrationText)}</small></div></td>
        <td><div class="material-consensus-models"><strong>${escapeHtml(phrase("models", { count: group.models.length }))}</strong><br>${escapeHtml(group.models.join(" · "))}</div></td>
        <td><div class="material-consensus-properties">${propertyHtml}</div></td>
        <td><span class="material-consensus-badge" data-tone="${escapeHtml(noveltyTone(group.novelty_status))}">${escapeHtml(noveltyLabel(group.novelty_status))}</span></td>
        <td><div class="material-consensus-summary">${recommendations}${group.conflicts.length ? `<p><span class="material-consensus-badge" data-tone="conflict">${escapeHtml(phrase("conflict"))}: ${escapeHtml(group.conflicts.map(propertyLabel).join(", "))}</span></p>` : ""}</div></td>
        <td><div class="material-consensus-summary"><ul>${group.next_steps.map(step => `<li>${escapeHtml(nextStepLabel(step))}</li>`).join("")}</ul></div></td>
      </tr>`;
    }).join("");
    safePersist();
    global.dispatchEvent(new CustomEvent("material-consensus:updated", { detail: immutableSnapshot(analysis) }));
  }

  function addPayload(payload, defaults = {}, statusKey = "imported") {
    const result = normalizePayload(payload, { target: campaign().target, ...defaults });
    const taskById = new Map(state.taskManifest.map(safePreviousTask).filter(Boolean).map(task => [task.task_id, task]));
    result.records = result.records.filter((record, index) => {
      if (!record.assigned_task_id) return true;
      const task = taskById.get(record.assigned_task_id);
      const message = !task
        ? "UNKNOWN_ASSIGNED_TASK_ID"
        : (!taskMatchesLineage(task, record)
          ? "MISMATCHED_ASSIGNED_TASK_LINEAGE"
          : (!taskExecutorAuthorized(task, record) ? "UNAUTHORIZED_TASK_EXECUTOR" : ""));
      if (!message) return true;
      result.errors.push({ index, message });
      return false;
    });
    const internalRecords = result.records.map(record => deepFreeze(cloneData(record)));
    state.records = state.records.concat(internalRecords).slice(-MAX_RECORDS);
    render();
    setStatus(phrase(statusKey, { added: internalRecords.length, errors: result.errors.length }), internalRecords.length ? "good" : "warn");
    return immutableSnapshot({ records: internalRecords, errors: result.errors });
  }

  function collectCurrentSuggestions() {
    const snapshot = global.ARPESCurrentModelSuggestions;
    const formula = safeText(snapshot?.formula, 160);
    const payload = Array.isArray(snapshot?.rows) ? snapshot.rows.filter(row => row?.role !== "host").map(row => ({
      model: safeText(row.model || row.model_id || "Page model", 160),
      model_version: safeText(row.model_id || "page-seat", 120),
      model_family: safeText(row.model_id || row.model || "page-model", 120),
      formula,
      target: campaign().target,
      stage: row.stage || "task_planning",
      recommendation: safeText(row.recommendation),
      source: safeText(row.provenance || `Current page ${row.status || "preview"}`, 500),
      novelty_status: "not_checked"
    })).filter(item => item.recommendation && item.formula && !/等待|awaiting/i.test(item.formula)) : [];
    if (!payload.length) {
      setStatus(phrase("noCurrent"), "warn");
      return;
    }
    addPayload(payload, {}, "collected");
  }

  function examplePayload() {
    return [
      { model: "MatterSim-v1 example", model_version: "demo", model_family: "MatterSim", formula: "FeSe", structure_id: "demo-fese-001", target: "stability", stage: "ml", e_above_hull_eV_atom: 0.035, confidence: 0.78, recommendation: "先做结构弛豫，再用 DFT 与声子复核稳定性。", novelty_status: "known_reference", source: "UI demonstration only" },
      { model: "CHGNet example", model_version: "demo", model_family: "CHGNet", formula: "FeSe", structure_id: "demo-fese-001", target: "stability", stage: "ml", e_above_hull_eV_atom: 0.052, confidence: 0.72, recommendation: "建议结构弛豫，并检查磁矩初始化和声子稳定性。", novelty_status: "known_reference", source: "UI demonstration only" },
      { model: "QE DFT example", model_version: "demo-PBE", model_family: "DFT-PBE", formula: "FeSe", structure_id: "demo-fese-001", target: "stability", stage: "dft", e_above_hull_eV_atom: 0.028, recommendation: "复查形成能参考相，并计算电子能带与声子。", novelty_status: "known_reference", source: "UI demonstration only" },
      { model: "Literature example", model_version: "demo", model_family: "literature", formula: "MgB2", structure_id: "demo-mgb2-001", target: "tc_K", stage: "literature", tc_K: 39, recommendation: "作为已知材料基准，核对模型对 Tc 与声子耦合的再现能力。", novelty_status: "known_reference", source: "UI demonstration only" },
      { model: "LLM planning example", model_version: "demo", model_family: "general-llm", formula: "MgB2", structure_id: "demo-mgb2-001", target: "tc_K", stage: "llm", tc_K: 55, recommendation: "把高 Tc 作为待验证假设，不能把语言模型数值视为物理计算。", novelty_status: "known_reference", source: "UI demonstration only" }
    ].map(record => ({ ...record, demo: true }));
  }

  function download(name, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    global.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importFiles(files) {
    for (const file of Array.from(files || [])) {
      if (file.size > MAX_FILE_BYTES) {
        setStatus(phrase("fileTooLarge"), "error");
        continue;
      }
      try {
        addPayload(parseInputText(await file.text(), file.name), { model: file.name });
      } catch (_) {
        setStatus(phrase("readFailed", { name: file.name }), "error");
      }
    }
  }

  function applyLanguage() {
    document.querySelectorAll("[data-consensus-i18n]").forEach(node => {
      const key = node.dataset.consensusI18n;
      if (TEXT[language()][key]) node.textContent = TEXT[language()][key];
    });
    document.querySelectorAll("[data-consensus-i18n-placeholder]").forEach(node => {
      const key = node.dataset.consensusI18nPlaceholder;
      if (TEXT[language()][key]) node.placeholder = TEXT[language()][key];
    });
    render();
  }

  async function init() {
    nodes.root = document.querySelector("#materialConsensusWorkbench");
    if (!nodes.root) return;
    nodes.target = document.querySelector("#materialConsensusTarget");
    nodes.targetValue = document.querySelector("#materialConsensusTargetValue");
    nodes.allowed = document.querySelector("#materialConsensusAllowed");
    nodes.excluded = document.querySelector("#materialConsensusExcluded");
    nodes.fileInput = document.querySelector("#materialConsensusFileInput");
    nodes.importBtn = document.querySelector("#materialConsensusImportBtn");
    nodes.collectBtn = document.querySelector("#materialConsensusCollectBtn");
    nodes.exampleBtn = document.querySelector("#materialConsensusExampleBtn");
    nodes.clearBtn = document.querySelector("#materialConsensusClearBtn");
    nodes.status = document.querySelector("#materialConsensusStatus");
    nodes.paste = document.querySelector("#materialConsensusPaste");
    nodes.pasteBtn = document.querySelector("#materialConsensusPasteBtn");
    nodes.templateBtn = document.querySelector("#materialConsensusTemplateBtn");
    nodes.empty = document.querySelector("#materialConsensusEmpty");
    nodes.tableWrap = document.querySelector("#materialConsensusTableWrap");
    nodes.tableBody = document.querySelector("#materialConsensusTableBody");
    nodes.candidateCount = document.querySelector("#materialConsensusCandidateCount");
    nodes.modelCount = document.querySelector("#materialConsensusModelCount");
    nodes.agreementCount = document.querySelector("#materialConsensusAgreementCount");
    nodes.conflictCount = document.querySelector("#materialConsensusConflictCount");
    nodes.reportBtn = document.querySelector("#materialConsensusReportBtn");
    nodes.jsonBtn = document.querySelector("#materialConsensusJsonBtn");
    nodes.campaignBtn = document.querySelector("#materialConsensusCampaignBtn");
    nodes.openBtn = document.querySelector("#materialConsensusOpenBtn");
    nodes.chairRunBtn = document.querySelector("#materialChairRunBtn");
    nodes.chairTaskBtn = document.querySelector("#materialChairTaskBtn");
    nodes.chairReportBtn = document.querySelector("#materialChairReportBtn");
    nodes.chairReportCount = document.querySelector("#materialChairReportCount");
    nodes.chairTaskCount = document.querySelector("#materialChairTaskCount");
    nodes.chairReturnedCount = document.querySelector("#materialChairReturnedCount");
    nodes.chairPendingCount = document.querySelector("#materialChairPendingCount");
    nodes.chairEmpty = document.querySelector("#materialChairEmpty");
    nodes.chairContent = document.querySelector("#materialChairContent");
    nodes.chairReports = document.querySelector("#materialChairReports");
    nodes.chairTaskBody = document.querySelector("#materialChairTaskBody");
    nodes.chairSummary = document.querySelector("#materialChairSummary");

    activeOwnerKey = currentOwnerKey();
    await restoreOwner(activeOwnerKey, true);
    applyLanguage();
    nodes.importBtn?.addEventListener("click", () => { nodes.fileInput.value = ""; nodes.fileInput.click(); });
    nodes.fileInput?.addEventListener("change", () => importFiles(nodes.fileInput.files));
    nodes.collectBtn?.addEventListener("click", collectCurrentSuggestions);
    nodes.openBtn?.addEventListener("click", () => nodes.root.scrollIntoView({ behavior: "smooth", block: "start" }));
    nodes.exampleBtn?.addEventListener("click", () => {
      addPayload(examplePayload());
      setStatus(phrase("exampleLoaded"), "good");
    });
    nodes.clearBtn?.addEventListener("click", () => {
      state.records = [];
      state.taskManifest = [];
      render();
      setStatus(phrase("cleared"));
    });
    nodes.pasteBtn?.addEventListener("click", () => {
      try {
        addPayload(parseInputText(nodes.paste.value));
      } catch (_) {
        setStatus(phrase("invalidPaste"), "error");
      }
    });
    nodes.templateBtn?.addEventListener("click", () => {
      const template = { schema: "material-consensus-input/v1", results: [{ model: "Model name", model_version: "version", model_family: "independent family", evidence_id: "stable run ID or content hash", formula: "FeSe", structure_namespace: "materials_project", structure_id: "mp-000000", space_group: "P4/nmm", target_definition: "stability", stage: "ml", e_above_hull_eV_atom: 0.03, e_above_hull_eV_atom_unit: "eV/atom", confidence: 0.75, calibration: { e_above_hull_eV_atom: { q90: null, unit: "eV/atom", applicability: null, validation_set: "" } }, pressure_GPa: null, temperature_K: null, doping: "", functional: "PBE", spin_orbit_coupling: "off", magnetic_order: "", recommendation: "Next validation step", novelty_status: "not_checked", source: "provenance or URL", data_cutoff: "YYYY-MM-DD" }] };
      download("material-model-result-template.json", `${JSON.stringify(template, null, 2)}\n`, "application/json");
      setStatus(phrase("templateDownloaded"), "good");
    });
    [nodes.target, nodes.targetValue, nodes.allowed, nodes.excluded].forEach(node => node?.addEventListener("change", render));
    nodes.reportBtn?.addEventListener("click", () => {
      download("material-consensus-report.md", createMarkdownReport(state.analysis, campaign(), language()), "text/markdown;charset=utf-8");
      setStatus(phrase("reportDownloaded"), "good");
    });
    nodes.jsonBtn?.addEventListener("click", () => {
      download("material-consensus-normalized.json", `${JSON.stringify({ ...state.analysis, campaign: campaign(), normalized_records: state.records }, null, 2)}\n`, "application/json");
      setStatus(phrase("jsonDownloaded"), "good");
    });
    nodes.campaignBtn?.addEventListener("click", () => {
      download("material-discovery-campaign.json", `${JSON.stringify(campaignManifest(campaign()), null, 2)}\n`, "application/json");
      setStatus(phrase("campaignDownloaded"), "good");
    });
    nodes.chairRunBtn?.addEventListener("click", () => {
      render();
      setStatus(phrase("chairGenerated", { reports: state.orchestration.model_reports.length, tasks: state.orchestration.tasks.length }), "good");
    });
    nodes.chairTaskBtn?.addEventListener("click", () => {
      const taskPackage = createTaskPackage(state.orchestration);
      if (taskPackage.security.credentials_included) {
        setStatus(phrase("storageFailed"), "error");
        return;
      }
      download("material-chair-task-package.json", `${JSON.stringify(taskPackage, null, 2)}\n`, "application/json");
      setStatus(phrase("chairDownloadedTasks"), "good");
    });
    nodes.chairReportBtn?.addEventListener("click", () => {
      download("material-chair-execution-report.md", createExecutionMarkdown(state.orchestration, language()), "text/markdown;charset=utf-8");
      setStatus(phrase("chairDownloadedReport"), "good");
    });
    new MutationObserver(mutations => {
      if (mutations.some(mutation => mutation.attributeName === "lang")) applyLanguage();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    new MutationObserver(() => { switchOwnerIfNeeded().catch(() => {}); })
      .observe(document.body, { attributes: true, attributeFilter: ["class"] });
    global.addEventListener("focus", () => { switchOwnerIfNeeded().catch(() => {}); });
    global.addEventListener("storage", event => {
      if (event.key === USER_STORAGE_KEY) switchOwnerIfNeeded().catch(() => {});
    });

    global.MaterialConsensusHub = {
      version: "1.0.0",
      Core,
      ingest(payload, defaults = {}) {
        return addPayload(payload, {
          model: safeText(defaults.model, 160),
          stage: safeText(defaults.stage, 80),
          target: safeText(defaults.target, 100)
        });
      },
      analyze() { render(); return immutableSnapshot(state.analysis); },
      getAnalysis() { return immutableSnapshot(state.analysis); },
      getRecords() { return immutableSnapshot(state.records); },
      getOrchestration() { return immutableSnapshot(state.orchestration); },
      exportTaskPackage() { return immutableSnapshot(createTaskPackage(state.orchestration)); },
      exportCampaign() { return immutableSnapshot(campaignManifest(campaign())); }
    };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})(typeof window !== "undefined" ? window : globalThis);
