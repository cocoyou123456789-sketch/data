const {
  handleChatRequest,
  isAllowedOrigin
} = require("../../lib/openai-chat");

function response(statusCode, payload, origin, extraHeaders = {}) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Cache-Control": "no-store",
    ...extraHeaders
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

function sanitizedLogValue(value, fallback, limit) {
  const safe = String(value || "")
    .replace(/[^a-z0-9_.:-]/gi, "_")
    .slice(0, limit);
  return safe || fallback;
}

function safeErrorName(error) {
  const name = String(error?.name || "");
  return new Set([
    "Error",
    "TypeError",
    "RangeError",
    "ReferenceError",
    "SyntaxError",
    "AggregateError",
    "URIError",
    "EvalError"
  ]).has(name) ? name : "UnexpectedError";
}

function logUnexpectedError(method, requestId, error) {
  console.error(JSON.stringify({
    method: sanitizedLogValue(method, "UNKNOWN", 16),
    request_id: sanitizedLogValue(requestId, "unavailable", 128),
    error_name: safeErrorName(error)
  }));
}

exports.handler = async function handler(event, context = {}) {
  let method = "UNKNOWN";
  let origin = "";
  const requestId = context?.awsRequestId || "";
  try {
    method = String(event?.httpMethod || "GET").toUpperCase();
    const eventHeaders = event?.headers || {};
    origin = String(eventHeaders.origin || eventHeaders.Origin || "");
    if (method === "OPTIONS") {
      if (origin && !isAllowedOrigin(origin, process.env)) {
        return response(403, { ok: false, error: "Origin is not allowed." }, origin);
      }
      return response(204, null, origin, { "Access-Control-Max-Age": "600" });
    }
    const result = await handleChatRequest({
      method,
      origin,
      authorization: eventHeaders.authorization || eventHeaders.Authorization || "",
      ip: eventHeaders["x-forwarded-for"] || eventHeaders["client-ip"] || "unknown",
      body: event?.body || ""
    });
    return response(result.statusCode, result.payload, origin);
  } catch (error) {
    logUnexpectedError(method, requestId, error);
    return response(500, {
      ok: false,
      error: "Chat function failed unexpectedly.",
      code: "FUNCTION_ERROR"
    }, origin);
  }
};
