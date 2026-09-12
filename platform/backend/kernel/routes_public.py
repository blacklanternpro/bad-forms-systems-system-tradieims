"""Unauthenticated endpoints: public quote acceptance and site-plate sign-in.

Everything here is token-scoped — a leaked URL exposes exactly one quote or
one site plate, never a listing.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import db
import notify
import svc

r = APIRouter(tags=["public"])


async def _quote_by_token(token: str) -> dict:
    q = await db.fetchrow(
        """SELECT q.*, c.name AS client_name, o.name AS org_name, o.brand, o.id AS org_id
           FROM quotes q
           LEFT JOIN clients c ON c.id=q.client_id
           JOIN organisations o ON o.id=q.org_id
           WHERE q.accept_token=$1""",
        token,
    )
    if not q:
        raise HTTPException(404, "Quote not found")
    return svc.row_dict(q)


@r.get("/public/quote/{token}")
async def public_quote(token: str):
    q = await _quote_by_token(token)
    lines = svc.rows(await db.fetch("SELECT description, qty, unit_cents, sort FROM quote_lines WHERE quote_id=$1 ORDER BY sort", q["id"]))
    total_ex = sum(round(l["qty"] * l["unit_cents"]) for l in lines)
    return {
        "org_name": q["org_name"],
        "brand": q.get("brand") or {},
        "code": q["code"],
        "title": q["title"],
        "client_name": q.get("client_name"),
        "status": q["status"],
        "valid_until": q.get("valid_until"),
        "deposit_cents": q["deposit_cents"],
        "lines": lines,
        "total_ex_cents": total_ex,
    }


class AcceptIn(BaseModel):
    name: str


@r.post("/public/quote/{token}/accept")
async def public_quote_accept(token: str, body: AcceptIn):
    q = await _quote_by_token(token)
    if q["status"] == "accepted":
        return {"ok": True, "already": True}
    if q["status"] != "sent":
        raise HTTPException(409, "Quote is not open for acceptance")
    await db.execute("UPDATE quotes SET status='accepted', accepted_at=now() WHERE id=$1", q["id"])
    await notify.emit(
        q["org_id"], "quote_accepted",
        f"Quote {q['code']} accepted",
        f"{body.name} accepted {q['title']}",
        link=f"/quotes/{q['id']}",
    )
    return {"ok": True}


async def _site_by_plate(token: str) -> dict:
    s = await db.fetchrow(
        """SELECT s.*, t.org_id AS org_id, o.name AS org_name
           FROM site_tokens t JOIN sites s ON s.id=t.site_id JOIN organisations o ON o.id=t.org_id
           WHERE t.token=$1""",
        token,
    )
    if not s:
        raise HTTPException(404, "Plate not recognised")
    return svc.row_dict(s)


@r.get("/public/plate/{token}")
async def plate_board(token: str):
    site = await _site_by_plate(token)
    on_site = svc.rows(await db.fetch(
        "SELECT id, name, kind, in_at FROM sign_ins WHERE site_id=$1 AND out_at IS NULL ORDER BY in_at",
        site["id"],
    ))
    return {"org_name": site["org_name"], "site_name": site["name"], "address": site.get("address"), "on_site": on_site}


class SignIn(BaseModel):
    name: str
    kind: str = "visitor"


@r.post("/public/plate/{token}/sign-in")
async def plate_sign_in(token: str, body: SignIn):
    site = await _site_by_plate(token)
    kind = body.kind if body.kind in ("crew", "visitor") else "visitor"
    row = await db.fetchrow(
        "INSERT INTO sign_ins (org_id, site_id, name, kind) VALUES ($1,$2,$3,$4) RETURNING id, in_at",
        site["org_id"], site["id"], body.name.strip(), kind,
    )
    return {"ok": True, "sign_in_id": str(row["id"]), "in_at": row["in_at"].isoformat()}


class SignOut(BaseModel):
    sign_in_id: str


@r.post("/public/plate/{token}/sign-out")
async def plate_sign_out(token: str, body: SignOut):
    site = await _site_by_plate(token)
    row = await db.fetchrow(
        "UPDATE sign_ins SET out_at=now() WHERE id=$1 AND site_id=$2 AND out_at IS NULL RETURNING id",
        body.sign_in_id, site["id"],
    )
    if not row:
        raise HTTPException(404, "Open sign-in not found")
    return {"ok": True}
