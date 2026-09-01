const WOS_ENDPOINT = "https://api.clarivate.com/apis/wos-starter/v1/documents";
const MP_ENDPOINT = "https://api.materialsproject.org/materials/summary/";

const BASE_ALLOWED_ORIGINS = new Set([
  "https://cocoyou123456789-sketch.github.io",
  "https://arpes-materials-explorer-cocoyou.netlify.app",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:8771"
]);

const ELEMENTS = new Set([
  "H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne", "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar",
  "K", "Ca", "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn", "Ga", "Ge", "As", "Se", "Br", "Kr",
  "Rb", "Sr", "Y", "Zr", "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd", "In", "Sn", "Sb", "Te", "I", "Xe",
  "Cs", "Ba", "La", "Ce", "Pr", "Nd", "Pm", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Tm", "Yb", "Lu",
  "Hf", "Ta", "W", "Re", "Os", "Ir", "Pt", "Au", "Hg", "Tl", "Pb", "Bi", "Po", "At", "Rn", "Fr", "Ra",
  "Ac", "Th", "Pa", "U", "Np", "Pu", "Am", "Cm", "Bk", "Cf", "Es", "Fm", "Md", "No", "Lr"
]);

const KNOWN_MATERIALS = [
  "MoS2", "MoSe2", "MoTe2", "WS2", "WSe2", "WTe2", "TiS3", "TiSe2", "TaS2", "TaSe2", "NbSe2",
  "FeSe", "FeTe", "LiFeAs", "NaFeAs", "BaFe2As2", "MgB2", "Nb3Sn", "NbN", "SrTiO3", "KTaO3",
  "Bi2Se3", "Bi2Te3", "Sb2Te3", "MnBi2Te4", "SnSe2", "SnSe", "SnS2", "SnS", "GaN", "SiC",
  "BaTiO3", "Al2O3", "SiO2", "TiO2", "ZnO", "CeO2", "LiCoO2", "LiFePO4", "YBa2Cu3O7",
  "Bi2Sr2CaCu2O8", "La3Ni2O7", "LaNiO3", "Nd2CuO4", "H3S", "LaH10", "BN", "C", "P"
];

const NAME_ALIASES = new Map([
  ["graphene", "C"], ["black phosphorus", "P"], ["phosphorene", "P"],
  ["hexagonal boron nitride", "BN"], ["h-bn", "BN"], ["silicon carbide", "SiC"],
  ["barium titanate", "BaTiO3"], ["molybdenum disulfide", "MoS2"],
  ["molybdenum diselenide", "MoSe2"], ["tungsten disulfide", "WS2"],
  ["tungsten diselenide", "WSe2"], ["iron selenide", "FeSe"]
]);

const rateBuckets = new Map();
const responseCache = new Map();
const mpCache = new Map();

