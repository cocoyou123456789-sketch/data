const assert = require("node:assert/strict");
const test = require("node:test");

const {
  handleMaterialPredictRequest,
  normalizePayload,
  runMaterialPrediction
} = require("../lib/material-predict");
const { hashChatPassword, signChatSession } = require("../lib/openai-chat");

const ORIGIN = "https://cocoyou123456789-sketch.github.io";
const BODY = {
  language: "zh",
  composition: {
    formula_hint: "MgB2",
    elements: [{ symbol: "Mg", count: 1 }, { symbol: "B", count: 2 }]
  },
  local_screening: {
    classification: "plausible",
    exploration_rank: 61,
    known_matches: [{ material: "MgB2", elements: ["Mg", "B"], tc_K: 39 }]
  },
  worker_reports: [
    {
      model: "JARVIS Baseline v1",
      model_family: "jarvis-composition-baseline",
      stage: "ml",
      state: "ready",
      recommendation: "Composition-only baseline; structure unresolved.",
      evidence_eligible: false
    },
    {
      model: "Quantum Espresso",
      model_family: "scienceone-quantum-espresso",
      stage: "task_planning",
      state: "idle",
      recommendation: "Run DFT after resolving the structure."
    }
  ]
};

test("normalization preserves bounded worker reports as untrusted context", () => {
  const payload = normalizePayload(BODY);
  assert.equal(payload.task, "materials_research_chair_synthesis");
  assert.equal(payload.client_supplied_worker_reports.length, 2);
  assert.equal(payload.client_supplied_worker_reports[0].model, "JARVIS Baseline v1");
  assert.equal(payload.client_supplied_worker_reports[1].stage, "task_planning");
});

test("USTC DeepSeek runs the dedicated materials research chair role", async () => {
  let requestUrl = "";
  let requestOptions = null;
  const fetchImpl = async (url, options) => {
    requestUrl = url;
    requestOptions = options;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id: "ustc_material_chair_test",
        model: "deepseek-v4-flash",
        choices: [{ message: { content: "主持结论：先解析结构，再安排 DFT 与实验验证。该结果不是超导证明。" } }],
        usage: { prompt_tokens: 100, completion_tokens: 30 }
      })
    };
  };
  const env = {
    MATERIAL_PREDICT_ENABLED: "true",
    MATERIAL_PREDICT_PROVIDER: "deepseek",
    MATERIAL_PREDICT_MODEL: "deepseek-v4-flash",
    DEEPSEEK_CHAT_COMPLETIONS_URL: "https://api.llm.ustc.edu.cn/v1/chat/completions",
    USTC_LLM_API_KEY: "ustc-material-test-key"
  };
  const result = await runMaterialPrediction(normalizePayload(BODY), { env, fetchImpl });

  assert.equal(result.provider, "deepseek");
  assert.equal(result.deployment, "ustc");
  assert.equal(result.role, "materials_research_chair");
  assert.equal(requestUrl, "https://api.llm.ustc.edu.cn/v1/chat/completions");
  assert.equal(requestOptions.headers.Authorization, "Bearer ustc-material-test-key");
  const upstreamBody = JSON.parse(requestOptions.body);
  assert.equal(upstreamBody.model, "deepseek-v4-flash");
  assert.equal(upstreamBody.max_tokens, 1400);
  assert.equal(Object.prototype.hasOwnProperty.call(upstreamBody, "max_completion_tokens"), false);
  assert.match(upstreamBody.messages[0].content, /材料研究主持模型/);
  assert.match(upstreamBody.messages[0].content, /语言模型输出不参与正式数值共识/);
  assert.match(upstreamBody.messages[1].content, /Quantum Espresso/);
});

test("USTC material prediction never falls back to the official DeepSeek key", async () => {
  await assert.rejects(
    runMaterialPrediction(normalizePayload(BODY), {
      env: {
        MATERIAL_PREDICT_ENABLED: "true",
        MATERIAL_PREDICT_PROVIDER: "deepseek",
        DEEPSEEK_CHAT_COMPLETIONS_URL: "https://api.llm.ustc.edu.cn/v1/chat/completions",
        DEEPSEEK_API_KEY: "must-not-be-sent-to-ustc"
      }
    }),
    error => error?.code === "MATERIAL_PREDICT_NOT_CONFIGURED"
  );
});

test("paid chair endpoint requires the existing authorized website session", async () => {
  const result = await handleMaterialPredictRequest({
    method: "POST",
    origin: ORIGIN,
    ip: "material-auth-test",
    body: JSON.stringify(BODY)
  }, {
    env: {
      CHAT_AUTH_REQUIRED: "true",
      CHAT_AUTH_EMAIL: "test@example.org",
      CHAT_AUTH_PASSWORD_HASH: "configured",
      CHAT_AUTH_SECRET: "configured",
      MATERIAL_PREDICT_ENABLED: "true",
      DEEPSEEK_API_KEY: "test-key"
    }
  });
  assert.equal(result.statusCode, 401);
  assert.equal(result.payload.code, "CHAT_AUTH_REQUIRED");
});

test("authorized website session can call the protected chair endpoint", async () => {
  const env = {
    CHAT_AUTH_REQUIRED: "true",
    CHAT_AUTH_EMAIL: "chair-test@example.org",
    CHAT_AUTH_PASSWORD_HASH: hashChatPassword("separate-test-password"),
    CHAT_AUTH_SECRET: "material-chair-session-secret",
    MATERIAL_PREDICT_ENABLED: "true",
    MATERIAL_PREDICT_PROVIDER: "deepseek",
    DEEPSEEK_API_KEY: "official-deepseek-test-key"
  };
  const token = signChatSession(env.CHAT_AUTH_EMAIL, env);
  const result = await handleMaterialPredictRequest({
    method: "POST",
    origin: ORIGIN,
    authorization: `Bearer ${token}`,
    ip: "material-authorized-test",
    body: JSON.stringify(BODY)
  }, {
    env,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        model: "deepseek-v4-flash",
        choices: [{ message: { content: "Protected chair response" } }]
      })
    })
  });
  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.answer, "Protected chair response");
  assert.equal(result.payload.role, "materials_research_chair");
});
