"""Letterhead PDF engine (reportlab). Print parity: quote, day sheet, docket, claim."""
import io
from datetime import date

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

import money


def _letterhead(c: canvas.Canvas, org: dict, title: str) -> float:
    w, h = A4
    c.setFont("Helvetica-Bold", 16)
    c.drawString(20 * mm, h - 22 * mm, org.get("name", "").upper())
    c.setFont("Helvetica", 8)
    sub = " · ".join(x for x in (org.get("legal_name"), f"ABN {org.get('abn')}" if org.get("abn") else None) if x)
    if sub:
        c.drawString(20 * mm, h - 27 * mm, sub)
    c.setFont("Courier-Bold", 10)
    c.drawRightString(w - 20 * mm, h - 22 * mm, title.upper())
    c.setLineWidth(0.6)
    c.line(20 * mm, h - 31 * mm, w - 20 * mm, h - 31 * mm)
    return h - 40 * mm


def lines_pdf(org: dict, title: str, meta: list[tuple[str, str]], lines: list[dict], total_row: bool = True) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    w, _ = A4
    y = _letterhead(c, org, title)
    c.setFont("Courier", 9)
    for k, v in meta:
        c.drawString(20 * mm, y, f"{k.upper()}: {v}")
        y -= 5 * mm
    y -= 3 * mm
    c.setFont("Courier-Bold", 9)
    c.drawString(20 * mm, y, "DESCRIPTION")
    c.drawRightString(w - 60 * mm, y, "QTY")
    c.drawRightString(w - 20 * mm, y, "AMOUNT")
    y -= 2 * mm
    c.line(20 * mm, y, w - 20 * mm, y)
    y -= 6 * mm
    c.setFont("Courier", 9)
    subtotal = 0
    for l in lines:
        amount = round(float(l.get("qty", 1)) * int(l.get("unit_cents", 0)))
        subtotal += amount
        c.drawString(20 * mm, y, str(l.get("description", ""))[:64])
        c.drawRightString(w - 60 * mm, y, f"{float(l.get('qty', 1)):g}")
        c.drawRightString(w - 20 * mm, y, money.fmt(amount))
        y -= 5.5 * mm
        if y < 30 * mm:
            c.showPage()
            y = _letterhead(c, org, title)
            c.setFont("Courier", 9)
    if total_row:
        y -= 2 * mm
        c.line(120 * mm, y, w - 20 * mm, y)
        y -= 6 * mm
        c.setFont("Courier-Bold", 9)
        c.drawRightString(w - 60 * mm, y, "SUBTOTAL")
        c.drawRightString(w - 20 * mm, y, money.fmt(subtotal))
        y -= 5.5 * mm
        c.drawRightString(w - 60 * mm, y, "GST 10%")
        c.drawRightString(w - 20 * mm, y, money.fmt(money.gst_cents(subtotal)))
        y -= 5.5 * mm
        c.drawRightString(w - 60 * mm, y, "TOTAL INC GST")
        c.drawRightString(w - 20 * mm, y, money.fmt(money.inc_cents(subtotal)))
    c.setFont("Helvetica", 7)
    c.drawString(20 * mm, 15 * mm, f"Generated {date.today().isoformat()} — BAD FORM Systems platform")
    c.showPage()
    c.save()
    return buf.getvalue()


def day_sheet_pdf(org: dict, day: str, rows: list[dict]) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    w, _ = A4
    y = _letterhead(c, org, f"Day sheet {day}")
    c.setFont("Courier-Bold", 9)
    for col, x in (("JOB", 20), ("SITE", 70), ("CREW", 130)):
        c.drawString(x * mm, y, col)
    y -= 2 * mm
    c.line(20 * mm, y, w - 20 * mm, y)
    y -= 6 * mm
    c.setFont("Courier", 9)
    for r in rows:
        c.drawString(20 * mm, y, f"{r.get('code', '')} {str(r.get('title', ''))[:20]}")
        c.drawString(70 * mm, y, str(r.get("site") or "")[:28])
        c.drawString(130 * mm, y, str(r.get("crew") or "")[:26])
        y -= 5.5 * mm
    c.showPage()
    c.save()
    return buf.getvalue()
