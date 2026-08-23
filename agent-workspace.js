(function initializeArpesResearchWorkspace() {
  "use strict";

  const PUBLIC_API = "https://arpes-materials-explorer-cocoyou.netlify.app/api/chat";
  const API = (
    window.location.hostname.includes("github.io") ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  ) ? PUBLIC_API : "/api/chat";
  const TOKEN_KEY = "arpes-ai-chat-session-v1";
  const THREAD_KEY = "arpes-research-agent-thread-v1";
  const CONTEXT_KEY = "arpes-research-agent-context-v1";
  const CLIENT_TIMEOUT_MS = 55_000;
  const MAX_MESSAGES = 14;

  const elements = {
    thread: document.querySelector("#thread"),
    composer: document.querySelector("#composer"),
    question: document.querySelector("#questionInput"),
    context: document.querySelector("#contextInput"),
    send: document.querySelector("#sendButton"),
    clear: document.querySelector("#clearButton"),
    export: document.querySelector("#exportButton"),
    session: document.querySelector("#sessionButton"),
    statusDot: document.querySelector("#statusDot"),
    statusLabel: document.querySelector("#statusLabel"),
    statusDetail: document.querySelector("#statusDetail"),
    modelLabel: document.querySelector("#modelLabel"),
    loginLayer: document.querySelector("#loginLayer"),
    loginForm: document.querySelector("#loginForm"),
    loginCancel: document.querySelector("#loginCancelButton"),
    loginButton: document.querySelector("#loginButton"),
    loginError: document.querySelector("#loginError"),
    email: document.querySelector("#emailInput"),
    password: document.querySelector("#passwordInput")
  };

  const state = {
    messages: loadMessages(),
    busy: false,
    pending: false,
    error: "",
    authenticated: false,
    email: "",
    agentReady: false,
    authRequired: true
  };

  function safeSessionGet(key) {
    try { return window.sessionStorage.getItem(key) || ""; }
    catch { return ""; }
  }

  function safeSessionSet(key, value) {
    try { window.sessionStorage.setItem(key, String(value || "")); }
    catch {}
  }

  function safeSessionRemove(key) {
    try { window.sessionStorage.removeItem(key); }
    catch {}
  }

  function loadMessages() {
    try {
      const parsed = JSON.parse(safeSessionGet(THREAD_KEY) || "[]");
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(item => ["user", "assistant"].includes(item?.role) && String(item?.content || "").trim())
        .slice(-MAX_MESSAGES)
        .map(item => ({
          role: item.role,
          content: String(item.content).slice(0, 24_000),
          createdAt: String(item.createdAt || "")
        }));
    } catch {
      return [];
    }
  }

  function saveMessages() {
    safeSessionSet(THREAD_KEY, JSON.stringify(state.messages.slice(-MAX_MESSAGES)));
  }

  function token() {
    return safeSessionGet(TOKEN_KEY);
  }

  function saveToken(value) {
    safeSessionSet(TOKEN_KEY, value);
  }

  function clearToken() {
    safeSessionRemove(TOKEN_KEY);
  }

  function uniquePostEndpoint() {
    try {
      const url = new URL(API, window.location.href);
      const requestId = window.crypto?.randomUUID?.()
        || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      url.searchParams.set("rid", requestId);
      return url.toString();
    } catch {
      return API;
    }
  }

  function timestamp(value) {
    const date = value ? new Date(value) : new Date();
    return Number.isFinite(date.getTime())
      ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "";
  }

  function appendText(parent, className, text) {
    const node = document.createElement("div");
    node.className = className;
    node.textContent = text;
    parent.append(node);
    return node;
  }

  function appendInlineMarkdown(parent, value) {
    const text = String(value || "");
    const pattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*)/g;
    let cursor = 0;
    for (const match of text.matchAll(pattern)) {
      if (match.index > cursor) parent.append(document.createTextNode(text.slice(cursor, match.index)));
      const tokenValue = match[0];
      const element = document.createElement(tokenValue.startsWith("`")
        ? "code"
        : (tokenValue.startsWith("**") || tokenValue.startsWith("__") ? "strong" : "em"));
      const trimSize = tokenValue.startsWith("**") || tokenValue.startsWith("__") ? 2 : 1;
      element.textContent = tokenValue.slice(trimSize, -trimSize);
      parent.append(element);
      cursor = match.index + tokenValue.length;
    }
    if (cursor < text.length) parent.append(document.createTextNode(text.slice(cursor)));
  }

  function tableCells(line) {
    return String(line || "").trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(cell => cell.trim());
  }

  function isTableDivider(line) {
    const cells = tableCells(line);
    return cells.length > 1 && cells.every(cell => /^:?-{3,}:?$/.test(cell));
  }

  function renderRichText(container, value) {
    const lines = String(value || "").replace(/\r\n?/g, "\n").split("\n");
    for (let index = 0; index < lines.length;) {
      const line = lines[index];
      const trimmed = line.trim();
      if (!trimmed) {
        index += 1;
        continue;
      }

      if (/^```/.test(trimmed)) {
        const code = [];
        index += 1;
        while (index < lines.length && !/^```/.test(lines[index].trim())) {
          code.push(lines[index]);
          index += 1;
        }
        if (index < lines.length) index += 1;
        const pre = document.createElement("pre");
        const codeNode = document.createElement("code");
        codeNode.textContent = code.join("\n");
        pre.append(codeNode);
        container.append(pre);
        continue;
      }

      const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
      if (headingMatch) {
        const heading = document.createElement(`h${headingMatch[1].length}`);
        appendInlineMarkdown(heading, headingMatch[2]);
        container.append(heading);
        index += 1;
        continue;
      }

      if (trimmed.includes("|") && index + 1 < lines.length && isTableDivider(lines[index + 1])) {
        const headers = tableCells(trimmed);
        const rows = [];
        index += 2;
        while (index < lines.length && lines[index].trim().includes("|")) {
          rows.push(tableCells(lines[index]));
          index += 1;
        }
        const scroll = document.createElement("div");
        scroll.className = "table-scroll";
        const table = document.createElement("table");
        const thead = document.createElement("thead");
        const headerRow = document.createElement("tr");
        headers.forEach(value => {
          const th = document.createElement("th");
          appendInlineMarkdown(th, value);
          headerRow.append(th);
        });
        thead.append(headerRow);
        table.append(thead);
        const tbody = document.createElement("tbody");
        rows.forEach(row => {
          const tr = document.createElement("tr");
          headers.forEach((_, cellIndex) => {
            const td = document.createElement("td");
            appendInlineMarkdown(td, row[cellIndex] || "");
            tr.append(td);
          });
          tbody.append(tr);
        });
        table.append(tbody);
        scroll.append(table);
        container.append(scroll);
        continue;
      }

      const listMatch = trimmed.match(/^([-*])\s+(.+)$/) || trimmed.match(/^(\d+\.)\s+(.+)$/);
      if (listMatch) {
        const ordered = /\d+\./.test(listMatch[1]);
        const list = document.createElement(ordered ? "ol" : "ul");
        while (index < lines.length) {
          const itemLine = lines[index].trim();
          const itemMatch = ordered
            ? itemLine.match(/^\d+\.\s+(.+)$/)
            : itemLine.match(/^[-*]\s+(.+)$/);
          if (!itemMatch) break;
          const item = document.createElement("li");
          appendInlineMarkdown(item, itemMatch[1]);
          list.append(item);
          index += 1;
        }
        container.append(list);
        continue;
      }

      if (trimmed.startsWith(">")) {
        const quote = document.createElement("blockquote");
        appendInlineMarkdown(quote, trimmed.replace(/^>\s?/, ""));
        container.append(quote);
        index += 1;
        continue;
      }

      const paragraphLines = [trimmed];
      index += 1;
      while (index < lines.length) {
        const next = lines[index].trim();
        if (!next || /^```|^#{1,4}\s|^[-*]\s|^\d+\.\s|^>/.test(next)) break;
        if (next.includes("|") && index + 1 < lines.length && isTableDivider(lines[index + 1])) break;
        paragraphLines.push(next);
        index += 1;
      }
      const paragraph = document.createElement("p");
      paragraphLines.forEach((paragraphLine, lineIndex) => {
        if (lineIndex) paragraph.append(document.createElement("br"));
        appendInlineMarkdown(paragraph, paragraphLine);
      });
      container.append(paragraph);
    }
  }

  function renderEmptyState() {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    const orbit = document.createElement("div");
    orbit.className = "empty-orbit";
    orbit.setAttribute("aria-hidden", "true");
    empty.append(orbit);
    const title = document.createElement("h2");
    title.textContent = "从材料问题开始";
    empty.append(title);
    const copy = document.createElement("p");
    copy.textContent = "Agent 会把网站材料目录中的证据、领域知识与推断分开说明。你可以比较材料、分析谱线特征，或设计下一步实验。";
    empty.append(copy);
    elements.thread.append(empty);
  }

  function renderMessage(message) {
    const article = document.createElement("article");
    article.className = `message ${message.role}`;

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = message.role === "assistant" ? "AI" : "YOU";
    article.append(avatar);

    const content = document.createElement("div");
    content.className = "message-content";
    appendText(content, "message-label", message.role === "assistant" ? "ARPES Research Agent" : "Researcher");
    const copy = document.createElement("div");
    copy.className = "message-copy";
    renderRichText(copy, message.content);
    content.append(copy);
    appendText(content, "message-meta", timestamp(message.createdAt));
    article.append(content);
    elements.thread.append(article);
  }

  function renderPending() {
    const article = document.createElement("article");
    article.className = "message assistant thinking";
    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = "AI";
    article.append(avatar);
    const content = document.createElement("div");
    content.className = "message-content";
    appendText(content, "message-label", "检索与分析中");
    const dots = document.createElement("div");
    dots.className = "message-copy";
    dots.setAttribute("aria-label", "Agent 正在思考");
    dots.append(document.createElement("i"), document.createElement("i"), document.createElement("i"));
    content.append(dots);
    article.append(content);
    elements.thread.append(article);
  }

  function render() {
    elements.thread.replaceChildren();
    if (!state.messages.length && !state.pending) renderEmptyState();
    state.messages.forEach(renderMessage);
    if (state.pending) renderPending();
    if (state.error) appendText(elements.thread, "error-banner", state.error);
    elements.thread.setAttribute("aria-busy", state.pending ? "true" : "false");
    elements.send.disabled = state.busy || !state.agentReady || !state.authenticated;
    elements.clear.disabled = state.busy || !state.messages.length;
    elements.export.disabled = !state.messages.length;
    requestAnimationFrame(() => {
      elements.thread.scrollTop = elements.thread.scrollHeight;
    });
  }

  function setStatus(label, detail, tone = "") {
    elements.statusLabel.textContent = label;
    elements.statusDetail.textContent = detail;
    elements.statusDot.className = `status-dot ${tone}`.trim();
  }

  function openLogin(message = "") {
    elements.loginError.textContent = message;
    elements.loginLayer.hidden = false;
    window.setTimeout(() => elements.email.focus(), 0);
  }

  function closeLogin() {
    elements.loginLayer.hidden = true;
    elements.loginError.textContent = "";
    elements.password.value = "";
  }

  function responseError(data, response) {
    const error = new Error(data?.error || `Agent endpoint HTTP ${response.status}`);
    error.code = data?.code || `HTTP_${response.status}`;
    error.status = response.status;
    return error;
  }

  async function refreshStatus() {
    setStatus("正在检查 Agent", "连接服务端并验证授权状态…");
    try {
      const headers = { Accept: "application/json" };
      if (token()) headers.Authorization = `Bearer ${token()}`;
      const response = await fetch(API, { method: "GET", headers, cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw responseError(data, response);

      const agent = data?.agents?.arpes_research_agent || {};
      const knowledge = agent.knowledge || {};
      const auth = data?.auth || {};
      state.authRequired = auth.required !== false;
      state.authenticated = auth.required === false || Boolean(auth.authenticated);
      state.email = String(auth.email || "");
      state.agentReady = agent.enabled !== false && Boolean(agent.configured);

      if (token() && auth.required && !auth.authenticated) clearToken();

      elements.modelLabel.textContent = [
        "OpenAI Agents SDK",
        agent.model || "服务器模型",
        agent.max_turns ? `最多 ${agent.max_turns} 轮` : ""
      ].filter(Boolean).join(" · ");

      if (!state.agentReady) {
        setStatus("Agent 尚未就绪", agent.configuration_error || "服务端配置不完整", "error");
      } else if (!state.authenticated) {
        setStatus("需要授权登录", "登录后才能调用研究 Agent", "warn");
      } else {
        const knowledgeLabel = knowledge.search_configured
          ? "Dropbox 知识库可用"
          : "Dropbox 知识库未配置";
        setStatus("Agent 在线", `${state.email || "授权账号"} · 材料目录工具可用 · ${knowledgeLabel}`, "online");
      }

      elements.session.textContent = state.authenticated
        ? `${state.email || "已授权"} · 注销`
        : "授权登录";
      if (!state.authenticated && state.authRequired) openLogin();
    } catch (error) {
      state.agentReady = false;
      setStatus("连接失败", error.message || String(error), "error");
    } finally {
      render();
    }
  }

  async function login(event) {
    event.preventDefault();
    elements.loginButton.disabled = true;
    elements.loginError.textContent = "";
    try {
      const response = await fetch(uniquePostEndpoint(), {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: JSON.stringify({
          action: "login",
          email: elements.email.value.trim(),
          password: elements.password.value
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.token) throw responseError(data, response);
      saveToken(data.token);
      closeLogin();
      await refreshStatus();
      elements.question.focus();
    } catch (error) {
      elements.loginError.textContent = error.message || String(error);
    } finally {
      elements.loginButton.disabled = false;
    }
  }

  function logout() {
    clearToken();
    state.authenticated = false;
    state.email = "";
    state.error = "";
    setStatus("需要授权登录", "登录后才能调用研究 Agent", "warn");
    elements.session.textContent = "授权登录";
    render();
    openLogin();
  }

  function truncationNotice(data = {}) {
    if (!data.truncated && data.finish_reason !== "length") return "";
    if (data.truncation_reason === "server_output_limit") {
      return "\n\n[回答超过网站响应安全上限，未完整显示]";
    }
    return "\n\n[回答达到模型输出上限，已截断；可以缩小问题范围后继续提问]";
  }

  async function sendQuestion(event) {
    event.preventDefault();
    const question = elements.question.value.trim();
    if (!question || state.busy) return;
    if (!state.authenticated) {
      openLogin("请先登录授权账号。");
      return;
    }

    const previousMessages = state.messages.slice(-12);
    state.messages.push({ role: "user", content: question, createdAt: new Date().toISOString() });
    state.messages = state.messages.slice(-MAX_MESSAGES);
    state.busy = true;
    state.pending = true;
    state.error = "";
    elements.question.value = "";
    saveMessages();
    render();

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
    try {
      const contextText = elements.context.value.trim();
      if (contextText) safeSessionSet(CONTEXT_KEY, contextText);
      else safeSessionRemove(CONTEXT_KEY);

      const response = await fetch(uniquePostEndpoint(), {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        signal: controller.signal,
        body: JSON.stringify({
          provider: "openai",
          mode: "arpes_research_agent",
          question,
          messages: [...previousMessages, { role: "user", content: question }],
          context: {
            lang: "zh",
            surface: "standalone_agent",
            research_context: contextText
          },
          session_token: token()
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw responseError(data, response);
      const answer = String(data.answer || "").trim();
      if (!answer) {
        const error = new Error("Agent 返回了空回答。");
        error.code = "EMPTY_RESPONSE";
        throw error;
      }
      state.messages.push({
        role: "assistant",
        content: `${answer}${truncationNotice(data)}`,
        createdAt: new Date().toISOString()
      });
      state.messages = state.messages.slice(-MAX_MESSAGES);
      setStatus("Agent 在线", `${state.email || "授权账号"} · 上次请求成功`, "online");
      saveMessages();
    } catch (error) {
      if (error?.name === "AbortError") {
        state.error = `Agent 请求超过 ${Math.round(CLIENT_TIMEOUT_MS / 1000)} 秒，已停止等待。系统没有自动重试，避免重复计费。`;
      } else {
        state.error = `${error?.code ? `${error.code} · ` : ""}${error.message || String(error)}`;
      }
      if (error?.status === 401 || error?.code === "CHAT_AUTH_REQUIRED") {
        clearToken();
        state.authenticated = false;
        openLogin("授权已过期，请重新登录。");
      }
    } finally {
      window.clearTimeout(timeout);
      state.busy = false;
      state.pending = false;
      render();
      elements.question.focus();
    }
  }

  function newThread() {
    if (state.busy) return;
    state.messages = [];
    state.error = "";
    safeSessionRemove(THREAD_KEY);
    render();
    elements.question.focus();
  }

  function exportThread() {
    if (!state.messages.length) return;
    const transcript = [
      "# ARPES Research Agent 会话",
      "",
      `导出时间：${new Date().toLocaleString()}`,
      "",
      ...state.messages.flatMap(message => [
        `## ${message.role === "assistant" ? "ARPES Research Agent" : "Researcher"}`,
        "",
        message.content,
        ""
      ])
    ].join("\n");
    const blob = new Blob([transcript], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `arpes-agent-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  document.querySelectorAll("[data-prompt]").forEach(button => {
    button.addEventListener("click", () => {
      elements.question.value = button.dataset.prompt || "";
      elements.question.focus();
    });
  });

  elements.composer.addEventListener("submit", sendQuestion);
  elements.loginForm.addEventListener("submit", login);
  elements.clear.addEventListener("click", newThread);
  elements.export.addEventListener("click", exportThread);
  elements.loginCancel.addEventListener("click", closeLogin);
  elements.session.addEventListener("click", () => {
    if (state.authenticated) logout();
    else openLogin();
  });
  elements.question.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      elements.composer.requestSubmit();
    }
  });
  elements.context.value = safeSessionGet(CONTEXT_KEY);
  elements.context.addEventListener("change", () => safeSessionSet(CONTEXT_KEY, elements.context.value.trim()));

  render();
  refreshStatus();
})();
