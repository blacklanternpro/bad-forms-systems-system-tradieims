/** Ink-stamp status. The DAYBOOK status atom — never a pastel chip. */
export type StampTone = "ok" | "warn" | "bad" | "info" | "mute";

export interface StampProps {
  label: string;
  tone: StampTone;
  testId?: string;
}

const TONE_VAR: Record<StampTone, string> = {
  ok: "var(--stamp-ok)",
  warn: "var(--stamp-warn)",
  bad: "var(--stamp-bad)",
  info: "var(--stamp-info)",
  mute: "var(--ink-faint)",
};

export default function Stamp({ label, tone, testId }: StampProps) {
  const c = TONE_VAR[tone];
  return (
    <span
      data-testid={testId}
      style={{
        display: "inline-block",
        fontFamily: "var(--font-mono)",
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: c,
        border: `1.5px solid ${c}`,
        borderRadius: "var(--radius)",
        padding: "2px 7px",
        transform: "rotate(-1deg)",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}
