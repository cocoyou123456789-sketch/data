const { handleChatRequest } = require("../lib/openai-chat");

async function main() {
  if (!process.env.USTC_LLM_API_KEY) {
    throw new Error("Set USTC_LLM_API_KEY in the local environment before running this live test.");
  }
  const result = await handleChatRequest({
    method: "POST",
    origin: "https://cocoyou123456789-sketch.github.io",
    ip: "local-ustc-live-test",
    body: JSON.stringify({
      provider: "deepseek",
      question: "只回答 USTC_DEEPSEEK_OK，不要添加其他文字。",
      page_context: { lang: "zh", purpose: "ARPES website connectivity test" }
    })
  }, {
    env: {
      ...process.env,
      CHAT_AUTH_REQUIRED: "false",
      DEEPSEEK_CHAT_COMPLETIONS_URL: process.env.DEEPSEEK_CHAT_COMPLETIONS_URL
        || "https://api.llm.ustc.edu.cn/v1/chat/completions",
      DEEPSEEK_CHAT_MODEL: process.env.DEEPSEEK_CHAT_MODEL || "deepseek-v4-flash",
      DEEPSEEK_CHAT_ENABLED: "true"
    },
    timeoutMs: 60_000
  });
  if (result.statusCode !== 200) {
    throw new Error(`${result.payload?.code || "USTC_LLM_TEST_FAILED"}: ${result.payload?.error || "Unknown error"}`);
  }
  const answer = String(result.payload.answer || "").trim();
  if (!answer.includes("USTC_DEEPSEEK_OK")) {
    throw new Error(`Unexpected model answer from ${result.payload.model || "unknown model"}.`);
  }
  console.log(JSON.stringify({
    ok: true,
    provider: result.payload.provider,
    deployment: result.payload.deployment,
    model: result.payload.model,
    response_id: result.payload.response_id || null,
    usage: result.payload.usage || null
  }, null, 2));
}

main().catch(error => {
  console.error(error?.message || String(error));
  process.exitCode = 1;
});
