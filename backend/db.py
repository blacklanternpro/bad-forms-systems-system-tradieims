import os, json, asyncpg
from pathlib import Path

pool = None
MIG_DIR = Path(__file__).parent / "migrations"

async def init_pool():
    global pool
    pool = await asyncpg.create_pool(os.environ["POSTGRES_URL"], min_size=1, max_size=10,
        init=lambda c: c.set_type_codec('jsonb', encoder=json.dumps, decoder=json.loads, schema='pg_catalog'))
    return pool

async def migrate():
    async with pool.acquire() as c:
        await c.execute("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now())")
        done = {r["name"] for r in await c.fetch("SELECT name FROM schema_migrations")}
        for f in sorted(MIG_DIR.glob("*.sql")):
            if f.name not in done:
                async with c.transaction():
                    await c.execute(f.read_text())
                    await c.execute("INSERT INTO schema_migrations (name) VALUES ($1)", f.name)

def _d(r):
    return dict(r) if r is not None else None

async def fetch(sql, *args):
    return [dict(r) for r in await pool.fetch(sql, *args)]

async def fetchrow(sql, *args):
    return _d(await pool.fetchrow(sql, *args))

async def fetchval(sql, *args):
    return await pool.fetchval(sql, *args)

async def execute(sql, *args):
    return await pool.execute(sql, *args)
