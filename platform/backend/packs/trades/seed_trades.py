"""Two synthetic trades yards — the Phase 3 parity fixtures.

voltline  : electrical contractor (certs, wholesaler receipts, variations)
sitecast  : concrete crew (pour terminology, voice timesheets, recalls)

Both idempotent by slug. Layered on the kernel schema + trades pack tables.
"""

import asyncio
import json
from datetime import timedelta

import auth
import db
import svc

TRADES_SETTINGS = {
    "codes": {"job": "J", "quote": "Q", "po": "PO", "invoice": "INV", "cert": "CEC"},
    "rates": {"labour_cost_cents": 9800, "labour_charge_cents": 14500},
    "ai": {"provider": "fixture", "thresholds": {"receipt": 0.8, "voice_timesheet": 0.75}},
    "ledger": {"provider": "xero-mock", "connected": True},
}


async def _yard(slug: str, name: str, terminology: dict, cert_prefix: str) -> str | None:
    if await db.fetchrow("SELECT id FROM organisations WHERE slug=$1", slug):
        return None
    settings = {**TRADES_SETTINGS, "codes": {**TRADES_SETTINGS["codes"], "cert": cert_prefix}}
    org = await db.fetchrow(
        """INSERT INTO organisations (slug, name, legal_name, abn, theme, terminology, modules, settings, is_demo, brand)
           VALUES ($1,$2,$3,'98 765 432 109','daybook',$4,$5,$6,true,$7) RETURNING id""",
        slug, name, f"{name} Pty Ltd", json.dumps(terminology),
        json.dumps({"kernel": "live", "trades": "live"}),
        json.dumps(settings), json.dumps({"letterhead_line": f"{name} — licensed & insured"}),
    )
    oid = org["id"]

    owner = await db.fetchval(
        "INSERT INTO users (org_id, name, email, role, password_hash) VALUES ($1,$2,$3,'owner',$4) RETURNING id",
        oid, "Alex Owner", f"owner@{slug}.local", auth.hash_password(f"{slug}-owner"),
    )
    crew = await db.fetchval(
        "INSERT INTO users (org_id, name, role, pin) VALUES ($1,'Riley Crew','crew','4321') RETURNING id", oid
    )

    client = await db.fetchval(
        "INSERT INTO clients (org_id, name, contact_name, email) VALUES ($1,'Bayview Property Co','M. Chen',$2) RETURNING id",
        oid, f"accounts@bayview-{slug}.local",
    )
    site = await db.fetchval(
        "INSERT INTO sites (org_id, client_id, name, address, gate_code) VALUES ($1,$2,'Bayview Unit 7','7/22 Harbour Rd','#1188') RETURNING id",
        oid, client,
    )

    today = svc.today_awst()
    live = await db.fetchval(
        """INSERT INTO jobs (org_id, client_id, site_id, code, title, status, quoted_cents, starts_on)
           VALUES ($1,$2,$3,'J-0001',$4,'live',180000,$5) RETURNING id""",
        oid, client, site,
        "Rewire unit 7" if slug == "voltline" else "Pour driveway slab unit 7", today,
    )
    await db.execute(
        """INSERT INTO jobs (org_id, client_id, code, title, status, quoted_cents, completed_at, recall_on)
           VALUES ($1,$2,'J-0002',$3,'done',65000, now() - interval '3 days', $4)""",
        oid, client,
        "Switchboard test & tag" if slug == "voltline" else "Cut and seal expansion joints",
        today + timedelta(days=2),
    )
    await db.execute(
        "INSERT INTO job_assignments (org_id, job_id, user_id, on_date) VALUES ($1,$2,$3,$4)",
        oid, live, crew, today,
    )

    await db.execute(
        """INSERT INTO quotes (org_id, client_id, code, title, status, valid_until, sent_at, accept_token)
           VALUES ($1,$2,'Q-0001',$3,'sent',$4, now(), $5)""",
        oid, client,
        "3-phase upgrade — Bayview common area" if slug == "voltline" else "Footpath replacement — Bayview frontage",
        today + timedelta(days=6), f"{slug}-quote-token",
    )

    await db.execute(
        """INSERT INTO variations (org_id, job_id, code, title, detail, amount_cents, raised_by)
           VALUES ($1,$2,'V-0001',$3,$4,45000,$5)""",
        oid, live,
        "Extra circuit for oven" if slug == "voltline" else "Additional mesh for driveway apron",
        "Raised from the field during first fix", owner,
    )

    kind = "electrical_compliance" if slug == "voltline" else "test_report"
    await db.execute(
        "INSERT INTO certificates (org_id, job_id, kind, code, fields) VALUES ($1,$2,$3,$4,$5)",
        oid, live, kind, f"{cert_prefix}-0001",
        json.dumps({"installation_address": "7/22 Harbour Rd", "work_description": "First fix", "result": "pass"}),
    )
    return str(oid)


async def seed_trades_yards() -> dict[str, str | None]:
    return {
        "voltline": await _yard("voltline", "Voltline Electrical", {"job": "job", "cert": "certificate"}, "CEC"),
        "sitecast": await _yard("sitecast", "Sitecast Concrete", {"job": "pour", "quote": "proposal"}, "TTR"),
    }


async def main() -> None:
    await db.migrate()
    res = await seed_trades_yards()
    for slug, oid in res.items():
        print(f"{slug}: {'created ' + oid if oid else 'already present'}")
    await db.close()


if __name__ == "__main__":
    asyncio.run(main())
