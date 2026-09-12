"""Civil pack: plant register (over kernel assets), wet/dry hire rate engine,
dispatch-blocking pre-starts, sign-on-glass hire dockets with the tally counter,
SoR library, quarry tickets allocated from verified captures.

Mounted at /api/civil; every endpoint gates on the civil module.
"""
import base64
import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

import auth
import db
import money
import notify
import pdfs
import storage
import svc
from kernel import timeline
from kernel.common import require_module
from kernel.routes_capture import register_allocator

r = APIRouter(tags=["civil"])

PRESTART_CHECKS = [
    "Walk-around: leaks, damage, tracks/tyres",
    "Fluids: engine oil, hydraulic, coolant",
    "ROPS/FOPS, seatbelt, mirrors",
    "Lights, horn, reverse beeper",
    "Attachments secured, pins and locks",
    "Fire extinguisher charged",
]


class PlantIn(BaseModel):
    code: str
    name: str
    kind: str = "excavator"
    rego: str | None = None
    yard: str | None = None


@r.get("/plant")
async def plant_list(u=Depends(auth.anyone)):
    await require_module(u["org_id"], "civil")
    rows = await db.fetch(
        """SELECT a.*,
                  (SELECT result FROM prestarts p WHERE p.asset_id=a.id AND p.on_date=$2 ORDER BY p.created_at DESC LIMIT 1) AS prestart_today
           FROM assets a WHERE a.org_id=$1 AND a.active ORDER BY a.meta->>'code'""",
        u["org_id"], svc.today_awst(),
    )
    return svc.rows(rows)


@r.post("/plant")
async def plant_create(body: PlantIn, u=Depends(auth.staff)):
    await require_module(u["org_id"], "civil")
    row = await db.fetchrow(
        "INSERT INTO assets (org_id, kind, name, rego, yard, meta) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
        u["org_id"], body.kind, body.name, body.rego, body.yard, json.dumps({"code": body.code}),
    )
    return svc.row_dict(row)


class RateIn(BaseModel):
    mode: str  # wet | dry
    rate_cents_per_hour: int
    min_hours: float = 0
    standby_cents_per_hour: int = 0
    travel_cents: int = 0


@r.get("/plant/{aid}/rates")
async def rates_list(aid: str, u=Depends(auth.staff)):
    await require_module(u["org_id"], "civil")
    return svc.rows(await db.fetch("SELECT * FROM hire_rates WHERE org_id=$1 AND asset_id=$2 ORDER BY mode", u["org_id"], aid))


@r.post("/plant/{aid}/rates")
async def rate_set(aid: str, body: RateIn, u=Depends(auth.staff)):
    await require_module(u["org_id"], "civil")
    if body.mode not in ("wet", "dry"):
        raise HTTPException(400, "Bad mode")
    row = await db.fetchrow(
        """INSERT INTO hire_rates (org_id, asset_id, mode, rate_cents_per_hour, min_hours, standby_cents_per_hour, travel_cents)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (org_id, asset_id, mode) DO UPDATE SET rate_cents_per_hour=EXCLUDED.rate_cents_per_hour,
             min_hours=EXCLUDED.min_hours, standby_cents_per_hour=EXCLUDED.standby_cents_per_hour, travel_cents=EXCLUDED.travel_cents
           RETURNING *""",
        u["org_id"], aid, body.mode, body.rate_cents_per_hour, body.min_hours, body.standby_cents_per_hour, body.travel_cents,
    )
    return svc.row_dict(row)


class PrestartIn(BaseModel):
    asset_id: str
    job_id: str | None = None
    checks: list[dict]  # [{name, ok}]
    faults: list[str] = []
    meter_hours: float | None = None


@r.get("/prestart-checks")
async def prestart_checks(u=Depends(auth.anyone)):
    await require_module(u["org_id"], "civil")
    return PRESTART_CHECKS


