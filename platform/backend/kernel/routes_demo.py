"""Break-glass demo clear — issues a virgin token for the current demo org."""

from fastapi import APIRouter, Depends, HTTPException

import auth
import db
import demo_virgin
from kernel.common import get_org

r = APIRouter(tags=["demo"])


@r.post("/demo/clear")
async def demo_clear(u=Depends(auth.staff)):
    """Empty transactional demo data for this browser session.

    Does not DELETE rows. Returns a short-lived virgin token the client stores
    in memory and sends as X-Demo-Virgin. Full page reload restores the seed.
    """
    if u["role"] not in ("owner", "office"):
        raise HTTPException(403, "Owner or office only")
    org = await get_org(u["org_id"])
    if not org.get("is_demo"):
        raise HTTPException(400, "Only demo yards can be cleared")
    token = demo_virgin.issue_token(str(org["id"]))
    await db.execute(
        "INSERT INTO audit_log (org_id, actor, action, detail) VALUES ($1,$2,'demo.clear','{\"mode\":\"virgin\"}')",
        u["org_id"], u["user_id"],
    )
    return {
        "ok": True,
        "virgin_token": token,
        "message": "Demo cleared for this tab until you reload",
    }
