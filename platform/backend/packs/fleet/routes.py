"""Fleet pack: the asset/attachment register across yards, float and mobilisation
charging, hour-meter service plans feeding the workshop queue (pre-start meter
readings advance the clock), corrective actions, and the CoR/SMS evidence vault
aligned to the HVNL 2026 five-outcome SMS standard.

The vault is composed, not double-entered: explicit evidence rows plus what the
platform already records (pre-starts, workshop services, corrective actions).
Those source tables exist platform-wide — migrations always run for every pack —
so the queries are safe even where a module is dark.

Mounted at /api/fleet; every endpoint gates on the fleet module.
"""
import json
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

import auth
import db
import pdfs
import svc
from kernel import timeline
from kernel.common import require_module
from kernel.routes_capture import register_allocator

r = APIRouter(tags=["fleet"])

OUTCOMES: dict[str, str] = {
    "fit_drivers": "Fit drivers",
    "safe_vehicles": "Safe vehicles",
    "mass_and_restraint": "Mass & load restraint",
    "speed_and_fatigue": "Speed & fatigue",
    "review_and_improve": "Review & improve",
}


class AssetIn(BaseModel):
    code: str
    name: str
    kind: str = "truck"
    rego: str | None = None
    yard: str | None = None


@r.get("/assets")
async def assets_list(yard: str | None = None, u=Depends(auth.anyone)):
    """The register: every machine and attachment, meter, next service, today's pre-start."""
    await require_module(u["org_id"], "fleet")
    rows = await db.fetch(
        """SELECT a.*,
                  fa.carrier_id,
                  ca.name AS carrier_name,
                  (SELECT result FROM prestarts p WHERE p.asset_id=a.id AND p.on_date=$2 ORDER BY p.created_at DESC LIMIT 1) AS prestart_today,
                  (SELECT min(sp.last_service_hours + sp.interval_hours - a.meter_hours)
                     FROM service_plans sp WHERE sp.asset_id=a.id) AS hours_to_service
           FROM assets a
           LEFT JOIN fleet_attachments fa ON fa.attachment_id=a.id AND fa.org_id=a.org_id
           LEFT JOIN assets ca ON ca.id=fa.carrier_id
           WHERE a.org_id=$1 AND a.active AND ($3::text IS NULL OR a.yard=$3)
           ORDER BY a.yard NULLS LAST, a.meta->>'code'""",
        u["org_id"], svc.today_awst(), yard,
    )
    return svc.rows(rows)


@r.post("/assets")
async def asset_create(body: AssetIn, u=Depends(auth.staff)):
    await require_module(u["org_id"], "fleet")
    row = await db.fetchrow(
        "INSERT INTO assets (org_id, kind, name, rego, yard, meta) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
        u["org_id"], body.kind, body.name, body.rego, body.yard, json.dumps({"code": body.code}),
    )
    return svc.row_dict(row)


@r.get("/yards")
async def yards(u=Depends(auth.staff)):
    await require_module(u["org_id"], "fleet")
    rows = await db.fetch("SELECT DISTINCT yard FROM assets WHERE org_id=$1 AND active AND yard IS NOT NULL ORDER BY yard", u["org_id"])
    return [x["yard"] for x in rows]


class AttachIn(BaseModel):
    carrier_id: str | None = None  # null detaches


@r.post("/assets/{aid}/attach")
async def attach(aid: str, body: AttachIn, u=Depends(auth.staff)):
    """Link an attachment to its carrier (or detach with carrier_id null)."""
    await require_module(u["org_id"], "fleet")
    att = await db.fetchrow("SELECT id, name FROM assets WHERE org_id=$1 AND id=$2", u["org_id"], aid)
    if not att:
        raise HTTPException(404, "Asset not found")
    if body.carrier_id:
        carrier = await db.fetchrow("SELECT id FROM assets WHERE org_id=$1 AND id=$2", u["org_id"], body.carrier_id)
        if not carrier:
            raise HTTPException(404, "Carrier not found")
    row = await db.fetchrow(
        """INSERT INTO fleet_attachments (org_id, attachment_id, carrier_id) VALUES ($1,$2,$3)
           ON CONFLICT (org_id, attachment_id) DO UPDATE SET carrier_id=EXCLUDED.carrier_id RETURNING *""",
        u["org_id"], aid, body.carrier_id,
    )
    return svc.row_dict(row)


