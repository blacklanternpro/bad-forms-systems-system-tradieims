from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent / ".env")

import os, logging, subprocess
from contextlib import asynccontextmanager
from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware
import db, seed, storage

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("badform")

@asynccontextmanager
async def lifespan(app: FastAPI):
    subprocess.run(["bash", "/app/scripts/ensure_pg.sh"], capture_output=True, timeout=180)
    await db.init_pool()
    await db.migrate()
    try:
        storage.init_storage()
    except Exception as e:
        logger.error(f"storage init failed: {e}")
    try:
        await seed.seed_all()
    except Exception as e:
        logger.exception(f"seed failed: {e}")
    yield
    await db.pool.close()

app = FastAPI(title="BAD FORM Trades IMS", lifespan=lifespan)

import routes_cc, routes_fp
api = APIRouter(prefix="/api")
api.include_router(routes_cc.r)
api.include_router(routes_fp.r)

@api.get("/health")
async def health():
    ok = await db.fetchval("SELECT 1")
    return {"ok": ok == 1, "demo_banner": "SYNTHETIC DEMO — NOT A CLIENT"}

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