@r.post("/prestarts")
async def prestart_submit(body: PrestartIn, u=Depends(auth.anyone)):
    """A failed check blocks that machine's dockets for the day until it passes."""
    await require_module(u["org_id"], "civil")
    failed = [c["name"] for c in body.checks if not c.get("ok")] + list(body.faults)
    result = "fail" if failed else "pass"
    row = await db.fetchrow(
        """INSERT INTO prestarts (org_id, asset_id, job_id, user_id, on_date, checks, faults, result, meter_hours)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *""",
        u["org_id"], body.asset_id, body.job_id, u["user_id"], svc.today_awst(),
        json.dumps(body.checks), json.dumps(failed), result, body.meter_hours,
    )
    if body.meter_hours is not None:
        await db.execute(
            "UPDATE assets SET meter_hours=GREATEST(meter_hours, $3) WHERE org_id=$1 AND id=$2",
            u["org_id"], body.asset_id, body.meter_hours,
        )
    if result == "fail":
        plant = await db.fetchrow("SELECT name, meta FROM assets WHERE id=$1", body.asset_id)
        await notify.emit(
            u["org_id"], "prestart_failed", f"Pre-start FAILED — {plant['name']}",
            "; ".join(failed), link="/plant", audience="staff",
        )
    return {**svc.row_dict(row), "dispatch_blocked": result == "fail"}


@r.get("/prestarts")
async def prestarts_list(date_str: str | None = None, u=Depends(auth.staff)):
    await require_module(u["org_id"], "civil")
    day = svc.parse_date(date_str) or svc.today_awst()
    rows = await db.fetch(
        """SELECT p.*, a.name AS plant_name, us.name AS operator FROM prestarts p
           JOIN assets a ON a.id=p.asset_id JOIN users us ON us.id=p.user_id
           WHERE p.org_id=$1 AND p.on_date=$2 ORDER BY p.created_at DESC""",
        u["org_id"], day,
    )
    return svc.rows(rows)


def docket_total(rate: dict, hours: float, standby_hours: float, travel: bool) -> int:
    """The wet/dry hire rate engine: minimum hours, standby, travel — no surprises."""
    billed = max(float(hours), float(rate["min_hours"]))
    total = round(billed * rate["rate_cents_per_hour"])
    total += round(float(standby_hours) * rate["standby_cents_per_hour"])
    if travel:
        total += rate["travel_cents"]
    return total


class DocketIn(BaseModel):
    job_id: str
    asset_id: str
    mode: str
    hours: float
    standby_hours: float = 0
    travel: bool = False
    tally: dict = {}  # e.g. {"loads": 14, "tonnes": 178.2}


@r.post("/dockets")
async def docket_create(body: DocketIn, u=Depends(auth.anyone)):
    await require_module(u["org_id"], "civil")
    today = svc.today_awst()
    ps = await db.fetchrow(
        "SELECT result FROM prestarts WHERE org_id=$1 AND asset_id=$2 AND on_date=$3 ORDER BY created_at DESC LIMIT 1",
        u["org_id"], body.asset_id, today,
    )
    if not ps:
        raise HTTPException(409, "No pre-start today — do the pre-start before raising a docket")
    if ps["result"] == "fail":
        raise HTTPException(409, "Pre-start FAILED today — machine is blocked until it passes")
    rate = await db.fetchrow(
        "SELECT * FROM hire_rates WHERE org_id=$1 AND asset_id=$2 AND mode=$3", u["org_id"], body.asset_id, body.mode
    )
    if not rate:
        raise HTTPException(400, f"No {body.mode} hire rate set for this machine")
    codes = [x["code"] for x in await db.fetch("SELECT code FROM hire_dockets WHERE org_id=$1", u["org_id"])]
    total = docket_total(dict(rate), body.hours, body.standby_hours, body.travel)
    row = await db.fetchrow(
        """INSERT INTO hire_dockets (org_id, job_id, asset_id, code, work_date, mode, hours, standby_hours, travel, tally, total_cents, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *""",
        u["org_id"], body.job_id, body.asset_id, svc.next_in_series(codes, "HD"), today, body.mode,
        body.hours, body.standby_hours, body.travel, svc.dumps(body.tally), total, u["user_id"],
    )
    await timeline.log(u["org_id"], body.job_id, "docket.created", f"{row['code']} — {money.fmt(total)}", actor=u["user_id"])
    return svc.row_dict(row)


