from pathlib import Path

from arpext.config import load_materials
from arpext.extract import extract_from_text


def test_extracts_core_arpes_fields():
    materials = load_materials(Path("config/materials.json"))
    text = """
    Direct observation of band structure in cobaltocene-doped SnSe2
    DOI: 10.1234/example.2026.1
    Angle-resolved photoemission spectroscopy (ARPES) measurements were performed
    at 20 K with photon energy of 70 eV on beamline BL03U. Samples were grown by
    chemical vapor transport and doped by cobaltocene. The band gap of 0.8 eV was observed.
    """

    record = extract_from_text(text, "sample.txt", materials)

    assert record.title == "Direct observation of band structure in cobaltocene-doped SnSe2"
    assert record.doi == "10.1234/example.2026.1"
    assert record.materials == ["SnSe2"]
    assert "cobaltocene" in record.dopants
    assert "ARPES" in record.techniques
    assert record.photon_energies_eV == ["70"]
    assert record.temperatures_K == ["20"]
    assert record.band_gaps == ["0.8 eV"]
