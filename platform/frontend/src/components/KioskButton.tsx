/** Workshop-kiosk control: giant target, two per screen max. */
export interface KioskButtonProps {
  label: string;
  hint?: string;
  onClick: () => void;
  tone?: "mark" | "quiet";
  testId?: string;
}

export default function KioskButton({ label, hint, onClick, tone = "quiet", testId }: KioskButtonProps) {
  const mark = tone === "mark";
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        minHeight: 120,
        background: mark ? "var(--mark)" : "var(--ground-raise)",
        color: mark ? "var(--mark-ink)" : "var(--ink)",
        border: `2px solid ${mark ? "var(--ink)" : "var(--rule-strong)"}`,
        borderRadius: "var(--radius)",
        cursor: "pointer",
        padding: 20,
        textAlign: "left",
      }}
    >
      <span style={{ display: "block", fontSize: 24, fontWeight: 700, letterSpacing: "0.04em" }}>{label}</span>
      {hint && <span className="bf-mono" style={{ display: "block", marginTop: 6, fontSize: 13, opacity: 0.75 }}>{hint}</span>}
    </button>
  );
}
