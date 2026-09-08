import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas as pdfcanvas

AMBER = (0.96, 0.62, 0.04)
INK = (0.06, 0.08, 0.1)

def _letterhead(c, org, doc_title):
    w, h = A4
    c.setFillColorRGB(*INK)
    c.rect(0, h - 34 * mm, w, 34 * mm, fill=1, stroke=0)
    c.setFillColorRGB(*AMBER)
    c.rect(0, h - 35 * mm, w, 1 * mm, fill=1, stroke=0)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(18 * mm, h - 16 * mm, org["trading_name"].upper())
    c.setFont("Helvetica", 8)
    c.setFillColorRGB(0.7, 0.75, 0.8)
    c.drawString(18 * mm, h - 22 * mm, f"{org['legal_name']}  ·  ABN {org.get('abn') or '—'}  ·  {org.get('timezone','Australia/Perth')}")
    c.setFillColorRGB(*AMBER)
    c.setFont("Helvetica-Bold", 11)
    c.drawRightString(w - 18 * mm, h - 16 * mm, doc_title.upper())
    c.setFont("Helvetica", 7)
    c.drawRightString(w - 18 * mm, h - 22 * mm, "GST 10% INCLUDED WHERE STATED — THIS IS NOT AN INVOICE")
    return h - 45 * mm

def _money(cents):
    return f"${cents / 100:,.2f}"

def quote_pdf(path, org, quote, lines, client, site=None):
    c = pdfcanvas.Canvas(path, pagesize=A4)
    w, _ = A4
    y = _letterhead(c, org, f"QUOTE {quote['code']}")
    c.setFillColorRGB(0, 0, 0)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(18 * mm, y, quote.get("title") or "Works quotation")
    y -= 7 * mm
    c.setFont("Helvetica", 9)
    c.drawString(18 * mm, y, f"To: {client['name']}  ·  ABN {client.get('abn') or '—'}")
    if site:
        y -= 5 * mm
        c.drawString(18 * mm, y, f"Site: {site['name']} — {site.get('address_text') or ''}")
    if quote.get("valid_until"):
        y -= 5 * mm
        c.drawString(18 * mm, y, f"Valid until: {quote['valid_until']}")
    y -= 10 * mm
    subtotal = 0
    c.setFont("Helvetica-Bold", 9)
    c.drawString(18 * mm, y, "DESCRIPTION"); c.drawRightString(w - 60 * mm, y, "QTY"); c.drawRightString(w - 18 * mm, y, "AMOUNT (ex GST)")
    y -= 6 * mm
    c.setFont("Helvetica", 9)
    for ln in lines:
        amt = int(round(float(ln["qty"]) * ln["unit_cents"]))
        subtotal += amt
        c.drawString(18 * mm, y, ln["description"][:80])
        c.drawRightString(w - 60 * mm, y, f"{float(ln['qty']):g}")
        c.drawRightString(w - 18 * mm, y, _money(amt))
        y -= 5.5 * mm
        if y < 40 * mm:
            c.showPage(); y = 270 * mm
    import math
    gst = math.floor(subtotal * 0.10 + 0.5)
    y -= 4 * mm
    c.setFont("Helvetica-Bold", 10)
    c.drawRightString(w - 18 * mm, y, f"Subtotal {_money(subtotal)}"); y -= 6 * mm
    c.drawRightString(w - 18 * mm, y, f"GST 10% {_money(gst)}"); y -= 6 * mm
    c.setFillColorRGB(*AMBER)
    c.drawRightString(w - 18 * mm, y, f"TOTAL {_money(subtotal + gst)}")
    if quote.get("deposit_bps"):
        y -= 8 * mm
        c.setFillColorRGB(0, 0, 0); c.setFont("Helvetica", 9)
        dep = math.floor(subtotal * quote["deposit_bps"] / 10000 + 0.5)
        c.drawRightString(w - 18 * mm, y, f"Deposit on acceptance ({quote['deposit_bps'] / 100:g}%): {_money(dep)} ex GST")
    c.setFont("Helvetica", 7); c.setFillColorRGB(0.4, 0.4, 0.4)
    c.drawString(18 * mm, 20 * mm, "This quote is not an invoice. Acceptance authorises the works described above only.")
    c.save()

