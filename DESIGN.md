---
name: BAD FORM Systems — DAYBOOK
description: Paper-light ledger chrome for a yard's office desk. Ink verbs, hairline rules, tabular figures, one retintable accent slot.
colors:
  ink: "#18181b"
  mark: "#18181b"
  mark-ink: "#ffffff"
  ink-mute: "#63636b"
  ink-faint: "#8b8b94"
  paper: "#fafaf9"
  paper-raise: "#ffffff"
  paper-sink: "#f4f4f5"
  rule: "#e4e4e7"
  rule-strong: "#d4d4d8"
  stamp-paper: "#e8c547"
  stamp-ink: "#18181b"
  ok: "#2f6b4f"
  warn: "#b45309"
  bad: "#9b2335"
  hold: "#63636b"
  live: "#1f4d3a"
typography:
  display:
    fontFamily: "IBM Plex Sans, Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: "28px"
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "IBM Plex Sans, Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: "22px"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  title:
    fontFamily: "IBM Plex Sans, Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0"
  body:
    fontFamily: "IBM Plex Sans, Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "0"
  label:
    fontFamily: "IBM Plex Sans, Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.45
    letterSpacing: "0.02em"
  mono:
    fontFamily: "IBM Plex Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0"
    fontFeature: "tabular-nums"
  total:
    fontFamily: "IBM Plex Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: "38px"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.03em"
    fontFeature: "tabular-nums"
  stamp:
    fontFamily: "IBM Plex Sans, Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: "10px"
    fontWeight: 600
    lineHeight: 1.45
    letterSpacing: "0.06em"
  kiosk-title:
    fontFamily: "IBM Plex Sans, Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: "26px"
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  kiosk-label:
    fontFamily: "IBM Plex Sans, Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: "22px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "-0.02em"
rounded:
  sm: "4px"
  md: "6px"
  sheet: "12px"
  pill: "999px"
  round: "50%"
spacing:
  hair: "1px"
  xs: "6px"
  sm: "8px"
  gap: "12px"
  pad: "16px"
  tap-desk: "32px"
  tap-min: "44px"
  tap-thumb: "56px"
  tap-kiosk: "96px"
  page-max: "1440px"
components:
  button-default:
    backgroundColor: "{colors.paper-raise}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "{spacing.tap-min}"
  button-default-hover:
    backgroundColor: "{colors.paper-raise}"
    textColor: "{colors.ink}"
  button-primary:
    backgroundColor: "{colors.mark}"
    textColor: "{colors.mark-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "{spacing.tap-min}"
  button-primary-hover:
    backgroundColor: "{colors.mark}"
    textColor: "{colors.mark-ink}"
  button-accent:
    backgroundColor: "{colors.paper-raise}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "{spacing.tap-min}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-mute}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "{spacing.tap-min}"
  button-danger:
    backgroundColor: "{colors.paper-raise}"
    textColor: "{colors.bad}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "{spacing.tap-min}"
  button-sm:
    backgroundColor: "{colors.paper-raise}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "{spacing.tap-desk}"
  button-lg:
    backgroundColor: "{colors.paper-raise}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 18px"
    height: "52px"
  kiosk-tile:
    backgroundColor: "{colors.paper-raise}"
    textColor: "{colors.ink}"
    typography: "{typography.kiosk-label}"
    rounded: "{rounded.md}"
    padding: "18px 16px 18px 20px"
    height: "{spacing.tap-kiosk}"
  kiosk-tile-primary:
    backgroundColor: "{colors.mark}"
    textColor: "{colors.mark-ink}"
    typography: "{typography.kiosk-label}"
    rounded: "{rounded.md}"
    padding: "18px 16px 18px 20px"
    height: "{spacing.tap-kiosk}"
  pin-key:
    backgroundColor: "{colors.paper-raise}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "88px"
  state-panel:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "28px 20px"
  state-panel-error:
    textColor: "{colors.bad}"
    rounded: "{rounded.md}"
    padding: "28px 20px"
  field-bar-item:
    backgroundColor: "transparent"
    textColor: "{colors.ink-mute}"
    rounded: "{rounded.md}"
    padding: "8px 6px 6px"
    height: "{spacing.tap-thumb}"
  field-bar-item-active:
    backgroundColor: "{colors.paper-sink}"
    textColor: "{colors.mark}"
    rounded: "{rounded.md}"
    padding: "8px 6px 6px"
    height: "{spacing.tap-thumb}"
  run-number:
    backgroundColor: "{colors.mark}"
    textColor: "{colors.mark-ink}"
    typography: "{typography.mono}"
    rounded: "{rounded.round}"
    size: "32px"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.ink-mute}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "{spacing.tap-min}"
  chip-selected:
    backgroundColor: "{colors.paper-sink}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "{spacing.tap-min}"
  ticket:
    backgroundColor: "{colors.paper-raise}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "14px 16px"
  stamp:
    textColor: "{colors.ink-mute}"
    typography: "{typography.stamp}"
    rounded: "{rounded.sm}"
    padding: "3px 8px"
  stamp-mark:
    backgroundColor: "{colors.stamp-paper}"
    textColor: "{colors.stamp-ink}"
    typography: "{typography.stamp}"
    rounded: "{rounded.sm}"
    padding: "3px 8px"
  input:
    backgroundColor: "{colors.paper-raise}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
    height: "{spacing.tap-min}"
  search:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "{spacing.tap-desk}"
  nav-link:
    backgroundColor: "transparent"
    textColor: "{colors.ink-mute}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "{spacing.tap-desk}"
  nav-link-active:
    backgroundColor: "{colors.paper-sink}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "{spacing.tap-desk}"
  avatar:
    backgroundColor: "{colors.paper-sink}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.round}"
    size: "32px"
