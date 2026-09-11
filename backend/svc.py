import os, uuid, math, base64, hashlib, secrets, tempfile
from datetime import datetime, timezone, timedelta, date
from zoneinfo import ZoneInfo
from fastapi import HTTPException
import db, pdfs, storage
from money import gst_cents, line_total, markup, time_cents

PERTH = ZoneInfo("Australia/Perth")
MIME = {"png": "image/png", "jpg": "image/jpeg", "pdf": "application/pdf", "webm": "audio/webm", "mp3": "audio/mpeg"}

def today_awst():
    return datetime.now(PERTH).date()

def week_bounds(d=None):
    d = d or today_awst()
    week_start = d - timedelta(days=d.weekday())
    week_end = week_start + timedelta(days=6)
    return week_start, week_end

def cert_prefix(org):
    return ((org.get("settings") or {}).get("trades") or {}).get("cert_prefix") or "ES"

def next_cert_from_existing(cert_nos, prefix="ES"):
    prefix = (prefix or "ES").rstrip("-")
    n = 0
    head = prefix.upper() + "-"
    for raw in cert_nos:
        s = (raw or "").strip()
        if not s.upper().startswith(head):
            continue
        tail = s[len(prefix) + 1:]
        if tail.isdigit():
            n = max(n, int(tail))
    return f"{prefix}-{n + 1:04d}"

def allocate_cert_no(org_id, cert_no):
    s = (cert_no or "").strip()
    if not s:
        raise HTTPException(400, "cert_no is required")
    return s

async def next_cert_no(org_id):
    org = await get_org(org_id)
    prefix = cert_prefix(org)
    rows = await db.fetch("SELECT cert_no FROM certificates WHERE org_id=$1 AND cert_no IS NOT NULL", org_id)
    return next_cert_from_existing([r["cert_no"] for r in rows], prefix)

def quote_follow_flags(status, valid_until, today=None):
    today = today or today_awst()
    vu = valid_until
    if isinstance(vu, str):
        vu = date.fromisoformat(vu) if vu else None
    sent = status == "sent" and vu is not None
    overdue = bool(sent and vu < today)
    follow_up = bool(sent and vu <= today + timedelta(days=7))
    return follow_up, overdue

def token_pair():
    tok = secrets.token_urlsafe(32)
    return tok, hashlib.sha256(tok.encode()).hexdigest()

def hash_token(tok):
    return hashlib.sha256(tok.encode()).hexdigest()

async def next_code(prefix, table, org_id, job_id=None):
    if job_id:
        n = await db.fetchval(f"SELECT count(*) FROM {table} WHERE job_id=$1", job_id)
    else:
        n = await db.fetchval(f"SELECT count(*) FROM {table} WHERE org_id=$1", org_id)
    return f"{prefix}-{n + 1:03d}"

async def get_org(org_id):
    return await db.fetchrow("SELECT * FROM organisations WHERE id=$1", org_id)

async def quote_total_cents(quote_id):
    rows = await db.fetch("SELECT qty, unit_cents FROM quote_lines WHERE quote_id=$1", quote_id)
    return sum(line_total(r["unit_cents"], float(r["qty"])) for r in rows)

async def queue_mail(org_id, to_email, subject, kind, ref_id=None):
    if not to_email:
        return None
    return await db.fetchrow(
        "INSERT INTO mail_outbox (org_id, to_email, subject, kind, ref_id) VALUES ($1,$2,$3,$4,$5) RETURNING *",
        org_id, to_email, subject, kind, ref_id)

def save_bytes(org_id, data, ext, content_type=None):
    ct = content_type or MIME.get(ext, "application/octet-stream")
    path = f"{storage.APP_NAME}/{org_id}/{uuid.uuid4().hex}.{ext}"
    return storage.put_object(path, data, ct)["path"]

def render_pdf(org_id, render_fn, *args, **kwargs):
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as t:
        p = t.name
    render_fn(p, *args, **kwargs)
    with open(p, "rb") as f:
        data = f.read()
    os.unlink(p)
    return data

async def add_document(org_id, job_id, kind, file_path, mime, uploaded_by=None, meta=None):
    return await db.fetchrow(
        "INSERT INTO documents (org_id, job_id, kind, file_path, mime, uploaded_by, meta) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *",
        org_id, job_id, kind, file_path, mime, uploaded_by, meta or {})

