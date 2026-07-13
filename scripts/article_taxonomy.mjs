const SUBSCRIPT_DIGITS = {
  "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4",
  "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
  "ₓ": "x"
};

export const ELEMENT_SYMBOLS = new Set([
  "H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne", "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar",
  "K", "Ca", "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn", "Ga", "Ge", "As", "Se", "Br", "Kr",
  "Rb", "Sr", "Y", "Zr", "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd", "In", "Sn", "Sb", "Te", "I", "Xe",
  "Cs", "Ba", "La", "Ce", "Pr", "Nd", "Pm", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Tm", "Yb", "Lu",
  "Hf", "Ta", "W", "Re", "Os", "Ir", "Pt", "Au", "Hg", "Tl", "Pb", "Bi", "Po", "At", "Rn", "Fr", "Ra",
  "Ac", "Th", "Pa", "U", "Np", "Pu", "Am", "Cm", "Bk", "Cf", "Es", "Fm", "Md", "No", "Lr"
]);

export const KNOWN_MATERIALS = [
  "Bi2Se3", "Bi2Te3", "Sb2Te3", "MnBi2Te4", "WTe2", "MoS2", "MoSe2", "MoTe2", "WS2", "WSe2",
  "FeSe", "FeTe", "LiFeAs", "NaFeAs", "BaFe2As2", "BaK122", "Ba0.6K0.4Fe2As2",
  "YBCO", "YBa2Cu3O7", "Bi2212", "Bi2Sr2CaCu2O8", "Bi2201", "LSCO", "LBCO", "CuO2",
  "Nd2CuO4", "Nd1-xSrxNiO2", "La3Ni2O7", "LaNiO3",
  "SnSe2", "SnSe", "SnS2", "SnS", "MgB2", "Nb3Sn", "NbN", "NbSe2", "2H-NbSe2",
  "CeCoIn5", "CeIrIn5", "CeCu2Si2", "Hg", "Pb", "Nb", "H3S", "LaH10", "SrTiO3", "KTaO3",
  "NiPS3", "TaS2", "TaSe2", "TiSe2", "VSe2", "Bi", "Bi111", "1T-TaS2", "2H-TaSe2",
  "graphene", "h-BN", "BN", "black phosphorus", "phosphorene", "MXene", "Ti3C2Tx",
  "silicene", "germanene", "stanene", "borophene", "antimonene", "bismuthene", "plumbene"
];

const MATERIAL_ACRONYM_ELEMENTS = new Map([
  ["YBCO", ["Y", "Ba", "Cu", "O"]],
  ["LSCO", ["La", "Sr", "Cu", "O"]],
  ["LBCO", ["La", "Ba", "Cu", "O"]],
  ["BSCCO", ["Bi", "Sr", "Ca", "Cu", "O"]],
  ["BI2212", ["Bi", "Sr", "Ca", "Cu", "O"]],
  ["BI2201", ["Bi", "Sr", "Cu", "O"]],
  ["BAK122", ["Ba", "K", "Fe", "As"]],
  ["BKBO", ["Ba", "K", "Bi", "O"]],
  ["STO", ["Sr", "Ti", "O"]],
  ["KTO", ["K", "Ta", "O"]],
  ["H-BN", ["B", "N"]],
  ["BN", ["B", "N"]],
  ["BP", ["B", "P"]],
  ["CSH", ["C", "S", "H"]],
  ["GRAPHENE", ["C"]],
  ["BLACK PHOSPHORUS", ["P"]],
  ["PHOSPHORENE", ["P"]],
  ["TI3C2TX", ["Ti", "C"]],
  ["SILICENE", ["Si"]],
  ["GERMANENE", ["Ge"]],
  ["STANENE", ["Sn"]],
  ["BOROPHENE", ["B"]],
  ["ANTIMONENE", ["Sb"]],
  ["BISMUTHENE", ["Bi"]],
  ["PLUMBENE", ["Pb"]]
]);

const MATERIAL_ACRONYMS = new Set(MATERIAL_ACRONYM_ELEMENTS.keys());
const GENERIC_MATERIAL_TERMS = new Set([
  "cuprate", "cuprates", "nickelate", "nickelates", "iron-based superconductors",
  "unconventional superconductors", "conventional superconductors", "beamline instrumentation"
]);

