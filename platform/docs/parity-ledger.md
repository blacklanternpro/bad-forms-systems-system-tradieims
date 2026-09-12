# Parity Ledger

Capability matrix against the incumbent field (SimPRO, AroFlo, Tradify, ServiceM8,
Assignar, CivDocs, Docketbook, FabOps, Pulse, CoRGuard). Every row is **Core**
(kernel, on by default), **Available** (module, commissioned per client), or
**Absent** (deliberate, with the pitch answer). No sector is sales-ready until every
row is `built` or `deferred` with a stated answer.

Status values: `built` | `partial` | `planned` | `deferred`.

## Core (kernel, default on)

| Capability | Status | Where |
| --- | --- | --- |
| Enquiries → quote pipeline, client history | built | kernel/routes_clients, routes_quotes |
| Quoting with templates + effective-dated price books | built | kernel/routes_quotes |
| Supplier price-file import | built | kernel/routes_quotes (CSV import) |
| Scheduling: day board, week/forward board, assignments | built | kernel/routes_jobs |
| Recurring jobs | built | kernel/routes_jobs (recur rules on jobs) |
| Purchase orders linked to jobs, supplier-invoice matching | built | kernel/routes_procure |
| Live job costing (labour + materials + plant while job runs) | built | kernel/routes_jobs |
| Capture pipeline: photo/voice → extract → verify gate → allocate | built | kernel/routes_capture, aigate |
| Extraction confidence routing + dashboard review queue | built | aigate + routes_capture |
| Timesheets + payroll-export file (never payroll) | built | kernel/routes_field, routes_reports |
| Invoice drafts incl. deposits + progress claims | built | kernel/routes_invoice |
| Two-way invoice status (drafts out, sent/paid/overdue back) | built | ledger adapter mock + routes_invoice |
| Money-on-the-table chase list | built | kernel/routes_invoice |
| Notification bus + in-app centre + email/SMS outbox | built | notify + routes_notify |
| Live reporting: WIP, profitability, post-job margin | built | kernel/routes_reports |
| Global search | built | kernel/routes_reports |
| Per-job timeline, photos, documents/drawings, comms log | built | kernel/routes_jobs |
| Offline field capture (sync outbox) | partial | frontend/src/lib/outbox.ts — captures queue offline and replay on reconnect; full offline job pack (read cache) is a later work order |
| Xero/MYOB draft sync | partial | ledger.py (mock adapter; real OAuth is a later work order behind the same interface) |
| Yard admin console (ledger connect, users/PINs, modules, brand editor) | built | kernel/routes_org + screens/Admin |
| Platform console (god-mode): provisioning, health, AI per client, audited impersonation | built | kernel/routes_platform + screens/Console |
| The Foundry: intake → ticklist → imprint-from-commit-zero instance | built | kernel/routes_platform (foundry) + screens/Console |
| Onboarding importers (contacts CSV, job history CSV, price files) | built | routes_platform importers + routes_quotes price import |
| Pilot mode (capture pipeline only, $2.5k tier) | built | foundry pilot flag; packs stay dark |
| AI gateway: provider chain, thresholds, budget config, fixture mode | built | aigate.py + routes_platform ai config |
| Golden-set extraction evals in CI | built | tests/test_extraction.py |

## Available (modules)

| Capability | Status | Where |
| --- | --- | --- |
| Inventory / van stock | deferred | pitch: pilot scope decision per yard; schema reserved |
| Customer asset register + maintenance contracts | built | fleet pack: register, service_plans, workshop queue |
| CoR/SMS evidence vault (HVNL 2026 five outcomes) | built | fleet pack: composed vault + auditor pack PDF |
| Retention / holdbacks | partial | invoice claims support retention percent |
| Subcontractor job cards | deferred | pitch: subbies captured as crew users in v1 |
| Customer portal (job status) | partial | public quote/sign token pages built; status page planned |
| WHS/SWMS form builder + incident capture | partial | incident capture built (kernel capture type); builder deferred |
| Crew licences/tickets/inductions register + expiry alerts | built | kernel/routes_org (licences) |
| Site QR plates (scan to sign in/out) | built | public token sign-in page |
| Job map view / geo-stamped capture | deferred | geo stamp recorded on captures; map view deferred |
| Payment links on invoices | deferred | pitch: ledger sends the invoice; links via ledger |

## Absent (deliberate)

| Capability | Answer |
| --- | --- |
| Payroll, BAS, bank feeds, general ledger | The ledger stays. That is the product's core promise, not a gap. |
| Gantt for trades | Day/week boards match how yards actually dispatch. Civil gets SoR + schedules, not Gantt. |
