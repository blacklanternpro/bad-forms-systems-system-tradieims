"""The capture pipeline: photo/voice -> extract -> verify gate -> allocate -> draft."""
import json
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

import aigate
import auth
import db
import ledger
import notify
import storage
import svc
from kernel import timeline
from kernel.common import audit, get_org

r = APIRouter(tags=["capture"])

# Pack allocation hooks: capture_type -> async (u, cap, fields) -> allocation dict.
# Packs register these at import; the kernel never learns pack table names.
ALLOCATORS: dict[str, object] = {}


def register_allocator(capture_type: str, fn) -> None:
    ALLOCATORS[capture_type] = fn


async def create_capture(u: dict, capture_type: str, data: bytes | None, filename: str | None, job_id: str | None, geo: dict | None = None) -> dict:
    org = await get_org(u["org_id"])
    doc_id = None
    if data:
        key = f"{u['org_id']}/captures/{capture_type}/{filename or 'capture.jpg'}"
        await storage.put_object(key, data)
        doc_id = await db.fetchval(
            "INSERT INTO documents (org_id, job_id, kind, name, storage_key, created_by) VALUES ($1,$2,'capture',$3,$4,$5) RETURNING id",
            u["org_id"], job_id, filename or "capture.jpg", key, u["user_id"],
        )
    result = await aigate.extract(capture_type, data, org)
    routing = aigate.route(org, capture_type, result["confidence"])
    status = "needs_verify"
    row = await db.fetchrow(
        """INSERT INTO captures (org_id, job_id, capture_type, status, document_id, extracted, confidence, checks, geo, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *""",
        u["org_id"], job_id, capture_type, status, doc_id,
        json.dumps(result["fields"]), result["confidence"], json.dumps(result["checks"]),
        json.dumps(geo) if geo else None, u["user_id"],
    )
    if routing == "review":
        await notify.emit(
            u["org_id"], "capture_review",
            f"{capture_type.replace('_', ' ').title()} needs a look",
            f"Confidence {result['confidence']:.2f} — review before it goes anywhere.",
            link="/cc/inbox",
        )
    await timeline.log(u["org_id"], job_id, "capture.created", f"{capture_type} captured ({routing})", actor=u["user_id"])
    out = svc.row_dict(row)
    out["routing"] = routing
    return out


@r.post("/captures")
async def capture_upload(
    capture_type: str = Form(...),
    job_id: str | None = Form(None),
    lat: float | None = Form(None),
    lng: float | None = Form(None),
    file: UploadFile | None = File(None),
    u=Depends(auth.anyone),
):
    data = await file.read() if file else None
    geo = {"lat": lat, "lng": lng} if lat is not None and lng is not None else None
    return await create_capture(u, capture_type, data, file.filename if file else None, job_id, geo)


@r.get("/captures")
async def captures_list(status: str = "needs_verify", u=Depends(auth.staff)):
    rows = await db.fetch(
        """SELECT cp.*, j.code AS job_code, us.name AS created_by_name FROM captures cp
           LEFT JOIN jobs j ON j.id=cp.job_id LEFT JOIN users us ON us.id=cp.created_by
           WHERE cp.org_id=$1 AND ($2='all' OR cp.status=$2) ORDER BY cp.created_at DESC LIMIT 200""",
        u["org_id"], status,
    )
    return svc.rows(rows)


class VerifyIn(BaseModel):
    fields: dict | None = None  # corrected extraction, if the reviewer fixed values
    note: str | None = None


async def _allocate(u: dict, cap: dict, fields: dict) -> dict:
    """Post-verify allocation per capture type. Returns allocation summary."""
    org = await get_org(u["org_id"])
    ct = cap["capture_type"]
    if ct == "receipt":
        payload = {
            "type": "ACCPAY",
            "supplier": fields.get("supplier"),
            "invoice_no": fields.get("invoice_no"),
            "job_id": str(cap["job_id"]) if cap.get("job_id") else None,
            "lines": fields.get("lines") or [],
            "subtotal_ex_cents": fields.get("subtotal_ex_cents"),
        }
        res = await ledger.push_draft(org, "ACCPAY", payload, str(cap["document_id"]) if cap.get("document_id") else None)
        return {"kind": "ledger_draft", "ledger_ref": res["ledger_ref"]}
    if ct == "voice_timesheet":
        day = svc.today_awst()
        started = datetime.fromisoformat(f"{day}T{fields.get('started', '07:00')}:00+08:00")
        ended = datetime.fromisoformat(f"{day}T{fields.get('ended', '15:00')}:00+08:00")
        brk = int(fields.get("break_minutes") or 0)
        ended = ended - timedelta(minutes=0)  # break recorded in meta; window kept verbatim
        te = await db.fetchval(
            "INSERT INTO time_entries (org_id, job_id, user_id, started_at, ended_at, source) VALUES ($1,$2,$3,$4,$5,'voice') RETURNING id",
            u["org_id"], cap["job_id"], cap["created_by"], started, ended,
        )
        return {"kind": "time_entry", "id": str(te), "break_minutes": brk}
    if ct == "incident":
        await notify.emit(u["org_id"], "incident_reported", "Incident report verified", fields.get("summary") or "", link="/cc/inbox", audience="owner")
        return {"kind": "incident"}
    hook = ALLOCATORS.get(ct)
    if hook is not None:
        return await hook(u, cap, fields)  # type: ignore[operator]
    return {"kind": "recorded"}


@r.post("/captures/{cid}/verify")
async def capture_verify(cid: str, body: VerifyIn, u=Depends(auth.staff)):
    cap = await db.fetchrow("SELECT * FROM captures WHERE org_id=$1 AND id=$2", u["org_id"], cid)
    if not cap:
        raise HTTPException(404, "Capture not found")
    if cap["status"] not in ("needs_verify", "pending"):
        raise HTTPException(400, "Already resolved")
    cap = svc.row_dict(cap)
    fields = body.fields if body.fields is not None else cap["extracted"]
    corrected = body.fields is not None and body.fields != cap["extracted"]
    await db.execute(
        """UPDATE captures SET status='verified', extracted=$3, reviewer_note=$4, verified_by=$5, verified_at=now()
           WHERE org_id=$1 AND id=$2""",
        u["org_id"], cid, json.dumps(fields), body.note, u["user_id"],
    )
    if corrected:
        await audit(u["org_id"], u["user_id"], "extraction.corrected", {"capture_id": cid, "capture_type": cap["capture_type"]})
    allocation = await _allocate(u, cap, fields)
    await timeline.log(u["org_id"], cap.get("job_id"), "capture.verified", f"{cap['capture_type']} verified → {allocation['kind']}", actor=u["user_id"])
    return {"ok": True, "allocation": allocation}


class RejectIn(BaseModel):
    note: str | None = None


@r.post("/captures/{cid}/reject")
async def capture_reject(cid: str, body: RejectIn, u=Depends(auth.staff)):
    n = await db.execute(
        "UPDATE captures SET status='rejected', reviewer_note=$3, verified_by=$4, verified_at=now() WHERE org_id=$1 AND id=$2 AND status='needs_verify'",
        u["org_id"], cid, body.note, u["user_id"],
    )
    if n.endswith("0"):
        raise HTTPException(404, "Capture not found or already resolved")
    return {"ok": True}
