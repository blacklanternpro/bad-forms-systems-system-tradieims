"""Redline Haulage demo yard — the fleet pack fixture: two depots, a prime mover
and float trailer, an excavator with a due service, an attachment on its carrier,
a planned float, an open corrective action, and SMS evidence across the outcomes.
Runs civil live too (pre-starts feed the meter clock). Idempotent by slug.
"""

import asyncio
import json

import auth
import db
import svc

SETTINGS = {
    "codes": {"job": "RH", "quote": "Q", "po": "PO", "invoice": "INV"},
    "rates": {"labour_cost_cents": 9800},
    "ai": {"provider": "fixture", "thresholds": {"load_restraint": 0.85}},
    "ledger": {"provider": "xero-mock", "connected": True},
}


async def seed_redline() -> str | None:
    if await db.fetchrow("SELECT id FROM organisations WHERE slug='redline'"):
        return None
    org = await db.fetchrow(
        """INSERT INTO organisations (slug, name, legal_name, abn, theme, terminology, modules, settings, is_demo, brand)
           VALUES ('redline','Redline Haulage & Plant','Redline Haulage & Plant Pty Ltd','31 222 555 888','daybook',
                   $1,$2,$3,true,$4) RETURNING id""",
        json.dumps({"job": "cartage job"}),
        json.dumps({"kernel": "live", "civil": "live", "fleet": "live"}),
        json.dumps(SETTINGS),
        json.dumps({"letterhead_line": "Redline Haulage & Plant — CoR accredited carrier"}),
    )
    oid = org["id"]

    await db.execute(
        "INSERT INTO users (org_id, name, email, role, password_hash) VALUES ($1,'Rhonda Boss','owner@redline.local','owner',$2)",
        oid, auth.hash_password("redline-owner"),
    )
    driver = await db.fetchval(
        "INSERT INTO users (org_id, name, role, pin) VALUES ($1,'Mick Driver','crew','8888') RETURNING id", oid
    )

    client = await db.fetchval(
        "INSERT INTO clients (org_id, name, contact_name, email) VALUES ($1,'Kemerton SIA Alliance','P. Ngo','ops@kemsia.local') RETURNING id",
        oid,
    )
    job = await db.fetchval(
        """INSERT INTO jobs (org_id, client_id, code, title, status, quoted_cents, starts_on)
           VALUES ($1,$2,'RH-0001','Cartage — Kemerton pad 7 fill','live',5200000,$3) RETURNING id""",
        oid, client, svc.today_awst(),
    )
    await db.execute(
        "INSERT INTO job_assignments (org_id, job_id, user_id, on_date) VALUES ($1,$2,$3,$4)",
        oid, job, driver, svc.today_awst(),
    )

    async def asset(code: str, name: str, kind: str, rego: str | None, yard: str, meter: float) -> str:
        return await db.fetchval(
            "INSERT INTO assets (org_id, kind, name, rego, yard, meter_hours, meta) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id",
            oid, kind, name, rego, yard, meter, json.dumps({"code": code}),
        )

    pm = await asset("PM-01", "Kenworth T410 prime mover", "truck", "1GKT-441", "Bunbury Depot", 9120)
    ft = await asset("FT-02", "Drake tri-axle float trailer", "trailer", "1TQD-880", "Bunbury Depot", 0)
    ex = await asset("EX-12", "Cat 336 excavator", "excavator", None, "Picton Depot", 5010)
    att = await asset("ATT-07", "Tilt hitch 8t", "attachment", None, "Picton Depot", 0)

    await db.execute(
        "INSERT INTO fleet_attachments (org_id, attachment_id, carrier_id) VALUES ($1,$2,$3)", oid, att, ex
    )

    # PM-01 is 180h from its A service; EX-12 is 10h past its 250h interval — one queue entry.
    await db.execute(
        "INSERT INTO service_plans (org_id, asset_id, name, interval_hours, last_service_hours) VALUES ($1,$2,'A service',500,8800)",
        oid, pm,
    )
    await db.execute(
        "INSERT INTO service_plans (org_id, asset_id, name, interval_hours, last_service_hours) VALUES ($1,$2,'250h service',250,4750)",
        oid, ex,
    )

    await db.execute(
        """INSERT INTO prestarts (org_id, asset_id, job_id, user_id, on_date, checks, faults, result, meter_hours)
           VALUES ($1,$2,$3,$4,$5,$6,'[]','pass',9120)""",
        oid, pm, job, driver, svc.today_awst(),
        json.dumps([{"name": "Walk-around: leaks, damage, tracks/tyres", "ok": True}]),
    )

    await db.execute(
        """INSERT INTO floats (org_id, code, asset_id, job_id, from_yard, to_site, float_date, km,
                               mobilisation_cents, cents_per_km, charge_cents, created_by)
           VALUES ($1,'FL-0001',$2,$3,'Picton Depot','Kemerton SIA pad 7',$4,38,35000,650,$5,$6)""",
        oid, ex, job, svc.today_awst(), 35000 + 38 * 650, driver,
    )

    await db.execute(
        """INSERT INTO corrective_actions (org_id, code, asset_id, title, detail, source)
           VALUES ($1,'CA-0001',$2,'Worn load binder on FT-02','Replace before next float; flagged at pre-start.','prestart')""",
        oid, ft,
    )

    await db.execute(
        """INSERT INTO sms_evidence (org_id, outcome, kind, summary, evidence_date, created_by)
           VALUES ($1,'fit_drivers','policy_signoff','Fatigue management policy signed — M. Driver',$2,$3)""",
        oid, svc.today_awst(), driver,
    )
    await db.execute(
        """INSERT INTO sms_evidence (org_id, outcome, kind, summary, evidence_date, created_by)
           VALUES ($1,'speed_and_fatigue','review','Quarterly telematics speed review — no exceedances',$2,$3)""",
        oid, svc.today_awst(), driver,
    )
    return str(oid)


async def main() -> None:
    await db.migrate()
    oid = await seed_redline()
    print(f"redline: {'created ' + oid if oid else 'already present'}")
    await db.close()


if __name__ == "__main__":
    asyncio.run(main())
