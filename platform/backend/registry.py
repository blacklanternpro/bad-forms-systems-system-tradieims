"""Module registry: single place where routers are mounted onto the app.

Kernel routers are always live. Sector packs are appended to PACKS as each
phase lands; every pack router is mounted under /api/<pack> and its endpoints
must gate themselves with kernel.common.require_module.
"""

from fastapi import FastAPI

from packs.civil import routes as civil_routes
from packs.trades import routes as trades_routes

from kernel import (
    routes_auth,
    routes_capture,
    routes_clients,
    routes_field,
    routes_invoice,
    routes_jobs,
    routes_notify,
    routes_org,
    routes_procure,
    routes_public,
    routes_quotes,
    routes_reports,
)

KERNEL = [
    routes_auth.r,
    routes_org.r,
    routes_clients.r,
    routes_jobs.r,
    routes_quotes.r,
    routes_capture.r,
    routes_procure.r,
    routes_invoice.r,
    routes_notify.r,
    routes_reports.r,
]

# (pack_name, router) — populated as sector packs land.
PACKS: list[tuple[str, object]] = [
    ("trades", trades_routes.r),
    ("civil", civil_routes.r),
]


def mount(app: FastAPI) -> None:
    # routes_field and routes_public carry their own /field and /public path
    # segments, so everything mounts under the single /api prefix.
    for router in KERNEL + [routes_field.r, routes_public.r]:
        app.include_router(router, prefix="/api")
    for pack_name, router in PACKS:
        app.include_router(router, prefix=f"/api/{pack_name}")
