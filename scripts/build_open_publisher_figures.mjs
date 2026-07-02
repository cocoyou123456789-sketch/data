#!/usr/bin/env node
import fs from "node:fs";

const DEFAULT_IN = "github-pages/data/shared_articles.json";
const DEFAULT_OUT = "github-pages/data/open_figure_articles.json";
const DEFAULT_LIMIT = 220;
const MAX_FIGURES_PER_ARTICLE = 8;
const MIN_ARTICLE_YEAR = 2016;

function parseArgs(argv) {
  const args = {
    inFile: DEFAULT_IN,
    outFile: DEFAULT_OUT,
    limit: DEFAULT_LIMIT,
    concurrency: 4
  };
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i];
    if (value === "--in") args.inFile = argv[++i];
    else if (value === "--out") args.outFile = argv[++i];
    else if (value === "--limit") args.limit = Number(argv[++i]) || DEFAULT_LIMIT;
    else if (value === "--concurrency") args.concurrency = Math.max(1, Number(argv[++i]) || 4);
  }
  return args;
}

function clean(value, limit = 700) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > limit ? text.slice(0, limit - 1) + "..." : text;
}

function normalizeDoi(doi) {
  return String(doi || "")
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .toLowerCase();
}

function natureArticleUrl(doi) {
  const normalized = normalizeDoi(doi);
  if (!normalized.startsWith("10.1038/")) return "";
  return `https://www.nature.com/articles/${normalized.split("/").pop()}`;
}

function isSupportedOpenPublisher(article) {
  const doi = normalizeDoi(article.doi);
  if (!doi.startsWith("10.1038/")) return false;
  const source = String(article.source_title || article.source || "").toLowerCase();
  return /nature communications|scientific reports|communications |npj |npg asia materials|scientific data|nature physics|nature materials|nature nanotechnology|nature$/.test(source);
}

function imageTypeFromUrl(url) {
  const match = url.match(/Fig(\d+)_HTML\.(png|jpg|jpeg|webp)/i);
  return match ? `Figure ${Number(match[1])}` : "Figure";
}

function inferFigureType(article) {
  const text = [
    article.title,
    article.source_title,
    ...(article.keywords || []),
    ...(article.properties || [])
  ].join(" ").toLowerCase();
  if (text.includes("fermi")) return "Fermi surface";
  if (text.includes("gap") || text.includes("superconduct")) return "Gap map";
  if (text.includes("temperature") || text.includes("doping") || text.includes("phase diagram") || text.includes("dependence")) return "Temperature / doping dependence";
  if (text.includes("charge") || text.includes("cdw") || text.includes("order") || text.includes("reconstruction") || text.includes("folding")) return "Charge order";
  if (text.includes("edc") || text.includes("mdc") || text.includes("lineshape") || text.includes("line shape") || text.includes("self-energy") || text.includes("spectrum")) return "EDC/MDC analysis";
  if (text.includes("band") || text.includes("dispersion") || text.includes("arpes")) return "Band structure";
  if (text.includes("dft") || text.includes("calculation") || text.includes("theory") || text.includes("comparison") || text.includes("model")) return "Theory comparison";
  return "Other";
}

function extractNatureFigureUrls(html, doi) {
  const normalized = normalizeDoi(doi);
  const encodedDoi = encodeURIComponent(normalized).replace(/%2F/i, "%2F");
  const urlsByFigure = new Map();
  const patterns = [
    /https:\/\/media\.springernature\.com\/[^"'<> ]+?MediaObjects\/[^"'<> ]+?Fig\d+_HTML\.(?:png|jpg|jpeg|webp)/gi,
    /\/\/media\.springernature\.com\/[^"'<> ]+?MediaObjects\/[^"'<> ]+?Fig\d+_HTML\.(?:png|jpg|jpeg|webp)/gi,
    /(?:src|data-src|data-original)="([^"]*media\.springernature\.com[^"]*Fig\d+_HTML\.(?:png|jpg|jpeg|webp)[^"]*)"/gi
  ];
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const raw = match[1] || match[0];
      let url = raw.replace(/&amp;/g, "&");
      if (url.startsWith("//")) url = `https:${url}`;
      if (!url.toLowerCase().includes(encodedDoi.toLowerCase()) && !url.toLowerCase().includes(normalized.replace("/", "%2f"))) continue;
      url = url
        .replace("/lw1200/", "/lw685/")
        .replace("/m685/", "/lw685/")
        .replace("/full/", "/lw685/")
        .replace("/w215h120/", "/lw685/");
      const figureNumber = Number(url.match(/Fig(\d+)_HTML/i)?.[1] || 0);
      if (!figureNumber) continue;
      if (!urlsByFigure.has(figureNumber)) urlsByFigure.set(figureNumber, url);
    }
  }
  return [...urlsByFigure.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, url]) => url)
    .slice(0, MAX_FIGURES_PER_ARTICLE);
}

async function fetchText(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; ARPES-open-figure-index/1.0)",
      "accept": "text/html,application/xhtml+xml"
    }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.text();
}

function toFigureArticle(article, urls) {
  const articleUrl = natureArticleUrl(article.doi) || article.url || `https://doi.org/${article.doi}`;
  const inferredType = inferFigureType(article);
  return {
    ...article,
    source: article.source || "Open publisher article",
    url: articleUrl,
    open_access_url: articleUrl,
    verification_status: "curated_real_article_figure_open_publisher",
    data_quality: "curated_real_article_figure_open_publisher",
    figures: urls.map((url, index) => ({
      caption: `${clean(article.title, 220)} - ${imageTypeFromUrl(url)}`,
      type: inferredType,
      image_url: url,
      original_figure_url: articleUrl,
      energy_eV: null,
      temp_K: null,
      figure_index: index + 1
    }))
  };
}

async function runPool(items, worker, concurrency) {
  const results = [];
  let index = 0;
  async function next() {
    while (index < items.length) {
      const item = items[index++];
      results.push(await worker(item, index, items.length));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, next));
  return results;
}

const args = parseArgs(process.argv.slice(2));
const articles = JSON.parse(fs.readFileSync(args.inFile, "utf8"));
const candidates = articles
  .filter(article => Number.isFinite(Number(article.year)) && Number(article.year) >= MIN_ARTICLE_YEAR)
  .filter(isSupportedOpenPublisher)
  .slice(0, args.limit);

let failures = 0;
const found = [];
await runPool(candidates, async (article, index, total) => {
  const url = natureArticleUrl(article.doi);
  if (!url) return;
  try {
    const html = await fetchText(url);
    const urls = extractNatureFigureUrls(html, article.doi);
    if (urls.length) found.push(toFigureArticle(article, urls));
    console.error(`${index}/${total} ${urls.length} ${article.doi}`);
  } catch (error) {
    failures++;
    console.error(`${index}/${total} FAIL ${article.doi} ${error.message}`);
  }
}, args.concurrency);

found.sort((a, b) =>
  Number(b.year || 0) - Number(a.year || 0) ||
  String(a.title || "").localeCompare(String(b.title || ""))
);

fs.mkdirSync(new URL(`file://${process.cwd()}/${args.outFile}`).pathname.split("/").slice(0, -1).join("/"), { recursive: true });
fs.writeFileSync(args.outFile, JSON.stringify(found, null, 2) + "\n");

const figureCount = found.reduce((sum, article) => sum + (article.figures || []).length, 0);
console.log(JSON.stringify({
  input: args.inFile,
  out: args.outFile,
  candidates: candidates.length,
  articles_with_figures: found.length,
  figures: figureCount,
  failures
}, null, 2));
