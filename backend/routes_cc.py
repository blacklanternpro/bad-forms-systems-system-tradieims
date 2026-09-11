from fastapi import APIRouter, Depends, HTTPException, Response, Body, Query, Header
from datetime import date, datetime, timedelta, time as dtime
import db, auth, svc, pdfs, xerostub, seed
from money import gst_cents, line_total

r = APIRouter()
owner = auth.require("owner")
staff = auth.require("owner", "bookkeeper")

@r.post("/auth/login")
async def login(body: dict = Body(...)):
    email = (body.get("email") or "").strip().lower()
    u = await db.fetchrow("SELECT * FROM users WHERE lower(email)=$1", email)
    if not u or not auth.check_pw(body.get("password") or "", u.get("password_hash")):
        raise HTTPException(401, "Invalid email or password")
    if u["role"] == "crew":
        raise HTTPException(403, "Crew sign in with PIN on the Field app")
    tok = auth.make_token(u)
    org = await svc.get_org(u["org_id"])
    return {"token": tok, "user": {"id": str(u["id"]), "name": u["name"], "email": u["email"], "role": u["role"]},
            "org": {"id": str(org["id"]), "slug": org["slug"], "trading_name": org["trading_name"], "is_demo": org["is_demo"], "structure": org["structure"], "settings": org["settings"]}}

@r.get("/auth/me")
async def me(u=Depends(staff)):
    org = await svc.get_org(u["org_id"])
    return {"user": {"id": str(u["id"]), "name": u["name"], "email": u["email"], "role": u["role"]},
            "org": {"id": str(org["id"]), "slug": org["slug"], "trading_name": org["trading_name"], "is_demo": org["is_demo"], "structure": org["structure"], "settings": org["settings"]}}

# ---------- day board ----------
async def _board(org_id, d):
    rows = await db.fetch(
        """SELECT ja.id as assignment_id, ja.window_start, ja.window_end, ja.on_date,
                  j.id as job_id, j.code, j.title, j.status, j.billing, j.customer_po,
                  s.name as site_name, s.address_text, c.name as client_name, us.name as crew_name, us.id as crew_id
           FROM job_assignments ja
           JOIN jobs j ON j.id=ja.job_id LEFT JOIN sites s ON s.id=j.site_id
           JOIN clients c ON c.id=j.client_id JOIN users us ON us.id=ja.user_id
           WHERE ja.org_id=$1 AND ja.on_date=$2 ORDER BY ja.window_start NULLS LAST, j.code""", org_id, d)
    jobs = {}
    for row in rows:
        jid = str(row["job_id"])
        jobs.setdefault(jid, {"job_id": jid, "code": row["code"], "title": row["title"], "status": row["status"],
                              "billing": row["billing"], "site_name": row["site_name"], "address_text": row["address_text"],
                              "client_name": row["client_name"], "crew": []})
        jobs[jid]["crew"].append({"assignment_id": str(row["assignment_id"]), "name": row["crew_name"], "user_id": str(row["crew_id"]),
                                  "window_start": str(row["window_start"] or ""), "window_end": str(row["window_end"] or "")})
    return list(jobs.values())

@r.get("/dayboard")
async def dayboard(date_str: str = None, u=Depends(staff)):
    d = date.fromisoformat(date_str) if date_str else svc.today_awst()
    return {"date": str(d), "jobs": await _board(u["org_id"], d)}

