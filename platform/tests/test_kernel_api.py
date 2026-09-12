"""Kernel pipeline, end to end over the ASGI app against embedded Postgres:
login -> quote -> public accept -> job -> capture -> verify -> ledger draft ->
PO match -> invoice push -> chase -> nudge -> field -> plate."""
import pytest
from httpx import ASGITransport, AsyncClient


@pytest.fixture(scope="module")
def client(migrated, event_loop):
    import seed
    from main import app

    event_loop.run_until_complete(seed.seed_demo_yard())
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
    res = go(client.post("/api/auth/login", json={"email": "owner@demo.local", "password": "demo-owner"}))
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['token']}"}


@pytest.fixture(scope="module")
def crew_h(client, go):
    res = go(client.post("/api/auth/pin", json={"org_slug": "demo", "pin": "1111"}))
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['token']}"}


def test_health_and_me(client, go, owner_h):
    assert go(client.get("/api/health")).json()["ok"] is True
    me = go(client.get("/api/me", headers=owner_h)).json()
    assert me["user"]["role"] == "owner" and me["org"]["slug"] == "demo"


def test_auth_rejects_bad_credentials_and_roles(client, go, crew_h):
    assert go(client.post("/api/auth/login", json={"email": "owner@demo.local", "password": "wrong"})).status_code == 401
    assert go(client.get("/api/quotes")).status_code == 401
    assert go(client.get("/api/quotes", headers=crew_h)).status_code == 403


def test_quote_follow_up_flag_and_public_accept(client, go, owner_h):
    quotes = go(client.get("/api/quotes", headers=owner_h)).json()
    q = next(x for x in quotes if x["code"] == "Q-0001")
    assert q["follow_up"] is True and q["total_ex_cents"] == 435200

    pub = go(client.get("/api/public/quote/demo-quote-token")).json()
    assert pub["code"] == "Q-0001" and len(pub["lines"]) == 3

    res = go(client.post("/api/public/quote/demo-quote-token/accept", json={"name": "R. Okafor"}))
    assert res.status_code == 200
    pub = go(client.get("/api/public/quote/demo-quote-token")).json()
    assert pub["status"] == "accepted"

    job = go(client.post(f"/api/quotes/{q['id']}/to-job", headers=owner_h)).json()
    assert job["code"].startswith("J-") and job["quoted_cents"] == 435200


def test_capture_fast_track_verify_allocates_ledger_draft(client, go, owner_h):
    jobs = go(client.get("/api/jobs", headers=owner_h)).json()
    live = next(j for j in jobs if j["code"] == "J-0001")
    res = go(client.post(
        "/api/captures", headers=owner_h,
        data={"capture_type": "receipt", "job_id": live["id"]},
        files={"file": ("receipt.jpg", b"\xff\xd8fakejpeg", "image/jpeg")},
    ))
    assert res.status_code == 200, res.text
    cap = res.json()
    assert cap["routing"] == "fast_track" and cap["confidence"] == 0.94

    ver = go(client.post(f"/api/captures/{cap['id']}/verify", headers=owner_h, json={}))
    assert ver.status_code == 200, ver.text
    assert ver.json()["allocation"]["kind"] == "ledger_draft"

    drafts = go(client.get("/api/ledger/drafts", headers=owner_h)).json()
    assert any(d["kind"] == "ACCPAY" for d in drafts)

    # Three-way match closes the PO against the verified receipt.
    pos = go(client.get("/api/pos", headers=owner_h)).json()
    po = next(p for p in pos if p["code"] == "PO-0001")
    m = go(client.post(f"/api/pos/{po['id']}/match", headers=owner_h, json={"capture_id": cap["id"]}))
    assert m.status_code == 200


def test_low_confidence_capture_routes_to_review_with_notification(client, go, owner_h):
    res = go(client.post("/api/captures", headers=owner_h, data={"capture_type": "mystery_docket"}))
    assert res.json()["routing"] == "review"
    queue = go(client.get("/api/captures?status=needs_verify", headers=owner_h)).json()
    assert any(c["capture_type"] == "mystery_docket" for c in queue)
    notes = go(client.get("/api/notifications", headers=owner_h)).json()
    assert any(n["event_type"] == "capture_review" for n in notes)


def test_invoice_push_and_chase(client, go, owner_h):
    jobs = go(client.get("/api/jobs", headers=owner_h)).json()
    done = next(j for j in jobs if j["code"] == "J-0003")

    chase = go(client.get("/api/invoicing/chase", headers=owner_h)).json()
    assert any(x["code"] == "J-0003" for x in chase["uninvoiced"])

    inv = go(client.post("/api/invoices", headers=owner_h, json={"job_id": done["id"]})).json()
    assert inv["total_ex_cents"] == 42000
    push = go(client.post(f"/api/invoices/{inv['id']}/push", headers=owner_h)).json()
    assert push["ledger_ref"]

    jobs = go(client.get("/api/jobs", headers=owner_h)).json()
    assert next(j for j in jobs if j["code"] == "J-0003")["status"] == "invoiced"

    go(client.post(f"/api/ledger/mock/invoices/{inv['id']}/status", headers=owner_h, json={"status": "overdue"}))
    chase = go(client.get("/api/invoicing/chase", headers=owner_h)).json()
    assert any(x["code"] == inv["code"] for x in chase["overdue"])
    assert chase["on_table_cents"] >= 42000


def test_nudge_surfaces_recalls_quotes_reviews_licences(client, go, owner_h):
    n = go(client.get("/api/nudge", headers=owner_h)).json()
    assert n["review_count"] >= 1
    assert any(l for l in n["licences_expiring"])


def test_field_day_and_time_tracking(client, go, crew_h):
    today = go(client.get("/api/field/today", headers=crew_h)).json()
    assert any(j["code"] == "J-0001" for j in today["jobs"])
    jid = next(j["job_id"] for j in today["jobs"] if j["code"] == "J-0001")

    pack = go(client.get(f"/api/field/jobs/{jid}", headers=crew_h)).json()
    assert pack["job"]["gate_code"] == "#4471"

    start = go(client.post(f"/api/field/jobs/{jid}/time", headers=crew_h, json={"action": "start"}))
    assert start.status_code == 200, start.text
    stop = go(client.post(f"/api/field/jobs/{jid}/time", headers=crew_h, json={"action": "stop"}))
    assert stop.status_code == 200, stop.text


def test_site_plate_sign_in_and_out(client, go):
    board = go(client.get("/api/public/plate/demo-plate-token")).json()
    assert board["site_name"] == "Seaview Apartments"

    s = go(client.post("/api/public/plate/demo-plate-token/sign-in", json={"name": "Visiting Sparky", "kind": "visitor"})).json()
    board = go(client.get("/api/public/plate/demo-plate-token")).json()
    assert any(p["name"] == "Visiting Sparky" for p in board["on_site"])

    out = go(client.post("/api/public/plate/demo-plate-token/sign-out", json={"sign_in_id": s["sign_in_id"]}))
    assert out.status_code == 200
    board = go(client.get("/api/public/plate/demo-plate-token")).json()
    assert not any(p["name"] == "Visiting Sparky" for p in board["on_site"])


def test_reports_and_search_and_export(client, go, owner_h):
    wip = go(client.get("/api/reports/wip", headers=owner_h)).json()
    assert wip["jobs"] and wip["total_quoted_cents"] > 0
    hits = go(client.get("/api/search?q=Seaview", headers=owner_h)).json()
    assert hits["jobs"] or hits["clients"]
    exp = go(client.get("/api/org/export", headers=owner_h))
    assert exp.status_code == 200 and exp.json()["clients"]
