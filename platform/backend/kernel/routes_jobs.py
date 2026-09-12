from datetime import timedelta

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

import auth
import db
import notify
import pdfs
import storage
import svc
from kernel import timeline
from kernel.common import get_org

r = APIRouter(tags=["jobs"])


class JobIn(BaseModel):
    title: str
    client_id: str | None = None
    site_id: str | None = None
    quoted_cents: int = 0
    po_ref: str | None = None
    starts_on: str | None = None
    recur_rule: str | None = None  # 'weekly' | 'monthly'


@r.get("/jobs")
async def jobs_list(filter: str = "all", u=Depends(auth.staff)):
    base = """SELECT j.*, c.name AS client_name, s.name AS site_name FROM jobs j
              LEFT JOIN clients c ON c.id=j.client_id LEFT JOIN sites s ON s.id=j.site_id
              WHERE j.org_id=$1"""
    args: list = [u["org_id"]]
    if filter == "recall_week":
        ws, we = svc.week_bounds()
        base += " AND j.recall_on IS NOT NULL AND j.recall_on <= $3 AND j.status != 'invoiced' AND j.recall_on >= $2"
        args += [ws, we]
    elif filter == "recall_due":
        base += " AND j.recall_on IS NOT NULL AND j.recall_on <= $2 AND j.status != 'invoiced'"
        args.append(svc.today_awst())
    elif filter == "missing_po":
        base += " AND j.po_ref IS NULL AND j.status IN ('scheduled','live')"
    elif filter != "all":
        base += " AND j.status = $2"
        args.append(filter)
    rows = await db.fetch(base + " ORDER BY j.created_at DESC", *args)
    return svc.rows(rows)


@r.post("/jobs")
async def job_create(body: JobIn, u=Depends(auth.staff)):
    org = await get_org(u["org_id"])
    prefix = svc.org_setting(org, "codes", "job") or "J"
    codes = [x["code"] for x in await db.fetch("SELECT code FROM jobs WHERE org_id=$1", u["org_id"])]
    code = svc.next_in_series(codes, prefix)
    row = await db.fetchrow(
        """INSERT INTO jobs (org_id, client_id, site_id, code, title, quoted_cents, po_ref, starts_on, recur_rule)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *""",
        u["org_id"], body.client_id, body.site_id, code, body.title, body.quoted_cents,
        body.po_ref, svc.parse_date(body.starts_on), body.recur_rule,
    )
    await timeline.log(u["org_id"], str(row["id"]), "job.created", f"Job {code} created", actor=u["user_id"])
    return svc.row_dict(row)


class JobPatch(BaseModel):
    status: str | None = None
    recall_on: str | None = None
    po_ref: str | None = None
    quoted_cents: int | None = None


@r.patch("/jobs/{jid}")
async def job_patch(jid: str, body: JobPatch, u=Depends(auth.staff)):
    job = await db.fetchrow("SELECT * FROM jobs WHERE org_id=$1 AND id=$2", u["org_id"], jid)
    if not job:
        raise HTTPException(404, "Job not found")
    if body.status:
        if body.status not in ("quoted", "scheduled", "live", "done", "invoiced"):
            raise HTTPException(400, "Bad status")
        done = ", completed_at = now()" if body.status == "done" else ""
        await db.execute(f"UPDATE jobs SET status=$3{done} WHERE org_id=$1 AND id=$2", u["org_id"], jid, body.status)
        await timeline.log(u["org_id"], jid, "job.status", f"Status → {body.status}", actor=u["user_id"])
    if body.recall_on is not None:
        await db.execute("UPDATE jobs SET recall_on=$3 WHERE org_id=$1 AND id=$2", u["org_id"], jid, svc.parse_date(body.recall_on) if body.recall_on else None)
    if body.po_ref is not None:
        await db.execute("UPDATE jobs SET po_ref=$3 WHERE org_id=$1 AND id=$2", u["org_id"], jid, body.po_ref or None)
    if body.quoted_cents is not None:
        await db.execute("UPDATE jobs SET quoted_cents=$3 WHERE org_id=$1 AND id=$2", u["org_id"], jid, body.quoted_cents)
    return svc.row_dict(await db.fetchrow("SELECT * FROM jobs WHERE id=$1", jid))


async def _costing(org: dict, jid: str) -> dict:
    rate = svc.org_setting(org, "rates", "labour_cost_cents") or 9500
    hours = await db.fetchval(
        "SELECT COALESCE(sum(EXTRACT(EPOCH FROM (ended_at - started_at)))/3600.0, 0) FROM time_entries WHERE org_id=$1 AND job_id=$2 AND ended_at IS NOT NULL",
        org["id"], jid,
    )
    labour = round(float(hours) * rate)
    materials = await db.fetchval(
        """SELECT COALESCE(sum((extracted->>'subtotal_ex_cents')::int), 0) FROM captures
           WHERE org_id=$1 AND job_id=$2 AND status='verified' AND capture_type='receipt'""",
        org["id"], jid,
    ) or 0
    plant = await db.fetchval(
        """SELECT COALESCE(sum(round(((extracted->>'hours')::numeric) * 18000)), 0) FROM captures
           WHERE org_id=$1 AND job_id=$2 AND status='verified' AND capture_type='hire_docket'""",
        org["id"], jid,
    ) or 0
    quoted = await db.fetchval("SELECT quoted_cents FROM jobs WHERE id=$1", jid) or 0
    cost = labour + int(materials) + int(plant)
    return {
        "hours": round(float(hours), 2), "labour_cents": labour, "materials_cents": int(materials),
        "plant_cents": int(plant), "cost_cents": cost, "quoted_cents": quoted,
        "margin_cents": quoted - cost,
    }


