"""Live smoke — the phase parity gate. Boots uvicorn on :8010 against embedded
Postgres, seeds the generic demo yard plus every sector demo yard, and
walks the entire surface as a real HTTP client (55+ checks).

Run: python3 tests/smoke.py
"""
import asyncio
import io
import os
import subprocess
import sys
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).parent.parent
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

os.environ.setdefault("EXTRACTOR_MODE", "fixture")
os.environ.setdefault("STORAGE_MODE", "local")
os.environ.setdefault("LOCAL_STORAGE_DIR", "/tmp/badform-platform-smoke-storage")

BASE = "http://127.0.0.1:8010"
PASS = 0
FAIL: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    global PASS
    if ok:
        PASS += 1
        print(f"  ok   {name}")
    else:
        FAIL.append(name)
        print(f"  FAIL {name}  {detail}")


def ensure_db() -> None:
    if os.environ.get("DATABASE_URL"):
        return
    from embedded_postgres import get_server

    epg = get_server(Path("/tmp/badform-platform-epg"), cleanup_mode=None)
    uri = epg.get_uri()
    os.environ["DATABASE_URL"] = uri.replace("/postgres?", "/badform_smoke?")
    import asyncpg

    async def prep():
        admin = await asyncpg.connect(uri)
        exists = await admin.fetchval("SELECT 1 FROM pg_database WHERE datname='badform_smoke'")
        if not exists:
            await admin.execute("CREATE DATABASE badform_smoke")
        await admin.close()

    asyncio.run(prep())


def reset_and_seed() -> None:
    import db
    import seed
    from packs.civil import seed_civil
    from packs.fab import seed_fab
    from packs.fleet import seed_fleet
    from packs.trades import seed_trades

    async def run():
        p = await db.pool()
        await p.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
        await db.migrate()
        await seed.seed_demo_yard()
        await seed_trades.seed_trades_yards()
        await seed_civil.seed_kemerton()
        await seed_fab.seed_steelhaus()
        await seed_fleet.seed_redline()
        await db.close()

    asyncio.run(run())


def wait_for_server(proc: subprocess.Popen) -> bool:
    for _ in range(60):
        if proc.poll() is not None:
            return False
        try:
            if httpx.get(f"{BASE}/api/health", timeout=1).status_code == 200:
                return True
        except httpx.HTTPError:
            time.sleep(0.5)
    return False


def hdr(c: httpx.Client, email: str, password: str) -> dict:
    r = c.post("/api/auth/login", json={"email": email, "password": password})
    return {"Authorization": f"Bearer {r.json()['token']}"}


