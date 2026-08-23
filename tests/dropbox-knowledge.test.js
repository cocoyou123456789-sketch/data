const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const zlib = require("node:zlib");

const {
  dropboxKnowledgeStatus,
  extractZipDocuments,
  searchDropboxKnowledge,
  syncDropboxKnowledge
} = require("../lib/dropbox-knowledge");
const { handler: syncHandler } = require("../netlify/functions/dropbox-sync");

const ROOT = path.join(__dirname, "..");

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function configuredEnv(overrides = {}) {
  return {
    OPENAI_API_KEY: "server-openai-key",
    DROPBOX_KNOWLEDGE_ENABLED: "true",
    DROPBOX_ACCESS_TOKEN: "server-dropbox-token",
    DROPBOX_DATA_FOLDER: "/ARPES-Agent-Data",
    OPENAI_DROPBOX_VECTOR_STORE_NAME: "test-dropbox-store",
    DROPBOX_SYNC_MAX_CHANGES: "4",
    ...overrides
  };
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, value] of entries) {
    const fileName = Buffer.from(name, "utf8");
    const data = Buffer.from(value);
    const compressed = zlib.deflateRawSync(data);
    const checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(fileName.length, 26);
    locals.push(local, fileName, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(fileName.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, fileName);
    offset += local.length + fileName.length + compressed.length;
  }
  const centralBuffer = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuffer, end]);
}

test("Dropbox knowledge status exposes configuration without exposing secrets", () => {
  const status = dropboxKnowledgeStatus(configuredEnv());
  assert.equal(status.enabled, true);
  assert.equal(status.search_configured, true);
  assert.equal(status.sync_configured, true);
  assert.equal(status.folder, "/ARPES-Agent-Data");
  assert.equal(status.vector_store, "test-dropbox-store");
  assert.doesNotMatch(JSON.stringify(status), /server-(?:openai-key|dropbox-token)/);
});

test("ZIP extraction imports supported documents and ignores binaries and nested archives", async () => {
  const zip = makeZip([
    ["notes/FeSe.txt", "FeSe replica-band notes"],
    ["tables/materials.csv", "material,Tc\nFeSe,8"],
    ["raw/spectrum.bin", "not a supported document"],
    ["nested/second.zip", "nested archives are intentionally ignored"]
  ]);
  const documents = await extractZipDocuments({
    name: "experiment-bundle.zip",
    path: "/arpes-agent-data/experiment-bundle.zip"
  }, zip, configuredEnv());
  assert.equal(documents.length, 2);
  assert.deepEqual(documents.map(item => item.archive_entry), [
    "notes/FeSe.txt",
    "tables/materials.csv"
  ]);
  assert.ok(documents.every(item => !item.name.includes("/")));
  assert.match(documents[0].data.toString("utf8"), /replica-band/);
});

test("ZIP extraction rejects archives whose expanded contents exceed the safety budget", async () => {
  const zip = makeZip([["large.txt", "1234567890"]]);
  await assert.rejects(
    extractZipDocuments({ name: "large.zip", path: "/large.zip" }, zip, configuredEnv({
      DROPBOX_ZIP_MAX_UNCOMPRESSED_BYTES: "8"
    })),
    error => error.code === "DROPBOX_ZIP_LIMIT_EXCEEDED"
  );
});

