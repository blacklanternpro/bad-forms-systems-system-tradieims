from datetime import timedelta

from fastapi import APIRouter, Depends

import auth
import db
import notify
import svc

r = APIRouter(tags=["notifications"])


@r.get("/notifications")
async def notifications(u=Depends(auth.anyone)):
    rows = await notify.unread_for(u["org_id"], u["user_id"], u["role"])
    return svc.rows(rows)


@r.post("/notifications/{nid}/read")
async def mark_read(nid: str, u=Depends(auth.anyone)):
    await db.execute("UPDATE notifications SET read_at=now() WHERE org_id=$1 AND id=$2", u["org_id"], nid)
    return {"ok": True}


@r.post("/notifications/read-all")
async def read_all(u=Depends(auth.anyone)):
    await db.execute("UPDATE notifications SET read_at=now() WHERE org_id=$1 AND read_at IS NULL", u["org_id"])
    return {"ok": True}


@r.get("/nudge")
async def nudge(u=Depends(auth.staff)):
    """The morning digest: recalls this week, quotes to chase, review queue,
    licences expiring. One roll-up, not notification spam."""
    today = svc.today_awst()
    ws, we = svc.week_bounds(today)
    recalls = await db.fetch(
        """SELECT id, code, title, recall_on FROM jobs
           WHERE org_id=$1 AND recall_on IS NOT NULL AND recall_on <= $2 AND status != 'invoiced' ORDER BY recall_on""",
        u["org_id"], we,
    )
    quotes = await db.fetch(
        """SELECT id, code, title, valid_until FROM quotes
           WHERE org_id=$1 AND status='sent' AND valid_until IS NOT NULL AND valid_until <= $2 ORDER BY valid_until""",
        u["org_id"], today + timedelta(days=7),
    )
    review_count = await db.fetchval("SELECT count(*) FROM captures WHERE org_id=$1 AND status='needs_verify'", u["org_id"])
    licences = await db.fetch(
        """SELECT l.kind, l.expires_on, us.name AS user_name FROM licences l JOIN users us ON us.id=l.user_id
           WHERE l.org_id=$1 AND l.expires_on IS NOT NULL AND l.expires_on <= $2 ORDER BY l.expires_on""",
        u["org_id"], today + timedelta(days=30),
    )
    return {
        "date": today.isoformat(),
        "recalls": svc.rows(recalls),
        "quotes": svc.rows(quotes),
        "review_count": int(review_count or 0),
        "licences_expiring": svc.rows(licences),
    }
