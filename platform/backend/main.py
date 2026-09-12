from contextlib import asynccontextmanager
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import db
import demo_virgin
import registry


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.migrate()
    if os.environ.get("SEED_ON_BOOT", "1") == "1":
        import seed_showcase

        await seed_showcase.seed_all_demo_yards()
    yield
    await db.close()


app = FastAPI(title="BAD FORM Systems Platform", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(demo_virgin.VirginMiddleware)

registry.mount(app)


@app.get("/api/health")
async def health():
    return {"ok": True, "service": "badform-platform"}
