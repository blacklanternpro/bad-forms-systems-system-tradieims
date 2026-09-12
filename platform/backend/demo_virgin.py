"""Demo virgin mode — session-scoped empty transactional data without touching the DB.

POST /api/demo/clear issues a short-lived HMAC token. The browser keeps it in
module memory and sends X-Demo-Virgin on every request. Middleware short-circuits
transactional GETs to empty shapes. Full page reload drops the token and the
seed is visible again — no reseed required.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import time
from typing import Callable

import jwt
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

import auth
import svc

HEADER = "x-demo-virgin"
TTL_SECONDS = 8 * 3600
SECRET = auth.JWT_SECRET.encode() if isinstance(auth.JWT_SECRET, str) else auth.JWT_SECRET

_UUID = re.compile(r"^[0-9a-fA-F-]{36}$")

# Paths that must keep working so the shell stays branded and usable.
_PASSTHROUGH_PREFIXES = (
    "/api/health",
    "/api/auth/",
    "/api/me",
    "/api/demo/",
    "/api/platform/",
)


def issue_token(org_id: str) -> str:
    payload = {"org_id": str(org_id), "virgin": True, "exp": int(time.time()) + TTL_SECONDS}
    body = json.dumps(payload, separators=(",", ":"), sort_keys=True)
    sig = hmac.new(SECRET, body.encode(), hashlib.sha256).hexdigest()
    return f"{body}.{sig}"


def verify_token(token: str, org_id: str | None = None) -> dict | None:
    try:
        body, sig = token.rsplit(".", 1)
    except ValueError:
        return None
    expect = hmac.new(SECRET, body.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expect, sig):
        return None
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        return None
    if not payload.get("virgin"):
        return None
    if int(payload.get("exp", 0)) < int(time.time()):
        return None
    if org_id is not None and str(payload.get("org_id")) != str(org_id):
        return None
    return payload


def _org_from_auth(request: Request) -> str | None:
    hdr = request.headers.get("authorization") or ""
    if not hdr.lower().startswith("bearer "):
        return None
    raw = hdr.split(" ", 1)[1].strip()
    try:
        p = jwt.decode(raw, auth.JWT_SECRET, algorithms=[auth.ALGO])
        return str(p.get("org_id"))
    except Exception:
        return None


def _empty_for(path: str) -> Response | None:
    today = svc.today_awst().isoformat()

    if path == "/api/nudge":
        return JSONResponse({
            "date": today,
            "recalls": [],
            "quotes": [],
            "review_count": 0,
            "licences_expiring": [],
        })
    if path == "/api/invoicing/chase":
        return JSONResponse({"uninvoiced": [], "overdue": [], "on_table_cents": 0})
    if path.startswith("/api/dayboard"):
        if path.endswith(".pdf"):
            return JSONResponse({"detail": "Not found"}, status_code=404)
        return JSONResponse({"date": today, "jobs": [], "assignments": [], "away": []})
    if path.startswith("/api/weekboard"):
        return JSONResponse({"start": today, "days": [{"date": today, "job_count": 0}]})
    if path in ("/api/field/today", "/api/field/tomorrow"):
        return JSONResponse({"date": today, "jobs": []})
    if path.startswith("/api/field/jobs/"):
        return JSONResponse({"detail": "Not found"}, status_code=404)
    if path.startswith("/api/fleet/workshop"):
        return JSONResponse({"due_services": [], "open_corrective_actions": []})
    if path.startswith("/api/fleet/evidence"):
        return JSONResponse({"outcomes": {}, "counts": {}, "items": []})
    if path.startswith("/api/search"):
        return JSONResponse({"jobs": [], "clients": [], "quotes": [], "pos": []})
    if path.startswith("/api/reports") or path in ("/api/wip", "/api/payroll"):
        return JSONResponse([])

    # Keep org identity/theme/modules/users so the shell stays branded.
    if path.startswith("/api/org") and not path.startswith("/api/org/licences") and not path.startswith("/api/org/audit"):
        return None

    # Detail by UUID → 404
    parts = [p for p in path.split("/") if p]
    if parts and _UUID.match(parts[-1]):
        return JSONResponse({"detail": "Not found"}, status_code=404)

    empty_list_prefixes = (
        "/api/jobs", "/api/quotes", "/api/clients", "/api/sites", "/api/enquiries",
        "/api/captures", "/api/notifications", "/api/invoices", "/api/ledger",
        "/api/purchase-orders", "/api/pos", "/api/pricebooks", "/api/org/licences",
        "/api/org/audit", "/api/trades", "/api/civil", "/api/fab", "/api/fleet",
    )
    for prefix in empty_list_prefixes:
        if path == prefix or path.startswith(prefix + "/"):
            return JSONResponse([])

    return None


class VirginMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        if request.method != "GET":
            return await call_next(request)
        path = request.url.path
        if any(path == p.rstrip("/") or path.startswith(p) for p in _PASSTHROUGH_PREFIXES):
            return await call_next(request)
        token = request.headers.get(HEADER)
        if not token:
            return await call_next(request)
        org_id = _org_from_auth(request)
        if not verify_token(token, org_id):
            return await call_next(request)
        empty = _empty_for(path)
        if empty is not None:
            return empty
        return await call_next(request)
