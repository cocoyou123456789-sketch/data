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
    "Bi2Se3": {
        "family": "topological insulator",
        "traits": [
            "Bi-Se 拓扑绝缘体经典体系",
            "ARPES 中常关注 Dirac surface state、Dirac point 和体带贡献",
        ],
        "watch": ["Dirac point", "surface state", "bulk band", "Fermi level"],
    },
    "Bi2Te3": {
        "family": "topological insulator / thermoelectric",
        "traits": [
            "Bi-Te 层状材料，常用于拓扑表面态和热电相关研究",
            "Te 参与时需要关注强自旋轨道耦合和表面态色散",
        ],
        "watch": ["surface state", "spin-orbit coupling", "Dirac cone"],
    },
    "Sb2Te3": {
        "family": "topological insulator",
        "traits": [
            "Sb-Te 拓扑绝缘体相关体系",
            "常与 Bi2Te3/Bi2Se3 做合金化或能级调控比较",
        ],
        "watch": ["Dirac cone", "hole doping", "surface state"],
    },
    "WTe2": {
        "family": "transition-metal dichalcogenide",
        "traits": [
            "W-Te 层状过渡金属硫族化物",
            "ARPES 中常关注 Weyl/拓扑半金属、费米面和温度相变",
        ],
        "watch": ["Fermi surface", "Weyl points", "band inversion"],
    },
    "MoS2": {
        "family": "transition-metal dichalcogenide",
        "traits": [
            "经典二维 TMD 半导体",
            "ARPES 中常关注层数依赖、谷结构和价带自旋轨道劈裂",
        ],
        "watch": ["valley", "spin-orbit splitting", "layer dependence"],
    },
    "MoSe2": {
        "family": "transition-metal dichalcogenide",
        "traits": [
            "Mo-Se 二维 TMD 半导体",
            "常用于比较 Se/S/Te 替换对能带和激子物理的影响",
        ],
        "watch": ["valley", "band edge", "spin-orbit splitting"],
    },
    "FeSe": {
        "family": "iron-based superconductor",
        "traits": [
            "铁基超导关键体系",
            "ARPES 中常关注费米面、超导能隙、nematicity 和单层 FeSe/STO 界面效应",
        ],
        "watch": ["Fermi surface", "superconducting gap", "nematicity"],
    },
    "FeTe": {
        "family": "iron chalcogenide",
        "traits": [
            "Fe-Te 铁硫族化物体系",
            "常与 FeSe 或 FeSeTe 合金体系一起研究磁性和超导相关能带",
        ],
        "watch": ["magnetism", "Fermi surface", "band renormalization"],
    },
    "Bi2212": {
        "family": "cuprate superconductor",
        "traits": [
            "铜氧化物高温超导 ARPES 经典体系",
            "常用于研究 d-wave superconducting gap、pseudogap 和 nodal/antinodal 谱函数",
        ],
        "watch": ["superconducting gap", "pseudogap", "nodal dispersion", "antinodal spectra"],
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
