import os, uuid
from datetime import datetime, timezone
import db

async def push_draft(draft_id: str, org_id: str):
    d = await db.fetchrow("SELECT * FROM xero_drafts WHERE id=$1 AND org_id=$2", draft_id, org_id)
    if not d:
        return None, "draft not found"
    if d["status"] == "pushed":
        return d, None
    if os.environ.get("XERO_MODE", "mock") != "mock":
        return None, "live Xero not commissioned"
    xero_id = f"XERO-MOCK-{uuid.uuid4().hex[:12].upper()}"
    await db.execute("UPDATE xero_drafts SET status='pushed', xero_id=$1, pushed_at=$2, error=NULL, updated_at=now() WHERE id=$3",
                     xero_id, datetime.now(timezone.utc), draft_id)
    if d["job_id"] and d["purpose"] in ("final", "tm"):
        await db.execute("UPDATE jobs SET status='draft_in_ledger', updated_at=now() WHERE id=$1 AND status='ready_to_invoice'", d["job_id"])
    return await db.fetchrow("SELECT * FROM xero_drafts WHERE id=$1", draft_id), None
