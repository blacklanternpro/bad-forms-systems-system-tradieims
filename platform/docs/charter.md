# Platform Charter

## What this is

One platform composed per client: a **kernel** (everything every yard needs),
**sector packs** (trades, civil, fab, fleet — plug-ins), and **theme packs**
(token-driven reskins over the DAYBOOK base language). The client's ledger stays;
we build the operations layer beside it and push **drafts only**.

## The core primitive

Every sector's paper artifact — wholesaler docket, quarry ticket, heat cert,
pre-start, timesheet — is a **capture type** flowing through one pipeline:

photo/voice → extraction (AI gateway, confidence-scored, arithmetic-checked)
→ verify gate (auto-fast-track or dashboard review queue with notification)
→ allocation (job / PO / time entry) → ledger draft (image attached, bookkeeper
is the final gate).

Sector packs contribute capture *schemas*, screens, seeds, and smoke checks —
never new pipelines.

## Platform laws

1. The ledger stays. Drafts out, statuses back, nothing else crosses.
2. Config, not forks. Client customisation = modules + theme + terminology.
3. Crew simplicity beats feature depth. If the crew won't open it, it doesn't ship.
4. Every number has a docket behind it (provenance drill from any figure).
5. Trust is a feature: full data export, per-client DB isolation, audit logs.

## Phases

0 charter/scaffold · 1 DAYBOOK design system · 2 kernel (ops/commercial/trust/
retrieval spines) · 3 trades pack (parity with legacy IMS) · 4 civil pack ·
5 fab pack + kiosk · 6 fleet pack (HVNL 2026 CoR/SMS evidence) · 7 the Foundry +
platform console. Parity-ledger rows gate sales-readiness throughout.

## Tenancy

One codebase, instance-per-client (own database + app instance), provisioned by
the Foundry with the client's imprint from commit zero. Multi-yard clients are
org rows inside their instance.