def kernel_checks(c: httpx.Client) -> None:
    print("— kernel: auth, desk, jobs, board —")
    check("health", c.get("/api/health").json()["ok"] is True)

    check("owner login", c.post("/api/auth/login", json={"email": "owner@demo.local", "password": "demo-owner"}).status_code == 200)
    h = hdr(c, "owner@demo.local", "demo-owner")
    check("bad password rejected", c.post("/api/auth/login", json={"email": "owner@demo.local", "password": "nope"}).status_code == 401)

    r = c.post("/api/auth/pin", json={"org_slug": "demo", "pin": "1111"})
    check("crew PIN login", r.status_code == 200)
    hc = {"Authorization": f"Bearer {r.json()['token']}"}
    check("wrong PIN rejected", c.post("/api/auth/pin", json={"org_slug": "demo", "pin": "9999"}).status_code == 401)
    check("crew blocked from office API", c.get("/api/quotes", headers=hc).status_code == 403)
    check("anonymous blocked", c.get("/api/jobs").status_code == 401)

    check("morning nudge", "review_count" in c.get("/api/nudge", headers=h).json())
    jobs = c.get("/api/jobs", headers=h).json()
    check("jobs list seeded", len(jobs) >= 3)
    live = next(j for j in jobs if j["code"] == "J-0001")
    detail = c.get(f"/api/jobs/{live['id']}", headers=h).json()
    check("job detail + live costing", "costing" in detail and detail["costing"]["quoted_cents"] > 0)
    check("job timeline present", isinstance(detail["timeline"], list))

    check("day board", c.get("/api/dayboard", headers=h).json()["jobs"])
    check("week board", len(c.get("/api/weekboard", headers=h).json()["days"]) == 7)
    check("copy yesterday", c.post("/api/dayboard/copy-previous", headers=h).status_code == 200)
    pdf = c.get("/api/dayboard/sheet.pdf", headers=h)
    check("day sheet PDF", pdf.status_code == 200 and pdf.content[:4] == b"%PDF")

    print("— kernel: clients, quotes, price books —")
    clients = c.get("/api/clients", headers=h).json()
    check("clients list", len(clients) >= 2)
    nc = c.post("/api/clients", headers=h, json={"name": "Smoke St Strata", "contact_name": "Q. Tester"})
    check("client create", nc.status_code == 200)
    check("enquiry create", c.post("/api/enquiries", headers=h, json={"name": "Fence quote walk-in", "contact": "0400 000 000"}).status_code == 200)

    q = c.post("/api/quotes", headers=h, json={
        "title": "Smoke test quote", "client_id": nc.json()["id"],
        "lines": [{"description": "Labour", "qty": 4, "unit_cents": 14000}, {"description": "Materials", "qty": 1, "unit_cents": 52000}],
    })
    check("quote create with lines", q.status_code == 200)
    qid = q.json()["id"]
    sent = c.post(f"/api/quotes/{qid}/send", headers=h)
    check("quote send issues token", sent.status_code == 200 and sent.json()["accept_token"])
    token = sent.json()["accept_token"]
    check("public quote view", c.get(f"/api/public/quote/{token}").json()["total_ex_cents"] == 108000)
    check("public quote accept", c.post(f"/api/public/quote/{token}/accept", json={"name": "Q. Tester"}).status_code == 200)
    tj = c.post(f"/api/quotes/{qid}/to-job", headers=h)
    check("accepted quote to job", tj.status_code == 200 and tj.json()["quoted_cents"] == 108000)
    qpdf = c.get(f"/api/quotes/{qid}/pdf", headers=h)
    check("quote PDF", qpdf.status_code == 200 and qpdf.content[:4] == b"%PDF")
    check("price book search effective-dated", any("cable" in x["description"].lower() for x in c.get("/api/pricebooks/search?q=cable", headers=h).json()))

    print("— kernel: capture pipeline + verify gate —")
    cap = c.post("/api/captures", headers=h, data={"capture_type": "receipt", "job_id": live["id"]},
                 files={"file": ("r.jpg", b"\xff\xd8x", "image/jpeg")}).json()
    check("receipt fast-tracks at 0.94", cap["routing"] == "fast_track" and cap["confidence"] == 0.94)
    ver = c.post(f"/api/captures/{cap['id']}/verify", headers=h, json={})
    check("verify allocates ACCPAY draft", ver.json()["allocation"]["kind"] == "ledger_draft")
    check("ledger draft recorded", any(d["kind"] == "ACCPAY" for d in c.get("/api/ledger/drafts", headers=h).json()))

    low = c.post("/api/captures", headers=h, data={"capture_type": "mystery_docket"}).json()
    check("unknown capture routes to review", low["routing"] == "review")
    check("review queue holds it", any(x["id"] == low["id"] for x in c.get("/api/captures?status=needs_verify", headers=h).json()))
    check("review notification emitted", any(n["event_type"] == "capture_review" for n in c.get("/api/notifications", headers=h).json()))
    check("reject capture", c.post(f"/api/captures/{low['id']}/reject", headers=h, json={"note": "unreadable"}).status_code == 200)

    vt = c.post("/api/captures", headers=hc, data={"capture_type": "voice_timesheet", "job_id": live["id"]}).json()
    tv = c.post(f"/api/captures/{vt['id']}/verify", headers=h, json={"fields": {**vt["extracted"], "ended": "15:00"}})
    check("voice timesheet corrected + allocated", tv.json()["allocation"]["kind"] == "time_entry")
    check("correction audited", any(a["action"] == "extraction.corrected" for a in c.get("/api/org/audit", headers=h).json()))

    print("— kernel: procurement three-way match —")
    po = c.post("/api/pos", headers=h, json={"supplier": "Rexel", "job_id": live["id"], "lines": [
        {"description": "Conduit 25mm", "qty": 10, "unit_cents": 900}, {"description": "Junction boxes", "qty": 4, "unit_cents": 450}]}).json()
    lines = c.get(f"/api/pos/{po['id']}", headers=h).json()["lines"]
    part = c.post(f"/api/pos/{po['id']}/receive", headers=h, json={"line_receipts": {lines[0]["id"]: 6}})
    check("partial receive stays open", part.json()["complete"] is False)
    check("backorders listed", any(b["description"] == "Conduit 25mm" for b in c.get("/api/pos/backorders", headers=h).json()))
    full = c.post(f"/api/pos/{po['id']}/receive", headers=h, json={"line_receipts": {lines[0]["id"]: 4, lines[1]["id"]: 4}})
    check("full receive closes PO", full.json()["complete"] is True)
    check("match demands verified receipt", c.post(f"/api/pos/{po['id']}/match", headers=h, json={"capture_id": vt["id"]}).status_code == 400)
    check("three-way match", c.post(f"/api/pos/{po['id']}/match", headers=h, json={"capture_id": cap["id"]}).status_code == 200)

    print("— kernel: invoicing, chase, reports —")
    done = next(j for j in c.get("/api/jobs", headers=h).json() if j["code"] == "J-0003")
    chase = c.get("/api/invoicing/chase", headers=h).json()
    check("chase flags uninvoiced done job", any(x["code"] == "J-0003" for x in chase["uninvoiced"]))
    dep = c.post("/api/invoices", headers=h, json={"job_id": done["id"], "kind": "deposit", "lines": [{"description": "Deposit", "qty": 1, "unit_cents": 10000}]})
    check("deposit invoice", dep.status_code == 200 and dep.json()["kind"] == "deposit")
    claim = c.post("/api/invoices", headers=h, json={"job_id": done["id"], "kind": "claim", "claim_pct": 50, "retention_pct": 10})
    check("progress claim with retention", claim.json()["total_ex_cents"] == round(done["quoted_cents"] * 0.5 * 0.9))
    inv = c.post("/api/invoices", headers=h, json={"job_id": done["id"]}).json()
    push = c.post(f"/api/invoices/{inv['id']}/push", headers=h)
    check("invoice push returns ledger ref", bool(push.json()["ledger_ref"]))
    check("pushed job flips to invoiced", next(j for j in c.get("/api/jobs", headers=h).json() if j["code"] == "J-0003")["status"] == "invoiced")
    c.post(f"/api/ledger/mock/invoices/{inv['id']}/status", headers=h, json={"status": "overdue"})
    check("overdue lands on chase list", any(x["code"] == inv["code"] for x in c.get("/api/invoicing/chase", headers=h).json()["overdue"]))
    c.post(f"/api/ledger/mock/invoices/{inv['id']}/status", headers=h, json={"status": "paid"})
    check("paid clears the chase", not any(x["code"] == inv["code"] for x in c.get("/api/invoicing/chase", headers=h).json()["overdue"]))

    wip = c.get("/api/reports/wip", headers=h).json()
    check("WIP report totals", wip["total_quoted_cents"] > 0)
    check("margin provenance", "provenance" in c.get(f"/api/reports/margin/{live['id']}", headers=h).json())
    payroll = c.get("/api/reports/payroll-export", headers=h)
    check("payroll CSV export", payroll.status_code == 200 and payroll.text.startswith("name,date,job,hours"))
    check("global search", c.get("/api/search?q=Seaview", headers=h).json()["jobs"])

    print("— kernel: field, plate, admin —")
    today = c.get("/api/field/today", headers=hc).json()
    check("field today board", any(j["code"] == "J-0001" for j in today["jobs"]))
    jid = next(j["job_id"] for j in today["jobs"] if j["code"] == "J-0001")
    pack = c.get(f"/api/field/jobs/{jid}", headers=hc).json()
    check("job pack gate code", pack["job"]["gate_code"] == "#4471")
    check("clock on", c.post(f"/api/field/jobs/{jid}/time", headers=hc, json={"action": "start"}).status_code == 200)
    check("double clock-on blocked", c.post(f"/api/field/jobs/{jid}/time", headers=hc, json={"action": "start"}).status_code == 400)
    check("clock off", c.post(f"/api/field/jobs/{jid}/time", headers=hc, json={"action": "stop"}).status_code == 200)
    stages = pack["stages"]
    photo_stage = next(s for s in stages if s["requires_photo"] and not s["completed_at"])
    check("photo-gated stage sign-off", c.post(f"/api/field/jobs/{jid}/stage-done", headers=hc, json={"stage_id": photo_stage["id"]}).status_code == 200)

    board = c.get("/api/public/plate/demo-plate-token").json()
    check("site plate board", board["site_name"] == "Seaview Apartments")
    si = c.post("/api/public/plate/demo-plate-token/sign-in", json={"name": "Smoke Visitor", "kind": "visitor"}).json()
    check("plate sign-in", si["ok"] is True)
    check("plate sign-out", c.post("/api/public/plate/demo-plate-token/sign-out", json={"sign_in_id": si["sign_in_id"]}).status_code == 200)

    check("licences expiring", len(c.get("/api/org/licences/expiring", headers=h).json()) >= 1)
    check("org theme patch", c.request("PATCH", "/api/org", headers=h, json={"theme": "amber-on-void"}).status_code == 200)
    check("modules patch", c.request("PATCH", "/api/org/modules", headers=h, json={"modules": {"trades": "off"}}).status_code == 200)
    check("ledger connect", c.post("/api/org/ledger/connect", headers=h, json={"provider": "xero-mock"}).json()["status"] == "connected")
    exp = c.get("/api/org/export", headers=h).json()
    check("data export guarantee", len(exp["jobs"]) >= 3 and "captures" in exp)
    check("notifications read-all", c.post("/api/notifications/read-all", headers=h).status_code == 200)


