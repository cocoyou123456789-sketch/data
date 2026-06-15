from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from pathlib import Path

from .config import MaterialQuery


DOI_RE = re.compile(r"\b10\.\d{4,9}/[-._;()/:A-Z0-9]+\b", re.IGNORECASE)
ARXIV_RE = re.compile(r"\barXiv:\s*(\d{4}\.\d{4,5}(?:v\d+)?)\b", re.IGNORECASE)
PHOTON_RE = re.compile(
    r"(?:photon energ(?:y|ies)|hν|hv)\s*(?:of|=|:|were|was)?\s*"
    r"(?P<value>\d+(?:\.\d+)?(?:\s*(?:-|to|–)\s*\d+(?:\.\d+)?)?)\s*eV",
    re.IGNORECASE,
)
TEMP_RE = re.compile(
    r"(?:(?:measured|collected|performed|ARPES).*?\bat\b|\bat)\s*"
    r"(?P<value>\d+(?:\.\d+)?)\s*K\b",
    re.IGNORECASE | re.DOTALL,
)
BEAMLINE_RE = re.compile(
    r"(?P<snippet>(?:beamline|Beamline|BL)\s*[-\w ]{1,60}|"
    r"(?:synchrotron|Synchrotron)\s+[-\w ,()]{1,100})"
)
ANALYZER_RE = re.compile(
    r"(?P<snippet>(?:Scienta|DA30|R4000|MBS|hemispherical analyzer|electron analyzer)"
    r"[-\w. ,()]{0,80})",
    re.IGNORECASE,
)
GROWTH_RE = re.compile(
    r"(?P<snippet>(?:grown|synthesi[sz]ed|prepared|cleaved|doped|intercalated|"
    r"molecular beam epitaxy|MBE|chemical vapor transport|CVT)"
    r"[-\w ,;()/%]{0,160})",
    re.IGNORECASE,
)
BAND_GAP_RE = re.compile(
    r"(?:band gap|gap)\s*(?:of|=|:|is|was)?\s*(?P<value>\d+(?:\.\d+)?)\s*(?P<unit>meV|eV)",
    re.IGNORECASE,
)
FERMI_RE = re.compile(
    r"(?:Fermi velocity|vF|v_F)\s*(?:of|=|:)?\s*(?P<value>\d+(?:\.\d+)?)\s*"
    r"(?P<unit>eV\s*[ÅA]|\d*\s*m/s|m\s*s-1)?",
    re.IGNORECASE,
)


@dataclass
class ExtractedPaper:
    source_file: str
    title: str | None = None
    doi: str | None = None
    arxiv_id: str | None = None
    materials: list[str] = field(default_factory=list)
    dopants: list[str] = field(default_factory=list)
    techniques: list[str] = field(default_factory=list)
    photon_energies_eV: list[str] = field(default_factory=list)
    temperatures_K: list[str] = field(default_factory=list)
    beamline_snippets: list[str] = field(default_factory=list)
    analyzer_snippets: list[str] = field(default_factory=list)
    preparation_snippets: list[str] = field(default_factory=list)
    band_gaps: list[str] = field(default_factory=list)
    fermi_velocities: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def extract_from_text(text: str, source_file: str, materials: list[MaterialQuery]) -> ExtractedPaper:
    normalized = " ".join(text.split())
    paper = ExtractedPaper(source_file=source_file)
    paper.title = _guess_title(text)

    if doi := DOI_RE.search(text):
        paper.doi = doi.group(0).rstrip(".")
    if arxiv := ARXIV_RE.search(text):
        paper.arxiv_id = arxiv.group(1)

    lower_text = normalized.lower()
    for material in materials:
        if any(_contains_alias(normalized, alias) for alias in material.aliases):
            paper.materials.append(material.name)
        for dopant in material.dopants:
            if _contains_alias(normalized, dopant):
                paper.dopants.append(dopant)

    for label, keywords in {
        "ARPES": ("arpes", "angle-resolved photoemission"),
        "nano-ARPES": ("nano-arpes", "nanoarpes"),
        "spin-ARPES": ("spin-resolved arpes", "spin arpes"),
        "DFT": ("density functional theory", " dft "),
        "STM": ("scanning tunneling microscopy", " stm "),
    }.items():
        if any(keyword in lower_text for keyword in keywords):
            paper.techniques.append(label)

    paper.photon_energies_eV = _unique(m.group("value") for m in PHOTON_RE.finditer(normalized))
    paper.temperatures_K = _unique(m.group("value") for m in TEMP_RE.finditer(normalized))
    paper.beamline_snippets = _unique(m.group("snippet").strip() for m in BEAMLINE_RE.finditer(text))
    paper.analyzer_snippets = _unique(m.group("snippet").strip() for m in ANALYZER_RE.finditer(text))
    paper.preparation_snippets = _unique(m.group("snippet").strip() for m in GROWTH_RE.finditer(text))
    paper.band_gaps = _unique(f"{m.group('value')} {m.group('unit')}" for m in BAND_GAP_RE.finditer(normalized))
    paper.fermi_velocities = _unique(
        f"{m.group('value')} {m.group('unit') or ''}".strip() for m in FERMI_RE.finditer(normalized)
    )

    if "arpes" not in lower_text and "angle-resolved photoemission" not in lower_text:
        paper.notes.append("No explicit ARPES keyword found; inspect manually.")
    if not paper.materials:
        paper.notes.append("No configured material keyword found.")
    return paper


def extract_from_file(path: Path, materials: list[MaterialQuery]) -> ExtractedPaper:
    text = read_text_document(path)
    return extract_from_text(text, str(path), materials)


def read_text_document(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in {".txt", ".md", ".xml", ".tei"}:
        return path.read_text(encoding="utf-8", errors="replace")
    if suffix == ".pdf":
        return _read_pdf(path)
    raise ValueError(f"Unsupported input type: {path}")


def _read_pdf(path: Path) -> str:
    try:
        from pypdf import PdfReader  # type: ignore
    except ImportError as exc:
        raise RuntimeError("PDF input requires pypdf. Install with: python -m pip install pypdf") from exc

    reader = PdfReader(str(path))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def _guess_title(text: str) -> str | None:
    for line in text.splitlines():
        clean = line.strip()
        if 8 <= len(clean) <= 220 and not clean.lower().startswith(("abstract", "doi", "arxiv")):
            return clean
    return None


def _contains_alias(text: str, alias: str) -> bool:
    left = r"(?<![A-Za-z0-9])"
    right = r"(?![A-Za-z0-9])"
    return re.search(left + re.escape(alias) + right, text, re.IGNORECASE) is not None


def _unique(values) -> list[str]:
    seen = set()
    out = []
    for value in values:
        clean = str(value).strip().rstrip(".,;")
        if clean and clean.lower() not in seen:
            seen.add(clean.lower())
            out.append(clean)
    return out
