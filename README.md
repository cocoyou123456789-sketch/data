# ARPES Superconductivity Explorer

这是一个面向 ARPES / 超导材料文献数据整理的静态网站和本地抽取工具。目标是让用户可以搜索材料、元素、关键词和文章来源，快速看到论文中的材料信息、ARPES 图、Tc、q-dependent 现象、光源/地区和可追溯的数据链接。

公开网站：

```text
https://cocoyou123456789-sketch.github.io/data/?v=20260827-4
```

同步辐射材料化学知识库：

```text
https://cocoyou123456789-sketch.github.io/data/chemistry.html?v=20260827-4
```

## 当前内容

- `github-pages/`：可发布到 GitHub Pages 的静态网站。
- `arpes_lit_extractor/`：本地 Python 文献信息抽取工具。
- `github-pages/data/articles.json`：精选/手动导入文章和图表数据，目前包含 28 篇文章记录，其中包含 WoS indexed / publisher DOI 记录和 20 张可直连显示的真实论文图。
- `github-pages/data/free_arpes_articles.json`：由免费官方/开放 API 导入的 ARPES 题录数据，目前包含 80 条记录，当前由 OpenAlex、arXiv 和 Crossref 生成；这些记录只作为元数据索引，实验数值和图表仍需全文核验。
- `github-pages/data/superconductivity.json`：超导主题材料模板，目前包含 15 条材料记录。
- `github-pages/data/search_sources.json`：学术搜索源和数据库清单，目前包含 15 个来源。
- `github-pages/data/elements.json`：元素基础数据。

## 网站功能

- 材料/元素搜索：支持 FeSe、Bi2212、BaK122、MgB2、Sn、Se、Cu 等关键词。
- 关键词搜索：页面会从文章的 `keywords`、材料、元素和技术字段生成关键词按钮，点击后自动筛选材料、文章和论文图。
- 论文图表对比：展示可核验直连的真实论文图，并按 Fermi surface、Band structure、Gap map、Charge order 等类型统一配色。
- 统一图像背景：论文图统一放在白色 figure matte 里，避免透明 PNG 在深色网页里变黑。
- WoS / 出版社记录：文章库包含 DOI 校验过的 WoS indexed / publisher metadata 记录。没有直连图源的记录只进入 Article Data，不混入图表画廊。
- 免费 ARPES API 导入：可运行 `scripts/import_free_arpes.py` 从 OpenAlex、arXiv 和 Crossref 导入免费题录，网站会自动合并 `free_arpes_articles.json`。
- Web of Science 导入：支持粘贴 WoS CSV/TSV 导出内容。
- Google Scholar 导入：支持手动粘贴 Scholar BibTeX。由于 Scholar 没有稳定官方公开 API，本项目不做自动爬取。
- HDF5 数据管理：可上传 `.h5/.hdf5`，解析数据集结构，并把个人数据保存在浏览器本地 IndexedDB。
- 中英文切换：界面支持中文或英文模式，避免中英混排。

## 本地预览

静态网站可以直接用 Python 起一个本地服务器：

```bash
cd github-pages
python3 -m http.server 8771
```

然后打开：

```text
http://127.0.0.1:8771/
```

也可以直接打开：

```text
file:///Users/cocoyou/data/github-pages/index.html
```

页面在 `file://` 模式下会从 GitHub Pages fallback 读取 JSON 数据；开发时仍推荐使用本地服务器。

## 发布 GitHub Pages

本仓库的主分支保存完整项目，`gh-pages` 分支保存 `github-pages/` 目录的静态发布内容。
材料目录主页保留在 GitHub Pages，以保证“材料目录 ↔ 独立材料模块”往返导航始终同源。
需要服务器端 AI 接口的独立页面仍可按页面配置使用 Netlify API；静态材料目录不会自动跳转到旧的 Netlify 副本。

发布命令：

```bash
git subtree split --prefix github-pages -b codex-gh-pages-deploy
git push origin codex-gh-pages-deploy:gh-pages
```

