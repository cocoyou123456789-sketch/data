from __future__ import annotations
import importlib.util

RECIPE = ["Scale", "Background", "Zero", "Lattice", "Profile", "Phase fraction"]


def gsas_available() -> bool:
    return importlib.util.find_spec("GSASIIscriptable") is not None


def capability() -> dict:
    return {"available": gsas_available(), "recipe": RECIPE, "engine": "GSASIIscriptable"}


def refine(*args, **kwargs):
    if not gsas_available():
        raise RuntimeError("GSAS-II / GSASIIscriptable 未安装；未执行精修")
    raise NotImplementedError("GSAS-II 已检测到；项目创建与逐级 recipe 执行将在下一版接通")

