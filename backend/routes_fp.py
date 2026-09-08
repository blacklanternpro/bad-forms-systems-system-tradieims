import os, asyncpg, tempfile, base64
from fastapi import APIRouter, Depends, HTTPException, Body, UploadFile, File, Form, Response, Query, Header
from datetime import datetime, date, timezone
import db, auth, svc, pdfs, extractor
import jwt as pyjwt

r = APIRouter()
crew = auth.require("crew")
anyuser = auth.require("crew", "owner", "bookkeeper")

# ---------- PIN auth ----------
@r.post("/field/{slug}/pin")
async def pin_login(slug: str, body: dict = Body(...)):
    org = await db.fetchrow("SELECT * FROM organisations WHERE slug=$1", slug)
    if not org:
        raise HTTPException(404, "Org not found")
    pin = (body.get("pin") or "").strip()
    if not pin:
        raise HTTPException(400, "PIN required")
    for u in await db.fetch("SELECT * FROM users WHERE org_id=$1 AND role='crew' AND pin_hash IS NOT NULL", org["id"]):
        if auth.check_pw(pin, u["pin_hash"]):
            return {"token": auth.make_token(u), "user": {"id": str(u["id"]), "name": u["name"], "role": "crew"},
                    "org": {"slug": org["slug"], "trading_name": org["trading_name"], "is_demo": org["is_demo"]}}
    raise HTTPException(401, "Invalid PIN")

async def _dedupe(org_id, client_id, user_id):
    if not client_id:
        return False
    try:
        await db.execute("INSERT INTO sync_outbox (org_id, client_id, user_id, op) VALUES ($1,$2,$3,$4)", org_id, str(client_id), user_id, {})
        return False
    except asyncpg.UniqueViolationError:
        return True

@r.get("/field/today")
async def field_today(u=Depends(crew)):
    d = svc.today_awst()
    rows = await db.fetch(
        """SELECT ja.window_start, ja.window_end, j.id as job_id, j.code, j.title, j.status, j.billing,
                  s.name as site_name, s.address_text, c.name as client_name
           FROM job_assignments ja JOIN jobs j ON j.id=ja.job_id
           LEFT JOIN sites s ON s.id=j.site_id JOIN clients c ON c.id=j.client_id
           WHERE ja.org_id=$1 AND ja.user_id=$2 AND ja.on_date=$3 ORDER BY ja.window_start NULLS LAST""",
        u["org_id"], u["id"], d)
    return {"date": str(d), "user": {"id": str(u["id"]), "name": u["name"]},
            "jobs": [{"job_id": str(x["job_id"]), "code": x["code"], "title": x["title"], "status": x["status"],
                      "billing": x["billing"], "site_name": x["site_name"], "address_text": x["address_text"],
                      "client_name": x["client_name"], "window_start": str(x["window_start"] or ""), "window_end": str(x["window_end"] or "")} for x in rows]}

async def _job_for(u, jid):
    j = await db.fetchrow("SELECT * FROM jobs WHERE id=$1 AND org_id=$2", jid, u["org_id"])
    if not j:
        raise HTTPException(404, "Job not found")
    return j

@r.get("/field/jobs/{jid}")
async def field_job(jid: str, u=Depends(crew)):
    j = await _job_for(u, jid)
    client = await db.fetchrow("SELECT name, email FROM clients WHERE id=$1", j["client_id"])
    bill_to = await db.fetchrow("SELECT name, email FROM clients WHERE id=$1", j["bill_to_client_id"] or j["client_id"])
    site = await db.fetchrow("SELECT name, address_text FROM sites WHERE id=$1", j["site_id"]) if j["site_id"] else None
    docs = await db.fetch("SELECT id, kind, mime, created_at FROM documents WHERE job_id=$1 ORDER BY created_at DESC LIMIT 30", jid)
    variations = await db.fetch("SELECT id, code, title, amount_cents, status FROM variations WHERE job_id=$1 ORDER BY code", jid)
    extras = await db.fetch("SELECT id, kind, description, qty, unit_cents FROM job_extra_lines WHERE job_id=$1", jid)
    hours = await db.fetch("SELECT id, started_at, ended_at, note FROM time_entries WHERE job_id=$1 AND user_id=$2 ORDER BY started_at DESC LIMIT 10", jid, u["id"])
    def cl(rows): return [{k: (v if isinstance(v, (int, float, bool, type(None), str)) else str(v)) for k, v in x.items()} for x in rows]
    return {"job": {"id": str(j["id"]), "code": j["code"], "title": j["title"], "status": j["status"], "billing": j["billing"]},
            "client": dict(client), "bill_to": dict(bill_to), "site": dict(site) if site else None,
            "documents": cl(docs), "variations": cl(variations), "extras": cl(extras), "hours": cl(hours)}