如果本地已有旧的临时分支：

```bash
git branch -D codex-gh-pages-deploy
```

## 科大 DeepSeek API

网站只调用服务器端 `/api/chat` 代理。科大 API Key、火山方舟 API Key、科大账号和密码不得写入
`github-pages/`、浏览器存储或 Git；公开网页无法直接安全保存任何 API Key。

Netlify 或 Vercel 环境变量：

```text
DEEPSEEK_CHAT_COMPLETIONS_URL=https://api.llm.ustc.edu.cn/v1/chat/completions
DEEPSEEK_CHAT_MODEL=deepseek-v4-flash
USTC_LLM_API_KEY=<从 llm.ustc.edu.cn 控制台生成的测试 Key>
DEEPSEEK_CHAT_ENABLED=true
CHAT_MAX_OUTPUT_TOKENS=1600
OPENAI_API_KEY=<OpenAI 项目 API Key>
OPENAI_CHAT_MAX_OUTPUT_TOKENS=1800
OPENAI_AGENT_ENABLED=true
OPENAI_AGENT_MODEL=gpt-5.6-luna
OPENAI_AGENT_MAX_TURNS=3
OPENAI_AGENT_MAX_OUTPUT_TOKENS=1200
OPENAI_AGENT_TIMEOUT_MS=45000
OPENAI_AGENT_RATE_PER_MINUTE=4
DROPBOX_KNOWLEDGE_ENABLED=true
DROPBOX_DATA_FOLDER=/ARPES-Agent-Data
DROPBOX_APP_KEY=<Dropbox App key>
DROPBOX_APP_SECRET=<Dropbox App secret>
DROPBOX_REFRESH_TOKEN=<Dropbox OAuth offline refresh token>
OPENAI_DROPBOX_VECTOR_STORE_NAME=arpes-dropbox-knowledge
DROPBOX_SYNC_MAX_CHANGES=4
DROPBOX_MAX_FILE_BYTES=8388608
DROPBOX_ZIP_MAX_FILES=50
DROPBOX_ZIP_MAX_ENTRY_BYTES=8388608
DROPBOX_ZIP_MAX_UNCOMPRESSED_BYTES=20971520
DEEPSEEK_CHAT_MAX_OUTPUT_TOKENS=1800
CHAT_TIMEOUT_MS=45000
OPENAI_CHAT_TIMEOUT_MS=45000
DEEPSEEK_CHAT_TIMEOUT_MS=45000
CHAT_DEFAULT_PROVIDER=deepseek
CHAT_AUTH_REQUIRED=true
MATERIAL_PREDICT_PROVIDER=deepseek
MATERIAL_PREDICT_MODEL=deepseek-v4-flash
MATERIAL_PREDICT_ENABLED=true
ARK_CHAT_ENABLED=true
ARK_API_KEY=<火山方舟控制台生成的裸推理 API Key>
ARK_CHAT_MODEL=doubao-seed-2-1-pro-260628
ARK_CHAT_THINKING=disabled
ARK_CHAT_TIMEOUT_MS=50000
ARK_CHAT_MAX_OUTPUT_TOKENS=800
# 可选：材料主持模型单独走 Ark
# MATERIAL_PREDICT_PROVIDER=ark
# MATERIAL_PREDICT_MODEL=<同上，或单独的 Ark Model ID / Endpoint ID>
```

`USTC_LLM_API_KEY` 与官方 `DEEPSEEK_API_KEY` 强制分离，避免更换上游地址时把一个平台的
密钥误发给另一个平台。科大部署默认只发送标准 OpenAI 兼容字段；模型名称以科大控制台
`GET /v1/models` 可访问结果为准。

