#!/usr/bin/env python3
"""Audit a Demeter/Artemis fit log for common physical/statistical failures."""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
import re


NUMBER = r"[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][-+]?\d+)?"


def scalar(text: str, label: str):
    m = re.search(rf"(?mi)^\s*{re.escape(label)}\s*:\s*({NUMBER})", text)
    return float(m.group(1)) if m else None


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("log", type=Path)
    p.add_argument("--expected-s02", type=float)
    p.add_argument("--s02-tolerance", type=float, default=1e-6)
    p.add_argument("--max-correlation", type=float, default=0.95)
    p.add_argument("--max-abs-delr", type=float, default=0.20)
    p.add_argument("--max-abs-e0", type=float, default=20.0)
    p.add_argument("--analysis-role", choices=("standard", "unknown"), default="unknown")
    p.add_argument("--constraint-profile", choices=("paper-metal", "professional-general"), default="paper-metal")
    p.add_argument("--output", type=Path)
    args = p.parse_args()

    text = args.log.read_text(encoding="utf-8", errors="replace")
    result = {
        "log": str(args.log.resolve()),
        "nind": scalar(text, "Independent points"),
        "nvar": scalar(text, "Number of variables"),
        "r_factor": scalar(text, "R-factor"),
        "chi_square": scalar(text, "Chi-square"),
        "reduced_chi_square": scalar(text, "Reduced chi-square"),
        "paths": [],
        "correlations": [],
        "flags": [],
        "warnings": [],
        "analysis_role": args.analysis_role,
        "constraint_profile": args.constraint_profile,
    }

    for line in text.splitlines():
        m = re.search(rf"(.+?)\s+({NUMBER})\s+({NUMBER})\s+({NUMBER})\s+({NUMBER})\s+({NUMBER})\s+({NUMBER})\s+({NUMBER})\s*$", line)
        if not m:
            continue
        name = m.group(1).strip()
        if name.lower().startswith(("name", "=")):
            continue
        vals = [float(m.group(i)) for i in range(2, 9)]
        path = dict(name=name, n=vals[0], s02=vals[1], sigma2=vals[2],
                    e0=vals[3], delr=vals[4], reff=vals[5], r=vals[6])
        result["paths"].append(path)
    for a, b, value in re.findall(rf"(?m)^\s*(\S+)\s*&\s*(\S+)\s*-->\s*({NUMBER})", text):
        result["correlations"].append({"a": a, "b": b, "value": float(value)})

    nind, nvar = result["nind"], result["nvar"]
    if nind is not None and nvar is not None and nvar >= nind:
        result["flags"].append(f"Nvar ({nvar:g}) is not smaller than Nind ({nind:g})")
    elif nind is not None and nvar is not None and nvar > 2 * nind / 3:
        result["warnings"].append(f"Nvar ({nvar:g}) exceeds preferred 2/3 Nind ({2*nind/3:g})")
    for path in result["paths"]:
        if path["sigma2"] < 0:
            result["flags"].append(f"negative sigma2 on {path['name']}: {path['sigma2']:.6g}")
        elif path["sigma2"] > 0.04:
            result["flags"].append(f"extreme sigma2 on {path['name']}: {path['sigma2']:.6g} A^2")
        elif path["sigma2"] > 0.015:
            result["warnings"].append(f"large sigma2 on {path['name']}: {path['sigma2']:.6g} A^2; test disorder or shell splitting")
        if abs(path["delr"]) > args.max_abs_delr:
            result["flags"].append(f"extreme |delr| on {path['name']}: {path['delr']:.6g} A")
        elif abs(path["delr"]) > 0.10:
            result["warnings"].append(f"large |delr| on {path['name']}: {path['delr']:.6g} A")
        if abs(path["e0"]) > args.max_abs_e0:
            result["flags"].append(f"extreme |e0| on {path['name']}: {path['e0']:.6g} eV")
        elif abs(path["e0"]) > 10:
            result["warnings"].append(f"large |e0| on {path['name']}: {path['e0']:.6g} eV; check calibration and phase")
        if args.expected_s02 is not None and abs(path["s02"] - args.expected_s02) > args.s02_tolerance:
            result["flags"].append(
                f"S02 mismatch on {path['name']}: {path['s02']:.6g} != {args.expected_s02:.6g}")
    for corr in result["correlations"]:
        if abs(corr["value"]) > args.max_correlation:
            result["flags"].append(
                f"high correlation {corr['a']}/{corr['b']}: {corr['value']:.4f}")
        elif abs(corr["value"]) >= 0.90:
            result["warnings"].append(
                f"strong correlation {corr['a']}/{corr['b']}: {corr['value']:.4f}")

    parameter_file = args.log.parent / "fit_parameters.tsv"
    result["parameter_table"] = str(parameter_file.resolve()) if parameter_file.is_file() else None
    if parameter_file.is_file():
        with parameter_file.open(encoding="utf-8", errors="replace", newline="") as stream:
            rows = list(csv.DictReader(stream, delimiter="\t"))
        for index, row in enumerate(rows, 1):
            def value(name: str):
                try:
                    return float(row.get(name, ""))
                except (TypeError, ValueError):
                    return None
            cn, s02 = value("cn_fit"), value("s02")
            amplitude = value("amplitude_factor")
            delr, sigma2, e0 = value("delr_A"), value("sigma2_A2"), value("e0_eV")
            label = row.get("path") or f"row {index}"
            s02_status = row.get("s02_status", "")
            if args.analysis_role == "standard" and (s02_status != "fitted_same_edge_standard" or amplitude != 1):
                result["flags"].append(f"standard role did not fix crystallographic N on {label}")
            if args.analysis_role == "unknown" and s02_status != "fixed_same_edge_standard":
                result["flags"].append(f"unknown role did not fix same-edge-standard S02 on {label}")
            if cn is None or cn <= 0:
                result["flags"].append(f"non-positive or missing CN on {label}")
            if s02 is None or s02 <= 0 or s02 > 1.5:
                result["flags"].append(f"nonphysical or missing S02 on {label}: {s02}")
            if sigma2 is None or sigma2 < 0:
                result["flags"].append(f"negative or missing sigma2 on {label}: {sigma2}")
            if args.constraint_profile == "paper-metal":
                domains = (("CN", cn, 4, 13), ("S02", s02, 0.75, 1.2),
                           ("delR", delr, -0.2, 0.2), ("sigma2", sigma2, 0.001, 0.02),
                           ("delta E0", e0, -10, 10))
                for name, number, low, high in domains:
                    if number is None or not low <= number <= high:
                        result["flags"].append(
                            f"{name} on {label} is outside paper-metal domain [{low}, {high}]: {number}")
                    elif (name not in ("CN", "S02") or
                          (name == "CN" and args.analysis_role == "unknown") or
                          (name == "S02" and args.analysis_role == "standard")) and (number == low or number == high):
                        result["flags"].append(
                            f"{name} on {label} is pinned at paper-metal boundary {number}")
            else:
                if cn is not None and cn > 24:
                    result["warnings"].append(f"CN on {label} exceeds general review range: {cn:g}")

    result["path_degeneracy_sum"] = sum(p["n"] for p in result["paths"])
    result["status"] = "fail" if result["flags"] else "review" if result["warnings"] else "pass"
    payload = json.dumps(result, indent=2, ensure_ascii=False) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload, encoding="utf-8")
    print(payload, end="")
    return 2 if result["flags"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
