"""Shared pure helpers: AWST dates, code series, money-adjacent utilities."""
import json
import re
from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException

AWST = timezone(timedelta(hours=8))


def now_awst() -> datetime:
    return datetime.now(AWST)


def today_awst() -> date:
    return now_awst().date()


def week_bounds(d: date | None = None) -> tuple[date, date]:
    d = d or today_awst()
    start = d - timedelta(days=d.weekday())
    return start, start + timedelta(days=6)


def parse_date(v: str | None) -> date | None:
    if not v:
        return None
    try:
        return date.fromisoformat(v)
    except ValueError:
        raise HTTPException(400, f"Invalid date: {v}")


def row_dict(r) -> dict:
    """asyncpg Record -> JSON-safe dict (jsonb columns arrive as str)."""
    out = {}
    for k, v in dict(r).items():
        if isinstance(v, str) and k in ("meta", "extracted", "settings", "terminology", "modules", "brand", "lines", "payload", "fields", "checks"):
            try:
                v = json.loads(v)
            except (ValueError, TypeError):
                pass
        out[k] = v
    return out


def rows(rs) -> list[dict]:
    return [row_dict(r) for r in rs]


CODE_RE = re.compile(r"^([A-Za-z]+)-?(\d+)$")


def next_in_series(existing: list[str | None], prefix: str, pad: int = 4) -> str:
    """Next code in a per-org series: max numeric suffix for this prefix + 1."""
    top = 0
    for c in existing:
        if not c:
            continue
        m = CODE_RE.match(c.strip())
        if m and m.group(1).upper() == prefix.upper():
            top = max(top, int(m.group(2)))
    return f"{prefix}-{str(top + 1).zfill(pad)}"


def org_setting(org: dict, *path: str, default=None):
    cur = org.get("settings") or {}
    if isinstance(cur, str):
        cur = json.loads(cur)
    for key in path:
        if not isinstance(cur, dict):
            return default
        cur = cur.get(key)
        if cur is None:
            return default
    return cur


def term(org: dict, key: str, default: str) -> str:
    t = org.get("terminology") or {}
    if isinstance(t, str):
        t = json.loads(t)
    return t.get(key, default)