test("Dropbox sync uploads a changed supported file and attaches source metadata", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (url === "https://api.dropboxapi.com/2/files/list_folder") {
      return jsonResponse({
        entries: [
          {
            ".tag": "file",
            id: "id:paper-1",
            rev: "rev-2",
            name: "FeSe-notes.pdf",
            path_lower: "/arpes-agent-data/fese-notes.pdf",
            size: 7,
            server_modified: "2026-08-22T20:00:00Z"
          },
          {
            ".tag": "file",
            id: "id:ignored",
            rev: "rev-1",
            name: "raw.exe",
            path_lower: "/arpes-agent-data/raw.exe",
            size: 2
          }
        ],
        has_more: false,
        cursor: "cursor-1"
      });
    }
    if (url === "https://api.openai.com/v1/vector_stores?limit=100") {
      return jsonResponse({ data: [{ id: "vs_test", name: "test-dropbox-store" }], has_more: false });
    }
    if (url === "https://api.openai.com/v1/vector_stores/vs_test/files?limit=100") {
      return jsonResponse({ data: [], has_more: false });
    }
    if (url === "https://content.dropboxapi.com/2/files/download") {
      return new Response(Buffer.from("PDFDATA"), { status: 200 });
    }
    if (url === "https://api.openai.com/v1/files") {
      assert.match(String(options.headers.Authorization), /server-openai-key/);
      assert.ok(options.body instanceof FormData);
      return jsonResponse({ id: "file_openai_1", filename: "FeSe-notes.pdf" });
    }
    if (url === "https://api.openai.com/v1/vector_stores/vs_test/files") {
      const body = JSON.parse(options.body);
      assert.equal(body.file_id, "file_openai_1");
      assert.equal(body.attributes.source, "dropbox");
      assert.equal(body.attributes.dropbox_id, "id:paper-1");
      assert.equal(body.attributes.dropbox_rev, "rev-2");
      return jsonResponse({ id: "file_openai_1", status: "in_progress" });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  const result = await syncDropboxKnowledge({ env: configuredEnv(), fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(result.discovered, 1);
  assert.equal(result.uploaded, 1);
  assert.equal(result.remaining_changes, 0);
  assert.ok(calls.some(call => call.url.includes("content.dropboxapi.com/2/files/download")));
});

test("Dropbox sync expands one ZIP into separate vector-store documents", async () => {
  const zip = makeZip([
    ["notes/FeSe.txt", "FeSe notes"],
    ["tables/gaps.csv", "material,gap\nFeSe,2.5"],
    ["nested/ignored.zip", "ignored"]
  ]);
  const attached = [];
  let uploadIndex = 0;
  const fetchImpl = async (url, options = {}) => {
    if (url === "https://api.dropboxapi.com/2/files/list_folder") {
      return jsonResponse({
        entries: [{
          ".tag": "file",
          id: "id:archive-1",
          rev: "archive-rev-1",
          name: "experiment.zip",
          path_lower: "/arpes-agent-data/experiment.zip",
          size: zip.length,
          server_modified: "2026-08-23T12:00:00Z"
        }],
        has_more: false
      });
    }
    if (url === "https://api.openai.com/v1/vector_stores?limit=100") {
      return jsonResponse({ data: [{ id: "vs_zip", name: "test-dropbox-store" }], has_more: false });
    }
    if (url === "https://api.openai.com/v1/vector_stores/vs_zip/files?limit=100") {
      return jsonResponse({ data: [], has_more: false });
    }
    if (url === "https://content.dropboxapi.com/2/files/download") {
      return new Response(zip, { status: 200 });
    }
    if (url === "https://api.openai.com/v1/files") {
      uploadIndex += 1;
      const uploaded = options.body.get("file");
      assert.ok(uploaded.name.startsWith("experiment__"));
      assert.doesNotMatch(uploaded.name, /\.zip$/i);
      return jsonResponse({ id: `file_zip_${uploadIndex}`, filename: uploaded.name });
    }
    if (url === "https://api.openai.com/v1/vector_stores/vs_zip/files") {
      attached.push(JSON.parse(options.body));
      return jsonResponse({ id: attached.at(-1).file_id, status: "in_progress" });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  const result = await syncDropboxKnowledge({ env: configuredEnv(), fetchImpl });
  assert.equal(result.archives_processed, 1);
  assert.equal(result.archive_documents, 2);
  assert.equal(result.uploaded, 2);
  assert.deepEqual(attached.map(item => item.attributes.archive_entry), [
    "notes/FeSe.txt",
    "tables/gaps.csv"
  ]);
  assert.deepEqual(attached.map(item => item.attributes.archive_complete), [false, true]);
});

test("Dropbox knowledge search returns bounded file excerpts", async () => {
  const fetchImpl = async (url, options = {}) => {
    if (url === "https://api.openai.com/v1/vector_stores?limit=100") {
      return jsonResponse({ data: [{ id: "vs_search", name: "test-dropbox-store" }], has_more: false });
    }
    if (url === "https://api.openai.com/v1/vector_stores/vs_search/search") {
      const body = JSON.parse(options.body);
      assert.equal(body.query, "FeSe replica band evidence");
      assert.equal(body.rewrite_query, true);
      return jsonResponse({
        data: [{
          file_id: "file_search_1",
          filename: "FeSe-notes.pdf",
          score: 0.91,
          attributes: { source: "dropbox", dropbox_path: "/arpes-agent-data/fese-notes.pdf" },
          content: [{ type: "text", text: "Replica-band separation is discussed in the uploaded notes." }]
        }]
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const result = await searchDropboxKnowledge(
    { query: "FeSe replica band evidence", limit: 5 },
    { env: configuredEnv(), fetchImpl }
  );
  assert.equal(result.source, "dropbox_vector_store");
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].filename, "FeSe-notes.pdf");
  assert.match(result.matches[0].text, /Replica-band/);
  assert.match(result.warning, /untrusted reference data/i);
});

test("Netlify schedules the Dropbox sync hourly and returns a safe configuration error", async () => {
  const netlify = fs.readFileSync(path.join(ROOT, "netlify.toml"), "utf8");
  assert.match(netlify, /\[functions\."dropbox-sync"\][\s\S]*schedule\s*=\s*"@hourly"/);
  const response = await syncHandler({}, {}, { env: {} });
  const payload = JSON.parse(response.body);
  assert.equal(response.statusCode, 503);
  assert.equal(payload.code, "DROPBOX_SYNC_NOT_CONFIGURED");
  assert.doesNotMatch(response.body, /server-openai-key|server-dropbox-token/);
});