@r.post("/field/jobs/{jid}/capture")
async def capture(jid: str, file: UploadFile = File(...), kind: str = Form("docket_photo"),
                  client_id: str = Form(None), u=Depends(crew)):
    j = await _job_for(u, jid)
    if kind not in ("docket_photo", "before_photo", "after_photo", "voice_note"):
        raise HTTPException(400, "Bad kind")
    if await _dedupe(u["org_id"], client_id, u["id"]):
        return {"deduped": True}
    data = await file.read()
    mime = file.content_type or "image/jpeg"
    ext = "webm" if kind == "voice_note" else "jpg"
    if kind != "voice_note":
        data = svc.compress_image(data)
        mime = "image/jpeg"
    else:
        mime = mime if mime.startswith("audio/") else "audio/webm"
    path = svc.save_bytes(u["org_id"], data, ext, mime)
    doc = await svc.add_document(u["org_id"], jid, kind, path, mime, u["id"])
    ext_row = None
    if kind == "voice_note":
        ext_row = await db.fetchrow(
            """INSERT INTO docket_extractions (org_id, document_id, job_id, status, kind, extracted)
               VALUES ($1,$2,$3,'needs_verify','timesheet_voice',$4) RETURNING id, status""",
            u["org_id"], doc["id"], jid, {"source": "voice_note", "crew": u["name"]})
    if kind == "docket_photo":
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as t:
            t.write(data); tmp = t.name
        result = await extractor.extract(tmp, mime)
        os.unlink(tmp)
        if result.get("error"):
            ext_row = await db.fetchrow(
                "INSERT INTO docket_extractions (org_id, document_id, job_id, status, error) VALUES ($1,$2,$3,'failed',$4) RETURNING id, status",
                u["org_id"], doc["id"], jid, result["error"])
        else:
            rdate = None
            if result.get("receipt_date"):
                try: rdate = date.fromisoformat(result["receipt_date"])
                except ValueError: pass
            ext_row = await db.fetchrow(
                """INSERT INTO docket_extractions (org_id, document_id, job_id, status, kind, extracted, supplier, total_cents, gst_cents, docket_number, receipt_date)
                   VALUES ($1,$2,$3,'needs_verify',$4,$5,$6,$7,$8,$9,$10) RETURNING id, status""",
                u["org_id"], doc["id"], jid, result.get("kind") or "unknown", result,
                result.get("supplier"), result.get("total_cents"), result.get("gst_cents"), result.get("docket_number"), rdate)
    return {"document_id": str(doc["id"]), "kind": kind,
            "extraction": {"id": str(ext_row["id"]), "status": ext_row["status"]} if ext_row else None}

