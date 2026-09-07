import os, jwt, bcrypt
from datetime import datetime, timezone, timedelta
from fastapi import Request, HTTPException
import db

ALGO = "HS256"

def hash_pw(p): return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()
def check_pw(p, h): return bool(h) and bcrypt.checkpw(p.encode(), h.encode())

def make_token(user):
    payload = {"sub": str(user["id"]), "org_id": str(user["org_id"]), "role": user["role"],
               "exp": datetime.now(timezone.utc) + timedelta(hours=12)}
    return jwt.encode(payload, os.environ["JWT_SECRET"], algorithm=ALGO)

async def current_user(request: Request):
    h = request.headers.get("Authorization", "")
    if not h.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(h[7:], os.environ["JWT_SECRET"], algorithms=[ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
    u = await db.fetchrow("SELECT * FROM users WHERE id=$1", payload["sub"])
    if not u:
        raise HTTPException(401, "User not found")
    u.pop("password_hash", None); u.pop("pin_hash", None)
    return u

def require(*roles):
    async def dep(request: Request):
        u = await current_user(request)
        if u["role"] not in roles:
            raise HTTPException(403, f"Requires role: {', '.join(roles)}")
        return u
    return dep
