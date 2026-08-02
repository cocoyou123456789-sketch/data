(function initMaterialSynthesizer(global) {
  "use strict";

  const VERSION = "1.1.0";
  const RESULT_STAGES = new Set(["llm", "rule", "ml", "validated_ml", "database", "dft", "experiment", "literature", "independent_reproduction"]);
  const PROPERTY_META = Object.freeze({
    formation_energy_eV_atom: Object.freeze({ unit: "eV/atom", tolerance: 0.12, zh: "形成能", en: "formation energy" }),
    e_above_hull_eV_atom: Object.freeze({ unit: "eV/atom", tolerance: 0.06, zh: "凸包能", en: "energy above hull" }),
    band_gap_eV: Object.freeze({ unit: "eV", tolerance: 0.3, zh: "带隙", en: "band gap" }),
    tc_K: Object.freeze({ unit: "K", tolerance: 5, zh: "Tc", en: "Tc" }),
    magnetic_moment_muB: Object.freeze({ unit: "muB", tolerance: 0.3, zh: "磁矩", en: "magnetic moment" })
  });

  function safeText(value, limit = 240) {
    return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
  }

  function finiteNumber(value) {
    if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function normalizeClaim(rawClaim, row) {
    const property = safeText(rawClaim?.property, 80);
    const meta = PROPERTY_META[property];
    const value = finiteNumber(rawClaim?.value);
    if (!meta || value === null) return null;
    const uncertainty = Math.max(0, finiteNumber(rawClaim?.uncertainty) || 0);
    const contextKey = safeText(rawClaim?.contextKey || rawClaim?.context_key, 200);
    return Object.freeze({
      property,
      value,
      unit: safeText(rawClaim?.unit, 32) || meta.unit,
      uncertainty,
      contextKey,
      conditional: rawClaim?.conditional === true,
      eligibleForConsensus: rawClaim?.eligibleForConsensus === true && row.evidenceEligible === true,
      model: row.name,
      modelFamily: row.modelFamily
    });
  }

  function normalizeRow(rawRow) {
    const name = safeText(rawRow?.name || rawRow?.model, 120) || "Unknown model";
    const modelFamily = safeText(rawRow?.modelFamily || rawRow?.model_family || rawRow?.modelId || name, 120).toLowerCase();
    const row = {
      name,
      modelFamily,
      role: safeText(rawRow?.role, 32) || "worker",
      stage: safeText(rawRow?.stage, 48) || "task_planning",
      state: safeText(rawRow?.state, 32) || "idle",
      evidenceEligible: rawRow?.evidenceEligible === true,
      structureResolved: rawRow?.structureResolved === true,
      claims: []
    };
    row.claims = (Array.isArray(rawRow?.claims) ? rawRow.claims : [])
      .map(claim => normalizeClaim(claim, row))
      .filter(Boolean);
    return Object.freeze(row);
  }

  function median(values) {
    const ordered = [...values].sort((left, right) => left - right);
    const middle = Math.floor(ordered.length / 2);
    return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
  }

  function analyzeNumericClaims(rows) {
    const allClaims = rows.flatMap(row => row.claims);
    const buckets = new Map();
    allClaims.forEach(claim => {
      const key = `${claim.property}|${claim.contextKey || "unresolved"}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(claim);
    });

    const comparisons = [];
    buckets.forEach((claims, key) => {
      const byFamily = new Map();
      claims.filter(claim => claim.eligibleForConsensus && claim.contextKey).forEach(claim => {
        if (!byFamily.has(claim.modelFamily)) byFamily.set(claim.modelFamily, []);
        byFamily.get(claim.modelFamily).push(claim);
      });
      const independent = [...byFamily.entries()].map(([modelFamily, familyClaims]) => Object.freeze({
        ...familyClaims[0],
        value: median(familyClaims.map(claim => claim.value)),
        uncertainty: Math.max(...familyClaims.map(claim => claim.uncertainty), 0),
        modelFamily
      }));
      if (independent.length < 2) return;
      const meta = PROPERTY_META[independent[0].property];
      const values = independent.map(claim => claim.value);
      const spread = Math.max(...values) - Math.min(...values);
      const uncertaintyLimit = Math.max(...independent.map(claim => claim.uncertainty), 0);
      const tolerance = Math.max(meta.tolerance, uncertaintyLimit);
      comparisons.push(Object.freeze({
        key,
        property: independent[0].property,
        contextKey: independent[0].contextKey,
        unit: meta.unit,
        value: median(values),
        min: Math.min(...values),
        max: Math.max(...values),
        spread,
        tolerance,
        claimCount: claims.length,
        independentFamilyCount: independent.length,
        independentFamilies: independent.map(claim => claim.modelFamily).sort(),
        status: spread <= tolerance ? "agreement" : "conflict"
      }));
    });

    const contextsByProperty = new Map();
    allClaims.forEach(claim => {
      if (!contextsByProperty.has(claim.property)) contextsByProperty.set(claim.property, new Set());
      contextsByProperty.get(claim.property).add(claim.contextKey || "unresolved");
    });
    const incomparableProperties = [...contextsByProperty.entries()]
      .filter(([, contexts]) => contexts.size > 1 || contexts.has("unresolved"))
      .map(([property]) => property)
      .sort();

    return Object.freeze({
      claimCount: allClaims.length,
      comparisons: Object.freeze(comparisons),
      agreements: Object.freeze(comparisons.filter(item => item.status === "agreement")),
      conflicts: Object.freeze(comparisons.filter(item => item.status === "conflict")),
      incomparableProperties: Object.freeze(incomparableProperties)
    });
  }

  function propertyList(items, language) {
    return items.map(item => PROPERTY_META[item.property]?.[language] || item.property).join(language === "zh" ? "、" : ", ");
  }

  function synthesize(input = {}) {
    const language = input.language === "en" ? "en" : "zh";
    const zh = language === "zh";
    const rows = (Array.isArray(input.rows) ? input.rows : [])
      .map(normalizeRow)
      .filter(row => row.role !== "host");
    const hasComposition = input.hasComposition === true;
    const formula = safeText(input.formula, 120);
    if (!hasComposition) {
      return Object.freeze({
        version: VERSION,
        state: "idle",
        status: zh ? "等待组合" : "Awaiting composition",
        summary: zh
          ? "加入至少两种元素后，材料研究主持人会读取各模型报告，比较数值条件并输出共识、冲突、证据缺口与下一步任务。"
          : "Add at least two elements. The Materials Research Chair will read each model report, compare numeric conditions, and report agreement, conflicts, evidence gaps, and next tasks.",
        returnedCount: 0,
        planningCount: 0,
        runningCount: 0,
        numeric: analyzeNumericClaims([]),
        gaps: Object.freeze([]),
        nextActions: Object.freeze([])
      });
    }

    const returned = rows.filter(row => row.state === "ready" && RESULT_STAGES.has(row.stage));
    const planning = rows.filter(row => row.stage === "task_planning");
    const running = rows.filter(row => row.state === "running");
    const sourceNames = [...new Set(returned.map(row => row.name))].sort((left, right) => left.localeCompare(right));
    const numeric = analyzeNumericClaims(returned);
    const hasStructure = returned.some(row => row.structureResolved || row.claims.some(claim => claim.contextKey && !/unresolved|composition-only/i.test(claim.contextKey)));
    const hasDft = returned.some(row => ["dft", "independent_reproduction"].includes(row.stage));
    const hasExperiment = returned.some(row => row.stage === "experiment");
    const gaps = [];
    if (!hasStructure) gaps.push(zh ? "明确晶体结构" : "resolved crystal structure");
    if (!hasDft) gaps.push(zh ? "独立 DFT / 声子复算" : "independent DFT / phonon calculation");
    if (!hasExperiment) gaps.push(zh ? "实验验证" : "experimental validation");
    if (!numeric.agreements.length) gaps.push(zh ? "同结构同条件的独立数值结果" : "independent numeric results under matching conditions");

    const nextActions = [];
    if (!hasStructure) nextActions.push("structure");
    if (numeric.conflicts.length) nextActions.push("conflict_audit");
    if (!hasDft) nextActions.push("dft");
    if (!hasExperiment) nextActions.push("experiment");

    let state = returned.length ? "ready" : "idle";
    if (running.length) state = "running";
    let status = zh ? `已汇总 ${returned.length} 项结果` : `${returned.length} results synthesized`;
    if (running.length) status = zh ? `正在汇总 · ${running.length} 项运行中` : `Synthesizing · ${running.length} running`;
    else if (numeric.conflicts.length) status = zh ? `发现 ${numeric.conflicts.length} 项数值冲突` : `${numeric.conflicts.length} numeric conflict(s)`;
    else if (numeric.agreements.length) status = zh ? `${numeric.agreements.length} 项数值共识` : `${numeric.agreements.length} numeric consensus result(s)`;

    const sourceText = sourceNames.length ? (zh ? `（${sourceNames.join("、")}）` : ` (${sourceNames.join(", ")})`) : "";
    const classification = safeText(input.classificationLabel, 120) || (zh ? "证据不足" : "insufficient evidence");
    const score = finiteNumber(input.score);
    const rankingText = score === null
      ? ""
      : (zh ? `，探索排序 ${score}/100 仅用于安排后续工作，不是超导概率` : `; the ${score}/100 exploration rank only prioritizes follow-up work and is not a superconductivity probability`);
    let numericText;
    if (numeric.conflicts.length) {
      numericText = zh
        ? `发现 ${numeric.conflicts.length} 项超出误差范围的数值冲突（${propertyList(numeric.conflicts, language)}），必须先核对结构、条件、单位和模型版本。`
        : `${numeric.conflicts.length} numeric conflict(s) exceed the declared tolerance (${propertyList(numeric.conflicts, language)}); audit structure, conditions, units, and model versions first.`;
    } else if (numeric.agreements.length) {
      numericText = zh
        ? `已有 ${numeric.agreements.length} 项由独立模型家族支持的同条件数值共识（${propertyList(numeric.agreements, language)}）。`
        : `${numeric.agreements.length} same-condition numeric consensus result(s) are supported by independent model families (${propertyList(numeric.agreements, language)}).`;
    } else if (numeric.claimCount) {
      numericText = zh
        ? `提取到 ${numeric.claimCount} 项数值主张，但尚未满足同结构、同条件和独立模型家族要求，不能形成正式数值共识。`
        : `${numeric.claimCount} numeric claim(s) were extracted, but they do not yet satisfy matching-structure, matching-condition, and independent-family requirements, so no formal numeric consensus is claimed.`;
    } else {
      numericText = zh ? "尚无可比较的结构化数值结果。" : "No comparable structured numeric results are available yet.";
    }
    const gapText = gaps.length
      ? (zh ? `证据缺口：${gaps.join("、")}。` : `Evidence gaps: ${gaps.join(", ")}.`)
      : (zh ? "当前证据链完整，仍需人工复核最终结论。" : "The current evidence chain is complete, but the final conclusion still requires human review.");
    const summary = zh
      ? `${formula ? `${formula}：` : ""}已汇总 ${returned.length} 项实际结果${sourceText}和 ${planning.length} 项验证计划。共同判断为“${classification}”${rankingText}。${numericText}${gapText}`
      : `${formula ? `${formula}: ` : ""}Synthesized ${returned.length} returned result(s)${sourceText} and ${planning.length} validation plan(s). Shared assessment: “${classification}”${rankingText}. ${numericText} ${gapText}`;

    return Object.freeze({
      version: VERSION,
      state,
      status,
      summary,
      returnedCount: returned.length,
      planningCount: planning.length,
      runningCount: running.length,
      sources: Object.freeze(sourceNames),
      numeric,
      gaps: Object.freeze(gaps),
      nextActions: Object.freeze(nextActions)
    });
  }

  const api = Object.freeze({ VERSION, PROPERTY_META, analyzeNumericClaims, synthesize });
  global.ARPESMaterialSynthesizer = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
