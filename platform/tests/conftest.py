"""Test harness: boots an embedded PostgreSQL when no DATABASE_URL is provided.

CI and local runs need no system Postgres; `pip install embedded-postgres` supplies
a self-contained server on a unix socket.
"""
import asyncio
import os
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(BACKEND))

os.environ.setdefault("EXTRACTOR_MODE", "fixture")
os.environ.setdefault("STORAGE_MODE", "local")
os.environ.setdefault("LOCAL_STORAGE_DIR", "/tmp/badform-platform-test-storage")

_EPG = None


def _ensure_db() -> None:
    global _EPG
    if os.environ.get("DATABASE_URL"):
        return
    from embedded_postgres import get_server

    _EPG = get_server(Path("/tmp/badform-platform-epg"), cleanup_mode=None)
    uri = _EPG.get_uri()
    os.environ["DATABASE_URL"] = uri.replace("/postgres?", "/badform_platform?") if "?" in uri else uri
    import asyncpg

    async def prep():
        admin = await asyncpg.connect(uri)
        exists = await admin.fetchval("SELECT 1 FROM pg_database WHERE datname='badform_platform'")
        if not exists:
            await admin.execute("CREATE DATABASE badform_platform")
        await admin.close()

    asyncio.run(prep())


_ensure_db()


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
def migrated(event_loop):
    import db

    async def run():
        # Fresh schema every session: drop and re-apply all migrations.
        p = await db.pool()
        await p.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
        await db.migrate()

    event_loop.run_until_complete(run())
    yield
    event_loop.run_until_complete(__import__("db").close())
