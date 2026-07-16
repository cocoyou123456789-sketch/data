const { RequestError, runScienceOneTool } = require("../../lib/scienceone-tools");

const BASE_ALLOWED_ORIGINS = new Set([
  "null",
  "https://cocoyou123456789-sketch.github.io",
  "https://sunny-clafoutis-5748cb.netlify.app",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173"
]);
const rateBuckets = new Map();

function allowedOrigins() {
  const extra = String(process.env.SCIENCEONE_ALLOWED_ORIGINS || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
  return new Set([...BASE_ALLOWED_ORIGINS, ...extra]);
}

function headersFor(origin) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
  if (origin && allowedOrigins().has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function response(statusCode, body, origin) {
  return { statusCode, headers: headersFor(origin), body: body ? JSON.stringify(body) : "" };
}

function checkRateLimit(event) {
  const now = Date.now();
  const ip = String(event.headers?.["x-forwarded-for"] || "unknown").split(",")[0].trim();
  const current = rateBuckets.get(ip);
  if (!current || now - current.startedAt >= 60_000) {
    rateBuckets.set(ip, { startedAt: now, count: 1 });
    return;
  }
  current.count += 1;
  if (current.count > 12) throw new RequestError("Too many ScienceOne requests. Try again in one minute.", 429);
}

exports.handler = async function handler(event) {
  const origin = event.headers?.origin || event.headers?.Origin || "";
  if (origin && !allowedOrigins().has(origin)) return response(403, { ok: false, error: "Origin is not allowed." }, origin);
  if (event.httpMethod === "OPTIONS") return response(204, null, origin);
  if (event.httpMethod !== "POST") return response(405, { ok: false, error: "Method not allowed." }, origin);

  try {
    checkRateLimit(event);
    if ((event.body || "").length > 300_000) throw new RequestError("Request body is too large.", 413);
    let body;
    try { body = event.body ? JSON.parse(event.body) : {}; }
    catch { throw new RequestError("Request body must be valid JSON."); }
    const result = await runScienceOneTool(String(body.tool || ""), body.payload);
    return response(200, result, origin);
  } catch (error) {
    const statusCode = error instanceof RequestError ? error.statusCode : 500;
    return response(statusCode, {
      ok: false,
      error: error?.message || "ScienceOne proxy failed.",
      details: error?.details || null
    }, origin);
  }
};
