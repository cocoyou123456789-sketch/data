const {
  handleChatRequest,
  isAllowedOrigin
} = require("../lib/openai-chat");

function setCors(req, res) {
  const origin = String(req.headers.origin || "");
  if (origin && isAllowedOrigin(origin, process.env)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Cache-Control", "no-store");
}

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  if (typeof req.body === "string") return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 120_000) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  const origin = String(req.headers.origin || "");
  if (req.method === "OPTIONS") {
    if (origin && !isAllowedOrigin(origin, process.env)) {
      return res.status(403).json({ ok: false, error: "Origin is not allowed." });
    }
    return res.status(204).end();
  }
  try {
    const body = req.method === "POST" ? await readBody(req) : "";
    const result = await handleChatRequest({
      method: req.method,
      origin,
      authorization: req.headers.authorization || "",
      ip: req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown",
      body
    });
    return res.status(result.statusCode).json(result.payload);
  } catch (error) {
    return res.status(413).json({
      ok: false,
      error: error?.message || "Request body is too large.",
      code: "BODY_TOO_LARGE"
    });
  }
};
