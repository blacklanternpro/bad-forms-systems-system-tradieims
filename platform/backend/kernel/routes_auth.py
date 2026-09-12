from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import auth
import db
import svc
from kernel.common import get_org

r = APIRouter(tags=["auth"])


class LoginIn(BaseModel):
    email: str
    password: str
    org_slug: str | None = None


class PinIn(BaseModel):
    org_slug: str
    pin: str


def _session(user, org) -> dict:
    return {
        "token": auth.make_token(str(user["id"]), str(user["org_id"]), user["role"]),
        "user": {"id": str(user["id"]), "name": user["name"], "role": user["role"]},
        "org": {
            "id": str(org["id"]), "slug": org["slug"], "name": org["name"],
            "theme": org["theme"], "terminology": org.get("terminology") or {},
            "modules": org.get("modules") or {}, "is_demo": org["is_demo"],
            "brand": org.get("brand") or {},
            "pilot": bool((org.get("settings") or {}).get("pilot")),
        },
    }


@r.post("/auth/login")
async def login(body: LoginIn):
    q = """SELECT u.* FROM users u JOIN organisations o ON o.id = u.org_id
           WHERE lower(u.email)=lower($1) AND u.active AND ($2::text IS NULL OR o.slug=$2)"""
    row = await db.fetchrow(q, body.email, body.org_slug)
    if not row or not row["password_hash"] or not auth.check_password(body.password, row["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    org = await get_org(str(row["org_id"]))
    return _session(svc.row_dict(row), org)


@r.post("/auth/pin")
async def pin_login(body: PinIn):
    row = await db.fetchrow(
        """SELECT u.* FROM users u JOIN organisations o ON o.id=u.org_id
           WHERE o.slug=$1 AND u.pin=$2 AND u.role='crew' AND u.active""",
        body.org_slug, body.pin,
    )
    if not row:
        raise HTTPException(401, "Invalid PIN")
    org = await get_org(str(row["org_id"]))
    return _session(svc.row_dict(row), org)


@r.get("/me")
async def me(u=Depends(auth.anyone)):
    org = await get_org(u["org_id"])
    row = await db.fetchrow("SELECT id, name, role FROM users WHERE id=$1", u["user_id"])
    out = {k: org[k] for k in ("id", "slug", "name", "theme", "terminology", "modules", "is_demo")}
    out["brand"] = org.get("brand") or {}
    out["pilot"] = bool((org.get("settings") or {}).get("pilot"))
    return {"user": svc.row_dict(row), "org": out}
