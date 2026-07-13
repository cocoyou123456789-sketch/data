#!/usr/bin/env node
import fs from "node:fs";
import { inferFigureTypeFromText, normalizeDoi, normalizeArticleRecord } from "./article_taxonomy.mjs";

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

function decodeHtml(value) {
  const named = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
    minus: "-", ndash: "-", mdash: "-", thinsp: " ", times: "x"
  };
  return String(value || "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => named[name.toLowerCase()] ?? match);
}

function stripHtml(value) {
  return clean(decodeHtml(String(value || "")
    .replace(/<(?:script|style)\b[\s\S]*?<\/(?:script|style)>/gi, " ")
    .replace(/<[^>]+>/g, " ")), 500);
}

function shortExcerpt(value, maxWords = 20) {
  const words = stripHtml(value).split(/\s+/).filter(Boolean);
  return words.length > maxWords ? `${words.slice(0, maxWords).join(" ")}...` : words.join(" ");
}

function normalizeFigureUrl(url) {
  let normalized = decodeHtml(url);
  if (normalized.startsWith("//")) normalized = `https:${normalized}`;
  return normalized
    .replace("/lw1200/", "/lw685/")
    .replace("/m685/", "/lw685/")
    .replace("/full/", "/lw685/")
    .replace("/w215h120/", "/lw685/")
    .replace(/\?as=webp$/i, "");
}

function extractNatureFigures(html, article) {
  const starts = [];
  const containerPattern = /<div[^>]+class="[^"]*c-article-section__figure(?:\s|[^"])*"[^>]*data-test="figure"[^>]*>/gi;
  for (const match of html.matchAll(containerPattern)) {
    const id = match[0].match(/id="figure-(\d+)"/i)?.[1];
    if (id) starts.push({ number: Number(id), index: match.index });
  }

  const figures = [];
  for (let index = 0; index < starts.length; index++) {
    const current = starts[index];
    const end = starts[index + 1]?.index ?? Math.min(html.length, current.index + 30000);
    const block = html.slice(current.index, end);
    const imagePattern = new RegExp(`(?:src|data-src)="([^"]*Fig${current.number}_HTML\\.(?:png|jpg|jpeg|webp)[^"]*)"`, "i");
    const imageUrl = normalizeFigureUrl(block.match(imagePattern)?.[1] || "");
    if (!imageUrl) continue;
    const captionHtml = block.match(/data-test="bottom-caption"[^>]*>([\s\S]*?)<\/div>/i)?.[1] || "";
    const publisherCaption = stripHtml(captionHtml);
    const captionExcerpt = shortExcerpt(publisherCaption);
    const classification = inferFigureTypeFromText(publisherCaption);
    figures.push({
      caption: `${clean(article.title, 180)} - Figure ${current.number}${captionExcerpt ? `: ${captionExcerpt}` : ""}`,
      publisher_caption: publisherCaption,
      type: classification.type,
      classification_confidence: classification.confidence,
      type_source: captionExcerpt ? "publisher_caption" : "unclassified",
      caption_source: captionExcerpt ? "publisher" : "generated_label",
      image_url: imageUrl,
      original_figure_url: `${natureArticleUrl(article.doi) || article.url || ""}/figures/${current.number}`,
      energy_eV: null,
      temp_K: null,
      figure_index: current.number
    });
  }

  if (figures.length) return figures.slice(0, MAX_FIGURES_PER_ARTICLE);
  return extractNatureFigureUrls(html, article.doi).map((url, index) => ({
    caption: `${clean(article.title, 180)} - ${imageTypeFromUrl(url)}`,
    publisher_caption: "",
    type: "Other",
    classification_confidence: "unclassified",
    type_source: "unclassified",
    caption_source: "generated_label",
    image_url: url,
    original_figure_url: natureArticleUrl(article.doi) || article.url || "",
    energy_eV: null,
    temp_K: null,
    figure_index: index + 1
  }));
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

function toFigureArticle(article, figures) {
  const articleUrl = natureArticleUrl(article.doi) || article.url || `https://doi.org/${article.doi}`;
  return normalizeArticleRecord({
    ...article,
    source: article.source || "Open publisher article",
    url: articleUrl,
    open_access_url: articleUrl,
    verification_status: "curated_real_article_figure_open_publisher",
    data_quality: "curated_real_article_figure_open_publisher",
    figures
  }, { strictElements: true });
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
    const figures = extractNatureFigures(html, article);
    if (figures.length) found.push(toFigureArticle(article, figures));
    console.error(`${index}/${total} ${figures.length} ${article.doi}`);
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
