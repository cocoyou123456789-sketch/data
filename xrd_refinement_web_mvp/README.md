# XRD 智能物相识别与精修工作台 MVP

同源 FastAPI 科研网页工具：上传实验 XRD，按元素从 Materials Project 检索结构，用 pymatgen 计算理论 XRD，进行 Gaussian 展宽、谱图叠加与候选排序。API Key 仅在服务端环境变量中使用。

## 安装与运行（Windows）

```powershell
cd xrd_refinement_web_mvp
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
Copy-Item .env.example .env
# 编辑 .env，填入 Materials Project API Key
.\run_xrd_workbench.ps1
```

浏览器打开 `http://127.0.0.1:8000`。默认只监听本机，不开放 CORS。现有门户入口可直接链接该地址，无需用户再次输入 URL。

安装完成后也可以直接双击 `start_xrd_workbench.cmd`。启动器会等待健康检查通过，再自动打开工作台；请保持启动器窗口运行。网页本身受浏览器安全策略限制，不能替用户直接启动本机 Python 进程。

## 工作流

1. 上传 `.xy/.txt/.csv/.dat`（两列为 2θ 与强度；允许空格、制表符、逗号或分号分隔）。
2. 输入元素，选择“严格化学体系”或“包含元素”。
3. 服务端 MPRester 检索候选，pymatgen `XRDCalculator` 按选定波长生成棒图。
4. 实验谱扣除稳健局部基线并归一化；理论棒图按 FWHM Gaussian 展宽。
5. `Match Score = 0.7 × Cosine similarity + 0.3 × 实验主峰覆盖率`，由高到低排名。

`strict` 会要求候选元素集合与输入集合完全一致；`include` 要求候选包含输入元素，可能返回更多元素组成的材料。

## GSAS-II 边界

`GET /api/v1/capabilities` 会真实检查 `GSASIIscriptable`。未安装时 `POST /api/v1/refinements` 返回 HTTP 501，不会把曲线匹配包装成“精修”。预留 recipe：

`Scale → Background → Zero → Lattice → Profile → Phase fraction`

即使检测到 GSAS-II，本 MVP 仍以 501 明确告知项目创建与逐级参数释放尚未接通。

GSAS-II 不是普通的 PyPI 依赖；请按照 `requirements-gsasii.txt` 中的官方安装说明配置。当前版本只提供诚实的能力检测与接口骨架，不会生成伪 Rietveld 结果。

## API

- `GET /api/v1/health`
- `GET /api/v1/capabilities`
- `POST /api/v1/datasets`（multipart 字段 `file`）
- `POST /api/v1/analyses`
- `GET /api/v1/analyses/{id}`
- `GET /api/v1/analyses/{id}/candidates/{mp-id}/curve`
- `POST /api/v1/refinements`

安全限制：10 MB、最多 250,000 点、扩展名白名单、UUID 磁盘名、原始文件名去路径、API Key 不进入响应。当前任务数据保存在进程内存，服务重启后需重新上传。

## 测试

```powershell
.venv\Scripts\python -m pytest -q
```

Materials Project 和理论谱计算在测试中 mock，不需要联网或 API Key。
