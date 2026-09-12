"""Per-job timeline: the single write path for job history events."""
import json

import db


async def log(org_id: str, job_id: str | None, kind: str, summary: str, meta: dict | None = None, actor: str | None = None) -> None:
    await db.execute(
        "INSERT INTO timeline_events (org_id, job_id, kind, summary, meta, actor) VALUES ($1,$2,$3,$4,$5,$6)",
        org_id, job_id, kind, summary, json.dumps(meta or {}), actor,
    )


async def for_job(org_id: str, job_id: str) -> list:
    return await db.fetch(
        "SELECT * FROM timeline_events WHERE org_id=$1 AND job_id=$2 ORDER BY created_at DESC LIMIT 200",
        org_id, job_id,
    )