@r.post("/field/jobs/{jid}/hours")
async def log_hours(jid: str, body: dict = Body(...), u=Depends(crew)):
    await _job_for(u, jid)
    if await _dedupe(u["org_id"], body.get("client_id"), u["id"]):
        return {"deduped": True}
    started = datetime.fromisoformat(body["started_at"])
    ended = datetime.fromisoformat(body["ended_at"]) if body.get("ended_at") else None
    row = await db.fetchrow(
        "INSERT INTO time_entries (org_id, job_id, user_id, started_at, ended_at, note) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
        u["org_id"], jid, u["id"], started, ended, body.get("note"))
    minutes = int((ended - started).total_seconds() // 60) if ended else None
    return {"id": str(row["id"]), "minutes": minutes}

@r.post("/field/jobs/{jid}/extras")
async def add_extra(jid: str, body: dict = Body(...), u=Depends(crew)):
    await _job_for(u, jid)
    if body.get("kind") not in ("travel", "callout", "other"):
        raise HTTPException(400, "kind must be travel|callout|other")
    if await _dedupe(u["org_id"], body.get("client_id"), u["id"]):
        return {"deduped": True}
    row = await db.fetchrow(
        "INSERT INTO job_extra_lines (org_id, job_id, kind, description, qty, unit_cents) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
        u["org_id"], jid, body["kind"], body.get("description", ""), int(body.get("qty", 1)), int(body["unit_cents"]))
    return {"id": str(row["id"])}

@r.post("/field/jobs/{jid}/variations")
async def create_variation(jid: str, body: dict = Body(...), u=Depends(crew)):
    j = await _job_for(u, jid)
    code = await svc.next_code("VO", "variations", u["org_id"], job_id=jid)
    row = await db.fetchrow(
        "INSERT INTO variations (org_id, job_id, code, title, amount_cents) VALUES ($1,$2,$3,$4,$5) RETURNING id, code",
        u["org_id"], jid, code, body["title"], int(body["amount_cents"]))
    return {"id": str(row["id"]), "code": row["code"]}

@r.post("/field/variations/{vid}/sign-canvas")
async def sign_canvas(vid: str, body: dict = Body(...), u=Depends(anyuser)):
    v = await db.fetchrow("SELECT * FROM variations WHERE id=$1 AND org_id=$2", vid, u["org_id"])
    if not v:
        raise HTTPException(404, "Variation not found")
    sig, doc = await svc.sign_variation(v, body.get("name") or "Customer", "canvas", signature_b64=body.get("image_base64"))
    return {"signed": True, "signature_id": str(sig["id"]), "pdf_document_id": str(doc["id"])}

@r.post("/field/variations/{vid}/send-email")
async def send_variation(vid: str, body: dict = Body(default={}), u=Depends(anyuser)):
    v = await db.fetchrow("SELECT * FROM variations WHERE id=$1 AND org_id=$2", vid, u["org_id"])
    if not v:
        raise HTTPException(404, "Variation not found")
    if v["status"] == "signed":
        raise HTTPException(409, "Variation already signed")
    j = await db.fetchrow("SELECT * FROM jobs WHERE id=$1", v["job_id"])
    bill_to = await db.fetchrow("SELECT * FROM clients WHERE id=$1", j["bill_to_client_id"] or j["client_id"])
    to_email = body.get("to_email") or (bill_to and bill_to.get("email"))
    if not to_email:
        raise HTTPException(400, "NO CUSTOMER EMAIL")
    tok, th = svc.token_pair()
    send = await db.fetchrow(
        "INSERT INTO variation_sends (org_id, variation_id, to_email, token_hash, expires_at, emailed_at) VALUES ($1,$2,$3,$4, now() + interval '7 days', now()) RETURNING id",
        u["org_id"], vid, to_email, th)
    await db.execute("UPDATE variations SET status='sent', updated_at=now() WHERE id=$1 AND status='draft'", vid)
    await svc.queue_mail(u["org_id"], to_email, f"Sign variation {v['code']} — {j['code']}", "variation_send", v["id"])
    return {"send_id": str(send["id"]), "sign_path": f"/s/{tok}", "to_email": to_email}

@r.post("/field/jobs/{jid}/certs")
async def upload_cert(jid: str, file: UploadFile = File(...), name: str = Form(...), u=Depends(crew)):
    j = await _job_for(u, jid)
    if not (file.content_type or "").endswith("pdf"):
        raise HTTPException(400, "Certificate must be a PDF")
    data = await file.read()
    path = svc.save_bytes(u["org_id"], data, "pdf", "application/pdf")
    doc = await svc.add_document(u["org_id"], jid, "cert_pdf", path, "application/pdf", u["id"], meta={"name": name})
    client = await db.fetchrow("SELECT * FROM clients WHERE id=$1", j["bill_to_client_id"] or j["client_id"])
    to_email = client and client.get("email")
    cert = await db.fetchrow(
        """INSERT INTO certificates (org_id, job_id, name, document_id, emailed_to, emailed_at, status)
           VALUES ($1,$2,$3,$4,$5, CASE WHEN $5::text IS NULL THEN NULL ELSE now() END, $6) RETURNING id, status""",
        u["org_id"], jid, name, doc["id"], to_email, "queued" if to_email else "stored")
    if to_email:
        await svc.queue_mail(u["org_id"], to_email, f"Certificate — {name} — {j['code']}", "certificate", cert["id"])
    return {"certificate_id": str(cert["id"]), "document_id": str(doc["id"]),
            "status": cert["status"], "emailed_to": to_email}

@r.get("/field/jobs/{jid}/pack.pdf")
async def job_pack(jid: str, auth_q: str = Query(None, alias="auth"), authorization: str = Header(None)):
    payload = _decode(auth_q, authorization)
    j = await db.fetchrow("SELECT * FROM jobs WHERE id=$1 AND org_id=$2", jid, payload["org_id"])
    if not j:
        raise HTTPException(404, "Job not found")
    org = await svc.get_org(j["org_id"])
    client = await db.fetchrow("SELECT * FROM clients WHERE id=$1", j["client_id"])
    site = await db.fetchrow("SELECT * FROM sites WHERE id=$1", j["site_id"]) if j["site_id"] else None
    variations = await db.fetch("SELECT * FROM variations WHERE job_id=$1 ORDER BY code", jid)
    extras = await db.fetch("SELECT * FROM job_extra_lines WHERE job_id=$1", jid)
    receipts = await db.fetch("SELECT * FROM supplier_receipts WHERE job_id=$1", jid)
    certs = await db.fetch("SELECT * FROM certificates WHERE job_id=$1 ORDER BY created_at", jid)
    data = svc.render_pdf(j["org_id"], pdfs.pack_pdf, org, j, client, site, variations, extras, receipts, certs=certs)
    return Response(content=data, media_type="application/pdf")

def _decode(auth_q, authorization):
    tok = auth_q or (authorization[7:] if authorization and authorization.startswith("Bearer ") else None)
    if not tok:
        raise HTTPException(401, "Not authenticated")
    try:
        return pyjwt.decode(tok, os.environ["JWT_SECRET"], algorithms=["HS256"])
    except pyjwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")

# ---------- files ----------
@r.get("/files/{doc_id}")
async def serve_file(doc_id: str, auth_q: str = Query(None, alias="auth"), authorization: str = Header(None)):
    payload = _decode(auth_q, authorization)
    d = await db.fetchrow("SELECT * FROM documents WHERE id=$1 AND org_id=$2", doc_id, payload["org_id"])
    if not d:
        raise HTTPException(404, "Not found")
    import storage
    data, ct = storage.get_object(d["file_path"])
    return Response(content=data, media_type=d["mime"] or ct)

# ---------- public: quote accept ----------
async def _quote_by_token(token: str):
    th = svc.hash_token(token)
    send = await db.fetchrow("SELECT * FROM quote_sends WHERE token_hash=$1", th)
    if not send or send["revoked_at"]:
        raise HTTPException(404, "Link is no longer valid")
    if send["expires_at"] < datetime.now(timezone.utc):
        raise HTTPException(410, "Link expired")
    q = await db.fetchrow("SELECT * FROM quotes WHERE id=$1", send["quote_id"])
    return send, q

@r.get("/public/q/{token}")
async def public_quote(token: str):
    send, q = await _quote_by_token(token)
    org = await svc.get_org(q["org_id"])
    client = await db.fetchrow("SELECT name, abn FROM clients WHERE id=$1", q["client_id"])
    site = await db.fetchrow("SELECT name, address_text FROM sites WHERE id=$1", q["site_id"]) if q["site_id"] else None
    lines = await db.fetch("SELECT description, qty, unit_cents FROM quote_lines WHERE quote_id=$1 ORDER BY sort", q["id"])
    total = await svc.quote_total_cents(q["id"])
    from money import gst_cents
    import math
    dep = math.floor(total * (q["deposit_bps"] or 0) / 10000 + 0.5)
    return {"code": q["code"], "title": q["title"], "status": q["status"], "valid_until": str(q["valid_until"] or ""),
            "org": {"trading_name": org["trading_name"], "abn": org["abn"], "is_demo": org["is_demo"]},
            "client": dict(client), "site": dict(site) if site else None,
            "lines": [{"description": l["description"], "qty": float(l["qty"]), "unit_cents": l["unit_cents"]} for l in lines],
            "total_cents": total, "gst_cents": gst_cents(total), "deposit_cents": dep, "deposit_bps": q["deposit_bps"]}

@r.get("/public/q/{token}/pdf")
async def public_quote_pdf(token: str):
    send, q = await _quote_by_token(token)
    org = await svc.get_org(q["org_id"])
    lines = await db.fetch("SELECT * FROM quote_lines WHERE quote_id=$1 ORDER BY sort", q["id"])
    client = await db.fetchrow("SELECT * FROM clients WHERE id=$1", q["client_id"])
    site = await db.fetchrow("SELECT * FROM sites WHERE id=$1", q["site_id"]) if q["site_id"] else None
    data = svc.render_pdf(q["org_id"], pdfs.quote_pdf, org, q, lines, client, site)
    return Response(content=data, media_type="application/pdf")

@r.post("/public/q/{token}/accept")
async def public_accept(token: str, body: dict = Body(...)):
    send, q = await _quote_by_token(token)
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "Name is required")
    job, draft, _ = await svc.accept_quote(q, name, signature_b64=body.get("signature_base64"), method="token", send_id=send["id"])
    return {"accepted": True, "job_code": job["code"], "deposit_cents": job["deposit_cents"],
            "deposit_draft": bool(draft)}

