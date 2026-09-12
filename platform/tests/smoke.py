"""Live smoke: boots uvicorn on :8010 against embedded Postgres, seeds the demo
yard, and walks the kernel surface as a real HTTP client. This is the phase
gate — run it before claiming a phase done.

Run: python3 tests/smoke.py
"""
import asyncio
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

    async def run():
        p = await db.pool()
        await p.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
        await db.migrate()
        await seed.seed_demo_yard()
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


def run_checks() -> None:
    c = httpx.Client(base_url=BASE, timeout=10)

    r = c.get("/api/health")
    check("health", r.status_code == 200 and r.json()["ok"])

    r = c.post("/api/auth/login", json={"email": "owner@demo.local", "password": "demo-owner"})
    check("owner login", r.status_code == 200, r.text)
    h = {"Authorization": f"Bearer {r.json()['token']}"}

    r = c.post("/api/auth/pin", json={"org_slug": "demo", "pin": "1111"})
    check("crew PIN login", r.status_code == 200, r.text)
    hc = {"Authorization": f"Bearer {r.json()['token']}"}

    r = c.get("/api/nudge", headers=h)
    check("morning nudge", r.status_code == 200 and "review_count" in r.json(), r.text)

    r = c.get("/api/jobs", headers=h)
    check("jobs list", r.status_code == 200 and len(r.json()) >= 3, r.text)
    live = next(j for j in r.json() if j["code"] == "J-0001")

    r = c.get(f"/api/jobs/{live['id']}", headers=h)
    check("job detail + costing", r.status_code == 200 and "costing" in r.json(), r.text)

    r = c.get("/api/dayboard", headers=h)
    check("day board", r.status_code == 200, r.text)

    r = c.get("/api/dayboard/sheet.pdf", headers=h)
    check("day sheet PDF", r.status_code == 200 and r.content[:4] == b"%PDF", r.text[:80])

    r = c.post(
        "/api/captures", headers=h,
        data={"capture_type": "receipt", "job_id": live["id"]},
        files={"file": ("r.jpg", b"\xff\xd8x", "image/jpeg")},
    )
    check("receipt capture fast-tracks", r.status_code == 200 and r.json()["routing"] == "fast_track", r.text)
    cap_id = r.json()["id"]

    r = c.post(f"/api/captures/{cap_id}/verify", headers=h, json={})
    check("verify allocates ledger draft", r.status_code == 200 and r.json()["allocation"]["kind"] == "ledger_draft", r.text)

    r = c.get("/api/public/quote/demo-quote-token")
    check("public quote view", r.status_code == 200 and r.json()["code"] == "Q-0001", r.text)

    r = c.post("/api/public/quote/demo-quote-token/accept", json={"name": "Smoke Test"})
    check("public quote accept", r.status_code == 200, r.text)

    r = c.get("/api/public/plate/demo-plate-token")
    check("site plate board", r.status_code == 200, r.text)

    r = c.get("/api/field/today", headers=hc)
    check("field today board", r.status_code == 200 and r.json()["jobs"], r.text)

    r = c.get("/api/quotes/" + next(
        q["id"] for q in c.get("/api/quotes", headers=h).json() if q["code"] == "Q-0001"
    ) + "/pdf", headers=h)
    check("quote PDF", r.status_code == 200 and r.content[:4] == b"%PDF", r.text[:80])

    r = c.get("/api/invoicing/chase", headers=h)
    check("chase list", r.status_code == 200 and "on_table_cents" in r.json(), r.text)

    r = c.get("/api/search?q=Seaview", headers=h)
    check("global search", r.status_code == 200 and (r.json()["jobs"] or r.json()["clients"]), r.text)

    r = c.get("/api/notifications", headers=h)
    check("notifications", r.status_code == 200, r.text)

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
