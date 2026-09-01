const MP_SUMMARY_ENDPOINT = "https://api.materialsproject.org/materials/summary/";

const {
  isAllowedOrigin
} = require("./materials-literature-search");

const ELEMENTS = new Set([
  "H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne", "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar",
  "K", "Ca", "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn", "Ga", "Ge", "As", "Se", "Br", "Kr",
  "Rb", "Sr", "Y", "Zr", "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd", "In", "Sn", "Sb", "Te", "I", "Xe",
  "Cs", "Ba", "La", "Ce", "Pr", "Nd", "Pm", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Tm", "Yb", "Lu",
  "Hf", "Ta", "W", "Re", "Os", "Ir", "Pt", "Au", "Hg", "Tl", "Pb", "Bi", "Po", "At", "Rn", "Fr", "Ra",
  "Ac", "Th", "Pa", "U", "Np", "Pu", "Am", "Cm", "Bk", "Cf", "Es", "Fm", "Md", "No", "Lr"
]);

const CRYSTAL_SYSTEMS = new Map([
  ["triclinic", "Triclinic"],
  ["monoclinic", "Monoclinic"],
  ["orthorhombic", "Orthorhombic"],
  ["tetragonal", "Tetragonal"],
  ["trigonal", "Trigonal"],
  ["hexagonal", "Hexagonal"],
  ["cubic", "Cubic"]
]);

const rateBuckets = new Map();
const responseCache = new Map();

class StructureSearchError extends Error {
  constructor(message, statusCode = 400, details = null) {
    super(message);
    this.name = "StructureSearchError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

function parseBody(body) {
  if (body && typeof body === "object") return body;
  try {
    return JSON.parse(String(body || "{}"));
  } catch {
    throw new StructureSearchError("请求内容必须是 JSON。", 400);
  }
}

function cleanText(value, limit = 80) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.slice(0, limit);
}

function listOfElements(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(/[\s,;]+/);
  const normalized = [...new Set(values.map(value => cleanText(value)).filter(Boolean).map(value => value[0]?.toUpperCase() + value.slice(1).toLowerCase()))];
  const invalid = normalized.filter(value => !ELEMENTS.has(value));
  if (invalid.length) throw new StructureSearchError(`无法识别元素：${invalid.join("、")}`, 400);
  return normalized;
}

function optionalNumber(value, name) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new StructureSearchError(`${name}必须是数字。`, 400);
  return number;
}

function optionalBoolean(value, name) {
  if (value === "" || value === null || value === undefined || value === "all") return null;
  if (value === true || value === "true" || value === "yes" || value === 1 || value === "1") return true;
  if (value === false || value === "false" || value === "no" || value === 0 || value === "0") return false;
  throw new StructureSearchError(`${name}筛选值无效。`, 400);
}

function validFormula(value) {
  const text = cleanText(value, 60);
  return Boolean(text) && /^[A-Z][A-Za-z0-9().+\-]{0,59}$/.test(text) && !/\s/.test(text);
}

function validChemsys(value) {
  const parts = cleanText(value, 80).split("-").filter(Boolean);
  return parts.length >= 2 && parts.every(part => ELEMENTS.has(part[0]?.toUpperCase() + part.slice(1).toLowerCase()));
}

