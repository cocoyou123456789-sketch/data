const ALLOWED_ORIGINS = new Set([
  "https://cocoyou123456789-sketch.github.io",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173"
]);

const WOS_ENDPOINT = "https://api.clarivate.com/apis/wos-starter/v1/documents";

function setCors(req, res) {
  const origin = req.headers.origin;
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGINS.has(origin) ? origin : "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 200_000) {
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

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === "") return [];
  return [value];
}

function pick(...values) {
  for (const value of values) {
    if (value != null && value !== "") return value;
  }
  return "";
}

function textFrom(value) {
  if (Array.isArray(value)) return value.map(textFrom).filter(Boolean).join("; ");
  if (value && typeof value === "object") return pick(value.value, value.name, value.displayName, value.title, value.text);
  return value == null ? "" : String(value);
}

function firstDoi(item) {
  const identifiers = item.identifiers || item.identifier || {};
  const doi = pick(identifiers.doi, identifiers.DOI, item.doi, item.DOI);
  if (doi) return String(doi).replace(/^https?:\/\/doi\.org\//i, "");
  for (const value of asArray(identifiers)) {
    if (String(value.type || "").toLowerCase() === "doi") return textFrom(value.value || value);
  }
  return "";
}

function normalizeArticle(item, index) {
  const uid = pick(item.uid, item.UID, item.ut, item.id);
  const source = item.source || item.journal || {};
  const names = item.names || {};
  const authorItems = asArray(names.authors || item.authors || item.author);
  const keywordItems = [
    ...asArray(item.keywords?.authorKeywords),
    ...asArray(item.keywords?.keywordsPlus),
    ...asArray(item.keywords),
    ...asArray(item.authorKeywords),
    ...asArray(item.keywordsPlus)
  ];
  const doi = firstDoi(item);
  const title = textFrom(pick(item.title, item.titles?.title, item.name));
  const year = Number(pick(source.publishYear, source.publishedYear, item.year, item.publicationYear)) || null;
  return {
    id: uid || doi || `wos-api-${Date.now()}-${index}`,
    wos_uid: uid,
    title,
    year,
    source: "Web of Science API",
    source_title: textFrom(pick(source.sourceTitle, source.title, source.journalTitle, item.sourceTitle)),
    authors: authorItems.map(textFrom).filter(Boolean).join("; "),
    url: pick(item.links?.record, item.links?.wos, item.url, uid ? `https://www.webofscience.com/wos/woscc/full-record/${uid}` : ""),
    doi,
    materials: [],
    elements: [],
    dopants: [],
    techniques: ["ARPES"],
    keywords: keywordItems.map(textFrom).filter(Boolean),
    citation_count: Number(pick(item.citations?.[0]?.count, item.timesCited, item.citationCount)) || null,
    temperature_K: null,
    photon_energy_eV: null,
    beamline: "",
    properties: [],
    evidence: [title, doi ? `DOI: ${doi}` : "", uid ? `WoS ID: ${uid}` : ""].filter(Boolean),
    verification_status: "wos_api_metadata",
    figures: []
  };
}

function extractHits(data) {
  return asArray(
    data.hits ||
    data.records ||
    data.documents ||
    data.data ||
    data.metadata?.records ||
    data.results
  );
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.WOS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "WOS_API_KEY is not configured on the server." });
  }

  try {
    const body = await readBody(req);
    const query = String(body.query || "").trim();
    if (!query) return res.status(400).json({ error: "Missing query" });

    const limit = Math.max(1, Math.min(Number(body.limit) || 25, 50));
    const page = Math.max(1, Number(body.page) || 1);
    const params = new URLSearchParams({
      db: body.db || "WOS",
      q: query.includes("=") ? query : `TS=(${query})`,
      limit: String(limit),
      page: String(page)
    });
    if (body.sortField) params.set("sortField", String(body.sortField));

    const response = await fetch(`${WOS_ENDPOINT}?${params.toString()}`, {
      headers: { "X-ApiKey": apiKey }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res.status(response.status).json({
        error: data.message || data.error || "Web of Science API request failed",
        details: data
      });
    }

    const records = extractHits(data).map(normalizeArticle).filter(article => article.title);
    return res.status(200).json({
      query,
      count: records.length,
      records,
      raw_count: data.metadata?.total || data.total || data.totalRecords || null
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "WoS API proxy failed" });
  }
};