async def seed_stages(org_id, job_id):
    for i, s in enumerate(["quoted", "on_site", "variations", "complete"]):
        await db.execute("INSERT INTO job_stages (org_id, job_id, name, sort) VALUES ($1,$2,$3,$4)", org_id, job_id, s, i)

def compress_image(data, max_edge=1600, quality=70):
    from PIL import Image
    import io
    try:
        img = Image.open(io.BytesIO(data))
        img = img.convert("RGB")
        w, h = img.size
        if max(w, h) > max_edge:
            r = max_edge / max(w, h)
            img = img.resize((int(w * r), int(h * r)))
        out = io.BytesIO()
        img.save(out, "JPEG", quality=quality)
        return out.getvalue()
    except Exception:
        return data

# ---------- quote acceptance ----------
async def accept_quote(quote, accepted_by_name, signature_b64=None, method="token", send_id=None):
    if quote["status"] == "accepted":
        raise HTTPException(409, "Quote already accepted")
    if quote["status"] == "declined":
        raise HTTPException(409, "Quote was declined")
    org = await get_org(quote["org_id"])
    total = await quote_total_cents(quote["id"])
    deposit = math.floor(total * (quote["deposit_bps"] or 0) / 10000 + 0.5)
    code = await next_code("JOB", "jobs", quote["org_id"])
    sig_id = None
    if signature_b64:
        img = base64.b64decode(signature_b64.split(",")[-1])
        p = save_bytes(quote["org_id"], img, "png")
        sig = await db.fetchrow("INSERT INTO signatures (org_id, name, method, image_path) VALUES ($1,$2,$3,$4) RETURNING id",
                                quote["org_id"], accepted_by_name, method, p)
        sig_id = sig["id"]
    else:
        sig = await db.fetchrow("INSERT INTO signatures (org_id, name, method) VALUES ($1,$2,$3) RETURNING id",
                                quote["org_id"], accepted_by_name, method)
        sig_id = sig["id"]
    job = await db.fetchrow(
        """INSERT INTO jobs (org_id, client_id, site_id, bill_to_client_id, quote_id, code, title, status, billing, quoted_cents, deposit_cents, starts_on)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'scheduled','quoted',$8,$9,$10) RETURNING *""",
        quote["org_id"], quote["client_id"], quote["site_id"], quote["bill_to_client_id"] or quote["client_id"],
        quote["id"], code, quote["title"] or f"Works per {quote['code']}", total, deposit, today_awst())
    await seed_stages(quote["org_id"], job["id"])
    await db.execute("UPDATE quotes SET status='accepted', job_id=$1, updated_at=now() WHERE id=$2", job["id"], quote["id"])
    if send_id:
        await db.execute("UPDATE quote_sends SET accepted_at=now(), updated_at=now() WHERE id=$1", send_id)
    await db.execute("UPDATE quote_sends SET revoked_at=now() WHERE quote_id=$1 AND accepted_at IS NULL AND revoked_at IS NULL", quote["id"])
    draft = None
    if deposit > 0:
        contact = quote["bill_to_client_id"] or quote["client_id"]
        gst = gst_cents(deposit)
        payload = {
            "Type": "ACCREC", "Status": "DRAFT",
            "Contact": {"ContactID": None, "clientRef": str(contact)},
            "LineItems": [{"Description": f"Deposit on acceptance — {quote['code']}", "Quantity": 1,
                           "UnitAmount": deposit / 100, "TaxAmount": gst / 100, "TaxType": "OUTPUT"}],
            "Reference": f"{code} deposit",
        }
        draft = await db.fetchrow(
            """INSERT INTO xero_drafts (org_id, job_id, quote_id, purpose, status, contact_client_id, total_cents, gst_cents, payload, attachments)
               VALUES ($1,$2,$3,'deposit','pending_push',$4,$5,$6,$7,'[]') RETURNING *""",
            quote["org_id"], job["id"], quote["id"], contact, deposit, gst, payload)
    client = await db.fetchrow("SELECT * FROM clients WHERE id=$1", quote["client_id"])
    owner_copy = (org["settings"].get("trades") or {}).get("owner_copy_email")
    await queue_mail(quote["org_id"], client.get("email"), f"Quote {quote['code']} accepted", "quote_accepted", quote["id"])
    if owner_copy:
        await queue_mail(quote["org_id"], owner_copy, f"Quote {quote['code']} accepted", "quote_accepted_copy", quote["id"])
    return job, draft, sig_id