def variation_pdf(path, org, job, variation, signer=None, signed_at=None):
    c = pdfcanvas.Canvas(path, pagesize=A4)
    w, _ = A4
    y = _letterhead(c, org, f"VARIATION {variation['code']}")
    c.setFillColorRGB(0, 0, 0)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(18 * mm, y, f"Job {job['code']} — {job['title']}")
    y -= 10 * mm
    c.setFont("Helvetica", 10)
    c.drawString(18 * mm, y, variation["title"][:100])
    y -= 8 * mm
    import math
    gst = math.floor(variation["amount_cents"] * 0.10 + 0.5)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(18 * mm, y, f"Amount: {_money(variation['amount_cents'])} ex GST  ·  GST {_money(gst)}  ·  Total {_money(variation['amount_cents'] + gst)}")
    y -= 15 * mm
    if signer:
        c.setFillColorRGB(*AMBER); c.setFont("Helvetica-Bold", 10)
        c.drawString(18 * mm, y, f"SIGNED by {signer}  ·  {signed_at or ''}")
    else:
        c.setFont("Helvetica", 9)
        c.drawString(18 * mm, y, "Signature: ____________________________   Name: ____________________   Date: ____________")
    c.setFont("Helvetica", 7); c.setFillColorRGB(0.4, 0.4, 0.4)
    c.drawString(18 * mm, 20 * mm, "Same-day extra authorised against the above job. This is not an invoice.")
    c.save()

def pack_pdf(path, org, job, client, site, variations, extras, receipts, certs=None):
    certs = certs or []
    c = pdfcanvas.Canvas(path, pagesize=A4)
    y = _letterhead(c, org, f"JOB PACK {job['code']}")
    c.setFillColorRGB(0, 0, 0)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(18 * mm, y, job["title"]); y -= 7 * mm
    c.setFont("Helvetica", 9)
    for line in [f"Client: {client['name']}", f"Site: {(site or {}).get('name','—')} {(site or {}).get('address_text','') or ''}",
                 f"Status: {job['status']}  ·  Billing: {job['billing']}",
                 f"Variations: {len(variations)}  ·  Extras: {len(extras)}  ·  Receipts: {len(receipts)}  ·  Certificates: {len(certs)}"]:
        c.drawString(18 * mm, y, line); y -= 5.5 * mm
    y -= 4 * mm
    for v in variations:
        c.drawString(18 * mm, y, f"{v['code']}  {v['title'][:60]}  {_money(v['amount_cents'])}  [{v['status'].upper()}]"); y -= 5 * mm
    if certs:
        y -= 4 * mm
        c.setFont("Helvetica-Bold", 9); c.drawString(18 * mm, y, "CERTIFICATES"); y -= 5.5 * mm
        c.setFont("Helvetica", 9)
        for ct in certs:
            c.drawString(18 * mm, y, f"{ct['name']}  ·  {('emailed to ' + ct['emailed_to']) if ct.get('emailed_to') else ct['status']}"); y -= 5 * mm
    c.save()

def day_sheet_pdf(path, org, d, jobs):
    c = pdfcanvas.Canvas(path, pagesize=A4)
    w, _ = A4
    y = _letterhead(c, org, f"DAY SHEET {d}")
    if not jobs:
        c.setFillColorRGB(0.4, 0.4, 0.4); c.setFont("Helvetica-Bold", 14)
        c.drawString(18 * mm, y, "NO JOBS THIS AWST DAY")
    for j in jobs:
        c.setFillColorRGB(*AMBER); c.setFont("Helvetica-Bold", 11)
        c.drawString(18 * mm, y, j["code"])
        c.setFillColorRGB(0, 0, 0)
        c.drawString(42 * mm, y, j["title"][:70]); y -= 5.5 * mm
        c.setFont("Helvetica", 9)
        c.drawString(42 * mm, y, f"{j['client_name']}  ·  {j.get('address_text') or j.get('site_name') or '—'}"); y -= 5.5 * mm
        for cr in j["crew"]:
            c.drawString(46 * mm, y, f"{cr['name']}")
            c.drawRightString(w - 18 * mm, y, f"{(cr['window_start'] or '')[:5]} – {(cr['window_end'] or '')[:5]}")
            y -= 5 * mm
        y -= 4 * mm
        c.setStrokeColorRGB(0.85, 0.85, 0.85); c.line(18 * mm, y, w - 18 * mm, y); y -= 7 * mm
        if y < 30 * mm:
            break
    c.save()