def trades_checks(c: httpx.Client) -> None:
    print("— trades pack: gating, variations, certificates —")
    hd = hdr(c, "owner@demo.local", "demo-owner")
    check("trades gated off generic yard", c.get("/api/trades/certs", headers=hd).status_code == 501)

    h = hdr(c, "owner@voltline.local", "voltline-owner")
    jobs = c.get("/api/jobs", headers=h).json()
    check("voltline yard seeded", len(jobs) == 2)
    live = next(j for j in jobs if j["code"] == "J-0001")

    vs = c.get("/api/trades/variations", headers=h).json()
    check("seeded variation proposed", vs and vs[0]["status"] == "proposed")
    dec = c.post(f"/api/trades/variations/{vs[0]['id']}/decide", headers=h, json={"decision": "approved", "decided_by_name": "M. Chen"})
    check("variation approved", dec.status_code == 200)
    after = next(j for j in c.get("/api/jobs", headers=h).json() if j["code"] == "J-0001")["quoted_cents"]
    check("approval grows job value", after == live["quoted_cents"] + vs[0]["amount_cents"])
    check("re-decide blocked", c.post(f"/api/trades/variations/{vs[0]['id']}/decide", headers=h, json={"decision": "declined", "decided_by_name": "X"}).status_code == 409)

    cert = c.post("/api/trades/certs", headers=h, json={"kind": "electrical_compliance", "job_id": live["id"],
                                                        "fields": {"installation_address": "7/22 Harbour Rd", "result": "pass"}}).json()
    check("cert numbering continues series", cert["code"] == "CEC-0002")
    check("unknown cert kind refused", c.post("/api/trades/certs", headers=h, json={"kind": "vibes", "fields": {}}).status_code == 400)
    check("cert issue", c.post(f"/api/trades/certs/{cert['id']}/issue", headers=h).json()["status"] == "issued")
    check("issued cert immutable", c.request("PATCH", f"/api/trades/certs/{cert['id']}", headers=h, json={"fields": {}}).status_code == 404)
    cpdf = c.get(f"/api/trades/certs/{cert['id']}/pdf", headers=h)
    check("cert PDF", cpdf.status_code == 200 and cpdf.content[:4] == b"%PDF")

    r = c.post("/api/auth/pin", json={"org_slug": "sitecast", "pin": "4321"})
    hc = {"Authorization": f"Bearer {r.json()['token']}"}
    fj = c.get("/api/field/today", headers=hc).json()["jobs"]
    check("sitecast crew field board", len(fj) == 1)
    vr = c.post("/api/trades/variations", headers=hc, json={"job_id": fj[0]["job_id"], "title": "Pump hire", "amount_cents": 38000})
    check("crew raises variation from field", vr.status_code == 200 and vr.json()["code"] == "V-0002")
    hs = hdr(c, "owner@sitecast.local", "sitecast-owner")
    check("variation notification to office", any(n["event_type"] == "variation_raised" for n in c.get("/api/notifications", headers=hs).json()))
    me = c.get("/api/me", headers=hs).json()
    check("sitecast terminology (pour)", me["org"]["terminology"]["job"] == "pour")
    check("sitecast public quote live", c.get("/api/public/quote/sitecast-quote-token").json()["status"] == "sent")

    check("voice timesheet fixture reads window", c.post("/api/captures", headers=hc, data={"capture_type": "voice_timesheet", "job_id": fj[0]["job_id"]}).json()["extracted"]["started"] == "07:00")


