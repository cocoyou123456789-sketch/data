const {
  handleMaterialPredictRequest,
  isAllowedOrigin
} = require("../../lib/material-predict");

function response(statusCode, payload, origin) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store"
  };
  if (origin && isAllowedOrigin(origin, process.env)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
  }
  return {
    statusCode,
    headers,
    body: payload ? JSON.stringify(payload) : ""
  };
}

exports.handler = async function handler(event) {
  const method = String(event.httpMethod || "POST").toUpperCase();
  const origin = String(event.headers?.origin || event.headers?.Origin || "");
  if (method === "OPTIONS") {
    if (origin && !isAllowedOrigin(origin, process.env)) {
      return response(403, { ok: false, error: "Origin is not allowed." }, origin);
    }
    return response(204, null, origin);
  }
  const result = await handleMaterialPredictRequest({
    method,
    origin,
    ip: event.headers?.["x-forwarded-for"] || event.headers?.["client-ip"] || "unknown",
    body: event.body || ""
  });
  return response(result.statusCode, result.payload, origin);
};
