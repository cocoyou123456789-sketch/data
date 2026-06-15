from __future__ import annotations


MATERIAL_PROPERTIES = {
    "SnSe2": {
        "family": "layered IV-VI semiconductor",
        "traits": [
            "层状范德华半导体",
            "常用于电子掺杂、激子和能带调控研究",
            "ARPES 中重点关注导带/价带位置、费米能级移动和能隙变化",
        ],
        "watch": ["band gap", "Fermi level shift", "electron doping", "exciton"],
    },
    "SnSeS": {
        "family": "tin chalcogenide alloy",
        "traits": [
            "SnSe 与 SnS 之间的合金体系",
            "成分变化会影响能隙、晶格常数和价带结构",
            "需要额外确认 x 值或 S/Se 比例",
        ],
        "watch": ["composition x", "band gap", "valence band", "alloy disorder"],
    },
    "SnS2": {
        "family": "layered tin dichalcogenide",
        "traits": [
            "层状锡硫化物半导体",
            "常见关注点包括层数、缺陷、载流子浓度和能带边位置",
            "ARPES 中需要区分体相、薄膜和表面态贡献",
        ],
        "watch": ["band edge", "layer number", "defects", "carrier density"],
    },
    "SnSe": {
        "family": "orthorhombic IV-VI semiconductor",
        "traits": [
            "正交结构 IV-VI 半导体",
            "热电、能带汇聚和拓扑相关电子结构研究较多",
            "ARPES 中重点关注价带汇聚、各向异性和可能的表面态",
        ],
        "watch": ["valence band convergence", "anisotropy", "surface state", "effective mass"],
    },
    "SnS": {
        "family": "orthorhombic tin sulfide",
        "traits": [
            "锡硫化物半导体",
            "与 SnSe 类似但硫化物成分会改变能隙和价带位置",
            "需要注意 SnS 化学式容易和泛 Sn-S 体系混淆",
        ],
        "watch": ["band gap", "valence band", "phase purity", "stoichiometry"],
    },
}


DOPANT_PROPERTIES = {
    "cobaltocene": [
        "二茂钴常作为表面电子给体",
        "需要关注剂量、沉积温度、退火和费米能级移动",
    ],
    "CoCp2": [
        "CoCp2 是 cobaltocene 的常用写法",
        "通常提示可能存在表面电子掺杂或分子吸附",
    ],
    "二茂钴": [
        "二茂钴常作为表面电子给体",
        "建议记录剂量、处理时间和 ARPES 前后能带变化",
    ],
}


def describe_materials(materials: list[str], dopants: list[str]) -> list[dict[str, object]]:
    descriptions = []
    for material in materials:
        properties = MATERIAL_PROPERTIES.get(material, {})
        descriptions.append(
            {
                "name": material,
                "family": properties.get("family", "unknown"),
                "traits": properties.get("traits", []),
                "watch": properties.get("watch", []),
                "dopant_notes": _dopant_notes(dopants),
            }
        )
    return descriptions


def _dopant_notes(dopants: list[str]) -> list[str]:
    notes = []
    seen = set()
    for dopant in dopants:
        for note in DOPANT_PROPERTIES.get(dopant, []):
            key = note.lower()
            if key not in seen:
                notes.append(note)
                seen.add(key)
    return notes