def civil_checks(c: httpx.Client) -> None:
    print("— civil pack: plant, pre-starts, dockets, quarry, SoR —")
    hd = hdr(c, "owner@demo.local", "demo-owner")
    check("civil gated off generic yard", c.get("/api/civil/plant", headers=hd).status_code == 501)

    h = hdr(c, "owner@kemgrade.local", "kemgrade-owner")
    r = c.post("/api/auth/pin", json={"org_slug": "kemgrade", "pin": "7777"})
    hc = {"Authorization": f"Bearer {r.json()['token']}"}

    plant = c.get("/api/civil/plant", headers=h).json()
    check("plant register seeded", len(plant) == 3)
    ex = next(p for p in plant if p["meta"]["code"] == "EX-04")
    roller = next(p for p in plant if p["meta"]["code"] == "RL-02")
    check("pre-start status on register", ex["prestart_today"] == "pass")
    check("wet+dry rates on excavator", {x["mode"] for x in c.get(f"/api/civil/plant/{ex['id']}/rates", headers=h).json()} == {"wet", "dry"})

    jobs = c.get("/api/jobs", headers=h).json()
    jid = jobs[0]["id"]
    check("docket without pre-start refused", c.post("/api/civil/dockets", headers=hc, json={"job_id": jid, "asset_id": roller["id"], "mode": "dry", "hours": 8}).status_code == 409)
    fail = c.post("/api/civil/prestarts", headers=hc, json={"asset_id": roller["id"], "job_id": jid,
                                                            "checks": [{"name": "Fluids", "ok": False}], "faults": ["Hydraulic weep"]}).json()
    check("failed pre-start blocks dispatch", fail["dispatch_blocked"] is True)
    check("failed docket still refused", c.post("/api/civil/dockets", headers=hc, json={"job_id": jid, "asset_id": roller["id"], "mode": "dry", "hours": 8}).status_code == 409)
    check("pre-start failure notifies office", any(n["event_type"] == "prestart_failed" for n in c.get("/api/notifications", headers=h).json()))
    c.post("/api/civil/prestarts", headers=hc, json={"asset_id": roller["id"], "job_id": jid, "checks": [{"name": "Fluids", "ok": True}]})
    short = c.post("/api/civil/dockets", headers=hc, json={"job_id": jid, "asset_id": roller["id"], "mode": "dry", "hours": 2})
    check("fresh pass reopens dispatch", short.status_code == 200)
    check("minimum hours bite (2h bills 8h)", short.json()["total_cents"] == 8 * 9800)

    drafts = c.get("/api/civil/dockets?status=draft", headers=h).json()
    d = next(x for x in drafts if x["code"] == "HD-0001")
    check("seeded docket rate engine total", d["total_cents"] == round(6.5 * 24500 + 1.5 * 9500))
    check("tally on docket", d["tally"]["loads"] == 14)
    check("approve before signature refused", c.post(f"/api/civil/dockets/{d['id']}/approve", headers=h).status_code == 404)
    sig = "data:image/png;base64,iVBORw0KGgo="
    check("sign on glass", c.post(f"/api/civil/dockets/{d['id']}/sign", headers=hc, json={"signed_by_name": "S. Pillai", "signature_png": sig}).status_code == 200)
    check("supervisor approve + email", c.post(f"/api/civil/dockets/{d['id']}/approve", headers=h).status_code == 200)
    dpdf = c.get(f"/api/civil/dockets/{d['id']}/pdf", headers=h)
    check("daily docket PDF", dpdf.status_code == 200 and dpdf.content[:4] == b"%PDF")

    qt = c.post("/api/captures", headers=hc, data={"capture_type": "quarry_ticket", "job_id": jid},
                files={"file": ("q.jpg", b"\xff\xd8x", "image/jpeg")}).json()
    check("quarry ticket fast-tracks", qt["routing"] == "fast_track")
    check("verify allocates tonnage", c.post(f"/api/captures/{qt['id']}/verify", headers=h, json={}).json()["allocation"]["kind"] == "quarry_ticket")
    check("tonnage on register", any(float(t["tonnes"]) == 31.4 for t in c.get("/api/civil/quarry-tickets", headers=h).json()))
    check("SoR library search", c.get("/api/civil/sor?q=roadbase", headers=h).json()[0]["unit"] == "t")


