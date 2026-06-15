from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path
from statistics import mean
from typing import Any

from .knowledge import describe_materials


def load_articles(path: Path) -> list[dict[str, Any]]:
    return json.loads(path.read_text(encoding="utf-8"))


def load_elements(path: Path) -> list[dict[str, Any]]:
    return json.loads(path.read_text(encoding="utf-8"))


def search_elements(query: str, elements: list[dict[str, Any]]) -> list[dict[str, Any]]:
    terms = _terms(query)
    matches = []
    for element in elements:
        fields = [
            element.get("symbol", ""),
            element.get("name", ""),
            element.get("chinese_name", ""),
            " ".join(element.get("relevance", [])),
        ]
        if any(term in str(field).lower() for term in terms for field in fields):
            matches.append(element)
    return matches


def search_articles(query: str, articles: list[dict[str, Any]]) -> dict[str, Any]:
    terms = _terms(query)
    matches = []
    for article in articles:
        score, reasons = _score_article(terms, article)
        if score > 0:
            enriched = dict(article)
            enriched["match_score"] = score
            enriched["match_reasons"] = reasons
            matches.append(enriched)

    matches.sort(key=lambda item: (-item["match_score"], item.get("year") or 0, item.get("title", "")))
    return {
        "query": query,
        "total_articles": len(matches),
        "candidate_materials": _summarize_materials(matches),
        "articles": matches,
    }


def _terms(query: str) -> list[str]:
    return [term.lower() for term in query.replace(",", " ").replace("，", " ").split() if term.strip()]


def _score_article(terms: list[str], article: dict[str, Any]) -> tuple[int, list[str]]:
    haystacks = {
        "材料": article.get("materials", []),
        "元素": article.get("elements", []),
        "掺杂": article.get("dopants", []),
        "技术": article.get("techniques", []),
        "关键词": article.get("keywords", []),
        "标题": [article.get("title", "")],
        "证据": article.get("evidence", []),
    }
    score = 0
    reasons = []
    for term in terms:
        for label, values in haystacks.items():
            if any(term in str(value).lower() for value in values):
                score += _field_weight(label)
                reasons.append(f"{label}匹配 {term}")
    return score, _unique(reasons)


def _field_weight(label: str) -> int:
    return {
        "材料": 50,
        "元素": 25,
        "掺杂": 35,
        "技术": 15,
        "关键词": 15,
        "标题": 10,
        "证据": 10,
    }.get(label, 5)


def _summarize_materials(articles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_material: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for article in articles:
        for material in article.get("materials", []):
            by_material[material].append(article)

    summaries = []
    for material, material_articles in by_material.items():
        dopants = _unique(
            dopant
            for article in material_articles
            for dopant in article.get("dopants", [])
        )
        summary = {
            "material": material,
            "article_count": len(material_articles),
            "score": sum(article.get("match_score", 0) for article in material_articles),
            "temperatures_K": _range_summary(article.get("temperature_K") for article in material_articles),
            "photon_energies_eV": _range_summary(article.get("photon_energy_eV") for article in material_articles),
            "band_gaps_eV": _range_summary(article.get("band_gap_eV") for article in material_articles),
            "dopants": dopants,
            "properties": _unique(
                prop
                for article in material_articles
                for prop in article.get("properties", [])
            ),
            "article_ids": [article.get("id") for article in material_articles],
        }
        descriptions = describe_materials([material], dopants)
        summary["knowledge"] = descriptions[0] if descriptions else None
        summaries.append(summary)

    summaries.sort(key=lambda item: (-item["score"], -item["article_count"], item["material"]))
    return summaries


def _range_summary(values) -> dict[str, Any]:
    clean = [float(value) for value in values if isinstance(value, (int, float))]
    if not clean:
        return {"count": 0, "min": None, "max": None, "avg": None}
    return {
        "count": len(clean),
        "min": min(clean),
        "max": max(clean),
        "avg": round(mean(clean), 3),
    }


def _unique(values) -> list[str]:
    out = []
    seen = set()
    for value in values:
        if value is None:
            continue
        clean = str(value).strip()
        key = clean.lower()
        if clean and key not in seen:
            out.append(clean)
            seen.add(key)
    return out
