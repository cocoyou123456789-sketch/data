#!/usr/bin/env python3
"""Train browser-exportable composition baselines from public JARVIS data."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.ensemble import GradientBoostingClassifier, GradientBoostingRegressor
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    r2_score,
    roc_auc_score,
)


ELEMENTS = (
    "H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn "
    "Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce "
    "Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn "
    "Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og"
).split()
ELEMENT_INDEX = {symbol: index for index, symbol in enumerate(ELEMENTS)}
FEATURE_NAMES = [f"fraction_{symbol}" for symbol in ELEMENTS] + [
    "n_elements",
    "log1p_total_atoms",
    "composition_entropy",
    "mean_atomic_number",
    "std_atomic_number",
    "min_atomic_number",
    "max_atomic_number",
    "atomic_number_range",
    "max_element_fraction",
    "fraction_l2_norm",
]
TOKEN = re.compile(r"([A-Z][a-z]?|\d+(?:\.\d+)?|[()[\]{}])")


def parse_formula(formula: str) -> dict[str, float]:
    text = str(formula or "").strip().replace(" ", "")
    text = re.sub(r"(?:\^?[+-]\d*|\d*[+-])$", "", text)
    if not text or re.search(r"[A-Za-z](?:x|y|z)(?:\b|[+\-])", text, re.I):
        raise ValueError("variable or empty formula")
    tokens = TOKEN.findall(text)
    if "".join(tokens) != text:
        raise ValueError("unsupported formula syntax")
    stack: list[dict[str, float]] = [defaultdict(float)]
    brackets: list[str] = []
    pairs = {")": "(", "]": "[", "}": "{"}
    index = 0
    while index < len(tokens):
        token = tokens[index]
        if token in "([{":
            stack.append(defaultdict(float))
            brackets.append(token)
            index += 1
            continue
        if token in ")]}":
            if len(stack) == 1 or not brackets or brackets.pop() != pairs[token]:
                raise ValueError("unbalanced formula")
            group = stack.pop()
            multiplier = 1.0
            if index + 1 < len(tokens) and tokens[index + 1][0].isdigit():
                multiplier = float(tokens[index + 1])
                index += 1
            for symbol, count in group.items():
                stack[-1][symbol] += count * multiplier
            index += 1
            continue
        if token[0].isdigit():
            raise ValueError("orphan multiplier")
        if token not in ELEMENT_INDEX:
            raise ValueError(f"unknown element {token}")
        amount = 1.0
        if index + 1 < len(tokens) and tokens[index + 1][0].isdigit():
            amount = float(tokens[index + 1])
            index += 1
        if not math.isfinite(amount) or amount <= 0:
            raise ValueError("invalid stoichiometry")
        stack[-1][token] += amount
        index += 1
    if len(stack) != 1:
        raise ValueError("unbalanced formula")
    return dict(stack[0])


def counts_from_elements(elements: list[str]) -> dict[str, float]:
    counts: dict[str, float] = defaultdict(float)
    for symbol in elements:
        if symbol not in ELEMENT_INDEX:
            raise ValueError(f"unknown element {symbol}")
        counts[symbol] += 1.0
    return dict(counts)


def composition_key(counts: dict[str, float]) -> str:
    total = sum(counts.values())
    return "|".join(
        f"{symbol}:{counts[symbol] / total:.8f}"
        for symbol in sorted(counts, key=ELEMENT_INDEX.get)
    )


def featurize(counts: dict[str, float]) -> np.ndarray:
    total = float(sum(counts.values()))
    if not counts or total <= 0:
        raise ValueError("empty composition")
    fractions = np.zeros(len(ELEMENTS), dtype=np.float32)
    for symbol, count in counts.items():
        fractions[ELEMENT_INDEX[symbol]] = float(count) / total
    present = np.flatnonzero(fractions > 0)
    weights = fractions[present]
    atomic_numbers = present.astype(np.float32) + 1.0
    mean_z = float(np.sum(weights * atomic_numbers))
    std_z = float(np.sqrt(np.sum(weights * np.square(atomic_numbers - mean_z))))
    extras = np.asarray(
        [
            len(present) / 10.0,
            math.log1p(total) / 5.0,
            float(-np.sum(weights * np.log(np.maximum(weights, 1e-12)))) / 3.0,
            mean_z / 118.0,
            std_z / 118.0,
            float(np.min(atomic_numbers)) / 118.0,
            float(np.max(atomic_numbers)) / 118.0,
            float(np.max(atomic_numbers) - np.min(atomic_numbers)) / 118.0,
            float(np.max(weights)),
            float(np.linalg.norm(weights)),
        ],
        dtype=np.float32,
    )
    return np.concatenate([fractions, extras])


def split_for_key(key: str) -> str:
    bucket = int(hashlib.sha256(key.encode("utf-8")).hexdigest()[:8], 16) % 100
    if bucket < 80:
        return "train"
    if bucket < 90:
        return "validation"
    return "test"


def finite_number(value):
    try:
        number = float(value)
        return number if math.isfinite(number) else None
    except (TypeError, ValueError):
        return None


def load_dft(path: Path):
    records = json.loads(path.read_text(encoding="utf-8"))
    rows = []
    rejected = 0
    for record in records:
        try:
            counts = counts_from_elements(record["atoms"]["elements"])
        except (KeyError, TypeError, ValueError):
            rejected += 1
            continue
        formation = finite_number(record.get("formation_energy_peratom"))
        gap = finite_number(record.get("optb88vdw_bandgap"))
        if formation is None and gap is None:
            rejected += 1
            continue
        rows.append(
            {
                "key": composition_key(counts),
                "features": featurize(counts),
                "formation": formation,
                "gap": gap,
                "jid": record.get("jid", ""),
            }
        )
    return rows, rejected


def load_tc(path: Path):
    records = json.loads(path.read_text(encoding="utf-8"))
    grouped: dict[str, dict] = {}
    values: dict[str, list[float]] = defaultdict(list)
    rejected = 0
    for record in records:
        tc = finite_number(record.get("Tc"))
        if tc is None or tc < 0 or tc > 400:
            rejected += 1
            continue
        try:
            counts = parse_formula(record.get("formula", ""))
        except ValueError:
            rejected += 1
            continue
        key = composition_key(counts)
        grouped[key] = {"key": key, "features": featurize(counts)}
        values[key].append(tc)
    rows = []
    for key, row in grouped.items():
        rows.append({**row, "tc": float(np.median(values[key])), "replicates": len(values[key])})
    return rows, rejected, len(records)


def arrays(rows, target, split, predicate=lambda row: True):
    selected = [row for row in rows if split_for_key(row["key"]) == split and predicate(row)]
    return (
        np.asarray([row["features"] for row in selected], dtype=np.float32),
        np.asarray([row[target] for row in selected], dtype=np.float64),
    )


def regressor(seed: int, estimators: int = 180):
    return GradientBoostingRegressor(
        loss="huber",
        learning_rate=0.045,
        n_estimators=estimators,
        max_depth=3,
        min_samples_leaf=14,
        max_features="sqrt",
        subsample=0.8,
        random_state=seed,
    )


def classifier(seed: int):
    return GradientBoostingClassifier(
        learning_rate=0.045,
        n_estimators=180,
        max_depth=3,
        min_samples_leaf=14,
        max_features="sqrt",
        subsample=0.8,
        random_state=seed,
    )


def regression_metrics(y_true, y_pred):
    errors = np.abs(y_true - y_pred)
    return {
        "mae": round(float(mean_absolute_error(y_true, y_pred)), 6),
        "rmse": round(float(math.sqrt(mean_squared_error(y_true, y_pred))), 6),
        "r2": round(float(r2_score(y_true, y_pred)), 6),
        "absolute_error_q90": round(float(np.quantile(errors, 0.9)), 6),
        "test_records": int(len(y_true)),
    }


def round_list(values):
    return [round(float(value), 8) for value in values]


def export_tree(tree):
    raw = tree.tree_
    return {
        "feature": raw.feature.astype(int).tolist(),
        "threshold": round_list(raw.threshold),
        "left": raw.children_left.astype(int).tolist(),
        "right": raw.children_right.astype(int).tolist(),
        "value": round_list(raw.value[:, 0, 0]),
    }


def export_regressor(model, target_transform="identity"):
    return {
        "kind": "gradient_boosting_regressor",
        "init": round(float(np.ravel(model.init_.constant_)[0]), 8),
        "learning_rate": model.learning_rate,
        "target_transform": target_transform,
        "trees": [export_tree(tree[0]) for tree in model.estimators_],
    }


def export_classifier(model):
    prior = float(model.init_.class_prior_[1])
    return {
        "kind": "gradient_boosting_binary_classifier",
        "init": round(math.log(prior / max(1e-12, 1.0 - prior)), 8),
        "learning_rate": model.learning_rate,
        "positive_class": "metal",
        "trees": [export_tree(tree[0]) for tree in model.estimators_],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, default=Path("outputs/material-training/raw"))
    parser.add_argument(
        "--output", type=Path, default=Path("github-pages/data/material_baseline_v1.js")
    )
    parser.add_argument(
        "--metrics-output", type=Path, default=Path("models/material-baseline-v1.metrics.json")
    )
    args = parser.parse_args()

    dft_rows, dft_rejected = load_dft(args.data_dir / "jdft_3d-12-12-2022.json")
    tc_rows, tc_rejected, tc_raw_count = load_tc(args.data_dir / "supercon_chem.json")

    x_train, y_train = arrays(dft_rows, "formation", "train", lambda row: row["formation"] is not None)
    x_test, y_test = arrays(dft_rows, "formation", "test", lambda row: row["formation"] is not None)
    formation_model = regressor(20260731, 180).fit(x_train, y_train)
    formation_pred = formation_model.predict(x_test)

    gap_valid = lambda row: row["gap"] is not None and 0 <= row["gap"] <= 15
    x_gap_train, y_gap_train = arrays(dft_rows, "gap", "train", gap_valid)
    x_gap_test, y_gap_test = arrays(dft_rows, "gap", "test", gap_valid)
    y_metal_train = (y_gap_train <= 0.05).astype(int)
    y_metal_test = (y_gap_test <= 0.05).astype(int)
    metal_model = classifier(20260732).fit(x_gap_train, y_metal_train)
    metal_score = metal_model.predict_proba(x_gap_test)[:, 1]
    metal_pred = (metal_score >= 0.5).astype(int)

    x_nonmetal_train, y_nonmetal_train = arrays(
        dft_rows, "gap", "train", lambda row: gap_valid(row) and row["gap"] > 0.05
    )
    x_nonmetal_test, y_nonmetal_test = arrays(
        dft_rows, "gap", "test", lambda row: gap_valid(row) and row["gap"] > 0.05
    )
    gap_model = regressor(20260733, 200).fit(x_nonmetal_train, np.log1p(y_nonmetal_train))
    gap_pred = np.maximum(0, np.expm1(gap_model.predict(x_nonmetal_test)))

    x_tc_train, y_tc_train = arrays(tc_rows, "tc", "train")
    x_tc_test, y_tc_test = arrays(tc_rows, "tc", "test")
    tc_model = regressor(20260734, 220).fit(x_tc_train, np.log1p(y_tc_train))
    tc_pred = np.maximum(0, np.expm1(tc_model.predict(x_tc_test)))

    metrics = {
        "formation_energy_eV_atom": regression_metrics(y_test, formation_pred),
        "nonmetal_band_gap_eV": regression_metrics(y_nonmetal_test, gap_pred),
        "known_superconductor_tc_K": regression_metrics(y_tc_test, tc_pred),
        "metal_classifier": {
            "accuracy": round(float(accuracy_score(y_metal_test, metal_pred)), 6),
            "balanced_accuracy": round(float(balanced_accuracy_score(y_metal_test, metal_pred)), 6),
            "f1": round(float(f1_score(y_metal_test, metal_pred)), 6),
            "roc_auc": round(float(roc_auc_score(y_metal_test, metal_score)), 6),
            "test_records": int(len(y_metal_test)),
            "metal_fraction_test": round(float(np.mean(y_metal_test)), 6),
        },
    }
    manifest_path = args.data_dir / "dataset_manifest.json"
    source_manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
    model = {
        "schema": "arpes-material-composition-baseline/v1",
        "version": "jarvis-composition-baseline-2026.07.31",
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "feature_schema": "element-fractions-plus-composition-statistics/v1",
        "feature_names": FEATURE_NAMES,
        "elements": ELEMENTS,
        "training": {
            "split": "deterministic 80/10/10 split by canonical composition SHA-256",
            "dft_records_loaded": len(dft_rows),
            "dft_records_rejected": dft_rejected,
            "tc_raw_records": tc_raw_count,
            "tc_unique_compositions": len(tc_rows),
            "tc_records_rejected": tc_rejected,
            "sources": source_manifest.get("datasets", {}),
            "library": "scikit-learn 1.9.0",
        },
        "metrics": metrics,
        "domain": {
            "input": "composition only",
            "seen_elements": sorted(
                {
                    ELEMENTS[index]
                    for row in dft_rows
                    for index in np.flatnonzero(row["features"][: len(ELEMENTS)] > 0)
                },
                key=ELEMENT_INDEX.get,
            ),
            "warnings": [
                "Composition does not uniquely determine crystal structure or an ARPES spectrum.",
                "Tc regression is conditional on records in a known-superconductor database; it is not a probability of superconductivity.",
                "Band-gap and formation-energy outputs are composition baselines trained on JARVIS OptB88vdW data and require structure-aware DFT validation.",
            ],
        },
        "models": {
            "formation_energy_eV_atom": export_regressor(formation_model),
            "metal_score": export_classifier(metal_model),
            "nonmetal_band_gap_eV": export_regressor(gap_model, "log1p"),
            "known_superconductor_tc_K": export_regressor(tc_model, "log1p"),
        },
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(model, ensure_ascii=True, separators=(",", ":"))
    args.output.write_text("globalThis.ARPES_MATERIAL_BASELINE_MODEL=" + payload + ";\n", encoding="utf-8")
    args.metrics_output.parent.mkdir(parents=True, exist_ok=True)
    args.metrics_output.write_text(json.dumps({"version": model["version"], **metrics}, indent=2) + "\n")
    print(json.dumps({"model": str(args.output), "bytes": args.output.stat().st_size, "metrics": metrics}, indent=2))


if __name__ == "__main__":
    main()
