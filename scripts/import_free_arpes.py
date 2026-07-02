#!/usr/bin/env python3
"""Import free ARPES literature metadata from official/open academic APIs.

This script intentionally imports metadata only. Experimental values and paper
figures must still be verified from the full text before becoming curated data.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "github-pages" / "data" / "free_arpes_articles.json"
MIN_ARTICLE_YEAR = 2016

DEFAULT_QUERIES = [
    "ARPES superconductivity",
    '"angle-resolved photoemission" superconductivity',
    "ARPES superconducting gap",
    "ARPES Fermi surface superconductor",
    "ARPES FeSe superconductivity",
    "ARPES cuprate superconducting gap",
    "ARPES iron-based superconductor",
    "ARPES Bi2212",
    "ARPES MgB2",
    "ARPES SnSe2",
    "ARPES SnS2",
    "ARPES SnSe",
    "ARPES SnS",
]

KNOWN_MATERIALS = [
    "Bi2Se3", "Bi2Te3", "Sb2Te3", "WTe2", "MoS2", "MoSe2", "MoTe2", "WS2", "WSe2",
    "FeSe", "FeTe", "BaFe2As2", "BaK122", "Ba0.6K0.4Fe2As2", "KFe2As2",
    "YBCO", "YBa2Cu3O7", "Bi2212", "Bi2Sr2CaCu2O8", "Bi2201", "LSCO", "LBCO",
    "Nd2CuO4", "Nd1-xSrxNiO2", "La3Ni2O7", "LaNiO3",
    "SnSe2", "SnSe", "SnS2", "SnS",
    "MgB2", "Nb3Sn", "NbSe2", "2H-NbSe2",
    "CeCoIn5", "CeIrIn5",
    "Hg", "Pb", "Nb", "H3S", "LaH10",
    "SrTiO3", "KTaO3",
]

ELEMENTS = [
    "H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne", "Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar",
    "K", "Ca", "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn", "Ga", "Ge", "As", "Se", "Br", "Kr",
    "Rb", "Sr", "Y", "Zr", "Nb", "Mo", "Tc", "Ru", "Rh", "Pd", "Ag", "Cd", "In", "Sn", "Sb", "Te", "I", "Xe",
    "Cs", "Ba", "La", "Ce", "Pr", "Nd", "Pm", "Sm", "Eu", "Gd", "Tb", "Dy", "Ho", "Er", "Tm", "Yb", "Lu",
    "Hf", "Ta", "W", "Re", "Os", "Ir", "Pt", "Au", "Hg", "Tl", "Pb", "Bi", "Po", "At", "Rn",
    "Fr", "Ra", "Ac", "Th", "Pa", "U", "Np", "Pu", "Am", "Cm", "Bk", "Cf", "Es", "Fm", "Md", "No", "Lr",
    "Rf", "Db", "Sg", "Bh", "Hs", "Mt", "Ds", "Rg", "Cn", "Nh", "Fl", "Mc", "Lv", "Ts", "Og",
]

FORMULA_RE = re.compile(r"([A-Z][a-z]?)(?:\d+(?:\.\d+)?|x|y|z|-\w+)?")


@dataclass
class ImportStats:
    openalex: int = 0
    arxiv: int = 0
    crossref: int = 0
    skipped: int = 0


def request_json(url: str, *, timeout: int = 30) -> dict[str, Any]:
    req = urllib.request.Request(url, headers={"User-Agent": user_agent()})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def request_text(url: str, *, timeout: int = 30) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": user_agent()})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return response.read().decode("utf-8", errors="replace")


def user_agent() -> str:
    email = os.environ.get("OPENALEX_EMAIL") or os.environ.get("ARPES_CONTACT_EMAIL")
    suffix = f" mailto:{email}" if email else ""
    return f"ARPES-Free-Literature-Importer/0.1{suffix}"


def openalex_url(query: str, per_page: int) -> str:
    params = {
        "search": query,
        "filter": "from_publication_date:1990-01-01",
        "per-page": str(per_page),
        "select": "id,doi,title,display_name,publication_year,authorships,primary_location,open_access,abstract_inverted_index,cited_by_count,concepts,keywords",
    }
    api_key = os.environ.get("OPENALEX_API_KEY")
    email = os.environ.get("OPENALEX_EMAIL") or os.environ.get("ARPES_CONTACT_EMAIL")
    if api_key:
        params["api_key"] = api_key
    elif email:
        params["mailto"] = email
    return "https://api.openalex.org/works?" + urllib.parse.urlencode(params)


def fetch_openalex(query: str, per_page: int) -> list[dict[str, Any]]:
    data = request_json(openalex_url(query, per_page))
    records = []
    for item in data.get("results", []):
        text = " ".join([
            item.get("display_name") or item.get("title") or "",
            abstract_from_openalex(item.get("abstract_inverted_index") or {}),
            " ".join((kw.get("display_name") or "") for kw in item.get("keywords") or []),
            " ".join((concept.get("display_name") or "") for concept in item.get("concepts") or []),
        ])
        if arpes_score(text) <= 0:
            continue
        doi = clean_doi(item.get("doi"))
        primary = item.get("primary_location") or {}
        source = primary.get("source") or {}
        oa = item.get("open_access") or {}
        url = doi_url(doi) or primary.get("landing_page_url") or item.get("id") or ""
        records.append(base_article(
            provider="OpenAlex",
            provider_id=item.get("id") or "",
            title=item.get("display_name") or item.get("title") or "",
            year=item.get("publication_year"),
            doi=doi,
            url=url,
            source_title=source.get("display_name") or "",
            authors=authors_from_openalex(item.get("authorships") or []),
            abstract=abstract_from_openalex(item.get("abstract_inverted_index") or {}),
            citation_count=item.get("cited_by_count"),
            open_access_url=oa.get("oa_url") or primary.get("pdf_url") or "",
            text=text,
        ))
    return records


def fetch_arxiv(query: str, per_page: int) -> list[dict[str, Any]]:
    search_query = " AND ".join([f'all:"{part}"' if " " in part else f"all:{part}" for part in query.replace('"', "").split()])
    params = {
        "search_query": search_query,
        "start": "0",
        "max_results": str(per_page),
        "sortBy": "relevance",
        "sortOrder": "descending",
    }
    xml_text = request_text("https://export.arxiv.org/api/query?" + urllib.parse.urlencode(params))
    root = ET.fromstring(xml_text)
    ns = {"atom": "http://www.w3.org/2005/Atom", "arxiv": "http://arxiv.org/schemas/atom"}
    records = []
    for entry in root.findall("atom:entry", ns):
        title = compact_text(entry.findtext("atom:title", default="", namespaces=ns))
        summary = compact_text(entry.findtext("atom:summary", default="", namespaces=ns))
        text = f"{title} {summary}"
        if arpes_score(text) <= 0:
            continue
        arxiv_id = (entry.findtext("atom:id", default="", namespaces=ns).rsplit("/", 1)[-1] or "").strip()
        doi = clean_doi(entry.findtext("arxiv:doi", default="", namespaces=ns))
        year = year_from_text(entry.findtext("atom:published", default="", namespaces=ns))
        authors = "; ".join(
            compact_text(author.findtext("atom:name", default="", namespaces=ns))
            for author in entry.findall("atom:author", ns)
        )
        pdf_url = ""
        for link in entry.findall("atom:link", ns):
            if link.attrib.get("title") == "pdf" or link.attrib.get("type") == "application/pdf":
                pdf_url = link.attrib.get("href", "")
        records.append(base_article(
            provider="arXiv",
            provider_id=f"arxiv:{arxiv_id}",
            title=title,
            year=year,
            doi=doi,
            url=f"https://arxiv.org/abs/{arxiv_id}" if arxiv_id else "",
            source_title="arXiv",
            authors=authors,
            abstract=summary,
            citation_count=None,
            open_access_url=pdf_url,
            text=text,
        ))
    return records


def enrich_crossref(article: dict[str, Any]) -> bool:
    doi = article.get("doi")
    if not doi:
        return False
    encoded = urllib.parse.quote(doi, safe="")
    try:
        message = request_json(f"https://api.crossref.org/works/{encoded}").get("message") or {}
    except urllib.error.HTTPError:
        return False
    article["free_sources"] = sorted(set(article.get("free_sources") or []) | {"Crossref"})
    article["crossref_indexed"] = True
    article["source_title"] = article.get("source_title") or first(message.get("container-title"))
    article["publisher"] = message.get("publisher") or article.get("publisher") or ""
    article["license"] = first([lic.get("URL") for lic in message.get("license") or [] if lic.get("URL")])
    return True


def base_article(
    *,
    provider: str,
    provider_id: str,
    title: str,
    year: int | None,
    doi: str,
    url: str,
    source_title: str,
    authors: str,
    abstract: str,
    citation_count: int | None,
    open_access_url: str,
    text: str,
) -> dict[str, Any]:
    materials = extract_materials(text)
    keywords = extract_keywords(text, materials)
    return {
        "id": stable_id(provider, provider_id, doi, title),
        "title": compact_text(title),
        "year": year,
        "source": provider,
        "source_title": compact_text(source_title),
        "authors": compact_text(authors),
        "url": url,
        "doi": doi,
        "materials": materials,
        "elements": extract_elements(text, materials),
        "dopants": [],
        "techniques": ["ARPES"],
        "keywords": keywords,
        "temperature_K": None,
        "photon_energy_eV": None,
        "beamline": "",
        "abstract": compact_text(abstract),
        "citation_count": citation_count,
        "open_access_url": open_access_url,
        "properties": infer_properties(text),
        "evidence": [value for value in [compact_text(title), doi_url(doi) or url] if value],
        "free_sources": [provider],
        "arpes_relevance": round(arpes_score(text), 2),
        "data_quality": "free_api_metadata_needs_fulltext",
        "verification_status": "free_api_metadata_needs_fulltext",
        "figures": [],
    }


def abstract_from_openalex(inverted: dict[str, list[int]]) -> str:
    if not inverted:
        return ""
    words: list[tuple[int, str]] = []
    for word, positions in inverted.items():
        for position in positions:
            words.append((position, word))
    return " ".join(word for _, word in sorted(words))


def authors_from_openalex(authorships: list[dict[str, Any]]) -> str:
    names = []
    for authorship in authorships[:12]:
        author = authorship.get("author") or {}
        if author.get("display_name"):
            names.append(author["display_name"])
    if len(authorships) > 12:
        names.append("et al.")
    return "; ".join(names)


def arpes_score(text: str) -> float:
    lower = text.lower()
    score = 0.0
    for phrase, weight in [
        ("angle-resolved photoemission", 0.55),
        ("angle resolved photoemission", 0.55),
        ("arpes", 0.45),
        ("photoemission spectroscopy", 0.2),
        ("fermi surface", 0.12),
        ("superconducting gap", 0.14),
        ("band structure", 0.08),
        ("superconduct", 0.12),
    ]:
        if phrase in lower:
            score += weight
    return min(1.0, score)


def extract_materials(text: str) -> list[str]:
    lower = text.lower()
    found = [material for material in KNOWN_MATERIALS if material.lower() in lower]
    return sorted(set(found), key=lambda item: (KNOWN_MATERIALS.index(item), item))


def extract_elements(text: str, materials: list[str]) -> list[str]:
    found: list[str] = []
    for material in materials:
        for symbol in FORMULA_RE.findall(material):
            if symbol in ELEMENTS and symbol not in found:
                found.append(symbol)
    for token in re.findall(r"\b[A-Z][a-z]?\b", text):
        if token in ELEMENTS and token not in {"In", "As"} and token not in found:
            found.append(token)
    return found


def extract_keywords(text: str, materials: list[str]) -> list[str]:
    lower = text.lower()
    keywords = ["ARPES"]
    for material in materials:
        keywords.append(material)
    for phrase in [
        "superconductivity", "superconducting gap", "Fermi surface", "band structure",
        "cuprate", "iron-based", "nickelate", "topological", "nematic", "pseudogap",
    ]:
        if phrase.lower() in lower:
            keywords.append(phrase)
    return list(dict.fromkeys(keywords))


def infer_properties(text: str) -> list[str]:
    lower = text.lower()
    props = []
    if "superconducting gap" in lower or "gap anisotropy" in lower:
        props.append("superconducting gap")
    if "fermi surface" in lower:
        props.append("Fermi surface")
    if "band structure" in lower or "band dispersion" in lower:
        props.append("band structure")
    if "nematic" in lower:
        props.append("nematicity")
    return props


def dedupe(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged: dict[str, dict[str, Any]] = {}
    for record in records:
        year = record.get("year")
        if not isinstance(year, int) or year < MIN_ARTICLE_YEAR:
            continue
        key = dedupe_key(record)
        if key in merged:
            target = merged[key]
            target["free_sources"] = sorted(set(target.get("free_sources") or []) | set(record.get("free_sources") or []))
            target["source"] = " + ".join(target["free_sources"])
            target["citation_count"] = max(filter_none([target.get("citation_count"), record.get("citation_count")]) or [None])
            target["open_access_url"] = target.get("open_access_url") or record.get("open_access_url") or ""
            target["url"] = target.get("url") or record.get("url") or ""
            target["keywords"] = list(dict.fromkeys((target.get("keywords") or []) + (record.get("keywords") or [])))
            target["materials"] = list(dict.fromkeys((target.get("materials") or []) + (record.get("materials") or [])))
            target["elements"] = list(dict.fromkeys((target.get("elements") or []) + (record.get("elements") or [])))
            target["arpes_relevance"] = max(target.get("arpes_relevance") or 0, record.get("arpes_relevance") or 0)
        else:
            merged[key] = record
    return sorted(merged.values(), key=lambda item: (item.get("arpes_relevance") or 0, item.get("citation_count") or 0, item.get("year") or 0), reverse=True)


def dedupe_key(record: dict[str, Any]) -> str:
    doi = clean_doi(record.get("doi"))
    if doi:
        return f"doi:{doi.lower()}"
    title = normalize_title(record.get("title") or "")
    year = record.get("year") or ""
    return f"title:{title}:{year}"


def stable_id(provider: str, provider_id: str, doi: str, title: str) -> str:
    if doi:
        return f"doi:{doi.lower()}"
    if provider_id:
        return provider_id.replace("https://openalex.org/", "openalex:")
    return "free:" + normalize_title(title)[:80]


def normalize_title(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", title.lower()).strip()


def clean_doi(value: Any) -> str:
    doi = str(value or "").strip()
    doi = doi.replace("https://doi.org/", "").replace("http://doi.org/", "").replace("doi:", "")
    return doi.strip()


def doi_url(doi: str) -> str:
    return f"https://doi.org/{doi}" if doi else ""


def compact_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def year_from_text(value: str) -> int | None:
    match = re.search(r"\b(19|20)\d{2}\b", value or "")
    return int(match.group(0)) if match else None


def first(values: Any) -> Any:
    if isinstance(values, list) and values:
        return values[0]
    return ""


def filter_none(values: list[Any]) -> list[Any]:
    return [value for value in values if value is not None]


def main() -> None:
    parser = argparse.ArgumentParser(description="Import free ARPES literature metadata.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--per-query", type=int, default=8)
    parser.add_argument("--max-records", type=int, default=120)
    parser.add_argument("--query", action="append", help="Add/override query. Can be repeated.")
    parser.add_argument("--skip-crossref", action="store_true", help="Skip Crossref DOI enrichment.")
    args = parser.parse_args()

    queries = args.query or DEFAULT_QUERIES
    stats = ImportStats()
    records: list[dict[str, Any]] = []

    for query in queries:
        print(f"[openalex] {query}")
        try:
            fetched = fetch_openalex(query, args.per_query)
            stats.openalex += len(fetched)
            records.extend(fetched)
        except Exception as exc:  # noqa: BLE001 - keep importer resilient across APIs
            stats.skipped += 1
            print(f"  ! OpenAlex failed: {exc}")
        time.sleep(0.2)

        print(f"[arxiv] {query}")
        try:
            fetched = fetch_arxiv(query, min(args.per_query, 10))
            stats.arxiv += len(fetched)
            records.extend(fetched)
        except Exception as exc:  # noqa: BLE001
            stats.skipped += 1
            print(f"  ! arXiv failed: {exc}")
        time.sleep(1.0)

    records = dedupe(records)

    if not args.skip_crossref:
        for article in records[: args.max_records]:
            if enrich_crossref(article):
                stats.crossref += 1
            time.sleep(0.1)

    records = records[: args.max_records]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(records)} records to {args.output}")
    print(json.dumps(stats.__dict__, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
