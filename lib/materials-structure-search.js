const MP_SUMMARY_ENDPOINT = "https://api.materialsproject.org/materials/summary/";
const MP_PROPERTY_ENDPOINTS = Object.freeze({
  electronic: "https://api.materialsproject.org/materials/electronic_structure/",
  absorption: "https://api.materialsproject.org/materials/absorption/",
  dielectric: "https://api.materialsproject.org/materials/dielectric/",
  elasticity: "https://api.materialsproject.org/materials/elasticity/",
  magnetism: "https://api.materialsproject.org/materials/magnetism/",
  xas: "https://api.materialsproject.org/materials/xas/"
});

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

function normalizeFractional(value) {
  const wrapped = ((finite(value, 0) % 1) + 1) % 1;
  return Math.abs(wrapped - 1) < 1e-10 || Math.abs(wrapped) < 1e-10 ? 0 : wrapped;
}

function structureToCif(structure, metadata = {}) {
  const lattice = structure?.lattice || {};
  const sites = asArray(structure?.sites);
  if (!asArray(lattice.matrix).length || !sites.length) return null;
  const lines = [
    `data_${String(metadata.materialId || "materials_project").replace(/[^A-Za-z0-9_]/g, "_")}`,
    "_audit_creation_method 'Materials Project API export (complete P1 cell)'",
    `# Original Materials Project space group: ${String(metadata.symmetrySymbol || "unknown").replace(/[\r\n]/g, " ")}`,
    `_chemical_formula_sum ${cifQuote(metadata.formula || "unknown")}`,
    `_cell_length_a ${formatNumber(lattice.a, 8)}`,
    `_cell_length_b ${formatNumber(lattice.b, 8)}`,
    `_cell_length_c ${formatNumber(lattice.c, 8)}`,
    `_cell_angle_alpha ${formatNumber(lattice.alpha, 8)}`,
    `_cell_angle_beta ${formatNumber(lattice.beta, 8)}`,
    `_cell_angle_gamma ${formatNumber(lattice.gamma, 8)}`,
    "_symmetry_space_group_name_H-M 'P 1'",
    "_symmetry_Int_Tables_number 1",
    "loop_",
    "_space_group_symop_operation_xyz",
    "'x, y, z'",
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
        formatNumber(normalizeFractional(abc[0]), 10),
        formatNumber(normalizeFractional(abc[1]), 10),
        formatNumber(normalizeFractional(abc[2]), 10)
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
      lines.push(abc.slice(0, 3).map(value => formatNumber(normalizeFractional(value), 12).padStart(16)).join(" "));
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

function endpointUrl(base, params) {
  return `${base}?${params.toString()}`;
}

function sampleSeries(xValues, yValues, maxPoints = 900) {
  const pairs = [];
  const x = asArray(xValues);
  const y = asArray(yValues);
  const length = Math.min(x.length, y.length);
  if (!length) return { x: [], y: [] };
  const stride = Math.max(1, Math.ceil(length / maxPoints));
  for (let index = 0; index < length; index += stride) {
    const xv = finite(x[index]);
    const yv = finite(y[index]);
    if (xv !== null && yv !== null) pairs.push([xv, yv]);
  }
  if ((length - 1) % stride && finite(x[length - 1]) !== null && finite(y[length - 1]) !== null) {
    pairs.push([Number(x[length - 1]), Number(y[length - 1])]);
  }
  return { x: pairs.map(pair => pair[0]), y: pairs.map(pair => pair[1]) };
}

function bandReference(reference) {
  if (!reference || typeof reference !== "object") return null;
  return {
    task_id: cleanText(reference.task_id, 40) || null,
    band_gap_eV: finite(reference.band_gap),
    direct_gap_eV: finite(reference.direct_gap),
    efermi_eV: finite(reference.efermi),
    cbm_eV: finite(reference.cbm?.energy),
    vbm_eV: finite(reference.vbm?.energy),
    cbm_label: cleanText(reference.cbm?.kpoint?.label, 30) || null,
    vbm_label: cleanText(reference.vbm?.kpoint?.label, 30) || null,
    nbands: finite(reference.nbands),
    is_gap_direct: reference.is_gap_direct ?? null,
    is_metal: reference.is_metal ?? null,
    magnetic_ordering: cleanText(reference.magnetic_ordering, 20) || null
  };
}

function dosReference(reference) {
  if (!reference || typeof reference !== "object") return null;
  const spin = reference.total?.["1"] || reference.total?.["-1"] || Object.values(reference.total || {})[0] || {};
  return {
    task_id: cleanText(reference.task_id, 40) || null,
    band_gap_eV: finite(spin.band_gap),
    cbm_eV: finite(spin.cbm),
    vbm_eV: finite(spin.vbm),
    efermi_eV: finite(spin.efermi),
    spin_polarization: finite(spin.spin_polarization),
    magnetic_ordering: cleanText(reference.magnetic_ordering, 20) || null,
    elements: Object.keys(reference.elemental || {}),
    orbitals: Object.keys(reference.orbital || {})
  };
}

async function optionalProperty(url, fetchImpl, headers) {
  try {
    const response = await fetchJson(url, { fetchImpl, request: { headers } });
    return { data: asArray(response.data), error: null };
  } catch (error) {
    return { data: [], error: error?.message || "数据不可用" };
  }
}

async function runMaterialsSpectroscopy(rawBody, options = {}) {
  const source = parseBody(rawBody);
  const materialId = cleanText(source.material_id || source.materialId, 40).toLowerCase();
  const formula = cleanText(source.formula, 60);
  if (!/^mp-[a-z0-9]+$/i.test(materialId)) throw new StructureSearchError("谱学查询需要有效的 Materials Project ID。", 400);
  if (!validFormula(formula)) throw new StructureSearchError("谱学查询需要有效化学式。", 400);
  const mpApiKey = options.mpApiKey || process.env.MP_API_KEY;
  if (!mpApiKey) throw new StructureSearchError("服务器尚未配置 MP_API_KEY。", 503);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new StructureSearchError("服务器不支持 fetch。", 500);
  const cacheKey = `details:${materialId}:${formula}`.toLowerCase();
  const cached = responseCache.get(cacheKey);
  if (!options.disableCache && cached && Date.now() - cached.savedAt < 30 * 60 * 1000) return cached.data;
  const headers = { "X-API-KEY": mpApiKey, Accept: "application/json" };
  const endpoints = { ...MP_PROPERTY_ENDPOINTS, ...(options.propertyEndpoints || {}) };
  const byId = (fields) => {
    const params = new URLSearchParams({ material_ids: materialId, _fields: fields, _limit: "1" });
    return params;
  };
  const xasParams = new URLSearchParams({
    formula,
    _fields: "formula_pretty,task_id,spectrum,absorbing_element,spectrum_type,edge",
    _limit: "8"
  });
  const [electronicResult, absorptionResult, dielectricResult, elasticityResult, magnetismResult, xasResult] = await Promise.all([
    optionalProperty(endpointUrl(endpoints.electronic, byId("material_id,band_gap,cbm,vbm,efermi,is_gap_direct,is_metal,magnetic_ordering,bandstructure,dos")), fetchImpl, headers),
    optionalProperty(endpointUrl(endpoints.absorption, byId("material_id,energies,absorption_coefficient,average_imaginary_dielectric,average_real_dielectric,bandgap,nkpoints")), fetchImpl, headers),
    optionalProperty(endpointUrl(endpoints.dielectric, byId("material_id,total,ionic,electronic,e_total,e_ionic,e_electronic,n")), fetchImpl, headers),
    optionalProperty(endpointUrl(endpoints.elasticity, byId("material_id,bulk_modulus,shear_modulus,youngs_modulus,universal_anisotropy,homogeneous_poisson,debye_temperature")), fetchImpl, headers),
    optionalProperty(endpointUrl(endpoints.magnetism, byId("material_id,ordering,is_magnetic,num_magnetic_sites,types_of_magnetic_species,total_magnetization")), fetchImpl, headers),
    optionalProperty(endpointUrl(endpoints.xas, xasParams), fetchImpl, headers)
  ]);
  const electronic = electronicResult.data[0] || null;
  const absorption = absorptionResult.data[0] || null;
  const dielectric = dielectricResult.data[0] || null;
  const elasticity = elasticityResult.data[0] || null;
  const magnetism = magnetismResult.data[0] || null;
  const bandstructure = electronic?.bandstructure || {};
  const xas = xasResult.data.map((doc, index) => {
    const series = sampleSeries(doc.spectrum?.x, doc.spectrum?.y, 700);
    return {
      id: cleanText(doc.spectrum_id || doc.task_id || `xas-${index + 1}`, 80),
      task_id: cleanText(doc.task_id, 50) || null,
      formula: cleanText(doc.formula_pretty || formula, 60),
      absorbing_element: cleanText(doc.absorbing_element || doc.spectrum?.absorbing_element, 3),
      edge: cleanText(doc.edge || doc.spectrum?.edge, 12),
      spectrum_type: cleanText(doc.spectrum_type || doc.spectrum?.spectrum_type, 20),
      energy_eV: series.x,
      intensity: series.y
    };
  }).filter(item => item.energy_eV.length > 1);
  const opticalSeries = absorption ? sampleSeries(absorption.energies, absorption.absorption_coefficient, 900) : { x: [], y: [] };
  const result = {
    ok: true,
    action: "details",
    material_id: materialId,
    formula,
    availability: {
      electronic: Boolean(electronic),
      dos: Boolean(electronic?.dos),
      band_structure: Boolean(Object.values(bandstructure).some(Boolean)),
      xas: xas.length > 0,
      optical_absorption: opticalSeries.x.length > 1,
      dielectric: Boolean(dielectric),
      elasticity: Boolean(elasticity),
      magnetism: Boolean(magnetism)
    },
    properties: {
      electronic: electronic ? {
        band_gap_eV: finite(electronic.band_gap), cbm_eV: finite(electronic.cbm), vbm_eV: finite(electronic.vbm),
        efermi_eV: finite(electronic.efermi), is_gap_direct: electronic.is_gap_direct ?? null,
        is_metal: electronic.is_metal ?? null, magnetic_ordering: cleanText(electronic.magnetic_ordering, 20) || null
      } : null,
      dielectric: dielectric ? {
        total: finite(dielectric.e_total), ionic: finite(dielectric.e_ionic), electronic: finite(dielectric.e_electronic),
        refractive_index: finite(dielectric.n), tensor: asArray(dielectric.total).map(asArray)
      } : null,
      elasticity: elasticity ? {
        bulk_modulus_GPa: finite(elasticity.bulk_modulus?.vrh), shear_modulus_GPa: finite(elasticity.shear_modulus?.vrh),
        youngs_modulus_GPa: finite(elasticity.youngs_modulus), universal_anisotropy: finite(elasticity.universal_anisotropy),
        poisson_ratio: finite(elasticity.homogeneous_poisson), debye_temperature_K: finite(elasticity.debye_temperature)
      } : null,
      magnetism: magnetism ? {
        ordering: cleanText(magnetism.ordering, 20), is_magnetic: magnetism.is_magnetic ?? null,
        magnetic_sites: finite(magnetism.num_magnetic_sites), species: asArray(magnetism.types_of_magnetic_species).map(String),
        total_magnetization_uB_cell: finite(magnetism.total_magnetization)
      } : null
    },
    dos: dosReference(electronic?.dos),
    band_structure: {
      setyawan_curtarolo: bandReference(bandstructure.setyawan_curtarolo),
      hinuma: bandReference(bandstructure.hinuma),
      latimer_munro: bandReference(bandstructure.latimer_munro)
    },
    spectra: {
      xas,
      optical_absorption: opticalSeries.x.length > 1 ? {
        energy_eV: opticalSeries.x,
        coefficient_cm_inverse: opticalSeries.y,
        band_gap_eV: finite(absorption.bandgap),
        nkpoints: finite(absorption.nkpoints)
      } : null
    },
    source: { name: "Materials Project", material_url: `https://materialsproject.org/materials/${materialId}` },
    errors: {
      electronic: electronicResult.error, absorption: absorptionResult.error, dielectric: dielectricResult.error,
      elasticity: elasticityResult.error, magnetism: magnetismResult.error, xas: xasResult.error
    },
    notes: [
      "XAS 与光学吸收曲线直接来自 Materials Project API，未生成模拟数据。",
      "DOS 与能带标签展示 Materials Project 任务摘要；完整数组位于 Materials Project 数据湖。",
      "XAS 静态集合按化学式、吸收元素和吸收边组织，同一化学式可能对应多个计算任务。"
    ]
  };
  responseCache.set(cacheKey, { savedAt: Date.now(), data: result });
  return result;
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
    const source = parseBody(request.body);
    const payload = source.action === "details"
      ? await runMaterialsSpectroscopy(source, options)
      : await runMaterialsStructureSearch(source, options);
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
  runMaterialsSpectroscopy,
  runMaterialsStructureSearch,
  structureIsOrdered,
  structureToCif,
  structureToPoscar
};
