"""Fleet pack: multi-depot register with attachments, float charging maths,
hour-meter services fed by pre-start readings, corrective actions, and the
composed CoR/SMS evidence vault."""
import pytest
from httpx import ASGITransport, AsyncClient

from packs.fleet.routes import float_charge


def test_float_charge_maths():
    assert float_charge(35000, 650, 38) == 35000 + 24700
    assert float_charge(0, 0, 120) == 0
    assert float_charge(50000, 700, 0) == 50000  # yard shuffle: flat mobilisation only


@pytest.fixture(scope="module")
def client(migrated, event_loop):
    from main import app
    from packs.fab import seed_fab
    from packs.fleet import seed_fleet

    event_loop.run_until_complete(seed_fleet.seed_redline())
    # A yard without the fleet module, for the gating test (idempotent by slug).
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
    res = go(client.post("/api/auth/login", json={"email": "owner@redline.local", "password": "redline-owner"}))
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['token']}"}


@pytest.fixture(scope="module")
def driver_h(client, go):
    res = go(client.post("/api/auth/pin", json={"org_slug": "redline", "pin": "8888"}))
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['token']}"}


def test_register_scopes_by_yard_and_links_attachments(client, go, owner_h):
    assets = go(client.get("/api/fleet/assets", headers=owner_h)).json()
    assert len(assets) == 4
    picton = go(client.get("/api/fleet/assets?yard=Picton Depot", headers=owner_h)).json()
    assert {a["meta"]["code"] for a in picton} == {"EX-12", "ATT-07"}

    hitch = next(a for a in picton if a["meta"]["code"] == "ATT-07")
    assert hitch["carrier_name"] == "Cat 336 excavator"
    ex = next(a for a in picton if a["meta"]["code"] == "EX-12")

    detach = go(client.post(f"/api/fleet/assets/{hitch['id']}/attach", headers=owner_h, json={"carrier_id": None}))
    assert detach.status_code == 200
    hitch2 = next(a for a in go(client.get("/api/fleet/assets", headers=owner_h)).json() if a["id"] == hitch["id"])
    assert hitch2["carrier_name"] is None
    go(client.post(f"/api/fleet/assets/{hitch['id']}/attach", headers=owner_h, json={"carrier_id": ex["id"]}))

    yards = go(client.get("/api/fleet/yards", headers=owner_h)).json()
    assert yards == ["Bunbury Depot", "Picton Depot"]


def test_prestart_meter_feeds_workshop_queue(client, go, owner_h, driver_h):
    q = go(client.get("/api/fleet/workshop", headers=owner_h)).json()
    assert [d["plan_name"] for d in q["due_services"]] == ["250h service"]  # EX-12 is 10h over

    # PM-01 sits 180h short of its A service; a pre-start meter reading pushes it over.
    assets = go(client.get("/api/fleet/assets", headers=owner_h)).json()
    pm = next(a for a in assets if a["meta"]["code"] == "PM-01")
    res = go(client.post("/api/civil/prestarts", headers=driver_h,
                         json={"asset_id": pm["id"], "checks": [{"name": "Walk-around", "ok": True}], "meter_hours": 9310}))
    assert res.status_code == 200
    q2 = go(client.get("/api/fleet/workshop", headers=owner_h)).json()
    assert {d["plan_name"] for d in q2["due_services"]} == {"250h service", "A service"}

    a_service = next(d for d in q2["due_services"] if d["plan_name"] == "A service")
    done = go(client.post(f"/api/fleet/service-plans/{a_service['plan_id']}/complete", headers=owner_h,
                          json={"notes": "Oil, filters, greased driveline"}))
    assert done.status_code == 200 and done.json()["serviced_at_hours"] == 9310
    q3 = go(client.get("/api/fleet/workshop", headers=owner_h)).json()
    assert [d["plan_name"] for d in q3["due_services"]] == ["250h service"]


