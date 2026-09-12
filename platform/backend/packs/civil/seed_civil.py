"""Kemerton demo yard — the civil pack fixture: earthworks contractor on the
Kemerton pad with plant, wet/dry rates, a passed pre-start, and a draft docket.
Idempotent by slug.
"""

import asyncio
import json
from datetime import timedelta

import auth
import db
import svc

SETTINGS = {
    "codes": {"job": "KP", "quote": "SOR", "po": "PO", "invoice": "INV"},
    "rates": {"labour_cost_cents": 11500},
    "ai": {"provider": "fixture", "thresholds": {"quarry_ticket": 0.85, "hire_docket": 0.8}},
    "ledger": {"provider": "xero-mock", "connected": True},
}

PLANT = [
    ("EX-04", "Cat 330 Excavator", "excavator", None, 4210.5, {"wet": (24500, 4, 9500, 45000), "dry": (16000, 8, 0, 45000)}),
    ("DT-11", "Kenworth T659 + side tipper", "truck", "1ERT-443", 9882.0, {"wet": (18500, 4, 7000, 0)}),
    ("RL-02", "Smooth drum roller 12t", "roller", None, 1409.0, {"dry": (9800, 8, 0, 22000)}),
]


async def seed_kemerton() -> str | None:
    if await db.fetchrow("SELECT id FROM organisations WHERE slug='kemgrade'"):
        return None
    org = await db.fetchrow(
        """INSERT INTO organisations (slug, name, legal_name, abn, theme, terminology, modules, settings, is_demo, brand)
           VALUES ('kemgrade','Kemgrade Earthmoving','Kemgrade Earthmoving Pty Ltd','44 222 111 000','daybook',
                   $1,$2,$3,true,$4) RETURNING id""",
        json.dumps({"job": "pad", "quote": "schedule"}),
        json.dumps({"kernel": "live", "civil": "live"}),
        json.dumps(SETTINGS),
        json.dumps({"letterhead_line": "Kemgrade Earthmoving — wet & dry plant hire"}),
    )
    oid = org["id"]

    await db.execute(
        "INSERT INTO users (org_id, name, email, role, password_hash) VALUES ($1,'Deb Kemp','owner@kemgrade.local','owner',$2)",
        oid, auth.hash_password("kemgrade-owner"),
    )
    op = await db.fetchval(
        "INSERT INTO users (org_id, name, role, pin) VALUES ($1,'Cole Operator','crew','7777') RETURNING id", oid
    )

    client = await db.fetchval(
        "INSERT INTO clients (org_id, name, contact_name, email) VALUES ($1,'Halcyon Civil (head contractor)','S. Pillai','dockets@halcyon.local') RETURNING id",
        oid,
    )
    today = svc.today_awst()
    job = await db.fetchval(
        """INSERT INTO jobs (org_id, client_id, code, title, status, quoted_cents, starts_on)
           VALUES ($1,$2,'KP-0001','Kemerton pad — bulk earthworks','live',4200000,$3) RETURNING id""",
        oid, client, today,
    )
    await db.execute(
        "INSERT INTO job_assignments (org_id, job_id, user_id, on_date) VALUES ($1,$2,$3,$4)", oid, job, op, today
    )

    assets: dict[str, str] = {}
    for code, name, kind, rego, hours, rates in PLANT:
        aid = await db.fetchval(
            "INSERT INTO assets (org_id, kind, name, rego, meter_hours, yard, meta) VALUES ($1,$2,$3,$4,$5,'Kemerton',$6) RETURNING id",
            oid, kind, name, rego, hours, json.dumps({"code": code}),
        )
        assets[code] = aid
        for mode, (rate, min_h, standby, travel) in rates.items():
            await db.execute(
                """INSERT INTO hire_rates (org_id, asset_id, mode, rate_cents_per_hour, min_hours, standby_cents_per_hour, travel_cents)
                   VALUES ($1,$2,$3,$4,$5,$6,$7)""",
                oid, aid, mode, rate, min_h, standby, travel,
            )

    await db.execute(
        """INSERT INTO prestarts (org_id, asset_id, job_id, user_id, on_date, checks, faults, result, meter_hours)
           VALUES ($1,$2,$3,$4,$5,$6,'[]','pass',4211.0)""",
        oid, assets["EX-04"], job, op, today,
        json.dumps([{"name": n, "ok": True} for n in (
            "Walk-around: leaks, damage, tracks/tyres", "Fluids: engine oil, hydraulic, coolant",
            "ROPS/FOPS, seatbelt, mirrors", "Lights, horn, reverse beeper",
            "Attachments secured, pins and locks", "Fire extinguisher charged")]),
    )

    await db.execute(
        """INSERT INTO hire_dockets (org_id, job_id, asset_id, code, work_date, mode, hours, standby_hours, travel, tally, total_cents, created_by)
           VALUES ($1,$2,$3,'HD-0001',$4,'wet',6.5,1.5,false,$5, $6, $7)""",
        oid, job, assets["EX-04"], today, json.dumps({"loads": 14, "tonnes": 178.2}),
        round(6.5 * 24500 + 1.5 * 9500), op,
    )

    for code, desc, unit, rate in [
        ("SOR-101", "Excavate and load general fill", "m3", 850),
        ("SOR-102", "Cart and place roadbase, compacted", "t", 1450),
        ("SOR-201", "Wet hire — 30t excavator with operator", "hr", 24500),
        ("SOR-305", "Float mobilisation within 50km", "ea", 45000),
    ]:
        await db.execute(
            "INSERT INTO sor_items (org_id, code, description, unit, rate_cents) VALUES ($1,$2,$3,$4,$5)",
            oid, code, desc, unit, rate,
        )

    await db.execute(
        """INSERT INTO quotes (org_id, client_id, code, title, status, valid_until, sent_at, accept_token)
           VALUES ($1,$2,'SOR-0001','Kemerton stage 2 — schedule of rates','sent',$3, now(),'kemgrade-quote-token')""",
        oid, client, today + timedelta(days=10),
    )
    return str(oid)


async def main() -> None:
    await db.migrate()
    oid = await seed_kemerton()
    print(f"kemgrade: {'created ' + oid if oid else 'already present'}")
    await db.close()


if __name__ == "__main__":
    asyncio.run(main())
