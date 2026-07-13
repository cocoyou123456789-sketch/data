#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  cleanMetadataText,
  inferFigureTypeFromText,
  normalizeArticleRecord,
  normalizeDoi
} from "./article_taxonomy.mjs";

const DEFAULT_FILES = [
  "github-pages/data/free_arpes_articles.json",
  "github-pages/data/shared_articles.json",
  "github-pages/data/open_figure_articles.json"
];

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function trustedMaterialNames() {
  const files = [
    "github-pages/data/superconductivity.json",
    "github-pages/data/two_dimensional_materials.json"
  ];
  return files.flatMap(file => {
    if (!fs.existsSync(file)) return [];
    return (loadJson(file).materials || []).flatMap(row => [row.material, row.display_name]).filter(Boolean);
  });
}

function normalizeFigure(figure, article) {
  const normalized = { ...figure };
  normalized.caption = cleanMetadataText(figure.caption, 500);
  const publisherCaption = normalized.type_source === "publisher_caption" && normalized.caption_source === "publisher";
  if (publisherCaption) {
    const storedCaption = cleanMetadataText(figure.publisher_caption, 500);
    const captionMatch = normalized.caption.match(/ - Figure \d+:\s*([\s\S]+)$/i);
    normalized.publisher_caption = storedCaption || cleanMetadataText(captionMatch?.[1], 500);
    const classification = inferFigureTypeFromText(normalized.publisher_caption);
    normalized.type = classification.type;
    normalized.classification_confidence = classification.confidence;
    return normalized;
  }

  const generatedCaption = new RegExp(`${String(article.title || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} - Figure \\d+`, "i");
  if (generatedCaption.test(String(normalized.caption || "")) || normalized.type_source === "article_metadata") {
    normalized.type = "Other";
    normalized.classification_confidence = "unclassified";
    normalized.type_source = "unclassified";
    normalized.caption_source = normalized.caption_source || "generated_label";
  }
  return normalized;
}

function normalizeFile(file, trustedNames) {
  const strictElements = /(?:free_arpes_articles|shared_articles|open_figure_articles)\.json$/.test(file);
  const recomputeTechniques = /(?:shared_articles|open_figure_articles)\.json$/.test(file);
  const records = loadJson(file).map(article => {
    const normalized = normalizeArticleRecord(article, { strictElements, trustedNames, recomputeTechniques });
    if (normalized.doi && String(normalized.id || "").startsWith("doi:")) normalized.id = `doi:${normalizeDoi(normalized.doi)}`;
    normalized.figures = (normalized.figures || []).map(figure => normalizeFigure(figure, normalized));
    return normalized;
  });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(records, null, 2)}\n`);
  return records;
}

const files = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_FILES;
const trustedNames = trustedMaterialNames();
const result = {};
for (const file of files) {
  const records = normalizeFile(file, trustedNames);
  result[file] = {
    articles: records.length,
    materials: records.reduce((sum, article) => sum + (article.materials || []).length, 0),
    figures: records.reduce((sum, article) => sum + (article.figures || []).length, 0)
  };
}
console.log(JSON.stringify(result, null, 2));