@r.get("/dockets")
async def dockets_list(status: str = "all", u=Depends(auth.staff)):
    await require_module(u["org_id"], "civil")
    rows = await db.fetch(
        """SELECT d.*, a.name AS plant_name, j.code AS job_code FROM hire_dockets d
           JOIN assets a ON a.id=d.asset_id JOIN jobs j ON j.id=d.job_id
           WHERE d.org_id=$1 AND ($2='all' OR d.status=$2) ORDER BY d.created_at DESC""",
        u["org_id"], status,
    )
    return svc.rows(rows)


class SignIn(BaseModel):
    signed_by_name: str
    signature_png: str  # data URL from the pad


@r.post("/dockets/{did}/sign")
async def docket_sign(did: str, body: SignIn, u=Depends(auth.anyone)):
    """Sign-on-glass by the head contractor's supervisor, in the cab."""
    await require_module(u["org_id"], "civil")
    d = await db.fetchrow("SELECT * FROM hire_dockets WHERE org_id=$1 AND id=$2 AND status='draft'", u["org_id"], did)
    if not d:
        raise HTTPException(404, "Draft docket not found")
    raw = body.signature_png.split(",", 1)[-1]
    key = f"{u['org_id']}/signatures/docket-{d['code']}.png"
    await storage.put_object(key, base64.b64decode(raw))
    await db.execute(
        "UPDATE hire_dockets SET status='signed', signed_by_name=$3, signature_key=$4 WHERE org_id=$1 AND id=$2",
        u["org_id"], did, body.signed_by_name, key,
    )
    await timeline.log(u["org_id"], str(d["job_id"]), "docket.signed", f"{d['code']} signed by {body.signed_by_name}", actor=u["user_id"])
    return {"ok": True}


@r.post("/dockets/{did}/approve")
async def docket_approve(did: str, u=Depends(auth.staff)):
    """Supervisor approval: locks the docket, generates the PDF, emails the client."""
    org = await require_module(u["org_id"], "civil")
    d = await db.fetchrow(
        """SELECT d.*, a.name AS plant_name, j.code AS job_code, j.title AS job_title, c.email AS client_email
           FROM hire_dockets d JOIN assets a ON a.id=d.asset_id JOIN jobs j ON j.id=d.job_id
           LEFT JOIN clients c ON c.id=j.client_id
           WHERE d.org_id=$1 AND d.id=$2 AND d.status='signed'""",
        u["org_id"], did,
    )
    if not d:
        raise HTTPException(404, "Signed docket not found (draft dockets need the client signature first)")
    d = svc.row_dict(d)
    await db.execute(
        "UPDATE hire_dockets SET status='approved', approved_by=$3, approved_at=now() WHERE org_id=$1 AND id=$2",
        u["org_id"], did, u["user_id"],
    )
    pdf = _docket_pdf(org, d)
    key = f"{u['org_id']}/dockets/{d['code']}.pdf"
    await storage.put_object(key, pdf)
    await db.execute(
        "INSERT INTO documents (org_id, job_id, kind, name, storage_key, created_by) VALUES ($1,$2,'pdf',$3,$4,$5)",
        u["org_id"], d["job_id"], f"{d['code']}.pdf", key, u["user_id"],
    )
    await notify.queue_email(
        u["org_id"], d.get("client_email") or "unaddressed@localhost",
        f"Daily docket {d['code']} — {d['job_title']}",
        f"Docket {d['code']} for {d['plant_name']} on {d['work_date']}: {money.fmt(d['total_cents'])} ex GST.",
        {"job_id": str(d["job_id"]), "docket_id": did},
    )
    await timeline.log(u["org_id"], str(d["job_id"]), "docket.approved", f"{d['code']} approved and emailed", actor=u["user_id"])
    return {"ok": True}


