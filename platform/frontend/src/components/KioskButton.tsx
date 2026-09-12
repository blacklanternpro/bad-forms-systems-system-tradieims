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
      className={mark ? "bf-btn bf-btn--primary" : "bf-btn"}
      style={{
        display: "block",
        width: "100%",
        minHeight: 120,
        padding: 20,
        textAlign: "left",
        borderWidth: mark ? "2px" : "var(--hair)",
      }}
    >
      <span style={{ display: "block", fontSize: 22, fontWeight: 500, letterSpacing: "-0.02em" }}>{label}</span>
      {hint && (
        <span className="bf-mono" style={{ display: "block", marginTop: 6, fontSize: 13, opacity: 0.75 }}>
          {hint}
        </span>
      )}
    </button>
  );
}
