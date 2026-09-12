"""Trades pack: variations raised on the phone, numbered certificates with
form-fill PDF output. Wholesaler dockets, voice timesheets, nudges and quote
follow-ups are kernel capture/quote features — nothing to duplicate here.

Mounted at /api/trades; every endpoint gates on the trades module being live.
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

import auth
import db
import money
import notify
import pdfs
import svc
from kernel import timeline
from kernel.common import require_module

r = APIRouter(tags=["trades"])

CERT_KINDS: dict[str, str] = {
    "electrical_compliance": "Certificate of Electrical Compliance",
    "test_report": "Test & Tag Report",
    "gas_compliance": "Gas Compliance Certificate",
    "plumbing_compliance": "Plumbing Compliance Certificate",
}


class VariationIn(BaseModel):
    job_id: str
    title: str
    detail: str | None = None
    amount_cents: int = 0


@r.get("/variations")
async def variations_list(job_id: str | None = None, status: str = "all", u=Depends(auth.anyone)):
    await require_module(u["org_id"], "trades")
    rows = await db.fetch(
        """SELECT v.*, j.code AS job_code, j.title AS job_title, us.name AS raised_by_name
           FROM variations v JOIN jobs j ON j.id=v.job_id LEFT JOIN users us ON us.id=v.raised_by
           WHERE v.org_id=$1 AND ($2::uuid IS NULL OR v.job_id=$2) AND ($3='all' OR v.status=$3)
           ORDER BY v.created_at DESC""",
        u["org_id"], job_id, status,
    )
    return svc.rows(rows)


@r.post("/variations")
async def variation_raise(body: VariationIn, u=Depends(auth.anyone)):
    """Crew raise variations from the field; office/owner approve them."""
    await require_module(u["org_id"], "trades")
    job = await db.fetchrow("SELECT id, code FROM jobs WHERE org_id=$1 AND id=$2", u["org_id"], body.job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    codes = [x["code"] for x in await db.fetch("SELECT code FROM variations WHERE org_id=$1", u["org_id"])]
    code = svc.next_in_series(codes, "V")
    row = await db.fetchrow(
        """INSERT INTO variations (org_id, job_id, code, title, detail, amount_cents, raised_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *""",
        u["org_id"], body.job_id, code, body.title, body.detail, body.amount_cents, u["user_id"],
    )
    await notify.emit(
        u["org_id"], "variation_raised", f"Variation {code} on {job['code']}",
        f"{body.title} — {money.fmt(body.amount_cents)} proposed", link=f"/jobs/{body.job_id}", audience="staff",
    )
    await timeline.log(u["org_id"], body.job_id, "variation.raised", f"{code}: {body.title}", actor=u["user_id"])
    return svc.row_dict(row)


class DecideIn(BaseModel):
    decision: str  # 'approved' | 'declined'
    decided_by_name: str


@r.post("/variations/{vid}/decide")
async def variation_decide(vid: str, body: DecideIn, u=Depends(auth.staff)):
    await require_module(u["org_id"], "trades")
    if body.decision not in ("approved", "declined"):
        raise HTTPException(400, "Bad decision")
    v = await db.fetchrow("SELECT * FROM variations WHERE org_id=$1 AND id=$2", u["org_id"], vid)
    if not v:
        raise HTTPException(404, "Variation not found")
    if v["status"] != "proposed":
        raise HTTPException(409, "Already decided")
    await db.execute(
        "UPDATE variations SET status=$3, decided_by_name=$4, decided_at=now() WHERE org_id=$1 AND id=$2",
        u["org_id"], vid, body.decision, body.decided_by_name,
    )
    if body.decision == "approved":
        # Approved variations grow the job's quoted value so costing/margin stay honest.
        await db.execute(
            "UPDATE jobs SET quoted_cents = quoted_cents + $3 WHERE org_id=$1 AND id=$2",
            u["org_id"], v["job_id"], v["amount_cents"],
        )
    await timeline.log(
        u["org_id"], str(v["job_id"]), "variation.decided",
        f"{v['code']} {body.decision} by {body.decided_by_name}", actor=u["user_id"],
    )
    return {"ok": True, "status": body.decision}


class CertIn(BaseModel):
    kind: str
    job_id: str | None = None
    fields: dict = {}


@r.get("/certs")
async def certs_list(u=Depends(auth.staff)):
    await require_module(u["org_id"], "trades")
    rows = await db.fetch(
        "SELECT ct.*, j.code AS job_code FROM certificates ct LEFT JOIN jobs j ON j.id=ct.job_id WHERE ct.org_id=$1 ORDER BY ct.created_at DESC",
        u["org_id"],
    )
    return svc.rows(rows)


@r.get("/cert-kinds")
async def cert_kinds(u=Depends(auth.staff)):
    await require_module(u["org_id"], "trades")
    return CERT_KINDS


@r.post("/certs")
async def cert_create(body: CertIn, u=Depends(auth.staff)):
    org = await require_module(u["org_id"], "trades")
    if body.kind not in CERT_KINDS:
        raise HTTPException(400, "Unknown certificate kind")
    prefix = svc.org_setting(org, "codes", "cert") or "CERT"
    codes = [x["code"] for x in await db.fetch("SELECT code FROM certificates WHERE org_id=$1", u["org_id"])]
    row = await db.fetchrow(
        "INSERT INTO certificates (org_id, job_id, kind, code, fields) VALUES ($1,$2,$3,$4,$5) RETURNING *",
        u["org_id"], body.job_id, body.kind, svc.next_in_series(codes, prefix), svc.dumps(body.fields),
    )
    if body.job_id:
        await timeline.log(u["org_id"], body.job_id, "cert.drafted", f"{row['code']} ({CERT_KINDS[body.kind]})", actor=u["user_id"])
    return svc.row_dict(row)


class CertPatch(BaseModel):
    fields: dict


@r.patch("/certs/{cid}")
async def cert_patch(cid: str, body: CertPatch, u=Depends(auth.staff)):
    await require_module(u["org_id"], "trades")
    row = await db.fetchrow(
        "UPDATE certificates SET fields=$3 WHERE org_id=$1 AND id=$2 AND status='draft' RETURNING *",
        u["org_id"], cid, svc.dumps(body.fields),
    )
    if not row:
        raise HTTPException(404, "Draft certificate not found")
    return svc.row_dict(row)


@r.post("/certs/{cid}/issue")
async def cert_issue(cid: str, u=Depends(auth.staff)):
    await require_module(u["org_id"], "trades")
    row = await db.fetchrow(
        "UPDATE certificates SET status='issued', issued_by=$3, issued_at=now() WHERE org_id=$1 AND id=$2 AND status='draft' RETURNING *",
        u["org_id"], cid, u["user_id"],
    )
    if not row:
        raise HTTPException(404, "Draft certificate not found")
    if row["job_id"]:
        await timeline.log(u["org_id"], str(row["job_id"]), "cert.issued", f"{row['code']} issued", actor=u["user_id"])
    return svc.row_dict(row)


@r.get("/certs/{cid}/pdf")
async def cert_pdf(cid: str, u=Depends(auth.staff)):
    org = await require_module(u["org_id"], "trades")
    ct = await db.fetchrow(
        "SELECT ct.*, j.code AS job_code, j.title AS job_title FROM certificates ct LEFT JOIN jobs j ON j.id=ct.job_id WHERE ct.org_id=$1 AND ct.id=$2",
        u["org_id"], cid,
    )
    if not ct:
        raise HTTPException(404, "Certificate not found")
    ct = svc.row_dict(ct)
    fields: list[tuple[str, str]] = [
        ("certificate no.", ct["code"]),
        ("type", CERT_KINDS.get(ct["kind"], ct["kind"])),
        ("job", f"{ct.get('job_code') or '—'} {ct.get('job_title') or ''}".strip()),
        ("status", ct["status"]),
    ]
    fields += [(k.replace("_", " "), str(v)) for k, v in (ct["fields"] or {}).items()]
    note = f"Issued {ct['issued_at']:%d %b %Y}" if ct.get("issued_at") else "DRAFT — not yet issued"
    pdf = pdfs.form_pdf(org, CERT_KINDS.get(ct["kind"], "Certificate"), fields, note)
    return Response(content=pdf, media_type="application/pdf")
