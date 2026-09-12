import csv
import io
import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

import auth
import db
import notify
import pdfs
import svc
from kernel import timeline
from kernel.common import get_org

r = APIRouter(tags=["quotes"])


class QuoteLineIn(BaseModel):
    description: str
    qty: float = 1
    unit_cents: int = 0


class QuoteIn(BaseModel):
    title: str
    client_id: str | None = None
    enquiry_id: str | None = None
    valid_days: int = 14
    deposit_cents: int = 0
    lines: list[QuoteLineIn] = []


def _follow_flags(status: str, valid_until, today) -> tuple[bool, bool]:
    if status != "sent" or valid_until is None:
        return False, False
    overdue = valid_until < today
    follow = valid_until <= today + timedelta(days=7)
    return follow, overdue


@r.get("/quotes")
async def quotes_list(filter: str = "all", u=Depends(auth.staff)):
    rows = await db.fetch(
        """SELECT q.*, c.name AS client_name,
                  (SELECT COALESCE(sum(round(ql.qty * ql.unit_cents)),0) FROM quote_lines ql WHERE ql.quote_id=q.id) AS total_ex_cents
           FROM quotes q LEFT JOIN clients c ON c.id=q.client_id WHERE q.org_id=$1 ORDER BY q.created_at DESC""",
        u["org_id"],
    )
    today = svc.today_awst()
    out = []
    for row in svc.rows(rows):
        follow, overdue = _follow_flags(row["status"], row.get("valid_until"), today)
        row["follow_up"], row["overdue"] = follow, overdue
        if filter == "follow_up" and not follow:
            continue
        out.append(row)
    return out


@r.post("/quotes")
async def quote_create(body: QuoteIn, u=Depends(auth.staff)):
    org = await get_org(u["org_id"])
    prefix = svc.org_setting(org, "codes", "quote") or "Q"
    codes = [x["code"] for x in await db.fetch("SELECT code FROM quotes WHERE org_id=$1", u["org_id"])]
    code = svc.next_in_series(codes, prefix)
    q = await db.fetchrow(
        """INSERT INTO quotes (org_id, client_id, enquiry_id, code, title, valid_until, deposit_cents)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *""",
        u["org_id"], body.client_id, body.enquiry_id, code, body.title,
        svc.today_awst() + timedelta(days=body.valid_days), body.deposit_cents,
    )
    for i, l in enumerate(body.lines):
        await db.execute(
            "INSERT INTO quote_lines (org_id, quote_id, description, qty, unit_cents, sort) VALUES ($1,$2,$3,$4,$5,$6)",
            u["org_id"], q["id"], l.description, l.qty, l.unit_cents, i,
        )
    if body.enquiry_id:
        await db.execute("UPDATE enquiries SET status='quoted' WHERE org_id=$1 AND id=$2", u["org_id"], body.enquiry_id)
    return svc.row_dict(q)


@r.get("/quotes/{qid}")
async def quote_detail(qid: str, u=Depends(auth.staff)):
    q = await db.fetchrow(
        "SELECT q.*, c.name AS client_name, c.email AS client_email FROM quotes q LEFT JOIN clients c ON c.id=q.client_id WHERE q.org_id=$1 AND q.id=$2",
        u["org_id"], qid,
    )
    if not q:
        raise HTTPException(404, "Quote not found")
    lines = await db.fetch("SELECT * FROM quote_lines WHERE quote_id=$1 ORDER BY sort", qid)
    return {"quote": svc.row_dict(q), "lines": svc.rows(lines)}


@r.post("/quotes/{qid}/send")
async def quote_send(qid: str, u=Depends(auth.staff)):
    d = await quote_detail(qid, u)
    q = d["quote"]
    token = secrets.token_urlsafe(12)
    await db.execute(
        "UPDATE quotes SET status='sent', sent_at=now(), accept_token=$3 WHERE org_id=$1 AND id=$2",
        u["org_id"], qid, token,
    )
    recipient = q.get("client_email") or "unaddressed@localhost"
    await notify.queue_email(
        u["org_id"], recipient, f"Quote {q['code']} — {q['title']}",
        f"View and accept: /q/{token}",
        {"job_id": None, "client_id": str(q["client_id"]) if q.get("client_id") else None, "quote_id": qid},
    )
    return {"ok": True, "accept_token": token}


