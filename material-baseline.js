(function initMaterialBaseline(global) {
  "use strict";

  const ELEMENTS = "H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og".split(" ");
  const ELEMENT_INDEX = new Map(ELEMENTS.map((symbol, index) => [symbol, index]));
  const MODEL_SCRIPT = "data/material_baseline_v1.js";
  let modelLoadStarted = false;
  let modelLoadError = "";

  function activeModel() {
    const model = global.ARPES_MATERIAL_BASELINE_MODEL;
    return model?.schema === "arpes-material-composition-baseline/v1" ? model : null;
  }

  function notifyReady() {
    if (typeof global.dispatchEvent !== "function" || typeof global.CustomEvent !== "function") return;
    global.dispatchEvent(new global.CustomEvent("arpes:material-baseline-ready", {
      detail: { version: activeModel()?.version || "", error: modelLoadError }
    }));
  }

  function ensureModel() {
    if (activeModel() || modelLoadStarted || typeof document === "undefined") return;
    modelLoadStarted = true;
    const script = document.createElement("script");
    script.src = MODEL_SCRIPT;
    script.async = true;
    script.onload = notifyReady;
    script.onerror = () => {
      modelLoadError = "The trained material baseline could not be loaded.";
      notifyReady();
    };
    document.head.appendChild(script);
  }

  function normalizeCounts(rawCounts) {
    const counts = new Map();
    (Array.isArray(rawCounts) ? rawCounts : []).forEach(item => {
      const symbol = String(item?.symbol || "");
      const count = Number(item?.count);
      if (!ELEMENT_INDEX.has(symbol) || !Number.isFinite(count) || count <= 0) return;
      counts.set(symbol, (counts.get(symbol) || 0) + count);
    });
    return counts;
  }

  function featurize(rawCounts) {
    const counts = normalizeCounts(rawCounts);
    const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
    if (!counts.size || !total) return null;
    const fractions = Array(ELEMENTS.length).fill(0);
    counts.forEach((count, symbol) => {
      fractions[ELEMENT_INDEX.get(symbol)] = count / total;
    });
    const present = fractions.map((value, index) => ({ value, z: index + 1 })).filter(item => item.value > 0);
    const meanZ = present.reduce((sum, item) => sum + item.value * item.z, 0);
    const stdZ = Math.sqrt(present.reduce((sum, item) => sum + item.value * ((item.z - meanZ) ** 2), 0));
    const entropy = -present.reduce((sum, item) => sum + item.value * Math.log(Math.max(item.value, 1e-12)), 0);
    const atomicNumbers = present.map(item => item.z);
    const extras = [
      present.length / 10,
      Math.log1p(total) / 5,
      entropy / 3,
      meanZ / 118,
      stdZ / 118,
      Math.min(...atomicNumbers) / 118,
      Math.max(...atomicNumbers) / 118,
      (Math.max(...atomicNumbers) - Math.min(...atomicNumbers)) / 118,
      Math.max(...present.map(item => item.value)),
      Math.sqrt(present.reduce((sum, item) => sum + item.value ** 2, 0))
    ];
    return { features: [...fractions, ...extras], counts, total };
  }

  function treeValue(tree, features) {
    let node = 0;
    while (tree.feature[node] >= 0) {
      node = features[tree.feature[node]] <= tree.threshold[node] ? tree.left[node] : tree.right[node];
    }
    return Number(tree.value[node]) || 0;
  }

  function rawPrediction(spec, features) {
    return spec.trees.reduce(
      (value, tree) => value + spec.learning_rate * treeValue(tree, features),
      Number(spec.init) || 0
    );
  }

  function regressionPrediction(spec, features) {
    const raw = rawPrediction(spec, features);
    return spec.target_transform === "log1p" ? Math.max(0, Math.expm1(raw)) : raw;
  }

  function classifierPrediction(spec, features) {
    const raw = Math.max(-35, Math.min(35, rawPrediction(spec, features)));
    return 1 / (1 + Math.exp(-raw));
  }

  function round(value, digits = 3) {
    if (!Number.isFinite(value)) return null;
    const scale = 10 ** digits;
    return Math.round(value * scale) / scale;
  }

  function predictCounts(rawCounts) {
    const model = activeModel();
    if (!model) {
      ensureModel();
      return { state: modelLoadError ? "error" : "loading", error: modelLoadError };
    }
    const encoded = featurize(rawCounts);
    if (!encoded) return { state: "idle", version: model.version };
    const unknown = [...encoded.counts.keys()].filter(symbol => !model.domain.seen_elements.includes(symbol));
    const formation = regressionPrediction(model.models.formation_energy_eV_atom, encoded.features);
    const metalScore = classifierPrediction(model.models.metal_score, encoded.features);
    const gap = regressionPrediction(model.models.nonmetal_band_gap_eV, encoded.features);
    const tc = regressionPrediction(model.models.known_superconductor_tc_K, encoded.features);
    return {
      state: "ready",
      version: model.version,
      domain: unknown.length ? "outside" : (encoded.counts.size > 6 ? "limited" : "inside"),
      unknown_elements: unknown,
      formation_energy_eV_atom: round(formation),
      formation_error_q90_eV_atom: model.metrics.formation_energy_eV_atom.absolute_error_q90,
      metallic_tendency_score: round(metalScore, 3),
      conditional_nonmetal_band_gap_eV: round(gap),
      band_gap_error_q90_eV: model.metrics.nonmetal_band_gap_eV.absolute_error_q90,
      conditional_known_superconductor_tc_K: round(tc, 1),
      tc_error_q90_K: model.metrics.known_superconductor_tc_K.absolute_error_q90,
      warnings: model.domain.warnings.slice()
    };
  }

  const api = Object.freeze({
    version: "1.0.0",
    ensureModel,
    featurize,
    predictCounts,
    get status() {
      return activeModel() ? "ready" : (modelLoadError ? "error" : (modelLoadStarted ? "loading" : "idle"));
    }
  });
  global.ARPESMaterialBaseline = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