export const MATERIAL_STOPWORDS = new Set([
  "OF", "ON", "IN", "BY", "SI", "FS", "SC", "SOC", "SPIN", "PHYSICS", "PHONON", "PHONONS",
  "BCS", "VHS", "COPY", "B.V", "BI", "IV", "IP", "OP", "BOSONIC", "ELECTRON", "ELECTRONS",
  "SUPERCONDUCTIVITY", "TRANSITION", "TEMPERATURE", "MOMENTUM", "ELEMENTS", "THEORY", "STATE", "STATES"
]);

const TWO_D_DEFINITIONS = [
  {
    id: "graphene",
    patterns: [/\bgraphene\b/i, /\b(?:mono|bi|tri|few)[- ]?layer graphite\b/i]
  },
  {
    id: "tmds",
    patterns: [
      /\bTMDs?\b/i,
      /\btransition[- ]metal (?:di)?chalcogenides?\b/i,
      /\b(?:Mo|W)(?:S|Se|Te)2\b/i,
      /\b(?:Nb|Ta|Ti|V)(?:S|Se|Te)2\b/i
    ]
  },
  {
    id: "hbn",
    patterns: [/\bh-?BN\b/i, /\bhexagonal boron nitride\b/i, /\bboron nitride\b/i]
  },
  {
    id: "black-phosphorus",
    patterns: [/\bblack phosphorus\b/i, /\bphosphorene\b/i]
  },
  {
    id: "mxene",
    patterns: [/\bMXenes?\b/i, /\bTi3C2T?x?\b/i]
  },
  {
    id: "xenes",
    patterns: [/\bXenes?\b/i, /\b(?:silicene|germanene|stanene|borophene|antimonene|bismuthene|plumbene)\b/i]
  },
  {
    id: "cof-mof",
    patterns: [/\b(?:COF|MOF)s?\b/i, /\bcovalent organic frameworks?\b/i, /\bmetal[- ]organic frameworks?\b/i],
    requiresTwoDContext: true
  }
];

const SUPERCONDUCTIVITY_DEFINITIONS = [
  { id: "cuprate", patterns: [/\bcuprates?\b/i, /\b(?:YBCO|LSCO|LBCO|Bi2212|Bi2201|BSCCO)\b/i, /\b(?:YBa2Cu3O7|Bi2Sr2CaCu2O8)\b/i] },
  { id: "iron-based", patterns: [/\biron[- ]based\b/i, /\biron (?:pnictide|chalcogenide)s?\b/i, /\b(?:FeSe|FeTe|LiFeAs|NaFeAs|BaFe2As2|BaK122)\b/i] },
  { id: "nickelate", patterns: [/\bnickelates?\b/i, /\b(?:Nd1-xSrxNiO2|La3Ni2O7|LaNiO3)\b/i] },
  { id: "conventional", patterns: [/\bconventional superconduct/i, /\b(?:MgB2|Nb3Sn|NbN)\b/i] },
  {
    id: "tmd",
    patterns: [/\b(?:NbSe2|TaS2|TaSe2|TiSe2)\b/i, /\bsuperconducting (?:transition[- ]metal )?(?:di)?chalcogenide/i],
    requiresSuperconductivityContext: true
  },
  { id: "heavy-fermion", patterns: [/\bheavy[- ]fermion\b/i, /\b(?:CeCoIn5|CeIrIn5|CeCu2Si2|UPt3|UBe13)\b/i] },
  { id: "hydride", patterns: [/\bhydride superconduct/i, /\b(?:H3S|LaH10|H2S|C-S-H|CSH)\b/i] }
];

