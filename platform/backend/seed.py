"""Generic demo yard: one seeded org exercising every kernel surface.

Sector packs layer their own seed modules on top of this (each pack ships a
seed_<pack>.py that takes the org id). Used by the smoke suite, tests, and
manual demo instances. Idempotent: re-running against an existing slug is a
no-op.

Run: python seed.py  (requires DATABASE_URL)
"""

import asyncio
import json
from datetime import timedelta

import auth
import db
import svc

DEMO_SETTINGS = {
    "codes": {"job": "J", "quote": "Q", "po": "PO", "invoice": "INV"},
    "rates": {"labour_cost_cents": 9500, "labour_charge_cents": 14000},
    "ai": {"provider": "fixture", "thresholds": {"receipt": 0.8, "voice_timesheet": 0.75}},
    "ledger": {"provider": "xero-mock", "connected": True},
}


async def seed_demo_yard(slug: str = "demo", name: str = "Demo Yard Pty Ltd") -> str | None:
    existing = await db.fetchrow("SELECT id FROM organisations WHERE slug=$1", slug)
    if existing:
        return None

    org = await db.fetchrow(
        """INSERT INTO organisations (slug, name, legal_name, abn, theme, terminology, modules, settings, is_demo, brand)
           VALUES ($1,$2,$3,$4,'daybook','{}',$5,$6,true,$7) RETURNING id""",
        slug, name, name, "12 345 678 901",
        json.dumps({"kernel": "live"}),
        json.dumps(DEMO_SETTINGS),
        json.dumps({"letterhead_line": f"{name} — ABN 12 345 678 901"}),
    )
    org_id = org["id"]

    async def user(name: str, email: str | None, role: str, pw: str | None = None, pin: str | None = None) -> str:
        row = await db.fetchrow(
            "INSERT INTO users (org_id, name, email, role, password_hash, pin) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
            org_id, name, email, role, auth.hash_password(pw) if pw else None, pin,
        )
        return row["id"]

    owner = await user("Mel Harding", "owner@demo.local", "owner", pw="demo-owner")
    await user("Pat Office", "office@demo.local", "office", pw="demo-office")
    crew1 = await user("Danny Field", None, "crew", pin="1111")
    crew2 = await user("Sam Rigger", None, "crew", pin="2222")

    await db.execute(
        "INSERT INTO licences (org_id, user_id, kind, ref, expires_on) VALUES ($1,$2,'White Card','WC-2210', $3)",
        org_id, crew1, svc.today_awst() + timedelta(days=12),
    )

    async def client(name: str, contact: str, email: str) -> str:
        row = await db.fetchrow(
            "INSERT INTO clients (org_id, name, contact_name, email) VALUES ($1,$2,$3,$4) RETURNING id",
            org_id, name, contact, email,
        )
        return row["id"]

    c_strata = await client("Seaview Strata Group", "R. Okafor", "admin@seaview.local")
    c_builder = await client("Hartwell Builders", "J. Hart", "accounts@hartwell.local")

    site = await db.fetchrow(
        """INSERT INTO sites (org_id, client_id, name, address, gate_code, contact_name, contact_phone)
           VALUES ($1,$2,'Seaview Apartments','14 Marine Tce','#4471','R. Okafor','0400 111 222') RETURNING id""",
        org_id, c_strata,
    )

    await db.execute(
        "INSERT INTO enquiries (org_id, name, contact, note) VALUES ($1,'Warehouse re-fit','0400 333 444','Walk-in, wants a look next week')",
        org_id,
    )

    book = await db.fetchrow(
        "INSERT INTO price_books (org_id, supplier, effective_from) VALUES ($1,'Rexel', CURRENT_DATE) RETURNING id",
        org_id,
    )
    for sku, desc, unit, cents in [
        ("CBL-2.5", "2.5mm twin & earth cable (100m)", "roll", 18500),
        ("GPO-DBL", "Double GPO white", "ea", 1250),
        ("CB-20A", "20A circuit breaker", "ea", 3400),
    ]:
        await db.execute(
            "INSERT INTO price_items (org_id, book_id, sku, description, unit, unit_cents) VALUES ($1,$2,$3,$4,$5,$6)",
            org_id, book["id"], sku, desc, unit, cents,
        )

    quote = await db.fetchrow(
        """INSERT INTO quotes (org_id, client_id, code, title, status, valid_until, sent_at, accept_token)
           VALUES ($1,$2,'Q-0001','Switchboard upgrade — Seaview','sent', $3, now(), 'demo-quote-token') RETURNING id""",
        org_id, c_strata, svc.today_awst() + timedelta(days=5),
    )
    for i, (desc, qty, cents) in enumerate([
        ("Supply and fit switchboard", 1, 240000),
        ("Circuit breakers", 8, 3400),
        ("Labour", 12, 14000),
    ]):
        await db.execute(
            "INSERT INTO quote_lines (org_id, quote_id, description, qty, unit_cents, sort) VALUES ($1,$2,$3,$4,$5,$6)",
            org_id, quote["id"], desc, qty, cents, i,
        )

    async def job(code: str, title: str, status: str, client_id, quoted: int, **kw) -> str:
        row = await db.fetchrow(
            """INSERT INTO jobs (org_id, client_id, site_id, code, title, status, quoted_cents, recall_on, starts_on, completed_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id""",
            org_id, client_id, kw.get("site_id"), code, title, status, quoted,
            kw.get("recall_on"), kw.get("starts_on"), kw.get("completed_at"),
        )
        return row["id"]

    today = svc.today_awst()
    j_live = await job("J-0001", "Seaview switchboard upgrade", "live", c_strata, 371200, site_id=site["id"], starts_on=today)
    j_sched = await job("J-0002", "Hartwell site shed power", "scheduled", c_builder, 98000, starts_on=today + timedelta(days=1))
    j_done = await job("J-0003", "Emergency light test — Seaview", "done", c_strata, 42000)
    await db.execute("UPDATE jobs SET completed_at=now() - interval '2 days', recall_on=$2 WHERE id=$1", j_done, today + timedelta(days=3))

    for i, (name, photo) in enumerate([("Isolate and strip board", False), ("Fit new board", True), ("Test and energise", True)]):
        await db.execute(
            "INSERT INTO job_stages (org_id, job_id, name, sort, requires_photo) VALUES ($1,$2,$3,$4,$5)",
            org_id, j_live, name, i, photo,
        )

    for uid, jid in [(crew1, j_live), (crew2, j_live), (crew1, j_sched)]:
        on = today if jid == j_live else today + timedelta(days=1)
        await db.execute(
            "INSERT INTO job_assignments (org_id, job_id, user_id, on_date) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING",
            org_id, jid, uid, on,
        )

    po = await db.fetchrow(
        "INSERT INTO purchase_orders (org_id, job_id, supplier, code) VALUES ($1,$2,'Rexel','PO-0001') RETURNING id",
        org_id, j_live,
    )
    for i, (desc, qty, cents) in enumerate([("Switchboard 24-way", 1, 240000), ("20A circuit breaker", 8, 3400)]):
        await db.execute(
            "INSERT INTO po_lines (org_id, po_id, description, qty, unit_cents, sort) VALUES ($1,$2,$3,$4,$5,$6)",
            org_id, po["id"], desc, qty, cents, i,
        )

    await db.execute(
        """INSERT INTO time_entries (org_id, job_id, user_id, started_at, ended_at, source)
           VALUES ($1,$2,$3, now() - interval '8 hours', now() - interval '1 hour', 'manual')""",
        org_id, j_done, crew1,
    )

    await db.execute("INSERT INTO site_tokens (org_id, site_id, token) VALUES ($1,$2,'demo-plate-token')", org_id, site["id"])
    await db.execute(
        "INSERT INTO audit_log (org_id, actor, action, detail) VALUES ($1,$2,'seed.demo_yard','{}')",
        org_id, str(owner),
    )
    return str(org_id)


async def main() -> None:
    await db.migrate()
    org_id = await seed_demo_yard()
    print(f"demo yard: {'created ' + org_id if org_id else 'already present'}")
    await db.close()


if __name__ == "__main__":
    asyncio.run(main())
