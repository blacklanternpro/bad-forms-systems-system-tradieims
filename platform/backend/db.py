import os
from pathlib import Path

import asyncpg

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://badform@localhost/badform_platform")
BASE = Path(__file__).parent
KERNEL_MIG = BASE / "migrations"
PACKS_DIR = BASE / "packs"

_pool: asyncpg.Pool | None = None


async def pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=8)
    return _pool


async def close() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def _migration_files() -> list[tuple[str, Path]]:
    """Kernel migrations first, then each pack's, all in sorted order.

    Version keys are namespaced ("kernel:0001_x.sql", "trades:0001_y.sql") so packs
    can be added later without renumbering.
    """
    files: list[tuple[str, Path]] = []
    for f in sorted(KERNEL_MIG.glob("*.sql")):
        files.append((f"kernel:{f.name}", f))
    if PACKS_DIR.exists():
        for pack in sorted(p for p in PACKS_DIR.iterdir() if p.is_dir()):
            for f in sorted((pack / "migrations").glob("*.sql")):
                files.append((f"{pack.name}:{f.name}", f))
    return files


async def migrate() -> list[str]:
    p = await pool()
    applied: list[str] = []
    async with p.acquire() as con:
        await con.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"
        )
        done = {r["version"] for r in await con.fetch("SELECT version FROM schema_migrations")}
        for version, path in _migration_files():
            if version in done:
                continue
            async with con.transaction():
                await con.execute(path.read_text())
                await con.execute("INSERT INTO schema_migrations (version) VALUES ($1)", version)
            applied.append(version)
    return applied


async def fetch(q: str, *args):
    p = await pool()
    return await p.fetch(q, *args)


async def fetchrow(q: str, *args):
    p = await pool()
    return await p.fetchrow(q, *args)


async def fetchval(q: str, *args):
    p = await pool()
    return await p.fetchval(q, *args)


async def execute(q: str, *args):
    p = await pool()
    return await p.execute(q, *args)