function normalizeRequest(body) {
  const source = parseBody(body);
  const query = cleanText(source.query, 100);
  let materialId = cleanText(source.material_id || source.materialId, 40).toLowerCase();
  let formula = cleanText(source.formula, 60);
  let chemsys = cleanText(source.chemsys, 80);
  const elements = listOfElements(source.elements);
  const excludeElements = listOfElements(source.exclude_elements || source.excludeElements);

  if (query) {
    if (/^mp-[a-z0-9]+$/i.test(query)) materialId ||= query.toLowerCase();
    else if (validChemsys(query)) chemsys ||= query.split("-").map(part => part[0].toUpperCase() + part.slice(1).toLowerCase()).join("-");
    else if (validFormula(query)) formula ||= query;
    else throw new StructureSearchError("请输入化学式（如 MoS2）、元素体系（如 Li-Fe-O）或 Materials Project ID。", 400);
  }

  if (materialId && !/^mp-[a-z0-9]+$/i.test(materialId)) throw new StructureSearchError("Materials Project ID 格式无效。", 400);
  if (formula && !validFormula(formula)) throw new StructureSearchError("化学式格式无效。", 400);
  if (chemsys && !validChemsys(chemsys)) throw new StructureSearchError("元素体系格式无效，请使用 Li-Fe-O 形式。", 400);
  if (!materialId && !formula && !chemsys && !elements.length) {
    throw new StructureSearchError("请至少填写化学式、MP ID、元素体系或包含元素。", 400);
  }

  const bandGapMin = optionalNumber(source.band_gap_min ?? source.bandGapMin, "最小带隙");
  const bandGapMax = optionalNumber(source.band_gap_max ?? source.bandGapMax, "最大带隙");
  if (bandGapMin !== null && bandGapMin < 0 || bandGapMax !== null && bandGapMax < 0) {
    throw new StructureSearchError("带隙不能小于 0 eV。", 400);
  }
  if (bandGapMin !== null && bandGapMax !== null && bandGapMin > bandGapMax) {
    throw new StructureSearchError("最小带隙不能大于最大带隙。", 400);
  }

  const crystalSystemRaw = cleanText(source.crystal_system || source.crystalSystem, 30).toLowerCase();
  const crystalSystem = crystalSystemRaw ? CRYSTAL_SYSTEMS.get(crystalSystemRaw) : "";
  if (crystalSystemRaw && !crystalSystem) throw new StructureSearchError("晶系筛选值无效。", 400);

  return {
    query,
    materialId,
    formula,
    chemsys,
    elements,
    excludeElements,
    bandGapMin,
    bandGapMax,
    stable: optionalBoolean(source.stable ?? source.is_stable, "稳定性"),
    metallic: optionalBoolean(source.metallic ?? source.is_metal, "电子类型"),
    hasDos: optionalBoolean(source.has_dos ?? source.hasDos, "DOS"),
    hasBandStructure: optionalBoolean(source.has_band_structure ?? source.hasBandStructure, "能带"),
    crystalSystem,
    limit: Math.max(1, Math.min(Number(source.limit) || 20, 40))
  };
}

function checkRateLimit(ip = "unknown", now = Date.now()) {
  const key = String(ip).split(",")[0].trim();
  const current = rateBuckets.get(key);
  if (!current || now - current.startedAt >= 60_000) {
    rateBuckets.set(key, { startedAt: now, count: 1 });
    return;
  }
  current.count += 1;
  if (current.count > 20) throw new StructureSearchError("结构检索过于频繁，请稍后再试。", 429);
}

function buildSearchParams(request) {
  const params = new URLSearchParams();
  if (request.materialId) params.set("material_ids", request.materialId);
  if (request.formula) params.set("formula", request.formula);
  if (request.chemsys) params.set("chemsys", request.chemsys);
  if (request.elements.length) params.set("elements", request.elements.join(","));
  if (request.excludeElements.length) params.set("exclude_elements", request.excludeElements.join(","));
  if (request.bandGapMin !== null) params.set("band_gap_min", String(request.bandGapMin));
  if (request.bandGapMax !== null) params.set("band_gap_max", String(request.bandGapMax));
  if (request.stable !== null) params.set("is_stable", String(request.stable));
  if (request.metallic !== null) params.set("is_metal", String(request.metallic));
  if (request.crystalSystem) params.set("crystal_system", request.crystalSystem);
  const requiredProperties = [];
  if (request.hasDos === true) requiredProperties.push("dos");
  if (request.hasBandStructure === true) requiredProperties.push("bandstructure");
  if (requiredProperties.length) params.set("has_props", requiredProperties.join(","));
  params.set("_fields", [
    "material_id", "formula_pretty", "elements", "nelements", "nsites", "symmetry", "structure",
    "band_gap", "is_gap_direct", "is_metal", "is_stable", "energy_above_hull",
    "formation_energy_per_atom", "density", "volume", "theoretical", "has_props",
    "ordering", "total_magnetization"
  ].join(","));
  params.set("_limit", String(request.limit));
  return params;
}