@r.post("/public/q/{token}/decline")
async def public_decline(token: str):
    send, q = await _quote_by_token(token)
    if q["status"] == "accepted":
        raise HTTPException(409, "Quote already accepted")
    await db.execute("UPDATE quotes SET status='declined', updated_at=now() WHERE id=$1", q["id"])
    await db.execute("UPDATE quote_sends SET revoked_at=now() WHERE quote_id=$1 AND revoked_at IS NULL", q["id"])
    return {"declined": True}

# ---------- public: variation sign ----------
async def _variation_by_token(token: str):
    th = svc.hash_token(token)
    send = await db.fetchrow("SELECT * FROM variation_sends WHERE token_hash=$1", th)
    if not send:
        raise HTTPException(404, "Link is no longer valid")
    v = await db.fetchrow("SELECT * FROM variations WHERE id=$1", send["variation_id"])
    if send["revoked_at"]:
        if v["status"] == "signed":
            raise HTTPException(409, "Already signed via another path")
        raise HTTPException(404, "Link is no longer valid")
    if send["expires_at"] < datetime.now(timezone.utc):
        raise HTTPException(410, "Link expired")
    return send, v

@r.get("/public/s/{token}")
async def public_variation(token: str):
    send, v = await _variation_by_token(token)
    if v["status"] == "signed":
        raise HTTPException(409, "Already signed")
    job = await db.fetchrow("SELECT code, title FROM jobs WHERE id=$1", v["job_id"])
    org = await svc.get_org(v["org_id"])
    from money import gst_cents
    return {"code": v["code"], "title": v["title"], "amount_cents": v["amount_cents"], "gst_cents": gst_cents(v["amount_cents"]),
            "status": v["status"], "job": dict(job),
            "org": {"trading_name": org["trading_name"], "abn": org["abn"], "is_demo": org["is_demo"]}}

@r.post("/public/s/{token}/sign")
async def public_sign(token: str, body: dict = Body(...)):
    send, v = await _variation_by_token(token)
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "Name is required")
    sig, doc = await svc.sign_variation(v, name, "token", signature_b64=body.get("signature_base64"), send_id=send["id"])
    return {"signed": True, "code": v["code"]}
