import io, math, base64
from datetime import datetime, timedelta, time as dtime
import db, svc, auth
from money import gst_cents

def _img(lines, w=480, h=640):
    from PIL import Image, ImageDraw
    img = Image.new("RGB", (w, h), (245, 243, 238))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, w, 60], fill=(20, 22, 26))
    y = 90
    for i, t in enumerate(lines):
        d.text((30, 20 if i == 0 else y), t, fill=(250, 250, 250) if i == 0 else (30, 30, 30))
        if i > 0:
            y += 34
    out = io.BytesIO()
    img.save(out, "JPEG", quality=70)
    return out.getvalue()

async def seed_all():
    for spec in (ELEC, CONC):
        if not await db.fetchval("SELECT id FROM organisations WHERE slug=$1", spec["slug"]):
            await seed_org(spec)

PINS = ["1234", "2345", "3456"]

ELEC = {
    "slug": "sw-electrical-demo", "legal_name": "SW Electrical Demo Pty Ltd", "trading_name": "SW Electrical Demo",
    "abn": "51 824 753 556", "structure": "company", "deposit_bps": 0, "markup_bps": 1000,
    "owners": [("Dale Hartog", "owner.elec@demo.badform.invalid", "DemoOwner!elec"),
               ("Mick Ferreira", "owner2.elec@demo.badform.invalid", "DemoOwner2!elec"),
               ("Jake King", "jake1987king@gmail.com", "DemoOwner!elec")],
    "bookkeeper": ("Leanne Corby", "books.elec@demo.badform.invalid", "DemoBooks!elec"),
    "crew": [("Tommo Blake", 6500, 12500), ("Bazza Nguyen", 6000, 11500), ("Ryan Keough", 5200, 9800)],
    "clients": [("Harvest Ridge Homes Pty Ltd", "63 987 224 118", "accounts@harvestridge.invalid"),
                ("Margaret River Dairy Co", "22 445 811 902", "office@mrdairy.invalid")],
    "sites": [(0, "Lot 44 Treeton Rise", "44 Treeton Rise, Cowaramup WA 6284", -33.85, 115.10),
              (0, "Vasse Display Village", "12 Napoleon Prom, Vasse WA 6280", -33.69, 115.27),
              (1, "Dairy Processing Shed", "310 Bussell Hwy, Margaret River WA 6285", -33.95, 115.07)],
    "dockets": [("wholesale_receipt", "rexel", "RX-88214", 21450, 1950, "REXEL BUSSELTON"),
                ("wholesale_receipt", "middys", "MD-10442", 68930, 6266, "MIDDY'S BUNBURY"),
                ("fuel", "other", "FUEL-2211", 11840, 1076, "BP CAPEL")],
    "verified": ("rexel", "RX-77120", 43120, 3920, "REXEL BUSSELTON"),
    "vans": [("Hilux Tray — Tommo", "VAN-01"), ("Transit — Bazza", "VAN-02")],
}

CONC = {
    "slug": "sw-concrete-demo", "legal_name": "SW Concrete Demo Partnership", "trading_name": "SW Concrete Demo",
    "abn": "84 112 690 334", "structure": "partnership", "deposit_bps": 5000, "markup_bps": 0,
    "owners": [("Craig Moloney", "owner.conc@demo.badform.invalid", "DemoOwner!conc"),
               ("Steve Papalia", "owner2.conc@demo.badform.invalid", "DemoOwner2!conc")],
    "bookkeeper": ("Renae Moloney", "books.conc@demo.badform.invalid", "DemoBooks!conc"),
    "crew": [("Jonno Baird", 5800, 11000), ("Wozza Clifton", 5600, 10500), ("Dean Talbot", 5000, 9500)],
    "clients": [("Bunbury Patios & Sheds", "40 228 664 190", "admin@bunburypatios.invalid"),
                ("Ferguson Valley Estate", "77 903 441 286", "projects@fergusonvalley.invalid")],
    "sites": [(0, "Shed Slab — Dardanup", "18 Ferguson Rd, Dardanup WA 6236", -33.40, 115.75),
              (0, "Patio Footings — Eaton", "5 Recreation Dr, Eaton WA 6232", -33.32, 115.70),
              (1, "Cellar Door Driveway", "902 Ferguson Rd, Ferguson WA 6236", -33.44, 115.82)],
    "dockets": [("mix_docket", "other", "MIX-55019", 154000, 14000, "HOLCIM BUNBURY 25MPa"),
                ("mix_docket", "other", "MIX-55020", 92400, 8400, "HOLCIM BUNBURY 32MPa"),
                ("fuel", "other", "FUEL-8817", 15290, 1390, "SHELL EATON")],
    "verified": ("other", "MIX-54871", 128700, 11700, "HOLCIM BUNBURY 25MPa"),
    "vans": [("Isuzu NPR Tipper", "VAN-01"), ("Hilux — Jonno", "VAN-02")],
}

