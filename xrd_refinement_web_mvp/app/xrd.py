from __future__ import annotations
import math
import re
from io import StringIO
from typing import Iterable
import numpy as np

WAVELENGTHS = {
    "CuKa": 1.54184, "CuKa1": 1.54056, "CoKa": 1.79026,
    "MoKa": 0.71073, "CrKa": 2.28970, "FeKa": 1.93735, "AgKa": 0.55942,
}


def parse_pattern(raw: bytes) -> tuple[np.ndarray, np.ndarray, dict]:
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("gb18030")
    rows: list[tuple[float, float]] = []
    rejected = 0
    for line in StringIO(text):
        line = line.strip()
        if not line or line.startswith(("#", ";", "!")):
            continue
        parts = [p for p in re.split(r"[,;\s]+", line) if p]
        if len(parts) < 2:
            rejected += 1
            continue
        try:
            x, y = float(parts[0]), float(parts[1])
            if math.isfinite(x) and math.isfinite(y):
                rows.append((x, y))
            else:
                rejected += 1
        except ValueError:
            rejected += 1
    if len(rows) < 10:
        raise ValueError("有效 XRD 数据点少于 10 个")
    arr = np.asarray(rows, dtype=float)
    order = np.argsort(arr[:, 0])
    x, y = arr[order, 0], arr[order, 1]
    unique, idx = np.unique(x, return_index=True)
    x, y = unique, y[idx]
    if len(x) < 10 or x[-1] <= x[0]:
        raise ValueError("2θ 数据范围无效")
    qc = {
        "points": int(len(x)), "rejected_rows": rejected,
        "two_theta_min": float(x[0]), "two_theta_max": float(x[-1]),
        "intensity_min": float(y.min()), "intensity_max": float(y.max()),
        "monotonic": True,
    }
    return x, y, qc


def preprocess(x: np.ndarray, y: np.ndarray) -> np.ndarray:
    y = np.asarray(y, dtype=float)
    # Robust rolling-min-like baseline without scipy dependency.
    window = max(5, min(101, len(y) // 20 * 2 + 1))
    baseline = np.array([np.percentile(y[max(0, i-window):min(len(y), i+window+1)], 10) for i in range(len(y))])
    clean = np.clip(y - baseline, 0, None)
    scale = float(clean.max())
    return clean / scale if scale > 0 else clean


def broaden(sticks_x: Iterable[float], sticks_y: Iterable[float], grid: np.ndarray, fwhm: float) -> np.ndarray:
    sigma = fwhm / 2.354820045
    result = np.zeros_like(grid, dtype=float)
    for px, py in zip(sticks_x, sticks_y):
        result += float(py) * np.exp(-0.5 * ((grid - float(px)) / sigma) ** 2)
    peak = float(result.max())
    return result / peak if peak > 0 else result


def local_peaks(x: np.ndarray, y: np.ndarray, threshold: float = 0.12, limit: int = 30) -> list[float]:
    indices = np.where((y[1:-1] > y[:-2]) & (y[1:-1] >= y[2:]) & (y[1:-1] >= threshold))[0] + 1
    ranked = indices[np.argsort(y[indices])[::-1]][:limit]
    return sorted(float(x[i]) for i in ranked)


def score(exp_x: np.ndarray, exp_y: np.ndarray, theo_y: np.ndarray, theoretical_peaks: list[float], tolerance: float) -> dict:
    denom = float(np.linalg.norm(exp_y) * np.linalg.norm(theo_y))
    cosine = float(np.dot(exp_y, theo_y) / denom) if denom else 0.0
    observed = local_peaks(exp_x, exp_y)
    coverage = (sum(any(abs(p-q) <= tolerance for q in theoretical_peaks) for p in observed) / len(observed)) if observed else 0.0
    cosine, coverage = max(0.0, min(1.0, cosine)), max(0.0, min(1.0, coverage))
    return {"cosine_similarity": cosine, "peak_coverage": coverage, "match_score": 0.7*cosine + 0.3*coverage}


def calculate_pattern(structure, radiation: str) -> tuple[list[float], list[float]]:
    try:
        from pymatgen.analysis.diffraction.xrd import XRDCalculator
    except ImportError as exc:
        raise RuntimeError("未安装 pymatgen，无法计算理论 XRD") from exc
    pattern = XRDCalculator(wavelength=WAVELENGTHS[radiation]).get_pattern(structure)
    return [float(v) for v in pattern.x], [float(v) for v in pattern.y]

