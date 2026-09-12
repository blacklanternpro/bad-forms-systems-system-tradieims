"""Field PWA API: today/tomorrow boards, the job pack, hours, incident capture."""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import auth
import db
import svc
from kernel import timeline

r = APIRouter(tags=["field"])


async def _board(u: dict, day) -> list[dict]:
    rows = await db.fetch(
        """SELECT j.id AS job_id, j.code, j.title, a.time_window AS window, s.name AS site_name, s.address
           FROM job_assignments a JOIN jobs j ON j.id=a.job_id LEFT JOIN sites s ON s.id=j.site_id
           WHERE a.org_id=$1 AND a.user_id=$2 AND a.on_date=$3 ORDER BY j.code""",
        u["org_id"], u["user_id"], day,
    )
    return svc.rows(rows)


@r.get("/field/today")
async def field_today(u=Depends(auth.anyone)):
    return {"date": svc.today_awst().isoformat(), "jobs": await _board(u, svc.today_awst())}


@r.get("/field/tomorrow")
async def field_tomorrow(u=Depends(auth.anyone)):
    d = svc.today_awst() + timedelta(days=1)
    return {"date": d.isoformat(), "jobs": await _board(u, d)}


@r.get("/field/jobs/{jid}")
async def field_job(jid: str, u=Depends(auth.anyone)):
    """The job pack: everything a crew member needs walking onto site."""
    job = await db.fetchrow(
        """SELECT j.id, j.code, j.title, j.status, s.name AS site_name, s.address, s.gate_code,
                  s.contact_name AS site_contact, s.contact_phone AS site_phone, c.name AS client_name
           FROM jobs j LEFT JOIN sites s ON s.id=j.site_id LEFT JOIN clients c ON c.id=j.client_id
           WHERE j.org_id=$1 AND j.id=$2""",
        u["org_id"], jid,
    )
    if not job:
        raise HTTPException(404, "Job not found")
    others = await db.fetch(
        """SELECT us.name FROM job_assignments a JOIN users us ON us.id=a.user_id
           WHERE a.org_id=$1 AND a.job_id=$2 AND a.on_date=$3 AND a.user_id != $4""",
        u["org_id"], jid, svc.today_awst(), u["user_id"],
    )
    drawings = await db.fetch(
        "SELECT id, kind, name FROM documents WHERE org_id=$1 AND job_id=$2 AND kind IN ('drawing','pdf') ORDER BY created_at DESC",
        u["org_id"], jid,
    )
    stages = await db.fetch("SELECT * FROM job_stages WHERE job_id=$1 ORDER BY sort", jid)
    open_entry = await db.fetchrow(
        "SELECT id, started_at FROM time_entries WHERE org_id=$1 AND job_id=$2 AND user_id=$3 AND ended_at IS NULL",
        u["org_id"], jid, u["user_id"],
    )
    return {
        "job": svc.row_dict(job),
        "on_today": [x["name"] for x in others],
        "drawings": svc.rows(drawings),
        "stages": svc.rows(stages),
        "open_time_entry": svc.row_dict(open_entry) if open_entry else None,
    }


class ClockIn(BaseModel):
    action: str  # 'start' | 'stop'


@r.post("/field/jobs/{jid}/time")
async def clock(jid: str, body: ClockIn, u=Depends(auth.anyone)):
    if body.action == "start":
        open_e = await db.fetchval(
            "SELECT id FROM time_entries WHERE org_id=$1 AND user_id=$2 AND ended_at IS NULL", u["org_id"], u["user_id"]
        )
        if open_e:
            raise HTTPException(400, "Already clocked on")
        row = await db.fetchrow(
            "INSERT INTO time_entries (org_id, job_id, user_id, started_at, source) VALUES ($1,$2,$3,now(),'signin') RETURNING id, started_at",
            u["org_id"], jid, u["user_id"],
        )
        await timeline.log(u["org_id"], jid, "time.start", "Clocked on", actor=u["user_id"])
        return svc.row_dict(row)
    if body.action == "stop":
        row = await db.fetchrow(
            "UPDATE time_entries SET ended_at=now() WHERE org_id=$1 AND job_id=$2 AND user_id=$3 AND ended_at IS NULL RETURNING id, started_at, ended_at",
            u["org_id"], jid, u["user_id"],
        )
        if not row:
            raise HTTPException(400, "No open entry")
        await timeline.log(u["org_id"], jid, "time.stop", "Clocked off", actor=u["user_id"])
        return svc.row_dict(row)
    raise HTTPException(400, "Bad action")


class StageDone(BaseModel):
    stage_id: str


@r.post("/field/jobs/{jid}/stage-done")
async def stage_done(jid: str, body: StageDone, u=Depends(auth.anyone)):
    st = await db.fetchrow("SELECT * FROM job_stages WHERE org_id=$1 AND id=$2 AND job_id=$3", u["org_id"], body.stage_id, jid)
    if not st:
        raise HTTPException(404, "Stage not found")
    if st["requires_photo"]:
        n = await db.fetchval(
            "SELECT count(*) FROM captures WHERE org_id=$1 AND job_id=$2 AND created_at > now() - interval '1 day'",
            u["org_id"], jid,
        )
        if not n:
            raise HTTPException(400, "This stage needs a photo captured today before sign-off")
    await db.execute(
        "UPDATE job_stages SET completed_at=now(), completed_by=$3 WHERE id=$1 AND org_id=$2", body.stage_id, u["org_id"], u["user_id"]
    )
    await timeline.log(u["org_id"], jid, "stage.done", f"Stage complete: {st['name']}", actor=u["user_id"])
    return {"ok": True}
