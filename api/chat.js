const ALLOWED_ORIGINS = new Set([
  "https://cocoyou123456789-sketch.github.io",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173"
]);

function setCors(req, res) {
  const origin = req.headers.origin;
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGINS.has(origin) ? origin : "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 1_500_000) {
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

function normalizeMessages(body) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length) {
    return messages
      .filter(message => message && message.role && message.content)
      .map(message => ({ role: message.role, content: String(message.content) }));
  }
  return [
    { role: "system", content: "You are a helpful ChatGPT-style assistant. Answer directly and use page_context when it is relevant." },
    { role: "user", content: String(body.question || "") }
  ];
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "OPENAI_API_KEY is not configured on the server." });
  }

  try {
    const body = await readBody(req);
    const messages = normalizeMessages(body);
    const pageContext = body.page_context || body.context || null;
    if (pageContext) {
      messages.push({
        role: "system",
        content: `Page context JSON for relevant ARPES/materials/data questions:\n${JSON.stringify(pageContext).slice(0, 18000)}`
      });
    }

    const model = process.env.OPENAI_MODEL || body.model || "gpt-4.1-mini";
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: Number.isFinite(Number(body.temperature)) ? Number(body.temperature) : 0.7
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || "OpenAI request failed",
        details: data.error || data
      });
    }

    return res.status(200).json({
      answer: data.choices?.[0]?.message?.content || "",
      model: data.model || model,
      usage: data.usage || null
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Chat proxy failed" });
  }
};
