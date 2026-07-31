#!/usr/bin/env python3
"""Download and verify the public JARVIS datasets used by the baseline model."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import zipfile
from datetime import datetime, timezone
from pathlib import Path


DATASETS = {
    "dft_3d": {
        "url": "https://ndownloader.figshare.com/files/38521619",
        "archive": "dft_3d.json.zip",
        "member": "jdft_3d-12-12-2022.json",
        "sha256": "d4c64660e9e1fa45c82bd8868a96ec10162195eed69636445972c05550d8d0d6",
        "records": 75993,
        "reference": "https://doi.org/10.6084/m9.figshare.6815699",
    },
    "supercon_chem": {
        "url": "https://ndownloader.figshare.com/files/40719260",
        "archive": "supercon_chem.json.zip",
        "member": "supercon_chem.json",
        "sha256": "14b7489822a1c25407cd6c83989dfca7f14263dfe6b5dc9f859969430c09e5b7",
        "records": 16414,
        "reference": "https://doi.org/10.1038/s41524-018-0085-8",
    },
    "supercon_3d": {
        "url": "https://ndownloader.figshare.com/files/38307921",
        "archive": "supercon_3d.json.zip",
        "member": "jarvis_epc_data_figshare_1058.json",
        "sha256": "4213651cee9b4c13a376dd74ac1f8d3bd9efcd451f1b8da615255c8df0e1487f",
        "records": 1058,
        "reference": "https://doi.org/10.1038/s41524-022-00933-1",
    },
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download(url: str, destination: Path) -> None:
    partial = destination.with_suffix(destination.suffix + ".part")
    subprocess.run(
        [
            "curl", "-L", "--fail", "--retry", "3", "--connect-timeout", "20",
            "--max-time", "600", url, "-o", str(partial),
        ],
        check=True,
    )
    partial.replace(destination)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--cache-dir",
        type=Path,
        default=Path("outputs/material-training/raw"),
        help="Local cache for downloaded archives and extracted JSON files.",
    )
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    args.cache_dir.mkdir(parents=True, exist_ok=True)

    manifest = {
        "schema": "arpes-material-training-sources/v1",
        "downloaded_at": datetime.now(timezone.utc).isoformat(),
        "datasets": {},
    }
    for name, spec in DATASETS.items():
        archive = args.cache_dir / spec["archive"]
        if args.force or not archive.exists():
            print(f"Downloading {name} from {spec['url']}")
            download(spec["url"], archive)
        actual_hash = sha256(archive)
        if actual_hash != spec["sha256"]:
            raise SystemExit(
                f"Checksum mismatch for {name}: expected {spec['sha256']}, got {actual_hash}"
            )
        with zipfile.ZipFile(archive) as zipped:
            if spec["member"] not in zipped.namelist():
                raise SystemExit(f"{spec['member']} is missing from {archive}")
            extracted = args.cache_dir / spec["member"]
            if args.force or not extracted.exists():
                zipped.extract(spec["member"], args.cache_dir)
        manifest["datasets"][name] = {
            **spec,
            "archive_bytes": archive.stat().st_size,
            "extracted_bytes": extracted.stat().st_size,
        }
        print(f"Verified {name}: {spec['records']} records")

    manifest_path = args.cache_dir / "dataset_manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {manifest_path}")


if __name__ == "__main__":
    main()
