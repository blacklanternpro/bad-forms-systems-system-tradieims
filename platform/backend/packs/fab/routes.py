"""Fabrication pack: ITP stage templates applied onto kernel job stages,
heat/mill cert traceability from verified captures, NDI records, offcut
allocation, and the MDR pack PDF that assembles the lot.

Mounted at /api/fab; every endpoint gates on the fab module.
"""
import json

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

r = APIRouter(tags=["fab"])


class TemplateIn(BaseModel):
    name: str
    stages: list[dict]  # [{name, requires_photo}]


@r.get("/itp-templates")
async def templates_list(u=Depends(auth.staff)):
    await require_module(u["org_id"], "fab")
    return svc.rows(await db.fetch("SELECT * FROM itp_templates WHERE org_id=$1 ORDER BY name", u["org_id"]))


@r.post("/itp-templates")
async def template_create(body: TemplateIn, u=Depends(auth.staff)):
    await require_module(u["org_id"], "fab")
    row = await db.fetchrow(
        "INSERT INTO itp_templates (org_id, name, stages) VALUES ($1,$2,$3) RETURNING *",
        u["org_id"], body.name, json.dumps(body.stages),
    )
    return svc.row_dict(row)


class ApplyIn(BaseModel):
    job_id: str
    template_id: str


