#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_ARTICLES = "github-pages/data/shared_articles.json";
const DEFAULT_OUT = "github-pages/data/materials_properties.json";
const DEFAULT_CACHE = "outputs/materials_project_summary_cache.json";
const DEFAULT_ENDPOINT = "https://api.materialsproject.org/materials/summary/";
const MP_FIELDS = [
  "material_id", "formula_pretty", "elements", "nelements", "structure", "symmetry",
  "band_gap", "is_gap_direct", "is_metal", "is_stable", "energy_above_hull",
  "formation_energy_per_atom", "density", "volume", "total_magnetization", "ordering",
  "theoretical", "deprecated", "last_updated", "database_IDs", "has_props"
];

const ELEMENTS = new Set([
  "H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne", "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar",
  "K", "Ca", "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn", "Ga", "Ge", "As", "Se", "Br", "Kr",
  "Rb", "Sr", "Y", "Zr", "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd", "In", "Sn", "Sb", "Te", "I", "Xe",
  "Cs", "Ba", "La", "Ce", "Pr", "Nd", "Pm", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Tm", "Yb", "Lu",
  "Hf", "Ta", "W", "Re", "Os", "Ir", "Pt", "Au", "Hg", "Tl", "Pb", "Bi", "Po", "At", "Rn", "Fr", "Ra",
  "Ac", "Th", "Pa", "U", "Np", "Pu", "Am", "Cm", "Bk", "Cf", "Es", "Fm", "Md", "No", "Lr"
]);

const MATERIAL_ALIASES = new Map([
  ["graphene", "C"], ["black phosphorus", "P"], ["phosphorene", "P"],
  ["silicene", "Si"], ["germanene", "Ge"], ["stanene", "Sn"],
  ["borophene", "B"], ["antimonene", "Sb"], ["bismuthene", "Bi"], ["plumbene", "Pb"],
  ["h-bn", "BN"], ["bi2212", "Bi2Sr2CaCu2O8"], ["ybco", "YBa2Cu3O7"],
  ["lsco", "La2-xSrxCuO4"], ["lbco", "La2-xBaxCuO4"], ["sto", "SrTiO3"], ["kto", "KTaO3"]
]);

function parseArgs(argv) {
  const args = {
    articles: DEFAULT_ARTICLES,
    out: DEFAULT_OUT,
    cache: DEFAULT_CACHE,
    endpoint: process.env.MP_API_ENDPOINT || DEFAULT_ENDPOINT,
    formulas: [],
    limit: 0,
    delayMs: 250,
    dryRun: false,
    refresh: false,
    onlyExplicit: false,
    fixture: ""
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--articles") args.articles = argv[++i];
    else if (arg === "--out") args.out = argv[++i];
    else if (arg === "--cache") args.cache = argv[++i];
    else if (arg === "--endpoint") args.endpoint = argv[++i];
    else if (arg === "--formula") args.formulas.push(argv[++i]);
    else if (arg === "--limit") args.limit = Math.max(0, Number(argv[++i]) || 0);
    else if (arg === "--delay-ms") args.delayMs = Math.max(0, Number(argv[++i]) || 0);
    else if (arg === "--fixture") args.fixture = argv[++i];
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--refresh") args.refresh = true;
    else if (arg === "--only-explicit") args.onlyExplicit = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return `Usage:
  node scripts/enrich_materials_project.mjs [options]

Options:
  --articles FILE   WoS-derived article JSON (default: ${DEFAULT_ARTICLES})
  --out FILE        Generated material database (default: ${DEFAULT_OUT})
  --cache FILE      Resumable Materials Project cache (default: ${DEFAULT_CACHE})
  --formula FORMULA Add an explicit formula; may be repeated
  --limit N         Query at most N formulas (0 means all)
  --delay-ms N      Delay between API requests (default: 250)
  --dry-run         List formula candidates without calling Materials Project
  --refresh         Ignore cached query results
  --only-explicit   Query only formulas supplied with --formula
  --fixture FILE    Use a local formula-to-results JSON fixture instead of the API

Environment:
  MP_API_KEY        Materials Project API key (required unless --dry-run or --fixture)`;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeFormula(value) {
  const original = String(value || "").trim();
  if (!original) return "";
  const alias = MATERIAL_ALIASES.get(original.toLowerCase());
  let formula = alias || original;
  formula = formula
    .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, digit => "₀₁₂₃₄₅₆₇₈₉".indexOf(digit))
    .replace(/^[0-9]+[HTR]-/i, "")
    .replace(/\s+/g, "");
  if (!formula || /[x-zδ*\/]/i.test(formula) || /[^A-Za-z0-9.]/.test(formula)) return "";
  let cursor = 0;
  let count = 0;
  const token = /([A-Z][a-z]?)([0-9]*\.?[0-9]*)/g;
  for (const match of formula.matchAll(token)) {
    if (match.index !== cursor || !ELEMENTS.has(match[1])) return "";
    cursor += match[0].length;
    count++;
  }
  return cursor === formula.length && count > 0 ? formula : "";
}

function collectFormulaQueries(articles, explicitFormulas) {
  const queries = new Map();
  const skipped = new Set();
  const add = (raw, articleId = "", explicit = false) => {
    const formula = normalizeFormula(raw);
    if (!formula) {
      if (raw) skipped.add(String(raw));
      return;
    }
    if (!queries.has(formula)) queries.set(formula, { formula, names: new Set(), articleIds: new Set(), explicit: false });
    const entry = queries.get(formula);
    entry.names.add(String(raw));
    if (articleId) entry.articleIds.add(articleId);
    if (explicit) entry.explicit = true;
  };
  for (const article of articles) {
    for (const material of article.materials || []) add(material, article.id);
  }
  for (const formula of explicitFormulas) add(formula, "", true);
  return {
    queries: [...queries.values()].map(item => ({
      formula: item.formula,
      names: [...item.names].sort(),
      article_ids: [...item.articleIds].sort(),
      explicit: item.explicit
    })).sort((a, b) => Number(b.explicit) - Number(a.explicit) || a.formula.localeCompare(b.formula)),
    skipped: [...skipped].sort()
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, options);
      const body = await response.json().catch(() => ({}));
      if (response.ok) return body;
      const error = new Error(body.detail || body.message || body.error || `HTTP ${response.status}`);
      error.status = response.status;
      if (response.status !== 429 && response.status < 500) throw error;
      lastError = error;
      const retryAfter = Number(response.headers.get("retry-after")) * 1000;
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : attempt * 1200);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(attempt * 1200);
    }
  }
  throw lastError;
}

