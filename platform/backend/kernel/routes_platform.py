"""The platform console (god-mode) and the Foundry — BAD FORM staff only,
authenticated by the platform staff key, never by a client login.

The Foundry is deliberately a simple builder: client intake, a module ticklist
drawn from the pack catalogue, and an instance generated with the client's
imprint from commit zero — manifest, code prefixes, letterhead, brand colour,
and a walkthrough yard carrying their own names. Every choice lands in the
returned client.json manifest, honouring the config-not-forks law.
"""
import json
import re
import secrets
from datetime import datetime, timezone

import csv as csvmod
import io

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

import auth
import db
import svc
from kernel import timeline
from kernel.routes_auth import _session

r = APIRouter(tags=["platform"])

THEMES = ["daybook", "amber-on-void", "paper-docket"]

# The Foundry menu: what the yard-visit gallery demos is what gets ticked.
CATALOGUE: dict[str, dict] = {
    "kernel": {
        "label": "Kernel (always on)",
        "blurb": "Jobs, quotes, capture pipeline + verify gate, day board, invoicing drafts, field app, notifications.",
        "bundle": ["day board", "jobs + live costing", "quotes + price books", "capture + review inbox",
                   "purchase orders", "invoicing + ledger drafts", "field app", "site QR plates"],
    },
    "trades": {
        "label": "Trades",
        "blurb": "Variations from the phone, numbered certificates with form-fill PDF, wholesaler dockets.",
        "bundle": ["variations + approval", "certificates", "voice timesheets"],
    },
    "civil": {
        "label": "Civil / earthmoving",
        "blurb": "Plant register, wet/dry hire rates, dispatch-blocking pre-starts, sign-on-glass dockets, quarry tickets, SoR.",
        "bundle": ["plant register", "hire rate engine", "pre-starts", "hire dockets + tally counter", "quarry tickets", "SoR library"],
    },
    "fab": {
        "label": "Fabrication",
        "blurb": "ITP stages with photo hold points, heat/mill cert traceability, NDI, offcut rack, MDR pack, workshop kiosk.",
        "bundle": ["ITP templates", "material lots", "NDI register", "offcut rack", "MDR pack PDF", "kiosk shell"],
    },
    "fleet": {
        "label": "Fleet / transport",
        "blurb": "Multi-depot register, floats + mobilisation charging, hour-meter services, CoR/SMS evidence vault (HVNL 2026).",
        "bundle": ["asset register", "floats", "workshop queue", "corrective actions", "SMS evidence vault"],
    },
}


@r.get("/menu")
async def foundry_menu(_=Depends(auth.platform_staff)):
    return {"catalogue": CATALOGUE, "themes": THEMES}


@r.get("/instances")
async def instances(_=Depends(auth.platform_staff)):
    """Fleet-of-instances health: activity, review queue depth, extraction accuracy."""
    rows = await db.fetch(
        """SELECT o.id, o.slug, o.name, o.theme, o.modules, o.settings, o.is_demo, o.created_at,
                  (SELECT count(*) FROM users u WHERE u.org_id=o.id AND u.active) AS users,
                  (SELECT count(*) FROM jobs j WHERE j.org_id=o.id) AS jobs,
                  (SELECT count(*) FROM captures c WHERE c.org_id=o.id AND c.status='needs_verify') AS review_queue,
                  (SELECT count(*) FROM captures c WHERE c.org_id=o.id AND c.status='verified') AS verified,
                  (SELECT count(*) FROM audit_log a WHERE a.org_id=o.id AND a.action='extraction.corrected') AS corrected,
                  (SELECT max(t.created_at) FROM timeline_events t WHERE t.org_id=o.id) AS last_activity
           FROM organisations o ORDER BY o.created_at""",
    )
    out = []
    for x in svc.rows(rows):
        settings = x.pop("settings") or {}
        verified = int(x["verified"] or 0)
        corrected = int(x["corrected"] or 0)
        x["pilot"] = bool(settings.get("pilot"))
        x["ledger"] = (settings.get("ledger") or {}).get("provider")
        x["ledger_connected"] = bool((settings.get("ledger") or {}).get("connected"))
        x["ai"] = settings.get("ai") or {}
        x["extraction_accuracy"] = round(1 - corrected / verified, 3) if verified else None
        out.append(x)
    return out


class FoundryIn(BaseModel):
    trading_name: str
    legal_name: str | None = None
    abn: str | None = None
    slug: str | None = None
    brand_colour: str | None = None
    letterhead_line: str | None = None
    sectors: list[str] = []
    modules: dict | None = None  # explicit ticklist override
    terminology: dict = {}
    code_prefixes: dict = {}
    yards: list[str] = []
    owner_name: str
    owner_email: str
    ledger_provider: str = "xero-mock"
    theme: str = "daybook"
    pilot: bool = False


def _derive_slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())[:24] or "client"


