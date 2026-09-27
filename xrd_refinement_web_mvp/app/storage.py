from __future__ import annotations
from dataclasses import dataclass, field
from threading import Lock
from typing import Any


@dataclass
class Store:
    datasets: dict[str, dict[str, Any]] = field(default_factory=dict)
    analyses: dict[str, dict[str, Any]] = field(default_factory=dict)
    lock: Lock = field(default_factory=Lock)

    def put_dataset(self, key: str, value: dict[str, Any]) -> None:
        with self.lock:
            self.datasets[key] = value

    def get_dataset(self, key: str) -> dict[str, Any] | None:
        with self.lock:
            return self.datasets.get(key)

    def put_analysis(self, key: str, value: dict[str, Any]) -> None:
        with self.lock:
            self.analyses[key] = value

    def get_analysis(self, key: str) -> dict[str, Any] | None:
        with self.lock:
            return self.analyses.get(key)


store = Store()

