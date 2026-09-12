# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary (confirmed): **owner** and **office** staff at a yard desk, in the Command Center. They start the day on Desk (nudges, chase list, licences), dispatch on the day board, run jobs and quotes, and clear the capture Inbox. Design work defaults to this surface.

Other audiences the product already serves, not the default design target:

- **Crew** (PIN): Field PWA on a phone in the ute or cab; workshop **kiosk** on a bolted-down tablet (yard code + PIN, two-control screens).
- **Platform staff**: Foundry and platform console, separate staff token, every action audit-logged. Never a client login.
- **Customer / builder**: no account. Public token pages for quote accept and site QR sign-in.

## Product Purpose

BAD FORM Systems is the operations layer beside a yard's existing ledger. It lets a trade, civil, fabrication, or fleet yard quote, dispatch, capture paper artifacts from the field, verify them, cost the job live, and push **drafts only** into Xero/MYOB.

Success is that the crew will actually open it, every number on a job has a docket behind it, and the bookkeeper remains the final gate on money.

Whether the current instance is a sales walkthrough or a first live yard is **undecided**; office-desk surfaces are still the ones to design for.

## Positioning

A neighbouring IMS can add field capture or a Xero button. This product's claim they cannot copy without becoming something else:

1. **The ledger stays.** Drafts out, statuses back. Payroll, BAS, bank feeds, and the general ledger are out of scope on purpose.
2. **One capture pipeline.** Every sector's paper (wholesaler docket, quarry ticket, heat cert, pre-start, timesheet) is a capture type through photo/voice → extract (confidence-scored) → verify gate → allocate → ledger draft with the image attached.
3. **Config, not forks.** Client difference is modules + terminology + theme, provisioned by the Foundry with the client's imprint from commit zero. Instance-per-client (own database). Multi-yard clients are org rows inside that instance.

## Operating Context

The product code lives in `platform/` (FastAPI + Vite/React). The repository-root `frontend/` and `backend/` trees are a leftover legacy trades IMS and are not this product.

Yards run on **AWST**. The office app is a PWA at `/desk`, `/dayboard`, `/jobs`, `/quotes`, `/inbox`, `/admin`, plus pack screens (Certs, Plant, Dockets, Shop, Fleet) when that module is live. Field is `/field`. Kiosk is `/kiosk`. Staff Foundry is `/console`. Gallery `/gallery` is the living component catalogue and the Foundry menu.

Dates, day sheets, and "today" are AWST-local. Money is integer cents. Every tenant-scoped table has `org_id`.

Evaluation today uses seeded synthetic yards and five-minute sales walkthroughs (`platform/docs/walkthroughs.md`). Accounting in this codebase is the `xero-mock` adapter; live OAuth is a later work order behind the same interface.

## Capabilities and Constraints

Confirmed in the running platform (kernel unless noted):

- Enquiries → quotes → jobs; day/week boards; live costing; capture pipeline with review queue; timesheets (not payroll); invoice drafts including deposits and progress claims; chase list; notifications; WIP/margin reports; global search; yard admin (users/PINs, modules, brand tokens, data export).
- Trades pack: variations from the field, numbered certificates.
- Civil pack: plant register, wet/dry hire, dispatch-blocking pre-starts, hire dockets, quarry tickets.
- Fab pack: ITP/hold points, heat/mill certs, NDI, offcut rack, MDR pack, kiosk.
- Fleet pack: depots, float booking, hour-meter service plans, CoR/SMS evidence vault.
- Foundry: intake → ticklist → imprinted instance; contacts/job-history CSV import; **pilot mode** (kernel/capture only; sector packs stay dark).
- Trust: full JSON export, per-client DB isolation, audit logs.

Hard constraints for anyone building on this:

- Stack is already chosen: Python 3.12, FastAPI, asyncpg, raw SQL, PostgreSQL 16+; Vite, React 18, TypeScript strict, react-router-dom. No CSS framework, no component-library imports, no new npm/pip dependency without an ADR.
- Token-only styling. Compose screens from the gallery. DAYBOOK anti-slop rules in `platform/CONVENTIONS.md` are execution law, not optional taste.
- Model APIs only through `backend/aigate.py`. Notifications only through `backend/notify.py`.
- `data-testid`s are stable public contracts.
- Pricing, tiers, and commercial packaging are **out of this record** (confirmed). Do not invent them.

Deliberately absent: payroll, BAS, bank feeds, general ledger, Gantt for trades.

## Brand Commitments

- Trading name: **BAD FORM Systems**. Login and console wordmark is that name set in type — there is **no logo file**, mark, or brand kit.
- No company ABN, letterhead asset, or voice guide is on hand for BAD FORM Systems itself. The ABN and Pty Ltd name on the `systems` showcase org are synthetic demo data.
- Client instances imprint their own trading name on the masthead and may retint `--mark` from Foundry. That is their identity, not ours.
- Binding product voice: crew simplicity beats feature depth; sentence-case chrome; stamps stay uppercase because they are status marks.

## Evidence on Hand

Real, citable:

- Product law: `platform/docs/charter.md`, `platform/AGENTS.md`, `platform/CONVENTIONS.md`, `platform/docs/parity-ledger.md`.
- Walkthrough scripts: `platform/docs/walkthroughs.md`.
- Seeded synthetic yards (all marked demo): `systems` (showcase, all packs), `demo` (kernel), `voltline` / `sitecast` (trades), `kemgrade` (civil), `steelhaus` (fab), `redline` (fleet).
- Showcase office login (demo only): `bad-form` / `systems`. Crew PIN `2468`, yard code `systems`.

Must not fabricate:

- Real client names, logos, testimonials, case studies, press, or win rates.
- Live ledger connections, real invoices, or production extraction accuracy.
- Any price, seat count, or plan name.

## Product Principles

1. **The ledger is the boundary.** We make drafts with proof attached; we never become the books.
2. **One pipeline, many chits.** New sector paper is a capture type, never a new product.
3. **Compose the client.** Modules, terminology, and tokens — never a named fork.
4. **Crew simplicity is the ship gate.** If it needs a training day, it does not ship.
5. **Provenance and exit.** Every figure drills to a docket; every client can take their data.

## Accessibility & Inclusion

Known product needs (no WCAG level was set):

- Mobile-first office and field.
- Glove-mode on field/kiosk: honour `--tap-min` (44px) and `--contrast-boost`.
- Empty, loading, and error states on every screen.
- Print-clean forms for day sheet, docket, quote, and claim.