Doubao Ark 同样通过服务器端代理接入。`ARK_CHAT_MODEL` 可填写已开通服务的 Model ID
（例如 `doubao-seed-2-1-pro-260628`）或 Endpoint ID（`ep-...`）。`ARK_API_KEY` 必须是
方舟控制台生成的裸推理 API Key；不要添加 `Bearer ` 前缀或引号，也不要填写 Access Key、
Secret Key（AK/SK）。当前测试与非流式调用应保持 `ARK_CHAT_THINKING=disabled`。需要长时间
深度思考时，应改用支持流式长连接的后端后再设为 `enabled`；本代理的 `ARK_CHAT_TIMEOUT_MS`
（单位毫秒）硬上限为 50000，不适合长推理任务。默认上游地址为
`https://ark.cn-beijing.volces.com/api/v3/chat/completions`；如需私有网关，可改
`ARK_CHAT_BASE_URL` 或 `ARK_CHAT_COMPLETIONS_URL`，但主机仍会经过白名单校验。

三家聊天代理都会在服务器端限制输出 token：OpenAI 与 DeepSeek 的安全默认值为 1800。
Ark 当前使用非流式 JSON 响应，为确保能在 50 秒截止时间内返回，安全上限固定为 800；即使
Netlify 中仍残留 `ARK_CHAT_MAX_OUTPUT_TOKENS=1400`，服务器也会自动压到 800。
`CHAT_MAX_OUTPUT_TOKENS` 是通用回退值，各家的 `*_CHAT_MAX_OUTPUT_TOKENS` 优先。需要更长的豆包回答时，
应分段继续提问或另接端到端 SSE 流式网关；只调高 token 上限会重新造成 HTTP 504。

成功响应会统一返回 `finish_reason`、`truncated` 和 `truncation_reason`。DeepSeek/Ark 的
`finish_reason: "length"`，以及 OpenAI Responses 的 `status: "incomplete"` 配合
`incomplete_details.reason: "max_tokens"`/`"max_output_tokens"`，都会标准化为
`finish_reason: "length"`、`truncated: true`、`truncation_reason: "max_output_tokens"`。
服务器另有 24000 字符的最终响应安全上限；如果触及该上限，会保留上游停止原因，并返回
`truncated: true`、`truncation_reason: "server_output_limit"`，前端应明确提示回答未完整显示。

GitHub Pages 默认跳转到 Netlify 同源站。显式使用 `?stay_on_github=1` 留在镜像时，跨域模型请求
仍使用 CORS simple POST：`Content-Type` 为 `text/plain`，短期登录会话令牌只放在 HTTPS JSON
请求体的 `session_token` 字段中。服务器完成来源校验与会话验证后会立即删除该字段，绝不会把它
转发给 OpenAI、DeepSeek 或 Ark。API Key 始终只存在于服务器环境变量中。

## ARPES 研究 Agent

网页聊天模型选择器中的“ARPES 研究 Agent”使用服务器端 OpenAI Agents SDK。第一版保持单 Agent、
单个只读工具：Agent 可以查询仓库内的超导和二维材料目录，再组织答案、区分本地证据与推断，并给出
可执行的 ARPES 或文献核验步骤。它不会自动调用 Doubao/DeepSeek，不执行上传、部署、购买或数据库
写入，也不会把 API Key 发送到浏览器。

安装服务器依赖：

```bash
npm install
```

Agent 仍通过 `/api/chat`，并复用现有来源白名单、登录会话、请求限流和输出截断。浏览器只会在选择
“ARPES 研究 Agent”时发送 `mode: "arpes_research_agent"`；普通 ChatGPT、DeepSeek 和 Doubao 路径
保持不变。Agent 必须显式设置 `OPENAI_AGENT_ENABLED=true`，且必须开启并配置现有授权登录。
`OPENAI_AGENT_MAX_TURNS` 被限制在 1–4，默认 3；`OPENAI_AGENT_MAX_OUTPUT_TOKENS` 限制每次模型输出，
默认 1200；`OPENAI_AGENT_RATE_PER_MINUTE` 默认 4，用于控制 Agent 循环带来的额外调用与费用。

