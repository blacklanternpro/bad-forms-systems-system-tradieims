from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import auth
import db
import svc
from kernel import timeline
from kernel.common import get_org

r = APIRouter(tags=["procurement"])


class PoLineIn(BaseModel):
    description: str
    qty: float = 1
    unit_cents: int = 0


class PoIn(BaseModel):
    supplier: str
    job_id: str | None = None
    lines: list[PoLineIn] = []


@r.get("/pos")
async def pos_list(u=Depends(auth.staff)):
    rows = await db.fetch(
        """SELECT p.*, j.code AS job_code,
                  (SELECT COALESCE(sum(round(l.qty*l.unit_cents)),0) FROM po_lines l WHERE l.po_id=p.id) AS total_ex_cents
           FROM purchase_orders p LEFT JOIN jobs j ON j.id=p.job_id WHERE p.org_id=$1 ORDER BY p.created_at DESC""",
        u["org_id"],
    )
    return svc.rows(rows)


@r.post("/pos")
async def po_create(body: PoIn, u=Depends(auth.staff)):
    org = await get_org(u["org_id"])
    prefix = svc.org_setting(org, "codes", "po") or "PO"
    codes = [x["code"] for x in await db.fetch("SELECT code FROM purchase_orders WHERE org_id=$1", u["org_id"])]
    po = await db.fetchrow(
        "INSERT INTO purchase_orders (org_id, job_id, supplier, code) VALUES ($1,$2,$3,$4) RETURNING *",
        u["org_id"], body.job_id, body.supplier, svc.next_in_series(codes, prefix),
    )
    for i, l in enumerate(body.lines):
        await db.execute(
            "INSERT INTO po_lines (org_id, po_id, description, qty, unit_cents, sort) VALUES ($1,$2,$3,$4,$5,$6)",
            u["org_id"], po["id"], l.description, l.qty, l.unit_cents, i,
        )
    if body.job_id:
        await timeline.log(u["org_id"], body.job_id, "po.created", f"PO {po['code']} to {body.supplier}", actor=u["user_id"])
    return svc.row_dict(po)


@r.get("/pos/backorders")
async def backorders(u=Depends(auth.staff)):
    rows = await db.fetch(
        """SELECT p.code, p.supplier, l.description, l.qty, l.received_qty FROM po_lines l
           JOIN purchase_orders p ON p.id=l.po_id
           WHERE l.org_id=$1 AND p.status='open' AND l.received_qty < l.qty AND l.received_qty > 0
           ORDER BY p.code""",
        u["org_id"],
    )
    return svc.rows(rows)


@r.get("/pos/{pid}")
async def po_detail(pid: str, u=Depends(auth.staff)):
    po = await db.fetchrow("SELECT * FROM purchase_orders WHERE org_id=$1 AND id=$2", u["org_id"], pid)
    if not po:
        raise HTTPException(404, "PO not found")
    lines = await db.fetch("SELECT * FROM po_lines WHERE po_id=$1 ORDER BY sort", pid)
    return {"po": svc.row_dict(po), "lines": svc.rows(lines)}


class ReceiveIn(BaseModel):
    line_receipts: dict[str, float]  # line_id -> received qty


@r.post("/pos/{pid}/receive")
async def po_receive(pid: str, body: ReceiveIn, u=Depends(auth.staff)):
    d = await po_detail(pid, u)
    for line_id, qty in body.line_receipts.items():
        await db.execute(
            "UPDATE po_lines SET received_qty = received_qty + $3 WHERE org_id=$1 AND id=$2",
            u["org_id"], line_id, qty,
        )
    lines = await db.fetch("SELECT qty, received_qty FROM po_lines WHERE po_id=$1", pid)
    complete = all(l["received_qty"] >= l["qty"] for l in lines)
    await db.execute(
        "UPDATE purchase_orders SET status=$3 WHERE org_id=$1 AND id=$2",
        u["org_id"], pid, "received" if complete else "open",
    )
    return {"ok": True, "complete": complete, "po_code": d["po"]["code"]}


class MatchIn(BaseModel):
    capture_id: str


@r.post("/pos/{pid}/match")
async def po_match(pid: str, body: MatchIn, u=Depends(auth.staff)):
    """Three-way closure: PO -> received -> verified supplier invoice capture."""
    cap = await db.fetchrow(
        "SELECT id, status, capture_type FROM captures WHERE org_id=$1 AND id=$2", u["org_id"], body.capture_id
    )
    if not cap or cap["capture_type"] != "receipt":
        raise HTTPException(400, "Capture must be a receipt")
    if cap["status"] != "verified":
        raise HTTPException(400, "Verify the receipt first")
    await db.execute("UPDATE purchase_orders SET status='matched' WHERE org_id=$1 AND id=$2", u["org_id"], pid)
    return {"ok": True}
