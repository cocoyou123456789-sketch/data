const ALLOWED_ORIGINS = new Set([
  "https://cocoyou123456789-sketch.github.io",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173"
]);

const ARXIV_ENDPOINT = "https://export.arxiv.org/api/query";

function setCors(req, res) {
  const origin = req.headers.origin;
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGINS.has(origin) ? origin : "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 100_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch (error) { reject(error); }
    });
    req.on("error", reject);
  });
}

function clampLimit(value) {
  return Math.max(1, Math.min(Number(value) || 100, 500));
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.method === "POST" ? await readBody(req) : {};
    const query = String(body.query || req.query?.q || req.query?.query || "").trim();
    if (!query) return res.status(400).json({ error: "Missing arXiv query" });

    const params = new URLSearchParams({
      search_query: query,
      start: String(Math.max(0, Number(body.start || req.query?.start) || 0)),
      max_results: String(clampLimit(body.limit || body.maxResults || req.query?.limit || req.query?.maxResults)),
      sortBy: body.sortBy || req.query?.sortBy || "submittedDate",
      sortOrder: body.sortOrder || req.query?.sortOrder || "descending"
    });

    const response = await fetch(`${ARXIV_ENDPOINT}?${params.toString()}`, {
      headers: { Accept: "application/atom+xml, application/xml, text/xml" }
    });
    const xml = await response.text();
    if (!response.ok) {
      return res.status(response.status).json({
        error: "arXiv API request failed",
        details: xml.slice(0, 1000)
      });
    }
    res.setHeader("Content-Type", "application/atom+xml; charset=utf-8");
    return res.status(200).send(xml);
  } catch (error) {
    return res.status(500).json({ error: error.message || "arXiv API proxy failed" });
  }
};
