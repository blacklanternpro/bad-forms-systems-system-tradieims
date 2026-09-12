import os
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-me")
STAFF_KEY = os.environ.get("PLATFORM_STAFF_KEY", "dev-staff-key")
ALGO = "HS256"
TTL_HOURS = 72

bearer = HTTPBearer(auto_error=False)


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def check_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except ValueError:
        return False


def make_token(user_id: str, org_id: str, role: str) -> str:
    payload = {
        "sub": str(user_id),
        "org_id": str(org_id),
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=TTL_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=ALGO)


def _decode(creds: HTTPAuthorizationCredentials | None) -> dict:
    if creds is None:
        raise HTTPException(401, "Missing token")
    try:
        p = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[ALGO])
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid token")
    return {"user_id": p["sub"], "org_id": p["org_id"], "role": p["role"]}


def require(*roles: str):
    async def dep(creds: HTTPAuthorizationCredentials | None = Depends(bearer)) -> dict:
        u = _decode(creds)
        if roles and u["role"] not in roles:
            raise HTTPException(403, "Forbidden for role")
        return u

    return dep


owner = require("owner")
staff = require("owner", "office")
anyone = require("owner", "office", "crew")
crew_only = require("crew")


async def platform_staff(creds: HTTPAuthorizationCredentials | None = Depends(bearer)) -> dict:
    if creds is None or creds.credentials != STAFF_KEY:
        raise HTTPException(401, "Platform staff key required")
    return {"role": "platform"}
