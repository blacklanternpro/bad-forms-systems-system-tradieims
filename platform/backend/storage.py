"""Binary storage: local disk by default; object-store adapter slot for production."""
import os
from pathlib import Path

STORAGE_MODE = os.environ.get("STORAGE_MODE", "local")
LOCAL_DIR = Path(os.environ.get("LOCAL_STORAGE_DIR", "/tmp/badform-platform-storage"))


def _path(key: str) -> Path:
    safe = key.replace("..", "_")
    p = LOCAL_DIR / safe
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


async def put_object(key: str, data: bytes) -> str:
    if STORAGE_MODE != "local":
        raise RuntimeError(f"Storage mode {STORAGE_MODE} not configured")
    _path(key).write_bytes(data)
    return key


async def get_object(key: str) -> bytes:
    if STORAGE_MODE != "local":
        raise RuntimeError(f"Storage mode {STORAGE_MODE} not configured")
    p = _path(key)
    if not p.exists():
        raise FileNotFoundError(key)
    return p.read_bytes()