独立研究工作台位于 `/agent.html`。它与主站共享同一个 `sessionStorage` 授权 token 和 `/api/chat`
后端，但提供专门的研究会话界面、可选实验背景、快捷研究问题、会话暂存和 Markdown 导出。GitHub Pages
镜像会先通过 `netlify-handoff.js` 跳转到同源 Netlify 页面，避免长时间 Agent 请求经过跨域连接。
正式工作台右上角提供无需登录的公开 Demo 入口；Demo 只使用浏览器内材料目录，不调用付费模型。

OpenAI 官方建议从一个聚焦 Agent 开始，再逐步增加工具与专业 Agent：
https://developers.openai.com/api/docs/guides/agents/quickstart

### SQL 材料查询

正式 Agent 新增只读工具 `query_material_database`。例如可提问：
“从网站目录找出 Tc 大于 30 K 的含铜材料，按 Tc 从高到低排序，并注明数据来源”。
模型仅传递关键词、材料族、元素、主题、Tc 比较条件和排序；服务端用参数化 SQLite 查询执行。
支持 `gt/gte/lt/lte/eq`，因此大于与大于等于不会混淆。单次最多返回 12 条，并返回总匹配数和截断标记。

当前 SQLite 是从两份版本化 JSON 材料目录创建的服务端内存快照，由 `sql.js` 的单文件兼容构建运行，
不需要新数据库账号，也不改变现有 Node 20+ 运行环境。初始化后开启 `PRAGMA query_only`；不向模型
或网页开放任意 SQL、写入、文件路径、数据库连接或管理凭证。仍通过现有 `/api/chat` 登录、来源限制和限流。

这不是新的实测数据库：未知 Tc 保留为 NULL，种子数据的 `verification_status`、Tc 说明与来源文件
会随结果返回；ARPES 特征描述不能证明已完成测量。当前不解析 Dropbox 文档进入 SQL，不存储新的
实验记录，也不向无登录 Demo 开放付费 Agent。Dropbox 仍走独立的文档检索路径。需要多人持续写入
实验数据时，再接入持久化数据库，而不是在临时函数磁盘中保存数据。