async function fetchJson(url, options, timeoutMs = 25_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await options.fetchImpl(url, { ...options.request, signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const upstreamMessage = data.detail || data.message || data.error || `HTTP ${response.status}`;
      throw new StructureSearchError(`Materials Project 返回错误：${String(upstreamMessage).slice(0, 300)}`, response.status === 429 ? 429 : 502);
    }
    return data;
  } catch (error) {
    if (error instanceof StructureSearchError) throw error;
    if (error?.name === "AbortError") throw new StructureSearchError("Materials Project 结构检索超时。", 504);
    throw new StructureSearchError(error?.message || "Materials Project 结构检索失败。", 502);
  } finally {
    clearTimeout(timeout);
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function formatNumber(value, digits = 10) {
  const number = finite(value, 0);
  return number.toFixed(digits).replace(/0+$/, "").replace(/\.$/, ".0");
}

function dominantSpecies(site) {
  return [...asArray(site?.species)].sort((a, b) => finite(b.occu, 0) - finite(a.occu, 0))[0] || null;
}

function structureIsOrdered(structure) {
  return asArray(structure?.sites).every(site => {
    const species = asArray(site.species);
    return species.length === 1 && Math.abs(finite(species[0].occu, 0) - 1) < 1e-6;
  });
}

function cifQuote(value) {
  return `'${String(value || "P 1").replace(/'/g, "''")}'`;
}

function structureToCif(structure, metadata = {}) {
  const lattice = structure?.lattice || {};
  const sites = asArray(structure?.sites);
  if (!asArray(lattice.matrix).length || !sites.length) return null;
  const lines = [
    `data_${String(metadata.materialId || "materials_project").replace(/[^A-Za-z0-9_]/g, "_")}`,
    "_audit_creation_method 'Materials Project API export'",
    `_chemical_formula_sum ${cifQuote(metadata.formula || "unknown")}`,
    `_cell_length_a ${formatNumber(lattice.a, 8)}`,
    `_cell_length_b ${formatNumber(lattice.b, 8)}`,
    `_cell_length_c ${formatNumber(lattice.c, 8)}`,
    `_cell_angle_alpha ${formatNumber(lattice.alpha, 8)}`,
    `_cell_angle_beta ${formatNumber(lattice.beta, 8)}`,
    `_cell_angle_gamma ${formatNumber(lattice.gamma, 8)}`,
    `_symmetry_space_group_name_H-M ${cifQuote(metadata.symmetrySymbol || "P 1")}`,
    "loop_",
    "_atom_site_label",
    "_atom_site_type_symbol",
    "_atom_site_occupancy",
    "_atom_site_fract_x",
    "_atom_site_fract_y",
    "_atom_site_fract_z"
  ];
  const elementCounts = new Map();
  for (const site of sites) {
    const abc = asArray(site.abc);
    for (const species of asArray(site.species)) {
      const element = cleanText(species.element, 3) || "X";
      const count = (elementCounts.get(element) || 0) + 1;
      elementCounts.set(element, count);
      lines.push([
        `${element}${count}`,
        element,
        formatNumber(species.occu ?? 1, 6),
        formatNumber(abc[0], 10),
        formatNumber(abc[1], 10),
        formatNumber(abc[2], 10)
      ].join(" "));
    }
  }
  return `${lines.join("\n")}\n`;
}

function structureToPoscar(structure, metadata = {}) {
  const lattice = structure?.lattice || {};
  const matrix = asArray(lattice.matrix);
  const sites = asArray(structure?.sites);
  if (matrix.length !== 3 || !sites.length || !structureIsOrdered(structure)) return null;
  const groups = new Map();
  for (const site of sites) {
    const element = dominantSpecies(site)?.element;
    if (!element) continue;
    if (!groups.has(element)) groups.set(element, []);
    groups.get(element).push(asArray(site.abc));
  }
  const elements = [...groups.keys()];
  const lines = [
    `${metadata.formula || "Structure"} | ${metadata.materialId || "Materials Project"}`,
    "1.0",
    ...matrix.map(row => asArray(row).slice(0, 3).map(value => formatNumber(value, 12).padStart(16)).join(" ")),
    elements.join(" "),
    elements.map(element => groups.get(element).length).join(" "),
    "Direct"
  ];
  for (const element of elements) {
    for (const abc of groups.get(element)) {
      lines.push(abc.slice(0, 3).map(value => formatNumber(value, 12).padStart(16)).join(" "));
    }
  }
  return `${lines.join("\n")}\n`;
}

function hasProperty(doc, property) {
  return asArray(doc.has_props).some(value => String(value).toLowerCase().includes(property.toLowerCase()));
}

function normalizeMaterial(doc) {
  const structure = doc.structure || null;
  const lattice = structure?.lattice || {};
  const symmetry = doc.symmetry || {};
  const materialId = String(doc.material_id || "");
  const formula = String(doc.formula_pretty || "");
  const ordered = structure ? structureIsOrdered(structure) : false;
  return {
    material_id: materialId,
    formula_pretty: formula,
    elements: asArray(doc.elements).map(String),
    nelements: finite(doc.nelements),
    nsites: finite(doc.nsites, asArray(structure?.sites).length),
    band_gap_eV: doc.band_gap ?? null,
    is_gap_direct: doc.is_gap_direct ?? null,
    is_metal: doc.is_metal ?? null,
    is_stable: doc.is_stable ?? null,
    energy_above_hull_eV_atom: doc.energy_above_hull ?? null,
    formation_energy_eV_atom: doc.formation_energy_per_atom ?? null,
    density_g_cm3: doc.density ?? null,
    volume_A3: doc.volume ?? lattice.volume ?? null,
    theoretical: doc.theoretical ?? null,
    magnetic_ordering: doc.ordering ?? null,
    total_magnetization_uB_cell: doc.total_magnetization ?? null,
    has_dos: hasProperty(doc, "dos"),
    has_band_structure: hasProperty(doc, "bandstructure"),
    symmetry: {
      symbol: symmetry.symbol || null,
      number: symmetry.number ?? null,
      crystal_system: symmetry.crystal_system || null,
      point_group: symmetry.point_group || null
    },
    structure: structure ? {
      ordered,
      charge: structure.charge ?? null,
      lattice: {
        matrix: asArray(lattice.matrix),
        a: lattice.a ?? null,
        b: lattice.b ?? null,
        c: lattice.c ?? null,
        alpha: lattice.alpha ?? null,
        beta: lattice.beta ?? null,
        gamma: lattice.gamma ?? null,
        volume: lattice.volume ?? null
      },
      sites: asArray(structure.sites).map(site => ({
        label: site.label || dominantSpecies(site)?.element || "X",
        species: asArray(site.species).map(species => ({ element: species.element, occupancy: species.occu ?? 1 })),
        abc: asArray(site.abc).slice(0, 3),
        xyz: asArray(site.xyz).slice(0, 3)
      }))
    } : null,
    files: structure ? {
      cif: structureToCif(structure, { materialId, formula, symmetrySymbol: symmetry.symbol }),
      poscar: structureToPoscar(structure, { materialId, formula }),
      poscar_note: ordered ? null : "该结构含部分占位或无序位点，为避免错误近似，不生成 POSCAR；请下载 CIF。"
    } : { cif: null, poscar: null, poscar_note: "Materials Project 当前记录没有结构数据。" },
    source: {
      name: "Materials Project",
      url: materialId ? `https://materialsproject.org/materials/${materialId}` : "",
      data_type: "calculated"
    }
  };
}

async function runMaterialsStructureSearch(rawBody, options = {}) {
  const request = normalizeRequest(rawBody);
  const mpApiKey = options.mpApiKey || process.env.MP_API_KEY;
  if (!mpApiKey) throw new StructureSearchError("服务器尚未配置 MP_API_KEY。", 503);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new StructureSearchError("服务器不支持 fetch。", 500);
  const params = buildSearchParams(request);
  const cacheKey = params.toString().toLowerCase();
  const cached = responseCache.get(cacheKey);
  if (!options.disableCache && cached && Date.now() - cached.savedAt < 15 * 60 * 1000) return cached.data;

  const response = await fetchJson(`${options.mpEndpoint || MP_SUMMARY_ENDPOINT}?${params}`, {
    fetchImpl,
    request: { headers: { "X-API-KEY": mpApiKey, Accept: "application/json" } }
  });
  let materials = asArray(response.data).filter(doc => doc && doc.deprecated !== true).map(normalizeMaterial);
  if (request.hasDos === false) materials = materials.filter(material => !material.has_dos);
  if (request.hasBandStructure === false) materials = materials.filter(material => !material.has_band_structure);
  materials.sort((a, b) => Number(b.is_stable) - Number(a.is_stable)
    || finite(a.energy_above_hull_eV_atom, Infinity) - finite(b.energy_above_hull_eV_atom, Infinity)
    || finite(a.band_gap_eV, Infinity) - finite(b.band_gap_eV, Infinity));

  const result = {
    ok: true,
    generated_at: new Date().toISOString(),
    query: request.query,
    filters: {
      material_id: request.materialId || null,
      formula: request.formula || null,
      chemsys: request.chemsys || null,
      elements: request.elements,
      exclude_elements: request.excludeElements,
      band_gap_eV: [request.bandGapMin, request.bandGapMax],
      stable: request.stable,
      metallic: request.metallic,
      has_dos: request.hasDos,
      has_band_structure: request.hasBandStructure,
      crystal_system: request.crystalSystem || null
    },
    statistics: {
      total_returned: materials.length,
      structures_available: materials.filter(material => material.structure).length,
      cif_available: materials.filter(material => material.files.cif).length,
      poscar_available: materials.filter(material => material.files.poscar).length
    },
    materials,
    notes: [
      "性质和结构来自 Materials Project 计算数据库。",
      "同一化学式可能对应多个晶型，请使用 Materials Project ID 区分。",
      "含部分占位或无序位点的结构只导出 CIF，不生成近似 POSCAR。"
    ]
  };
  responseCache.set(cacheKey, { savedAt: Date.now(), data: result });
  return result;
}

async function handleMaterialsStructureRequest(request, options = {}) {
  if (String(request.method || "POST").toUpperCase() !== "POST") {
    return { statusCode: 405, payload: { ok: false, error: "Method not allowed" } };
  }
  if (request.origin && !isAllowedOrigin(request.origin, options.env || process.env)) {
    return { statusCode: 403, payload: { ok: false, error: "Origin is not allowed." } };
  }
  try {
    checkRateLimit(request.ip, options.now || Date.now());
    const payload = await runMaterialsStructureSearch(request.body, options);
    return { statusCode: 200, payload };
  } catch (error) {
    const known = error instanceof StructureSearchError;
    return {
      statusCode: known ? error.statusCode : 500,
      payload: { ok: false, error: error?.message || "结构检索失败。", details: known ? error.details : null }
    };
  }
}

module.exports = {
  StructureSearchError,
  buildSearchParams,
  handleMaterialsStructureRequest,
  normalizeMaterial,
  normalizeRequest,
  runMaterialsStructureSearch,
  structureIsOrdered,
  structureToCif,
  structureToPoscar
};
