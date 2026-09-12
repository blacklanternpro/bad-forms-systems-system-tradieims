import secrets

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import auth
import db
import svc

r = APIRouter(tags=["clients"])


class ClientIn(BaseModel):
    name: str
    contact_name: str | None = None
    email: str | None = None
    phone: str | None = None
    notes: str | None = None


@r.get("/clients")
async def clients_list(u=Depends(auth.staff)):
    rows = await db.fetch(
        """SELECT c.*, count(j.id) AS job_count FROM clients c
           LEFT JOIN jobs j ON j.client_id = c.id
           WHERE c.org_id=$1 GROUP BY c.id ORDER BY c.name""",
        u["org_id"],
    )
    return svc.rows(rows)


@r.post("/clients")
async def client_create(body: ClientIn, u=Depends(auth.staff)):
    row = await db.fetchrow(
        "INSERT INTO clients (org_id, name, contact_name, email, phone, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
        u["org_id"], body.name, body.contact_name, body.email, body.phone, body.notes,
    )
    return svc.row_dict(row)


@r.get("/clients/{cid}")
async def client_detail(cid: str, u=Depends(auth.staff)):
    c = await db.fetchrow("SELECT * FROM clients WHERE org_id=$1 AND id=$2", u["org_id"], cid)
    if not c:
        raise HTTPException(404, "Client not found")
    jobs = await db.fetch("SELECT id, code, title, status FROM jobs WHERE org_id=$1 AND client_id=$2 ORDER BY created_at DESC", u["org_id"], cid)
    quotes = await db.fetch("SELECT id, code, title, status FROM quotes WHERE org_id=$1 AND client_id=$2 ORDER BY created_at DESC", u["org_id"], cid)
    comms = await db.fetch(
        "SELECT channel, recipient, subject, status, created_at FROM comms_outbox WHERE org_id=$1 AND context->>'client_id'=$2 ORDER BY created_at DESC LIMIT 50",
        u["org_id"], cid,
    )
    return {"client": svc.row_dict(c), "jobs": svc.rows(jobs), "quotes": svc.rows(quotes), "comms": svc.rows(comms)}


class SiteIn(BaseModel):
    client_id: str | None = None
    name: str
    address: str | None = None
    gate_code: str | None = None
    contact_name: str | None = None
    contact_phone: str | None = None


@r.get("/sites")
async def sites_list(u=Depends(auth.staff)):
    rows = await db.fetch("SELECT * FROM sites WHERE org_id=$1 ORDER BY name", u["org_id"])
    return svc.rows(rows)


@r.post("/sites")
async def site_create(body: SiteIn, u=Depends(auth.staff)):
    row = await db.fetchrow(
        """INSERT INTO sites (org_id, client_id, name, address, gate_code, contact_name, contact_phone)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *""",
        u["org_id"], body.client_id, body.name, body.address, body.gate_code, body.contact_name, body.contact_phone,
    )
    return svc.row_dict(row)


@r.post("/sites/{sid}/plate")
async def site_plate(sid: str, u=Depends(auth.staff)):
    """Issue a site QR plate token: the physical yard as the login."""
    site = await db.fetchrow("SELECT id FROM sites WHERE org_id=$1 AND id=$2", u["org_id"], sid)
    if not site:
        raise HTTPException(404, "Site not found")
    token = secrets.token_urlsafe(12)
    await db.execute("INSERT INTO site_tokens (org_id, site_id, token) VALUES ($1,$2,$3)", u["org_id"], sid, token)
    return {"token": token, "url": f"/s/plate/{token}"}


class EnquiryIn(BaseModel):
    name: str
    contact: str | None = None
    note: str | None = None
    client_id: str | None = None


@r.get("/enquiries")
async def enquiries_list(u=Depends(auth.staff)):
    rows = await db.fetch("SELECT * FROM enquiries WHERE org_id=$1 ORDER BY created_at DESC", u["org_id"])
    return svc.rows(rows)


@r.post("/enquiries")
async def enquiry_create(body: EnquiryIn, u=Depends(auth.staff)):
    row = await db.fetchrow(
        "INSERT INTO enquiries (org_id, client_id, name, contact, note) VALUES ($1,$2,$3,$4,$5) RETURNING *",
        u["org_id"], body.client_id, body.name, body.contact, body.note,
    )
    return svc.row_dict(row)


class EnquiryStatus(BaseModel):
    status: str


@r.patch("/enquiries/{eid}")
async def enquiry_patch(eid: str, body: EnquiryStatus, u=Depends(auth.staff)):
    if body.status not in ("new", "quoted", "won", "lost"):
        raise HTTPException(400, "Bad status")
    await db.execute("UPDATE enquiries SET status=$3 WHERE org_id=$1 AND id=$2", u["org_id"], eid, body.status)
    return {"ok": True}