async function queryMaterialsProject(formula, args, apiKey) {
  const params = new URLSearchParams({
    formula,
    _fields: MP_FIELDS.join(","),
    _limit: "1000"
  });
  const data = await fetchWithRetry(`${args.endpoint}?${params}`, {
    headers: {
      "X-API-KEY": apiKey,
      "Accept": "application/json",
      "User-Agent": "SynchroChemical-Materials-Database/1.0"
    }
  });
  if (!Array.isArray(data.data)) throw new Error(`Unexpected Materials Project response for ${formula}`);
  return data.data;
}

function hasProperty(doc, property) {
  const values = Array.isArray(doc.has_props) ? doc.has_props : [];
  return values.some(value => String(value).toLowerCase().includes(property.toLowerCase()));
}

function propertyRows(doc) {
  const definitions = [
    ["band_gap", "band_gap", "eV"],
    ["energy_above_hull", "energy_above_hull", "eV/atom"],
    ["formation_energy_per_atom", "formation_energy_per_atom", "eV/atom"],
    ["density", "density", "g/cm³"],
    ["volume", "volume", "Å³"],
    ["total_magnetization", "total_magnetization", "μB/cell"]
  ];
  return definitions
    .filter(([, field]) => doc[field] !== null && doc[field] !== undefined)
    .map(([name, field, unit]) => ({
      name,
      value: doc[field],
      unit,
      method: "Materials Project calculated summary",
      source: "Materials Project",
      verification_status: "mp_api_calculated"
    }));
}

function publicationRecord(article) {
  return {
    id: article.id,
    wos_uid: article.wos_uid || "",
    doi: article.doi || "",
    title: article.title || "",
    year: article.year ?? null,
    source_title: article.source_title || "",
    url: article.url || "",
    verification_status: article.verification_status || "wos_metadata"
  };
}

