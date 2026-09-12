"""Yard admin console API: org settings, users/PINs, licences, modules, ledger
connection, audit log, data export."""
import json
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import auth
import db
import notify
import svc
from kernel.common import audit, get_org

r = APIRouter(tags=["org"])


@r.get("/org")
async def org_info(u=Depends(auth.staff)):
    org = await get_org(u["org_id"])
    org.pop("settings", None)
    return org


@r.get("/org/admin")
async def org_admin(u=Depends(auth.owner)):
    return await get_org(u["org_id"])


class OrgPatch(BaseModel):
    name: str | None = None
    theme: str | None = None
    terminology: dict | None = None
    settings: dict | None = None


@r.patch("/org")
async def org_patch(body: OrgPatch, u=Depends(auth.owner)):
    org = await get_org(u["org_id"])
    if body.name:
        await db.execute("UPDATE organisations SET name=$2 WHERE id=$1", u["org_id"], body.name)
    if body.theme:
        await db.execute("UPDATE organisations SET theme=$2 WHERE id=$1", u["org_id"], body.theme)
    if body.terminology is not None:
        await db.execute("UPDATE organisations SET terminology=$2 WHERE id=$1", u["org_id"], json.dumps(body.terminology))
    if body.settings is not None:
        merged = {**(org.get("settings") or {}), **body.settings}
        await db.execute("UPDATE organisations SET settings=$2 WHERE id=$1", u["org_id"], json.dumps(merged))
    await audit(u["org_id"], u["user_id"], "org.patch", body.model_dump(exclude_none=True))
    return await get_org(u["org_id"])


class ModulesPatch(BaseModel):
    modules: dict


@r.get("/modules")
async def modules(u=Depends(auth.staff)):
    org = await get_org(u["org_id"])
    return org.get("modules") or {}


@r.patch("/org/modules")
async def modules_patch(body: ModulesPatch, u=Depends(auth.owner)):
    org = await get_org(u["org_id"])
    merged = {**(org.get("modules") or {}), **body.modules}
    await db.execute("UPDATE organisations SET modules=$2 WHERE id=$1", u["org_id"], json.dumps(merged))
    await audit(u["org_id"], u["user_id"], "org.modules", merged)
    return merged


class LedgerConnect(BaseModel):
    provider: str  # 'xero' | 'myob' | 'xero-mock'
    account_map: dict | None = None


@r.post("/org/ledger/connect")
async def ledger_connect(body: LedgerConnect, u=Depends(auth.owner)):
    if body.provider not in ("xero", "myob", "xero-mock"):
        raise HTTPException(400, "Unknown provider")
    org = await get_org(u["org_id"])
    settings = org.get("settings") or {}
    settings["ledger"] = {"provider": body.provider, "status": "connected", "account_map": body.account_map or {}}
    await db.execute("UPDATE organisations SET settings=$2 WHERE id=$1", u["org_id"], json.dumps(settings))
    await audit(u["org_id"], u["user_id"], "ledger.connect", {"provider": body.provider})
    return settings["ledger"]


class UserIn(BaseModel):
    name: str
    role: str
    email: str | None = None
    password: str | None = None
    pin: str | None = None


@r.get("/org/users")
async def users_list(u=Depends(auth.staff)):
    rows = await db.fetch("SELECT id, name, email, role, pin, active FROM users WHERE org_id=$1 ORDER BY role, name", u["org_id"])
    return svc.rows(rows)


@r.post("/org/users")
async def user_create(body: UserIn, u=Depends(auth.owner)):
    if body.role not in ("owner", "office", "crew"):
        raise HTTPException(400, "Bad role")
    if body.role == "crew" and not body.pin:
        raise HTTPException(400, "Crew need a PIN")
    ph = auth.hash_password(body.password) if body.password else None
    row = await db.fetchrow(
        """INSERT INTO users (org_id, name, email, role, password_hash, pin)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, name, email, role, pin, active""",
        u["org_id"], body.name, body.email, body.role, ph, body.pin,
    )
    await audit(u["org_id"], u["user_id"], "user.create", {"name": body.name, "role": body.role})
    return svc.row_dict(row)


class LicenceIn(BaseModel):
    user_id: str
    kind: str
    ref: str | None = None
    expires_on: str | None = None


@r.get("/org/licences")
async def licences(u=Depends(auth.staff)):
    rows = await db.fetch(
        """SELECT l.*, us.name AS user_name FROM licences l JOIN users us ON us.id=l.user_id
           WHERE l.org_id=$1 ORDER BY l.expires_on NULLS LAST""",
        u["org_id"],
    )
    return svc.rows(rows)


@r.post("/org/licences")
async def licence_create(body: LicenceIn, u=Depends(auth.staff)):
    row = await db.fetchrow(
        "INSERT INTO licences (org_id, user_id, kind, ref, expires_on) VALUES ($1,$2,$3,$4,$5) RETURNING *",
        u["org_id"], body.user_id, body.kind, body.ref, svc.parse_date(body.expires_on),
    )
    return svc.row_dict(row)


@r.get("/org/licences/expiring")
async def licences_expiring(u=Depends(auth.staff)):
    horizon = svc.today_awst() + timedelta(days=30)
    rows = await db.fetch(
        """SELECT l.*, us.name AS user_name FROM licences l JOIN users us ON us.id=l.user_id
           WHERE l.org_id=$1 AND l.expires_on IS NOT NULL AND l.expires_on <= $2 ORDER BY l.expires_on""",
        u["org_id"], horizon,
    )
    return svc.rows(rows)


@r.get("/org/audit")
async def audit_list(u=Depends(auth.owner)):
    rows = await db.fetch("SELECT * FROM audit_log WHERE org_id=$1 ORDER BY created_at DESC LIMIT 200", u["org_id"])
    return svc.rows(rows)


EXPORT_TABLES = (
    "clients", "sites", "enquiries", "jobs", "job_stages", "job_assignments",
    "quotes", "quote_lines", "purchase_orders", "po_lines", "captures",
    "time_entries", "invoices", "invoice_lines", "ledger_drafts", "assets",
)


@r.get("/org/export")
async def data_export(u=Depends(auth.owner)):
    """The data-export guarantee: every tenant-scoped row, as JSON."""
    out: dict = {}
    for t in EXPORT_TABLES:
        rows = await db.fetch(f"SELECT * FROM {t} WHERE org_id=$1", u["org_id"])  # noqa: S608 — table names from a fixed tuple
        out[t] = [{k: (str(v) if v is not None else None) for k, v in dict(x).items()} for x in rows]
    await audit(u["org_id"], u["user_id"], "org.export", {"tables": len(out)})
    return out


class DemoNotify(BaseModel):
    event_type: str
    title: str


@r.post("/org/notify-test")
async def notify_test(body: DemoNotify, u=Depends(auth.owner)):
    nid = await notify.emit(u["org_id"], body.event_type, body.title)
    return {"id": str(nid)}
