# ARPES Literature Extractor

面向 SnSe2、SnSe2 掺二茂钴、SnSeS、SnS2、SnSe、SnS 等体系的文献信息抽取小工具。

当前版本先做文章级信息抽取，输入 `.txt`、`.md`、`.xml/.tei`，可选 `.pdf`，输出 JSONL 和 CSV，方便后续人工审核、和实验站处理数据表做关联。

## 快速运行

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
