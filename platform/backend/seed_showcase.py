"""Showcase yard — the live full-blown demo org.

One coherent multi-pack story under slug `systems`, owner login `bad-form` /
`systems`, every sector module live, mock ledger connected. Idempotent by slug.
Sector deep-dive yards stay for pack-specific walks; this is the default sales surface.
"""

from __future__ import annotations

import asyncio
import json
from datetime import timedelta

import auth
import db
import svc

SETTINGS = {
    "codes": {"job": "J", "quote": "Q", "po": "PO", "invoice": "INV", "cert": "CEC"},
    "rates": {"labour_cost_cents": 9800, "labour_charge_cents": 14500},
    "ai": {"provider": "fixture", "thresholds": {"receipt": 0.8, "voice_timesheet": 0.75, "quarry_ticket": 0.85}},
    "ledger": {"provider": "xero-mock", "connected": True},
}

MODULES = {
    "kernel": "live",
    "trades": "live",
    "civil": "live",
    "fab": "live",
    "fleet": "live",
}

ITP_STAGES = [
    {"name": "Material receipt & heat verification", "requires_photo": True},
    {"name": "Cut & prep", "requires_photo": False},
    {"name": "Fit-up & weld", "requires_photo": True},
    {"name": "NDI hold point", "requires_photo": False},
    {"name": "Blast & paint", "requires_photo": True},
    {"name": "MDR compile & release", "requires_photo": False},
]