class MeterIn(BaseModel):
    hours: float


@r.post("/assets/{aid}/meter")
async def meter_reading(aid: str, body: MeterIn, u=Depends(auth.anyone)):
    """Manual meter reading — pre-starts feed the same clock automatically."""
    await require_module(u["org_id"], "fleet")
    n = await db.execute("UPDATE assets SET meter_hours=GREATEST(meter_hours, $3) WHERE org_id=$1 AND id=$2", u["org_id"], aid, body.hours)
    if n.endswith("0"):
        raise HTTPException(404, "Asset not found")
    row = await db.fetchrow("SELECT meter_hours FROM assets WHERE org_id=$1 AND id=$2", u["org_id"], aid)
    return {"ok": True, "meter_hours": float(row["meter_hours"])}


class PlanIn(BaseModel):
    name: str
    interval_hours: float
    last_service_hours: float = 0


@r.get("/assets/{aid}/service-plans")
async def plans_list(aid: str, u=Depends(auth.staff)):
    await require_module(u["org_id"], "fleet")
    return svc.rows(await db.fetch("SELECT * FROM service_plans WHERE org_id=$1 AND asset_id=$2 ORDER BY name", u["org_id"], aid))


@r.post("/assets/{aid}/service-plans")
async def plan_set(aid: str, body: PlanIn, u=Depends(auth.staff)):
    await require_module(u["org_id"], "fleet")
    row = await db.fetchrow(
        """INSERT INTO service_plans (org_id, asset_id, name, interval_hours, last_service_hours)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (org_id, asset_id, name) DO UPDATE SET interval_hours=EXCLUDED.interval_hours,
             last_service_hours=EXCLUDED.last_service_hours RETURNING *""",
        u["org_id"], aid, body.name, body.interval_hours, body.last_service_hours,
    )
    return svc.row_dict(row)


@r.get("/workshop")
async def workshop_queue(u=Depends(auth.staff)):
    """Everything the workshop owes: due services (meter past interval) + open corrective actions."""
    await require_module(u["org_id"], "fleet")
    due = await db.fetch(
        """SELECT sp.id AS plan_id, sp.name AS plan_name, sp.interval_hours, sp.last_service_hours,
                  a.id AS asset_id, a.name AS asset_name, a.yard, a.meter_hours, a.meta,
                  a.meter_hours - (sp.last_service_hours + sp.interval_hours) AS hours_over
           FROM service_plans sp JOIN assets a ON a.id=sp.asset_id
           WHERE sp.org_id=$1 AND a.active AND a.meter_hours >= sp.last_service_hours + sp.interval_hours
           ORDER BY hours_over DESC""",
        u["org_id"],
    )
    cas = await db.fetch(
        """SELECT c.*, a.name AS asset_name FROM corrective_actions c LEFT JOIN assets a ON a.id=c.asset_id
           WHERE c.org_id=$1 AND c.status='open' ORDER BY c.created_at""",
        u["org_id"],
    )
    return {"due_services": svc.rows(due), "open_corrective_actions": svc.rows(cas)}


class ServiceDoneIn(BaseModel):
    notes: str | None = None


