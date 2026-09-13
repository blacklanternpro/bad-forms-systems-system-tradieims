---
version: 1
slug: "platform-frontend-src-screens-field-fieldtoday-tsx"
primary_target: "platform/frontend/src/screens/field/FieldToday.tsx"
related_targets: ["field","kiosk","platform/frontend/src/screens/field/FieldJob.tsx","platform/frontend/src/screens/Kiosk.tsx","platform/frontend/src/shell/FieldShell.tsx"]
---

# Surface brief — Field app (/field, /field/jobs/:id, /kiosk)

Scope: the crew's phone app (Today board, job pack, capture sheet, field shell) and the workshop kiosk. Mode: Operate. Recast of existing surfaces inside the established neutral foundation; routes, endpoints, flows, copy, and `data-testid`s preserved. No roll: this is an extension of the world the Desk committed, not a new one.

Audience and job: a crew member (PIN login) on a phone in the ute or on site, often in gloves and glare; a welder at a bolted-down tablet in the shed. Job: know where to go and in what order, get through the gate, clock on, sign off the next stage, put paperwork in with one thumb, and get back to work.

Constraints: token-only CSS, IBM Plex Sans/Mono, sentence-case chrome, stamps uppercase, yellow is status only, motion ≤150ms, `--tap-min` (44, glove 60) everywhere, drawn icons only, loading/empty/error states designed. Offline: the capture outbox is visible when it holds anything. Accent bound to `--mark` so client paint lands in one place.

## Direction contract

THESIS: The field app is the crew's run sheet: one column, read top to bottom in the order the day is worked, every action a full-width verb under the thumb. It refuses the dashboard of tiles and the desktop screen shrunk to a phone.

OWN-WORLD: The Desk's neutral foundation carried to a phone: ground `#fafaf9`, white rows on whisper hairlines, ink verbs, tinted stamps, 6px radii, drawn 1.5-stroke line icons, tabular figures. Recognisable with content removed as a single white run of rows under one title line, a masthead with a wordmark, and a three-slot bottom bar.

STORY: The crew member opens the app, sees today's run in order with site and time window, taps a job, reads the gate code and site contact large enough to use at the gate, clocks on, signs off stages as they go, captures paperwork with the camera, and leaves knowing it has gone to the office or is waiting in the outbox.

FIRST VIEWPORT (390 wide): Masthead with wordmark, role stamp and outbox count. Title "Your run — {weekday date}" with a Today / Tomorrow segmented control beneath. Then the run: numbered rows (order disc, code and title, site and window, chevron), each a full-row link. Bottom bar: Today, Glove, Sign out as icon-and-label tabs. Job pack: back link, code, title, client; gate and contact as large key rows; a clock panel with the primary verb; capture and module verbs; stages with a progress line and sign-off per row; drawings.

FORM: Recast of the incumbent field surfaces in the Desk's world (Option A "Neutral Product Foundation", seed 8927909e carried from the Desk round). No surface roll dealt; the user chose recast over comp-first.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

Unresolved: whether kiosk PIN entry should offer a numeric keyboard on tablets without touch; whether the field masthead should carry the org stamp colour from client paint.