---

# Design System: BAD FORM Systems — DAYBOOK

## Overview

**Creative North Star: "The Morning Ledger"**

DAYBOOK is the paper-and-ink desk of a yard office, not a software dashboard. The ground is warm off-white paper; work sits on white surfaces separated by whisper hairlines; text is near-black ink; every figure is set in tabular monospace so columns of money line up like a printed ledger. Personality comes from restraint and from two atoms: the **ticket** (one chit anatomy for jobs, dockets, quotes) and the **stamp** (statuses as small uppercase ink stamps). Nothing else is allowed to shout.

Colour is almost entirely structural. The one accent slot, `--mark`, is ink by default and carries the primary verb, the active nav marker, the column dots, the meter fill and the column links. A client instance retints `--mark` from the Foundry and every accented atom repaints at once; that is the client's identity, not ours. Stamp yellow exists but is a status mark only. Two alternate themes (`amber-on-void`, `paper-docket`) remap the same token names, so screens compose against roles, never against values.

Density runs at three distances on the same tokens. Office desk: 14px body, 32px desk-height controls, 44px minimum on anything a gloved hand touches. Thumb (Field app on a phone): one column, 56px bar tabs, 60–72px rows, every verb full width. Arm's length (workshop kiosk on a bolted-down tablet): 96px tiles, 88px PIN keys, 22–32px labels, two controls per screen at most. Motion only confirms an action and finishes inside 150ms. Rejected outright by the shipped build: gradients, glass, blur, purple-on-dark SaaS defaults, ALL-CAPS chrome, yellow verbs, a logo glyph (the wordmark is set in type).