const TECHNIQUE_RULES = [
  ["ARPES", /\bARPES\b|angle[- ]resolved photoemission/i],
  ["XPS", /\bXPS\b|x[- ]ray photoelectron/i],
  ["XRD", /\bXRD\b|x[- ]ray diffraction/i],
  ["STM", /\bSTM\b|scanning tunneling/i],
  ["TEM", /\bTEM\b|transmission electron/i],
  ["DFT", /\bDFT\b|density functional theory|first[- ]principles/i],
  ["MBE", /\bMBE\b|molecular beam epitaxy/i],
  ["CVT", /\bCVT\b|chemical vapor transport/i],
  ["Raman", /\bRaman\b/i],
  ["neutron", /neutron (?:scattering|diffraction)/i],
  ["transport", /\bresistivity\b|\btransport\b|Hall effect/i],
  ["SQUID", /\bSQUID\b|magnetic susceptibility/i]
];

function uniq(values) {
  return [...new Set((values || []).filter(Boolean))];
}

export function cleanMetadataText(value, limit = 1200) {
  const replacements = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
    minus: "-", ndash: "-", mdash: "-", middot: "·"
  };
  const text = String(value || "")
    .replace(/<middle dot>/gi, "·")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => replacements[name.toLowerCase()] ?? match)
    .replace(/\s+/g, " ")
    .trim();
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

export function normalizeFormulaText(value) {
  return String(value || "")
    .replace(/[₀₁₂₃₄₅₆₇₈₉ₓ]/g, char => SUBSCRIPT_DIGITS[char] || char)
    .replace(/[−–—]/g, "-")
    .replace(/δ/g, "delta");
}