class MaterialsSearchError extends Error {
  constructor(message, statusCode = 400, details = null) {
    super(message);
    this.name = "MaterialsSearchError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

function trimText(value, limit = 800) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function allowedOrigins(env = process.env) {
  const extras = String(env.MATERIALS_SEARCH_ALLOWED_ORIGINS || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
  return new Set([...BASE_ALLOWED_ORIGINS, ...extras]);
}

function isAllowedOrigin(origin, env = process.env) {
  if (!origin) return String(env.MATERIALS_SEARCH_ALLOW_NO_ORIGIN || "").toLowerCase() === "true";
  return allowedOrigins(env).has(String(origin));
}

function checkRateLimit(ip = "unknown", now = Date.now()) {
  const key = String(ip).split(",")[0].trim();
  const current = rateBuckets.get(key);
  if (!current || now - current.startedAt >= 60_000) {
    rateBuckets.set(key, { startedAt: now, count: 1 });
    return;
  }
  current.count += 1;
  if (current.count > 6) throw new MaterialsSearchError("检索过于频繁，请一分钟后再试。", 429);
}

function parseBody(body) {
  if (body && typeof body === "object") return body;
  try {
    return JSON.parse(String(body || "{}"));
  } catch {
    throw new MaterialsSearchError("请求内容必须是 JSON。", 400);
  }
}

function normalizeRequest(body) {
  const source = parseBody(body);
  const query = trimText(source.query, 300);
  if (query.length < 2) throw new MaterialsSearchError("请输入至少两个字符的 Web of Science 检索关键词。", 400);
  return {
    query,
    limit: Math.max(1, Math.min(Number(source.limit) || 15, 30)),
    maxMaterials: Math.max(1, Math.min(Number(source.max_materials) || 12, 20))
  };
}

function pick(...values) {
  return values.find(value => value !== null && value !== undefined && value !== "") || "";
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  return value === null || value === undefined || value === "" ? [] : [value];
}

function textFrom(value) {
  if (Array.isArray(value)) return value.map(textFrom).filter(Boolean).join("; ");
  if (value && typeof value === "object") return textFrom(pick(value.value, value.name, value.displayName, value.title, value.text));
  return trimText(value);
}

function extractHits(data) {
  return asArray(data.hits || data.records || data.documents || data.data || data.metadata?.records || data.results);
}

function doiFrom(item) {
  const identifiers = item.identifiers || item.identifier || {};
  const direct = pick(identifiers.doi, identifiers.DOI, item.doi, item.DOI);
  if (direct) return trimText(direct, 220).replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "");
  for (const entry of asArray(identifiers)) {
    if (String(entry?.type || "").toLowerCase() === "doi") return textFrom(entry.value || entry);
  }
  return "";
}

function normalizeArticle(item, index) {
  const source = item.source || item.journal || {};
  const uid = textFrom(pick(item.uid, item.UID, item.ut, item.id));
  const doi = doiFrom(item);
  const title = textFrom(pick(item.title, item.titles?.title, item.name));
  const abstract = textFrom(pick(item.abstract, item.abstractText, item.description));
  const keywordValues = [
    ...asArray(item.keywords?.authorKeywords), ...asArray(item.keywords?.keywordsPlus),
    ...asArray(item.keywords), ...asArray(item.authorKeywords), ...asArray(item.keywordsPlus)
  ].map(textFrom).filter(Boolean);
  const year = Number(pick(source.publishYear, source.publishedYear, item.year, item.publicationYear)) || null;
  return {
    id: uid || doi || `wos-${index}`,
    wos_uid: uid,
    doi,
    title,
    abstract,
    keywords: [...new Set(keywordValues)],
    year,
    source_title: textFrom(pick(source.sourceTitle, source.title, source.journalTitle, item.sourceTitle)),
    url: textFrom(pick(item.links?.record, item.links?.wos, item.url, uid ? `https://www.webofscience.com/wos/woscc/full-record/${uid}` : "")),
    citation_count: Number(pick(item.citations?.[0]?.count, item.timesCited, item.citationCount)) || 0
  };
}

function formulaIsValid(formula) {
  if (!formula || formula.length > 40 || /[x-zδ*\/]/i.test(formula)) return false;
  let cursor = 0;
  let count = 0;
  for (const match of formula.matchAll(/([A-Z][a-z]?)([0-9]*\.?[0-9]*)/g)) {
    if (match.index !== cursor || !ELEMENTS.has(match[1])) return false;
    cursor += match[0].length;
    count += 1;
  }
  return cursor === formula.length && count > 0;
}

function extractFormulas(text) {
  const source = String(text || "").replace(/[₀₁₂₃₄₅₆₇₈₉]/g, digit => "₀₁₂₃₄₅₆₇₈₉".indexOf(digit));
  const found = new Set();
  for (const known of KNOWN_MATERIALS) {
    if (new RegExp(`(^|[^A-Za-z0-9])${known.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Za-z0-9]|$)`, "i").test(source)) found.add(known);
  }
  for (const [name, formula] of NAME_ALIASES) {
    if (source.toLowerCase().includes(name)) found.add(formula);
  }
  for (const match of source.matchAll(/\b(?:[A-Z][a-z]?\d*(?:\.\d+)?){2,8}\b/g)) {
    if (formulaIsValid(match[0])) found.add(match[0]);
  }
  return [...found];
}

function articleSearchText(article) {
  return [article.title, article.abstract, article.keywords.join(" ")].join(" ");
}

async function mapWithConcurrency(values, concurrency, mapper) {
  const results = new Array(values.length);
  let next = 0;
  async function worker() {
    while (next < values.length) {
      const index = next++;
      results[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}

async function fetchJson(url, options, timeoutMs = 20_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await options.fetchImpl(url, { ...options.request, signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new MaterialsSearchError(data.message || data.detail || data.error || `上游接口返回 HTTP ${response.status}`, response.status === 429 ? 429 : 502, data);
    }
    return data;
  } catch (error) {
    if (error instanceof MaterialsSearchError) throw error;
    if (error?.name === "AbortError") throw new MaterialsSearchError("上游材料检索服务超时。", 504);
    throw new MaterialsSearchError(error?.message || "上游材料检索失败。", 502);
  } finally {
    clearTimeout(timeout);
  }
}

async function searchWos(request, options) {
  const params = new URLSearchParams({
    db: "WOS",
    q: request.query.includes("=") ? request.query : `TS=(${request.query})`,
    limit: String(request.limit),
    page: "1"
  });
  const data = await fetchJson(`${options.wosEndpoint}?${params}`, {
    fetchImpl: options.fetchImpl,
    request: { headers: { "X-ApiKey": options.wosApiKey, Accept: "application/json" } }
  });
  return {
    total: Number(data.metadata?.total || data.total || data.totalRecords) || null,
    articles: extractHits(data).map(normalizeArticle).filter(article => article.title)
  };
}

async function searchMp(formula, options) {
  const cached = mpCache.get(formula);
  if (cached && Date.now() - cached.savedAt < 24 * 60 * 60 * 1000) return cached.data;
  const params = new URLSearchParams({
    formula,
    _fields: "material_id,formula_pretty,elements,symmetry,structure,band_gap,is_gap_direct,is_metal,is_stable,energy_above_hull,formation_energy_per_atom,density,volume,total_magnetization,ordering,theoretical,deprecated,has_props",
    _limit: "100"
  });
  const response = await fetchJson(`${options.mpEndpoint}?${params}`, {
    fetchImpl: options.fetchImpl,
    request: { headers: { "X-API-KEY": options.mpApiKey, Accept: "application/json" } }
  });
  const data = Array.isArray(response.data) ? response.data : [];
  mpCache.set(formula, { savedAt: Date.now(), data });
  return data;
}

function hasProperty(doc, name) {
  return asArray(doc.has_props).some(value => String(value).toLowerCase().includes(name.toLowerCase()));
}

function materialRecord(doc, formula, articleIds) {
  const materialId = String(doc.material_id || "");
  return {
    material_id: materialId,
    formula_query: formula,
    formula_pretty: doc.formula_pretty || formula,
    elements: asArray(doc.elements).map(String),
    band_gap_eV: doc.band_gap ?? null,
    is_gap_direct: doc.is_gap_direct ?? null,
    is_metal: doc.is_metal ?? null,
    is_stable: doc.is_stable ?? null,
    energy_above_hull_eV_atom: doc.energy_above_hull ?? null,
    formation_energy_eV_atom: doc.formation_energy_per_atom ?? null,
    density_g_cm3: doc.density ?? null,
    volume_A3: doc.volume ?? null,
    symmetry: doc.symmetry || null,
    structure: doc.structure || null,
    magnetic_ordering: doc.ordering ?? null,
    total_magnetization_uB_cell: doc.total_magnetization ?? null,
    theoretical: doc.theoretical ?? null,
    has_dos: hasProperty(doc, "dos"),
    has_band_structure: hasProperty(doc, "bandstructure"),
    article_ids: articleIds,
    source: {
      name: "Materials Project",
      url: materialId ? `https://materialsproject.org/materials/${materialId}` : "",
      data_type: "calculated"
    }
  };
}

async function runMaterialsLiteratureSearch(rawBody, options = {}) {
  const request = normalizeRequest(rawBody);
  const wosApiKey = options.wosApiKey || process.env.WOS_API_KEY;
  const mpApiKey = options.mpApiKey || process.env.MP_API_KEY;
  if (!wosApiKey) throw new MaterialsSearchError("服务器尚未配置 WOS_API_KEY。", 503);
  if (!mpApiKey) throw new MaterialsSearchError("服务器尚未配置 MP_API_KEY。", 503);
  const runtime = {
    fetchImpl: options.fetchImpl || globalThis.fetch,
    wosApiKey,
    mpApiKey,
    wosEndpoint: options.wosEndpoint || WOS_ENDPOINT,
    mpEndpoint: options.mpEndpoint || MP_ENDPOINT
  };
  if (typeof runtime.fetchImpl !== "function") throw new MaterialsSearchError("服务器不支持 fetch。", 500);
  const cacheKey = `${request.query}|${request.limit}|${request.maxMaterials}`.toLowerCase();
  const cached = responseCache.get(cacheKey);
  if (!options.disableCache && cached && Date.now() - cached.savedAt < 10 * 60 * 1000) return cached.data;

  const wos = await searchWos(request, runtime);
  const formulaArticles = new Map();
  for (const article of wos.articles) {
    for (const formula of extractFormulas(articleSearchText(article))) {
      if (!formulaArticles.has(formula)) formulaArticles.set(formula, new Set());
      formulaArticles.get(formula).add(article.id);
    }
  }
  for (const formula of extractFormulas(request.query)) {
    if (!formulaArticles.has(formula)) formulaArticles.set(formula, new Set());
  }
  const formulas = [...formulaArticles.keys()].slice(0, request.maxMaterials);
  const groups = await mapWithConcurrency(formulas, 3, async formula => ({ formula, docs: await searchMp(formula, runtime) }));
  const seen = new Set();
  const materials = [];
  for (const group of groups) {
    for (const doc of group.docs) {
      const id = String(doc.material_id || "");
      if (!id || seen.has(id) || doc.deprecated === true) continue;
      seen.add(id);
      materials.push(materialRecord(doc, group.formula, [...(formulaArticles.get(group.formula) || [])]));
    }
  }
  materials.sort((a, b) => Number(b.is_stable) - Number(a.is_stable) || Number(a.energy_above_hull_eV_atom ?? Infinity) - Number(b.energy_above_hull_eV_atom ?? Infinity));
  const result = {
    ok: true,
    query: request.query,
    generated_at: new Date().toISOString(),
    statistics: {
      wos_total: wos.total,
      wos_records: wos.articles.length,
      formulas_identified: formulas.length,
      mp_materials: materials.length
    },
    formulas,
    materials,
    articles: wos.articles.map(({ abstract, ...article }) => article),
    notes: [
      "Web of Science 提供论文题录线索；材料性质来自 Materials Project 计算数据。",
      "同一化学式可能对应多个晶型，结果按 Materials Project ID 分开保留。",
      "实验性质需要回到论文全文核验温度、压力、样品和测量条件。"
    ]
  };
  responseCache.set(cacheKey, { savedAt: Date.now(), data: result });
  return result;
}

async function handleMaterialsSearchRequest(request, options = {}) {
  if (String(request.method || "POST").toUpperCase() !== "POST") {
    return { statusCode: 405, payload: { ok: false, error: "Method not allowed" } };
  }
  if (request.origin && !isAllowedOrigin(request.origin, options.env || process.env)) {
    return { statusCode: 403, payload: { ok: false, error: "Origin is not allowed." } };
  }
  try {
    checkRateLimit(request.ip, options.now || Date.now());
    const result = await runMaterialsLiteratureSearch(request.body, options);
    return { statusCode: 200, payload: result };
  } catch (error) {
    const known = error instanceof MaterialsSearchError;
    return {
      statusCode: known ? error.statusCode : 500,
      payload: { ok: false, error: error?.message || "材料文献检索失败。", details: known ? error.details : null }
    };
  }
}

module.exports = {
  MaterialsSearchError,
  extractFormulas,
  handleMaterialsSearchRequest,
  isAllowedOrigin,
  normalizeRequest,
  runMaterialsLiteratureSearch
};
