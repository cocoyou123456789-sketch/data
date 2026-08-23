const {
  DropboxKnowledgeError,
  dropboxKnowledgeStatus,
  syncDropboxKnowledge
} = require("../../lib/dropbox-knowledge");

function response(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(payload)
  };
}

exports.handler = async function handler(_event, _context, options = {}) {
  const env = options.env || process.env;
  try {
    const result = await syncDropboxKnowledge({
      env,
      fetchImpl: options.fetchImpl
    });
    console.log(JSON.stringify({
      event: "dropbox_knowledge_sync",
      ok: true,
      discovered: result.discovered,
      uploaded: result.uploaded,
      deleted: result.deleted,
      remaining_changes: result.remaining_changes
    }));
    return response(200, result);
  } catch (error) {
    const known = error instanceof DropboxKnowledgeError;
    const code = known ? error.code : "DROPBOX_SYNC_FAILED";
    console.error(JSON.stringify({
      event: "dropbox_knowledge_sync",
      ok: false,
      code: String(code || "DROPBOX_SYNC_FAILED").replace(/[^A-Z0-9_]/gi, "_").slice(0, 120)
    }));
    return response(known ? error.statusCode : 500, {
      ok: false,
      error: known ? error.message : "Dropbox knowledge sync failed.",
      code,
      status: dropboxKnowledgeStatus(env)
    });
  }
};