export function normalizeDoi(value) {
  return String(value || "")
    .trim()
    .replace(/^doi\s*:\s*/i, "")
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .split(/[?#]/, 1)[0]
    .replace(/[\s.,;:]+$/g, "")
    .toLowerCase();
}

function hasBalancedDelimiters(value) {
  const pairs = { ")": "(", "]": "[", "}": "{" };
  const stack = [];
  for (const char of value) {
    if ("([{ ".includes(char) && char !== " ") stack.push(char);
    else if (pairs[char] && stack.pop() !== pairs[char]) return false;
  }
  return stack.length === 0;
}

export function parseFormulaElements(value) {
  const original = String(value || "").trim();
  if (!original) return [];
  const upper = original.toUpperCase();
  if (MATERIAL_ACRONYM_ELEMENTS.has(upper)) return MATERIAL_ACRONYM_ELEMENTS.get(upper).slice();

  const normalized = normalizeFormulaText(original)
    .replace(/^[0-9]+[HTR]-/i, "")
    .replace(/\b(?:STO|KTO)\b/g, token => token === "STO" ? "SrTiO3" : "KTaO3");
  if (!hasBalancedDelimiters(normalized)) return [];
  if (/^[A-Z]{2,}$/.test(normalized) && !MATERIAL_ACRONYMS.has(normalized)) return [];
  if (/[^A-Za-z0-9.,+\-_/()[\]{}=]/.test(normalized)) return [];

  const symbols = [];
  let index = 0;
  while (index < normalized.length) {
    const rest = normalized.slice(index);
    const symbolMatch = rest.match(/^[A-Z][a-z]?/);
    if (symbolMatch) {
      const symbol = symbolMatch[0];
      if (!ELEMENT_SYMBOLS.has(symbol)) return [];
      symbols.push(symbol);
      index += symbol.length;
      continue;
    }
    const variableMatch = rest.match(/^(?:delta|[xyztnm])/i);
    if (variableMatch) {
      index += variableMatch[0].length;
      continue;
    }
    if (/^[0-9.,+\-_/()[\]{}=]/.test(rest)) {
      index++;
      continue;
    }
    return [];
  }
  return uniq(symbols);
}

export function isPlausibleMaterial(value, trustedNames = []) {
  const material = String(value || "").replace(/\s+/g, " ").trim();
  if (!material || material.length > 64 || MATERIAL_STOPWORDS.has(material.toUpperCase())) return false;
  const normalizedLower = normalizeFormulaText(material).toLowerCase();
  const trusted = new Set([...KNOWN_MATERIALS, ...trustedNames].map(item => normalizeFormulaText(item).toLowerCase()));
  if (trusted.has(normalizedLower) || GENERIC_MATERIAL_TERMS.has(normalizedLower)) return true;
  if (/^[A-Z][A-Z.]{1,}$/.test(material) && !MATERIAL_ACRONYMS.has(material)) return false;
  const elements = parseFormulaElements(material);
  if (!elements.length) return false;
  return elements.length >= 2 || /\d/.test(material) || ELEMENT_SYMBOLS.has(material);
}

export function materialAppearsInText(material, text) {
  const normalizedMaterial = normalizeFormulaText(material);
  const normalizedText = normalizeFormulaText(text);
  const escaped = normalizedMaterial.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9])${escaped}($|[^A-Za-z0-9])`, "i").test(normalizedText);
}

export function extractFormulaCandidates(text) {
  const candidates = [];
  const pattern = /\b(?:[0-9]+[HTR]-)?(?:[A-Z][a-z]?(?:[0-9.]+|[xy]|delta|Delta|δ|\+|-|\(|\))*?){2,}\b/g;
  for (const match of String(text || "").matchAll(pattern)) {
    const formula = match[0].replace(/[.,;:]+$/, "");
    if (!isPlausibleMaterial(formula) || parseFormulaElements(formula).length < 2) continue;
    candidates.push(formula);
  }
  return uniq(candidates);
}

export function cleanMaterialList(materials, trustedNames = []) {
  const cleaned = [];
  const seen = new Set();
  for (const raw of materials || []) {
    const material = String(raw || "").replace(/\s+/g, " ").trim().replace(/[;,.:]+$/g, "");
    if (!isPlausibleMaterial(material, trustedNames)) continue;
    const key = normalizeFormulaText(material).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(material);
  }
  return cleaned.slice(0, 18);
}

export function elementsFromMaterials(materials) {
  return uniq((materials || []).flatMap(material => parseFormulaElements(material))).slice(0, 24);
}

export function articleText(article) {
  return [
    article?.title,
    article?.source_title,
    article?.abstract,
    ...(article?.materials || []),
    ...(article?.techniques || []),
    ...(article?.keywords || []),
    ...(article?.properties || [])
  ].filter(Boolean).join(" ");
}

export function extractTechniquesFromText(value) {
  const text = String(value || "");
  return TECHNIQUE_RULES.filter(([, pattern]) => pattern.test(text)).map(([technique]) => technique);
}

function articleCategoryText(article) {
  return [article?.title, ...(article?.materials || [])].filter(Boolean).join(" ");
}

const SUPERCONDUCTIVITY_TOPIC_PATTERN = /\bsuperconduct(?:or|ors|ing|ivity)?\b|\bCooper pairs?\b|\bpairing symmetry\b/i;

function isUppercaseIndexKeyword(value) {
  const letters = String(value || "").replace(/[^A-Za-z]/g, "");
  return letters.length >= 3 && letters === letters.toUpperCase();
}

export function hasExplicitSuperconductivityContext(article) {
  const text = [
    article?.title,
    article?.source_title,
    article?.abstract,
    ...(article?.keywords || []).filter(keyword => !isUppercaseIndexKeyword(keyword))
  ].filter(Boolean).join(" ");
  return SUPERCONDUCTIVITY_TOPIC_PATTERN.test(text);
}

export function classifyTwoDCategories(article) {
  const text = normalizeFormulaText(articleCategoryText(article));
  const hasTwoDContext = /\b(?:2D|two[- ]dimensional|layered|monolayer|bilayer|few[- ]layer|nanosheet)\b/i.test(text);
  return TWO_D_DEFINITIONS
    .filter(definition => {
      if (definition.requiresTwoDContext && !hasTwoDContext) return false;
      return definition.patterns.some(pattern => pattern.test(text));
    })
    .map(definition => definition.id);
}

export function classifySuperconductivityCategories(article) {
  const text = normalizeFormulaText(articleCategoryText(article));
  const hasSuperconductivityContext = hasExplicitSuperconductivityContext(article);
  return SUPERCONDUCTIVITY_DEFINITIONS
    .filter(definition => {
      if (definition.requiresSuperconductivityContext && !hasSuperconductivityContext) return false;
      return definition.patterns.some(pattern => pattern.test(text));
    })
    .map(definition => definition.id);
}

export function classifyTopicTags(
  article,
  twoDCategories = classifyTwoDCategories(article),
  superconductivityCategories = classifySuperconductivityCategories(article)
) {
  const text = articleText(article);
  const categoryText = articleCategoryText(article);
  const techniques = new Set(article?.techniques || []);
  const tags = [];
  if (techniques.has("ARPES") || /\b(?:ARPES|angle[- ]resolved photoemission|photoemission spectroscopy)\b/i.test(text)) tags.push("arpes");
  if (hasExplicitSuperconductivityContext(article) || superconductivityCategories.some(category => category !== "tmd")) tags.push("superconductivity");
  if (twoDCategories.length || /\b(?:2D|two[- ]dimensional|monolayer|bilayer|few[- ]layer)\b/i.test(categoryText)) tags.push("2d-materials");
  if (/\b(?:beamline|endstation|analy[sz]er|instrumentation|spectrometer)\b/i.test(text)) tags.push("instrumentation");
  return uniq(tags);
}

export function inferFigureTypeFromText(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return { type: "Other", confidence: "unclassified" };
  const rules = [
    ["Fermi surface", /\bfermi surface|\bFSs?\b|constant[- ]energy (?:map|contour)/i],
    ["Gap map", /\bsuperconducting gap|\bgap (?:map|anisotropy|distribution|magnitude|sign)/i],
    ["Temperature / doping dependence", /\btemperature[- ]dependen|\bdoping[- ]dependen|\bphase diagram|\bversus temperature|\bas a function of (?:temperature|doping)/i],
    ["Charge order", /\bcharge[- ]density wave|\bCDW\b|\bcharge order|\breconstruction|\bband folding/i],
    ["EDC/MDC analysis", /\bEDCs?\b|\bMDCs?\b|energy distribution curves?|momentum distribution curves?|\bline ?shape|self[- ]energy/i],
    ["Theory comparison", /\bDFT\b|first[- ]principles|theoretical calculation|calculated (?:band|spectrum|dispersion)|theory comparison/i],
    ["Band structure", /\bband structure|\bband dispersion|energy[- ]momentum|photoemission spectra?|ARPES (?:maps?|intensit(?:y|ies)|spectr(?:um|a))/i]
  ];
  for (const [type, pattern] of rules) {
    if (pattern.test(text)) return { type, confidence: "high" };
  }
  return { type: "Other", confidence: "unclassified" };
}

export function normalizeArticleRecord(article, options = {}) {
  const normalized = { ...article };
  normalized.title = cleanMetadataText(article?.title, 700);
  normalized.source = cleanMetadataText(article?.source, 260);
  normalized.source_title = cleanMetadataText(article?.source_title, 260);
  normalized.authors = cleanMetadataText(article?.authors, 700);
  normalized.doi = normalizeDoi(article?.doi);
  normalized.materials = cleanMaterialList(article?.materials, options.trustedNames);
  const strictElements = options.strictElements || String(article?.verification_status || "").includes("wos_public_shared_metadata");
  const derivedElements = elementsFromMaterials(normalized.materials);
  normalized.elements = strictElements
    ? derivedElements
    : uniq([...(article?.elements || []).filter(symbol => ELEMENT_SYMBOLS.has(symbol)), ...derivedElements]);
  const techniqueText = options.techniqueText ?? [
    normalized.title,
    normalized.source_title,
    normalized.abstract,
    ...(article?.keywords || []),
    ...(article?.properties || [])
  ].filter(Boolean).join(" ");
  normalized.techniques = options.recomputeTechniques
    ? extractTechniquesFromText(techniqueText)
    : uniq(article?.techniques || []);
  normalized.keywords = uniq(article?.keywords || []);
  normalized.properties = uniq(article?.properties || []);
  const twoDCategories = classifyTwoDCategories(normalized);
  const superconductivityCategories = classifySuperconductivityCategories(normalized);
  normalized.classification = {
    version: "arpes-taxonomy-v3",
    topic_tags: classifyTopicTags(normalized, twoDCategories, superconductivityCategories),
    two_d_categories: twoDCategories,
    superconductivity_categories: superconductivityCategories
  };
  return normalized;
}
