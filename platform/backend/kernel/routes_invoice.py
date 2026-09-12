"""Invoicing: drafts out (deposit / invoice / progress claim), statuses back,
and the money-on-the-table chase list."""
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import auth
import db
import ledger
import svc
from kernel import timeline
from kernel.common import get_org

r = APIRouter(tags=["invoicing"])


class InvoiceIn(BaseModel):
    job_id: str
    kind: str = "invoice"  # invoice | deposit | claim
    claim_pct: float | None = None
    retention_pct: float | None = None
    lines: list[dict] = []  # {description, qty, unit_cents}; empty = derive from job


@r.get("/invoices")
async def invoices_list(u=Depends(auth.staff)):
    rows = await db.fetch(
        "SELECT i.*, j.code AS job_code, j.title AS job_title FROM invoices i LEFT JOIN jobs j ON j.id=i.job_id WHERE i.org_id=$1 ORDER BY i.created_at DESC",
        u["org_id"],
    )
    return svc.rows(rows)


@r.post("/invoices")
async def invoice_create(body: InvoiceIn, u=Depends(auth.staff)):
    if body.kind not in ("invoice", "deposit", "claim"):
        raise HTTPException(400, "Bad kind")
    job = await db.fetchrow("SELECT * FROM jobs WHERE org_id=$1 AND id=$2", u["org_id"], body.job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    org = await get_org(u["org_id"])
    prefix = svc.org_setting(org, "codes", "invoice") or "INV"
    codes = [x["code"] for x in await db.fetch("SELECT code FROM invoices WHERE org_id=$1", u["org_id"])]
    lines = body.lines or [{"description": job["title"], "qty": 1, "unit_cents": job["quoted_cents"]}]
    total = sum(round(float(l.get("qty", 1)) * int(l.get("unit_cents", 0))) for l in lines)
    if body.kind == "claim" and body.claim_pct:
        total = round(total * body.claim_pct / 100)
    if body.retention_pct:
        total = round(total * (100 - body.retention_pct) / 100)
    inv = await db.fetchrow(
        """INSERT INTO invoices (org_id, job_id, code, kind, claim_pct, retention_pct, total_ex_cents, issued_on, due_on)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *""",
        u["org_id"], body.job_id, svc.next_in_series(codes, prefix), body.kind,
        body.claim_pct, body.retention_pct, total, svc.today_awst(), svc.today_awst() + timedelta(days=14),
    )
    for i, l in enumerate(lines):
        await db.execute(
            "INSERT INTO invoice_lines (org_id, invoice_id, description, qty, unit_cents, sort) VALUES ($1,$2,$3,$4,$5,$6)",
            u["org_id"], inv["id"], l.get("description", ""), float(l.get("qty", 1)), int(l.get("unit_cents", 0)), i,
        )
    await timeline.log(u["org_id"], body.job_id, "invoice.created", f"{body.kind} {inv['code']} drafted", actor=u["user_id"])
    return svc.row_dict(inv)


@r.post("/invoices/{iid}/push")
async def invoice_push(iid: str, u=Depends(auth.staff)):
    inv = await db.fetchrow("SELECT * FROM invoices WHERE org_id=$1 AND id=$2", u["org_id"], iid)
    if not inv:
        raise HTTPException(404, "Invoice not found")
    org = await get_org(u["org_id"])
    lines = svc.rows(await db.fetch("SELECT description, qty, unit_cents FROM invoice_lines WHERE invoice_id=$1 ORDER BY sort", iid))
    res = await ledger.push_draft(org, "ACCREC", {"invoice_code": inv["code"], "kind": inv["kind"], "lines": lines, "total_ex_cents": inv["total_ex_cents"]})
    await db.execute("UPDATE invoices SET status='sent', ledger_ref=$3 WHERE org_id=$1 AND id=$2", u["org_id"], iid, res["ledger_ref"])
    if inv["job_id"]:
        await db.execute("UPDATE jobs SET status='invoiced' WHERE org_id=$1 AND id=$2 AND status='done'", u["org_id"], inv["job_id"])
        await timeline.log(u["org_id"], str(inv["job_id"]), "invoice.pushed", f"{inv['code']} → ledger draft {res['ledger_ref']}", actor=u["user_id"])
    return {"ok": True, "ledger_ref": res["ledger_ref"]}


@r.get("/invoicing/chase")
async def chase_list(u=Depends(auth.staff)):
    """Money on the table: completed-but-uninvoiced jobs + overdue invoices."""
    org = await get_org(u["org_id"])
    await ledger.pull_invoice_statuses(org)
    uninvoiced = await db.fetch(
        """SELECT j.id, j.code, j.title, j.quoted_cents, j.completed_at FROM jobs j
           WHERE j.org_id=$1 AND j.status='done'
             AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.job_id=j.id AND i.kind IN ('invoice','claim'))
           ORDER BY j.completed_at""",
        u["org_id"],
    )
    overdue = await db.fetch(
        "SELECT i.*, j.code AS job_code FROM invoices i LEFT JOIN jobs j ON j.id=i.job_id WHERE i.org_id=$1 AND i.status='overdue' ORDER BY i.due_on",
        u["org_id"],
    )
    on_table = sum(x["quoted_cents"] for x in uninvoiced) + sum(x["total_ex_cents"] for x in overdue)
    return {"uninvoiced": svc.rows(uninvoiced), "overdue": svc.rows(overdue), "on_table_cents": on_table}


@r.get("/ledger/drafts")
async def drafts_list(u=Depends(auth.staff)):
    rows = await db.fetch("SELECT * FROM ledger_drafts WHERE org_id=$1 ORDER BY created_at DESC LIMIT 100", u["org_id"])
    return svc.rows(rows)


class MockStatus(BaseModel):
    status: str  # sent | paid | overdue


@r.post("/ledger/mock/invoices/{iid}/status")
async def mock_status(iid: str, body: MockStatus, u=Depends(auth.owner)):
    """Simulates the provider status callback (mock adapter only)."""
    if body.status not in ("sent", "paid", "overdue"):
        raise HTTPException(400, "Bad status")
    await ledger.mock_set_status(u["org_id"], iid, body.status)
    return {"ok": True}
