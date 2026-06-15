from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class MaterialQuery:
    name: str
    aliases: tuple[str, ...]
    dopants: tuple[str, ...] = ()


def load_materials(path: Path) -> list[MaterialQuery]:
    data = json.loads(path.read_text(encoding="utf-8"))
    materials = []
    for item in data["materials"]:
        materials.append(
            MaterialQuery(
                name=item["name"],
                aliases=tuple(item.get("aliases", [item["name"]])),
                dopants=tuple(item.get("dopants", [])),
            )
        )
    return materials
