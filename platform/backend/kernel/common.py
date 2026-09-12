import json

from fastapi import HTTPException

import db
import svc


async def get_org(org_id: str) -> dict:
    r = await db.fetchrow("SELECT * FROM organisations WHERE id=$1", org_id)
    if not r:
        raise HTTPException(404, "Org not found")
    return svc.row_dict(r)


async def require_module(org_id: str, pack: str) -> dict:
    org = await get_org(org_id)
    mods = org.get("modules") or {}
    if isinstance(mods, str):
        mods = json.loads(mods)
    if mods.get(pack) != "live":
        raise HTTPException(501, f"{pack.upper()} — NOT COMMISSIONED")
    return org


async def audit(org_id: str | None, actor: str, action: str, detail: dict | None = None) -> None:
    await db.execute(
        "INSERT INTO audit_log (org_id, actor, action, detail) VALUES ($1,$2,$3,$4)",
        org_id, actor, action, json.dumps(detail or {}),
    )