def test_float_booking_charges_and_completes(client, go, owner_h):
    assets = go(client.get("/api/fleet/assets", headers=owner_h)).json()
    pm = next(a for a in assets if a["meta"]["code"] == "PM-01")
    jobs = go(client.get("/api/jobs", headers=owner_h)).json()
    rh = next(j for j in jobs if j["code"] == "RH-0001")

    booked = go(client.post("/api/fleet/floats", headers=owner_h, json={
        "asset_id": pm["id"], "job_id": rh["id"], "from_yard": "Bunbury Depot", "to_site": "Kemerton SIA pad 7",
        "float_date": "2026-09-14", "km": 52, "mobilisation_cents": 30000, "cents_per_km": 600,
    }))
    assert booked.status_code == 200
    f = booked.json()
    assert f["code"] == "FL-0002" and f["charge_cents"] == 30000 + 52 * 600

    assert go(client.post(f"/api/fleet/floats/{f['id']}/complete", headers=owner_h)).status_code == 200
    assert go(client.post(f"/api/fleet/floats/{f['id']}/complete", headers=owner_h)).status_code == 404

    detail = go(client.get(f"/api/jobs/{rh['id']}", headers=owner_h)).json()
    assert any(e["kind"] == "float.booked" for e in detail["timeline"])


def test_corrective_action_lifecycle(client, go, owner_h):
    open_cas = go(client.get("/api/fleet/corrective-actions", headers=owner_h)).json()
    seeded = next(c for c in open_cas if c["code"] == "CA-0001")

    raised = go(client.post("/api/fleet/corrective-actions", headers=owner_h,
                            json={"title": "Speed exceedance follow-up", "source": "audit"}))
    assert raised.status_code == 200 and raised.json()["code"] == "CA-0002"

    empty = go(client.post(f"/api/fleet/corrective-actions/{seeded['id']}/close", headers=owner_h, json={"note": "  "}))
    assert empty.status_code == 400  # the fix must be written down
    closed = go(client.post(f"/api/fleet/corrective-actions/{seeded['id']}/close", headers=owner_h,
                            json={"note": "Binder replaced, spare ordered"}))
    assert closed.status_code == 200
    assert not any(c["code"] == "CA-0001" for c in go(client.get("/api/fleet/corrective-actions", headers=owner_h)).json())


def test_evidence_vault_composes_and_packs(client, go, owner_h, driver_h):
    cap = go(client.post("/api/captures", headers=driver_h, data={"capture_type": "load_restraint"},
                         files={"file": ("load.jpg", b"\xff\xd8x", "image/jpeg")})).json()
    assert cap["routing"] == "fast_track"
    ver = go(client.post(f"/api/captures/{cap['id']}/verify", headers=owner_h, json={}))
    assert ver.json()["allocation"]["kind"] == "sms_evidence"

    vault = go(client.get("/api/fleet/evidence", headers=owner_h)).json()
    counts = vault["counts"]
    assert all(counts[o] > 0 for o in ("fit_drivers", "safe_vehicles", "mass_and_restraint", "speed_and_fatigue", "review_and_improve"))
    sources = {i["source"] for i in vault["items"]}
    assert {"vault", "prestarts", "workshop", "corrective_actions"} <= sources

    mass = go(client.get("/api/fleet/evidence?outcome=mass_and_restraint", headers=owner_h)).json()
    assert all(i["outcome"] == "mass_and_restraint" for i in mass["items"])
    assert go(client.get("/api/fleet/evidence?outcome=vibes", headers=owner_h)).status_code == 400

    pdf = go(client.get("/api/fleet/evidence/pack.pdf", headers=owner_h))
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"


def test_fleet_gated_off_other_yards(client, go):
    res = go(client.post("/api/auth/login", json={"email": "owner@steelhaus.local", "password": "steelhaus-owner"}))
    h = {"Authorization": f"Bearer {res.json()['token']}"}
    assert go(client.get("/api/fleet/assets", headers=h)).status_code == 501
