"""Phase 7: the Foundry (imprint from commit zero), the platform console
(god-mode), audited impersonation, per-client AI config, onboarding importers."""
import pytest
from httpx import ASGITransport, AsyncClient

STAFF = {"Authorization": "Bearer dev-staff-key"}


@pytest.fixture(scope="module")
def client(migrated, event_loop):
    from main import app
    import seed

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
def built(client, go):
    res = go(client.post("/api/platform/foundry", headers=STAFF, json={
        "trading_name": "Coastal Sparks Electrical",
        "legal_name": "Coastal Sparks Electrical Pty Ltd",
        "abn": "12 345 678 901",
        "brand_colour": "#0a5c46",
        "sectors": ["trades"],
        "terminology": {"job": "callout"},
        "yards": ["Busselton yard"],
        "owner_name": "Casey Owner",
        "owner_email": "casey@coastalsparks.local",
        "theme": "daybook",
    }))
    assert res.status_code == 200, res.text
    return res.json()


def test_console_requires_staff_key(client, go):
    assert go(client.get("/api/platform/instances")).status_code == 401
    assert go(client.get("/api/platform/instances", headers={"Authorization": "Bearer wrong"})).status_code == 401


def test_menu_serves_the_catalogue(client, go):
    menu = go(client.get("/api/platform/menu", headers=STAFF)).json()
    assert set(menu["catalogue"]) == {"kernel", "trades", "civil", "fab", "fleet"}
    assert "daybook" in menu["themes"]


def test_foundry_imprints_from_commit_zero(client, go, built):
    m = built["manifest"]
    assert m["slug"] == "coastalsparkselectrical"
    assert m["modules"] == {"kernel": "live", "trades": "live"}
    assert m["code_prefixes"]["job"] == "CS"

    creds = built["credentials"]
    login = go(client.post("/api/auth/login", json={"email": creds["owner_email"], "password": creds["owner_password"]}))
    assert login.status_code == 200
    s = login.json()
    assert s["org"]["name"] == "Coastal Sparks Electrical"
    assert s["org"]["terminology"]["job"] == "callout"
    assert s["org"]["brand"]["tokens"]["--mark"] == "#0a5c46"
    h = {"Authorization": f"Bearer {s['token']}"}

    jobs = go(client.get("/api/jobs", headers=h)).json()
    assert jobs[0]["code"] == "CS-0001"  # their prefix, first commit
    new = go(client.post("/api/jobs", headers=h, json={"title": "Switchboard upgrade"})).json()
    assert new["code"] == "CS-0002"  # the series continues theirs

    assert go(client.get("/api/trades/certs", headers=h)).status_code == 200  # ticked pack is live
    assert go(client.get("/api/civil/plant", headers=h)).status_code == 501  # unticked pack is dark

    pin = go(client.post("/api/auth/pin", json={"org_slug": m["slug"], "pin": creds["crew_pin"]}))
    assert pin.status_code == 200

    dup = go(client.post("/api/platform/foundry", headers=STAFF, json={
        "trading_name": "Coastal Sparks Electrical", "owner_name": "X", "owner_email": "x@x.local",
    }))
    assert dup.status_code == 409


def test_pilot_mode_ships_capture_only(client, go):
    res = go(client.post("/api/platform/foundry", headers=STAFF, json={
        "trading_name": "Pilot Paving", "sectors": ["civil"], "pilot": True,
        "owner_name": "P. Ilot", "owner_email": "pilot@paving.local",
    }))
    assert res.status_code == 200
    m = res.json()["manifest"]
    assert m["modules"] == {"kernel": "live"} and m["pilot"] is True
    creds = res.json()["credentials"]
    s = go(client.post("/api/auth/login", json={"email": creds["owner_email"], "password": creds["owner_password"]})).json()
    assert s["org"]["pilot"] is True
    h = {"Authorization": f"Bearer {s['token']}"}
    assert go(client.get("/api/civil/plant", headers=h)).status_code == 501


def test_instances_health_and_impersonation(client, go, built):
    rows = go(client.get("/api/platform/instances", headers=STAFF)).json()
    demo = next(x for x in rows if x["slug"] == "demo")
    assert demo["users"] >= 2 and demo["jobs"] >= 3
    cs = next(x for x in rows if x["slug"] == "coastalsparkselectrical")
    assert cs["ledger"] == "xero-mock" and cs["pilot"] is False

    imp = go(client.post("/api/platform/instances/demo/impersonate", headers=STAFF))
    assert imp.status_code == 200
    s = imp.json()
    assert s["org"]["slug"] == "demo" and s["user"]["role"] == "owner"
    h = {"Authorization": f"Bearer {s['token']}"}
    audit = go(client.get("/api/org/audit", headers=h)).json()
    assert any(a["action"] == "platform.impersonated" for a in audit)


def test_ai_config_per_instance(client, go, built):
    ai = go(client.request("PATCH", "/api/platform/instances/coastalsparkselectrical/ai", headers=STAFF,
                           json={"chain": ["primary-a", "fallback-b"], "thresholds": {"receipt": 0.9}, "budget_cents": 500000}))
    assert ai.status_code == 200
    body = ai.json()
    assert body["chain"] == ["primary-a", "fallback-b"] and body["budget_cents"] == 500000
    rows = go(client.get("/api/platform/instances", headers=STAFF)).json()
    cs = next(x for x in rows if x["slug"] == "coastalsparkselectrical")
    assert cs["ai"]["thresholds"]["receipt"] == 0.9


def test_onboarding_importers(client, go, built):
    clients_csv = "name,contact_name,email,phone\nHarbour Strata,Jo Kim,jo@harbour.local,0400111222\nHarbour Strata,dupe,,\n,missing,,\n"
    res = go(client.post("/api/platform/instances/coastalsparkselectrical/import/clients", headers=STAFF,
                         files={"file": ("clients.csv", clients_csv.encode(), "text/csv")}))
    assert res.json() == {"imported": 1, "skipped": 2}

    jobs_csv = "code,title,status,client,quoted_dollars\nCS-9001,Old switchboard job,done,Harbour Strata,4200\nCS-9001,dupe,done,,0\nBAD,,nope,,\n"
    res2 = go(client.post("/api/platform/instances/coastalsparkselectrical/import/jobs", headers=STAFF,
                          files={"file": ("jobs.csv", jobs_csv.encode(), "text/csv")}))
    assert res2.json() == {"imported": 1, "skipped": 2}

    imp = go(client.post("/api/platform/instances/coastalsparkselectrical/impersonate", headers=STAFF)).json()
    h = {"Authorization": f"Bearer {imp['token']}"}
    jobs = go(client.get("/api/jobs?filter=all", headers=h)).json()
    old = next(j for j in jobs if j["code"] == "CS-9001")
    assert old["quoted_cents"] == 420000 and old["client_name"] == "Harbour Strata"


def test_brand_theme_editor_roundtrip(client, go, built):
    imp = go(client.post("/api/platform/instances/coastalsparkselectrical/impersonate", headers=STAFF)).json()
    h = {"Authorization": f"Bearer {imp['token']}"}
    res = go(client.request("PATCH", "/api/org", headers=h,
                            json={"brand": {"tokens": {"--mark": "#123456", "--accent": "#654321"}}}))
    assert res.status_code == 200
    me = go(client.get("/api/me", headers=h)).json()
    assert me["org"]["brand"]["tokens"]["--accent"] == "#654321"
    assert me["org"]["brand"]["letterhead_line"].startswith("Coastal Sparks")
