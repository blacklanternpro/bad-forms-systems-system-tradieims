from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import db


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.migrate()
    yield
    await db.close()


app = FastAPI(title="BAD FORM Systems Platform", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"ok": True, "service": "badform-platform"}
