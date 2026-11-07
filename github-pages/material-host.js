(function initMaterialHost(global) {
  "use strict";

  const VERSION = "1.0.0";
  const ELEMENTS = new Set("H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr".split(" "));
  const PROGRAMS = Object.freeze({
    prediction: Object.freeze({ id: "prediction", zh: "材料预测", en: "Materials prediction" }),
    structure: Object.freeze({ id: "structure", zh: "结构检索", en: "Structure search" }),
    literature: Object.freeze({ id: "literature", zh: "文献检索", en: "Literature search" }),
    spectrum: Object.freeze({ id: "spectrum", zh: "谱学工具", en: "Spectrum tools" })
  });
  const PROGRAM_RULES = Object.freeze([
    Object.freeze({ id: "prediction", pattern: /预测|形成能|带隙|超导|稳定|性质|金属性|\btc\b|predict|formation|band\s*gap|baseline|property/i }),
    Object.freeze({ id: "structure", pattern: /结构|晶体|空间群|晶格|晶系|\bcif\b|\bposcar\b|structure|crystal|space\s*group|chemsys/i }),
    Object.freeze({ id: "literature", pattern: /文献|论文|\bdoi\b|\bwos\b|literature|\bpaper\b|papers/i }),
    Object.freeze({ id: "spectrum", pattern: /谱|光谱|能谱|\bxas\b|\barpes\b|\bdos\b|光学吸收|spectrum|\bxps\b|\braman\b/i })
  ]);
  const BROAD_PATTERN = /全面|综合|一起看|都看一下|整体看|overall|everything|all programs|材料研究/;

  function safeText(value, limit = 240) {
    return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
  }

  function isEnglish(language) {
    return language === "en";
  }

  function programLabel(id, language) {
    const meta = PROGRAMS[id] || { zh: id, en: id };
    return isEnglish(language) ? meta.en : meta.zh;
  }

  function countsToFormula(counts) {
    return (Array.isArray(counts) ? counts : [])
      .filter(item => ELEMENTS.has(item?.symbol) && Number(item.count) > 0)
      .map(item => `${item.symbol}${Number(item.count) === 1 ? "" : item.count}`)
      .join("");
  }

  function parseSimpleFormula(text) {
    const input = safeText(text, 80);
    if (!input) return null;
    const tokens = [...input.matchAll(/([A-Z][a-z]?)(\d+(?:\.\d+)?)?/g)];
    if (!tokens.length || tokens.map(token => token[0]).join("") !== input) return null;
    const counts = [];
    for (const token of tokens) {
      const symbol = token[1];
      const count = token[2] === undefined ? 1 : Number(token[2]);
      if (!ELEMENTS.has(symbol) || !Number.isFinite(count) || count <= 0 || count > 99) return null;
      counts.push({ symbol, count });
    }
    if (counts.length < 2) return null;
    return { formula: countsToFormula(counts), counts };
  }

  function firstFormula(text) {
    const pattern = /[A-Z][a-z]?(?:\d+(?:\.\d+)?)?(?:[A-Z][a-z]?(?:\d+(?:\.\d+)?)?){1,11}/g;
    for (const match of String(text || "").matchAll(pattern)) {
      const parsed = parseSimpleFormula(match[0]);
      if (parsed) return parsed;
    }
    return null;
  }

  function resolveMaterial(input = {}) {
    const request = safeText(input.request ?? input.text ?? "", 400);
    const suppliedCounts = Array.isArray(input.counts) ? input.counts.filter(item => ELEMENTS.has(item?.symbol) && Number(item.count) > 0) : [];
    const parsedField = parseSimpleFormula(input.formula);
    const parsedRequest = firstFormula(request);
    const counts = suppliedCounts.length ? suppliedCounts : (parsedField?.counts || parsedRequest?.counts || []);
    const formula = countsToFormula(counts) || parsedField?.formula || parsedRequest?.formula || "";
    const chemsysMatch = request.match(/\b(?:[A-Z][a-z]?-){1,7}[A-Z][a-z]?\b/);
    const materialMatch = request.match(/\bmp-[a-z0-9]+\b/i);
    return {
      request,
      formula,
      counts,
      chemsys: chemsysMatch ? chemsysMatch[0] : "",
      materialId: materialMatch ? materialMatch[0].toLowerCase() : safeText(input.materialId, 40).toLowerCase()
    };
  }

  function selectPrograms(input = {}) {
    const material = typeof input === "string"
      ? resolveMaterial({ request: input })
      : resolveMaterial(input && typeof input === "object" ? input : {});
    const request = material.request;
    const matched = PROGRAM_RULES.filter(rule => rule.pattern.test(request)).map(rule => rule.id);
    const hasMaterial = Boolean(material.formula || material.chemsys || material.materialId || material.counts.length);
    let programs;
    let selection;
    if (!request && !hasMaterial) {
      programs = [];
      selection = "empty";
    } else if (BROAD_PATTERN.test(request)) {
      programs = ["prediction", "structure", "literature"];
      if (matched.includes("spectrum")) programs.push("spectrum");
      selection = "broad";
    } else if (matched.length) {
      programs = matched;
      selection = "matched";
    } else if (hasMaterial) {
      programs = ["prediction"];
      selection = "fallback-prediction";
    } else {
      programs = [];
      selection = "unmatched";
    }
    return Object.freeze({
      request,
      formula: material.formula,
      selection,
      programs: Object.freeze(programs)
    });
  }

  function predictionBrief(data, language) {
    if (!data || data.state !== "ready") return "";
    return isEnglish(language)
      ? `Materials prediction returned a composition baseline: formation energy ${data.formation_energy_eV_atom} eV/atom (dataset absolute-error Q90 ${data.formation_error_q90_eV_atom}), metallic-tendency score ${data.metallic_tendency_score}. This is not a crystal structure and not a superconductivity probability.`
      : `材料预测给出组成基线：形成能 ${data.formation_energy_eV_atom} eV/atom（数据集绝对误差 Q90 ${data.formation_error_q90_eV_atom}），金属性趋势分数 ${data.metallic_tendency_score}。这不是晶体结构，也不是超导概率。`;
  }

  function structureBrief(data, language) {
    const materials = Array.isArray(data?.materials) ? data.materials : [];
    if (!materials.length) {
      return isEnglish(language)
        ? "Structure search returned no matching crystal."
        : "结构检索没有返回匹配晶体。";
    }
    const top = materials[0] || {};
    const symmetry = top.symmetry || {};
    return isEnglish(language)
      ? `Structure search returned ${materials.length} crystal record(s); the first is ${top.formula_pretty || top.formula || "an unnamed formula"} ${top.material_id || ""} (${symmetry.crystal_system || "crystal system unmarked"}, space group ${symmetry.symbol || "unmarked"}).`
      : `结构检索返回 ${materials.length} 条晶体，优先 ${top.formula_pretty || top.formula || "未命名化学式"} ${top.material_id || ""}（${symmetry.crystal_system || "晶系未标注"}，空间群 ${symmetry.symbol || "未标注"}）。`;
  }

  function literatureBrief(data, language) {
    const stats = data?.statistics || {};
    const papers = Number(stats.wos_records) || 0;
    const formulas = Number(stats.formulas_identified) || 0;
    const materials = Number(stats.mp_materials) || 0;
    return isEnglish(language)
      ? `Literature search found ${papers} bibliographic record(s), identified ${formulas} formula(s), and matched ${materials} calculated material record(s). Experimental conditions still have to be checked in the papers.`
      : `文献检索看到 ${papers} 篇题录，识别 ${formulas} 个化学式，对应 ${materials} 条计算材料记录。实验条件仍需回到论文核对。`;
  }

  function spectrumBrief(data, language) {
    const xas = Array.isArray(data?.spectra?.xas) ? data.spectra.xas.length : 0;
    const optical = Boolean(data?.spectra?.optical_absorption);
    if (!xas && !optical) {
      return isEnglish(language)
        ? "Spectrum tools returned no XAS or optical-absorption curve."
        : "谱学工具没有返回 XAS 或光学吸收曲线。";
    }
    return isEnglish(language)
      ? `Spectrum tools returned ${xas} XAS curve(s)${optical ? " and an optical-absorption curve" : " and no optical-absorption curve"}.`
      : `谱学工具返回 ${xas} 条 XAS 曲线${optical ? "，并包含光学吸收曲线" : "，没有光学吸收曲线"}。`;
  }

  function summarizeProgram(id, data, language) {
    if (id === "prediction") return predictionBrief(data, language);
    if (id === "structure") return structureBrief(data, language);
    if (id === "literature") return literatureBrief(data, language);
    if (id === "spectrum") return spectrumBrief(data, language);
    return "";
  }

  function unavailableText(language, zh, en) {
    return isEnglish(language) ? en : zh;
  }

  async function invokeProgram(id, runners, job) {
    const label = programLabel(id, job.language);
    const runner = runners?.[id];
    if (typeof runner !== "function") {
      return {
        id,
        label,
        status: "unavailable",
        brief: "",
        fallback: unavailableText(job.language, "当前页面没有接上这个程序。", "This program is not connected on this page."),
        data: null
      };
    }
    try {
      const result = await runner(job);
      if (!result || result.available === false || result.state === "error" || result.state === "loading" || result.state === "idle") {
        const reason = safeText(result?.reason || result?.error, 180) || unavailableText(
          job.language,
          "程序没有返回可用结果。",
          "The program did not return a usable result."
        );
        return { id, label, status: "unavailable", brief: "", fallback: reason, data: null };
      }
      const data = result.data === undefined ? result : result.data;
      const brief = safeText(result.brief, 420) || summarizeProgram(id, data, job.language);
      return { id, label, status: "returned", brief, fallback: "", data };
    } catch (error) {
      return {
        id,
        label,
        status: "unavailable",
        brief: "",
        fallback: safeText(error?.message, 180) || unavailableText(job.language, "程序调用失败。", "The program call failed."),
        data: null
      };
    }
  }

  function assembleConclusion(report = {}) {
    const language = report.language === "en" ? "en" : "zh";
    const zh = !isEnglish(language);
    const calls = Array.isArray(report.calls) ? report.calls : [];
    const formula = safeText(report.formula, 80);
    const returned = calls.filter(call => call?.status === "returned" && call.brief);
    const missed = calls.filter(call => call?.status === "unavailable");
    let body;
    if (!calls.length) {
      body = report.selection === "unmatched"
        ? (zh
          ? "主持人没有调用程序：这句话还对不上材料预测、结构检索、文献检索或谱学。"
          : "The host did not call a program: the request does not match materials prediction, structure search, literature search, or spectrum tools.")
        : (zh
          ? "主持人还没有调用程序。请给出材料，或说明要做预测、结构检索、文献检索还是谱学。"
          : "The host has not called a program yet. Name a material, or ask for prediction, structure search, literature search, or spectrum tools.");
    } else if (!returned.length) {
      body = zh
        ? "主持人已按请求调用所选程序，但没有拿到可用返回。"
        : "The host called the selected programs, but none returned a usable result.";
    } else {
      body = returned.map(call => call.brief).join(zh ? "" : " ");
    }
    const fallbackNote = report.selection === "fallback-prediction"
      ? (zh ? "请求没有点名具体程序，主持人改调用材料预测。" : "The request did not name a program, so the host fell back to materials prediction.")
      : "";
    const missText = missed.length
      ? (zh
        ? `未能使用：${missed.map(call => `${call.label}（${call.fallback}）`).join("；")}。`
        : `Unavailable: ${missed.map(call => `${call.label} (${call.fallback})`).join("; ")}.`)
      : "";
    const prefix = formula ? (zh ? `关于 ${formula}，` : `For ${formula}, `) : "";
    const tail = zh
      ? "以上是主持人根据程序返回汇编的一条结论，不是超导证明，也不是新材料发现。"
      : "This is the host's single conclusion assembled from program returns. It is not proof of superconductivity and not a materials discovery.";
    return [prefix + body, fallbackNote, missText, tail].filter(Boolean).join(zh ? "" : " ");
  }

  async function runHost(input = {}, options = {}) {
    const language = input.language === "en" ? "en" : "zh";
    const material = resolveMaterial(input);
    const plan = selectPrograms({ ...input, ...material, language });
    const runners = options.runners || createPageRunners(options);
    const job = {
      request: material.request,
      language,
      formula: material.formula,
      counts: material.counts,
      chemsys: material.chemsys,
      materialId: material.materialId,
      query: material.request || material.formula
    };
    const independent = plan.programs.filter(id => id !== "spectrum");
    const settled = await Promise.all(independent.map(id => invokeProgram(id, runners, job)));
    const byId = new Map(settled.map(call => [call.id, call]));
    const calls = [];
    for (const id of plan.programs) {
      if (id !== "spectrum") {
        calls.push(byId.get(id));
        continue;
      }
      const structure = byId.get("structure");
      const materialId = job.materialId || structure?.data?.materials?.[0]?.material_id || "";
      const formula = job.formula || structure?.data?.materials?.[0]?.formula_pretty || "";
      calls.push(await invokeProgram("spectrum", runners, {
        ...job,
        materialId,
        formula,
        prior: { structure: structure?.data || null }
      }));
    }
    const report = {
      version: VERSION,
      language,
      request: material.request,
      formula: material.formula,
      selection: plan.selection,
      programs: plan.programs,
      calls
    };
    report.conclusion = assembleConclusion(report);
    return Object.freeze({
      ...report,
      programs: Object.freeze([...plan.programs]),
      calls: Object.freeze(calls)
    });
  }

  function resolveEndpoints(env = {}) {
    if (env.endpoints) return env.endpoints;
    const host = env.hostname || (typeof location !== "undefined" ? location.hostname : "");
    const hosted = /(^|\.)localhost$|^127\.0\.0\.1$|vercel\.app$|netlify\.app$/.test(host);
    const structureDefault = hosted
      ? "/api/materials-structure"
      : "https://arpes-materials-explorer-cocoyou-361.netlify.app/.netlify/functions/materials-structure";
    const literatureDefault = hosted
      ? "/api/materials-search"
      : "https://arpes-materials-explorer-cocoyou-361.netlify.app/.netlify/functions/materials-search";
    let structure = structureDefault;
    let literature = literatureDefault;
    const storage = env.storage || (typeof localStorage !== "undefined" ? localStorage : null);
    try {
      const storedStructure = storage?.getItem?.("materialsStructureApiEndpoint");
      const storedLiterature = storage?.getItem?.("materialsSearchApiEndpoint");
      if (storedStructure && !storedStructure.includes("arpes-materials-explorer-cocoyou.netlify.app/.netlify/functions/materials-structure")) {
        structure = storedStructure;
      }
      if (storedLiterature && !storedLiterature.includes("arpes-materials-explorer-cocoyou.netlify.app/.netlify/functions/materials-search")) {
        literature = storedLiterature;
      }
    } catch {
      /* The page can still use the default endpoints. */
    }
    return { structure, literature };
  }

  async function postJson(endpoint, body, fetchImpl, language) {
    if (!endpoint || typeof fetchImpl !== "function") {
      return {
        available: false,
        reason: unavailableText(language, "当前页面没有可调用的接口。", "No program endpoint is available on this page.")
      };
    }
    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        signal: typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(20000) : undefined
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) {
        return {
          available: false,
          reason: safeText(data.error, 180) || `HTTP ${response.status}`
        };
      }
      return { available: true, data };
    } catch (error) {
      return {
        available: false,
        reason: safeText(error?.message, 180) || unavailableText(language, "请求失败。", "The request failed.")
      };
    }
  }

  function createPageRunners(env = {}) {
    const fetchImpl = env.fetchImpl || global.fetch;
    const endpoints = resolveEndpoints(env);
    const baseline = env.baseline || global.ARPESMaterialBaseline;
    return {
      prediction: async job => {
        if (!baseline?.predictCounts) {
          return {
            available: false,
            reason: unavailableText(job.language, "本地材料预测程序没有加载。", "The local prediction program is not loaded.")
          };
        }
        if (!Array.isArray(job.counts) || job.counts.length < 2) {
          return {
            available: false,
            reason: unavailableText(job.language, "材料预测需要至少两种元素。", "Prediction needs at least two elements.")
          };
        }
        const data = baseline.predictCounts(job.counts);
        if (data?.state !== "ready") {
          return {
            available: false,
            reason: safeText(data?.error, 180) || unavailableText(job.language, "预测模型尚未就绪。", "The prediction model is not ready.")
          };
        }
        return { available: true, data, brief: predictionBrief(data, job.language) };
      },
      structure: async job => {
        const query = job.materialId || job.formula || job.chemsys || "";
        const elements = (job.counts || []).map(item => item.symbol);
        if (!query && !elements.length) {
          return {
            available: false,
            reason: unavailableText(job.language, "结构检索需要化学式、元素或 Materials Project ID。", "Structure search needs a formula, elements, or a Materials Project ID.")
          };
        }
        const result = await postJson(endpoints.structure, { query, elements, limit: 5 }, fetchImpl, job.language);
        if (!result.available) return result;
        return { available: true, data: result.data, brief: structureBrief(result.data, job.language) };
      },
      literature: async job => {
        const query = safeText(job.request, 300) || job.formula;
        if (query.length < 2) {
          return {
            available: false,
            reason: unavailableText(job.language, "文献检索需要至少两个字符的问题或化学式。", "Literature search needs a question or formula of at least two characters.")
          };
        }
        const result = await postJson(endpoints.literature, { query, limit: 8, max_materials: 8 }, fetchImpl, job.language);
        if (!result.available) return result;
        return { available: true, data: result.data, brief: literatureBrief(result.data, job.language) };
      },
      spectrum: async job => {
        const materialId = safeText(job.materialId, 40).toLowerCase();
        const formula = safeText(job.formula, 80);
        if (!/^mp-[a-z0-9]+$/.test(materialId) || !formula) {
          return {
            available: false,
            reason: unavailableText(
              job.language,
              "谱学工具需要结构检索先返回 Materials Project ID，或在请求里写上 mp- 编号和化学式。",
              "Spectrum tools need a Materials Project ID from structure search, or an mp- id and formula in the request."
            )
          };
        }
        const result = await postJson(endpoints.structure, {
          action: "details",
          material_id: materialId,
          formula
        }, fetchImpl, job.language);
        if (!result.available) return result;
        return { available: true, data: result.data, brief: spectrumBrief(result.data, job.language) };
      }
    };
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    }[char]));
  }

  function renderDesk(report) {
    const desk = document.querySelector("#materialHostDesk");
    const selection = document.querySelector("#materialHostSelection");
    const list = document.querySelector("#materialHostCalls");
    const conclusion = document.querySelector("#materialHostConclusion");
    if (!desk || !list || !conclusion) return;
    const zh = report.language !== "en";
    desk.hidden = false;
    if (selection) {
      const names = (report.programs || []).map(id => programLabel(id, report.language));
      selection.textContent = names.length
        ? (zh ? `主持人这次调用：${names.join("、")}。` : `The host called: ${names.join(", ")}.`)
        : (zh ? "主持人这次没有调用程序。" : "The host did not call a program.");
    }
    list.innerHTML = (report.calls || []).map(call => {
      const status = call.status === "returned" ? (zh ? "已返回" : "Returned") : (zh ? "不可用" : "Unavailable");
      const detail = call.status === "returned" ? call.brief : call.fallback;
      return `<li data-status="${escapeHtml(call.status)}"><strong>${escapeHtml(call.label)}</strong><span>${escapeHtml(status)}</span><p>${escapeHtml(detail)}</p></li>`;
    }).join("");
    conclusion.textContent = report.conclusion || "";
  }

  function bindHostDesk() {
    const form = document.querySelector("#materialHostForm");
    if (!form || form.dataset.hostBound === "true") return;
    form.dataset.hostBound = "true";
    const button = form.querySelector("button");
    const input = document.querySelector("#materialHostRequest");
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const context = typeof global.ARPESMaterialHostContext === "function" ? (global.ARPESMaterialHostContext() || {}) : {};
      const language = context.language === "en" ? "en" : "zh";
      if (button) button.disabled = true;
      const desk = document.querySelector("#materialHostDesk");
      const conclusion = document.querySelector("#materialHostConclusion");
      if (desk) desk.hidden = false;
      if (conclusion) {
        conclusion.textContent = language === "en"
          ? "The host is calling the selected programs…"
          : "主持人正在调用所选程序…";
      }
      try {
        const report = await runHost({
          request: input?.value || "",
          language,
          counts: context.counts,
          formula: context.formula
        });
        renderDesk(report);
      } catch {
        if (conclusion) {
          conclusion.textContent = language === "en"
            ? "The host could not finish this call."
            : "主持人这次没有完成调用。";
        }
      } finally {
        if (button) button.disabled = false;
      }
    });
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindHostDesk);
    else bindHostDesk();
  }

  const api = Object.freeze({
    VERSION,
    PROGRAMS,
    selectPrograms,
    assembleConclusion,
    runHost,
    createPageRunners,
    renderDesk,
    bindHostDesk
  });
  global.ARPESMaterialHost = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
