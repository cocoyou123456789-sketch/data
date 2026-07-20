const crypto = require("node:crypto");

const OIDC_AUTHORITY = "https://aai.cstcloud.net/oidc";
const OIDC_AUTHORIZE_URL = `${OIDC_AUTHORITY}/authorize`;
const OIDC_TOKEN_URL = `${OIDC_AUTHORITY}/token`;
const OIDC_USERINFO_URL = `${OIDC_AUTHORITY}/userinfo`;
const OIDC_REVOKE_URL = `${OIDC_AUTHORITY}/revoke`;
const OIDC_APPLICATION_URL = "https://aai.cstcloud.net/developer/oidcApply";
const SESSION_COOKIE = "__Host-arpes_cstcloud_session";
const FLOW_COOKIE = "__Host-arpes_cstcloud_flow";
const DEFAULT_SCOPE = "openid profile email";

class OidcError extends Error {
  constructor(message, statusCode = 400, details = null) {
    super(message);
    this.name = "OidcError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function sessionKey() {
  const secret = String(process.env.SCIENCEONE_SESSION_SECRET || "").trim();
  if (secret.length < 32) return null;
  return crypto.createHash("sha256").update(secret).digest();
}

function seal(value, lifetimeSeconds) {
  const key = sessionKey();
  if (!key) throw new OidcError("ScienceOne account sessions are not configured.", 503);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const payload = Buffer.from(JSON.stringify({
    ...value,
    exp: Math.floor(Date.now() / 1000) + lifetimeSeconds
  }));
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
  const tag = cipher.getAuthTag();
  return base64url(Buffer.concat([iv, tag, encrypted]));
}

function unseal(value) {
  const key = sessionKey();
  if (!key || !value) return null;
  try {
    const packed = Buffer.from(String(value), "base64url");
    if (packed.length < 29) return null;
    const iv = packed.subarray(0, 12);
    const tag = packed.subarray(12, 28);
    const encrypted = packed.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const payload = JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8"));
    if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(header) {
  const output = {};
  String(header || "").split(";").forEach(part => {
    const index = part.indexOf("=");
    if (index <= 0) return;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) output[key] = value;
  });
  return output;
}

function sessionFromCookie(cookieHeader) {
  return unseal(parseCookies(cookieHeader)[SESSION_COOKIE]);
}

function flowFromCookie(cookieHeader) {
  return unseal(parseCookies(cookieHeader)[FLOW_COOKIE]);
}

function cookie(name, value, options = {}) {
  const maxAge = Number.isFinite(options.maxAge) ? Math.max(0, Math.floor(options.maxAge)) : 0;
  const sameSite = options.sameSite || "Lax";
  return [
    `${name}=${value}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "Secure",
    `SameSite=${sameSite}`
  ].join("; ");
}

function clearCookie(name, sameSite = "Lax") {
  return cookie(name, "", { maxAge: 0, sameSite });
}

function oidcConfig(requestOrigin) {
  const clientId = String(process.env.SCIENCEONE_OIDC_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.SCIENCEONE_OIDC_CLIENT_SECRET || "").trim();
  const explicitRedirect = String(process.env.SCIENCEONE_OIDC_REDIRECT_URI || "").trim();
  const redirectUri = explicitRedirect || `${requestOrigin}/api/scienceone/auth/callback`;
  const scope = String(process.env.SCIENCEONE_OIDC_SCOPE || DEFAULT_SCOPE).trim() || DEFAULT_SCOPE;
  const configured = Boolean(clientId && clientSecret && sessionKey());
  return { clientId, clientSecret, redirectUri, scope, configured };
}

function safeReturnTo(value, allowedOrigins, fallback) {
  if (!value) return fallback;
  try {
    const parsed = new URL(String(value));
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return fallback;
    if (!allowedOrigins.has(parsed.origin)) return fallback;
    return parsed.toString();
  } catch {
    return fallback;
  }
}

function accountProfile(session) {
  if (!session?.profile) return null;
  const profile = session.profile;
  return {
    sub: String(profile.sub || ""),
    name: String(profile.name || profile.preferred_username || ""),
    preferred_username: String(profile.preferred_username || ""),
    email: String(profile.email || ""),
    picture: String(profile.picture || "")
  };
}

function publicAuthStatus({ requestOrigin, cookieHeader }) {
  const config = oidcConfig(requestOrigin);
  const session = sessionFromCookie(cookieHeader);
  return {
    provider: "CSTCloud AAI",
    configured: config.configured,
    connected: Boolean(session?.access_token),
    profile: accountProfile(session),
    application_url: OIDC_APPLICATION_URL,
    callback_url: config.redirectUri,
    login_url: config.configured ? `${requestOrigin}/api/scienceone/auth/login` : null,
    logout_url: config.configured ? `${requestOrigin}/api/scienceone/auth/logout` : null
  };
}

function startLogin({ requestOrigin, cookieHeader, returnTo, allowedOrigins }) {
  const config = oidcConfig(requestOrigin);
  if (!config.configured) {
    throw new OidcError("CSTCloud OIDC application credentials are not configured yet.", 503, {
      application_url: OIDC_APPLICATION_URL,
      callback_url: config.redirectUri,
      required_environment_variables: [
        "SCIENCEONE_OIDC_CLIENT_ID",
        "SCIENCEONE_OIDC_CLIENT_SECRET",
        "SCIENCEONE_SESSION_SECRET"
      ]
    });
  }

  const state = randomToken(24);
  const nonce = randomToken(24);
  const codeVerifier = randomToken(48);
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  const fallback = `${requestOrigin}/`;
  const resolvedReturnTo = safeReturnTo(returnTo, allowedOrigins, fallback);
  const flow = seal({ state, nonce, code_verifier: codeVerifier, return_to: resolvedReturnTo }, 10 * 60);
  const url = new URL(OIDC_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("scope", config.scope);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  return {
    location: url.toString(),
    cookies: [
      cookie(FLOW_COOKIE, flow, { maxAge: 10 * 60, sameSite: "Lax" }),
      clearCookie(SESSION_COOKIE, "None")
    ]
  };
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 20_000) };
  }
}

async function exchangeCode({ code, state, requestOrigin, cookieHeader }) {
  const config = oidcConfig(requestOrigin);
  if (!config.configured) throw new OidcError("CSTCloud OIDC application credentials are not configured.", 503);
  const flow = flowFromCookie(cookieHeader);
  if (!flow || !state || !safeEqual(state, flow.state)) {
    throw new OidcError("The CSTCloud login state is invalid or expired.", 400);
  }
  if (!code) throw new OidcError("CSTCloud did not return an authorization code.", 400);

  const tokenBody = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    code: String(code),
    code_verifier: String(flow.code_verifier || "")
  });
  const tokenResponse = await fetch(OIDC_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenBody
  });
  const tokenData = await parseJsonResponse(tokenResponse);
  if (!tokenResponse.ok || !tokenData.access_token) {
    throw new OidcError("CSTCloud token exchange failed.", 502, tokenData);
  }

  const userResponse = await fetch(OIDC_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` }
  });
  const userData = await parseJsonResponse(userResponse);
  if (!userResponse.ok || !userData.sub) {
    throw new OidcError("CSTCloud user information could not be verified.", 502, userData);
  }

  const expiresIn = Math.max(300, Math.min(Number(tokenData.expires_in) || 3600, 12 * 60 * 60));
  const session = seal({
    access_token: String(tokenData.access_token),
    profile: accountProfile({ profile: userData })
  }, expiresIn);
  return {
    returnTo: flow.return_to || `${requestOrigin}/`,
    cookies: [
      cookie(SESSION_COOKIE, session, { maxAge: expiresIn, sameSite: "None" }),
      clearCookie(FLOW_COOKIE, "Lax")
    ],
    profile: accountProfile({ profile: userData })
  };
}

async function logout(cookieHeader) {
  const session = sessionFromCookie(cookieHeader);
  if (session?.access_token) {
    try {
      await fetch(OIDC_REVOKE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token: session.access_token,
          token_type_hint: "access_token"
        })
      });
    } catch {
      // The local session is still cleared when the provider cannot be reached.
    }
  }
  return [
    clearCookie(SESSION_COOKIE, "None"),
    clearCookie(FLOW_COOKIE, "Lax")
  ];
}

module.exports = {
  OIDC_APPLICATION_URL,
  OidcError,
  exchangeCode,
  logout,
  publicAuthStatus,
  sessionFromCookie,
  startLogin
};
