# WO-NNN: <title>

- **Phase**: <phase>
- **Status**: draft | approved | in-progress | done
- **Parity-ledger rows touched**: <rows or none>

## Goal

One paragraph. What exists when this work order is done that does not exist now,
and who uses it.

## Scope (the whole slice, nothing else)

- Migration: <tables/columns added, or none>
- API: <endpoints added/changed>
- UI: <screens/components touched>
- Seed: <what the demo yard gains>
- Smoke: <checks added to tests/smoke.py>

## Out of scope

Explicit list. Anything not listed under Scope is out of scope by default.

## Acceptance criteria

- [ ] Fresh `db.migrate()` passes on an empty database
- [ ] `python -m pytest tests/ -x -q` passes
- [ ] `python tests/smoke.py` passes including the new checks
- [ ] `npm run build` passes
- [ ] Demo yard demonstrates the feature end-to-end
- [ ] <feature-specific criteria>

## Questions for the architect

Anything ambiguous goes here before implementation starts, not into improvised code.
