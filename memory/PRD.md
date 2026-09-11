# BAD FORM Trades Operational IMS — PRD

## Original problem statement (condensed)
Near-total ute-to-draft package for South West WA sparkies/plumbers/concreters (sole trader → partnership/Pty Ltd). Sits in front of Xero/MYOB. Command Center + Field PWA that can quote, schedule a gang, photograph slips through a verify gate, sign same-day extras on-device and by emailed PDF, take a deposit draft, push Xero drafts with proof attached. Industrial amber-on-void, not Inter SaaS. Not SimPRO, not the ledger, no civil/wet-hire/SoR/fab/CoR.

## Agreed stack deviations (user-approved 2026-06)
- FastAPI (port 8001, /api prefix) + **PostgreSQL 16** (real SQL migrations, asyncpg) instead of Next.js/Vite/pg — platform ingress constraint. NOT Mongo.
- Single React app (port 3000) hosting Command Center (/cc), Field PWA (/f/{org_slug}), public /q/{token}, /s/{token}.
- Postgres self-heals via /app/scripts/ensure_pg.sh (data dir /app/pgdata), run from backend lifespan.
- Uploads in Emergent Object Storage (storage.py), refs in `documents` table, served via /api/files/{doc_id}?auth=.
- Receipt extraction: real GPT-5.4 vision via Emergent LLM key (EXTRACTOR_MODE=ai; fixture mode for CI). Xero MOCKED drafts-only (XERO_MODE=mock). Mail stubbed → mail_outbox + quote_sends/variation_sends rows. MYOB not_commissioned.
- Tests: Python (smoke.py) + platform testing agent instead of Vitest/Playwright.

## Actors
Owner (email+pw, CC only, no PIN) · Bookkeeper (email+pw, inbox + push/retry only) · Crew (PIN, Field only) · Customer/builder (no account, /q and /s only). No public signup, no DocuSign.

## Schema (Postgres, backend/migrations/001_init.sql)
organisations (settings.trades exact JSON), users, clients, sites, quotes(+lines,+sends), jobs (billing quoted|tm, 6 statuses), job_assignments (unique job/user/date), job_stages, time_entries (minutes computed), assets (van|vehicle only), documents (9 kinds), docket_extractions (needs_verify|verified|rejected|failed), variations (VO-00n per job, signed requires signature_id CHECK), variation_sends, job_extra_lines (travel|callout|other), supplier_receipts (upsert on extraction_id), signatures, xero_drafts (deposit|final|tm|bill, pending_push|pushed|failed), sync_outbox (unique org+client_id dedupe), certificates, mail_outbox.

## Money rules (money.py, svc.py)
GST = floor(cents*qty*0.10+0.5). Cost = time×labour + receipts (no markup). Quoted revenue = quoted_cents + signed VOs + extras. T&M revenue = time×charge + signed VOs + extras + receipts×(1+markup_bps/10000). Final ACCREC = (quoted−deposit) + signed VOs + extras; attach signed VO PDFs + ≤5 after photos; bill-to contact; deposit draft has no VOs and is NEVER auto-pushed; never record payment.