def fab_checks(c: httpx.Client) -> None:
    print("— fab pack: ITP, traceability, NDI, offcuts, MDR, kiosk flow —")
    hd = hdr(c, "owner@demo.local", "demo-owner")
    check("fab gated off generic yard", c.get("/api/fab/materials", headers=hd).status_code == 501)

    h = hdr(c, "owner@steelhaus.local", "steelhaus-owner")
    r = c.post("/api/auth/pin", json={"org_slug": "steelhaus", "pin": "5555"})
    check("welder PIN login", r.status_code == 200)
    hc = {"Authorization": f"Bearer {r.json()['token']}"}

    tpls = c.get("/api/fab/itp-templates", headers=h).json()
    cc2 = next(t for t in tpls if t["name"] == "Structural steel CC2")
    check("ITP template seeded (6 stages)", len(cc2["stages"]) == 6)
    jobs = c.get("/api/jobs", headers=h).json()
    wo = next(j for j in jobs if j["code"] == "WO-0001")
    check("re-apply ITP onto staged job refused", c.post("/api/fab/apply-itp", headers=h,
                                                         json={"job_id": wo["id"], "template_id": cc2["id"]}).status_code == 409)
    fresh = c.post("/api/jobs", headers=h, json={"title": "Pipe rack modules"}).json()
    ap = c.post("/api/fab/apply-itp", headers=h, json={"job_id": fresh["id"], "template_id": cc2["id"]})
    check("ITP stamps stages onto fresh WO", ap.status_code == 200 and ap.json()["stages"] == 6)

    lots = c.get("/api/fab/materials", headers=h).json()
    check("seeded heat on register", any(m["heat_no"] == "HT-77120" for m in lots))
    hcap = c.post("/api/captures", headers=hc, data={"capture_type": "heat_cert", "job_id": wo["id"]},
                  files={"file": ("cert.jpg", b"\xff\xd8x", "image/jpeg")}).json()
    check("heat cert fast-tracks over 0.85 threshold", hcap["routing"] == "fast_track")
    alloc = c.post(f"/api/captures/{hcap['id']}/verify", headers=h, json={})
    check("verified cert allocates material lot", alloc.json()["allocation"]["kind"] == "material_lot")
    check("extracted heat lands on register", any(m["heat_no"] == "HT-98442" for m in c.get("/api/fab/materials", headers=h).json()))

    check("bad NDI method refused", c.post("/api/fab/ndi", headers=h, json={"job_id": wo["id"], "method": "xray-vibes", "result": "pass"}).status_code == 400)
    ndi = c.post("/api/fab/ndi", headers=h, json={"job_id": wo["id"], "method": "UT", "result": "pass", "report_ref": "NDI-2290", "inspector": "J. Okon"})
    check("NDI recorded", ndi.status_code == 200)

    offs = c.get("/api/fab/offcuts", headers=h).json()
    drop = next(o for o in offs if o["heat_no"] == "HT-77120")
    check("offcut allocate", c.post(f"/api/fab/offcuts/{drop['id']}/allocate", headers=h, json={"job_id": fresh["id"]}).status_code == 200)
    check("allocation carries heat onto receiving WO",
          any(m["heat_no"] == "HT-77120" for m in c.get(f"/api/fab/materials?job_id={fresh['id']}", headers=h).json()))
    check("allocated offcut off the available rack", not any(o["id"] == drop["id"] for o in c.get("/api/fab/offcuts", headers=h).json()))

    today = c.get("/api/field/today", headers=hc).json()["jobs"]
    check("welder kiosk board shows WO-0001", any(j["code"] == "WO-0001" for j in today))
    # Kiosk hold-point flow runs on the fresh WO: it has stamped stages and no captures yet.
    pack = c.get(f"/api/field/jobs/{fresh['id']}", headers=hc).json()
    hold = next(s for s in pack["stages"] if not s["completed_at"])
    check("photo hold point blocks bare sign-off", hold["requires_photo"] and
          c.post(f"/api/field/jobs/{fresh['id']}/stage-done", headers=hc, json={"stage_id": hold["id"]}).status_code == 400)
    sp = c.post("/api/captures", headers=hc, data={"capture_type": "stage_photo", "job_id": fresh["id"]},
                files={"file": ("weld.jpg", b"\xff\xd8x", "image/jpeg")}).json()
    check("stage photo fast-tracks quietly", sp["routing"] == "fast_track")
    check("photo in, hold point signs off", c.post(f"/api/field/jobs/{fresh['id']}/stage-done", headers=hc, json={"stage_id": hold["id"]}).status_code == 200)

    mdr = c.get(f"/api/fab/jobs/{wo['id']}/mdr.pdf", headers=h)
    check("MDR pack PDF", mdr.status_code == 200 and mdr.content[:4] == b"%PDF")