# ---------- variation signing ----------
async def sign_variation(variation, name, method, signature_b64=None, send_id=None):
    if variation["status"] == "signed":
        raise HTTPException(409, "Variation already signed")
    if variation["status"] == "rejected":
        raise HTTPException(409, "Variation was rejected")
    org = await get_org(variation["org_id"])
    job = await db.fetchrow("SELECT * FROM jobs WHERE id=$1", variation["job_id"])
    img_path = None
    if signature_b64:
        img_path = save_bytes(variation["org_id"], base64.b64decode(signature_b64.split(",")[-1]), "png")
    sig = await db.fetchrow("INSERT INTO signatures (org_id, name, method, image_path) VALUES ($1,$2,$3,$4) RETURNING *",
                            variation["org_id"], name, method, img_path)
    await db.execute("UPDATE variations SET status='signed', signature_id=$1, updated_at=now() WHERE id=$2", sig["id"], variation["id"])
    if send_id:
        await db.execute("UPDATE variation_sends SET signed_at=now(), updated_at=now() WHERE id=$1", send_id)
    await db.execute("UPDATE variation_sends SET revoked_at=now(), updated_at=now() WHERE variation_id=$1 AND signed_at IS NULL AND revoked_at IS NULL", variation["id"])
    v = dict(variation); v["status"] = "signed"
    pdf_data = render_pdf(variation["org_id"], pdfs.variation_pdf, org, job, v, signer=name,
                          signed_at=datetime.now(PERTH).strftime("%d %b %Y %H:%M AWST"))
    pdf_path = save_bytes(variation["org_id"], pdf_data, "pdf")
    doc = await add_document(variation["org_id"], variation["job_id"], "variation_pdf", pdf_path, "application/pdf",
                             meta={"variation_id": str(variation["id"]), "signed": True})
    bill_to = await db.fetchrow("SELECT * FROM clients WHERE id=$1", job["bill_to_client_id"] or job["client_id"])
    recipient = None
    if send_id:
        s = await db.fetchrow("SELECT to_email FROM variation_sends WHERE id=$1", send_id)
        recipient = s and s["to_email"]
    recipient = recipient or (bill_to and bill_to.get("email"))
    await queue_mail(variation["org_id"], recipient, f"Signed variation {variation['code']} — {job['code']}", "variation_signed_copy", variation["id"])
    owner_copy = (org["settings"].get("trades") or {}).get("owner_copy_email")
    if owner_copy:
        await queue_mail(variation["org_id"], owner_copy, f"Signed variation {variation['code']} — {job['code']}", "variation_signed_copy", variation["id"])
    return sig, doc

