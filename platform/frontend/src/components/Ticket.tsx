import type { ReactNode } from "react";
import Stamp, { type StampTone } from "./Stamp";

/** The DAYBOOK ticket: one chit anatomy for jobs, dockets, quotes, POs.
    Code top-left in mono, stamp top-right, hairline rule, body, optional meta row. */
export interface TicketProps {
  code: string;
  title: string;
  stamp?: { label: string; tone: StampTone };
  meta?: { label: string; value: string }[];
  children?: ReactNode;
  onClick?: () => void;
  testId?: string;
}

export default function Ticket({ code, title, stamp, meta, children, onClick, testId }: TicketProps) {
  return (
    <article
      data-testid={testId}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
      style={{
        background: "var(--ground-raise)",
        border: "1px solid var(--rule)",
        borderRadius: "var(--radius)",
        boxShadow: "var(--shadow)",
        padding: "12px 14px",
        cursor: onClick ? "pointer" : "default",
        minHeight: onClick ? "var(--tap-min)" : undefined,
      }}
    >
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <span className="bf-mono" style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-mute)" }}>{code}</span>
        {stamp && <Stamp label={stamp.label} tone={stamp.tone} />}
      </header>
      <h3 style={{ margin: "4px 0 0", fontSize: 15, fontWeight: 600, lineHeight: 1.3 }}>{title}</h3>
      {meta && meta.length > 0 && (
        <dl
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "4px 18px",
            margin: "8px 0 0",
            paddingTop: 8,
            borderTop: "1px solid var(--rule)",
          }}
        >
          {meta.map((m) => (
            <div key={m.label} style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
              <dt className="bf-label" style={{ margin: 0 }}>{m.label}</dt>
              <dd className="bf-mono" style={{ margin: 0, fontSize: 13 }}>{m.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {children}
    </article>
  );
}
