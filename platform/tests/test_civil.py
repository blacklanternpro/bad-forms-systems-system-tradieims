"""Civil pack: rate engine maths, dispatch-blocking pre-starts, sign-on-glass
docket lifecycle, quarry ticket allocation from the capture pipeline."""
import base64

import pytest
from httpx import ASGITransport, AsyncClient

SIG_PNG = "data:image/png;base64," + base64.b64encode(b"\x89PNG\r\n\x1a\nfakesig").decode()


@pytest.fixture(scope="module")
def client(migrated, event_loop):
    from main import app
    from packs.civil import seed_civil

    event_loop.run_until_complete(seed_civil.seed_kemerton())
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
    res = go(client.post("/api/auth/login", json={"email": "owner@kemgrade.local", "password": "kemgrade-owner"}))
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['token']}"}


@pytest.fixture(scope="module")
def crew_h(client, go):
    res = go(client.post("/api/auth/pin", json={"org_slug": "kemgrade", "pin": "7777"}))
    return {"Authorization": f"Bearer {res.json()['token']}"}


def test_rate_engine_maths():
    from packs.civil.routes import docket_total

    wet = {"rate_cents_per_hour": 24500, "min_hours": 4, "standby_cents_per_hour": 9500, "travel_cents": 45000}
    assert docket_total(wet, 6.5, 1.5, False) == round(6.5 * 24500 + 1.5 * 9500)
    # Minimum hours bite: 2h on the clock still bills 4h.
    assert docket_total(wet, 2, 0, False) == 4 * 24500
    assert docket_total(wet, 2, 0, True) == 4 * 24500 + 45000


def test_plant_register_with_prestart_status(client, go, owner_h):
    plant = go(client.get("/api/civil/plant", headers=owner_h)).json()
    assert len(plant) == 3
    ex = next(p for p in plant if p["meta"]["code"] == "EX-04")
    assert ex["prestart_today"] == "pass"
    rates = go(client.get(f"/api/civil/plant/{ex['id']}/rates", headers=owner_h)).json()
    assert {r["mode"] for r in rates} == {"wet", "dry"}


def test_failed_prestart_blocks_dispatch(client, go, owner_h, crew_h):
    plant = go(client.get("/api/civil/plant", headers=owner_h)).json()
    roller = next(p for p in plant if p["meta"]["code"] == "RL-02")
    jobs = go(client.get("/api/jobs", headers=owner_h)).json()
    jid = jobs[0]["id"]

    # No pre-start at all → docket refused.
    r = go(client.post("/api/civil/dockets", headers=crew_h, json={"job_id": jid, "asset_id": roller["id"], "mode": "dry", "hours": 8}))
    assert r.status_code == 409 and "pre-start" in r.text.lower()

    fail = go(client.post("/api/civil/prestarts", headers=crew_h, json={
        "asset_id": roller["id"], "job_id": jid,
        "checks": [{"name": "Fluids: engine oil, hydraulic, coolant", "ok": False}],
        "faults": ["Hydraulic weep on drum motor"], "meter_hours": 1410.0,
    }))
    assert fail.json()["dispatch_blocked"] is True

    r = go(client.post("/api/civil/dockets", headers=crew_h, json={"job_id": jid, "asset_id": roller["id"], "mode": "dry", "hours": 8}))
    assert r.status_code == 409 and "blocked" in r.text.lower()

    notes = go(client.get("/api/notifications", headers=owner_h)).json()
    assert any(n["event_type"] == "prestart_failed" for n in notes)

    # Fault fixed, fresh pass → dispatch reopens.
    go(client.post("/api/civil/prestarts", headers=crew_h, json={"asset_id": roller["id"], "job_id": jid, "checks": [{"name": "Fluids", "ok": True}]}))
    r = go(client.post("/api/civil/dockets", headers=crew_h, json={"job_id": jid, "asset_id": roller["id"], "mode": "dry", "hours": 8}))
    assert r.status_code == 200


def test_docket_sign_and_approve_lifecycle(client, go, owner_h, crew_h):
    dockets = go(client.get("/api/civil/dockets?status=draft", headers=owner_h)).json()
    d = next(x for x in dockets if x["code"] == "HD-0001")
    assert d["total_cents"] == round(6.5 * 24500 + 1.5 * 9500)
    assert d["tally"]["loads"] == 14

    # Approval before signature is refused — the glass comes first.
    early = go(client.post(f"/api/civil/dockets/{d['id']}/approve", headers=owner_h))
    assert early.status_code == 404

    signed = go(client.post(f"/api/civil/dockets/{d['id']}/sign", headers=crew_h, json={"signed_by_name": "S. Pillai", "signature_png": SIG_PNG}))
    assert signed.status_code == 200

    approved = go(client.post(f"/api/civil/dockets/{d['id']}/approve", headers=owner_h))
    assert approved.status_code == 200

    pdf = go(client.get(f"/api/civil/dockets/{d['id']}/pdf", headers=owner_h))
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"

    final = go(client.get("/api/civil/dockets?status=approved", headers=owner_h)).json()
    assert any(x["code"] == "HD-0001" for x in final)


def test_quarry_ticket_capture_allocates_tonnage(client, go, owner_h, crew_h):
    jobs = go(client.get("/api/jobs", headers=owner_h)).json()
    cap = go(client.post("/api/captures", headers=crew_h, data={"capture_type": "quarry_ticket", "job_id": jobs[0]["id"]},
                         files={"file": ("t.jpg", b"\xff\xd8x", "image/jpeg")})).json()
    assert cap["routing"] == "fast_track"
    ver = go(client.post(f"/api/captures/{cap['id']}/verify", headers=owner_h, json={}))
    assert ver.json()["allocation"]["kind"] == "quarry_ticket"
    tickets = go(client.get("/api/civil/quarry-tickets", headers=owner_h)).json()
    assert any(float(t["tonnes"]) == 31.4 for t in tickets)


def test_sor_library_search(client, go, owner_h):
    hits = go(client.get("/api/civil/sor?q=roadbase", headers=owner_h)).json()
    assert len(hits) == 1 and hits[0]["unit"] == "t"
    created = go(client.post("/api/civil/sor", headers=owner_h, json={"code": "SOR-410", "description": "Dust suppression water cart", "unit": "hr", "rate_cents": 16500}))
    assert created.status_code == 200
