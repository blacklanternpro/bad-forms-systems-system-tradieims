import { useState } from "react";
import Button from "../components/Button";
import { GloveToggle, ThemeSwitch } from "../components/Chrome";
import Field from "../components/Field";
import KioskButton from "../components/KioskButton";
import LedgerTable, { type LedgerColumn } from "../components/LedgerTable";
import Sheet from "../components/Sheet";
import SigPad from "../components/SigPad";
import Stamp from "../components/Stamp";
import { EmptyView, ErrorView, LoadingView } from "../components/StatusViews";
import Ticket from "../components/Ticket";

interface DemoRow { code: string; desc: string; qty: string; total: string }

const DEMO_ROWS: DemoRow[] = [
  { code: "J-0041", desc: "Kemerton pad — subgrade prep", qty: "7.0 h", total: "$1,470.00" },
  { code: "J-0042", desc: "Treendale switchboard rough-in", qty: "8.0 h", total: "$880.00" },
  { code: "J-0043", desc: "Berth 3 crane bracket fab", qty: "18.5 h", total: "$2,127.50" },
];

/** The living gallery. Every shipped component demos here; the Foundry menu reads
    this same registry when composing a client build. */
export default function Gallery() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [fieldVal, setFieldVal] = useState("");

  const cols: LedgerColumn<DemoRow>[] = [
    { key: "code", label: "CODE", render: (r) => <span className="bf-mono">{r.code}</span> },
    { key: "desc", label: "DESCRIPTION", render: (r) => r.desc },
    { key: "qty", label: "QTY", align: "right", render: (r) => r.qty },
    { key: "total", label: "TOTAL", align: "right", render: (r) => r.total },
  ];

  const section = (title: string) => (
    <h2 className="bf-label" style={{ margin: "36px 0 12px", borderBottom: "1px solid var(--rule-strong)", paddingBottom: 6 }}>{title}</h2>
  );

  return (
    <main className="bf-page" data-testid="gallery">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 12 }}>
        <div>
          <p className="bf-label" style={{ margin: 0 }}>DAYBOOK DESIGN SYSTEM</p>
          <h1 className="bf-h1" style={{ fontSize: 32 }}>Component gallery</h1>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <ThemeSwitch />
          <GloveToggle />
        </div>
      </header>

      {section("STAMPS")}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Stamp label="VERIFIED" tone="ok" />
        <Stamp label="NEEDS REVIEW" tone="warn" />
        <Stamp label="OVERDUE" tone="bad" />
        <Stamp label="SENT" tone="info" />
        <Stamp label="DRAFT" tone="mute" />
      </div>

      {section("TICKETS")}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
        <Ticket
          code="Q-0107"
          title="Dalyellup reno — second fix"
          stamp={{ label: "SENT", tone: "info" }}
          meta={[{ label: "CLIENT", value: "R. Hartley" }, { label: "TOTAL", value: "$14,280.00" }, { label: "VALID", value: "2026-09-19" }]}
          testId="gallery-ticket-quote"
        />
        <Ticket
          code="D-0231"
          title="Roelands quarry ticket — 31.4t roadbase"
          stamp={{ label: "NEEDS REVIEW", tone: "warn" }}
          meta={[{ label: "JOB", value: "J-0041" }, { label: "GRADE", value: "14mm" }]}
          onClick={() => undefined}
          testId="gallery-ticket-docket"
        />
      </div>

      {section("LEDGER TABLE")}
      <LedgerTable columns={cols} rows={DEMO_ROWS} rowKey={(r) => r.code} empty="NO ROWS" testId="gallery-table" />

      {section("BUTTONS")}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Button kind="mark" testId="gallery-btn-mark">Book it</Button>
        <Button kind="accent">Send quote</Button>
        <Button kind="quiet">Filter</Button>
        <Button kind="danger">Void</Button>
        <Button kind="quiet" disabled>Disabled</Button>
        <Button kind="quiet" onClick={() => setSheetOpen(true)} testId="gallery-open-sheet">Open capture sheet</Button>
      </div>

      {section("FORM FIELD")}
      <div style={{ maxWidth: 380 }}>
        <Field label="Cert no" value={fieldVal} onChange={setFieldVal} placeholder="ES-0001" testId="gallery-field" />
      </div>

      {section("SIGNATURE PAD")}
      <div style={{ maxWidth: 420 }}>
        <SigPad onChange={() => undefined} testId="gallery-sigpad" />
      </div>

      {section("KIOSK CONTROLS")}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12, maxWidth: 640 }}>
        <KioskButton label="START STAGE" hint="Fab — Berth 3 bracket" tone="mark" onClick={() => undefined} testId="gallery-kiosk-start" />
        <KioskButton label="LOG HOURS" hint="18.5 h on F-902" onClick={() => undefined} />
      </div>

      {section("STATES")}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
        <LoadingView />
        <EmptyView title="NO JOBS THIS DAY" hint="Copy the previous day's board or add a job." />
        <ErrorView message="Backend unreachable" onRetry={() => undefined} />
      </div>

      <Sheet title="CAPTURE DOCKET" open={sheetOpen} onClose={() => setSheetOpen(false)} testId="gallery-sheet">
        <p style={{ marginTop: 0, color: "var(--ink-mute)", fontSize: 14 }}>
          Photograph the paper before it hits the dash. The extractor reads it; anything uncertain lands in the review queue.
        </p>
        <Button kind="mark" full onClick={() => setSheetOpen(false)}>Take photo</Button>
      </Sheet>
    </main>
  );
}