@r.get("/jobs/{jid}")
async def job_detail(jid: str, u=Depends(auth.staff)):
    job = await db.fetchrow(
        """SELECT j.*, c.name AS client_name, c.email AS client_email, s.name AS site_name,
                  s.address, s.gate_code, s.contact_name AS site_contact, s.contact_phone AS site_phone
           FROM jobs j LEFT JOIN clients c ON c.id=j.client_id LEFT JOIN sites s ON s.id=j.site_id
           WHERE j.org_id=$1 AND j.id=$2""",
        u["org_id"], jid,
    )
    if not job:
        raise HTTPException(404, "Job not found")
    org = await get_org(u["org_id"])
    stages = await db.fetch("SELECT * FROM job_stages WHERE job_id=$1 ORDER BY sort", jid)
    docs = await db.fetch("SELECT * FROM documents WHERE org_id=$1 AND job_id=$2 ORDER BY created_at DESC", u["org_id"], jid)
    events = await timeline.for_job(u["org_id"], jid)
    comms = await db.fetch(
        "SELECT channel, recipient, subject, status, created_at FROM comms_outbox WHERE org_id=$1 AND context->>'job_id'=$2 ORDER BY created_at DESC",
        u["org_id"], jid,
    )
    captures = await db.fetch("SELECT id, capture_type, status, confidence, created_at FROM captures WHERE org_id=$1 AND job_id=$2 ORDER BY created_at DESC", u["org_id"], jid)
    return {
        "job": svc.row_dict(job), "stages": svc.rows(stages), "documents": svc.rows(docs),
        "timeline": svc.rows(events), "comms": svc.rows(comms), "captures": svc.rows(captures),
        "costing": await _costing(org, jid),
    }


@r.post("/jobs/{jid}/documents")
async def job_document(jid: str, kind: str = Form("drawing"), file: UploadFile = File(...), u=Depends(auth.staff)):
    data = await file.read()
    key = f"{u['org_id']}/jobs/{jid}/{file.filename}"
    await storage.put_object(key, data)
    row = await db.fetchrow(
        "INSERT INTO documents (org_id, job_id, kind, name, storage_key, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
        u["org_id"], jid, kind, file.filename or "document", key, u["user_id"],
    )
    await timeline.log(u["org_id"], jid, "document.added", f"{kind} attached: {file.filename}", actor=u["user_id"])
    return svc.row_dict(row)


@r.get("/documents/{did}/raw")
async def document_raw(did: str, u=Depends(auth.anyone)):
    doc = await db.fetchrow("SELECT * FROM documents WHERE org_id=$1 AND id=$2", u["org_id"], did)
    if not doc:
        raise HTTPException(404, "Document not found")
    data = await storage.get_object(doc["storage_key"])
    media = "application/pdf" if doc["storage_key"].endswith(".pdf") else "image/jpeg"
    return Response(content=data, media_type=media)


class AssignIn(BaseModel):
    job_id: str
    user_id: str
    on_date: str
    window: str | None = None


@r.get("/dayboard")
async def dayboard(date_str: str | None = None, u=Depends(auth.staff)):
    day = svc.parse_date(date_str) or svc.today_awst()
    jobs = await db.fetch(
        """SELECT DISTINCT j.*, c.name AS client_name, s.name AS site_name FROM jobs j
           LEFT JOIN clients c ON c.id=j.client_id LEFT JOIN sites s ON s.id=j.site_id
           JOIN job_assignments a ON a.job_id=j.id AND a.on_date=$2
           WHERE j.org_id=$1 ORDER BY j.code""",
        u["org_id"], day,
    )
    assigns = await db.fetch(
        """SELECT a.*, us.name AS user_name FROM job_assignments a JOIN users us ON us.id=a.user_id
           WHERE a.org_id=$1 AND a.on_date=$2""",
        u["org_id"], day,
    )
    away = await db.fetch(
        "SELECT av.*, us.name AS user_name FROM availability av JOIN users us ON us.id=av.user_id WHERE av.org_id=$1 AND av.on_date=$2",
        u["org_id"], day,
    )
    return {"date": day.isoformat(), "jobs": svc.rows(jobs), "assignments": svc.rows(assigns), "away": svc.rows(away)}


