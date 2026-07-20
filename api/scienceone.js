const { RequestError, runScienceOneTool } = require("../lib/scienceone-tools");

const BASE_ALLOWED_ORIGINS = new Set([
  "null",
  "https://cocoyou123456789-sketch.github.io",
  "https://arpes-materials-explorer-cocoyou.netlify.app",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173"
]);
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 12;
const rateBuckets = new Map();

function allowedOrigins() {
  const extra = String(process.env.SCIENCEONE_ALLOWED_ORIGINS || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
  return new Set([...BASE_ALLOWED_ORIGINS, ...extra]);
}

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && allowedOrigins().has(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function checkOrigin(req) {
  const origin = req.headers.origin;
  if (origin && !allowedOrigins().has(origin)) throw new RequestError("Origin is not allowed.", 403);
}

function checkRateLimit(req) {
  const now = Date.now();
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
  const current = rateBuckets.get(ip);
  if (!current || now - current.startedAt >= RATE_WINDOW_MS) {
    rateBuckets.set(ip, { startedAt: now, count: 1 });
    return;
  }
  current.count += 1;
  if (current.count > RATE_LIMIT) throw new RequestError("Too many ScienceOne requests. Try again in one minute.", 429);
}

function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 300_000) {
        reject(new RequestError("Request body is too large.", 413));
        req.destroy();
      }
    });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(new RequestError("Request body must be valid JSON.")); }
    });
    req.on("error", reject);
  });
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") {
    try { checkOrigin(req); }
    catch (error) { return res.status(error.statusCode || 403).json({ ok: false, error: error.message }); }
    return res.status(204).end();
  }
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed." });

  try {
    checkOrigin(req);
    checkRateLimit(req);
    const body = await readBody(req);
    const result = await runScienceOneTool(String(body.tool || ""), body.payload);
    return res.status(200).json(result);
  } catch (error) {
    const status = error instanceof RequestError ? error.statusCode : 500;
    return res.status(status).json({
      ok: false,
      error: error?.message || "ScienceOne proxy failed.",
      details: error?.details || null
    });
  }
};
