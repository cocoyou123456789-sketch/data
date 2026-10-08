#!/usr/bin/env python3
"""Loopback-only bridge between the EXAFS web page and native XAFS tools.

The bridge never performs a browser approximation and never accepts arbitrary
commands from HTTP.  It discovers a small executable allow-list, stages input
files in versioned job folders, and can invoke an explicitly configured native
pipeline.  Binding to a non-loopback address is intentionally rejected.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


FROZEN = bool(getattr(sys, "frozen", False))
ASSET_ROOT = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
APP_ROOT = (
    Path(os.environ.get("LOCALAPPDATA", Path.home())) / "SynchroChemAI" / "XAFSNativeBridge"
    if FROZEN else Path(__file__).resolve().parent
)
ROOT = APP_ROOT
DEFAULT_JOBS = APP_ROOT / "jobs"
CONFIG_NAME = "xafs-native.local.json"
TOOLS = ("athena", "artemis", "hephaestus", "feff", "hama")
EXECUTABLE_NAMES = {
    "athena": ("athena.exe", "dathena.exe"),
    "artemis": ("artemis.exe", "dartemis.exe"),
    "hephaestus": ("hephaestus.exe", "dhephaestus.exe"),
    "feff": ("feff8l.exe", "feff8.exe", "feff6l.exe", "feff6.exe"),
    "hama": ("hama.exe", "HAMA.exe"),
}
ENV_NAMES = {
    "athena": "XAFS_ATHENA_EXE",
    "artemis": "XAFS_ARTEMIS_EXE",
    "hephaestus": "XAFS_HEPHAESTUS_EXE",
    "feff": "XAFS_FEFF_EXE",
    "hama": "XAFS_HAMA_EXE",
}
SAFE_FILE = re.compile(r"[^A-Za-z0-9._()\-\u4e00-\u9fff]+")


def load_config(path: Path | None = None) -> dict[str, Any]:
    candidate = path or ROOT / CONFIG_NAME
    if not candidate.exists():
        return {}
    data = json.loads(candidate.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("native bridge config must be a JSON object")
    return data


def _common_roots() -> list[Path]:
    values: list[str | None] = [r"C:\Strawberry", r"C:\Demeter", r"C:\IFEFFIT", r"C:\HAMA"]
    for variable in ("ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA", "APPDATA"):
        base = os.environ.get(variable)
        if base:
            values.extend(str(Path(base) / name) for name in ("Demeter", "IFEFFIT", "HAMA", "Strawberry"))
    roots: list[Path] = []
    for value in values:
        if value:
            root = Path(value)
            if root.exists() and root not in roots:
                roots.append(root)
    return roots


def _bounded_find(root: Path, names: tuple[str, ...], max_depth: int = 5) -> Path | None:
    wanted = {name.lower() for name in names}
    try:
        for current, directories, files in os.walk(root):
            relative_depth = len(Path(current).relative_to(root).parts)
            if relative_depth >= max_depth:
                directories[:] = []
            match = next((name for name in files if name.lower() in wanted), None)
            if match:
                return Path(current) / match
    except (OSError, PermissionError, ValueError):
        return None
    return None


def discover_tools(config: dict[str, Any] | None = None) -> dict[str, dict[str, Any]]:
    config = config or {}
    configured = config.get("tools", {}) if isinstance(config.get("tools", {}), dict) else {}
    roots = _common_roots()
    found: dict[str, dict[str, Any]] = {}
    for tool in TOOLS:
        candidates: list[tuple[str, str | None]] = [
            ("config", configured.get(tool)),
            ("environment", os.environ.get(ENV_NAMES[tool])),
        ]
        for executable_name in EXECUTABLE_NAMES[tool]:
            candidates.append(("PATH", shutil.which(executable_name)))
        path: Path | None = None
        source: str | None = None
        for candidate_source, candidate in candidates:
            if candidate and Path(candidate).is_file():
                path, source = Path(candidate).resolve(), candidate_source
                break
        if path is None:
            for root in roots:
                path = _bounded_find(root, EXECUTABLE_NAMES[tool])
                if path:
                    path, source = path.resolve(), "common-path"
                    break
        found[tool] = {
            "installed": bool(path), "path": str(path) if path else None,
            "source": source, "env_override": ENV_NAMES[tool],
        }
    return found


def discover_skill(config: dict[str, Any]) -> dict[str, Any]:
    explicit = config.get("artemis_skill")
    home = Path.home()
    candidates = [
        Path(explicit) if explicit else None,
        home / ".codex" / "skills" / "artemis-xafs-fit-skill",
        home / ".agents" / "skills" / "artemis-xafs-fit-skill",
        ASSET_ROOT / "vendor" / "artemis-xafs-fit-skill-main",
        ROOT.parent / "vendor" / "artemis-xafs-fit-skill-main",
    ]
    for candidate in candidates:
        if candidate and (candidate / "scripts" / "run_demeter.ps1").is_file():
            scripts = candidate / "scripts"
            return {
                "installed": True, "path": str(candidate.resolve()),
                "runner": str((scripts / "run_demeter.ps1").resolve()),
                "first_shell": str((scripts / "demeter_first_shell_fit.pl").resolve()),
            }
    return {"installed": False, "path": None, "runner": None, "first_shell": None}


def discover_demeter_root(config: dict[str, Any], tools: dict[str, dict[str, Any]]) -> str | None:
    candidates = [config.get("demeter_root"), os.environ.get("DEMETER_BASE"), str(Path.home() / "DemeterPerl")]
    feff_path = tools.get("feff", {}).get("path")
    if feff_path:
        path = Path(feff_path).resolve()
        if len(path.parents) >= 3:
            candidates.append(str(path.parents[2]))
    for candidate in candidates:
        if candidate and (Path(candidate) / "perl" / "bin" / "perl.exe").is_file():
            return str(Path(candidate).resolve())
    return None


def standards() -> dict[str, Any]:
    return {
        "profile": "Robust automatic first-shell + Demeter audit v1",
        "preprocessing": "Athena calibration, normalization and AUTOBK; extraction E0 is distinct from fitted delta_E0",
        "automatic_ranges": {
            "kmax": "largest candidate below high-R noise threshold; Hanning dk=1; diagnostic kweight=3",
            "kmin": "scan 2.0-4.0 A^-1 with first-shell FEFF model; choose earliest stable near-minimum R-factor",
            "r": "strongest first-shell peak bounded by adjacent valley/approximately 30% peak height; exclude second shell",
        },
        "fit": {
            "space": "complex R", "kweights": [1, 2, 3],
            "known_standard": "fix crystallographic CN and refine S02",
            "unknown_sample": "fix same-edge S02 and refine justified CN/amplitude groups",
        },
        "audit": {
            "nind": "2*delta_k*delta_R/pi+2", "require": "Nvar < Nind", "prefer": "Nvar <= 2/3 Nind",
            "reject": ["negative sigma2", "unphysical CN", "unexplained boundary hit"],
            "correlation_warning": 0.90, "correlation_reparameterize": 0.95,
        },
        "wavelet": "HAMA data/model/complex-residual maps on a shared color scale; diagnostic only",
        "neural_network": "optional only when a matching absorber/domain-specific pretrained model is supplied",
        "deliverables": ["final.dpj", "k1_data_fit.csv", "k2_data_fit.csv", "k3_data_fit.csv",
                         "R1_data_fit.csv", "R2_data_fit.csv", "R3_data_fit.csv",
                         "fit_parameters.tsv", "FIT_WORKFLOW.txt"],
        "sources": ["doi:10.1021/photonsci.5c00040", "doi:10.1016/j.jcat.2025.116145"],
    }


def safe_name(name: str) -> str:
    cleaned = SAFE_FILE.sub("_", Path(name).name).strip("._")
    return cleaned[:160] or "input.dat"


def create_job(payload: dict[str, Any], jobs_root: Path) -> dict[str, Any]:
    files = payload.get("files")
    if not isinstance(files, list) or not files:
        raise ValueError("at least one input file is required")
    if len(files) > 200:
        raise ValueError("too many files")
    project = safe_name(str(payload.get("project_name") or "xafs-fit"))
    job_id = f"{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:8]}"
    job_dir = (jobs_root / f"{project}-{job_id}").resolve()
    jobs_root_resolved = jobs_root.resolve()
    if jobs_root_resolved not in job_dir.parents:
        raise ValueError("invalid job path")
    input_dir = job_dir / "inputs"
    input_dir.mkdir(parents=True, exist_ok=False)
    inventory = []
    total = 0
    for index, item in enumerate(files):
        if not isinstance(item, dict):
            raise ValueError("invalid file record")
        encoded = item.get("content_base64")
        if not isinstance(encoded, str):
            raise ValueError("missing base64 file content")
        content = base64.b64decode(encoded, validate=True)
        total += len(content)
        if total > 250 * 1024 * 1024:
            raise ValueError("job payload exceeds 250 MiB")
        name = f"{index + 1:03d}_{safe_name(str(item.get('name') or 'input.dat'))}"
        target = input_dir / name
        target.write_bytes(content)
        inventory.append({"name": name, "size": len(content), "sha256": hashlib.sha256(content).hexdigest(),
                          "role": str(item.get("role") or "input")})
    manifest = {
        "schema": "xafs-native-job/v1", "job_id": job_id, "project_name": project,
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "status": "prepared",
        "files": inventory, "options": payload.get("options", {}), "standards": standards(),
        "provenance": {"native_execution_required": True, "browser_fit_is_not_native": True},
    }
    manifest_path = job_dir / "workflow.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    (job_dir / "FIT_WORKFLOW.txt").write_text(
        "EXAFS native workflow (prepared; not yet executed)\n\n" +
        json.dumps(standards(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"job_id": job_id, "job_dir": str(job_dir), "manifest": str(manifest_path), "files": inventory}


def find_job(jobs_root: Path, job_id: str) -> Path:
    if not re.fullmatch(r"[0-9]{8}-[0-9]{6}-[0-9a-f]{8}", job_id):
        raise ValueError("invalid job id")
    matches = [path for path in jobs_root.glob(f"*-{job_id}") if path.is_dir()]
    if len(matches) != 1:
        raise FileNotFoundError("job not found")
    return matches[0].resolve()


def launch_tool(tool: str, tools: dict[str, dict[str, Any]], job_dir: Path | None = None) -> int:
    if tool not in TOOLS:
        raise ValueError("tool is not allow-listed")
    record = tools[tool]
    if not record["installed"]:
        raise FileNotFoundError(f"{tool} is not installed or configured")
    args = [record["path"]]
    if job_dir:
        inputs = job_dir / "inputs"
        extensions = {
            "athena": (".prj", ".xdi", ".dat", ".txt", ".csv", ".xmu"),
            "artemis": (".dpj", ".fpj"), "hama": (".chi", ".dat", ".txt"),
        }.get(tool, ())
        result_project = job_dir / "results" / "fit.dpj"
        chosen = result_project if tool == "artemis" and result_project.is_file() else next(
            (path for ext in extensions for path in sorted(inputs.glob(f"*{ext}"))), None
        )
        if chosen:
            args.append(str(chosen))
    process = subprocess.Popen(args, cwd=str(job_dir or ROOT), close_fds=True)
    return process.pid


class BridgeState:
    def __init__(self, config: dict[str, Any], jobs_root: Path):
        self.config, self.jobs_root = config, jobs_root
        self.tools = discover_tools(config)
        self.skill = discover_skill(config)
        self.demeter_root = discover_demeter_root(config, self.tools)
        self.lock = threading.Lock()

    def refresh(self) -> None:
        with self.lock:
            self.tools = discover_tools(self.config)
            self.skill = discover_skill(self.config)
            self.demeter_root = discover_demeter_root(self.config, self.tools)

    def status(self) -> dict[str, Any]:
        with self.lock:
            return {"service": "xafs-native-bridge", "version": 1, "native": True,
                    "tools": self.tools, "artemis_skill": self.skill,
                    "demeter_root": self.demeter_root,
                    "automation_ready": bool(self.demeter_root and self.skill.get("installed")),
                    "standards": standards()}


def _job_file(job_dir: Path, role: str) -> Path:
    manifest = json.loads((job_dir / "workflow.json").read_text(encoding="utf-8"))
    match = next((item for item in manifest["files"] if item.get("role") == role), None)
    if not match:
        raise ValueError(f"job is missing required file role: {role}")
    return job_dir / "inputs" / match["name"]


def _update_job(job_dir: Path, **updates: Any) -> None:
    manifest_path = job_dir / "workflow.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest.update(updates)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


def execute_demeter_job(state: BridgeState, job_dir: Path, payload: dict[str, Any]) -> None:
    results = job_dir / "results"
    results.mkdir(exist_ok=False)
    log_path = job_dir / "native-run.log"
    try:
        data_file, feff_file = _job_file(job_dir, "chi_k"), _job_file(job_dir, "feff_input")
        s02 = float(payload["s02"])
        if not 0 < s02 <= 1.5:
            raise ValueError("S02 must be > 0 and <= 1.5")
        path_indices = str(payload["paths"])
        groups = str(payload["sigma_groups"])
        if not re.fullmatch(r"\d+(,\d+)*", path_indices):
            raise ValueError("paths must be comma-separated zero-based FEFF indices")
        if not re.fullmatch(r"[A-Za-z0-9_-]+(,[A-Za-z0-9_-]+)*", groups):
            raise ValueError("sigma groups contain invalid characters")
        if len(path_indices.split(",")) != len(groups.split(",")):
            raise ValueError("paths and sigma groups must have the same length")
        ranges = {
            "kmin": float(payload.get("kmin", 3)), "kmax": float(payload.get("kmax", 12)),
            "rmin": float(payload.get("rmin", 1)), "rmax": float(payload.get("rmax", 2.5)),
        }
        if not (ranges["kmax"] > ranges["kmin"] and ranges["rmax"] > ranges["rmin"]):
            raise ValueError("invalid k/R range")
        powershell = shutil.which("powershell.exe") or shutil.which("powershell")
        if not powershell:
            raise FileNotFoundError("PowerShell was not found")
        command = [
            powershell, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", state.skill["runner"],
            "-Action", "run", "-DemeterRoot", state.demeter_root,
            "-Script", state.skill["first_shell"], "-RuntimeRoot", str(job_dir / "runtime"),
            "-ScriptArgs", "--data", str(data_file), "--feff", str(feff_file),
            "--out", str(results), "--s02", str(s02), "--paths", path_indices,
            "--sigma-groups", groups, "--kmin", str(ranges["kmin"]),
            "--kmax", str(ranges["kmax"]), "--rmin", str(ranges["rmin"]),
            "--rmax", str(ranges["rmax"]), "--kweights", "1,2,3",
        ]
        _update_job(job_dir, status="running", native_command="Demeter first-shell driver")
        completed = subprocess.run(command, cwd=str(job_dir), capture_output=True, text=True, timeout=3600)
        log_path.write_text(completed.stdout + "\n--- STDERR ---\n" + completed.stderr, encoding="utf-8")
        if completed.returncode:
            raise RuntimeError(f"Demeter exited with code {completed.returncode}; see native-run.log")
        audit_script = Path(state.skill["path"]) / "scripts" / "audit_fit_log.py"
        audit = subprocess.run([
            sys.executable, str(audit_script), str(results / "fit.log"),
            "--expected-s02", str(s02), "--output", str(job_dir / "audit.json"),
        ], capture_output=True, text=True, timeout=120)
        audit_payload = json.loads((job_dir / "audit.json").read_text(encoding="utf-8"))
        final_status = "review_required" if audit.returncode or audit_payload.get("flags") else "fit_complete_unreviewed"
        _update_job(job_dir, status=final_status, finished_at=time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                    results_dir=str(results), audit=audit_payload)
    except Exception as error:
        if not log_path.exists():
            log_path.write_text(str(error) + "\n", encoding="utf-8")
        _update_job(job_dir, status="failed", error=str(error), finished_at=time.strftime("%Y-%m-%dT%H:%M:%S%z"))


def finalize_job(state: BridgeState, job_dir: Path, payload: dict[str, Any]) -> dict[str, Any]:
    if payload.get("dpj_reopened") is not True or payload.get("hama_reviewed") is not True:
        raise ValueError("final delivery requires confirmed DPJ reopen and HAMA review")
    manifest = json.loads((job_dir / "workflow.json").read_text(encoding="utf-8"))
    if manifest.get("status") not in ("fit_complete_unreviewed", "review_required"):
        raise ValueError(f"job cannot be finalized from status {manifest.get('status')}")
    results, delivery = job_dir / "results", job_dir / "delivery"
    if delivery.exists():
        raise FileExistsError("delivery already exists; jobs are immutable after finalization")
    builder = Path(state.skill["path"]) / "scripts" / "build_xafs_delivery.py"
    command = [
        sys.executable, str(builder), "build", "--output", str(delivery),
        "--sample", str(manifest.get("project_name") or "XAFS data"),
        "--artemis-project", str(results / "fit.dpj"),
        "--fit-k1", str(results / "fit_k1.dat"), "--fit-k2", str(results / "fit_k2.dat"),
        "--fit-k3", str(results / "fit_k3.dat"),
    ]
    for weight in (1, 2, 3):
        for component in ("mag", "re", "im"):
            command.extend([f"--fit-r{weight}-{component}", str(results / f"fit_r{weight}_{component}.dat")])
    command.extend([
        "--parameters", str(results / "fit_parameters.tsv"),
        "--workflow-source", str(results / "FIT_WORKFLOW.txt"),
        "--project-check", "User confirmed that fit.dpj was reopened in the matching Artemis/Demeter installation",
        "--notes", "User confirmed HAMA review of data, model and complex residual with a shared color scale",
    ])
    completed = subprocess.run(command, cwd=str(job_dir), capture_output=True, text=True, timeout=300)
    (job_dir / "delivery-build.log").write_text(
        completed.stdout + "\n--- STDERR ---\n" + completed.stderr, encoding="utf-8"
    )
    if completed.returncode:
        raise RuntimeError(f"delivery builder exited with code {completed.returncode}; see delivery-build.log")
    verified = json.loads(completed.stdout.strip().splitlines()[-1])
    _update_job(job_dir, status="delivery_ready", delivery_dir=str(delivery), delivery=verified,
                finalized_at=time.strftime("%Y-%m-%dT%H:%M:%S%z"))
    return {"status": "delivery_ready", "delivery_dir": str(delivery), "verification": verified}


class Handler(BaseHTTPRequestHandler):
    server_version = "XAFSNativeBridge/1"

    def _origin_allowed(self) -> bool:
        origin = self.headers.get("Origin")
        if not origin:
            return True
        if origin in ("null", "https://water0623.github.io", "https://cocoyou123456789-sketch.github.io"):
            return True
        return bool(re.fullmatch(r"https?://(?:127\.0\.0\.1|localhost)(?::\d+)?", origin))

    def _send(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        origin = self.headers.get("Origin")
        if origin and self._origin_allowed():
            self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        if length > 350 * 1024 * 1024:
            raise ValueError("request too large")
        result = json.loads(self.rfile.read(length) or b"{}")
        if not isinstance(result, dict):
            raise ValueError("JSON body must be an object")
        return result

    @property
    def state(self) -> BridgeState:
        return self.server.state  # type: ignore[attr-defined]

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._send(204 if self._origin_allowed() else 403, {} if self._origin_allowed() else {"error": "origin denied"})

    def do_GET(self) -> None:  # noqa: N802
        if not self._origin_allowed():
            self._send(403, {"error": "origin denied"})
            return
        path = urlparse(self.path).path
        if path in ("/api/status", "/api/native-tools/status"):
            self._send(200, self.state.status())
        elif path == "/api/workflow/spec":
            self._send(200, standards())
        elif re.fullmatch(r"/api/workflow/[0-9]{8}-[0-9]{6}-[0-9a-f]{8}/status", path):
            job_id = path.split("/")[3]
            try:
                job_dir = find_job(self.state.jobs_root, job_id)
                manifest = json.loads((job_dir / "workflow.json").read_text(encoding="utf-8"))
                self._send(200, {"job_id": job_id, "job_dir": str(job_dir), "status": manifest.get("status"),
                                 "error": manifest.get("error"), "audit": manifest.get("audit"),
                                 "results_dir": manifest.get("results_dir"), "delivery_dir": manifest.get("delivery_dir")})
            except FileNotFoundError as error:
                self._send(404, {"error": str(error)})
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        if not self._origin_allowed():
            self._send(403, {"error": "origin denied"})
            return
        path = urlparse(self.path).path
        try:
            payload = self._json()
            if path == "/api/native-tools/refresh":
                self.state.refresh()
                self._send(200, self.state.status())
                return
            match = re.fullmatch(r"/api/native-tools/([a-z]+)/launch", path)
            if match:
                job_dir = find_job(self.state.jobs_root, payload["job_id"]) if payload.get("job_id") else None
                pid = launch_tool(match.group(1), self.state.tools, job_dir)
                self._send(200, {"launched": True, "tool": match.group(1), "pid": pid})
                return
            if path == "/api/workflow/prepare":
                self._send(201, create_job(payload, self.state.jobs_root))
                return
            if path == "/api/workflow/run":
                if not self.state.demeter_root:
                    self._send(409, {"error": "Demeter 0.9.26 runtime was not detected; configure demeter_root or DEMETER_BASE"})
                    return
                if not self.state.skill.get("installed"):
                    self._send(409, {"error": "artemis-xafs-fit-skill automation scripts were not detected"})
                    return
                job_dir = find_job(self.state.jobs_root, str(payload.get("job_id", "")))
                manifest = json.loads((job_dir / "workflow.json").read_text(encoding="utf-8"))
                if manifest.get("status") not in ("prepared", "failed"):
                    self._send(409, {"error": f"job cannot run from status {manifest.get('status')}"})
                    return
                worker = threading.Thread(target=execute_demeter_job, args=(self.state, job_dir, payload), daemon=True)
                worker.start()
                self._send(202, {"job_id": payload["job_id"], "status": "starting"})
                return
            if path == "/api/workflow/finalize":
                job_dir = find_job(self.state.jobs_root, str(payload.get("job_id", "")))
                self._send(200, finalize_job(self.state, job_dir, payload))
                return
            self._send(404, {"error": "not found"})
        except (ValueError, KeyError, json.JSONDecodeError) as error:
            self._send(400, {"error": str(error)})
        except FileNotFoundError as error:
            self._send(404, {"error": str(error)})
        except Exception as error:  # fail closed without leaking a traceback to the browser
            self._send(500, {"error": f"native bridge error: {error}"})

    def log_message(self, fmt: str, *args: Any) -> None:
        sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), fmt % args))


def main() -> int:
    parser = argparse.ArgumentParser(description="Loopback bridge for native Demeter/HAMA tools")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8766)
    parser.add_argument("--config", type=Path)
    parser.add_argument("--jobs", type=Path, default=DEFAULT_JOBS)
    parser.add_argument("--probe", action="store_true")
    args = parser.parse_args()
    if args.host not in ("127.0.0.1", "localhost", "::1"):
        parser.error("native GUI bridge must bind to loopback only")
    config = load_config(args.config)
    state = BridgeState(config, args.jobs.resolve())
    if args.probe:
        print(json.dumps(state.status(), ensure_ascii=False, indent=2))
        return 0
    args.jobs.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    server.state = state  # type: ignore[attr-defined]
    print(f"XAFS native bridge: http://{args.host}:{args.port}")
    print(json.dumps(state.status(), ensure_ascii=False, indent=2))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
