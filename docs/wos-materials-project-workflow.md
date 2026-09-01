# Web of Science 手动导出 + Materials Project API

这条流水线把 Web of Science 题录作为“论文与材料线索”，再用 Materials Project 官方 API 补充标准化计算性质。两类数据通过材料化学式关联，并保留 DOI、WoS UID、Materials Project ID 和来源状态。

## 1. 从 Web of Science 导出

在 Web of Science 完成检索后，导出制表符分隔的 `savedrecs.txt`。建议至少包含：

- Article Title (`TI`)
- Abstract (`AB`)
- Author Keywords (`DE`)
- Keywords Plus (`ID`)
- Publication Year (`PY`)
- DOI (`DI`)
- UT / Unique Web of Science ID (`UT`)
- Source Title (`SO`)
- Authors (`AU`)
- Times Cited (`TC`)

将文件放入 `inputs/wos/`。该目录已加入 `.gitignore`，避免把受许可约束的原始导出文件意外提交到公开仓库。

## 2. 生成 WoS 文章数据库

在项目根目录运行：

```powershell
node scripts/build_shared_articles_from_wos.mjs inputs/wos/savedrecs.txt
```

可以一次处理多个导出文件：

```powershell
node scripts/build_shared_articles_from_wos.mjs inputs/wos/savedrecs1.txt inputs/wos/savedrecs2.txt
```

默认输出为 `github-pages/data/shared_articles.json`。程序使用 DOI、WoS UID 或题名/年份去重。

## 3. 先检查材料化学式

此步骤不访问网络，也不需要 API Key：

```powershell
node scripts/enrich_materials_project.mjs --dry-run --limit 30
```

输出会列出可查询化学式、关联论文数和未能标准化的材料名称。固溶体、非化学计量式和包含变量 `x/y/δ` 的表达式会被跳过，需要人工确定具体组成后再查询。

## 4. 配置 Materials Project API Key

在 Materials Project 账户页面获取 API Key。只在当前 PowerShell 会话设置环境变量：

```powershell
$env:MP_API_KEY="你的 Materials Project API Key"
```

不要把真实 Key 写进 HTML、JavaScript、`.env` 或 GitHub 提交。

## 5. 小批量试运行

建议先查询少量明确化学式：

```powershell
node scripts/enrich_materials_project.mjs --formula MoS2 --formula FeSe --only-explicit
```

确认结果后，再批量处理前 50 个候选：

```powershell
node scripts/enrich_materials_project.mjs --limit 50
```

最终处理全部候选：

```powershell
node scripts/enrich_materials_project.mjs
```

查询结果会缓存在 `outputs/materials_project_summary_cache.json`，中断后重新运行会从缓存继续。需要重新请求时加入 `--refresh`。

## 6. 输出数据库

默认生成 `github-pages/data/materials_properties.json`，包含：

- `materials`：MP ID、化学式、元素、结构、空间群、带隙、稳定性、密度、体积、磁性、DOS/能带可用状态。
- `publications`：WoS UID、DOI、题名、期刊、年份和来源状态。
- `material_publication_links`：材料与论文之间的可追溯关联。
- `properties`：数值、单位、计算来源和核验状态。

同一化学式可能对应多个晶型，因此数据库保留所有 Materials Project ID，不会只按化学式强行合并。

## 在线关键词检索

`01 材料基础知识库`中已经接入 `Web of Science × Materials Project` 检索面板。在线流程为：

1. 用户在网页输入 WoS 主题关键词。
2. `/api/materials-search` 使用 WoS Starter API 获取题名、DOI、WoS UID、关键词等题录。
3. 后端从题录识别确定化学式。
4. 后端使用 Materials Project API 查询所有匹配晶型。
5. 网页显示带隙、金属性、稳定性、凸包能、密度、空间群、结构、DOS/能带可用状态和关联论文。

在 Vercel 或 Netlify 的项目环境变量中配置：

```text
WOS_API_KEY=Clarivate Web of Science Starter API Key
MP_API_KEY=Materials Project API Key
```

可选配置额外允许的网页来源：

```text
MATERIALS_SEARCH_ALLOWED_ORIGINS=https://你的其他域名
```

Vercel 使用 `/api/materials-search`；Netlify 使用 `/api/materials-search` 或 `/.netlify/functions/materials-search`。GitHub Pages 本身不能安全保存密钥，因此必须调用已经配置这两个环境变量的 Vercel/Netlify 后端。

## 数据边界

- WoS 导出提供题录和摘要线索，不等于已经核验论文全文中的实验数值。
- Materials Project 性质主要来自计算；带隙等数值不能在不注明方法的情况下替代实验结果。
- 完整 DOS 曲线体积较大，本流水线先保存 DOS 是否可用；需要查看曲线时应按 MP ID 按需获取。
- 实验温度、压力、样品形态和测量方法必须保留在独立性质记录中，不能和零温 DFT 结果混为一列。

## 清除当前终端中的密钥

处理完成后运行：

```powershell
Remove-Item Env:MP_API_KEY
```
