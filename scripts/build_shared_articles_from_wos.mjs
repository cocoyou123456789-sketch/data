#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const DEFAULT_OUT = "github-pages/data/shared_articles.json";
const MIN_ARTICLE_YEAR = 2016;

const KNOWN_MATERIALS = [
  "Bi2Se3", "Bi2Te3", "Sb2Te3", "WTe2", "MoS2", "MoSe2", "MoTe2", "WS2", "WSe2",
  "FeSe", "FeTe", "BaFe2As2", "BaK122", "Ba0.6K0.4Fe2As2",
  "YBCO", "YBa2Cu3O7", "Bi2212", "Bi2Sr2CaCu2O8", "Bi2201", "LSCO", "LBCO",
  "Nd2CuO4", "Nd1-xSrxNiO2", "La3Ni2O7", "LaNiO3",
  "SnSe2", "SnSe", "SnS2", "SnS",
  "MgB2", "Nb3Sn", "NbSe2", "2H-NbSe2",
  "CeCoIn5", "CeIrIn5", "Hg", "Pb", "Nb", "H3S", "LaH10", "SrTiO3", "KTaO3",
  "NiPS3", "TaS2", "TaSe2", "Bi", "Bi111", "1T-TaS2", "2H-TaSe2"
];

const ELEMENTS = new Set([
  "H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne", "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar",
  "K", "Ca", "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn", "Ga", "Ge", "As", "Se", "Br", "Kr",
  "Rb", "Sr", "Y", "Zr", "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd", "In", "Sn", "Sb", "Te", "I", "Xe",
  "Cs", "Ba", "La", "Ce", "Pr", "Nd", "Sm", "Eu", "Gd", "Dy", "Hf", "Ta", "W", "Re", "Os", "Ir", "Pt", "Au",
  "Hg", "Tl", "Pb", "Bi"
]);

const TECHNIQUE_MAP = {
  ARPES: ["arpes", "angle-resolved photoemission"],
  XPS: ["xps", "x-ray photoelectron"],
  XRD: ["xrd", "x-ray diffraction"],
  STM: ["stm", "scanning tunneling"],
  TEM: ["tem", "transmission electron"],
  DFT: ["dft", "density functional theory", "first-principles"],
  MBE: ["mbe", "molecular beam epitaxy"],
  CVT: ["cvt", "chemical vapor transport"],
  Raman: ["raman"],
  neutron: ["neutron scattering", "neutron diffraction"],
  transport: ["resistivity", "transport", "hall effect"],
  SQUID: ["squid", "magnetic susceptibility"]
};

function parseArgs(argv) {
  let out = DEFAULT_OUT;
  const files = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out") {
      out = argv[++i];
    } else {
      files.push(argv[i]);
    }
  }
  if (!files.length) {
    throw new Error("Usage: node scripts/build_shared_articles_from_wos.mjs [--out github-pages/data/shared_articles.json] savedrecs*.txt");
  }
  return { out, files };
}

function decodeBuffer(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.toString("utf16le");
  if (buffer[0] === 0xfe && buffer[1] === 0xff) return buffer.swap16().toString("utf16le");
  return buffer.toString("utf8").replace(/^\uFEFF/, "");
}

function parseDelimitedLine(line, delimiter = "\t") {
  const values = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];
    if (char === "\"") {
      if (inQuotes && next === "\"") {
        current += "\"";
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values.map(value => value.replace(/^"|"$/g, "").trim());
}

function rowsFromWosFile(file) {
  const text = decodeBuffer(fs.readFileSync(file));
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) return [];
  const headers = parseDelimitedLine(lines[0]).map(header => header.replace(/^\uFEFF/, "").trim());
  return lines.slice(1).map(line => {
    const values = parseDelimitedLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || "";
    });
    return row;
  });
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function clean(value, limit = 600) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > limit ? text.slice(0, limit - 1) + "..." : text;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function materialAppearsInText(material, text) {
  if (/^[A-Z][a-z]?$/.test(material)) {
    return new RegExp(`(^|[^A-Za-z0-9])${escapeRegExp(material)}($|[^A-Za-z0-9])`, "i").test(text);
  }
  return text.toLowerCase().includes(material.toLowerCase());
}

function parseFormulaElements(formula) {
  const normalized = formula.replace(/^[0-9]+[HTR]-/i, "");
  const found = [];
  let index = 0;
  while (index < normalized.length) {
    const symbolMatch = normalized.slice(index).match(/^[A-Z][a-z]?/);
    if (!symbolMatch) return [];
    const symbol = symbolMatch[0];
    if (!ELEMENTS.has(symbol)) return [];
    found.push(symbol);
    index += symbol.length;
    const suffix = normalized.slice(index).match(/^(?:[0-9.]+|[xy]|delta|Delta|δ|\+|-|\(|\))+/);
    index += suffix ? suffix[0].length : 0;
  }
  return uniq(found);
}