@r.post("/foundry")
async def foundry_build(body: FoundryIn, _=Depends(auth.platform_staff)):
    """Imprint from commit zero: the instance is theirs before anyone logs in."""
    slug = (body.slug or _derive_slug(body.trading_name)).lower()
    if await db.fetchrow("SELECT id FROM organisations WHERE slug=$1", slug):
        raise HTTPException(409, f"Instance slug '{slug}' already exists")
    if body.theme not in THEMES:
        raise HTTPException(400, "Unknown theme")
    bad = [s for s in body.sectors if s not in CATALOGUE or s == "kernel"]
    if bad:
        raise HTTPException(400, f"Unknown sectors: {', '.join(bad)}")

    modules: dict[str, str] = {"kernel": "live"}
    if not body.pilot:
        for s in body.sectors:
            modules[s] = "live"
        if body.modules:
            modules.update(body.modules)

    initials = "".join(w[0] for w in body.trading_name.split()[:2]).upper() or "J"
    codes = {"job": initials, "quote": "Q", "po": "PO", "invoice": "INV", **body.code_prefixes}
    manifest = {
        "slug": slug,
        "trading_name": body.trading_name,
        "legal_name": body.legal_name or body.trading_name,
        "abn": body.abn,
        "sectors": body.sectors,
        "modules": modules,
        "theme": body.theme,
        "brand_colour": body.brand_colour,
        "terminology": body.terminology,
        "code_prefixes": codes,
        "yards": body.yards,
        "owner_email": body.owner_email,
        "ledger": body.ledger_provider,
        "pilot": body.pilot,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    settings = {
        "codes": codes,
        "rates": {"labour_cost_cents": 10500},
        "ai": {"provider": "fixture", "thresholds": {}},
        "ledger": {"provider": body.ledger_provider, "connected": False},
        "pilot": body.pilot,
        "foundry": {"manifest": manifest},
    }
    brand = {
        "letterhead_line": body.letterhead_line or f"{body.trading_name} — {body.abn or 'ABN pending'}",
        "colour": body.brand_colour,
        "tokens": {"--mark": body.brand_colour} if body.brand_colour else {},
    }

    org = await db.fetchrow(
        """INSERT INTO organisations (slug, name, legal_name, abn, theme, terminology, modules, settings, is_demo, brand)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9) RETURNING id""",
        slug, body.trading_name, body.legal_name or body.trading_name, body.abn, body.theme,
        json.dumps(body.terminology), json.dumps(modules), json.dumps(settings), json.dumps(brand),
    )
    oid = org["id"]

    owner_password = secrets.token_urlsafe(9)
    crew_pin = str(secrets.randbelow(9000) + 1000)
    await db.execute(
        "INSERT INTO users (org_id, name, email, role, password_hash) VALUES ($1,$2,$3,'owner',$4)",
        oid, body.owner_name, body.owner_email, auth.hash_password(owner_password),
    )
    crew = await db.fetchval(
        "INSERT INTO users (org_id, name, role, pin) VALUES ($1,$2,'crew',$3) RETURNING id",
        oid, f"{body.trading_name} crew", crew_pin,
    )

    # The walkthrough yard: their names on everything from the first screen.
    client = await db.fetchval(
        "INSERT INTO clients (org_id, name, contact_name) VALUES ($1,$2,$3) RETURNING id",
        oid, f"{body.trading_name} walkthrough client", body.owner_name,
    )
    first_site = None
    for y in body.yards:
        sid = await db.fetchval(
            "INSERT INTO sites (org_id, client_id, name) VALUES ($1,$2,$3) RETURNING id", oid, client, y
        )
        first_site = first_site or sid
        if any(m in modules for m in ("civil", "fleet")):
            n = await db.fetchval("SELECT count(*) FROM assets WHERE org_id=$1", oid)
            await db.execute(
                "INSERT INTO assets (org_id, kind, name, yard, meta) VALUES ($1,'excavator',$2,$3,$4)",
                oid, f"{body.trading_name} excavator {int(n) + 1}", y, json.dumps({"code": f"PL-{int(n) + 1:02d}"}),
            )
    job = await db.fetchval(
        """INSERT INTO jobs (org_id, client_id, site_id, code, title, status, quoted_cents, starts_on)
           VALUES ($1,$2,$3,$4,$5,'live',250000,$6) RETURNING id""",
        oid, client, first_site, f"{codes['job']}-0001", f"{body.trading_name} walkthrough job", svc.today_awst(),
    )
    await db.execute(
        "INSERT INTO job_assignments (org_id, job_id, user_id, on_date) VALUES ($1,$2,$3,$4)",
        oid, job, crew, svc.today_awst(),
    )
    await timeline.log(oid, job, "foundry.provisioned", f"Instance built by the Foundry for {body.trading_name}")
    await db.execute(
        "INSERT INTO audit_log (org_id, actor, action, detail) VALUES ($1,'platform','foundry.provisioned',$2)",
        oid, json.dumps({"slug": slug}),
    )

    return {
        "org_id": str(oid),
        "manifest": manifest,
        "credentials": {"owner_email": body.owner_email, "owner_password": owner_password, "crew_pin": crew_pin},
    }


async def _org_by_slug(slug: str) -> dict:
    row = await db.fetchrow("SELECT * FROM organisations WHERE slug=$1", slug)
    if not row:
        raise HTTPException(404, "Instance not found")
    return svc.row_dict(row)


@r.post("/instances/{slug}/impersonate")
async def impersonate(slug: str, _=Depends(auth.platform_staff)):
    """Support impersonation — always audited on the client's own audit log."""
    org = await _org_by_slug(slug)
    user = await db.fetchrow(
        "SELECT * FROM users WHERE org_id=$1 AND role='owner' AND active ORDER BY created_at LIMIT 1", org["id"]
    )
    if not user:
        raise HTTPException(404, "No active owner on this instance")
    await db.execute(
        "INSERT INTO audit_log (org_id, actor, action, detail) VALUES ($1,'platform','platform.impersonated',$2)",
        org["id"], json.dumps({"as_user": str(user["id"])}),
    )
    return _session(svc.row_dict(user), org)


class AiPatch(BaseModel):
    provider: str | None = None
    chain: list[str] | None = None
    thresholds: dict | None = None
    budget_cents: int | None = None


@r.patch("/instances/{slug}/ai")
async def ai_config(slug: str, body: AiPatch, _=Depends(auth.platform_staff)):
    """Per-client AI management: provider chain, thresholds, budget cap."""
    org = await _org_by_slug(slug)
    settings = org.get("settings") or {}
    ai = settings.get("ai") or {}
    ai.update({k: v for k, v in body.model_dump().items() if v is not None})
    settings["ai"] = ai
    await db.execute("UPDATE organisations SET settings=$2 WHERE id=$1", org["id"], json.dumps(settings))
    await db.execute(
        "INSERT INTO audit_log (org_id, actor, action, detail) VALUES ($1,'platform','platform.ai_config',$2)",
        org["id"], json.dumps(ai),
    )
    return ai


@r.post("/instances/{slug}/import/clients")
async def import_clients(slug: str, file: UploadFile = File(...), _=Depends(auth.platform_staff)):
    """Onboarding importer: Xero-contacts-style CSV — name, contact_name, email, phone."""
    org = await _org_by_slug(slug)
    text = (await file.read()).decode("utf-8", errors="replace")
    imported, skipped = 0, 0
    for rec in csvmod.DictReader(io.StringIO(text)):
        name = (rec.get("name") or "").strip()
        if not name:
            skipped += 1
            continue
        exists = await db.fetchval("SELECT 1 FROM clients WHERE org_id=$1 AND lower(name)=lower($2)", org["id"], name)
        if exists:
            skipped += 1
            continue
        await db.execute(
            "INSERT INTO clients (org_id, name, contact_name, email, phone) VALUES ($1,$2,$3,$4,$5)",
            org["id"], name, (rec.get("contact_name") or "").strip() or None,
            (rec.get("email") or "").strip() or None, (rec.get("phone") or "").strip() or None,
        )
        imported += 1
    return {"imported": imported, "skipped": skipped}


@r.post("/instances/{slug}/import/jobs")
async def import_jobs(slug: str, file: UploadFile = File(...), _=Depends(auth.platform_staff)):
    """Onboarding importer: job history CSV — code, title, status, client, quoted_dollars."""
    org = await _org_by_slug(slug)
    imported, skipped = 0, 0
    text = (await file.read()).decode("utf-8", errors="replace")
    for rec in csvmod.DictReader(io.StringIO(text)):
        code = (rec.get("code") or "").strip()
        title = (rec.get("title") or "").strip()
        status = (rec.get("status") or "live").strip()
        if not code or not title or status not in ("quoted", "scheduled", "live", "done", "invoiced"):
            skipped += 1
            continue
        if await db.fetchval("SELECT 1 FROM jobs WHERE org_id=$1 AND code=$2", org["id"], code):
            skipped += 1
            continue
        client_id = None
        cname = (rec.get("client") or "").strip()
        if cname:
            client_id = await db.fetchval("SELECT id FROM clients WHERE org_id=$1 AND lower(name)=lower($2)", org["id"], cname)
            if not client_id:
                client_id = await db.fetchval("INSERT INTO clients (org_id, name) VALUES ($1,$2) RETURNING id", org["id"], cname)
        try:
            quoted = round(float(rec.get("quoted_dollars") or 0) * 100)
        except ValueError:
            quoted = 0
        await db.execute(
            "INSERT INTO jobs (org_id, client_id, code, title, status, quoted_cents) VALUES ($1,$2,$3,$4,$5,$6)",
            org["id"], client_id, code, title, status, quoted,
        )
        imported += 1
    return {"imported": imported, "skipped": skipped}