工具接入方式参考 [OpenAI 工具文档](https://developers.openai.com/api/docs/guides/tools)，
SQLite 实现参考 [sql.js 官方文档](https://github.com/sql-js/sql.js)。

### Dropbox 自动知识库

生产 Agent 可以把 Dropbox 中的文件同步为 OpenAI 向量知识库。这个过程属于 RAG（检索增强生成）：
文件新增或修改后，Agent 会在回答时检索相关片段；它不会反复修改模型权重，也不是传统意义上的
模型训练或微调。

默认流程：

1. 在 Dropbox App Console 创建 scoped app。建议选择 App Folder 权限，只允许访问该 App 的专用目录。
2. 开启 `files.metadata.read` 与 `files.content.read`，用 OAuth offline access 获取 refresh token。
3. 在 Dropbox 的 App Folder 内创建 `ARPES-Agent-Data`，放入 `.pdf`、`.docx`、`.pptx`、`.txt`、
   `.md`、`.csv`、`.json` 或 `.zip` 文件。
4. 在 Netlify 设置上方的 `DROPBOX_*` 环境变量并重新部署。
5. 部署后 `dropbox-sync` Scheduled Function 每小时运行一次；第一次可在 Netlify Functions 页面选择
   `dropbox-sync` 并点击 **Run now**。

同步函数只读取 Dropbox 文件，密钥仅保存在 Netlify 环境变量中。单次默认最多处理 4 个变更、单文件
最多 8 MiB，以适应 Scheduled Function 的执行时间；积压文件会在后续小时继续处理。Agent 侧新增的
`search_dropbox_knowledge` 工具是只读检索，返回文件名、相关片段和匹配分数。Dropbox 文件内容始终按
不可信参考数据处理，不能覆盖 Agent 的系统规则。

ZIP 文件会在 Netlify 内存中逐项解压，原始压缩包不会直接交给模型。默认最多读取 50 个文件，单个
解压条目最多 8 MiB，整个 ZIP 解压后最多 20 MiB；只导入上述支持的文档类型。系统拒绝绝对路径、
`../` 路径与加密 ZIP，并忽略嵌套 ZIP 和其他二进制文件。若 ZIP 同步中途失败，下次定时任务会重新
处理，直到最后一个知识库条目标记为完整。

如果已经手工创建 OpenAI vector store，可额外设置 `OPENAI_VECTOR_STORE_ID=vs_...`；否则同步函数会按
`OPENAI_DROPBOX_VECTOR_STORE_NAME` 查找或创建同名知识库。长期自动同步应使用 refresh token；
`DROPBOX_ACCESS_TOKEN` 仅保留给短期测试。

Dropbox OAuth 与文件接口参考：
https://developers.dropbox.com/oauth-guide

OpenAI Responses API 的 file search / vector store 参考：
https://developers.openai.com/api/reference/typescript/resources/beta/subresources/responses/methods/create

公开站点必须保留服务器端登录、来源白名单和限流。网站测试账号应使用独立密码，不能复用
科大统一身份认证密码。部署前可运行：

```bash
USTC_LLM_API_KEY=... node scripts/test_ustc_llm_live.js
node scripts/test_chat_proxy.js
```

`/api/material-predict` 是“材料研究主持模型”接口：它接收本地筛选结果和外圈模型报告，
区分已返回结果与未运行任务，归纳一致点、分歧、证据缺口和下一轮验证。接口复用网站的
授权会话；访客只得到本地确定性筛选，不会消耗科大或其他付费模型额度。语言模型的归纳
不进入正式数值共识，正式结果仍要求独立、可追溯且条件可比的计算或实验记录。

## 文献数据原则

- 只有可直接显示且来源明确的论文图，才写入 `figures` 并进入图表画廊。
- WoS / Crossref / publisher DOI 记录可以作为文章索引进入 Article Data，但如果没有直连图源，`figures` 保持空数组。
- OpenAlex / arXiv / Crossref 免费导入记录标记为 `free_api_metadata_needs_fulltext`；它们是官方题录/摘要/DOI/开放链接，不自动等同于已核验实验数据。
- 代表性 seed 数据可以用于界面模板和演示，但实验指标用于正式分析前需要全文核验。
- Google Scholar 只作为人工 BibTeX 导入来源，不自动爬取。

## 免费 ARPES 文献导入

先安装任何额外依赖都不需要，脚本只使用 Python 标准库。建议提供联系邮箱给 OpenAlex polite pool：

```bash
OPENALEX_EMAIL=you@example.com python3 scripts/import_free_arpes.py --per-query 8 --max-records 120
```

常用参数：

```bash
python3 scripts/import_free_arpes.py --query "ARPES FeSe superconductivity" --query "ARPES cuprate superconducting gap"
python3 scripts/import_free_arpes.py --skip-crossref
```

脚本输出：

```text
github-pages/data/free_arpes_articles.json
```

网站打开时会自动读取 `articles.json` 和 `free_arpes_articles.json`，按 DOI 或标题/年份去重后显示在 Article Data 中。

## 本地抽取工具

本地工具位于：

```text
arpes_lit_extractor/
```

启动本地 Python 网页：

```bash
cd arpes_lit_extractor
PYTHONPATH=. python3 -m arpext.web
```

命令行批处理：

```bash
cd arpes_lit_extractor
python -m arpext.cli path/to/articles --out output/arpes.jsonl --csv output/arpes.csv
```

更多说明见：

```text
arpes_lit_extractor/README.md
```

## 下一步

- 继续补充 WoS / Crossref / publisher DOI 校验过的文章记录。
- 为更多文章补充可公开直连的图源或补充材料链接。
- 与实验室 ARPES 站确认需要关联的用户、proposal、beamtime、scan id 和处理数据字段。
- 将文章 metadata、论文图和实验站处理数据关联成可批量检索的数据表。