function buildDatabase(articles, queryEntries, resultsByFormula) {
  const articleById = new Map(articles.map(article => [article.id, article]));
  const publications = new Map();
  const materials = [];
  const links = [];
  const seenMaterialIds = new Set();
  for (const query of queryEntries) {
    const docs = resultsByFormula[query.formula] || [];
    for (const articleId of query.article_ids) {
      const article = articleById.get(articleId);
      if (article) publications.set(articleId, publicationRecord(article));
    }
    for (const doc of docs) {
      const materialId = String(doc.material_id || "");
      if (!materialId || seenMaterialIds.has(materialId)) continue;
      seenMaterialIds.add(materialId);
      const hasDos = hasProperty(doc, "dos") || Boolean(doc.dos);
      const hasBandStructure = hasProperty(doc, "bandstructure") || Boolean(doc.bandstructure);
      materials.push({
        material_id: materialId,
        formula_query: query.formula,
        formula_pretty: doc.formula_pretty || query.formula,
        elements: (doc.elements || []).map(String),
        nelements: doc.nelements ?? null,
        symmetry: doc.symmetry || null,
        structure: doc.structure || null,
        electronic_structure: {
          band_gap_eV: doc.band_gap ?? null,
          is_gap_direct: doc.is_gap_direct ?? null,
          is_metal: doc.is_metal ?? null,
          has_dos: hasDos,
          has_band_structure: hasBandStructure
        },
        stability: {
          is_stable: doc.is_stable ?? null,
          energy_above_hull_eV_atom: doc.energy_above_hull ?? null,
          formation_energy_eV_atom: doc.formation_energy_per_atom ?? null
        },
        density_g_cm3: doc.density ?? null,
        volume_A3: doc.volume ?? null,
        magnetism: {
          ordering: doc.ordering ?? null,
          total_magnetization_uB_cell: doc.total_magnetization ?? null
        },
        theoretical: doc.theoretical ?? null,
        deprecated: doc.deprecated ?? false,
        last_updated: doc.last_updated || null,
        database_ids: doc.database_IDs || {},
        properties: propertyRows(doc),
        source: {
          name: "Materials Project",
          url: `https://materialsproject.org/materials/${materialId}`,
          retrieval_type: "official_api"
        }
      });
      for (const articleId of query.article_ids) {
        if (articleById.has(articleId)) links.push({ material_id: materialId, publication_id: articleId, matched_by: query.formula });
      }
    }
  }
  return {
    schema_version: "1.0.0",
    generated_at: new Date().toISOString(),
    sources: {
      literature: "Web of Science manual export",
      properties: "Materials Project official API"
    },
    statistics: {
      formula_queries: queryEntries.length,
      materials: materials.length,
      publications: publications.size,
      links: links.length
    },
    materials,
    publications: [...publications.values()],
    material_publication_links: links
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!fs.existsSync(args.articles)) throw new Error(`Article file not found: ${args.articles}`);
  const articles = readJson(args.articles);
  if (!Array.isArray(articles)) throw new Error("Article JSON must contain an array");
  const { queries, skipped } = collectFormulaQueries(articles, args.formulas);
  const candidates = args.onlyExplicit ? queries.filter(query => query.explicit) : queries;
  if (args.onlyExplicit && !candidates.length) throw new Error("--only-explicit requires at least one --formula value");
  const selected = args.limit ? candidates.slice(0, args.limit) : candidates;
  if (args.dryRun) {
    console.log(JSON.stringify({
      articles: articles.length,
      formula_candidates: queries.length,
      selected: selected.length,
      formulas: selected.map(item => ({ formula: item.formula, names: item.names, articles: item.article_ids.length })),
      skipped_count: skipped.length,
      skipped_sample: skipped.slice(0, 30)
    }, null, 2));
    return;
  }

  const fixture = args.fixture ? readJson(args.fixture) : null;
  const apiKey = process.env.MP_API_KEY || "";
  if (!fixture && !apiKey) throw new Error("MP_API_KEY is required. Set it in the terminal session or use --dry-run.");
  const cache = fs.existsSync(args.cache) ? readJson(args.cache) : { schema_version: "1.0", queries: {} };
  cache.queries ||= {};
  const resultsByFormula = {};
  for (let i = 0; i < selected.length; i++) {
    const query = selected[i];
    let data;
    if (fixture) {
      data = fixture[query.formula] || [];
    } else if (!args.refresh && cache.queries[query.formula]) {
      data = cache.queries[query.formula].data || [];
    } else {
      console.error(`[${i + 1}/${selected.length}] Querying ${query.formula}`);
      data = await queryMaterialsProject(query.formula, args, apiKey);
      cache.queries[query.formula] = { fetched_at: new Date().toISOString(), data };
      writeJson(args.cache, cache);
      if (args.delayMs && i + 1 < selected.length) await sleep(args.delayMs);
    }
    resultsByFormula[query.formula] = data;
  }
  const database = buildDatabase(articles, selected, resultsByFormula);
  database.statistics.skipped_material_names = skipped.length;
  writeJson(args.out, database);
  console.log(JSON.stringify({ out: args.out, ...database.statistics }, null, 2));
}

main().catch(error => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
