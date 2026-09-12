# AGENTS.md — Execution Law

You are an executor agent working on the BAD FORM Systems Platform. These rules are
not suggestions. If a work order conflicts with this file, stop and ask the architect.

## The prime rules

1. **One work order at a time.** You implement exactly the vertical slice your work
   order describes: migration + API + UI + seed + smoke extension. Nothing else.
   If you notice an unrelated problem, note it in your report; do not fix it.
2. **Never invent scope.** Anything the work order does not specify is a question
   back to the architect, not a decision you make.
3. **No new dependencies.** Adding any package to `requirements.txt` or
   `package.json` requires a human-approved ADR in `docs/adr/`. No exceptions.
4. **Config, not forks.** Client-specific behaviour lives only in composition config
   (org `modules`, `settings`, `terminology`, theme tokens). Never branch code on a
   client's name. If config cannot express it, escalate.
5. **Raw SQL only.** No ORM, no query builder. Migrations are plain `.sql` files,
   one per change, applied in sorted order. Never edit an applied migration.
6. **Token-only styling.** Components read design tokens (CSS variables). Hard-coded
   colors, fonts, radii, or shadows in component code are a violation. The DAYBOOK
   anti-slop rules in CONVENTIONS.md are enforceable law.
7. **Compose, don't invent.** Build screens from the component gallery. If the
   gallery lacks a component you need, that is a separate design-system work order.
8. **Definition of done** — every work order ships all of:
   - migration applied cleanly on a fresh database
   - API covered by the smoke suite (`tests/smoke.py`)
   - UI reachable and rendering with seeded data
   - demo-yard seed updated so the feature is demonstrable
   - `docs/parity-ledger.md` row updated if the work order touches one

## Boundaries you never cross

- Nothing is pushed to a ledger except **drafts**. Never auto-approve transactions.
- Payroll, BAS, bank feeds, and general ledger are out of scope forever.
- Model APIs are called only through `backend/aigate.py`. Never import a provider
  SDK in feature code.
- Notifications are emitted only through `backend/notify.py`. Never send ad-hoc.
- Timeline events are written through `kernel/timeline.py` helpers.

## File discipline

- Backend route modules stay under ~400 lines; split by domain when they grow.
- Frontend components stay under ~250 lines.
- Every interactive element has a `data-testid` (kebab-case, stable).
- Python: stdlib + FastAPI + asyncpg style already in the codebase. Type hints on
  public functions. No comments that narrate the obvious.
- TypeScript: strict mode, explicit interfaces for all component props.

## Verification before you claim done

Run, and show output for:

```bash
cd platform && python -m pytest tests/ -x -q
python tests/smoke.py   # against a live backend with a fresh seed
cd frontend && npm run build
```

A claim of "done" without this output is a violation.