## Implemented (2026-06, all verified by smoke.py 41/41 + testing agent iteration_1: 100%)
- Migrations + seeds: SW Electrical Demo (company, deposit 0, rexel/middys, markup 1000bps) & SW Concrete Demo (partnership, deposit 5000, mix dockets, accepted quote → deposit draft pending_push). Each: 2 owners (+jake1987king@gmail.com extra owner on electrical), 1 bookkeeper, 3 crew (PINs 1234/2345/3456), 2 clients, 3 sites, 4 jobs, today's assignments, 3 needs_verify, 1 verified receipt, draft quote, signed VO, 2 vans. Banner SYNTHETIC DEMO — NOT A CLIENT.
- Auth: JWT login (crew blocked), PIN login per org slug (owners can't PIN). Bookkeeper 403 on scheduling/quotes.
- CC screens: Day Board (copy previous day = assignments only, NO JOBS THIS AWST DAY empty state), Quotes (create/send/PDF/mark-accepted/accept-link), Jobs (+RECALL DUE filter, MISSING PO flag, detail w/ margin tokens + prepare draft), Inbox (verify gate → receipt upsert + optional ACCPAY bill draft w/ image), Ledger Drafts (mock push XERO-MOCK-*), Directory, Modules (civil/fab/fleet NOT COMMISSIONED; API routes 501).
- Field: PIN → Today → Job; sheets Capture (before/after/docket, client compress ≤1600px JPEG 0.7 + server enforce), Hours, Extra (VO canvas sign OR email-to-sign w/ bill-to default + NO CUSTOMER EMAIL guard + travel/callout lines), Pack PDF. IndexedDB outbox, OFFLINE — QUEUED n, dedupe via sync_outbox client_id, per-op token (PIN switch can't steal queue).
- Public: /q accept (name + optional canvas, creates job + deposit draft pending_push, 409 on re-accept, decline), /s sign (first-wins, 409 on second path, token revocation on canvas sign), letterhead PDFs (reportlab: trading name, ABN, "not an invoice"), signed-copy emails queued to recipient + owner_copy_email.
- Design: ground #0a0c0f / surface #11141a / card #161b22 / border #262f3d / amber #f59e0b / steel #94a3b8, Space Grotesk + JetBrains Mono, 8px chamfers, amber L-marks, 40px grid. No Inter/purple/shadcn-default chrome.

## Added 2026-09 (owner morning ops)
- Yard clone (demo only): owner RESET DEMO YARDS on the synthetic banner wipes both SW Electrical and SW Concrete and reseeds a clean AWST morning; returns a fresh JWT. Bookkeeper/crew 403. Does not replace P2 dump/restore for real yards.
- Recall reminders: GET /api/nudge lists this-week + overdue open recalls; Day Board morning card (today AWST only); Jobs THIS WEEK filter; Job Detail recall_on editor.
- Cert numbering: certificates.cert_no unique per org; Field CERT sheet prefills ES-0001 (settings.trades.cert_prefix); duplicate 409; required on fill-form and attach-PDF.
- Quote follow-ups: sent quotes with valid_until within 7 days (incl. overdue) flagged follow_up; Quotes FOLLOW UP filter; Day Board QUOTES TO CHASE. Status is not auto-expired.

## Backlog / not this run (per spec appendix)
### Added 2026-06 (feature pass 2, verified via API tests + UI screenshots)
- Certificates: Field CERT sheet → POST /api/field/jobs/{id}/certs (PDF only, 400 otherwise) → certificates row + cert_pdf document; auto-queues mail to bill-to email (status queued, mail_outbox kind=certificate) or stored if no email; listed on job pack PDF.
- Voice timesheets: Capture sheet VOICE (MediaRecorder, 10s auto-stop) → voice_note document + docket_extraction kind=timesheet_voice needs_verify; Inbox renders audio player + date/on/off inputs; verify requires started_at/ended_at → creates time_entry for the uploading crew member (margin picks it up), no supplier_receipt.
- Print day sheet: GET /api/dayboard/sheet.pdf?date_str=&auth= (letterhead one-pager: jobs, addresses, crew windows) + PRINT DAY SHEET button on Day Board.

### Added 2026-06 (feature pass 3, verified via API tests + UI)
- Cert templates: Field CERT sheet now has FILL FORM (cert no, description, visual/earth/polarity pass-fail, insulation MΩ, RCD ms, result) → POST /api/field/jobs/{id}/certs/form generates a letterhead cert PDF (pdfs.cert_pdf, signed by the crew member) and stores/queues it identically to uploads (_store_cert helper). ATTACH PDF tab retained.
- Whisper transcription: voice_note capture now transcribes via whisper-1 (emergentintegrations OpenAISpeechToText) then parses with gpt-5.4 into {transcript, ts_start, ts_end, note} stored in extraction.extracted; Inbox shows the transcript + suggested window and pre-fills ON/OFF for one-tap VERIFY → TIME ENTRY. Handles webm/mp3/m4a/wav mimes. Fixture mode returns deterministic transcript.

 P2: DocuSign, negative VOs, SMS, van stock, cert templates, retention, MYOB live, civil/earthworks IMS (separate prompt), yard clone dump/restore. Never: payroll/BAS/bank feeds, wet-hire/SoR/Gantt in trades IMS.

## Key files
backend: server.py, db.py, auth.py, money.py, svc.py, pdfs.py, extractor.py, xerostub.py, storage.py, seed.py, routes_cc.py, routes_fp.py, migrations/{001_init,002_cert_no}.sql
frontend: src/App.js, index.css (design tokens), lib/{api,outbox}.js, components/SigPad.jsx, cc/{Layout,DayBoard,Quotes,Jobs,JobDetail,Inbox,Ledger,Directory,Modules}.jsx, field/{Field,FieldJob}.jsx, pages/{Login,PublicQuote,PublicSign}.jsx
ops: /app/scripts/ensure_pg.sh, /app/tests/smoke.py, /app/memory/test_credentials.md
