# ARPES 文献信息抽取调研与实施路线

## 1. 候选工具

| 类型 | 工具 | 适合做什么 | 注意点 |
| --- | --- | --- | --- |
| 学术 PDF 结构化 | GROBID | PDF -> TEI XML，抽标题、作者、摘要、参考文献、正文结构 | 对材料/ARPES 专有字段需要二次抽取 |
| 通用 PDF/文档解析 | Docling | PDF -> Markdown/JSON，保留版面、表格和图片线索 | 适合作为批处理入口 |
| 通用文档 ETL | Unstructured | PDF/HTML/Word 分块，接 RAG 或 LLM 抽取 | 对科学公式和复杂表格需抽样评估 |
| 化学/材料文本抽取 | ChemDataExtractor | 化学实体、性质、表格中的材料数据 | 更偏化学性质，ARPES 实验条件要扩展规则 |
| 中文/国产 PDF 解析 | MinerU / PaddleOCR / PaddleNLP | 中文论文、扫描 PDF、OCR 和版面解析 | 需要本地环境和模型权重；先用少量论文验证 |
| 论文检索/元数据 | Crossref / Semantic Scholar / OpenAlex / arXiv | DOI、题录、摘要、引用、开放 PDF 线索 | publisher PDF 下载权限另行处理 |

建议组合：`检索 API -> PDF/HTML 入库 -> GROBID/Docling/MinerU 解析 -> 本项目规则抽取 -> 人工审核 -> 与实验站处理数据关联`。

调研入口：

- GROBID: https://github.com/grobidOrg/grobid
- Docling: https://github.com/docling-project/docling
- Unstructured: https://github.com/Unstructured-IO/unstructured
- ChemDataExtractor: https://github.com/CambridgeMolecularEngineering/chemdataextractor2
- MinerU: https://github.com/opendatalab/MinerU
- PaddleOCR: https://github.com/PaddlePaddle/PaddleOCR
- PaddleNLP: https://github.com/PaddlePaddle/PaddleNLP

## 2. 第一批 ARPES 论文测试策略

优先从这些关键词组合找 2-3 篇全文可得论文：

- `SnSe angle-resolved photoemission`
- `SnSe2 ARPES`
- `SnSe2 cobaltocene CoCp2`
- `SnS2 ARPES`
- `SnSeS SnSe1-xSx photoemission`
- `SnS angle-resolved photoemission`

对每篇文章记录：

- 题名、DOI、年份、期刊、通讯作者/用户组
- 材料、掺杂/剂量/退火、样品类型、制备方式
- ARPES beamline、光子能量、温度、能量/角分辨率、分析器
- 提到的关键数据：band gap、Dirac point、valence/conduction band position、Fermi velocity、effective mass
- 图号和数据文件名，如果后续要和实验室处理数据关联

已找到的首批可试全文线索：

- SnSe: `Photoemission Study of the Electronic Structure of Valence Band Convergent SnSe`, arXiv: https://arxiv.org/abs/1804.04357
- SnSe: `Observation of non-trivial topological electronic structure of orthorhombic SnSe`, arXiv: https://arxiv.org/abs/2204.07214
- SnSe2: `Observation of quasi-steady dark excitons and gap phase in a doped semiconductor`, arXiv: https://arxiv.org/abs/2507.08419

## 3. 和 ARPES 站老师确认的问题

- 需要抓取哪些用户：PI、课题组、proposal 编号、实验站内部 user id 是否可用？
- 文章清单来源：站内成果库、DOI 列表、用户年报、Web of Science/Scopus、Google Scholar，还是 Zotero 文库？
- 需要关联到哪些实验数据：beamtime、样品编号、scan id、能量切片、处理后的 band dispersion、图像文件、拟合参数？
- 字段粒度：只要文章级摘要，还是要图/谱图级别的数据点？
- 权限边界：publisher PDF、站内原始数据、用户未发表数据是否可批处理？

## 4. 本程序当前字段

`arpext` 先抽取文章级信息：标题、DOI/arXiv、材料、掺杂、技术、光子能量、温度、beamline、分析器、样品制备、band gap、Fermi velocity 和人工审核备注。

运行示例：

```bash
cd arpes_lit_extractor
python -m arpext.cli samples --out output/arpes.jsonl --csv output/arpes.csv
```

PDF 输入需要安装 `pypdf`：

```bash
python -m pip install pypdf
```