async def seed_org(S):
    today = svc.today_awst()
    settings = {"trades": {"default_variation_unit_cents": 0, "require_customer_po": False,
                           "materials_markup_bps": S["markup_bps"], "default_deposit_bps": S["deposit_bps"],
                           "owner_copy_email": S["owners"][0][1]}}
    org = await db.fetchrow(
        """INSERT INTO organisations (legal_name, trading_name, slug, abn, structure, is_demo, settings)
           VALUES ($1,$2,$3,$4,$5,true,$6) RETURNING *""",
        S["legal_name"], S["trading_name"], S["slug"], S["abn"], S["structure"], settings)
    oid = org["id"]
    owners = []
    for name, email, pw in S["owners"]:
        u = await db.fetchrow(
            "INSERT INTO users (org_id, role, name, email, password_hash) VALUES ($1,'owner',$2,$3,$4) ON CONFLICT (email) DO UPDATE SET org_id=EXCLUDED.org_id RETURNING *",
            oid, name, email, auth.hash_pw(pw))
        owners.append(u)
    bname, bemail, bpw = S["bookkeeper"]
    await db.execute("INSERT INTO users (org_id, role, name, email, password_hash) VALUES ($1,'bookkeeper',$2,$3,$4)", oid, bname, bemail, auth.hash_pw(bpw))
    crew = []
    for (name, labour, charge), pin in zip(S["crew"], PINS):
        u = await db.fetchrow(
            "INSERT INTO users (org_id, role, name, pin_hash, labour_cents_per_hour, charge_cents_per_hour) VALUES ($1,'crew',$2,$3,$4,$5) RETURNING *",
            oid, name, auth.hash_pw(pin), labour, charge)
        crew.append(u)
    clients = []
    for name, abn, email in S["clients"]:
        clients.append(await db.fetchrow("INSERT INTO clients (org_id, name, abn, email) VALUES ($1,$2,$3,$4) RETURNING *", oid, name, abn, email))
    sites = []
    for ci, name, addr, lat, lng in S["sites"]:
        sites.append(await db.fetchrow("INSERT INTO sites (org_id, client_id, name, address_text, lat, lng) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *", oid, clients[ci]["id"], name, addr, lat, lng))
    for name, code in S["vans"]:
        await db.execute("INSERT INTO assets (org_id, kind, name, code) VALUES ($1,'van',$2,$3)", oid, name, code)

    async def mk_job(code, title, ci, si, billing, status, quoted=0, deposit=0, recall=None, po=None):
        j = await db.fetchrow(
            """INSERT INTO jobs (org_id, client_id, site_id, bill_to_client_id, code, title, status, billing, quoted_cents, deposit_cents, recall_on, customer_po, starts_on)
               VALUES ($1,$2,$3,$2,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *""",
            oid, clients[ci]["id"], sites[si]["id"], code, title, status, billing, quoted, deposit, recall, po, today)
        await svc.seed_stages(oid, j["id"])
        return j

    is_elec = S["slug"] == "sw-electrical-demo"
    t1 = "Second fix — Lot 44 Treeton Rise" if is_elec else "Pour + finish shed slab 12x8"
    t2 = "Switchboard upgrade + RCDs" if is_elec else "Patio footings dig & pour"
    t3 = "Display village maintenance loop" if is_elec else "Exposed agg driveway prep"
    t4 = "Dairy shed 3-phase fault find" if is_elec else "Cellar door driveway pour"
    j1 = await mk_job("JOB-001", t1, 0, 0, "quoted", "in_progress", 850000, 0, po="PO-4471")
    j2 = await mk_job("JOB-002", t2, 0, 1, "tm", "in_progress")
    j3 = await mk_job("JOB-003", t3, 0, 1, "quoted", "scheduled", 264000, 0, recall=today - timedelta(days=3))
    j4 = await mk_job("JOB-004", t4, 1, 2, "tm", "scheduled", recall=today + timedelta(days=2))

    for job, u, ws, we in [(j1, crew[0], "07:00", "11:00"), (j1, crew[2], "07:00", "11:00"),
                           (j2, crew[1], "07:30", "15:30"), (j4, crew[0], "12:30", "16:30")]:
        await db.execute(
            "INSERT INTO job_assignments (org_id, job_id, user_id, on_date, window_start, window_end) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",
            oid, job["id"], u["id"], today, dtime.fromisoformat(ws), dtime.fromisoformat(we))

    tz = svc.PERTH
    for job, u, sh, eh in [(j1, crew[0], 7, 10), (j1, crew[2], 7, 10), (j2, crew[1], 8, 12)]:
        start = datetime.combine(today, dtime(sh, 0), tzinfo=tz)
        await db.execute("INSERT INTO time_entries (org_id, job_id, user_id, started_at, ended_at, note) VALUES ($1,$2,$3,$4,$5,$6)",
                         oid, job["id"], u["id"], start, start.replace(hour=eh), "seeded")

    for kind, supplier, num, total, gst, label in S["dockets"]:
        data = _img([S["trading_name"].upper(), label, f"DOCKET {num}", f"TOTAL ${total/100:,.2f}", f"GST ${gst/100:,.2f}"])
        p = svc.save_bytes(oid, data, "jpg")
        doc = await svc.add_document(oid, j2["id"], "docket_photo", p, "image/jpeg", crew[0]["id"])
        await db.execute(
            """INSERT INTO docket_extractions (org_id, document_id, job_id, status, kind, extracted, supplier, total_cents, gst_cents, docket_number, receipt_date)
               VALUES ($1,$2,$3,'needs_verify',$4,$5,$6,$7,$8,$9,$10)""",
            oid, doc["id"], j2["id"], kind, {"supplier": supplier, "total_cents": total, "confidence": 0.86}, supplier, total, gst, num, today)

    vsup, vnum, vtotal, vgst, vlabel = S["verified"]
    data = _img([S["trading_name"].upper(), vlabel, f"DOCKET {vnum}", f"TOTAL ${vtotal/100:,.2f}"])
    p = svc.save_bytes(oid, data, "jpg")
    vdoc = await svc.add_document(oid, j2["id"], "docket_photo", p, "image/jpeg", crew[0]["id"])
    vext = await db.fetchrow(
        """INSERT INTO docket_extractions (org_id, document_id, job_id, status, kind, supplier, total_cents, gst_cents, docket_number, receipt_date, verified_by)
           VALUES ($1,$2,$3,'verified',$4,$5,$6,$7,$8,$9,$10) RETURNING *""",
        oid, vdoc["id"], j2["id"], "mix_docket" if not is_elec else "wholesale_receipt", vsup, vtotal, vgst, vnum, today, owners[0]["id"])
    await db.execute(
        "INSERT INTO supplier_receipts (org_id, job_id, extraction_id, supplier, docket_number, total_cents, gst_cents, receipt_date, document_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        oid, j2["id"], vext["id"], vsup, vnum, vtotal, vgst, today, vdoc["id"])

    for job, n in [(j1, 2)]:
        for i in range(n):
            data = _img([f"{job['code']} AFTER #{i+1}", "SITE PHOTO"], 640, 480)
            await svc.add_document(oid, job["id"], "after_photo", svc.save_bytes(oid, data, "jpg"), "image/jpeg", crew[0]["id"])

    qtitle = "Shed rewire — 3 phase sub board" if is_elec else "House slab 22x14 — pump mix"
    q1 = await db.fetchrow(
        """INSERT INTO quotes (org_id, client_id, site_id, bill_to_client_id, code, title, status, valid_until, deposit_bps)
           VALUES ($1,$2,$3,$2,'Q-001',$4,'draft',$5,$6) RETURNING *""",
        oid, clients[1]["id"], sites[2]["id"], qtitle, today + timedelta(days=14), S["deposit_bps"])
    qlines = [("Labour & install", 1, 412000), ("Materials allowance", 1, 186000), ("Testing & certification", 1, 42000)] if is_elec \
        else [("Supply & pour 25MPa mix", 38, 21000), ("Pump hire", 1, 88000), ("Mesh, bar chairs, cure", 1, 64000)]
    for i, (d, qy, uc) in enumerate(qlines):
        await db.execute("INSERT INTO quote_lines (org_id, quote_id, description, qty, unit_cents, sort) VALUES ($1,$2,$3,$4,$5,$6)", oid, q1["id"], d, qy, uc, i)

    if is_elec:
        q_chase = await db.fetchrow(
            """INSERT INTO quotes (org_id, client_id, site_id, bill_to_client_id, code, title, status, valid_until, deposit_bps)
               VALUES ($1,$2,$3,$2,'Q-002','Switchboard upgrade — Cowaramup display','sent',$4,0) RETURNING *""",
            oid, clients[0]["id"], sites[1]["id"], today + timedelta(days=3))
        for i, (d, qy, uc) in enumerate([("Labour", 1, 180000), ("Materials allowance", 1, 64000)]):
            await db.execute("INSERT INTO quote_lines (org_id, quote_id, description, qty, unit_cents, sort) VALUES ($1,$2,$3,$4,$5,$6)", oid, q_chase["id"], d, qy, uc, i)

    if not is_elec:
        q2 = await db.fetchrow(
            """INSERT INTO quotes (org_id, client_id, site_id, bill_to_client_id, code, title, status, valid_until, deposit_bps)
               VALUES ($1,$2,$3,$2,'Q-002','Shed slab 12x8 — accepted works','sent',$4,5000) RETURNING *""",
            oid, clients[0]["id"], sites[0]["id"], today + timedelta(days=7))
        for i, (d, qy, uc) in enumerate([("Slab prep, mesh and pour", 1, 520000), ("Saw cuts + seal", 1, 46000)]):
            await db.execute("INSERT INTO quote_lines (org_id, quote_id, description, qty, unit_cents, sort) VALUES ($1,$2,$3,$4,$5,$6)", oid, q2["id"], d, qy, uc, i)
        q2 = await db.fetchrow("SELECT * FROM quotes WHERE id=$1", q2["id"])
        await svc.accept_quote(q2, "Pete Harvey (Bunbury Patios)", method="token")

    vo = await db.fetchrow(
        "INSERT INTO variations (org_id, job_id, code, title, amount_cents, status) VALUES ($1,$2,'VO-001',$3,$4,'draft') RETURNING *",
        oid, j1["id"], "Extra circuit for shed lighting" if is_elec else "Additional 2m3 mix + edge form", 38500 if is_elec else 52000)
    sig_b64 = base64.b64encode(_img(["SIGNATURE"], 300, 120)).decode()
    await svc.sign_variation(vo, "Site Super — " + clients[0]["name"], "canvas", signature_b64=sig_b64)
    vo2 = await db.fetchrow(
        "INSERT INTO variations (org_id, job_id, code, title, amount_cents, status) VALUES ($1,$2,'VO-002',$3,28000,'draft') RETURNING *",
        oid, j2["id"], "After-hours callout allowance")


DEMO_WIPE_TABLES = (
    "mail_outbox", "certificates", "sync_outbox", "xero_drafts", "supplier_receipts",
    "job_extra_lines", "variation_sends", "variations", "signatures", "docket_extractions",
    "documents", "time_entries", "job_assignments", "job_stages", "quote_sends",
    "quote_lines", "quotes", "jobs", "assets", "sites", "clients", "users",
)


async def reset_demo_yards():
    async with db.pool.acquire() as c:
        async with c.transaction():
            ids = [r["id"] for r in await c.fetch("SELECT id FROM organisations WHERE is_demo")]
            if ids:
                for table in DEMO_WIPE_TABLES:
                    await c.execute(f"DELETE FROM {table} WHERE org_id = ANY($1::uuid[])", ids)
                await c.execute("DELETE FROM organisations WHERE id = ANY($1::uuid[])", ids)
    await seed_org(ELEC)
    await seed_org(CONC)
