# BAD FORM Systems Platform

Modular operations IMS + field app for trade, civil, fabrication, and fleet businesses.
One kernel, plug-in sector packs, token-driven theme packs. The client's ledger
(Xero/MYOB) always stays — this platform is the operations layer beside it.

This directory is a self-contained monorepo, deliberately isolated from the legacy
trades IMS at the repository root. Extract it to its own repository at any time with
`git subtree split --prefix=platform`.

## Layout

```
platform/
  AGENTS.md            Execution law for AI agents working on this codebase
  CONVENTIONS.md       Stack, naming, styling, and process conventions
  docs/
    charter.md         Platform charter (vision, architecture, phases)
    parity-ledger.md   Table-stakes capability matrix and build status
    work-orders/       Work-order template and completed work orders
  backend/             FastAPI + PostgreSQL (raw SQL, no ORM)
    kernel/            Sector-agnostic routes (auth, jobs, capture, invoicing...)
    packs/             Sector packs: trades, civil, fab, fleet
    foundry/           Client build constructor
    migrations/        Kernel SQL migrations
  frontend/            Vite + React + TypeScript
    src/design/        Token schema and theme packs (DAYBOOK base)
    src/components/    Component library (Ticket, Stamp, Sheet...)
    src/gallery/       Living component gallery (doubles as the Foundry menu)
    src/cc/            Command Center screens
    src/field/         Field PWA screens
    src/kiosk/         Workshop kiosk shell
    src/foundry/       Foundry build-constructor screens
  tests/               Unit tests + live smoke suite (embedded PostgreSQL)
```

## Run

```bash
# Backend (needs PostgreSQL; tests use embedded PG automatically)
cd platform/backend && pip install -r requirements.txt
uvicorn main:app --port 8010

# Frontend
cd platform/frontend && npm install && npm run dev

# Tests
cd platform && python -m pytest tests/ -x -q
python tests/smoke.py            # against a live backend
```

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://badform@localhost/badform_platform` | PostgreSQL connection |
| `JWT_SECRET` | dev value | Token signing |
| `EXTRACTOR_MODE` | `fixture` | `fixture` (deterministic) or `live` (AI gateway) |
| `STORAGE_MODE` | `local` | `local` disk or object store |
| `LOCAL_STORAGE_DIR` | `/tmp/badform-platform-storage` | Local storage root |
