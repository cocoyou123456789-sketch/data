const { RequestError, runScienceOneTool, scienceOneToolStatus } = require("../../lib/scienceone-tools");
const {
  OidcError,
  exchangeCode,
  logout,
  publicAuthStatus,
  sessionFromCookie,
  startLogin
} = require("../../lib/cstcloud-oidc");

const BASE_ALLOWED_ORIGINS = new Set([
  "null",
  "https://cocoyou123456789-sketch.github.io",
  "https://arpes-materials-explorer-cocoyou.netlify.app",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173"
]);
const rateBuckets = new Map();

function allowedOrigins(requestOrigin = "") {
  const extra = String(process.env.SCIENCEONE_ALLOWED_ORIGINS || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
  return new Set([...BASE_ALLOWED_ORIGINS, ...extra, requestOrigin].filter(Boolean));
}

function headersFor(origin, requestOrigin) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
    "Cache-Control": "no-store",
    "Vary": "Origin"
  };
  if (origin && allowedOrigins(requestOrigin).has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function response(statusCode, body, origin, requestOrigin, options = {}) {
  const headers = {
    ...headersFor(origin, requestOrigin),
    ...(options.headers || {})
  };
  if (options.contentType) headers["Content-Type"] = options.contentType;
  const output = {
    statusCode,
    headers,
    body: typeof body === "string" ? body : (body ? JSON.stringify(body) : "")
  };
  if (options.cookies?.length) output.multiValueHeaders = { "Set-Cookie": options.cookies };
  return output;
}

function requestOriginFor(event) {
  const candidates = [
    process.env.SCIENCEONE_PROXY_ORIGIN,
    process.env.URL,
    process.env.DEPLOY_PRIME_URL,
    event.rawUrl
  ].filter(Boolean);
  for (const value of candidates) {
    try {
      const parsed = new URL(String(value));
      if (parsed.protocol === "https:" || parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
        return parsed.origin;
      }
    } catch {
      // Try the next trusted deployment URL.
    }
  }
  const host = String(event.headers?.host || "localhost:8888");
  return `http://${host}`;
}

function routeFor(event) {
  let pathname = event.rawPath || event.path || "/";
  if (event.rawUrl) {
    try { pathname = new URL(event.rawUrl).pathname; }
    catch { /* Keep the provided path. */ }
  }
  const markers = ["/api/scienceone", "/.netlify/functions/scienceone"];
  for (const marker of markers) {
    const index = pathname.indexOf(marker);
    if (index >= 0) return pathname.slice(index + marker.length) || "/";
  }
  return "/";
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

function accountStatus(event, requestOrigin) {
  return publicAuthStatus({
    requestOrigin,
    cookieHeader: event.headers?.cookie || event.headers?.Cookie || ""
  });
}

function healthPayload(event, requestOrigin) {
  return {
    ok: true,
    service: "arpes-scienceone-proxy",
    version: "1.1.0",
    tools: scienceOneToolStatus(),
    account: accountStatus(event, requestOrigin)
  };
}

function redirect(location, cookies, origin, requestOrigin) {
  return response(302, "", origin, requestOrigin, {
    headers: { Location: location },
    cookies
  });
}

exports.handler = async function handler(event) {
  const requestOrigin = requestOriginFor(event);
  const origin = event.headers?.origin || event.headers?.Origin || "";
  const route = routeFor(event);
  const method = String(event.httpMethod || "GET").toUpperCase();
  const cookieHeader = event.headers?.cookie || event.headers?.Cookie || "";

  if (origin && !allowedOrigins(requestOrigin).has(origin)) {
    return response(403, { ok: false, error: "Origin is not allowed." }, origin, requestOrigin);
  }
  if (method === "OPTIONS") return response(204, null, origin, requestOrigin);

  try {
    if (method === "GET" && (route === "/" || route === "/health" || route === "/auth/me")) {
      return response(200, healthPayload(event, requestOrigin), origin, requestOrigin);
    }

    if (method === "GET" && route === "/auth/login") {
      const login = startLogin({
        requestOrigin,
        cookieHeader,
        returnTo: event.queryStringParameters?.return_to,
        allowedOrigins: allowedOrigins(requestOrigin)
      });
      return redirect(login.location, login.cookies, origin, requestOrigin);
    }

    if (method === "GET" && route === "/auth/callback") {
      const query = event.queryStringParameters || {};
      if (query.error) {
        throw new OidcError(`CSTCloud login was not completed: ${query.error_description || query.error}`, 400);
      }
      const result = await exchangeCode({
        code: query.code,
        state: query.state,
        requestOrigin,
        cookieHeader
      });
      const destination = new URL(result.returnTo);
      destination.searchParams.set("scienceone_auth", "connected");
      return redirect(destination.toString(), result.cookies, origin, requestOrigin);
    }

    if ((method === "POST" || method === "GET") && route === "/auth/logout") {
      const cookies = await logout(cookieHeader);
      return response(200, { ok: true, connected: false }, origin, requestOrigin, { cookies });
    }

    if (method !== "POST" || route !== "/") {
      return response(405, { ok: false, error: "Method not allowed." }, origin, requestOrigin);
    }

    checkRateLimit(event);
    if ((event.body || "").length > 300_000) throw new RequestError("Request body is too large.", 413);
    let body;
    try { body = event.body ? JSON.parse(event.body) : {}; }
    catch { throw new RequestError("Request body must be valid JSON."); }
    const session = sessionFromCookie(cookieHeader);
    const result = await runScienceOneTool(String(body.tool || ""), body.payload, {
      authToken: session?.access_token
    });
    return response(200, result, origin, requestOrigin);
  } catch (error) {
    const statusCode = error instanceof RequestError || error instanceof OidcError ? error.statusCode : 500;
    return response(statusCode, {
      ok: false,
      error: error?.message || "ScienceOne proxy failed.",
      details: error?.details || null
    }, origin, requestOrigin);
  }
};
