"""AI gateway: the only place model APIs are called.

Feature code calls `extract(capture_type, image_bytes, org)` and gets back
{fields, confidence, checks, mode}. Routing to fast-track vs the review queue is
`route(org, capture_type, confidence)`.

Modes:
- fixture (default, CI): deterministic payloads per capture type.
- live: provider chain (primary -> secondary) via keys in env; every failure falls
  through to the next provider, and the caller falls back to manual entry.

Confidence is never taken on the model's word alone: arithmetic and sanity checks
force low confidence when they fail.
"""
import json
import os
import uuid

EXTRACTOR_MODE = os.environ.get("EXTRACTOR_MODE", "fixture")
DEFAULT_THRESHOLD = 0.80

FIXTURES: dict[str, dict] = {
    "receipt": {
        "supplier": "Rexel Bunbury",
        "invoice_no": "RX-88301",
        "date": "2026-09-10",
        "lines": [
            {"description": "16mm 4C+E orange circular cable 100m", "qty": 1, "unit_cents": 64000},
            {"description": "24-pole surface mount loadcentre", "qty": 1, "unit_cents": 31500},
            {"description": "20A 3-phase RCBO", "qty": 6, "unit_cents": 8250},
        ],
        "subtotal_ex_cents": 145000,
        "gst_cents": 14500,
        "total_inc_cents": 159500,
        "confidence": 0.94,
    },
    "quarry_ticket": {
        "quarry": "Roelands Quarry",
        "ticket_no": "RQ-7821",
        "date": "2026-09-10",
        "material": "14mm roadbase",
        "tonnes": 31.4,
        "rate_cents_per_tonne": 2850,
        "confidence": 0.91,
    },
    "voice_timesheet": {
        "transcript": "on the Kemerton pad from seven to three thirty, half hour lunch",
        "started": "07:00",
        "ended": "15:30",
        "break_minutes": 30,
        "confidence": 0.88,
    },
    "heat_cert": {
        "heat_no": "HT-98442",
        "material": "350 Grade Plate 20mm",
        "mill": "BlueScope",
        "cert_ref": "MC-40021",
        "confidence": 0.9,
    },
    "prestart": {"result": "pass", "faults": [], "confidence": 0.99},
    "incident": {"summary": "", "confidence": 0.99},
    # Evidence photo for a stage hold point: nothing to extract, never queued for review.
    "stage_photo": {"confidence": 0.99},
    "load_restraint": {
        "vehicle": "PM-01 Kenworth T410",
        "restraint": "4x chains + 2 straps, gates pinned",
        "confidence": 0.92,
    },
    "hire_docket": {
        "machine": "EX-04 Cat 330",
        "hours": 6.5,
        "standby_hours": 1.5,
        "date": "2026-09-10",
        "confidence": 0.9,
    },
}


def sanity_checks(capture_type: str, fields: dict) -> list[dict]:
    """Arithmetic + shape checks. Any failure forces the capture into review."""
    checks: list[dict] = []

    def add(name: str, ok: bool, detail: str = "") -> None:
        checks.append({"name": name, "ok": ok, "detail": detail})

    if capture_type == "receipt":
        lines = fields.get("lines") or []
        line_sum = sum(round(l.get("qty", 0) * l.get("unit_cents", 0)) for l in lines)
        sub = fields.get("subtotal_ex_cents")
        add("lines_sum_subtotal", sub is not None and line_sum == sub, f"{line_sum} vs {sub}")
        gst = fields.get("gst_cents")
        add("gst_is_10pct", sub is not None and gst is not None and abs(gst - round(sub / 10)) <= 2)
        tot = fields.get("total_inc_cents")
        add("total_adds_up", None not in (sub, gst, tot) and sub + gst == tot)
    elif capture_type == "quarry_ticket":
        add("tonnes_plausible", 0 < float(fields.get("tonnes") or 0) < 100)
        add("has_ticket_no", bool(fields.get("ticket_no")))
    elif capture_type == "voice_timesheet":
        add("has_window", bool(fields.get("started")) and bool(fields.get("ended")))
    elif capture_type == "hire_docket":
        add("hours_plausible", 0 < float(fields.get("hours") or 0) <= 24)
    return checks


def effective_confidence(model_conf: float, checks: list[dict]) -> float:
    if any(not c["ok"] for c in checks):
        return min(model_conf, 0.40)
    return model_conf


async def extract(capture_type: str, payload: bytes | str | None, org: dict) -> dict:
    """Returns {fields, confidence, checks, mode, extraction_id}."""
    if EXTRACTOR_MODE == "fixture":
        fields = dict(FIXTURES.get(capture_type, {"confidence": 0.5}))
        model_conf = float(fields.pop("confidence", 0.5))
    else:
        fields, model_conf = await _live_chain(capture_type, payload, org)
    checks = sanity_checks(capture_type, fields)
    conf = effective_confidence(model_conf, checks)
    return {
        "fields": fields,
        "confidence": conf,
        "checks": checks,
        "mode": EXTRACTOR_MODE,
        "extraction_id": str(uuid.uuid4()),
    }


async def _live_chain(capture_type: str, payload: bytes | str | None, org: dict) -> tuple[dict, float]:
    """Primary -> secondary provider chain. Providers are configured per instance;
    a total failure returns empty fields at zero confidence so the caller routes to
    manual entry — the capture is never lost."""
    providers = _configured_providers(org)
    for name, call in providers:
        try:
            fields = await call(capture_type, payload)
            return fields, float(fields.pop("confidence", 0.6))
        except Exception:
            continue
    return {}, 0.0


def _configured_providers(org: dict):
    out = []
    settings = org.get("settings") or {}
    if isinstance(settings, str):
        settings = json.loads(settings)
    ai = settings.get("ai") or {}
    for name in ai.get("chain", []):
        key_env = f"AI_KEY_{name.upper()}"
        if os.environ.get(key_env):
            out.append((name, _provider_stub(name)))
    return out


def _provider_stub(name: str):
    async def call(capture_type: str, payload):
        raise RuntimeError(f"provider {name} adapter not wired in this build")

    return call


def threshold_for(org: dict, capture_type: str) -> float:
    settings = org.get("settings") or {}
    if isinstance(settings, str):
        settings = json.loads(settings)
    per_type = ((settings.get("ai") or {}).get("thresholds") or {})
    return float(per_type.get(capture_type, DEFAULT_THRESHOLD))


def route(org: dict, capture_type: str, confidence: float) -> str:
    """'fast_track' (pre-filled one-tap verify) or 'review' (dashboard queue)."""
    return "fast_track" if confidence >= threshold_for(org, capture_type) else "review"