@r.post("/service-plans/{pid}/complete")
async def service_complete(pid: str, body: ServiceDoneIn, u=Depends(auth.staff)):
    """Logs the service at the current meter and resets the interval clock."""
    await require_module(u["org_id"], "fleet")
    plan = await db.fetchrow(
        "SELECT sp.*, a.meter_hours, a.name AS asset_name FROM service_plans sp JOIN assets a ON a.id=sp.asset_id WHERE sp.org_id=$1 AND sp.id=$2",
        u["org_id"], pid,
    )
    if not plan:
        raise HTTPException(404, "Service plan not found")
    await db.execute(
        "INSERT INTO workshop_log (org_id, asset_id, plan_id, kind, notes, meter_hours, done_by) VALUES ($1,$2,$3,'service',$4,$5,$6)",
        u["org_id"], plan["asset_id"], pid, body.notes, plan["meter_hours"], u["user_id"],
    )
    await db.execute("UPDATE service_plans SET last_service_hours=$3 WHERE org_id=$1 AND id=$2", u["org_id"], pid, plan["meter_hours"])
    return {"ok": True, "serviced_at_hours": float(plan["meter_hours"])}


def float_charge(mobilisation_cents: int, cents_per_km: int, km: float) -> int:
    """Mobilisation charging: flat float fee plus the kilometres, no surprises."""
    return mobilisation_cents + round(float(km) * cents_per_km)


class FloatIn(BaseModel):
    asset_id: str
    job_id: str | None = None
    from_yard: str
    to_site: str
    float_date: str
    km: float = 0
    mobilisation_cents: int = 0
    cents_per_km: int = 0


@r.get("/floats")
async def floats_list(u=Depends(auth.staff)):
    await require_module(u["org_id"], "fleet")
    rows = await db.fetch(
        """SELECT f.*, a.name AS asset_name, a.meta, j.code AS job_code
           FROM floats f JOIN assets a ON a.id=f.asset_id LEFT JOIN jobs j ON j.id=f.job_id
           WHERE f.org_id=$1 ORDER BY f.float_date DESC, f.created_at DESC""",
        u["org_id"],
    )
    return svc.rows(rows)


@r.post("/floats")
async def float_book(body: FloatIn, u=Depends(auth.staff)):
    await require_module(u["org_id"], "fleet")
    asset = await db.fetchrow("SELECT id, name FROM assets WHERE org_id=$1 AND id=$2", u["org_id"], body.asset_id)
    if not asset:
        raise HTTPException(404, "Asset not found")
    codes = [x["code"] for x in await db.fetch("SELECT code FROM floats WHERE org_id=$1", u["org_id"])]
    code = svc.next_in_series(codes, "FL")
    charge = float_charge(body.mobilisation_cents, body.cents_per_km, body.km)
    row = await db.fetchrow(
        """INSERT INTO floats (org_id, code, asset_id, job_id, from_yard, to_site, float_date, km,
                               mobilisation_cents, cents_per_km, charge_cents, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *""",
        u["org_id"], code, body.asset_id, body.job_id, body.from_yard, body.to_site,
        svc.parse_date(body.float_date), body.km, body.mobilisation_cents, body.cents_per_km, charge, u["user_id"],
    )
    if body.job_id:
        await timeline.log(u["org_id"], body.job_id, "float.booked",
                           f"{code}: {asset['name']} {body.from_yard} → {body.to_site}", actor=u["user_id"])
    return svc.row_dict(row)


@r.post("/floats/{fid}/complete")
async def float_complete(fid: str, u=Depends(auth.anyone)):
    await require_module(u["org_id"], "fleet")
    n = await db.execute("UPDATE floats SET status='completed' WHERE org_id=$1 AND id=$2 AND status='planned'", u["org_id"], fid)
    if n.endswith("0"):
        raise HTTPException(404, "Planned float not found")
    return {"ok": True}


class CaIn(BaseModel):
    title: str
    detail: str | None = None
    asset_id: str | None = None
    source: str = "manual"


