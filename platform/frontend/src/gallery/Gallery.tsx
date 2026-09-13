import { useState } from "react";
import Button from "../components/Button";
import { Chip, GloveToggle, ThemeSwitch } from "../components/Chrome";
import Field from "../components/Field";
import KioskButton from "../components/KioskButton";
import LedgerTable, { type LedgerColumn } from "../components/LedgerTable";
import Sheet from "../components/Sheet";
import SigPad from "../components/SigPad";
import Stamp from "../components/Stamp";
import { EmptyView, ErrorView, LoadingView } from "../components/StatusViews";
import Ticket from "../components/Ticket";

interface DemoRow {
  code: string;
  desc: string;
  qty: string;
  total: string;
}

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
  const [chipOn, setChipOn] = useState("live");

  const cols: LedgerColumn<DemoRow>[] = [
    { key: "code", label: "Code", render: (r) => <span className="bf-mono">{r.code}</span> },
    { key: "desc", label: "Description", render: (r) => r.desc },
    { key: "qty", label: "Qty", align: "right", render: (r) => r.qty },
    { key: "total", label: "Total", align: "right", render: (r) => r.total },
  ];

  const section = (title: string) => (
    <h2 className="bf-h3" style={{ margin: "36px 0 12px", borderBottom: "var(--hair) solid var(--rule)", paddingBottom: 6 }}>
      {title}
    </h2>
  );

  return (
    <main className="bf-content" data-testid="gallery">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 12 }}>
        <div>
          <p className="bf-label" style={{ margin: "0 0 4px" }}>
            Daybook design system
          </p>
          <h1 className="bf-h1">Component gallery</h1>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <ThemeSwitch />
          <GloveToggle />
        </div>
      </header>

      {section("Stamps")}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Stamp label="Verified" tone="ok" />
        <Stamp label="Needs review" tone="warn" />
        <Stamp label="Overdue" tone="bad" />
        <Stamp label="Sent" tone="info" />
        <Stamp label="Draft" tone="mute" />
      </div>

      {section("Tickets")}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
        <Ticket
          code="Q-0107"
          title="Dalyellup reno — second fix"
          stamp={{ label: "Sent", tone: "info" }}
          meta={[
            { label: "Client", value: "R. Hartley" },
            { label: "Total", value: "$14,280.00" },
            { label: "Valid", value: "2026-09-19" },
          ]}
          testId="gallery-ticket-quote"
        />
        <Ticket
          code="D-0231"
          title="Roelands quarry ticket — 31.4t roadbase"
          stamp={{ label: "Needs review", tone: "warn" }}
          meta={[
            { label: "Job", value: "J-0041" },
            { label: "Grade", value: "14mm" },
          ]}
          onClick={() => undefined}
          testId="gallery-ticket-docket"
        />
      </div>

      {section("Ledger table")}
      <LedgerTable columns={cols} rows={DEMO_ROWS} rowKey={(r) => r.code} empty="No rows" testId="gallery-table" />

      {section("Buttons")}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Button kind="mark" testId="gallery-btn-mark">
          Book it
        </Button>
        <Button kind="accent">Send quote</Button>
        <Button kind="quiet">Filter</Button>
        <Button kind="danger">Void</Button>
        <Button kind="quiet" disabled>
          Disabled
        </Button>
        <Button kind="quiet" onClick={() => setSheetOpen(true)} testId="gallery-open-sheet">
          Open capture sheet
        </Button>
      </div>

      {section("Chips")}
      <div className="bf-chip-row">
        {["all", "live", "done"].map((f) => (
          <Chip key={f} label={f} active={chipOn === f} onClick={() => setChipOn(f)} />
        ))}
      </div>

      {section("Form field")}
      <div style={{ maxWidth: 380 }}>
        <Field label="Cert no" value={fieldVal} onChange={setFieldVal} placeholder="ES-0001" testId="gallery-field" />
      </div>

      {section("Signature pad")}
      <div style={{ maxWidth: 420 }}>
        <SigPad onChange={() => undefined} testId="gallery-sigpad" />
      </div>

      {section("Kiosk controls")}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12, maxWidth: 640 }}>
        <KioskButton label="Start stage" hint="Fab — Berth 3 bracket" tone="mark" onClick={() => undefined} testId="gallery-kiosk-start" />
        <KioskButton label="Log hours" hint="18.5 h on F-902" onClick={() => undefined} />
      </div>

      {section("States")}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
        <LoadingView label="Loading" />
        <EmptyView title="No jobs this day" hint="Copy the previous day's board or add a job." />
        <ErrorView message="Backend unreachable" onRetry={() => undefined} />
      </div>

      <Sheet title="Capture docket" open={sheetOpen} onClose={() => setSheetOpen(false)} testId="gallery-sheet">
        <p style={{ marginTop: 0, color: "var(--ink-mute)", fontSize: 14 }}>
          Photograph the paper before it hits the dash. The extractor reads it; anything uncertain lands in the review queue.
        </p>
        <Button kind="mark" full onClick={() => setSheetOpen(false)}>
          Take photo
        </Button>
      </Sheet>
    </main>
  );
}