**Key Characteristics:**
- Paper-light neutrals, ink text, 1px low-contrast hairlines as the primary structure.
- One accent slot (`--mark`) bound to the primary verb and active state; retintable in one place.
- Two faces only: IBM Plex Sans for UI, IBM Plex Mono for codes and money, always tabular.
- Sentence-case chrome; stamps are the only uppercase element.
- Flat surfaces with a near-invisible resting shadow; depth from tonal paper steps.
- Confirm-only motion, ≤150ms; glove mode scales taps, padding and contrast via tokens.
- Three densities (desk, thumb, arm's length) from one token set; the paper-sink circular icon well and the drawn 1.5-stroke icon carry across all three.
- One state-panel language for loading, empty and error on every screen.

## Colors

Pure neutrals with ink as the accent; a handful of muted semantic tones exist only to colour stamps and dots.

### Primary
- **Ink** (`{colors.ink}`): All body text, headings, wordmark, nav active text, ticket codes. Also the default value of the accent slot.
- **Mark** (`{colors.mark}`): The accent slot. Fills the primary button, underlines/tints the active nav item, draws the column-head dots, the meter fill, the column arrow links, focus outlines, caret and form `accent-color`. Ink by default; a client brand retints this token alone. `--mark-soft` (8% mark over transparent) tints the success notice.
- **Mark Ink** (`{colors.mark-ink}`): Text on a mark-filled surface (primary button label).

### Neutral
- **Paper** (`{colors.paper}`): Page ground and the masthead search field background. Also the `theme-color`.
- **Paper Raise** (`{colors.paper-raise}`): White working surfaces — masthead, tickets, panels, cards, buttons, inputs, sheets.
- **Paper Sink** (`{colors.paper-sink}`): Recessed fills — selected chips, active nav pill (desktop), avatars, job chips, meter track, hovered link rows.
- **Ink Mute** (`{colors.ink-mute}`): Secondary text — labels, sublines, nav at rest, ghost buttons, chips at rest, list counts, empty-state copy. Also the `hold` stamp tone.
- **Ink Faint** (`{colors.ink-faint}`): Tertiary — hovered default-button border only.
- **Rule** (`{colors.rule}`): The whisper hairline. Ticket/panel borders, row dividers, masthead underline, column separators, chip and ghost borders.
- **Rule Strong** (`{colors.rule-strong}`): Firmer hairline for button and input borders, hovered card border, dashed empty-state border, scrollbar thumb.

### Status
Stamp and dot tones. Each stamp sets `color` to its tone and paints its own background at 9% of `currentColor`, so these five colours never appear as flat fills.
- **Ok** (`{colors.ok}`): Paid / done / passed.
- **Warn** (`{colors.warn}`): Chase, overdue dots, demo-cleared notice.
- **Bad** (`{colors.bad}`): Overdue, expiring within a week, danger button text, error text. Error surfaces tint 5–8% bad over transparent; the shared error state panel adds a solid 40%-bad hairline.
- **Ok / Warn as result wells:** the Field capture result and kiosk done icon wells tint 12% of `--ok` or `--warn` behind a same-tone icon. Still a tint, never a fill.
- **Hold** (`{colors.hold}`): Away, muted, on hold.
- **Live** (`{colors.live}`): Live / info / pilot / demo yard.
- **Stamp Paper** (`{colors.stamp-paper}`) on **Stamp Ink** (`{colors.stamp-ink}`): The one solid stamp (`bf-stamp--mark`). A status mark only.

### Alternate themes
`html[data-theme="amber-on-void"]` (dark: paper `#14110e`, ink `#f4efe6`, mark `#e8c547`) and `html[data-theme="paper-docket"]` (warm paper `#f4f1ea`, ink `#1c1917`, stamp-paper `#c45c26`) redefine the same token names. Screens never branch on theme; they read roles.

### Named Rules
**The One Slot Rule.** Every accented atom — primary verb, active nav, dots, meter, column links, focus ring — reads `--mark`. No second accent token exists; a client retint must repaint them all with one value.

**The Status-Only Yellow Rule.** `--stamp-paper` colours a stamp and nothing else. Never a button, never nav fill, never brand.

**The Tinted-Stamp Rule.** Semantic colours appear as stamp text over a 9% self-tint or as a 7px dot. They never fill a surface, border a card, or colour running text.

## Typography

**Display Font:** IBM Plex Sans (with Helvetica Neue, Helvetica, Arial, sans-serif)
**Body Font:** IBM Plex Sans (same family; `--font-display` aliases `--font-ui`)
**Label/Mono Font:** IBM Plex Mono (with ui-monospace, SFMono-Regular, monospace)

**Character:** One humanist grotesk at two weights (400, 500, with 600 reserved for stamps, totals and codes) paired with its own monospace sibling. Headings tighten slightly (−0.02 to −0.03em); labels open slightly (+0.02em). The mono face carries every code and every dollar figure so columns align like print. Fonts load from Google Fonts at weights 400/500/600 only.

### Hierarchy
- **Display** (500, 28px, 1.15, −0.03em): Login/console page title (`bf-h1`). Rare.
- **Headline** (500, 22px / Desk 24·dk, 1.25, −0.02em): Page titles (`bf-h2`, `desk__title`). In a page head the size drops to 20px.
- **Title** (500, 15px, 1.3): Card and panel titles (`desk-card__title`, `desk-panel__title`). Crew names use 14px; sub-headings (`bf-h3`) are 13px in ink-mute.
- **Body** (400, 14px, 1.45): Default text. Sublines and notes step to 13px / 12px / 11px in ink-mute; glove mode raises body to 16px.
- **Label** (500, 11px, 0.02em, sentence case): `bf-label` — masthead labels, field labels, theme selector. Never uppercase.
- **Mono** (500–600, 13px, tabular): Codes (`JOB-2417`, `INV-2387`) at 600; amounts at 500, right-aligned. `bf-num` is the shared right-aligned figure cell.
- **Total** (600, 38·dk, 1.1, −0.03em, tabular mono): The single headline figure of a money panel.
- **Stamp** (600, 10px, 0.06em, UPPERCASE): The stamp atom only.
- **Wordmark** (500, 16px, −0.02em): The org's trading name in the masthead, set in type. No glyph.
- **Thumb scale (Field):** screen title 22px/500/−0.02em; job title 24px; run-row and key-row values 15–16px/500; sheet title 18px/500/−0.02em; bar tab labels 12px/500. The gate code alone is 26px/600 Plex Mono with 0.06em tracking so it can be read at the gate.
- **Arm's-length scale (Kiosk):** masthead title 26px/500/−0.02em (20px under 600px), stage name 32px/500/−0.02em, tile label 22px/500 with a 14px hint, PIN keys 32px mono tabular, body 15–16px.

### Named Rules
**The Tabular Figure Rule.** Every number that can be compared to another — money, counts, codes — is set in IBM Plex Mono with `font-variant-numeric: tabular-nums`, right-aligned when in a column.

**The Sentence-Case Chrome Rule.** Nav, buttons, titles and field labels are sentence case with zero tracking. Stamps are the only uppercase element in the system.

**The Two Faces Rule.** IBM Plex Sans and IBM Plex Mono. No third family, no system display face, no weight above 600.

## Layout

Mobile-first, single column, widening into a hairline-ruled grid. The page body (`bf-content`) is centred at `min(1440px, 100%)` with `20px 16px 40px` padding, moving to `16·dk 24·dk 40px` from 720px. Generic pages stack with a 12px gap (`--gap`) inside 16px padding (`--pad`); glove mode raises these to 16px and 20px.

**Masthead.** A 56px-minimum white bar under a hairline: wordmark, then a stamp (Pilot / Demo yard) or the sentence-case "Office" label, then primary nav, then tools (search, alerts, theme, glove, avatar, sign out) pushed right. Below 720px the tools flow into the masthead's own wrap and the bar settles into three rows (identity + sign out, search + controls, nav); the nav becomes a full-width scrollable row under a hairline with 2px underline for the current page. At ≥1100px the bar is a single 64·dk row with nowrap nav rendered as 32px pills.

**Desk unit.** `--dk = clamp(1px, 0.078125vw, 1.15px)` is 1px at 1280 wide and grows to 1.15px on wider monitors. The Desk and the desktop masthead size their composition in it so the first viewport keeps its proportions. It is a composition unit for Command Center surfaces, not a type scale; shared components keep fixed pixel tokens.

**Breakpoints observed.** 480 (crew row collapses job chip under name), 640 (sublines stop truncating; small action buttons grow to 44px), 720 (masthead tools inline; content padding in dk), 900 (sheets centre instead of docking to the bottom), 1024 (Desk triptych), 1100 (masthead single row).

**Desk grid.** One column on phones; two columns from 640 with the third (Dispatch) spanning below a hairline and its crew list split in two; from 1024 three columns at `372fr / 377fr / 385fr` with a 42·dk gutter and a hairline drawn at −21px in each gutter. Column head, body, foot: the foot pins the arrow link to the bottom so all three columns end level.

**Touch.** `--tap-min` 44px on any control a hand touches (buttons, chips, inputs); `--tap-desk` 32px for dense office controls (small buttons, nav, masthead selects, search). Glove mode lifts both to 60px. Thumb surfaces raise rows to 56–72px; kiosk controls sit at 64px (back), 88px (PIN key) and 96px (tile).

**Field column.** A single column at `max-width: 600px`, `16px` side padding, `16px` top (24px from 720px), bottom padding of `96px + safe-area` so the last verb clears the bar. The masthead is 56px white on a hairline (wordmark, role stamp, outbox stamp, avatar) with safe-area top padding. A fixed bottom bar of three equal tabs (Today, Glove, Sign out) sits on a hairline with `6px 8px` padding plus safe-area; from 720px it centres as three 180px pills with an 8px gap. Screens are 16px grids; the run list is an 8px grid of rows.

**Kiosk column.** `min(720px, 100%)` centred, `24px 24px 40px` padding (16px under 600px), 14px grid gap. An 80px masthead with a 64px square back button, 26px title and muted subline. PIN entry is a 420px-wide 3-column pad with 10px gaps, pushed down by `clamp(0, 8vh, 72px)`.

**Breakpoints added.** 600 (kiosk compacts padding and title), 720 (field bar becomes centred pills).

## Elevation & Depth

Depth is tonal first, shadow second. Three paper steps — paper, paper-raise, paper-sink — do almost all the work: white surfaces sit on off-white ground, recessed fills sink into paper-sink. Hairlines carry structure. A single near-invisible resting shadow lifts tickets, panels and Desk cards a hair off the paper; it is felt, not seen. No surface uses a shadow larger than the hover lift below, and no overlay blurs.

### Shadow Vocabulary
- **Resting** (`box-shadow: 0 1px 2px color-mix(in srgb, var(--ink) 4%, transparent), 0 2px 6px color-mix(in srgb, var(--ink) 3%, transparent)`): Tickets, Desk panels and cards at rest.
- **Card hover lift** (resting plus `0 4·dk 12·dk color-mix(in srgb, var(--ink) 4%, transparent)`, border to rule-strong): Interactive Desk cards on hover.
- **Inset hairline** (`box-shadow: inset 0 0 0 1px var(--rule)`): Active nav pill on the desktop masthead; the Field segmented-control track. The rule-strong variant draws unfilled circles (stage marks, radios, PIN dots) that fill with `--mark` when done or selected.
- **Selected segment** (resting shadow on paper-raise inside a paper-sink track): the Field Today / Tomorrow control; the only place the resting shadow marks selection.
- **Overlay** (`--overlay`: ink at 32%): Sheet scrim. Flat colour, no blur.

### Named Rules
**The Whisper Hairline Rule.** Structure is drawn with 1px `--rule` lines and paper steps before it is ever drawn with shadow. A shadow may lift a surface by a hair; it may never separate it.

**The Confirm-Only Motion Rule.** Transitions run `--confirm-ms` (140ms) for state changes and `--sheet-ms` (180ms) for sheets, easing `cubic-bezier(0.2, 0.8, 0.2, 1)` where specified. Motion confirms an action; nothing loops, floats or decorates.

## Shapes

Gently rounded print geometry. The working radius is 6px (`--r`) on tickets, panels, cards, buttons, inputs, chips, job chips, kiosk tiles and PIN keys; 4px (`--r-sm`) on stamps, small buttons, nav pills, notices, focus rings, segmented items and hovered link rows. Bottom sheets open with 12px top corners and square off to 6px when they centre at ≥900px. Circles are reserved for people, markers and icon wells: 32px masthead avatar and Field run number, 36·dk crew avatar, 6–7px column and status dots, 18px radios and PIN dots, 28px stage marks. The **icon well** — a paper-sink circle holding a line icon — recurs at 36px (key rows, capture choices), 40px (state panels), 48px (kiosk tiles), 56px (capture result) and 72px (kiosk done); on a `--mark` surface it becomes 14% mark-ink. The pill (`--r-pill`) appears on the Desk's per-row "Draft invoice" button, the sheet grip and progress meters. Borders are 1px hairlines; the dashed rule-strong border belongs to empty states only. No skewed, clipped or offset silhouettes; the stamp is a flat tinted rectangle, never rotated.

## Components

### Buttons
Quiet, bordered, sentence case; the primary verb is the only filled control on a page.
- **Shape:** Gently rounded (6px); small variant 4px; Desk row action pill (999px).
- **Default:** White on a rule-strong hairline, ink text, 500 weight 14px, 44px minimum height and width, `0 16px` padding, 8px icon gap. Hover: border to ink-faint.
- **Primary:** `--mark` fill, `--mark-ink` text, border matches fill. Hover: `filter: brightness(1.12)`. One per row or per view.
- **Accent (outline):** White with an ink border. Secondary emphasis without fill.
- **Ghost:** Transparent, rule border, ink-mute text. Also the "quiet" masthead button (32px, 13px).
- **Danger:** White with `--bad` border and text. Never filled.
- **Small (`--sm`):** 32px, `0 12px`, 12px text, 4px radius; grows to 44px below 640px.
- **Large (`--lg`):** `max(--tap-min, 52px)`, `0 18px`, 16px text, 20px icon. The thumb verb — clock on/off, capture, sheet submit — usually full width.
- **Disabled:** 45% opacity, `not-allowed` cursor.
- **Focus (global):** 2px `--focus` outline offset 2px, 4px radius.

### Chips
- **Style:** Transparent, rule hairline, 6px radius, ink-mute 13px 500 text, 44px tall, `0 12px`; 32px inside the masthead.
- **State:** Selected (`aria-pressed`, `aria-selected`, `aria-current="page"`) sinks to paper-sink with ink text and an ink border. Chip rows wrap with a 6px gap.
- **Job chip (Desk):** Paper-sink fill, transparent hairline that becomes rule-strong on hover, 30·dk tall, 11.5·dk text; van icon, mono-ish code at 500 and a truncating muted site name.

### Cards / Containers
The **ticket** is the one surface anatomy.
- **Corner Style:** 6px.
- **Background:** Paper-raise on paper ground.
- **Shadow Strategy:** Resting shadow (see Elevation); Desk cards add the hover lift.
- **Border:** 1px `--rule`.
- **Internal Padding:** `14px 16px` (ticket); Desk panels `14·dk 16·dk 6·dk`; Desk triage cards `18·dk` with a 40·dk icon well, 96·dk minimum height (120·dk on desktop).
- **Empty state:** Dashed rule-strong border, 6px radius, centred 13·dk ink-mute copy with a 14·dk ink `strong` first line.

### Inputs / Fields
- **Style:** White, 1px rule-strong border, 6px radius, `10px 12px` padding, 44px minimum; textareas 88px minimum and vertically resizable. Field stacks label over control with a 6px gap and 12px bottom margin.
- **Search (masthead):** Paper ground (not white), rule border, 32px, 13px text, 150px minimum; stretches to fill its row on phones.
- **Compact selects:** 32px, `2px 8px`, 12px text.
- **Focus:** Global 2px `--mark` outline. Caret, selection (18% mark over white) and `accent-color` all read `--mark`.

### Navigation
- **Masthead:** White bar on a hairline; wordmark 16px/500 set in type, status stamp or "Office" label beside it.
- **Nav links:** 13px 500 ink-mute, `0 10px`, 40px tall, transparent 2px bottom border. Hover: ink. Current: ink text with `--mark` bottom border.
- **Desktop (≥1100px):** links become 32px pills with 4px radius; current page sinks to paper-sink with an inset hairline.
- **Phone (<720px):** nav is its own scrollable row under a hairline, 12.5px text, spaced between; avatar hides; sign-out becomes a quiet text button.
- **Alerts:** Text link "Alerts (n)" in ink-mute, ink on hover/current. No badge, no bell glyph.
- **Field bottom bar:** three equal tabs, each a 22px line icon over a 12px/500 sentence-case label, 56px minimum, 6px radius, ink-mute at rest, ink on hover; current page or pressed toggle reads `--mark` on paper-sink. The Glove toggle lives here as `aria-pressed`, so a client retint lights the bar too.
- **Field masthead:** 56px, wordmark + "Field" mute stamp, outbox warn stamp when queued, 32px avatar. No search, no nav row.
- **Kiosk masthead:** 80px, 64px square outline back button with a 24px arrow, 26px title, muted subline, "Shop floor" stamp right.
- **Back link (Field):** 44px inline ink-mute `arrow-left` + label, sinks to paper-sink on hover.

### Stamp (signature)
The status atom. Inline-flex, 10px 600 uppercase with 0.06em tracking, `3px 8px`, 4px radius, no border, no transform. Colour is the tone (`ok`, `warn`, `bad`, `hold`/`mute`, `live`/`info`, `accent`) and the background is 9% of that colour; `mark` is the single solid variant (stamp-paper on stamp-ink). Used for job/invoice status, triage affordances ("Recall", "Chase quote", "7 days"), masthead state (Pilot, Demo yard) and away reasons. Never a CTA, never a filter.

### Icons
Line icons drawn at one stroke weight: 24-viewbox SVG, `stroke-width 1.5`, round caps and joins, `currentColor`, no fill. Sizes in use: 16 (inline with text, job chip), 18 (chevrons, print, button icons), 20 (large-button icons, sheet close), 22 (field bar tabs), 24 (state panel, kiosk chevron/back), 28 (kiosk tile well), 32 (triage card well). The set is twenty-six glyphs: inbox, recall, licence, quote, chevron-right, arrow-right, arrow-left, printer, van, away, clock, camera, check, document, phone, key, people, sign-out, glove, calendar, close, external, backspace, wrench, flag, clipboard. New glyphs join this file at the same stroke and viewbox. Inline SVG only; no icon font, no emoji.

### Screen states
One quiet panel language for loading, empty and error on every screen (`LoadingView`, `EmptyView`, `ErrorView`).
- **Panel:** centred grid, `28px 20px`, 6px radius, dashed rule-strong border, transparent ground; optional 40px paper-sink icon well; 14px/500 ink title; 13px ink-mute hint capped at 34ch.
- **Loading:** no border, `20px 0`, ink-mute title with an ellipsis, optional **skeleton** — an 8px grid of 56px paper-sink rows, 6px radius, no shimmer.
- **Error:** solid border at 40% `--bad`, 5% `--bad` ground, `--bad` title, optional small "Retry" button. `role="alert"`.
- **Empty:** the dashed panel with title, hint and icon (e.g. drawings: document well, "No drawings attached").

### Sheet
Fixed scrim of `--overlay`; a 560px-max white panel with a rule border, `8px 16px 0` padding plus `16px + safe-area` bottom, 12px top corners docked to the bottom on phones and centred with 6px corners from 900px. **Head:** a centred 36×4px rule-strong grip pill, then an 18px/500/−0.02em title with a 44px square ink-mute close button (drawn `close` icon, sinks to paper-sink on hover) pulled 8px into the margin. Content is a 16px grid; the submit verb is a full-width large primary button anchored last.

### Field run sheet (signature)
The crew's day in one column. **Segmented control:** a paper-sink track with an inset hairline, 3px padding, two 44px items; the selected item lifts to paper-raise with the resting shadow. **Run row:** a ticket 72px tall, `32px / 1fr / auto` grid, led by the **run number** — a 32px `--mark` disc with a 13px mono tabular numeral in mark-ink — then muted 12px code, 16px/500 title, a mute stamp for the time window and a 13px muted site line, closing with an ink-faint chevron; hover darkens the border, active sinks. **Key rows** (site, gate code, contact, crew): 60px hairline-separated rows in a ticket, `36px / 1fr / auto` — paper-sink icon well, 11px label with `--tracking-label`, 15px/500 value (gate code 26px/600 mono), optional 44px "Call" button. **Clock panel:** 7px dot (ink-faint off, `--ok` on), 15px title, tabular subline, full-width large primary verb. **Stage list:** 60px rows with a 28px circle mark — inset rule-strong ring when open, `--mark` fill with a check when done — and a 4px `--mark` meter under the section head; done titles fade to ink-mute. **Capture choices:** 56px radio cards (`36px / 1fr / 20px`), icon well, 14px label and 12px hint, an 18px ring that fills to a 6px `--mark` ring when chosen and an ink border on the card. **Result:** centred 56px well tinted 12% ok/warn, 14px muted copy at 34ch.

### Kiosk controls (signature)
Arm's-length controls on a bolted-down tablet; two per screen at most. **Kiosk tile** (`KioskButton`): a `.bf-btn` stretched to a 96px full-width grid `auto / 1fr / auto`, `18px 16px 18px 20px`, 16px gap — 48px paper-sink icon well with a 28px icon, 22px/500/−0.02em label over a 14px ink-mute single-line hint, 24px ink-faint chevron. The `mark` tone is the primary button with the well at 14% mark-ink, hint at 72% mark-ink and a mark-ink chevron. Disabled inherits the button's 45% opacity; when a tile is disabled its instruction must also appear on the enabled primary tile. **PIN pad:** 3-column grid, 10px gap, 88px keys on rule-strong hairlines with the resting shadow, 32px mono tabular digits; hover darkens the border, active sinks, the quiet variant (backspace/clear) is ink-mute on paper-sink without shadow. **PIN dots:** 18px rings that fill `--mark`. **Yard code field:** 72px input, 26px text. **Stage card:** ticket with 13px muted count, 32px stage name, 6px `--mark` meter, optional warn stamp. **Done:** 72px well tinted 12% ok with a check. **Error:** 8% `--bad` tint, 15px/500 centred `--bad` text.

### Desk triptych (signature)
Three quiet white columns under one title line, read left to right: Triage, Money on the table, Dispatch. Each column opens with a Desk list label — 11·dk, 600, 0.1em, uppercase, ink-mute, led by a 6·dk `--mark` dot — and closes with a `--mark` arrow link whose gap widens 6→9·dk on hover. Money panel: label, 38·dk tabular total, 4·dk meter (paper-sink track, `--mark` fill scaled by share), note line, then hairline-separated lists of 40·dk rows with mono code, muted subline, right-aligned mono amount and a per-row pill primary "Draft invoice". Overdue rows carry a 7·dk `--warn` dot. Dispatch: 62·dk crew rows with a 36·dk paper-sink initials avatar, name and role, job chip; outline "Print day sheet" button full width. Inline notices (`desk-notice`) tint with `--mark-soft` or 8% `--bad`, animate in over 140ms. The uppercase list labels (`desk-col__head`, `desk-panel__label`) are Desk-scoped section labels inherited from the approved comp; the shared `bf-label` remains sentence case.

## Do's and Don'ts

### Do:
- **Do** compose every surface from tokens: `--paper`/`--paper-raise`/`--paper-sink` for ground, `--rule` for structure, `--ink`/`--ink-mute` for text. No literal colour, radius or shadow in a component.
- **Do** bind every accented atom to `--mark` (The One Slot Rule) so a Foundry retint repaints the verb, active nav, dots, meter and links together.
- **Do** set every code, count and dollar figure in IBM Plex Mono with `tabular-nums`, right-aligned in columns.
- **Do** keep chrome sentence case with zero tracking; put status in a Stamp and let the Stamp be the only uppercase element.
- **Do** honour `--tap-min` (44px) on any hand-touched control and `--tap-desk` (32px) for dense office controls; let glove mode scale them via tokens.
- **Do** draw structure with 1px `--rule` hairlines and paper steps; use the resting shadow only to lift a ticket a hair.
- **Do** design the empty, loading and error state of every screen with the shared state panel (`LoadingView` / `EmptyView` / `ErrorView`): dashed empty, 5% bad-tinted error, skeleton rows for loading. The Desk's `desk-empty` and `desk-notice` are the same language.
- **Do** hold a line icon in a paper-sink circular well (36–72px by distance) when it leads a row, tile or state; on a `--mark` surface the well is 14% mark-ink.
- **Do** size by distance, not by device: desk 32/44px, thumb 44–72px full-width verbs in one 600px column, arm's length 88–96px tiles with two controls per screen.
- **Do** keep motion to `--confirm-ms` (140ms) / `--sheet-ms` (180ms) and only in response to an action.

### Don't:
- **Don't** use `--stamp-paper` yellow as a button fill, nav fill, or brand colour; it marks status only.
- **Don't** add gradients, glassmorphism, blur overlays, or purple-on-dark defaults; the sheet scrim is flat 32% ink.
- **Don't** set nav, buttons, titles or field labels in ALL CAPS or with letter-spacing; the Desk column labels are Desk-scoped list labels, not a licence for kickers or eyebrows.
- **Don't** introduce a third typeface, a system display face, or weights above 600.
- **Don't** fill a surface, border a card or colour running text with `--ok`/`--warn`/`--bad`/`--live`; they live in stamps and 7px dots.
- **Don't** add a logo glyph beside the wordmark; the trading name set in IBM Plex Sans is the mark.
- **Don't** use `--dk` outside Command Center composition (Desk, desktop masthead, content padding); shared components keep fixed pixel tokens.
- **Don't** use emoji, stock illustration, icon fonts or decorative animation in product UI.
- **Don't** shrink the desk screen onto a phone or tile it into a dashboard; Field is one column read top to bottom and Kiosk shows at most two verbs.
- **Don't** put more than three tabs in the Field bottom bar or add a fourth chrome row; Today, Glove and Sign out are the slots.
