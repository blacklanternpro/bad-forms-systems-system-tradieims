"""Trades pack: module gating, variations lifecycle, certificate numbering + PDF.
Runs against the two synthetic trades yards (voltline electrical, sitecast concrete)."""
import pytest
from httpx import ASGITransport, AsyncClient


@pytest.fixture(scope="module")
def client(migrated, event_loop):
    import seed
    from main import app
    from packs.trades import seed_trades

    async def prep():
        await seed.seed_demo_yard()
        return await seed_trades.seed_trades_yards()

    event_loop.run_until_complete(prep())
    transport = ASGITransport(app=app)
    c = AsyncClient(transport=transport, base_url="http://test")
    yield c
    event_loop.run_until_complete(c.aclose())


@pytest.fixture(scope="module")
def go(client, event_loop):
    def run(coro):
        return event_loop.run_until_complete(coro)

    return run


def login(go, client, slug: str) -> dict:
    res = go(client.post("/api/auth/login", json={"email": f"owner@{slug}.local", "password": f"{slug}-owner"}))
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['token']}"}


def test_trades_module_gating(client, go):
    """The generic demo yard has no trades module — pack endpoints refuse it."""
    res = go(client.post("/api/auth/login", json={"email": "owner@demo.local", "password": "demo-owner"}))
    h = {"Authorization": f"Bearer {res.json()['token']}"}
    r = go(client.get("/api/trades/certs", headers=h))
    assert r.status_code == 501 and "NOT COMMISSIONED" in r.text


def test_both_yards_seeded_and_walk(client, go):
    for slug in ("voltline", "sitecast"):
        h = login(go, client, slug)
        jobs = go(client.get("/api/jobs", headers=h)).json()
        assert len(jobs) == 2, slug
        variations = go(client.get("/api/trades/variations", headers=h)).json()
        assert len(variations) == 1 and variations[0]["status"] == "proposed", slug
        certs = go(client.get("/api/trades/certs", headers=h)).json()
        assert len(certs) == 1 and certs[0]["status"] == "draft", slug
        pub = go(client.get(f"/api/public/quote/{slug}-quote-token")).json()
        assert pub["status"] == "sent", slug


def test_variation_approval_grows_job_value(client, go):
    h = login(go, client, "voltline")
    jobs = go(client.get("/api/jobs", headers=h)).json()
    live = next(j for j in jobs if j["code"] == "J-0001")
    before = live["quoted_cents"]

    v = go(client.get("/api/trades/variations", headers=h)).json()[0]
    res = go(client.post(f"/api/trades/variations/{v['id']}/decide", headers=h, json={"decision": "approved", "decided_by_name": "M. Chen"}))
    assert res.status_code == 200

    after = next(j for j in go(client.get("/api/jobs", headers=h)).json() if j["code"] == "J-0001")["quoted_cents"]
    assert after == before + v["amount_cents"]

    again = go(client.post(f"/api/trades/variations/{v['id']}/decide", headers=h, json={"decision": "declined", "decided_by_name": "X"}))
    assert again.status_code == 409


def test_crew_can_raise_variation_from_field(client, go):
    res = go(client.post("/api/auth/pin", json={"org_slug": "sitecast", "pin": "4321"}))
    hc = {"Authorization": f"Bearer {res.json()['token']}"}
    jobs = go(client.get("/api/field/today", headers=hc)).json()["jobs"]
    r = go(client.post("/api/trades/variations", headers=hc, json={"job_id": jobs[0]["job_id"], "title": "Pump hire for rear access", "amount_cents": 38000}))
    assert r.status_code == 200 and r.json()["code"] == "V-0002"

    h = login(go, client, "sitecast")
    notes = go(client.get("/api/notifications", headers=h)).json()
    assert any(n["event_type"] == "variation_raised" for n in notes)


def test_certificate_numbering_issue_and_pdf(client, go):
    h = login(go, client, "voltline")
    jobs = go(client.get("/api/jobs", headers=h)).json()
    created = go(client.post("/api/trades/certs", headers=h, json={
        "kind": "electrical_compliance",
        "job_id": jobs[0]["id"],
        "fields": {"installation_address": "7/22 Harbour Rd", "work_description": "Final fix and test", "result": "pass"},
    })).json()
    assert created["code"] == "CEC-0002"  # per-org series continues from the seed

    bad = go(client.post("/api/trades/certs", headers=h, json={"kind": "star_sign_reading", "fields": {}}))
    assert bad.status_code == 400

    issued = go(client.post(f"/api/trades/certs/{created['id']}/issue", headers=h))
    assert issued.status_code == 200 and issued.json()["status"] == "issued"

    locked = go(client.patch(f"/api/trades/certs/{created['id']}", headers=h, json={"fields": {"result": "fail"}}))
    assert locked.status_code == 404  # issued certs are immutable

    pdf = go(client.get(f"/api/trades/certs/{created['id']}/pdf", headers=h))
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"


def test_sitecast_terminology_carried_on_org(client, go):
    h = login(go, client, "sitecast")
    me = go(client.get("/api/me", headers=h)).json()
    assert me["org"]["terminology"]["job"] == "pour"
    assert me["org"]["modules"]["trades"] == "live"
