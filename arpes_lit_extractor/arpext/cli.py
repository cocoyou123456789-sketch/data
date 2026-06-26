from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

from .config import load_materials
from .extract import extract_from_file


ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract ARPES facts from article text/PDF files.")
    parser.add_argument("inputs", nargs="+", type=Path, help="Article files or directories.")
    parser.add_argument("--materials", type=Path, default=ROOT / "config" / "materials.json")
    parser.add_argument("--out", type=Path, default=ROOT / "output" / "arpes_extractions.jsonl")
    parser.add_argument("--csv", type=Path, help="Optional CSV summary output.")
    args = parser.parse_args()

    materials = load_materials(args.materials)
    files = list(_iter_files(args.inputs))
    args.out.parent.mkdir(parents=True, exist_ok=True)

    records = []
    with args.out.open("w", encoding="utf-8") as f:
        for path in files:
            record = extract_from_file(path, materials).to_dict()
            records.append(record)
            f.write(json.dumps(record, ensure_ascii=False) + "\n")

    if args.csv:
        args.csv.parent.mkdir(parents=True, exist_ok=True)
        _write_csv(args.csv, records)

    print(f"Processed {len(records)} files -> {args.out}")


def _iter_files(inputs: list[Path]):
    allowed = {".txt", ".md", ".xml", ".tei", ".pdf"}
    for item in inputs:
        if item.is_dir():
            for path in sorted(item.rglob("*")):
                if path.suffix.lower() in allowed:
                    yield path
        elif item.suffix.lower() in allowed:
            yield item


def _write_csv(path: Path, records: list[dict[str, object]]) -> None:
    fields = [
        "source_file",
        "title",
        "doi",
        "arxiv_id",
        "materials",
        "dopants",
        "techniques",
        "photon_energies_eV",
        "temperatures_K",
        "band_gaps",
        "fermi_velocities",
        "notes",
    ]
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for record in records:
            writer.writerow({field: _cell(record.get(field)) for field in fields})


def _cell(value: object) -> object:
    if isinstance(value, list):
        return "; ".join(str(item) for item in value)
    return value or ""


if __name__ == "__main__":
    main()