@r.get("/corrective-actions")
async def cas_list(status: str = "open", u=Depends(auth.staff)):
    await require_module(u["org_id"], "fleet")
    rows = await db.fetch(
        """SELECT c.*, a.name AS asset_name FROM corrective_actions c LEFT JOIN assets a ON a.id=c.asset_id
           WHERE c.org_id=$1 AND ($2='all' OR c.status=$2) ORDER BY c.created_at DESC""",
        u["org_id"], status,
    )
    return svc.rows(rows)


@r.post("/corrective-actions")
async def ca_raise(body: CaIn, u=Depends(auth.staff)):
    await require_module(u["org_id"], "fleet")
    if body.source not in ("prestart", "audit", "incident", "manual"):
        raise HTTPException(400, "Bad source")
    codes = [x["code"] for x in await db.fetch("SELECT code FROM corrective_actions WHERE org_id=$1", u["org_id"])]
    code = svc.next_in_series(codes, "CA")
    row = await db.fetchrow(
        "INSERT INTO corrective_actions (org_id, code, asset_id, title, detail, source) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
        u["org_id"], code, body.asset_id, body.title, body.detail, body.source,
    )
    return svc.row_dict(row)


class CaCloseIn(BaseModel):
    note: str


@r.post("/corrective-actions/{cid}/close")
async def ca_close(cid: str, body: CaCloseIn, u=Depends(auth.staff)):
    """Closing needs the fix written down — that note is the SMS evidence."""
    await require_module(u["org_id"], "fleet")
    if not body.note.strip():
        raise HTTPException(400, "Closure note required")
    n = await db.execute(
        "UPDATE corrective_actions SET status='closed', closed_note=$3, closed_by=$4, closed_at=now() WHERE org_id=$1 AND id=$2 AND status='open'",
        u["org_id"], cid, body.note, u["user_id"],
    )
    if n.endswith("0"):
        raise HTTPException(404, "Open corrective action not found")
    return {"ok": True}


class EvidenceIn(BaseModel):
    outcome: str
    kind: str
    summary: str
    asset_id: str | None = None
    evidence_date: str | None = None


@r.post("/evidence")
async def evidence_add(body: EvidenceIn, u=Depends(auth.staff)):
    await require_module(u["org_id"], "fleet")
    if body.outcome not in OUTCOMES:
        raise HTTPException(400, "Bad outcome")
    row = await db.fetchrow(
        """INSERT INTO sms_evidence (org_id, outcome, kind, summary, asset_id, evidence_date, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *""",
        u["org_id"], body.outcome, body.kind, body.summary, body.asset_id,
        svc.parse_date(body.evidence_date) or svc.today_awst(), u["user_id"],
    )
    return svc.row_dict(row)


