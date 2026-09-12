# Sales walkthroughs — one per sector, five minutes each

Every demo yard resets from seed (`tests/smoke.py` proves the whole path daily).
Run `python3 backend/seed.py` style seeds or the smoke suite's `reset_and_seed`
to restore. The gallery at `/gallery` is the Foundry's catalogue — demo it at
the yard visit, then tick the same items in `/console`.

## Generic yard (kernel) — `demo`

Logins: office `owner@demo.local` / `demo-owner` · crew PIN `1111` (yard code `demo`).

1. **Desk** — morning nudge: what needs review, what to chase, licences expiring.
2. **Day board** → copy yesterday, print the day sheet PDF.
3. **Field** (phone, crew PIN): today's run, gate code on the job pack, clock on.
4. **Capture** a receipt → "READ CLEAN 0.94" → office **Inbox** → one-tap verify → draft lands in the ledger. Then capture rubbish → watch it route to review instead. This is the trust story: *the machine defers when unsure.*
5. **Job page** — live costing moving as time and receipts land; margin stamp.
6. Public pages, no install: quote accept token, site QR plate sign-in.

## Electrical trades — `voltline`

Logins: `owner@voltline.local` / `voltline-owner` · crew PIN `4321`.

1. Field crew hits **RAISE VARIATION** mid-job — dollars typed in the carpark.
2. Office approves with the authoriser's name → job value grows on the spot.
3. **CERTS**: new compliance certificate → numbered in their series → issue → it's immutable → PDF on letterhead.
4. Sister yard `sitecast` (concrete): same platform, job is called a "pour" everywhere — terminology is config, not a fork.

## Civil / earthmoving — `kemgrade`

Logins: `owner@kemgrade.local` / `kemgrade-owner` · operator PIN `7777`.

1. Operator cab: **PRE-START** with a failed check → that machine's dockets are refused (409) until a fresh pass. Office gets the notification.
2. **HIRE DOCKET**: wet/dry rate engine — 2 booked hours still bills the 8-hour minimum. Tally counter for loads with 72px glove targets.
3. Head contractor signs on glass → supervisor approves → daily docket PDF emails itself.
4. Quarry ticket photo → tonnage lands on the register against the job.

## Fabrication — `steelhaus`

Logins: `owner@steelhaus.local` / `steelhaus-owner` · welder PIN `5555`.

1. **SHOP**: heat register, NDI, the offcut rack. Allocate an offcut — its heat number follows it to the new work order. *Traceability survives the rack.*
2. Apply the CC2 ITP to a fresh work order — six stages stamped on, hold points photo-gated.
3. **Kiosk** (`/kiosk` on the bolted-down tablet): yard code once, PIN, two buttons — SIGN OFF and PHOTO. A hold point without a photo refuses politely.
4. Heat cert capture → verified → traceable lot booked automatically.
5. **MDR PACK ↗** on the job page: stages, heats, NDI — one PDF, gaps declared.

## Fleet / transport — `redline`

Logins: `owner@redline.local` / `redline-owner` · driver PIN `8888`.

1. **FLEET**: two depots, attachments on carriers, meter hours live from pre-starts.
2. **WORKSHOP**: the excavator is 10h over its 250h service — the queue caught it from a pre-start meter reading, nobody kept a spreadsheet.
3. **FLOATS**: book a float — mobilisation flat fee + per-km, charged to the job.
4. **SMS EVIDENCE** (the HVNL 2026 closer): the vault composes itself from pre-starts, services and corrective actions already happening. One button: the auditor's evidence pack PDF, gaps named.

## The Foundry — `/console`

Staff key required (never a client login; every action audited).

1. **Instances**: fleet health — review queues, extraction accuracy, ledger state. AI config and impersonation per client.
2. **The Foundry**: intake once (trading name, ABN, brand colour, yards, their word for "job") → tick the menu → BUILD. Log in as the generated owner: their name on the masthead, their prefix on job one, their colour on the mark — from commit zero.
3. **Importers**: contacts CSV and job history CSV → their real data before the first walkthrough ends.