@r.post("/quotes/{qid}/accept")
async def quote_mark_accepted(qid: str, u=Depends(auth.staff)):
    await db.execute("UPDATE quotes SET status='accepted', accepted_at=now() WHERE org_id=$1 AND id=$2", u["org_id"], qid)
    return {"ok": True}


@r.post("/quotes/{qid}/to-job")
async def quote_to_job(qid: str, u=Depends(auth.staff)):
    d = await quote_detail(qid, u)
    q = d["quote"]
    total = sum(round(l["qty"] * l["unit_cents"]) for l in d["lines"])
    org = await get_org(u["org_id"])
    prefix = svc.org_setting(org, "codes", "job") or "J"
    codes = [x["code"] for x in await db.fetch("SELECT code FROM jobs WHERE org_id=$1", u["org_id"])]
    job = await db.fetchrow(
        "INSERT INTO jobs (org_id, client_id, code, title, status, quoted_cents) VALUES ($1,$2,$3,$4,'scheduled',$5) RETURNING *",
        u["org_id"], q.get("client_id"), svc.next_in_series(codes, prefix), q["title"], int(total),
    )
    await timeline.log(u["org_id"], str(job["id"]), "job.from_quote", f"Created from quote {q['code']}", actor=u["user_id"])
    return svc.row_dict(job)


@r.get("/quotes/{qid}/pdf")
async def quote_pdf(qid: str, u=Depends(auth.staff)):
    d = await quote_detail(qid, u)
    org = await get_org(u["org_id"])
    q = d["quote"]
    pdf = pdfs.lines_pdf(
        org, f"Quote {q['code']}",
        [("client", q.get("client_name") or "—"), ("title", q["title"]), ("valid until", str(q.get("valid_until") or "—"))],
        d["lines"],
    )
    return Response(content=pdf, media_type="application/pdf")


class BookIn(BaseModel):
    supplier: str
    effective_from: str


@r.get("/pricebooks")
async def pricebooks(u=Depends(auth.staff)):
    rows = await db.fetch(
        """SELECT b.*, count(i.id) AS item_count FROM price_books b LEFT JOIN price_items i ON i.book_id=b.id
           WHERE b.org_id=$1 GROUP BY b.id ORDER BY b.supplier, b.effective_from DESC""",
        u["org_id"],
    )
    return svc.rows(rows)


@r.post("/pricebooks")
async def pricebook_create(body: BookIn, u=Depends(auth.staff)):
    row = await db.fetchrow(
        "INSERT INTO price_books (org_id, supplier, effective_from) VALUES ($1,$2,$3) RETURNING *",
        u["org_id"], body.supplier, svc.parse_date(body.effective_from),
    )
    return svc.row_dict(row)


@r.post("/pricebooks/{bid}/import")
async def pricebook_import(bid: str, file: UploadFile = File(...), u=Depends(auth.staff)):
    """CSV columns: sku, description, unit, unit_cents."""
    book = await db.fetchrow("SELECT id FROM price_books WHERE org_id=$1 AND id=$2", u["org_id"], bid)
    if not book:
        raise HTTPException(404, "Price book not found")
    text = (await file.read()).decode("utf-8", errors="replace")
    n = 0
    for rec in csv.DictReader(io.StringIO(text)):
        try:
            await db.execute(
                "INSERT INTO price_items (org_id, book_id, sku, description, unit, unit_cents) VALUES ($1,$2,$3,$4,$5,$6)",
                u["org_id"], bid, rec["sku"].strip(), rec["description"].strip(), (rec.get("unit") or "ea").strip(), int(rec["unit_cents"]),
            )
            n += 1
        except (KeyError, ValueError):
            continue
    return {"imported": n}


@r.get("/pricebooks/search")
async def price_search(q: str, u=Depends(auth.staff)):
    """Effective-dated: only the newest book per supplier (as of today) is searched,
    so a supplier price rise never silently reprices an open quote."""
    rows = await db.fetch(
        """SELECT i.sku, i.description, i.unit, i.unit_cents, b.supplier, b.effective_from FROM price_items i
           JOIN price_books b ON b.id = i.book_id
           WHERE i.org_id=$1 AND lower(i.description) LIKE '%' || lower($2) || '%'
             AND b.effective_from = (
               SELECT max(b2.effective_from) FROM price_books b2
               WHERE b2.org_id=$1 AND b2.supplier=b.supplier AND b2.effective_from <= CURRENT_DATE)
           ORDER BY i.description LIMIT 25""",
        u["org_id"], q,
    )
    return svc.rows(rows)