@r.get("/dayboard/sheet.pdf")
async def day_sheet(date_str: str = None, auth_q: str = Query(None, alias="auth"), authorization: str = Header(None)):
    import routes_fp
    payload = routes_fp._decode(auth_q, authorization)
    org = await svc.get_org(payload["org_id"])
    d = date.fromisoformat(date_str) if date_str else svc.today_awst()
    jobs = await _board(payload["org_id"], d)
    data = svc.render_pdf(payload["org_id"], pdfs.day_sheet_pdf, org, str(d), jobs)
    return Response(content=data, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="day-sheet-{d}.pdf"'})

@r.post("/dayboard/copy-previous")
async def copy_previous(body: dict = Body(...), u=Depends(owner)):
    d = date.fromisoformat(body["date"])
    prev = d - timedelta(days=1)
    n = await db.fetchval(
        """WITH ins AS (
             INSERT INTO job_assignments (org_id, job_id, user_id, on_date, window_start, window_end)
             SELECT org_id, job_id, user_id, $3, window_start, window_end FROM job_assignments
             WHERE org_id=$1 AND on_date=$2
             ON CONFLICT (job_id, user_id, on_date) DO NOTHING RETURNING 1)
           SELECT count(*) FROM ins""", u["org_id"], prev, d)
    return {"copied": n, "from": str(prev), "to": str(d)}

@r.post("/dayboard/assign")
async def assign(body: dict = Body(...), u=Depends(owner)):
    ws = dtime.fromisoformat(body["window_start"]) if body.get("window_start") else None
    we = dtime.fromisoformat(body["window_end"]) if body.get("window_end") else None
    row = await db.fetchrow(
        """INSERT INTO job_assignments (org_id, job_id, user_id, on_date, window_start, window_end)
           VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (job_id, user_id, on_date)
           DO UPDATE SET window_start=EXCLUDED.window_start, window_end=EXCLUDED.window_end, updated_at=now() RETURNING id""",
        u["org_id"], body["job_id"], body["user_id"], date.fromisoformat(body["on_date"]), ws, we)
    return {"id": str(row["id"])}

@r.delete("/dayboard/assign/{aid}")
async def unassign(aid: str, u=Depends(owner)):
    await db.execute("DELETE FROM job_assignments WHERE id=$1 AND org_id=$2", aid, u["org_id"])
    return {"ok": True}

# ---------- jobs ----------
@r.get("/jobs")
async def jobs_list(filter: str = "all", u=Depends(staff)):
    org = await svc.get_org(u["org_id"])
    require_po = (org["settings"].get("trades") or {}).get("require_customer_po")
    today = svc.today_awst()
    _, week_end = svc.week_bounds(today)
    where = "j.org_id=$1"
    args = [u["org_id"]]
    if filter == "recall_due":
        where += " AND j.recall_on IS NOT NULL AND j.recall_on <= $2 AND j.status NOT IN ('closed')"
        args.append(today)
    elif filter == "recall_week":
        where += " AND j.recall_on IS NOT NULL AND j.status NOT IN ('closed') AND j.recall_on <= $2"
        args.append(week_end)
    rows = await db.fetch(
        f"""SELECT j.*, c.name as client_name, s.name as site_name, s.address_text,
                   (SELECT count(*) FROM variations v WHERE v.job_id=j.id AND v.status='signed') as signed_vos
            FROM jobs j JOIN clients c ON c.id=j.client_id LEFT JOIN sites s ON s.id=j.site_id
            WHERE {where} ORDER BY j.code""", *args)
    for row in rows:
        row["id"] = str(row["id"])
        row["recall_due"] = bool(row["recall_on"] and row["recall_on"] <= svc.today_awst() and row["status"] != "closed")
        row["missing_po"] = bool(require_po and not row["customer_po"])
        for k in ("client_id", "site_id", "bill_to_client_id", "quote_id", "org_id"):
            row[k] = str(row[k]) if row[k] else None
        for k in ("recall_on", "starts_on", "created_at", "updated_at"):
            row[k] = str(row[k]) if row[k] else None
    return rows

@r.get("/jobs/{jid}")
async def job_detail(jid: str, u=Depends(staff)):
    j = await db.fetchrow("SELECT * FROM jobs WHERE id=$1 AND org_id=$2", jid, u["org_id"])
    if not j:
        raise HTTPException(404, "Job not found")
    org = await svc.get_org(u["org_id"])
    margin = await svc.job_margin(j, org)
    variations = await db.fetch("SELECT * FROM variations WHERE job_id=$1 ORDER BY code", jid)
    extras = await db.fetch("SELECT * FROM job_extra_lines WHERE job_id=$1 ORDER BY created_at", jid)
    receipts = await db.fetch("SELECT * FROM supplier_receipts WHERE job_id=$1 ORDER BY created_at", jid)
    docs = await db.fetch("SELECT id, kind, mime, meta, created_at FROM documents WHERE job_id=$1 ORDER BY created_at DESC", jid)
    drafts = await db.fetch("SELECT * FROM xero_drafts WHERE job_id=$1 ORDER BY created_at DESC", jid)
    client = await db.fetchrow("SELECT * FROM clients WHERE id=$1", j["client_id"])
    bill_to = await db.fetchrow("SELECT * FROM clients WHERE id=$1", j["bill_to_client_id"] or j["client_id"])
    site = await db.fetchrow("SELECT * FROM sites WHERE id=$1", j["site_id"]) if j["site_id"] else None
    def clean(x):
        return {k: (str(v) if not isinstance(v, (int, float, bool, dict, list, type(None))) else v) for k, v in x.items()}
    return {"job": clean(j), "margin": margin, "variations": [clean(v) for v in variations],
            "extras": [clean(e) for e in extras], "receipts": [clean(x) for x in receipts],
            "documents": [clean(d) for d in docs], "drafts": [clean(d) for d in drafts],
            "client": clean(client), "bill_to": clean(bill_to), "site": clean(site) if site else None,
            "missing_po": bool((org["settings"].get("trades") or {}).get("require_customer_po") and not j["customer_po"])}

@r.post("/jobs")
async def job_create(body: dict = Body(...), u=Depends(owner)):
    code = await svc.next_code("JOB", "jobs", u["org_id"])
    j = await db.fetchrow(
        """INSERT INTO jobs (org_id, client_id, site_id, bill_to_client_id, code, title, billing, quoted_cents, customer_po, starts_on, recall_on)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id, code""",
        u["org_id"], body["client_id"], body.get("site_id"), body.get("bill_to_client_id") or body["client_id"],
        code, body["title"], body.get("billing", "tm"), body.get("quoted_cents", 0), body.get("customer_po"),
        date.fromisoformat(body["starts_on"]) if body.get("starts_on") else svc.today_awst(),
        date.fromisoformat(body["recall_on"]) if body.get("recall_on") else None)
    await svc.seed_stages(u["org_id"], j["id"])
    return {"id": str(j["id"]), "code": j["code"]}

@r.patch("/jobs/{jid}")
async def job_patch(jid: str, body: dict = Body(...), u=Depends(owner)):
    allowed = {"status", "customer_po", "title", "recall_on"}
    for k, v in body.items():
        if k in allowed:
            if k == "recall_on":
                v = date.fromisoformat(v) if v else None
            await db.execute(f"UPDATE jobs SET {k}=$1, updated_at=now() WHERE id=$2 AND org_id=$3", v, jid, u["org_id"])
    return {"ok": True}

@r.post("/jobs/{jid}/prepare-draft")
async def prepare_draft(jid: str, u=Depends(owner)):
    j = await db.fetchrow("SELECT * FROM jobs WHERE id=$1 AND org_id=$2", jid, u["org_id"])
    if not j:
        raise HTTPException(404, "Job not found")
    org = await svc.get_org(u["org_id"])
    d = await svc.prepare_job_draft(j, org, u["id"])
    return {"draft_id": str(d["id"]), "purpose": d["purpose"], "total_cents": d["total_cents"], "gst_cents": d["gst_cents"],
            "attachments": d["attachments"], "status": d["status"]}

# ---------- quotes ----------
@r.get("/quotes")
async def quotes_list(filter: str = "all", u=Depends(staff)):
    today = svc.today_awst()
    rows = await db.fetch(
        """SELECT q.*, c.name as client_name, s.name as site_name,
                  (SELECT COALESCE(sum(round(ql.qty*ql.unit_cents)),0) FROM quote_lines ql WHERE ql.quote_id=q.id)::int as total_cents
           FROM quotes q JOIN clients c ON c.id=q.client_id LEFT JOIN sites s ON s.id=q.site_id
           WHERE q.org_id=$1 ORDER BY q.code DESC""", u["org_id"])
    out = []
    for row in rows:
        follow_up, overdue = svc.quote_follow_flags(row["status"], row.get("valid_until"), today)
        row["follow_up"] = follow_up
        row["overdue"] = overdue
        for k in list(row):
            if k not in ("total_cents", "deposit_bps", "follow_up", "overdue") and not isinstance(row[k], (str, int, float, bool, type(None))):
                row[k] = str(row[k])
        if filter == "follow_up" and not follow_up:
            continue
        out.append(row)
    return out

@r.get("/nudge")
async def nudge(u=Depends(staff)):
    today = svc.today_awst()
    _, week_end = svc.week_bounds(today)
    jobs = await db.fetch(
        """SELECT j.id, j.code, j.title, j.recall_on, c.name as client_name
           FROM jobs j JOIN clients c ON c.id=j.client_id
           WHERE j.org_id=$1 AND j.recall_on IS NOT NULL AND j.status NOT IN ('closed') AND j.recall_on <= $2
           ORDER BY j.recall_on, j.code""", u["org_id"], week_end)
    recalls = [{"id": str(j["id"]), "code": j["code"], "title": j["title"], "client_name": j["client_name"],
                "recall_on": str(j["recall_on"]), "overdue": j["recall_on"] <= today} for j in jobs]
    quotes = await db.fetch(
        """SELECT q.id, q.code, q.title, q.valid_until, q.status, c.name as client_name
           FROM quotes q JOIN clients c ON c.id=q.client_id
           WHERE q.org_id=$1 AND q.status='sent' AND q.valid_until IS NOT NULL AND q.valid_until <= $2
           ORDER BY q.valid_until, q.code""", u["org_id"], today + timedelta(days=7))
    qout = []
    for q in quotes:
        follow_up, overdue = svc.quote_follow_flags(q["status"], q["valid_until"], today)
        qout.append({"id": str(q["id"]), "code": q["code"], "title": q["title"], "client_name": q["client_name"],
                     "valid_until": str(q["valid_until"] or ""), "follow_up": follow_up, "overdue": overdue})
    return {"recalls": recalls, "quotes": qout}

@r.post("/demo/reset")
async def demo_reset(u=Depends(owner)):
    org = await svc.get_org(u["org_id"])
    if not org or not org["is_demo"]:
        raise HTTPException(403, "Demo reset is only available on synthetic yards")
    email = (u.get("email") or "").strip().lower()
    await seed.reset_demo_yards()
    nu = await db.fetchrow("SELECT * FROM users WHERE lower(email)=$1", email)
    if not nu:
        raise HTTPException(401, "User not found after reset")
    tok = auth.make_token(nu)
    norg = await svc.get_org(nu["org_id"])
    return {"token": tok, "user": {"id": str(nu["id"]), "name": nu["name"], "email": nu["email"], "role": nu["role"]},
            "org": {"id": str(norg["id"]), "slug": norg["slug"], "trading_name": norg["trading_name"], "is_demo": norg["is_demo"],
                    "structure": norg["structure"], "settings": norg["settings"]}}

@r.post("/quotes")
async def quote_create(body: dict = Body(...), u=Depends(owner)):
    if not body.get("client_id"):
        raise HTTPException(400, "client_id is required")
    lines_in = body.get("lines") or []
    if any(not ln.get("description") or ln.get("unit_cents") is None for ln in lines_in):
        raise HTTPException(400, "each line needs description and unit_cents")
    org = await svc.get_org(u["org_id"])
    dep = body.get("deposit_bps")
    if dep is None:
        dep = (org["settings"].get("trades") or {}).get("default_deposit_bps") or 0
    code = await svc.next_code("Q", "quotes", u["org_id"])
    q = await db.fetchrow(
        """INSERT INTO quotes (org_id, client_id, site_id, bill_to_client_id, code, title, valid_until, deposit_bps)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, code""",
        u["org_id"], body["client_id"], body.get("site_id"), body.get("bill_to_client_id") or body["client_id"],
        code, body.get("title", ""), date.fromisoformat(body["valid_until"]) if body.get("valid_until") else svc.today_awst() + timedelta(days=14), dep)
    for i, ln in enumerate(lines_in):
        await db.execute("INSERT INTO quote_lines (org_id, quote_id, description, qty, unit_cents, sort) VALUES ($1,$2,$3,$4,$5,$6)",
                         u["org_id"], q["id"], ln["description"], float(ln.get("qty", 1)), int(ln["unit_cents"]), i)
    return {"id": str(q["id"]), "code": q["code"]}

@r.get("/quotes/{qid}")
async def quote_detail(qid: str, u=Depends(staff)):
    q = await db.fetchrow("SELECT * FROM quotes WHERE id=$1 AND org_id=$2", qid, u["org_id"])
    if not q:
        raise HTTPException(404, "Quote not found")
    lines = await db.fetch("SELECT * FROM quote_lines WHERE quote_id=$1 ORDER BY sort", qid)
    sends = await db.fetch("SELECT id, to_email, expires_at, emailed_at, accepted_at, revoked_at FROM quote_sends WHERE quote_id=$1 ORDER BY created_at DESC", qid)
    client = await db.fetchrow("SELECT * FROM clients WHERE id=$1", q["client_id"])
    total = await svc.quote_total_cents(qid)
    def clean(x): return {k: (v if isinstance(v, (int, float, bool, dict, list, type(None))) else str(v)) for k, v in x.items()}
    return {"quote": clean(q), "lines": [clean(l) for l in lines], "sends": [clean(s) for s in sends],
            "client": clean(client), "total_cents": total, "gst_cents": gst_cents(total)}

@r.post("/quotes/{qid}/send")
async def quote_send(qid: str, body: dict = Body(default={}), u=Depends(owner)):
    q = await db.fetchrow("SELECT * FROM quotes WHERE id=$1 AND org_id=$2", qid, u["org_id"])
    if not q:
        raise HTTPException(404, "Quote not found")
    if q["status"] in ("accepted", "declined"):
        raise HTTPException(409, f"Quote already {q['status']}")
    client = await db.fetchrow("SELECT * FROM clients WHERE id=$1", q["bill_to_client_id"] or q["client_id"])
    to_email = body.get("to_email") or (client and client.get("email"))
    if not to_email:
        raise HTTPException(400, "NO CUSTOMER EMAIL — add an email to the client or supply one")
    tok, th = svc.token_pair()
    from datetime import datetime, timezone
    send = await db.fetchrow(
        "INSERT INTO quote_sends (org_id, quote_id, to_email, token_hash, expires_at, emailed_at) VALUES ($1,$2,$3,$4,now() + interval '7 days', now()) RETURNING id",
        u["org_id"], qid, to_email, th)
    await db.execute("UPDATE quotes SET status='sent', updated_at=now() WHERE id=$1 AND status='draft'", qid)
    await svc.queue_mail(u["org_id"], to_email, f"Quote {q['code']} — {q['title']}", "quote_send", q["id"])
    return {"send_id": str(send["id"]), "accept_path": f"/q/{tok}", "to_email": to_email}

@r.post("/quotes/{qid}/mark-accepted")
async def quote_mark_accepted(qid: str, body: dict = Body(default={}), u=Depends(owner)):
    q = await db.fetchrow("SELECT * FROM quotes WHERE id=$1 AND org_id=$2", qid, u["org_id"])
    if not q:
        raise HTTPException(404, "Quote not found")
    job, draft, _ = await svc.accept_quote(q, body.get("name") or f"Marked accepted by {u['name']}", method="token")
    return {"job_id": str(job["id"]), "job_code": job["code"], "deposit_draft_id": str(draft["id"]) if draft else None}

@r.get("/quotes/{qid}/pdf")
async def quote_pdf_dl(qid: str, auth_q: str = Query(None, alias="auth"), authorization: str = Header(None)):
    import routes_fp
    payload = routes_fp._decode(auth_q, authorization)
    q = await db.fetchrow("SELECT * FROM quotes WHERE id=$1 AND org_id=$2", qid, payload["org_id"])
    if not q:
        raise HTTPException(404, "Quote not found")
    org = await svc.get_org(q["org_id"])
    lines = await db.fetch("SELECT * FROM quote_lines WHERE quote_id=$1 ORDER BY sort", qid)
    client = await db.fetchrow("SELECT * FROM clients WHERE id=$1", q["client_id"])
    site = await db.fetchrow("SELECT * FROM sites WHERE id=$1", q["site_id"]) if q["site_id"] else None
    data = svc.render_pdf(q["org_id"], pdfs.quote_pdf, org, q, lines, client, site)
    return Response(content=data, media_type="application/pdf")

# ---------- inbox ----------
@r.get("/inbox")
async def inbox(status: str = "needs_verify", u=Depends(staff)):
    where = "e.org_id=$1" + ("" if status == "all" else " AND e.status=$2")
    args = [u["org_id"]] + ([] if status == "all" else [status])
    rows = await db.fetch(
        f"""SELECT e.*, d.mime, d.uploaded_by, cu.name as crew_name, j.code as job_code, j.title as job_title
            FROM docket_extractions e JOIN documents d ON d.id=e.document_id
            LEFT JOIN users cu ON cu.id=d.uploaded_by LEFT JOIN jobs j ON j.id=e.job_id
            WHERE {where} ORDER BY e.created_at DESC""", *args)
    for row in rows:
        for k in list(row):
            if not isinstance(row[k], (int, float, bool, dict, list, type(None), str)):
                row[k] = str(row[k])
    return rows

@r.post("/extractions/{eid}/verify")
async def verify_extraction(eid: str, body: dict = Body(default={}), u=Depends(staff)):
    e = await db.fetchrow("SELECT * FROM docket_extractions WHERE id=$1 AND org_id=$2", eid, u["org_id"])
    if not e:
        raise HTTPException(404, "Extraction not found")
    if e["status"] == "rejected":
        raise HTTPException(409, "Extraction was rejected")
    if e["kind"] == "timesheet_voice":
        if not body.get("started_at") or not body.get("ended_at"):
            raise HTTPException(400, "started_at and ended_at required to verify a voice timesheet")
        doc = await db.fetchrow("SELECT uploaded_by FROM documents WHERE id=$1", e["document_id"])
        job_id = body.get("job_id") or (str(e["job_id"]) if e["job_id"] else None)
        if not job_id or not doc or not doc["uploaded_by"]:
            raise HTTPException(400, "Voice timesheet needs a job and an uploading crew member")
        started = datetime.fromisoformat(body["started_at"])
        ended = datetime.fromisoformat(body["ended_at"])
        if ended <= started:
            raise HTTPException(400, "ended_at must be after started_at")
        te = await db.fetchrow(
            "INSERT INTO time_entries (org_id, job_id, user_id, started_at, ended_at, note) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
            u["org_id"], job_id, doc["uploaded_by"], started, ended, body.get("note") or "voice timesheet (verified)")
        await db.execute("UPDATE docket_extractions SET status='verified', job_id=$1, verified_by=$2, updated_at=now() WHERE id=$3",
                         job_id, u["id"], eid)
        minutes = int((ended - started).total_seconds() // 60)
        return {"time_entry_id": str(te["id"]), "minutes": minutes}
    supplier = body.get("supplier") or e["supplier"] or "other"
    if supplier not in ("reece", "middys", "rexel", "other"):
        supplier = "other"
    total = int(body.get("total_cents") if body.get("total_cents") is not None else (e["total_cents"] or 0))
    gst = int(body.get("gst_cents") if body.get("gst_cents") is not None else (e["gst_cents"] or 0))
    num = body.get("docket_number") or e["docket_number"]
    job_id = body.get("job_id") or (str(e["job_id"]) if e["job_id"] else None)
    rdate = date.fromisoformat(body["receipt_date"]) if body.get("receipt_date") else (e["receipt_date"] or svc.today_awst())
    await db.execute(
        """UPDATE docket_extractions SET status='verified', supplier=$1, total_cents=$2, gst_cents=$3, docket_number=$4,
           receipt_date=$5, job_id=$6, verified_by=$7, updated_at=now() WHERE id=$8""",
        supplier, total, gst, num, rdate, job_id, u["id"], eid)
    rec = await db.fetchrow(
        """INSERT INTO supplier_receipts (org_id, job_id, extraction_id, supplier, docket_number, total_cents, gst_cents, receipt_date, document_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (extraction_id) DO UPDATE SET supplier=EXCLUDED.supplier, docket_number=EXCLUDED.docket_number,
             total_cents=EXCLUDED.total_cents, gst_cents=EXCLUDED.gst_cents, receipt_date=EXCLUDED.receipt_date,
             job_id=EXCLUDED.job_id, updated_at=now() RETURNING *""",
        u["org_id"], job_id, eid, supplier, num, total, gst, rdate, e["document_id"])
    bill = None
    if body.get("create_bill_draft"):
        payload = {"Type": "ACCPAY", "Status": "DRAFT", "Contact": {"Name": supplier.upper()},
                   "LineItems": [{"Description": f"Docket {num or ''} — {supplier}", "Quantity": 1,
                                  "UnitAmount": (total - gst) / 100, "TaxAmount": gst / 100, "TaxType": "INPUT"}],
                   "Reference": num or str(rec["id"])}
        bill = await db.fetchrow(
            """INSERT INTO xero_drafts (org_id, job_id, purpose, status, total_cents, gst_cents, payload, attachments)
               VALUES ($1,$2,'bill','pending_push',$3,$4,$5,$6) RETURNING id""",
            u["org_id"], job_id, total, gst, payload, [{"document_id": str(e["document_id"]), "kind": "docket_photo"}])
    return {"receipt_id": str(rec["id"]), "bill_draft_id": str(bill["id"]) if bill else None}

@r.post("/extractions/{eid}/reject")
async def reject_extraction(eid: str, u=Depends(staff)):
    await db.execute("UPDATE docket_extractions SET status='rejected', verified_by=$1, updated_at=now() WHERE id=$2 AND org_id=$3 AND status='needs_verify'", u["id"], eid, u["org_id"])
    return {"ok": True}

# ---------- ledger drafts ----------
@r.get("/xero/drafts")
async def drafts_list(u=Depends(staff)):
    rows = await db.fetch(
        """SELECT x.*, j.code as job_code, j.title as job_title, c.name as contact_name
           FROM xero_drafts x LEFT JOIN jobs j ON j.id=x.job_id LEFT JOIN clients c ON c.id=x.contact_client_id
           WHERE x.org_id=$1 ORDER BY x.created_at DESC""", u["org_id"])
    for row in rows:
        for k in list(row):
            if not isinstance(row[k], (int, float, bool, dict, list, type(None), str)):
                row[k] = str(row[k])
    return rows

@r.post("/xero/drafts/{did}/push")
async def push_draft(did: str, u=Depends(staff)):
    d, err = await xerostub.push_draft(did, u["org_id"])
    if err:
        raise HTTPException(400, err)
    return {"id": str(d["id"]), "status": d["status"], "xero_id": d["xero_id"]}

# ---------- directory ----------
@r.get("/directory")
async def directory(u=Depends(staff)):
    clients = await db.fetch("SELECT id, name, abn, email, xero_contact_id FROM clients WHERE org_id=$1 ORDER BY name", u["org_id"])
    sites = await db.fetch("SELECT id, client_id, name, address_text FROM sites WHERE org_id=$1 ORDER BY name", u["org_id"])
    users = await db.fetch("SELECT id, role, name, email, labour_cents_per_hour, charge_cents_per_hour FROM users WHERE org_id=$1 ORDER BY role, name", u["org_id"])
    assets = await db.fetch("SELECT id, kind, name, code FROM assets WHERE org_id=$1 ORDER BY code", u["org_id"])
    def cl(rows):
        return [{k: (v if isinstance(v, (int, float, bool, type(None), str)) else str(v)) for k, v in x.items()} for x in rows]
    return {"clients": cl(clients), "sites": cl(sites), "users": cl(users), "assets": cl(assets)}

@r.post("/clients")
async def client_create(body: dict = Body(...), u=Depends(owner)):
    c = await db.fetchrow("INSERT INTO clients (org_id, name, abn, email) VALUES ($1,$2,$3,$4) RETURNING id", u["org_id"], body["name"], body.get("abn"), body.get("email"))
    return {"id": str(c["id"])}

@r.post("/sites")
async def site_create(body: dict = Body(...), u=Depends(owner)):
    s = await db.fetchrow("INSERT INTO sites (org_id, client_id, name, address_text) VALUES ($1,$2,$3,$4) RETURNING id", u["org_id"], body["client_id"], body["name"], body.get("address_text"))
    return {"id": str(s["id"])}

# ---------- modules / not commissioned ----------
@r.get("/modules")
async def modules(u=Depends(staff)):
    org = await svc.get_org(u["org_id"])
    return org["modules"]

for slug in ("civil", "hire", "sor", "fab", "fleet"):
    async def _nc(slug=slug):
        raise HTTPException(501, f"{slug.upper()} — NOT COMMISSIONED")
    r.add_api_route(f"/{slug}", _nc, methods=["GET", "POST"])
    r.add_api_route(f"/{slug}/{{rest:path}}", _nc, methods=["GET", "POST"])

@r.get("/mail-outbox")
async def mail_outbox(u=Depends(staff)):
    rows = await db.fetch("SELECT * FROM mail_outbox WHERE org_id=$1 ORDER BY created_at DESC LIMIT 100", u["org_id"])
    return [{k: (v if isinstance(v, (int, float, bool, type(None), str, dict, list)) else str(v)) for k, v in x.items()} for x in rows]
