from __future__ import annotations

import csv
import io
from pathlib import Path
from typing import Any

from .config import MaterialQuery, load_materials
from .extract import extract_from_text


MATERIAL_ELEMENTS = {
    "SnSe2": ["Sn", "Se"],
    "SnSeS": ["Sn", "Se", "S"],
    "SnS2": ["Sn", "S"],
    "SnSe": ["Sn", "Se"],
    "SnS": ["Sn", "S"],
}


def parse_wos_export(text: str, materials_path: Path, source_file: str = "wos-export") -> list[dict[str, Any]]:
    rows = _read_tabular(text)
    materials = load_materials(materials_path)
    return [_row_to_article(row, index, materials, source_file) for index, row in enumerate(rows, start=1)]


def load_imported_articles(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    import json

    return json.loads(path.read_text(encoding="utf-8"))


def save_imported_articles(path: Path, articles: list[dict[str, Any]]) -> None:
    import json

    path.parent.mkdir(parents=True, exist_ok=True)
    existing = {article.get("id"): article for article in load_imported_articles(path)}
    for article in articles:
        existing[article["id"]] = article
    path.write_text(
        json.dumps(list(existing.values()), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def _read_tabular(text: str) -> list[dict[str, str]]:
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",\t;")
    except csv.Error:
        dialect = csv.excel_tab if "\t" in sample else csv.excel
    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    return [{_normalize_key(k): (v or "").strip() for k, v in row.items() if k} for row in reader]


def _row_to_article(
    row: dict[str, str],
    index: int,
    materials: list[MaterialQuery],
    source_file: str,
) -> dict[str, Any]:
    title = _first(row, "article title", "title", "ti")
    abstract = _first(row, "abstract", "ab")
    keywords = _split_keywords(
        _first(row, "author keywords", "keywords", "de")
        + "; "
        + _first(row, "keywords plus", "id")
    )
    doi = _first(row, "doi", "di")
    year = _to_int(_first(row, "publication year", "year published", "py"))
    uid = _first(row, "ut unique wos id", "ut", "accession number")
    source_title = _first(row, "source title", "so", "journal")
    authors = _first(row, "authors", "au")
    text_for_extraction = "\n".join([title, abstract, " ".join(keywords)])
    extracted = extract_from_text(text_for_extraction, source_file, materials)
    material_names = extracted.materials
    elements = _elements_for_materials(material_names)

    return {
        "id": uid or f"wos-{source_file}-{index}",
        "title": title or "(untitled Web of Science record)",
        "year": year,
        "source": "Web of Science export",
        "source_title": source_title,
        "authors": authors,
        "url": f"https://www.webofscience.com/wos/woscc/full-record/{uid}" if uid else "",
        "doi": doi,
        "wos_uid": uid,
        "materials": material_names,
        "elements": elements,
        "dopants": extracted.dopants,
        "techniques": extracted.techniques,
        "keywords": keywords,
        "temperature_K": _first_number(extracted.temperatures_K),
        "photon_energy_eV": _first_number(extracted.photon_energies_eV),
        "band_gap_eV": _first_number(extracted.band_gaps),
        "fermi_velocity": None,
        "beamline": "; ".join(extracted.beamline_snippets),
        "properties": _properties_from_extraction(extracted),
        "evidence": _evidence(title, abstract, keywords, doi, uid),
        "verification_status": "wos_metadata_only",
    }


def _normalize_key(key: str) -> str:
    clean = key.strip().lower()
    for char in "()[]{}:/.-":
        clean = clean.replace(char, " ")
    return " ".join(clean.split())


def _first(row: dict[str, str], *keys: str) -> str:
    for key in keys:
        value = row.get(_normalize_key(key), "")
        if value:
            return value
    return ""


def _split_keywords(value: str) -> list[str]:
    return [item.strip() for item in value.replace("|", ";").split(";") if item.strip()]


def _to_int(value: str) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _first_number(values: list[str]) -> float | None:
    if not values:
        return None
    clean = values[0].split()[0]
    try:
        return float(clean)
    except ValueError:
        return None


def _elements_for_materials(materials: list[str]) -> list[str]:
    elements = []
    for material in materials:
        for element in MATERIAL_ELEMENTS.get(material, []):
            if element not in elements:
                elements.append(element)
    return elements


def _properties_from_extraction(extracted) -> list[str]:
    properties = []
    if extracted.band_gaps:
        properties.append("band gap")
    if extracted.fermi_velocities:
        properties.append("Fermi velocity")
    for technique in extracted.techniques:
        if technique not in properties:
            properties.append(technique)
    return properties


def _evidence(title: str, abstract: str, keywords: list[str], doi: str, uid: str) -> list[str]:
    evidence = []
    if title:
        evidence.append(title)
    if keywords:
        evidence.append("Keywords: " + "; ".join(keywords[:8]))
    if doi:
        evidence.append("DOI: " + doi)
    if uid:
        evidence.append("WoS ID: " + uid)
    if abstract:
        evidence.append("Abstract metadata available from Web of Science export")
    return evidence
