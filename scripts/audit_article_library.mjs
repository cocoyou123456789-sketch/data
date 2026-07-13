#!/usr/bin/env node
import fs from "node:fs";
import {
  ELEMENT_SYMBOLS,
  classifySuperconductivityCategories,
  classifyTopicTags,
  classifyTwoDCategories,
  elementsFromMaterials,
  inferFigureTypeFromText,
  isPlausibleMaterial,
  normalizeDoi
} from "./article_taxonomy.mjs";

const FILES = [
  "github-pages/data/articles.json",
  "github-pages/data/free_arpes_articles.json",
  "github-pages/data/shared_articles.json",
  "github-pages/data/open_figure_articles.json"
];

function load(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function identity(article) {
  const doi = normalizeDoi(article.doi);
  if (doi) return `doi:${doi}`;
  const title = String(article.title || "").normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return `title:${title}:${article.year || ""}`;
}

const data = Object.fromEntries(FILES.map(file => [file, load(file)]));
const mergedIdentityCounts = new Map();
for (const records of Object.values(data)) {
  for (const article of records) {
    const key = identity(article);
    mergedIdentityCounts.set(key, (mergedIdentityCounts.get(key) || 0) + 1);
  }
}

const shared = data["github-pages/data/shared_articles.json"];
const free = data["github-pages/data/free_arpes_articles.json"];
const openFigures = data["github-pages/data/open_figure_articles.json"];
const normalizedMetadataRecords = [...shared, ...free];
const suspiciousMaterials = normalizedMetadataRecords.flatMap(article => (article.materials || [])
  .filter(material => !isPlausibleMaterial(material))
  .map(material => ({ id: article.id, material })));
const invalidElements = normalizedMetadataRecords.flatMap(article => (article.elements || [])
  .filter(element => !ELEMENT_SYMBOLS.has(element))
  .map(element => ({ id: article.id, element })));
const mismatchedElements = normalizedMetadataRecords.flatMap(article => {
  const derived = new Set(elementsFromMaterials(article.materials || []));
  return (article.elements || [])
    .filter(element => !derived.has(element))
    .map(element => ({ id: article.id, element }));
});
const unsupportedArpesTags = normalizedMetadataRecords.filter(article => {
  if (!(article.techniques || []).includes("ARPES")) return false;
  const text = [article.title, article.source_title, article.abstract, ...(article.keywords || []), ...(article.properties || [])].join(" ");
  return !/\bARPES\b|angle[- ]resolved photoemission|photoemission spectroscopy/i.test(text);
});
const figureRows = openFigures.flatMap(article => (article.figures || []).map(figure => ({ article, figure })));
const figureMetadataMissing = figureRows.filter(({ figure }) =>
  !figure.type_source || !figure.classification_confidence || !figure.caption_source ||
  (figure.type_source === "publisher_caption" && !figure.publisher_caption)
);
const figureClassificationMismatches = figureRows.filter(({ figure }) => {
  if (figure.type_source !== "publisher_caption") return false;
  const inferred = inferFigureTypeFromText(figure.publisher_caption);
  return inferred.type !== figure.type || inferred.confidence !== figure.classification_confidence;
});
const invalidFigureTypes = figureRows.filter(({ figure }) =>
  !["Fermi surface", "Band structure", "Gap map", "Temperature / doping dependence", "Charge order", "EDC/MDC analysis", "Theory comparison", "Other"].includes(figure.type)
);
const categoryIds = new Set(["graphene", "tmds", "hbn", "black-phosphorus", "mxene", "xenes", "cof-mof"]);
const invalidTwoDCategories = Object.values(data).flatMap(records => records.flatMap(article =>
  (article.classification?.two_d_categories || [])
    .filter(category => !categoryIds.has(category))
    .map(category => ({ id: article.id, category }))
));
const classificationMismatches = Object.entries(data).flatMap(([file, records]) => records.flatMap(article => {
  const twoD = classifyTwoDCategories(article);
  const superconductivity = classifySuperconductivityCategories(article);
  const expected = {
    version: "arpes-taxonomy-v3",
    topic_tags: classifyTopicTags(article, twoD, superconductivity),
    two_d_categories: twoD,
    superconductivity_categories: superconductivity
  };
  return JSON.stringify(article.classification || {}) === JSON.stringify(expected)
    ? []
    : [{ file, id: article.id, stored: article.classification, expected }];
}));

const report = {
  files: Object.fromEntries(Object.entries(data).map(([file, records]) => [file, records.length])),
  merged_unique_articles: mergedIdentityCounts.size,
  cross_source_duplicate_records: [...mergedIdentityCounts.values()].filter(count => count > 1).reduce((sum, count) => sum + count - 1, 0),
  shared_topic_counts: {
    arpes: shared.filter(article => article.classification?.topic_tags?.includes("arpes")).length,
    superconductivity: shared.filter(article => article.classification?.topic_tags?.includes("superconductivity")).length,
    two_d_materials: shared.filter(article => article.classification?.topic_tags?.includes("2d-materials")).length
  },
  figure_classification: {
    total: figureRows.length,
    publisher_caption: figureRows.filter(({ figure }) => figure.type_source === "publisher_caption").length,
    high_confidence: figureRows.filter(({ figure }) => figure.classification_confidence === "high").length,
    unclassified: figureRows.filter(({ figure }) => figure.classification_confidence === "unclassified").length
  },
  errors: {
    suspicious_materials: suspiciousMaterials.length,
    invalid_elements: invalidElements.length,
    mismatched_elements: mismatchedElements.length,
    figure_metadata_missing: figureMetadataMissing.length,
    figure_classification_mismatches: figureClassificationMismatches.length,
    invalid_figure_types: invalidFigureTypes.length,
    invalid_two_d_categories: invalidTwoDCategories.length,
    unsupported_arpes_tags: unsupportedArpesTags.length,
    article_classification_mismatches: classificationMismatches.length
  },
  samples: {
    suspicious_materials: suspiciousMaterials.slice(0, 8),
    mismatched_elements: mismatchedElements.slice(0, 8),
    figure_metadata_missing: figureMetadataMissing.slice(0, 3).map(({ article, figure }) => ({ article: article.id, caption: figure.caption })),
    figure_classification_mismatches: figureClassificationMismatches.slice(0, 3).map(({ article, figure }) => ({
      article: article.id,
      type: figure.type,
      publisher_caption: figure.publisher_caption
    })),
    unsupported_arpes_tags: unsupportedArpesTags.slice(0, 5).map(article => ({ id: article.id, title: article.title })),
    article_classification_mismatches: classificationMismatches.slice(0, 5)
  }
};

console.log(JSON.stringify(report, null, 2));
if (Object.values(report.errors).some(count => count > 0)) process.exitCode = 1;