def fleet_checks(c: httpx.Client) -> None:
    print("— fleet pack: register, floats, workshop queue, SMS vault —")
    hd = hdr(c, "owner@demo.local", "demo-owner")
    check("fleet gated off generic yard", c.get("/api/fleet/assets", headers=hd).status_code == 501)

    h = hdr(c, "owner@redline.local", "redline-owner")
    r = c.post("/api/auth/pin", json={"org_slug": "redline", "pin": "8888"})
    check("driver PIN login", r.status_code == 200)
    hc = {"Authorization": f"Bearer {r.json()['token']}"}

    assets = c.get("/api/fleet/assets", headers=h).json()
    check("register across depots", len(assets) == 4)
    check("depot filter scopes register", {a["meta"]["code"] for a in c.get("/api/fleet/assets?yard=Picton Depot", headers=h).json()} == {"EX-12", "ATT-07"})
    hitch = next(a for a in assets if a["meta"]["code"] == "ATT-07")
    check("attachment linked to carrier", hitch["carrier_name"] == "Cat 336 excavator")
    pm = next(a for a in assets if a["meta"]["code"] == "PM-01")
    check("pre-start feeds register status", pm["prestart_today"] == "pass")

    q = c.get("/api/fleet/workshop", headers=h).json()
    check("hour-meter service due in queue", any(d["plan_name"] == "250h service" for d in q["due_services"]))
    check("seeded corrective action open", any(x["code"] == "CA-0001" for x in q["open_corrective_actions"]))
    due = next(d for d in q["due_services"] if d["plan_name"] == "250h service")
    check("service completion resets clock", c.post(f"/api/fleet/service-plans/{due['plan_id']}/complete", headers=h, json={"notes": "Oil + filters"}).status_code == 200)
    check("queue clears after service", not any(d["plan_name"] == "250h service" for d in c.get("/api/fleet/workshop", headers=h).json()["due_services"]))

    jobs = c.get("/api/jobs", headers=h).json()
    rh = next(j for j in jobs if j["code"] == "RH-0001")
    fl = c.post("/api/fleet/floats", headers=h, json={"asset_id": pm["id"], "job_id": rh["id"], "from_yard": "Bunbury Depot",
                                                      "to_site": "Kemerton SIA pad 7", "float_date": "2026-09-15", "km": 52,
                                                      "mobilisation_cents": 30000, "cents_per_km": 600}).json()
    check("float charge maths", fl["charge_cents"] == 30000 + 52 * 600)
    check("float delivered", c.post(f"/api/fleet/floats/{fl['id']}/complete", headers=h).status_code == 200)

    ca = next(x for x in c.get("/api/fleet/corrective-actions", headers=h).json() if x["code"] == "CA-0001")
    check("close-out demands a note", c.post(f"/api/fleet/corrective-actions/{ca['id']}/close", headers=h, json={"note": " "}).status_code == 400)
    check("corrective action closed", c.post(f"/api/fleet/corrective-actions/{ca['id']}/close", headers=h, json={"note": "Binder replaced"}).status_code == 200)

    lr = c.post("/api/captures", headers=hc, data={"capture_type": "load_restraint"},
                files={"file": ("load.jpg", b"\xff\xd8x", "image/jpeg")}).json()
    check("load restraint photo fast-tracks", lr["routing"] == "fast_track")
    check("verified photo lands in vault", c.post(f"/api/captures/{lr['id']}/verify", headers=h, json={}).json()["allocation"]["kind"] == "sms_evidence")

    vault = c.get("/api/fleet/evidence", headers=h).json()
    check("evidence on all five SMS outcomes", all(v > 0 for v in vault["counts"].values()))
    check("vault composes platform records", {"vault", "prestarts", "workshop", "corrective_actions"} <= {i["source"] for i in vault["items"]})
    pack = c.get("/api/fleet/evidence/pack.pdf", headers=h)
    check("SMS evidence pack PDF", pack.status_code == 200 and pack.content[:4] == b"%PDF")


