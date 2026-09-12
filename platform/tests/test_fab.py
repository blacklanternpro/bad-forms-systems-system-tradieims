"""Fab pack: ITP application onto kernel stages, heat cert allocation,
offcut traceability, NDI records, MDR pack assembly."""
import pytest
from httpx import ASGITransport, AsyncClient


@pytest.fixture(scope="module")
def client(migrated, event_loop):
    from main import app
    from packs.fab import seed_fab

    event_loop.run_until_complete(seed_fab.seed_steelhaus())
    transport = ASGITransport(app=app)
    c = AsyncClient(transport=transport, base_url="http://test")
    yield c
    event_loop.run_until_complete(c.aclose())


@pytest.fixture(scope="module")
def go(client, event_loop):
    def run(coro):
        return event_loop.run_until_complete(coro)

    return run


@pytest.fixture(scope="module")
def owner_h(client, go):
    res = go(client.post("/api/auth/login", json={"email": "owner@steelhaus.local", "password": "steelhaus-owner"}))
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['token']}"}


def test_itp_template_applies_stages(client, go, owner_h):
    tpls = go(client.get("/api/fab/itp-templates", headers=owner_h)).json()
    assert tpls and tpls[0]["name"] == "Structural steel CC2"

    job = go(client.post("/api/jobs", headers=owner_h, json={"title": "Pipe rack module", "quoted_cents": 900000})).json()
    res = go(client.post("/api/fab/apply-itp", headers=owner_h, json={"job_id": job["id"], "template_id": tpls[0]["id"]}))
    assert res.status_code == 200 and res.json()["stages"] == 6

    detail = go(client.get(f"/api/jobs/{job['id']}", headers=owner_h)).json()
    assert len(detail["stages"]) == 6
    assert detail["stages"][0]["requires_photo"] is True

    again = go(client.post("/api/fab/apply-itp", headers=owner_h, json={"job_id": job["id"], "template_id": tpls[0]["id"]}))
    assert again.status_code == 409  # never double-stamp an ITP


def test_heat_cert_capture_becomes_material_lot(client, go, owner_h):
    jobs = go(client.get("/api/jobs", headers=owner_h)).json()
    wo = next(j for j in jobs if j["code"] == "WO-0001")
    cap = go(client.post("/api/captures", headers=owner_h, data={"capture_type": "heat_cert", "job_id": wo["id"]},
                         files={"file": ("cert.jpg", b"\xff\xd8x", "image/jpeg")})).json()
    assert cap["routing"] == "fast_track"
    ver = go(client.post(f"/api/captures/{cap['id']}/verify", headers=owner_h, json={}))
    assert ver.json()["allocation"]["kind"] == "material_lot"

    lots = go(client.get(f"/api/fab/materials?job_id={wo['id']}", headers=owner_h)).json()
    assert any(m["heat_no"] == "HT-98442" for m in lots)  # from the fixture
    assert any(m["heat_no"] == "HT-77120" for m in lots)  # from the seed


def test_offcut_allocation_carries_heat_number(client, go, owner_h):
    offcuts = go(client.get("/api/fab/offcuts", headers=owner_h)).json()
    assert offcuts and offcuts[0]["heat_no"] == "HT-77120"

    target = go(client.post("/api/jobs", headers=owner_h, json={"title": "Handrail repair", "quoted_cents": 40000})).json()
    res = go(client.post(f"/api/fab/offcuts/{offcuts[0]['id']}/allocate", headers=owner_h, json={"job_id": target["id"]}))
    assert res.status_code == 200

    lots = go(client.get(f"/api/fab/materials?job_id={target['id']}", headers=owner_h)).json()
    assert any(m["heat_no"] == "HT-77120" for m in lots)

    gone = go(client.get("/api/fab/offcuts", headers=owner_h)).json()
    assert not any(o["id"] == offcuts[0]["id"] for o in gone)


def test_ndi_and_mdr_pack(client, go, owner_h):
    jobs = go(client.get("/api/jobs", headers=owner_h)).json()
    wo = next(j for j in jobs if j["code"] == "WO-0001")

    bad = go(client.post("/api/fab/ndi", headers=owner_h, json={"job_id": wo["id"], "method": "XRAYVISION", "result": "pass"}))
    assert bad.status_code == 400
    ok = go(client.post("/api/fab/ndi", headers=owner_h, json={"job_id": wo["id"], "method": "UT", "result": "pass", "report_ref": "NDI-2212", "inspector": "J. Okon"}))
    assert ok.status_code == 200

    pdf = go(client.get(f"/api/fab/jobs/{wo['id']}/mdr.pdf", headers=owner_h))
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"
