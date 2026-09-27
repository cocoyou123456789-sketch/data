from __future__ import annotations
from pathlib import Path
from uuid import uuid4
import json
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import ALLOWED_EXTENSIONS, MAX_POINTS, MAX_UPLOAD_BYTES, UPLOAD_DIR, ensure_dirs
from .materials import MaterialsProjectService
from .models import AnalysisRequest, RefinementRequest
from .refinement import RECIPE, capability, refine
from .storage import store
from .xrd import broaden, calculate_pattern, parse_pattern, preprocess, score

ensure_dirs()
app = FastAPI(title="XRD 智能物相识别与精修工作台", version="0.1.0")
STATIC = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=STATIC), name="static")


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(STATIC / "index.html")


@app.get("/api/v1/health")
def health():
    return {"status": "ok", "service": "xrd-refinement-workbench"}


@app.get("/api/v1/capabilities")
def capabilities():
    return {"formats": sorted(ALLOWED_EXTENSIONS), "max_upload_mb": 10, "max_points": MAX_POINTS,
            "radiations": ["CuKa", "CuKa1", "CoKa", "MoKa", "CrKa", "FeKa", "AgKa"],
            "gsas_ii": capability()}


@app.post("/api/v1/datasets", status_code=201)
async def upload_dataset(file: UploadFile = File(...)):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(415, "仅支持 .xy / .txt / .csv / .dat")
    raw = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "文件超过 10 MB")
    try:
        x, y, qc = parse_pattern(raw)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    if len(x) > MAX_POINTS:
        raise HTTPException(413, f"数据点超过 {MAX_POINTS}")
    dataset_id = str(uuid4())
    disk_name = f"{dataset_id}{suffix}"
    (UPLOAD_DIR / disk_name).write_bytes(raw)
    record = {"id": dataset_id, "filename": Path(file.filename or disk_name).name, "disk_name": disk_name,
              "x": x.tolist(), "y": y.tolist(), "qc": qc}
    store.put_dataset(dataset_id, record)
    return {k: record[k] for k in ("id", "filename", "qc")}


@app.post("/api/v1/analyses", status_code=201)
def create_analysis(request: AnalysisRequest):
    dataset = store.get_dataset(request.dataset_id)
    if not dataset:
        raise HTTPException(404, "数据集不存在或服务已重启")
    analysis_id = str(uuid4())
    job = {"id": analysis_id, "status": "running", "request": request.model_dump(), "candidates": []}
    store.put_analysis(analysis_id, job)
    try:
        exp_x = np.asarray(dataset["x"]); exp_y = preprocess(exp_x, np.asarray(dataset["y"]))
        candidates = MaterialsProjectService().search(request.elements, request.search_mode, request.max_candidates)
        results = []
        for candidate in candidates:
            sticks_x, sticks_y = calculate_pattern(candidate.pop("structure"), request.radiation)
            theory = broaden(sticks_x, sticks_y, exp_x, request.fwhm)
            metrics = score(exp_x, exp_y, theory, sticks_x, request.two_theta_tolerance)
            results.append({**candidate, **metrics, "sticks": {"two_theta": sticks_x, "intensity": sticks_y},
                            "curve": {"two_theta": exp_x.tolist(), "intensity": theory.tolist()}})
        results.sort(key=lambda row: row["match_score"], reverse=True)
        for rank, row in enumerate(results, 1): row["rank"] = rank
        job.update(status="completed", candidates=results,
                   experimental={"two_theta": exp_x.tolist(), "intensity": exp_y.tolist()})
    except Exception as exc:
        job.update(status="failed", error=str(exc))
    store.put_analysis(analysis_id, job)
    return {"id": analysis_id, "status": job["status"], "error": job.get("error")}


@app.get("/api/v1/analyses/{analysis_id}")
def get_analysis(analysis_id: str):
    job = store.get_analysis(analysis_id)
    if not job: raise HTTPException(404, "分析任务不存在")
    view = dict(job)
    view["candidates"] = [{k: v for k, v in row.items() if k not in ("curve", "sticks")} for row in job.get("candidates", [])]
    return view


@app.get("/api/v1/analyses/{analysis_id}/candidates/{candidate_id}/curve")
def get_curve(analysis_id: str, candidate_id: str):
    job = store.get_analysis(analysis_id)
    if not job: raise HTTPException(404, "分析任务不存在")
    row = next((r for r in job.get("candidates", []) if r["material_id"] == candidate_id), None)
    if not row: raise HTTPException(404, "候选结构不存在")
    return {"experimental": job["experimental"], "theoretical": row["curve"], "sticks": row["sticks"]}


@app.post("/api/v1/refinements")
def create_refinement(request: RefinementRequest):
    if not capability()["available"]:
        raise HTTPException(501, {"message": "未安装 GSAS-II，未执行伪精修", "recipe": RECIPE})
    try:
        refine(request.analysis_id, request.candidate_id, request.recipe or RECIPE)
    except NotImplementedError as exc:
        raise HTTPException(501, {"message": str(exc), "recipe": RECIPE}) from exc

