"""Steelhaus demo yard — the fabrication pack fixture: a structural steel shop
with an ITP template, a job mid-flow, traceable heats, offcuts and NDI.
Idempotent by slug.
"""

import asyncio
import json

import auth
import db
import svc

ITP_STAGES = [
    {"name": "Material receipt & heat verification", "requires_photo": True},
    {"name": "Cut & prep", "requires_photo": False},
    {"name": "Fit-up & weld", "requires_photo": True},
    {"name": "NDI hold point", "requires_photo": False},
    {"name": "Blast & paint", "requires_photo": True},
    {"name": "MDR compile & release", "requires_photo": False},
]

SETTINGS = {
    "codes": {"job": "WO", "quote": "Q", "po": "PO", "invoice": "INV"},
    "rates": {"labour_cost_cents": 10500},
    "ai": {"provider": "fixture", "thresholds": {"heat_cert": 0.85}},
    "ledger": {"provider": "xero-mock", "connected": True},
}


async def seed_steelhaus() -> str | None:
    if await db.fetchrow("SELECT id FROM organisations WHERE slug='steelhaus'"):
        return None
    org = await db.fetchrow(
        """INSERT INTO organisations (slug, name, legal_name, abn, theme, terminology, modules, settings, is_demo, brand)
           VALUES ('steelhaus','Steelhaus Fabrication','Steelhaus Fabrication Pty Ltd','77 888 999 000','daybook',
                   $1,$2,$3,true,$4) RETURNING id""",
        json.dumps({"job": "work order"}),
        json.dumps({"kernel": "live", "fab": "live"}),
        json.dumps(SETTINGS),
        json.dumps({"letterhead_line": "Steelhaus Fabrication — AS/NZS 5131 CC2"}),
    )
    oid = org["id"]

    await db.execute(
        "INSERT INTO users (org_id, name, email, role, password_hash) VALUES ($1,'Nadia Boss','owner@steelhaus.local','owner',$2)",
        oid, auth.hash_password("steelhaus-owner"),
    )
    welder = await db.fetchval(
        "INSERT INTO users (org_id, name, role, pin) VALUES ($1,'Marco Welder','crew','5555') RETURNING id", oid
    )

    client = await db.fetchval(
        "INSERT INTO clients (org_id, name, contact_name, email) VALUES ($1,'Portside Constructions','D. Reyes','qa@portside.local') RETURNING id",
        oid,
    )
    job = await db.fetchval(
        """INSERT INTO jobs (org_id, client_id, code, title, status, quoted_cents, starts_on)
           VALUES ($1,$2,'WO-0001','Conveyor gantry modules x4','live',6800000,$3) RETURNING id""",
        oid, client, svc.today_awst(),
    )
    await db.execute(
        "INSERT INTO job_assignments (org_id, job_id, user_id, on_date) VALUES ($1,$2,$3,$4)",
        oid, job, welder, svc.today_awst(),
    )

    tpl = await db.fetchval(
        "INSERT INTO itp_templates (org_id, name, stages) VALUES ($1,'Structural steel CC2',$2) RETURNING id",
        oid, json.dumps(ITP_STAGES),
    )
    for i, s in enumerate(ITP_STAGES):
        await db.execute(
            "INSERT INTO job_stages (org_id, job_id, name, sort, requires_photo, completed_at) VALUES ($1,$2,$3,$4,$5, CASE WHEN $4 < 2 THEN now() ELSE NULL END)",
            oid, job, s["name"], i, s["requires_photo"],
        )

    await db.execute(
        "INSERT INTO material_lots (org_id, job_id, heat_no, material, mill, cert_ref) VALUES ($1,$2,'HT-77120','350 Grade UB 310','InfraBuild','MC-33019')",
        oid, job,
    )
    await db.execute(
        "INSERT INTO ndi_records (org_id, job_id, method, result, report_ref, inspector) VALUES ($1,$2,'MT','pass','NDI-2211','J. Okon (CBIP)')",
        oid, job,
    )
    await db.execute(
        "INSERT INTO offcuts (org_id, description, material, heat_no, from_job_id) VALUES ($1,'UB 310 x 1.2m drop','350 Grade UB 310','HT-77120',$2)",
        oid, job,
    )
    _ = tpl
    return str(oid)


async def main() -> None:
    await db.migrate()
    oid = await seed_steelhaus()
    print(f"steelhaus: {'created ' + oid if oid else 'already present'}")
    await db.close()


if __name__ == "__main__":
    asyncio.run(main())