async def seed_showcase() -> str | None:
    if await db.fetchrow("SELECT id FROM organisations WHERE slug='systems'"):
        return None

    org = await db.fetchrow(
        """INSERT INTO organisations (slug, name, legal_name, abn, theme, terminology, modules, settings, is_demo, brand)
           VALUES ('systems','BAD FORM Systems','BAD FORM Systems Pty Ltd','51 824 753 556','daybook',
                   $1,$2,$3,true,$4) RETURNING id""",
        json.dumps({"job": "job", "quote": "quote", "cert": "certificate"}),
        json.dumps(MODULES),
        json.dumps(SETTINGS),
        json.dumps({
            "letterhead_line": "BAD FORM Systems — operations IMS (demo)",
            "colour": "#1f4d3a",
            "tokens": {"--mark": "#1f4d3a"},
        }),
    )
    oid = org["id"]
    today = svc.today_awst()

    async def user(name: str, email: str | None, role: str, pw: str | None = None, pin: str | None = None) -> str:
        row = await db.fetchrow(
            "INSERT INTO users (org_id, name, email, role, password_hash, pin) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
            oid, name, email, role, auth.hash_password(pw) if pw else None, pin,
        )
        return row["id"]

    mel = await user("Mel Harding", "bad-form", "owner", pw="systems")
    await user("Pat Office", "office@systems.local", "office", pw="office")
    danny = await user("Danny Field", None, "crew", pin="2468")
    sam = await user("Sam Rigger", None, "crew", pin="1357")
    cole = await user("Cole Operator", None, "crew", pin="8642")

    await db.execute(
        "INSERT INTO licences (org_id, user_id, kind, ref, expires_on) VALUES ($1,$2,'White Card','WC-8841',$3)",
        oid, danny, today + timedelta(days=9),
    )
    await db.execute(
        "INSERT INTO licences (org_id, user_id, kind, ref, expires_on) VALUES ($1,$2,'EWP','EWP-4412',$3)",
        oid, sam, today + timedelta(days=45),
    )

    async def client(name: str, contact: str, email: str) -> str:
        return await db.fetchval(
            "INSERT INTO clients (org_id, name, contact_name, email) VALUES ($1,$2,$3,$4) RETURNING id",
            oid, name, contact, email,
        )

    c_port = await client("Fremantle Port Authority", "K. Nguyen", "works@fpa.demo")
    c_mine = await client("Mid West Iron JV", "R. Bhatt", "contracts@mwi.demo")
    c_build = await client("Harbour View Developments", "J. Okonkwo", "pm@hvd.demo")

    site_wharf = await db.fetchval(
        """INSERT INTO sites (org_id, client_id, name, address, gate_code, contact_name, contact_phone)
           VALUES ($1,$2,'North Quay Berth 3','Berth 3, North Quay, Fremantle','#NQ3','Gatehouse','08 9430 3555') RETURNING id""",
        oid, c_port,
    )
    site_pad = await db.fetchval(
        """INSERT INTO sites (org_id, client_id, name, address, gate_code, contact_name, contact_phone)
           VALUES ($1,$2,'Geraldton SIA Pad 7','Pad 7, Geraldton Strategic Industrial Area','#G7','Site hut','08 9956 1200') RETURNING id""",
        oid, c_mine,
    )
    site_apt = await db.fetchval(
        """INSERT INTO sites (org_id, client_id, name, address, gate_code, contact_name, contact_phone)
           VALUES ($1,$2,'Harbour View Stage 2','22 Marine Tce, Fremantle','#HV2','J. Okonkwo','0400 221 334') RETURNING id""",
        oid, c_build,
    )
    await db.execute("INSERT INTO site_tokens (org_id, site_id, token) VALUES ($1,$2,'systems-plate-token')", oid, site_wharf)

    q_accept = await db.fetchval(
        """INSERT INTO quotes (org_id, client_id, code, title, status, valid_until, sent_at, accept_token)
           VALUES ($1,$2,'Q-1001','Wharf gantry modules + site power','accepted',$3, now() - interval '10 days', 'systems-q-wharf') RETURNING id""",
        oid, c_port, today + timedelta(days=20),
    )
    for i, (desc, qty, cents) in enumerate([
        ("Fabricate gantry modules x4", 4, 420000),
        ("Site power & temporary board", 1, 185000),
        ("Plant wet-hire — excavator (est.)", 40, 24500),
    ]):
        await db.execute(
            "INSERT INTO quote_lines (org_id, quote_id, description, qty, unit_cents, sort) VALUES ($1,$2,$3,$4,$5,$6)",
            oid, q_accept, desc, qty, cents, i,
        )
    await db.execute(
        """INSERT INTO quotes (org_id, client_id, code, title, status, valid_until, sent_at, accept_token)
           VALUES ($1,$2,'Q-1002','Pad 7 bulk earthworks — schedule of rates','sent',$3, now() - interval '2 days', 'systems-q-pad')""",
        oid, c_mine, today + timedelta(days=4),
    )

    async def job(code: str, title: str, status: str, client_id, quoted: int, **kw) -> str:
        return await db.fetchval(
            """INSERT INTO jobs (org_id, client_id, site_id, code, title, status, quoted_cents, recall_on, starts_on, completed_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id""",
            oid, client_id, kw.get("site_id"), code, title, status, quoted,
            kw.get("recall_on"), kw.get("starts_on"), kw.get("completed_at"),
        )

    j_live = await job("J-1001", "Wharf gantry + site power — Berth 3", "live", c_port, 2680000, site_id=site_wharf, starts_on=today)
    j_pad = await job("J-1002", "Geraldton Pad 7 — bulk earthworks", "live", c_mine, 4200000, site_id=site_pad, starts_on=today)
    j_sched = await job("J-1003", "Harbour View Stage 2 — first fix power", "scheduled", c_build, 186000, site_id=site_apt, starts_on=today + timedelta(days=1))
    j_done = await job("J-1004", "Temporary board hire — North Quay", "done", c_port, 64000, site_id=site_wharf)
    await db.execute(
        "UPDATE jobs SET completed_at=now() - interval '3 days', recall_on=$2 WHERE id=$1",
        j_done, today + timedelta(days=2),
    )

    for i, (name, photo) in enumerate([
        ("Isolate & strip temporary board", False),
        ("Fit permanent feed", True),
        ("Test & energise", True),
    ]):
        await db.execute(
            "INSERT INTO job_stages (org_id, job_id, name, sort, requires_photo) VALUES ($1,$2,$3,$4,$5)",
            oid, j_live, name, i, photo,
        )
    for uid, jid, day in [
        (danny, j_live, today), (sam, j_live, today), (cole, j_pad, today), (danny, j_sched, today + timedelta(days=1)),
    ]:
        await db.execute(
            "INSERT INTO job_assignments (org_id, job_id, user_id, on_date) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING",
            oid, jid, uid, day,
        )

    # Trades
    await db.execute(
        """INSERT INTO variations (org_id, job_id, code, title, detail, amount_cents, raised_by)
           VALUES ($1,$2,'V-1001','Extra gantry walkway lighting','Raised on site after client walk — LED battens to underside of modules',38500,$3)""",
        oid, j_live, danny,
    )
    await db.execute(
        """INSERT INTO certificates (org_id, job_id, kind, code, fields, status, issued_by, issued_at)
           VALUES ($1,$2,'electrical_compliance','CEC-1001',$3,'issued',$4, now() - interval '1 day')""",
        oid, j_live,
        json.dumps({"installation_address": "Berth 3 North Quay", "work_description": "Temporary board & feed", "result": "pass"}),
        mel,
    )
    await db.execute(
        """INSERT INTO certificates (org_id, job_id, kind, code, fields)
           VALUES ($1,$2,'electrical_compliance','CEC-1002',$3)""",
        oid, j_live,
        json.dumps({"installation_address": "Berth 3 North Quay", "work_description": "Gantry module feeds — draft", "result": ""}),
    )

    # Civil
    ex = await db.fetchval(
        "INSERT INTO assets (org_id, kind, name, rego, meter_hours, yard, meta) VALUES ($1,'excavator','Cat 330 Excavator',NULL,4210.5,'Fremantle Yard',$2) RETURNING id",
        oid, json.dumps({"code": "EX-04"}),
    )
    truck = await db.fetchval(
        "INSERT INTO assets (org_id, kind, name, rego, meter_hours, yard, meta) VALUES ($1,'truck','Kenworth T659 side tipper','1ERT-443',9882.0,'Fremantle Yard',$2) RETURNING id",
        oid, json.dumps({"code": "DT-11"}),
    )
    roller = await db.fetchval(
        "INSERT INTO assets (org_id, kind, name, rego, meter_hours, yard, meta) VALUES ($1,'roller','Smooth drum roller 12t',NULL,1409.0,'Geraldton Compound',$2) RETURNING id",
        oid, json.dumps({"code": "RL-02"}),
    )
    for aid, rates in [
        (ex, {"wet": (24500, 4, 9500, 45000), "dry": (16000, 8, 0, 45000)}),
        (truck, {"wet": (18500, 4, 7000, 0)}),
        (roller, {"dry": (9800, 8, 0, 22000)}),
    ]:
        for mode, (rate, min_h, standby, travel) in rates.items():
            await db.execute(
                """INSERT INTO hire_rates (org_id, asset_id, mode, rate_cents_per_hour, min_hours, standby_cents_per_hour, travel_cents)
                   VALUES ($1,$2,$3,$4,$5,$6,$7)""",
                oid, aid, mode, rate, min_h, standby, travel,
            )

    checks_ok = json.dumps([{"name": n, "ok": True} for n in (
        "Walk-around: leaks, damage, tracks/tyres", "Fluids: engine oil, hydraulic, coolant",
        "ROPS/FOPS, seatbelt, mirrors", "Lights, horn, reverse beeper",
        "Attachments secured, pins and locks", "Fire extinguisher charged",
    )])
    await db.execute(
        """INSERT INTO prestarts (org_id, asset_id, job_id, user_id, on_date, checks, faults, result, meter_hours)
           VALUES ($1,$2,$3,$4,$5,$6,'[]','pass',4211.0)""",
        oid, ex, j_pad, cole, today, checks_ok,
    )
    await db.execute(
        """INSERT INTO prestarts (org_id, asset_id, job_id, user_id, on_date, checks, faults, result, meter_hours)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'fail',1409.5)""",
        oid, roller, j_pad, cole, today,
        json.dumps([{"name": "Walk-around: leaks, damage, tracks/tyres", "ok": False}, {"name": "Fluids", "ok": True}]),
        json.dumps([{"name": "Hydraulic weep at left drum motor", "severity": "block"}]),
    )
    await db.execute(
        """INSERT INTO hire_dockets (org_id, job_id, asset_id, code, work_date, mode, hours, standby_hours, travel, tally, total_cents,
                                     status, signed_by_name, signature_key, created_by)
           VALUES ($1,$2,$3,'HD-1001',$4,'wet',6.5,1.5,false,$5,$6,'signed','S. Pillai (Halcyon)','sig-systems-hd1001',$7)""",
        oid, j_pad, ex, today, json.dumps({"loads": 14, "tonnes": 178.2}),
        round(6.5 * 24500 + 1.5 * 9500), cole,
    )
    await db.execute(
        """INSERT INTO quarry_tickets (org_id, job_id, quarry, ticket_no, material, tonnes, rate_cents_per_tonne)
           VALUES ($1,$2,'Boral Gnangara','QT-55421','roadbase 20mm',42.5,1450)""",
        oid, j_pad,
    )
    for code, desc, unit, rate in [
        ("SOR-101", "Excavate and load general fill", "m3", 850),
        ("SOR-102", "Cart and place roadbase, compacted", "t", 1450),
        ("SOR-201", "Wet hire — 30t excavator with operator", "hr", 24500),
    ]:
        await db.execute(
            "INSERT INTO sor_items (org_id, code, description, unit, rate_cents) VALUES ($1,$2,$3,$4,$5)",
            oid, code, desc, unit, rate,
        )

    # Fab
    await db.execute(
        "INSERT INTO itp_templates (org_id, name, stages) VALUES ($1,'Structural steel CC2',$2)",
        oid, json.dumps(ITP_STAGES),
    )
    for i, s in enumerate(ITP_STAGES):
        await db.execute(
            """INSERT INTO job_stages (org_id, job_id, name, sort, requires_photo, completed_at)
               VALUES ($1,$2,$3,$4,$5, CASE WHEN $4 < 2 THEN now() - interval '1 day' ELSE NULL END)""",
            oid, j_live, s["name"], i + 10, s["requires_photo"],
        )
    await db.execute(
        "INSERT INTO material_lots (org_id, job_id, heat_no, material, mill, cert_ref) VALUES ($1,$2,'HT-77120','350 Grade UB 310','InfraBuild','MC-33019')",
        oid, j_live,
    )
    await db.execute(
        "INSERT INTO ndi_records (org_id, job_id, method, result, report_ref, inspector) VALUES ($1,$2,'MT','pass','NDI-2211','J. Okon (CBIP)')",
        oid, j_live,
    )
    await db.execute(
        "INSERT INTO offcuts (org_id, description, material, heat_no, from_job_id) VALUES ($1,'UB 310 x 1.2m drop','350 Grade UB 310','HT-77120',$2)",
        oid, j_live,
    )

    # Fleet
    pm = await db.fetchval(
        "INSERT INTO assets (org_id, kind, name, rego, meter_hours, yard, meta) VALUES ($1,'truck','Kenworth T410 prime mover','1GKT-441',9120,'Bunbury Depot',$2) RETURNING id",
        oid, json.dumps({"code": "PM-01"}),
    )
    ft = await db.fetchval(
        "INSERT INTO assets (org_id, kind, name, rego, meter_hours, yard, meta) VALUES ($1,'trailer','Drake tri-axle float trailer','1TQD-880',0,'Bunbury Depot',$2) RETURNING id",
        oid, json.dumps({"code": "FT-02"}),
    )
    ex_fleet = await db.fetchval(
        "INSERT INTO assets (org_id, kind, name, rego, meter_hours, yard, meta) VALUES ($1,'excavator','Cat 336 excavator',NULL,5010,'Picton Depot',$2) RETURNING id",
        oid, json.dumps({"code": "EX-12"}),
    )
    att = await db.fetchval(
        "INSERT INTO assets (org_id, kind, name, rego, meter_hours, yard, meta) VALUES ($1,'attachment','Tilt hitch 8t',NULL,0,'Picton Depot',$2) RETURNING id",
        oid, json.dumps({"code": "ATT-07"}),
    )
    await db.execute("INSERT INTO fleet_attachments (org_id, attachment_id, carrier_id) VALUES ($1,$2,$3)", oid, att, ex_fleet)
    await db.execute(
        "INSERT INTO service_plans (org_id, asset_id, name, interval_hours, last_service_hours) VALUES ($1,$2,'A service',500,8800)",
        oid, pm,
    )
    await db.execute(
        "INSERT INTO service_plans (org_id, asset_id, name, interval_hours, last_service_hours) VALUES ($1,$2,'250h service',250,4750)",
        oid, ex_fleet,
    )
    await db.execute(
        """INSERT INTO prestarts (org_id, asset_id, job_id, user_id, on_date, checks, faults, result, meter_hours)
           VALUES ($1,$2,$3,$4,$5,$6,'[]','pass',9120)""",
        oid, pm, j_pad, danny, today, json.dumps([{"name": "Walk-around: leaks, damage, tracks/tyres", "ok": True}]),
    )
    await db.execute(
        """INSERT INTO floats (org_id, code, asset_id, job_id, from_yard, to_site, float_date, km,
                               mobilisation_cents, cents_per_km, charge_cents, created_by)
           VALUES ($1,'FL-1001',$2,$3,'Picton Depot','Geraldton SIA Pad 7',$4,38,35000,650,$5,$6)""",
        oid, ex_fleet, j_pad, today, 35000 + 38 * 650, danny,
    )
    await db.execute(
        """INSERT INTO corrective_actions (org_id, code, asset_id, title, detail, source)
           VALUES ($1,'CA-1001',$2,'Worn load binder on FT-02','Replace before next float; flagged at pre-start.','prestart')""",
        oid, ft,
    )
    for outcome, kind, summary in [
        ("fit_drivers", "policy_signoff", "Fatigue management policy signed — D. Field"),
        ("safe_vehicles", "prestart_pack", "Weekly pre-start pack filed — Bunbury Depot"),
        ("mass_and_restraint", "load_plan", "Pad 7 fill load plan signed — mass within GVM"),
        ("speed_and_fatigue", "review", "Quarterly telematics speed review — no exceedances"),
        ("review_and_improve", "toolbox", "Toolbox: float restraint refresh — Picton Depot"),
    ]:
        await db.execute(
            """INSERT INTO sms_evidence (org_id, outcome, kind, summary, evidence_date, created_by)
               VALUES ($1,$2,$3,$4,$5,$6)""",
            oid, outcome, kind, summary, today, mel,
        )

    # Inbox / chase bait
    await db.execute(
        """INSERT INTO captures (org_id, job_id, capture_type, status, extracted, confidence, checks, created_by)
           VALUES ($1,$2,'receipt','needs_verify',$3,0.42,$4,$5)""",
        oid, j_live,
        json.dumps({"supplier": "Rexel Fremantle", "total_cents": 18450, "guess": "switchgear"}),
        json.dumps([
            {"name": "supplier_match", "ok": False, "detail": "Low confidence OCR"},
            {"name": "total_present", "ok": True, "detail": "$184.50"},
        ]),
        danny,
    )
    inv = await db.fetchrow(
        """INSERT INTO invoices (org_id, job_id, code, kind, status, total_ex_cents, issued_on, due_on)
           VALUES ($1,$2,'INV-1001','invoice','overdue',42000,$3,$4) RETURNING id""",
        oid, j_done, today - timedelta(days=30), today - timedelta(days=16),
    )
    await db.execute(
        "INSERT INTO invoice_lines (org_id, invoice_id, description, qty, unit_cents, sort) VALUES ($1,$2,$3,1,$4,0)",
        oid, inv["id"], "Temporary board hire — North Quay", 42000,
    )
    await db.execute(
        """INSERT INTO notifications (org_id, audience, event_type, title, body, link)
           VALUES ($1,'staff','capture.needs_verify','Receipt waiting for a look','Rexel Fremantle — low confidence','/inbox')""",
        oid,
    )
    await db.execute(
        "INSERT INTO audit_log (org_id, actor, action, detail) VALUES ($1,$2,'seed.showcase',$3)",
        oid, str(mel), json.dumps({"slug": "systems"}),
    )
    return str(oid)


async def seed_all_demo_yards() -> dict[str, str | None]:
    """Idempotent boot/smoke seed: showcase + kernel demo + every sector yard."""
    import seed
    from packs.civil import seed_civil
    from packs.fab import seed_fab
    from packs.fleet import seed_fleet
    from packs.trades import seed_trades

    out: dict[str, str | None] = {
        "systems": await seed_showcase(),
        "demo": await seed.seed_demo_yard(),
    }
    out.update(await seed_trades.seed_trades_yards())
    out["kemgrade"] = await seed_civil.seed_kemerton()
    out["steelhaus"] = await seed_fab.seed_steelhaus()
    out["redline"] = await seed_fleet.seed_redline()
    return out


async def main() -> None:
    await db.migrate()
    res = await seed_all_demo_yards()
    for slug, oid in res.items():
        print(f"{slug}: {'created ' + oid if oid else 'already present'}")
    await db.close()


if __name__ == "__main__":
    asyncio.run(main())
