#!/bin/bash
# Runs the FastAPI backend for local/demo use. Must run as root: the lifespan
# hook shells out to ensure_pg.sh, which needs root to manage the postgres cluster.
set -euo pipefail
cd "$(dirname "$0")/../backend"
PY="${PY:-/workspace/.venv/bin/python}"
exec "$PY" -m uvicorn server:app --host 0.0.0.0 --port "${PORT:-8001}"