async def _vault_items(org_id: str, outcome: str | None) -> list[dict]:
    """The composed vault: explicit rows + evidence the platform already holds."""
    items: list[dict] = []
    for e in await db.fetch(
        """SELECT s.*, a.name AS asset_name FROM sms_evidence s LEFT JOIN assets a ON a.id=s.asset_id
           WHERE s.org_id=$1 ORDER BY s.evidence_date DESC""", org_id,
    ):
        items.append({"outcome": e["outcome"], "kind": e["kind"], "summary": e["summary"],
                      "asset_name": e["asset_name"], "date": str(e["evidence_date"]), "source": "vault"})
    for p in await db.fetch(
        """SELECT p.on_date, p.result, a.name AS asset_name FROM prestarts p JOIN assets a ON a.id=p.asset_id
           WHERE p.org_id=$1 ORDER BY p.on_date DESC LIMIT 500""", org_id,
    ):
        items.append({"outcome": "safe_vehicles", "kind": "prestart",
                      "summary": f"Pre-start {p['result'].upper()} — {p['asset_name']}",
                      "asset_name": p["asset_name"], "date": str(p["on_date"]), "source": "prestarts"})
    for w in await db.fetch(
        """SELECT w.created_at, w.kind, w.notes, w.meter_hours, a.name AS asset_name
           FROM workshop_log w JOIN assets a ON a.id=w.asset_id WHERE w.org_id=$1 ORDER BY w.created_at DESC LIMIT 500""", org_id,
    ):
        hrs = f" at {float(w['meter_hours']):.0f}h" if w["meter_hours"] is not None else ""
        items.append({"outcome": "safe_vehicles", "kind": f"maintenance_{w['kind']}",
                      "summary": f"{w['kind'].title()}{hrs} — {w['asset_name']}" + (f": {w['notes']}" if w["notes"] else ""),
                      "asset_name": w["asset_name"], "date": str(w["created_at"].date()), "source": "workshop"})
    for c in await db.fetch(
        """SELECT c.code, c.title, c.status, c.closed_note, c.created_at, a.name AS asset_name
           FROM corrective_actions c LEFT JOIN assets a ON a.id=c.asset_id WHERE c.org_id=$1 ORDER BY c.created_at DESC""", org_id,
    ):
        summary = f"{c['code']} {c['status'].upper()}: {c['title']}" + (f" — {c['closed_note']}" if c["closed_note"] else "")
        items.append({"outcome": "review_and_improve", "kind": "corrective_action", "summary": summary,
                      "asset_name": c["asset_name"], "date": str(c["created_at"].date()), "source": "corrective_actions"})
    if outcome:
        items = [i for i in items if i["outcome"] == outcome]
    items.sort(key=lambda i: i["date"], reverse=True)
    return items


@r.get("/evidence")
async def evidence_list(outcome: str | None = None, u=Depends(auth.staff)):
    await require_module(u["org_id"], "fleet")
    if outcome and outcome not in OUTCOMES:
        raise HTTPException(400, "Bad outcome")
    items = await _vault_items(u["org_id"], outcome)
    counts = {k: 0 for k in OUTCOMES}
    for i in await _vault_items(u["org_id"], None):
        counts[i["outcome"]] += 1
    return {"outcomes": OUTCOMES, "counts": counts, "items": items}


@r.get("/evidence/pack.pdf")
async def evidence_pack(u=Depends(auth.staff)):
    """The SMS evidence pack: what you hand the auditor, one document."""
    org = await require_module(u["org_id"], "fleet")
    items = await _vault_items(u["org_id"], None)
    counts = {k: 0 for k in OUTCOMES}
    for i in items:
        counts[i["outcome"]] += 1
    fields: list[tuple[str, str]] = [("prepared", str(date.today()))]
    for key, label in OUTCOMES.items():
        fields.append((label, f"{counts[key]} evidence item(s)"))
    for i in items[:60]:
        fields.append((f"{i['date']} · {OUTCOMES[i['outcome']]}", i["summary"]))
    gaps = [label for key, label in OUTCOMES.items() if counts[key] == 0]
    note = "EVIDENCE HELD ON ALL FIVE SMS OUTCOMES" if not gaps else f"GAPS — no evidence on: {', '.join(gaps)}"
    pdf = pdfs.form_pdf(org, "CoR / SMS evidence pack", fields, note)
    return Response(content=pdf, media_type="application/pdf")


async def _allocate_load_restraint(u: dict, cap: dict, fields: dict) -> dict:
    """Verified load-restraint photo → mass & restraint evidence in the vault."""
    row = await db.fetchrow(
        """INSERT INTO sms_evidence (org_id, outcome, kind, summary, capture_id, document_id, evidence_date, created_by)
           VALUES ($1,'mass_and_restraint','load_restraint_photo',$2,$3,$4,$5,$6) RETURNING id""",
        u["org_id"],
        f"Load restraint — {fields.get('vehicle') or 'vehicle'}: {fields.get('restraint') or 'photo evidence'}",
        cap["id"], cap.get("document_id"), svc.today_awst(), cap.get("created_by"),
    )
    return {"kind": "sms_evidence", "id": str(row["id"])}


register_allocator("load_restraint", _allocate_load_restraint)
