# ARPES Literature Extractor

面向 SnSe2、SnSe2 掺二茂钴、SnSeS、SnS2、SnSe、SnS 等体系的文献信息抽取小工具。

当前版本先做文章级信息抽取，输入 `.txt`、`.md`、`.xml/.tei`，可选 `.pdf`，输出 JSONL 和 CSV，方便后续人工审核、和实验站处理数据表做关联。

## 快速运行

公开静态版部署到 GitHub Pages 后的地址：

```text
https://cocoyou123456789-sketch.github.io/data/
```

说明：公开静态版不运行 Python 后端，适合所有人打开查看元素/材料搜索、文献线索和搜索源说明；Web of Science / Google Scholar 导入和单篇文本抽取仍建议使用本地 Python 版。

当前公开静态版默认展示 `Superconductivity` topic 模板，包含英文界面、周期表可点元素、灰色无数据元素、超导材料 family、Tc、ARPES 特异性质、q-dependent observables、photon-energy / polarization notes 和数据状态说明。

启动本地网页：

```bash
cd arpes_lit_extractor
PYTHONPATH=. python3 -m arpext.web
```

然后打开 `http://127.0.0.1:8767`。

网页现在有两个入口：

- 搜索材料或元素：输入 `Sn`、`Se`、`SnSe2`、`二茂钴` 等，会从 `data/articles.json` 里找相关文章数据，并生成候选材料、温度、光子能量、band gap、掺杂和文章证据对比。
- 可信元素数据：`data/elements.json` 目前收录 Sn、Se、S，来源为 Royal Society of Chemistry Periodic Table。页面会显示来源链接。
- ARPES 常用元素选择：网页会从元素库动态生成按钮，目前包括 Sn、Se、S、Bi、Te、Sb、Pb、W、Mo、Ti、Fe、Cu、O、Co、C。
- Web of Science 导入：从 WoS 导出 CSV/TSV/TXT 后，在网页中粘贴或上传。建议导出字段包含 `Article Title`、`Abstract`、`Author Keywords`、`Keywords Plus`、`Publication Year`、`DOI`、`UT (Unique WOS ID)`、`Source Title`、`Authors`。
- Google Scholar 导入：在 Scholar 结果页点击 `引用` -> `BibTeX`，复制 BibTeX 到网页导入区。网站会把题名、作者、期刊、年份、DOI/URL 解析成文献线索并参与材料搜索。
- 可用搜索源说明：网页会展示 `data/search_sources.json` 中的来源清单，包括 OpenAlex、Crossref、Semantic Scholar、arXiv、Europe PMC、Web of Science、Google Scholar、Scopus、Materials Project 和 OPTIMADE，并明确标注官方 API、导入方式、授权限制和是否适合自动接入。
- 单篇文章分析：粘贴摘要、实验记录或 PDF 转出的文本，直接抽取材料、ARPES 条件和物性参数。

文章数据表在 `data/articles.json`。当前只保留带真实链接的文献线索，并标记为 `lead_needs_fulltext_check`。后续批量抽取论文时，只有完成全文核验的数据才应写入温度、光子能量、band gap 等指标。

WoS 导入记录会保存到 `data/imported_wos_articles.json`，标记为 `wos_metadata_only`。这表示题录/摘要来自 Web of Science 导出，但实验指标仍需从全文核验。

Google Scholar BibTeX 导入记录会保存到 `data/imported_scholar_articles.json`，标记为 `google_scholar_bibtex_metadata`。Google Scholar 没有稳定的官方公开检索 API，因此本项目不直接爬取 Scholar 页面；先采用人工导出 BibTeX 的方式。

Web of Science API 也可以接入，不过 Clarivate 的 Web of Science API Expanded 需要机构 license 和 API key。没有 API key 时，推荐先用网页导出文件导入。

更多搜索源调研见 `docs/search_sources.md`。Google Scholar 只支持手动 BibTeX 导入，不做自动爬取。

命令行批处理：

```bash
cd arpes_lit_extractor
python -m arpext.cli path/to/articles --out output/arpes.jsonl --csv output/arpes.csv
```

如果直接处理 PDF：

```bash
python -m pip install pypdf
python -m arpext.cli path/to/pdfs --out output/arpes.jsonl --csv output/arpes.csv
```

## 配置材料

材料关键词在 `config/materials.json`。可以继续添加别名，比如 Unicode 下标、化学式写法、合金写法、掺杂剂名称。

## 输出字段

- `title`
- `doi`
- `arxiv_id`
- `materials`
- `dopants`
- `techniques`
- `photon_energies_eV`
- `temperatures_K`
- `beamline_snippets`
- `analyzer_snippets`
- `preparation_snippets`
- `band_gaps`
- `fermi_velocities`
- `notes`

## 下一步

1. 用 5-10 篇已知 ARPES 文章的 PDF/文本做抽样评估。
2. 接入 GROBID、Docling 或 MinerU，把 PDF 稳定转成结构化正文。
3. 按 ARPES 站老师确认的用户、proposal、beamtime、scan id 字段扩展 schema。
4. 加入 DOI/题录检索器和批量任务，把文章记录与实验室处理数据表关联。
