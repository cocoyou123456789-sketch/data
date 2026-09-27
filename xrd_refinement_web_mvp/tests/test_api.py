import io
import numpy as np
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def pattern_bytes():
    x = np.linspace(10, 80, 300)
    y = np.exp(-((x-30)/.5)**2) + .7*np.exp(-((x-55)/.7)**2)
    return "\n".join(f"{a},{b}" for a,b in zip(x,y)).encode()


def test_health_capabilities_and_no_cors():
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert "access-control-allow-origin" not in response.headers
    caps = client.get("/api/v1/capabilities").json()
    assert caps["max_upload_mb"] == 10
    assert caps["gsas_ii"]["recipe"][0] == "Scale"


def test_upload_analyze_and_curve(monkeypatch):
    upload = client.post("/api/v1/datasets", files={"file": ("sample.xy", io.BytesIO(pattern_bytes()), "text/plain")})
    assert upload.status_code == 201
    dataset_id = upload.json()["id"]
    assert upload.json()["qc"]["points"] == 300
    fake = [{"material_id":"mp-1", "formula":"PbIrO3", "space_group":"Pm-3m", "crystal_system":"cubic",
             "energy_above_hull":0.0, "is_stable":True, "structure":object()}]
    monkeypatch.setattr("app.main.MaterialsProjectService.search", lambda self,*a,**k: fake)
    monkeypatch.setattr("app.main.calculate_pattern", lambda structure,radiation: ([30.,55.],[100.,70.]))
    response = client.post("/api/v1/analyses", json={"dataset_id":dataset_id,"elements":["Pb","Ir","O"]})
    assert response.status_code == 201 and response.json()["status"] == "completed"
    aid = response.json()["id"]
    detail = client.get(f"/api/v1/analyses/{aid}").json()
    assert detail["candidates"][0]["material_id"] == "mp-1"
    assert "curve" not in detail["candidates"][0]
    curve = client.get(f"/api/v1/analyses/{aid}/candidates/mp-1/curve")
    assert curve.status_code == 200
    assert len(curve.json()["experimental"]["two_theta"]) == 300


def test_upload_rejects_extension_and_refinement_501(monkeypatch):
    assert client.post("/api/v1/datasets", files={"file": ("bad.exe", b"x", "text/plain")}).status_code == 415
    monkeypatch.setattr("app.main.capability", lambda: {"available":False,"recipe":[]})
    response = client.post("/api/v1/refinements", json={"analysis_id":"a", "candidate_id":"b"})
    assert response.status_code == 501