@r.post("/apply-itp")
async def apply_itp(body: ApplyIn, u=Depends(auth.staff)):
    """Stamps the ITP's stages onto the job — hold points become photo-gated stages."""
    await require_module(u["org_id"], "fab")
    tpl = await db.fetchrow("SELECT * FROM itp_templates WHERE org_id=$1 AND id=$2", u["org_id"], body.template_id)
    if not tpl:
        raise HTTPException(404, "Template not found")
    job = await db.fetchrow("SELECT id FROM jobs WHERE org_id=$1 AND id=$2", u["org_id"], body.job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    existing = await db.fetchval("SELECT count(*) FROM job_stages WHERE job_id=$1", body.job_id)
    if int(existing or 0) > 0:
        raise HTTPException(409, "Job already has stages")
    stages = json.loads(tpl["stages"]) if isinstance(tpl["stages"], str) else tpl["stages"]
    for i, s in enumerate(stages):
        await db.execute(
            "INSERT INTO job_stages (org_id, job_id, name, sort, requires_photo) VALUES ($1,$2,$3,$4,$5)",
            u["org_id"], body.job_id, s["name"], i, bool(s.get("requires_photo")),
        )
    await timeline.log(u["org_id"], body.job_id, "itp.applied", f"ITP '{tpl['name']}' — {len(stages)} stages", actor=u["user_id"])
    return {"ok": True, "stages": len(stages)}


class LotIn(BaseModel):
    job_id: str | None = None
    heat_no: str
    material: str | None = None
    mill: str | None = None
    cert_ref: str | None = None


@r.get("/materials")
async def materials(job_id: str | None = None, u=Depends(auth.anyone)):
    await require_module(u["org_id"], "fab")
    rows = await db.fetch(
        """SELECT m.*, j.code AS job_code FROM material_lots m LEFT JOIN jobs j ON j.id=m.job_id
           WHERE m.org_id=$1 AND ($2::uuid IS NULL OR m.job_id=$2) ORDER BY m.created_at DESC""",
        u["org_id"], job_id,
    )
    return svc.rows(rows)


@r.post("/materials")
async def material_create(body: LotIn, u=Depends(auth.staff)):
    await require_module(u["org_id"], "fab")
    row = await db.fetchrow(
        "INSERT INTO material_lots (org_id, job_id, heat_no, material, mill, cert_ref) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
        u["org_id"], body.job_id, body.heat_no, body.material, body.mill, body.cert_ref,
    )
    if body.job_id:
        await timeline.log(u["org_id"], body.job_id, "material.booked", f"Heat {body.heat_no} ({body.material or '—'})", actor=u["user_id"])
    return svc.row_dict(row)


class NdiIn(BaseModel):
    job_id: str
    method: str
    result: str
    report_ref: str | None = None
    inspector: str | None = None


@r.get("/ndi")
async def ndi_list(job_id: str | None = None, u=Depends(auth.staff)):
    await require_module(u["org_id"], "fab")
    rows = await db.fetch(
        """SELECT n.*, j.code AS job_code FROM ndi_records n JOIN jobs j ON j.id=n.job_id
           WHERE n.org_id=$1 AND ($2::uuid IS NULL OR n.job_id=$2) ORDER BY n.created_at DESC""",
        u["org_id"], job_id,
    )
    return svc.rows(rows)


@r.post("/ndi")
async def ndi_create(body: NdiIn, u=Depends(auth.staff)):
    await require_module(u["org_id"], "fab")
    if body.method not in ("visual", "UT", "MT", "PT", "RT") or body.result not in ("pass", "fail"):
        raise HTTPException(400, "Bad method or result")
    row = await db.fetchrow(
        "INSERT INTO ndi_records (org_id, job_id, method, result, report_ref, inspector) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
        u["org_id"], body.job_id, body.method, body.result, body.report_ref, body.inspector,
    )
    await timeline.log(u["org_id"], body.job_id, "ndi.recorded", f"{body.method} {body.result}", actor=u["user_id"])
    return svc.row_dict(row)


class OffcutIn(BaseModel):
    description: str
    material: str | None = None
    heat_no: str | None = None
    from_job_id: str | None = None


@r.get("/offcuts")
async def offcuts(status: str = "available", u=Depends(auth.staff)):
    await require_module(u["org_id"], "fab")
    rows = await db.fetch(
        "SELECT * FROM offcuts WHERE org_id=$1 AND ($2='all' OR status=$2) ORDER BY created_at DESC",
        u["org_id"], status,
    )
    return svc.rows(rows)


@r.post("/offcuts")
async def offcut_create(body: OffcutIn, u=Depends(auth.staff)):
    await require_module(u["org_id"], "fab")
    row = await db.fetchrow(
        "INSERT INTO offcuts (org_id, description, material, heat_no, from_job_id) VALUES ($1,$2,$3,$4,$5) RETURNING *",
        u["org_id"], body.description, body.material, body.heat_no, body.from_job_id,
    )
    return svc.row_dict(row)


class AllocateIn(BaseModel):
    job_id: str


@r.post("/offcuts/{oid}/allocate")
async def offcut_allocate(oid: str, body: AllocateIn, u=Depends(auth.staff)):
    """Allocating an offcut carries its heat number onto the receiving job —
    traceability survives the rack."""
    await require_module(u["org_id"], "fab")
    row = await db.fetchrow(
        "UPDATE offcuts SET status='allocated', allocated_job_id=$3 WHERE org_id=$1 AND id=$2 AND status='available' RETURNING *",
        u["org_id"], oid, body.job_id,
    )
    if not row:
        raise HTTPException(404, "Available offcut not found")
    if row["heat_no"]:
        await db.execute(
            "INSERT INTO material_lots (org_id, job_id, heat_no, material) VALUES ($1,$2,$3,$4)",
            u["org_id"], body.job_id, row["heat_no"], row["material"],
        )
    await timeline.log(u["org_id"], body.job_id, "offcut.allocated", row["description"], actor=u["user_id"])
    return svc.row_dict(row)


@r.get("/jobs/{jid}/mdr.pdf")
async def mdr_pdf(jid: str, u=Depends(auth.staff)):
    """The MDR pack: stages sign-off, material traceability, NDI — one document."""
    org = await require_module(u["org_id"], "fab")
    job = await db.fetchrow("SELECT code, title FROM jobs WHERE org_id=$1 AND id=$2", u["org_id"], jid)
    if not job:
        raise HTTPException(404, "Job not found")
    stages = await db.fetch("SELECT name, completed_at FROM job_stages WHERE job_id=$1 ORDER BY sort", jid)
    lots = await db.fetch("SELECT heat_no, material, mill, cert_ref FROM material_lots WHERE org_id=$1 AND job_id=$2 ORDER BY created_at", u["org_id"], jid)
    ndi = await db.fetch("SELECT method, result, report_ref, inspector FROM ndi_records WHERE org_id=$1 AND job_id=$2 ORDER BY created_at", u["org_id"], jid)

    fields: list[tuple[str, str]] = [("job", f"{job['code']} — {job['title']}")]
    for s in stages:
        fields.append((f"stage · {s['name']}", "COMPLETE" if s["completed_at"] else "OPEN"))
    if lots:
        for m in lots:
            fields.append((f"heat {m['heat_no']}", f"{m['material'] or '—'} · mill {m['mill'] or '—'} · cert {m['cert_ref'] or '—'}"))
    else:
        fields.append(("materials", "NO TRACEABLE LOTS BOOKED"))
    for n in ndi:
        fields.append((f"NDI · {n['method']}", f"{n['result'].upper()} · report {n['report_ref'] or '—'} · {n['inspector'] or '—'}"))
    open_stages = sum(1 for s in stages if not s["completed_at"])
    note = "MDR COMPLETE — all stages signed off" if stages and open_stages == 0 else f"INCOMPLETE — {open_stages} stage(s) open"
    pdf = pdfs.form_pdf(org, f"MDR pack {job['code']}", fields, note)
    return Response(content=pdf, media_type="application/pdf")


async def _allocate_heat_cert(u: dict, cap: dict, fields: dict) -> dict:
    """Verified heat cert capture → traceable material lot on the job."""
    row = await db.fetchrow(
        "INSERT INTO material_lots (org_id, job_id, capture_id, heat_no, material, mill, cert_ref) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id",
        u["org_id"], cap.get("job_id"), cap["id"], fields.get("heat_no") or "UNKNOWN",
        fields.get("material"), fields.get("mill"), fields.get("cert_ref"),
    )
    return {"kind": "material_lot", "id": str(row["id"])}


register_allocator("heat_cert", _allocate_heat_cert)
