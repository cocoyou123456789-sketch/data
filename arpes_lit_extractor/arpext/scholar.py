from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from .config import load_materials
from .extract import extract_from_text
from .wos import _elements_for_materials, _first_number, _properties_from_extraction


ENTRY_RE = re.compile(r"@\w+\s*\{\s*([^,]+)\s*,(.*?)(?=^@\w+\s*\{|\Z)", re.DOTALL | re.MULTILINE)
FIELD_RE = re.compile(r"(\w+)\s*=\s*([{\"])(.*?)(?<!\\)(?:\2|})\s*,?", re.DOTALL)


def parse_scholar_bibtex(text: str, materials_path: Path, source_file: str = "google-scholar.bib") -> list[dict[str, Any]]:
    materials = load_materials(materials_path)
    articles = []
    for index, match in enumerate(ENTRY_RE.finditer(text), start=1):
        key = match.group(1).strip()
        fields = _parse_fields(match.group(2))
        title = fields.get("title", "")
        journal = fields.get("journal", fields.get("booktitle", ""))
        year = _to_int(fields.get("year", ""))
        doi = fields.get("doi", "")
        url = fields.get("url", "")
        authors = fields.get("author", "")
        text_for_extraction = "\n".join([title, journal, fields.get("abstract", "")])
        extracted = extract_from_text(text_for_extraction, source_file, materials)
        material_names = extracted.materials

        articles.append(
            {
                "id": f"google-scholar:{key}",
                "title": title or "(untitled Google Scholar BibTeX record)",
                "year": year,
                "source": "Google Scholar BibTeX",
                "source_title": journal,
                "authors": authors,
                "url": url,
                "doi": doi,
                "wos_uid": "",
                "materials": material_names,
                "elements": _elements_for_materials(material_names),
                "dopants": extracted.dopants,
                "techniques": extracted.techniques,
                "keywords": [],
                "temperature_K": _first_number(extracted.temperatures_K),
                "photon_energy_eV": _first_number(extracted.photon_energies_eV),
                "band_gap_eV": _first_number(extracted.band_gaps),
                "fermi_velocity": None,
                "beamline": "; ".join(extracted.beamline_snippets),
                "properties": _properties_from_extraction(extracted),
                "evidence": _evidence(title, journal, authors, doi, url),
                "verification_status": "google_scholar_bibtex_metadata",
            }
        )
    return articles


def _parse_fields(body: str) -> dict[str, str]:
    fields = {}
    for match in FIELD_RE.finditer(body):
        name = match.group(1).lower()
        value = _clean_bibtex_value(match.group(3))
        fields[name] = value
    return fields


def _clean_bibtex_value(value: str) -> str:
    clean = re.sub(r"\s+", " ", value).strip()
    clean = clean.replace("\\&", "&")
    clean = re.sub(r"[{}]", "", clean)
    return clean


def _to_int(value: str) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _evidence(title: str, journal: str, authors: str, doi: str, url: str) -> list[str]:
    evidence = []
    if title:
        evidence.append(title)
    if journal:
        evidence.append("Source: " + journal)
    if authors:
        evidence.append("Authors: " + authors)
    if doi:
        evidence.append("DOI: " + doi)
    if url:
        evidence.append("URL: " + url)
    return evidence