# ---------- margin ----------
async def job_margin(job, org):
    trades = org["settings"].get("trades") or {}
    mbps = trades.get("materials_markup_bps") or 0
    times = await db.fetch("""SELECT te.started_at, te.ended_at, u.labour_cents_per_hour, u.charge_cents_per_hour
                              FROM time_entries te JOIN users u ON u.id=te.user_id WHERE te.job_id=$1 AND te.ended_at IS NOT NULL""", job["id"])
    minutes = 0; labour_cost = 0; labour_charge = 0
    for t in times:
        m = int((t["ended_at"] - t["started_at"]).total_seconds() // 60)
        minutes += m
        labour_cost += time_cents(m, t["labour_cents_per_hour"])
        labour_charge += time_cents(m, t["charge_cents_per_hour"])
    receipts = await db.fetchval("SELECT COALESCE(sum(total_cents),0) FROM supplier_receipts WHERE job_id=$1", job["id"]) or 0
    signed_vos = await db.fetchval("SELECT COALESCE(sum(amount_cents),0) FROM variations WHERE job_id=$1 AND status='signed'", job["id"]) or 0
    extras = await db.fetchval("SELECT COALESCE(sum(unit_cents*qty),0) FROM job_extra_lines WHERE job_id=$1", job["id"]) or 0
    cost = labour_cost + receipts
    if job["billing"] == "quoted":
        revenue = job["quoted_cents"] + signed_vos + extras
    else:
        revenue = labour_charge + signed_vos + extras + markup(receipts, mbps)
    return {"revenue_cents": revenue, "cost_cents": cost, "margin_cents": revenue - cost,
            "minutes": minutes, "labour_cost_cents": labour_cost, "labour_charge_cents": labour_charge,
            "receipts_cents": receipts, "signed_vo_cents": signed_vos, "extras_cents": extras}

# ---------- prepare xero draft ----------
async def prepare_job_draft(job, org, user_id):
    trades = org["settings"].get("trades") or {}
    if trades.get("require_customer_po") and not job["customer_po"]:
        raise HTTPException(400, "MISSING PO — customer PO required before drafting")
    contact = job["bill_to_client_id"] or job["client_id"]
    signed_vos = await db.fetch("SELECT * FROM variations WHERE job_id=$1 AND status='signed' ORDER BY code", job["id"])
    extras = await db.fetch("SELECT * FROM job_extra_lines WHERE job_id=$1 ORDER BY created_at", job["id"])
    lines = []
    total = 0
    if job["billing"] == "quoted":
        purpose = "final"
        base = job["quoted_cents"] - job["deposit_cents"]
        lines.append({"Description": f"{job['code']} {job['title']} — contract works" + (f" (less deposit ${job['deposit_cents']/100:,.2f})" if job["deposit_cents"] else ""),
                      "Quantity": 1, "UnitAmount": base / 100, "TaxAmount": gst_cents(base) / 100, "TaxType": "OUTPUT"})
        total += base
    else:
        purpose = "tm"
        m = await job_margin(job, org)
        if m["labour_charge_cents"]:
            lines.append({"Description": f"Labour — {m['minutes']} min @ charge rates", "Quantity": 1,
                          "UnitAmount": m["labour_charge_cents"] / 100, "TaxAmount": gst_cents(m["labour_charge_cents"]) / 100, "TaxType": "OUTPUT"})
            total += m["labour_charge_cents"]
        mbps = trades.get("materials_markup_bps") or 0
        if m["receipts_cents"]:
            mat = markup(m["receipts_cents"], mbps)
            lines.append({"Description": f"Materials (incl {mbps/100:g}% markup)", "Quantity": 1,
                          "UnitAmount": mat / 100, "TaxAmount": gst_cents(mat) / 100, "TaxType": "OUTPUT"})
            total += mat
    for v in signed_vos:
        lines.append({"Description": f"Variation {v['code']} — {v['title']}", "Quantity": 1,
                      "UnitAmount": v["amount_cents"] / 100, "TaxAmount": gst_cents(v["amount_cents"]) / 100, "TaxType": "OUTPUT"})
        total += v["amount_cents"]
    for e in extras:
        amt = e["unit_cents"] * e["qty"]
        lines.append({"Description": f"{e['kind'].title()} — {e['description'] or e['kind']}", "Quantity": e["qty"],
                      "UnitAmount": e["unit_cents"] / 100, "TaxAmount": gst_cents(amt) / 100, "TaxType": "OUTPUT"})
        total += amt
    gst = sum(gst_cents(line_total(int(l["UnitAmount"] * 100), l["Quantity"])) for l in lines)
    attachments = []
    vo_docs = await db.fetch("""SELECT id, kind FROM documents WHERE job_id=$1 AND kind='variation_pdf' AND (meta->>'signed')='true'""", job["id"])
    attachments += [{"document_id": str(d["id"]), "kind": "variation_pdf"} for d in vo_docs]
    photos = await db.fetch("SELECT id FROM documents WHERE job_id=$1 AND kind='after_photo' ORDER BY created_at DESC LIMIT 5", job["id"])
    attachments += [{"document_id": str(p["id"]), "kind": "after_photo"} for p in photos]
    payload = {"Type": "ACCREC", "Status": "DRAFT", "Contact": {"ContactID": None, "clientRef": str(contact)},
               "LineItems": lines, "Reference": job["code"]}
    draft = await db.fetchrow(
        """INSERT INTO xero_drafts (org_id, job_id, quote_id, purpose, status, contact_client_id, total_cents, gst_cents, payload, attachments)
           VALUES ($1,$2,$3,$4,'pending_push',$5,$6,$7,$8,$9) RETURNING *""",
        job["org_id"], job["id"], job["quote_id"], purpose, contact, total, gst, payload, attachments)
    await db.execute("UPDATE jobs SET status='ready_to_invoice', updated_at=now() WHERE id=$1 AND status NOT IN ('draft_in_ledger','closed')", job["id"])
    return draft