@r.get("/weekboard")
async def weekboard(start: str | None = None, u=Depends(auth.staff)):
    ws = svc.parse_date(start) or svc.week_bounds()[0]
    days = []
    for i in range(7):
        d = ws + timedelta(days=i)
        n = await db.fetchval("SELECT count(DISTINCT job_id) FROM job_assignments WHERE org_id=$1 AND on_date=$2", u["org_id"], d)
        days.append({"date": d.isoformat(), "job_count": int(n or 0)})
    return {"start": ws.isoformat(), "days": days}


@r.post("/assignments")
async def assign(body: AssignIn, u=Depends(auth.staff)):
    d = svc.parse_date(body.on_date)
    away = await db.fetchrow("SELECT kind FROM availability WHERE org_id=$1 AND user_id=$2 AND on_date=$3", u["org_id"], body.user_id, d)
    row = await db.fetchrow(
        """INSERT INTO job_assignments (org_id, job_id, user_id, on_date, time_window) VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (org_id, job_id, user_id, on_date) DO UPDATE SET time_window=EXCLUDED.time_window RETURNING *""",
        u["org_id"], body.job_id, body.user_id, d, body.window,
    )
    await notify.emit(u["org_id"], "assignment_changed", "You've been assigned", f"Job on {body.on_date}", user_id=body.user_id, audience="crew")
    return {**svc.row_dict(row), "warning": f"User is on {away['kind']} that day" if away else None}


@r.delete("/assignments/{aid}")
async def unassign(aid: str, u=Depends(auth.staff)):
    await db.execute("DELETE FROM job_assignments WHERE org_id=$1 AND id=$2", u["org_id"], aid)
    return {"ok": True}


@r.post("/dayboard/copy-previous")
async def copy_previous(date_str: str | None = None, u=Depends(auth.staff)):
    day = svc.parse_date(date_str) or svc.today_awst()
    prev = day - timedelta(days=1)
    n = await db.fetchval(
        """INSERT INTO job_assignments (org_id, job_id, user_id, on_date, time_window)
           SELECT org_id, job_id, user_id, $3, time_window FROM job_assignments WHERE org_id=$1 AND on_date=$2
           ON CONFLICT DO NOTHING RETURNING 1""",
        u["org_id"], prev, day,
    )
    return {"copied": bool(n)}


class AvailabilityIn(BaseModel):
    user_id: str
    on_date: str
    kind: str
    note: str | None = None


@r.post("/availability")
async def availability_set(body: AvailabilityIn, u=Depends(auth.staff)):
    if body.kind not in ("leave", "sick"):
        raise HTTPException(400, "Bad kind")
    row = await db.fetchrow(
        """INSERT INTO availability (org_id, user_id, on_date, kind, note) VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (org_id, user_id, on_date) DO UPDATE SET kind=EXCLUDED.kind RETURNING *""",
        u["org_id"], body.user_id, svc.parse_date(body.on_date), body.kind, body.note,
    )
    return svc.row_dict(row)


@r.get("/dayboard/sheet.pdf")
async def day_sheet(date_str: str | None = None, u=Depends(auth.staff)):
    org = await get_org(u["org_id"])
    board = await dayboard(date_str, u)
    crew_by_job: dict[str, list[str]] = {}
    for a in board["assignments"]:
        crew_by_job.setdefault(str(a["job_id"]), []).append(a["user_name"])
    rows = [
        {"code": j["code"], "title": j["title"], "site": j.get("site_name"), "crew": ", ".join(crew_by_job.get(str(j["id"]), []))}
        for j in board["jobs"]
    ]
    pdf = pdfs.day_sheet_pdf(org, board["date"], rows)
    return Response(content=pdf, media_type="application/pdf")


@r.post("/jobs/recur/run")
async def recur_run(u=Depends(auth.staff)):
    """Materialise the next occurrence for recurring jobs whose start has passed."""
    org = await get_org(u["org_id"])
    due = await db.fetch(
        "SELECT * FROM jobs WHERE org_id=$1 AND recur_rule IS NOT NULL AND starts_on IS NOT NULL AND starts_on <= $2",
        u["org_id"], svc.today_awst(),
    )
    created = []
    codes = [x["code"] for x in await db.fetch("SELECT code FROM jobs WHERE org_id=$1", u["org_id"])]
    prefix = svc.org_setting(org, "codes", "job") or "J"
    for j in due:
        step = timedelta(days=7) if j["recur_rule"] == "weekly" else timedelta(days=30)
        nxt = j["starts_on"] + step
        code = svc.next_in_series(codes, prefix)
        codes.append(code)
        row = await db.fetchrow(
            """INSERT INTO jobs (org_id, client_id, site_id, code, title, quoted_cents, starts_on, recur_rule)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, code""",
            u["org_id"], j["client_id"], j["site_id"], code, j["title"], j["quoted_cents"], nxt, j["recur_rule"],
        )
        await db.execute("UPDATE jobs SET recur_rule=NULL WHERE id=$1", j["id"])
        created.append(svc.row_dict(row))
    return {"created": created}