def _docket_pdf(org: dict, d: dict) -> bytes:
    tally = d.get("tally") or {}
    fields = [
        ("docket no.", d["code"]),
        ("job", f"{d['job_code']} {d['job_title']}"),
        ("plant", d["plant_name"]),
        ("date", str(d["work_date"])),
        ("mode", f"{d['mode']} hire"),
        ("hours / standby", f"{d['hours']} / {d['standby_hours']}"),
        ("tally", ", ".join(f"{k}: {v}" for k, v in tally.items()) or "—"),
        ("total ex GST", money.fmt(d["total_cents"])),
        ("signed by", d.get("signed_by_name") or "—"),
    ]
    return pdfs.form_pdf(org, f"Daily docket {d['code']}", fields, "Signed on glass in the cab — signature held on file.")


@r.get("/dockets/{did}/pdf")
async def docket_pdf(did: str, u=Depends(auth.staff)):
    org = await require_module(u["org_id"], "civil")
    d = await db.fetchrow(
        """SELECT d.*, a.name AS plant_name, j.code AS job_code, j.title AS job_title FROM hire_dockets d
           JOIN assets a ON a.id=d.asset_id JOIN jobs j ON j.id=d.job_id WHERE d.org_id=$1 AND d.id=$2""",
        u["org_id"], did,
    )
    if not d:
        raise HTTPException(404, "Docket not found")
    return Response(content=_docket_pdf(org, svc.row_dict(d)), media_type="application/pdf")


class SorIn(BaseModel):
    code: str
    description: str
    unit: str = "ea"
    rate_cents: int


@r.get("/sor")
async def sor_list(q: str = "", u=Depends(auth.staff)):
    await require_module(u["org_id"], "civil")
    rows = await db.fetch(
        """SELECT * FROM sor_items WHERE org_id=$1 AND ($2='' OR lower(description) LIKE '%'||lower($2)||'%' OR lower(code) LIKE '%'||lower($2)||'%')
           ORDER BY code LIMIT 50""",
        u["org_id"], q,
    )
    return svc.rows(rows)


@r.post("/sor")
async def sor_create(body: SorIn, u=Depends(auth.staff)):
    await require_module(u["org_id"], "civil")
    row = await db.fetchrow(
        "INSERT INTO sor_items (org_id, code, description, unit, rate_cents) VALUES ($1,$2,$3,$4,$5) RETURNING *",
        u["org_id"], body.code, body.description, body.unit, body.rate_cents,
    )
    return svc.row_dict(row)


@r.get("/quarry-tickets")
async def quarry_list(u=Depends(auth.staff)):
    await require_module(u["org_id"], "civil")
    rows = await db.fetch(
        "SELECT qt.*, j.code AS job_code FROM quarry_tickets qt LEFT JOIN jobs j ON j.id=qt.job_id WHERE qt.org_id=$1 ORDER BY qt.created_at DESC",
        u["org_id"],
    )
    return svc.rows(rows)


async def _allocate_quarry_ticket(u: dict, cap: dict, fields: dict) -> dict:
    """Verified quarry ticket capture → tonnage record against the job."""
    row = await db.fetchrow(
        """INSERT INTO quarry_tickets (org_id, job_id, capture_id, quarry, ticket_no, material, tonnes, rate_cents_per_tonne)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id""",
        u["org_id"], cap.get("job_id"), cap["id"], fields.get("quarry"), fields.get("ticket_no"),
        fields.get("material"), float(fields.get("tonnes") or 0), int(fields.get("rate_cents_per_tonne") or 0),
    )
    return {"kind": "quarry_ticket", "id": str(row["id"])}


register_allocator("quarry_ticket", _allocate_quarry_ticket)
