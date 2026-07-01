#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_IN = "github-pages/data/open_figure_articles.json";
const DEFAULT_ASSET_DIR = "github-pages/assets/open-figures";
const DEFAULT_PUBLIC_PREFIX = "assets/open-figures";
const DEFAULT_SIZE = "w400";

function parseArgs(argv) {
  const args = {
    inFile: DEFAULT_IN,
    outFile: DEFAULT_IN,
    assetDir: DEFAULT_ASSET_DIR,
    publicPrefix: DEFAULT_PUBLIC_PREFIX,
    size: DEFAULT_SIZE,
    concurrency: 6
  };
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i];
    if (value === "--in") args.inFile = argv[++i];
    else if (value === "--out") args.outFile = argv[++i];
    else if (value === "--asset-dir") args.assetDir = argv[++i];
    else if (value === "--public-prefix") args.publicPrefix = argv[++i];
    else if (value === "--size") args.size = argv[++i] || DEFAULT_SIZE;
    else if (value === "--concurrency") args.concurrency = Math.max(1, Number(argv[++i]) || 6);
  }
  return args;
}

function remoteFigureUrl(fig) {
  const candidates = [fig.source_image_url, fig.official_image_url, fig.image_url];
  return candidates.find(value => /^https?:\/\//i.test(String(value || ""))) || "";
}

function sizedSpringerUrl(url, size) {
  if (!size || !url.includes("media.springernature.com/")) return url;
  return url.replace(/\/(?:lw685|m685|lw1200|full|w215h120|w400)\//, `/${size}/`);
}

function extensionFromUrlOrType(url, contentType) {
  const urlExt = String(new URL(url).pathname.match(/\.(png|jpe?g|webp)$/i)?.[1] || "").toLowerCase();
  if (urlExt) return urlExt === "jpeg" ? "jpg" : urlExt;
  const type = String(contentType || "").toLowerCase();
  if (type.includes("jpeg")) return "jpg";
  if (type.includes("webp")) return "webp";
  return "png";
}

function slugForArticle(article) {
  const key = String(article.doi || article.id || article.title || "article")
    .toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
  return key || "article";
}

function cacheName(article, fig, remoteUrl, ext) {
  const hash = crypto.createHash("sha1").update(remoteUrl).digest("hex").slice(0, 12);
  const index = Number(fig.figure_index) || 0;
  return `${slugForArticle(article)}-fig${String(index).padStart(2, "0")}-${hash}.${ext}`;
}

async function fetchImage(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; ARPES-open-figure-cache/1.0)",
      "accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
    }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("image/")) {
    throw new Error(`Unexpected content-type ${contentType || "unknown"}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, contentType, finalUrl: response.url || url };
}

async function runPool(items, worker, concurrency) {
  let index = 0;
  async function next() {
    while (index < items.length) {
      const item = items[index++];
      await worker(item, index, items.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, next));
}

const args = parseArgs(process.argv.slice(2));
const articles = JSON.parse(fs.readFileSync(args.inFile, "utf8"));
fs.mkdirSync(args.assetDir, { recursive: true });

const jobs = [];
for (const article of articles) {
  for (const fig of article.figures || []) {
    const sourceUrl = remoteFigureUrl(fig);
    if (!sourceUrl) continue;
    jobs.push({ article, fig, sourceUrl, cacheUrl: sizedSpringerUrl(sourceUrl, args.size) });
  }
}

let downloaded = 0;
let reused = 0;
let failed = 0;
let bytes = 0;

await runPool(jobs, async (job, index, total) => {
  try {
    const probeExt = extensionFromUrlOrType(job.cacheUrl, "");
    const preliminaryName = cacheName(job.article, job.fig, job.sourceUrl, probeExt);
    let outPath = path.join(args.assetDir, preliminaryName);
    let publicPath = `${args.publicPrefix}/${preliminaryName}`;

    if (!fs.existsSync(outPath)) {
      const image = await fetchImage(job.cacheUrl);
      const ext = extensionFromUrlOrType(image.finalUrl, image.contentType);
      const finalName = cacheName(job.article, job.fig, job.sourceUrl, ext);
      outPath = path.join(args.assetDir, finalName);
      publicPath = `${args.publicPrefix}/${finalName}`;
      if (!fs.existsSync(outPath)) {
        fs.writeFileSync(outPath, image.buffer);
        downloaded++;
        bytes += image.buffer.length;
      } else {
        reused++;
      }
    } else {
      reused++;
    }

    job.fig.source_image_url = job.sourceUrl;
    job.fig.cached_image_url = publicPath;
    job.fig.image_url = publicPath;
    console.error(`${index}/${total} OK ${publicPath}`);
  } catch (error) {
    failed++;
    job.fig.source_image_url = job.sourceUrl;
    console.error(`${index}/${total} FAIL ${job.sourceUrl} ${error.message}`);
  }
}, args.concurrency);

fs.writeFileSync(args.outFile, JSON.stringify(articles, null, 2) + "\n");

console.log(JSON.stringify({
  in: args.inFile,
  out: args.outFile,
  figures: jobs.length,
  downloaded,
  reused,
  failed,
  downloaded_mb: Number((bytes / 1024 / 1024).toFixed(2)),
  asset_dir: args.assetDir,
  size: args.size
}, null, 2));
