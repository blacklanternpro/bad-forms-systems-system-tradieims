# CONVENTIONS.md

## Stack (fixed)

- Backend: Python 3.12, FastAPI, asyncpg, PostgreSQL 16+. Raw SQL. No ORM.
- Frontend: Vite, React 18, TypeScript (strict), react-router-dom. No CSS framework;
  plain CSS with design tokens. No component library imports.
- PDF: reportlab. Auth: PyJWT + bcrypt. Tests: pytest + a live-backend smoke suite.
- AI: only via `backend/aigate.py` (provider adapters; `EXTRACTOR_MODE=fixture` in CI).

## Naming

- SQL: snake_case tables and columns; money as `*_cents integer`; timestamps
  `timestamptz`; dates AWST-local via `svc.today_awst()`. Primary keys
  `uuid DEFAULT gen_random_uuid()`. Every tenant-scoped table has `org_id`.
- Migrations: `NNNN_name.sql` (kernel) or `packs/<pack>/migrations/NNNN_name.sql`.
  Version keys are `kernel:NNNN_name.sql` / `<pack>:NNNN_name.sql`.
- API: kernel routes under `/api/...`; pack routes under `/api/<pack>/...`;
  field routes under `/api/field/...`; public token routes under `/api/public/...`.
- data-testid: kebab-case, `<screen>-<element>`, stable across refactors.

## Roles

`owner` (everything), `office` (operations, no admin console writes, no demo reset),
`crew` (Field/kiosk only, PIN auth). Platform staff use the platform console with a
separate staff token; every staff action is audit-logged.

## DAYBOOK design language (base theme) — enforceable rules

Light, high-end print modernism. The two visual atoms are the **ticket** (one chit
anatomy for jobs, dockets, quotes: code, hairline rules, stamp) and the **stamp**
(statuses as ink stamps).

Required:
- Paper-light ground, ink text, hairline ledger rules (1px, low-contrast).
- Tabular numerals for every figure (`font-variant-numeric: tabular-nums`).
- Two typefaces only: the UI grotesque and the mono face for codes/money.
- Motion only confirms an action (≤150ms); nothing decorative.
- Empty, loading, and error states designed for every screen.
- Mobile-first; glove-mode variants honour `--tap-min` and `--contrast-boost`.
- Print parity: day sheet, docket, quote, and claim each have a print-clean form.

Forbidden (violations, not style choices):
- Gradients, glassmorphism, blur overlays, purple-on-dark SaaS defaults.
- Stock illustration, emoji in product UI, decorative animation.
- Hard-coded visual values in components (tokens only).
- Inventing a new visual pattern when a gallery component exists.

## Process

- Work orders live in `docs/work-orders/`; use `TEMPLATE.md`. One PR per work order.
- A phase gate = fresh migrate + seed + full smoke pass + frontend build.
- `docs/parity-ledger.md` is updated whenever a capability lands or is deferred.
- Never edit an applied migration; add a new one.
