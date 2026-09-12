"""Live reporting: WIP, margin, payroll export, global search."""
import csv
import io

from fastapi import APIRouter, Depends
from fastapi.responses import PlainTextResponse

import auth
import db
import svc
from kernel.common import get_org
from kernel.routes_jobs import _costing

r = APIRouter(tags=["reports"])


@r.get("/search")
async def search(q: str, u=Depends(auth.staff)):
    """Global search: jobs, clients, quotes, POs, captures. Two keystrokes to anything."""
    like = f"%{q.lower()}%"
    jobs = await db.fetch(
        "SELECT id, code, title, status FROM jobs WHERE org_id=$1 AND (lower(code) LIKE $2 OR lower(title) LIKE $2) LIMIT 10",
        u["org_id"], like,
    )
    clients = await db.fetch(
        "SELECT id, name FROM clients WHERE org_id=$1 AND lower(name) LIKE $2 LIMIT 10", u["org_id"], like
    )
    quotes = await db.fetch(
        "SELECT id, code, title, status FROM quotes WHERE org_id=$1 AND (lower(code) LIKE $2 OR lower(title) LIKE $2) LIMIT 10",
        u["org_id"], like,
    )
    pos = await db.fetch(
        "SELECT id, code, supplier, status FROM purchase_orders WHERE org_id=$1 AND (lower(code) LIKE $2 OR lower(supplier) LIKE $2) LIMIT 10",
        u["org_id"], like,
    )
    captures = await db.fetch(
        "SELECT id, capture_type, status, extracted->>'supplier' AS supplier FROM captures WHERE org_id=$1 AND (lower(capture_type) LIKE $2 OR lower(extracted::text) LIKE $2) LIMIT 10",
        u["org_id"], like,
    )
    return {"jobs": svc.rows(jobs), "clients": svc.rows(clients), "quotes": svc.rows(quotes), "pos": svc.rows(pos), "captures": svc.rows(captures)}


@r.get("/reports/wip")
async def wip(u=Depends(auth.staff)):
    """Work in progress with live cost — every number drillable to its job."""
    org = await get_org(u["org_id"])
    jobs = await db.fetch(
        "SELECT id, code, title, status, quoted_cents FROM jobs WHERE org_id=$1 AND status IN ('scheduled','live','done') ORDER BY code",
        u["org_id"],
    )
    out = []
    for j in jobs:
        c = await _costing(org, str(j["id"]))
        out.append({**svc.row_dict(j), **c})
    return {"jobs": out, "total_quoted_cents": sum(x["quoted_cents"] for x in out), "total_cost_cents": sum(x["cost_cents"] for x in out)}


@r.get("/reports/margin/{jid}")
async def margin(jid: str, u=Depends(auth.staff)):
    """Post-job margin review: quote vs actual, feeding the rate library."""
    org = await get_org(u["org_id"])
    c = await _costing(org, jid)
    verified = await db.fetch(
        "SELECT capture_type, extracted, confidence FROM captures WHERE org_id=$1 AND job_id=$2 AND status='verified'",
        u["org_id"], jid,
    )
    return {**c, "provenance": svc.rows(verified)}


@r.get("/reports/payroll-export")
async def payroll_export(week_start: str | None = None, u=Depends(auth.staff)):
    """CSV of hours per person per day for the bookkeeper's payroll tool.
    Payroll itself stays out of the platform, forever."""
    ws = svc.parse_date(week_start) or svc.week_bounds()[0]
    rows = await db.fetch(
        """SELECT us.name, te.job_id, j.code AS job_code, date(te.started_at AT TIME ZONE 'Australia/Perth') AS day,
                  round(EXTRACT(EPOCH FROM (te.ended_at - te.started_at))/3600.0, 2) AS hours
           FROM time_entries te JOIN users us ON us.id=te.user_id LEFT JOIN jobs j ON j.id=te.job_id
           WHERE te.org_id=$1 AND te.ended_at IS NOT NULL
             AND date(te.started_at AT TIME ZONE 'Australia/Perth') BETWEEN $2 AND $2 + 6
           ORDER BY us.name, day""",
        u["org_id"], ws,
    )
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["name", "date", "job", "hours"])
    for x in rows:
        w.writerow([x["name"], x["day"], x["job_code"], x["hours"]])
    return PlainTextResponse(buf.getvalue(), media_type="text/csv")
