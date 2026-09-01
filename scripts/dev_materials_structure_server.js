const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const {
  handleMaterialsStructureRequest
} = require("../lib/materials-structure-search");

const projectRoot = path.resolve(__dirname, "..");
const publicRoot = path.join(projectRoot, "github-pages");
const port = Math.max(1, Math.min(Number(process.env.PORT) || 8771, 65535));

function loadEnvFile(filename) {
  if (!fs.existsSync(filename)) return;
  const source = fs.readFileSync(filename, "utf8");
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}

loadEnvFile(path.join(projectRoot, ".env"));

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4"
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", chunk => {
      body += chunk;
      if (body.length > 60_000) reject(new Error("Request body is too large."));
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function safeFilePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const resolved = path.resolve(publicRoot, relative);
  return resolved === publicRoot || resolved.startsWith(`${publicRoot}${path.sep}`) ? resolved : null;
}

const server = http.createServer(async (request, response) => {
  if (request.url?.split("?")[0] === "/api/materials-structure") {
    try {
      const body = await readBody(request);
      const result = await handleMaterialsStructureRequest({
        method: request.method,
        origin: request.headers.origin || "",
        ip: request.socket.remoteAddress || "local",
        body
      });
      return sendJson(response, result.statusCode, result.payload);
    } catch (error) {
      return sendJson(response, 413, { ok: false, error: error.message });
    }
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD, POST" });
    return response.end("Method not allowed");
  }
  const filePath = safeFilePath(request.url || "/");
  if (!filePath) {
    response.writeHead(403);
    return response.end("Forbidden");
  }
  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      response.writeHead(404);
      return response.end("Not found");
    }
    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    if (request.method === "HEAD") return response.end();
    fs.createReadStream(filePath).pipe(response);
  });
});

server.listen(port, "127.0.0.1", () => {
  const keyStatus = process.env.MP_API_KEY ? "configured" : "missing";
  console.log(`Materials structure dev server: http://127.0.0.1:${port}/chemistry.html`);
  console.log(`MP_API_KEY: ${keyStatus}`);
});