def foundry_checks(c: httpx.Client) -> None:
    print("— platform console + the Foundry —")
    staff = {"Authorization": "Bearer dev-staff-key"}
    check("console locked without staff key", c.get("/api/platform/instances").status_code == 401)
    menu = c.get("/api/platform/menu", headers=staff).json()
    check("foundry menu serves the catalogue", set(menu["catalogue"]) == {"kernel", "trades", "civil", "fab", "fleet"})

    built = c.post("/api/platform/foundry", headers=staff, json={
        "trading_name": "Coastal Sparks Electrical", "abn": "12 345 678 901", "brand_colour": "#0a5c46",
        "sectors": ["trades"], "terminology": {"job": "callout"}, "yards": ["Busselton yard"],
        "owner_name": "Casey Owner", "owner_email": "casey@coastalsparks.local",
    }).json()
    check("foundry manifest imprints prefixes", built["manifest"]["code_prefixes"]["job"] == "CS")
    creds = built["credentials"]
    login = c.post("/api/auth/login", json={"email": creds["owner_email"], "password": creds["owner_password"]})
    check("generated owner login works", login.status_code == 200)
    s = login.json()
    check("terminology + brand from commit zero", s["org"]["terminology"]["job"] == "callout" and s["org"]["brand"]["tokens"]["--mark"] == "#0a5c46")
    h = {"Authorization": f"Bearer {s['token']}"}
    check("walkthrough job bears their prefix", c.get("/api/jobs", headers=h).json()[0]["code"] == "CS-0001")
    check("ticked pack live", c.get("/api/trades/certs", headers=h).status_code == 200)
    check("unticked pack dark", c.get("/api/civil/plant", headers=h).status_code == 501)
    check("generated crew PIN works", c.post("/api/auth/pin", json={"org_slug": built["manifest"]["slug"], "pin": creds["crew_pin"]}).status_code == 200)
    check("duplicate slug refused", c.post("/api/platform/foundry", headers=staff, json={
        "trading_name": "Coastal Sparks Electrical", "owner_name": "X", "owner_email": "x@x.local"}).status_code == 409)

    pilot = c.post("/api/platform/foundry", headers=staff, json={
        "trading_name": "Pilot Paving", "sectors": ["civil"], "pilot": True,
        "owner_name": "P. Ilot", "owner_email": "pilot@paving.local"}).json()
    check("pilot ships kernel only", pilot["manifest"]["modules"] == {"kernel": "live"})

    rows = c.get("/api/platform/instances", headers=staff).json()
    demo = next(x for x in rows if x["slug"] == "demo")
    check("instance health board", demo["jobs"] >= 3 and "review_queue" in demo)

    imp = c.post("/api/platform/instances/demo/impersonate", headers=staff)
    check("support impersonation issues session", imp.status_code == 200 and imp.json()["org"]["slug"] == "demo")
    hi = {"Authorization": f"Bearer {imp.json()['token']}"}
    check("impersonation audited on client log", any(a["action"] == "platform.impersonated" for a in c.get("/api/org/audit", headers=hi).json()))

    ai = c.request("PATCH", "/api/platform/instances/coastalsparkselectrical/ai", headers=staff,
                   json={"chain": ["primary-a", "fallback-b"], "budget_cents": 500000})
    check("per-client AI config", ai.status_code == 200 and ai.json()["chain"] == ["primary-a", "fallback-b"])

    clients_csv = "name,contact_name,email,phone\nHarbour Strata,Jo Kim,jo@harbour.local,0400111222\n"
    imp_c = c.post("/api/platform/instances/coastalsparkselectrical/import/clients", headers=staff,
                   files={"file": ("clients.csv", clients_csv.encode(), "text/csv")})
    check("clients importer", imp_c.json()["imported"] == 1)
    jobs_csv = "code,title,status,client,quoted_dollars\nCS-9001,Old switchboard job,done,Harbour Strata,4200\n"
    imp_j = c.post("/api/platform/instances/coastalsparkselectrical/import/jobs", headers=staff,
                   files={"file": ("jobs.csv", jobs_csv.encode(), "text/csv")})
    check("jobs importer", imp_j.json()["imported"] == 1)

    check("brand theme editor roundtrip", c.request("PATCH", "/api/org", headers=h,
                                                    json={"brand": {"tokens": {"--accent": "#654321"}}}).status_code == 200
          and c.get("/api/me", headers=h).json()["org"]["brand"]["tokens"]["--accent"] == "#654321")


def run_checks() -> None:
    c = httpx.Client(base_url=BASE, timeout=10)
    kernel_checks(c)
    trades_checks(c)
    civil_checks(c)
    fab_checks(c)
    fleet_checks(c)
    foundry_checks(c)
    c.close()


def main() -> int:
    ensure_db()
    reset_and_seed()
    env = dict(os.environ)
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "main:app", "--port", "8010", "--log-level", "warning"],
        cwd=BACKEND, env=env,
    )
    try:
        if not wait_for_server(proc):
            print("server failed to start")
            return 1
        run_checks()
    finally:
        proc.terminate()
        proc.wait(timeout=10)
    print(f"\nsmoke: {PASS} passed, {len(FAIL)} failed")
    if FAIL:
        print("failed:", ", ".join(FAIL))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