function extractFormulaCandidates(text) {
  const candidates = [];
  const formulaPattern = /\b(?:[0-9]+[HTR]-)?(?:[A-Z][a-z]?(?:[0-9.]+|[xy]|delta|Delta|δ|\+|-|\(|\))*?){2,}\b/g;
  for (const match of text.matchAll(formulaPattern)) {
    const formula = match[0].replace(/[.,;:]+$/, "");
    const elements = parseFormulaElements(formula);
    if (elements.length >= 2 && formula.length <= 40) candidates.push(formula);
  }
  return uniq(candidates);
}

function extractMaterials(text) {
  return uniq([
    ...KNOWN_MATERIALS.filter(material => materialAppearsInText(material, text)),
    ...extractFormulaCandidates(text)
  ]).slice(0, 18);
}

function extractElements(text, materials) {
  const found = [];
  for (const material of materials) {
    for (const symbol of parseFormulaElements(material)) {
      if (!found.includes(symbol)) found.push(symbol);
    }
  }
  for (const word of text.split(/[\s,;.\-()[\]{}:/]+/)) {
    if (ELEMENTS.has(word) && !found.includes(word)) found.push(word);
  }
  return found.slice(0, 22);
}

function extractTechniques(text) {
  const lower = text.toLowerCase();
  return Object.entries(TECHNIQUE_MAP)
    .filter(([, keywords]) => keywords.some(keyword => lower.includes(keyword)))
    .map(([name]) => name);
}

function articleKey(article) {
  if (article.doi) return `doi:${article.doi.toLowerCase()}`;
  if (article.wos_uid) return `wos:${article.wos_uid.toLowerCase()}`;
  return `title:${article.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}:${article.year || ""}`;
}

function rowToArticle(row, index) {
  const title = clean(row.TI, 700);
  if (!title) return null;
  const doi = clean(row.DI, 220);
  const wosUid = clean(row.UT, 220);
  const authorKeywords = row.DE || "";
  const keywordsPlus = row.ID || "";
  const abstract = row.AB || "";
  const sourceTitle = clean(row.SO, 260);
  const text = [title, sourceTitle, authorKeywords, keywordsPlus, abstract].join(" ");
  const materials = extractMaterials(text);
  const elements = extractElements(text, materials);
  const keywords = uniq(`${authorKeywords};${keywordsPlus}`.split(/[;|]/).map(keyword => clean(keyword, 100))).slice(0, 24);
  const year = Number.parseInt(row.PY, 10) || null;
  const citationCount = Number.parseInt(row.TC, 10);
  const url = row.DL || (doi ? `https://doi.org/${doi}` : (wosUid ? `https://www.webofscience.com/wos/woscc/full-record/${wosUid}` : ""));
  return {
    id: wosUid ? `wos:${wosUid}` : (doi ? `doi:${doi}` : `wos-shared-${index}`),
    title,
    year,
    source: "Web of Science shared public export",
    source_title: sourceTitle,
    authors: clean(row.AU, 520),
    url: clean(url, 520),
    doi,
    wos_uid: wosUid,
    materials,
    elements,
    dopants: [],
    techniques: extractTechniques(text),
    keywords,
    citation_count: Number.isFinite(citationCount) ? citationCount : null,
    temperature_K: null,
    photon_energy_eV: null,
    beamline: "",
    properties: uniq([clean(row.DT, 120), clean(row.WC, 180), clean(row.SC, 180)]).filter(Boolean),
    evidence: uniq([title, doi ? `DOI: ${doi}` : "", wosUid ? `WoS ID: ${wosUid}` : ""]).filter(Boolean),
    verification_status: "wos_public_shared_metadata",
    figures: []
  };
}

const { out, files } = parseArgs(process.argv.slice(2));
const byKey = new Map();
let rawRows = 0;
for (const file of files) {
  for (const row of rowsFromWosFile(file)) {
    rawRows++;
    const article = rowToArticle(row, rawRows);
    if (!article) continue;
    const key = articleKey(article);
    if (!byKey.has(key)) byKey.set(key, article);
  }
}

const articles = [...byKey.values()].sort((a, b) =>
  (Number(b.year || 0) - Number(a.year || 0)) ||
  (Number(b.citation_count || 0) - Number(a.citation_count || 0)) ||
  a.title.localeCompare(b.title)
).filter(article => Number.isFinite(Number(article.year)) && Number(article.year) >= MIN_ARTICLE_YEAR);

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(articles, null, 2) + "\n");
console.log(JSON.stringify({ out, input_files: files.length, raw_rows: rawRows, articles: articles.length }, null, 2));
