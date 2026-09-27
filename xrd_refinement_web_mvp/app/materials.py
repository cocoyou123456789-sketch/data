from __future__ import annotations
import os


class MaterialsProjectService:
    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or os.getenv("MP_API_KEY")

    def search(self, elements: list[str], mode: str, limit: int) -> list[dict]:
        if not self.api_key:
            raise RuntimeError("服务器未配置 MP_API_KEY")
        try:
            from mp_api.client import MPRester
        except ImportError as exc:
            raise RuntimeError("未安装 mp-api") from exc
        fields = ["material_id", "formula_pretty", "symmetry", "energy_above_hull", "is_stable", "structure", "elements"]
        kwargs = {"fields": fields}
        if mode == "strict":
            kwargs["chemsys"] = "-".join(sorted(elements))
        else:
            kwargs["elements"] = elements
        with MPRester(self.api_key) as mpr:
            docs = mpr.materials.summary.search(**kwargs)
        out = []
        desired = set(elements)
        for doc in docs:
            actual = {str(e) for e in doc.elements}
            if mode == "strict" and actual != desired:
                continue
            sym = getattr(doc, "symmetry", None)
            out.append({
                "material_id": str(doc.material_id), "formula": doc.formula_pretty,
                "space_group": getattr(sym, "symbol", None), "crystal_system": str(getattr(sym, "crystal_system", "")),
                "energy_above_hull": float(doc.energy_above_hull), "is_stable": bool(doc.is_stable),
                "structure": doc.structure,
            })
            if len(out) >= limit:
                break
        return out

