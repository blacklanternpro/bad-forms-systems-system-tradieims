---
version: 1
slug: "platform-frontend-src-screens-desk-tsx"
primary_target: "platform/frontend/src/screens/Desk.tsx"
related_targets: ["desk"]
---

# Surface brief — /desk (Desk, Command Center home)

Scope: the owner/office morning screen. Mode: Operate. Redesign of the whole surface; product truth, routes, endpoints, and `data-testid`s preserved.

Audience and job: owner or office staff at the yard desk, first thing, under office light. Job: clear what needs a look, get money moving, know who is where today. Actions must be one click from this screen.

Constraints: token-only CSS, IBM Plex Sans/Mono (pinned in CONVENTIONS.md; the comp's Inter-class sans is translated to Plex), sentence-case chrome, stamps uppercase, yellow is status only, motion ≤150ms, `--tap-min` and glove mode honoured, loading/empty/error states designed. Wordmark only, no logo mark (the comp's glyph is a defect, not a commitment). The accent slot is `--mark`, so a client brand retint repaints every accented atom at once.

## Direction contract

THESIS: The Desk is a ledger read left to right in the order the morning is worked: triage, money, dispatch. It refuses the dashboard of same-size metric cards and the single scrolling feed.

OWN-WORLD: Neutral product foundation. Ground `#FAFAF9`, white surfaces on whisper `#E4E4E7` hairlines, ink `#18181B`, muted `#71717A`, 6px radii, near-invisible offset shadows. One accent slot only: the primary verb, active state, list dots, and column links, all bound to `--mark` so client paint lands in one place. Tabular numerals for every figure. Recognisable with content removed as three quiet white columns under a single title line.

STORY: The visitor reads what is waiting, sees the exact dollars sitting uninvoiced or overdue, drafts an invoice or opens the review without leaving the page, checks the crew, prints the day sheet, and leaves.

FIRST VIEWPORT: Masthead, then one title line "The morning ledger — {date}". Below it three equal columns spanning the page. Left, Triage: stacked cards (captures waiting review, recalls, quotes to chase, licences expiring), each a full-row link with a right-hand affordance. Centre, Money on the table: one card led by the total in large tabular numerals, a thin rule, count line, then Uninvoiced jobs with a dark "Draft invoice" button per row, then Overdue invoices with amber dots. Right, Dispatch: today's crew allocation rows (initials, name, job chip) and an outline "Print day sheet" button. Each column closes with an arrow link. The primary action is the per-row "Draft invoice" in the centre column.

FORM: Candidate 3 "Morning Ledger Triptych" with inline direct actions, third of seven structures dealt; aesthetic Option A "Neutral Product Foundation", chosen from the second round of five. Seed key 8927909e.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

Approved comp: `.impeccable/mocks/decision/desk-neutral-foundation.png`.

Unresolved: whether the neutral base tokens roll out to every screen (assumed yes, they are the shared tokens) and whether the masthead's search/shortcut/bell chrome ships now (not in scope for this surface).
