import type { ReactNode } from "react";

export interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  kind?: "mark" | "accent" | "quiet" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
  testId?: string;
  full?: boolean;
}

/** DAYBOOK buttons. `mark` is the stamp-yellow primary verb; use once per view. */
export default function Button({ children, onClick, kind = "quiet", disabled, type = "button", testId, full }: ButtonProps) {
  const palette: Record<string, { bg: string; fg: string; border: string }> = {
    mark: { bg: "var(--mark)", fg: "var(--mark-ink)", border: "var(--ink)" },
    accent: { bg: "var(--accent)", fg: "var(--accent-ink)", border: "var(--accent)" },
    quiet: { bg: "var(--ground-raise)", fg: "var(--ink)", border: "var(--rule-strong)" },
    danger: { bg: "var(--ground-raise)", fg: "var(--stamp-bad)", border: "var(--stamp-bad)" },
  };
  const p = palette[kind];
  return (
    <button
      type={type}
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      style={{
        background: p.bg,
        color: p.fg,
        border: `1px solid ${p.border}`,
        borderRadius: "var(--radius)",
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        padding: "0 18px",
        minHeight: "var(--tap-min)",
        width: full ? "100%" : undefined,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        transition: `filter var(--confirm-ms)`,
      }}
      onMouseDown={(e) => ((e.currentTarget.style.filter = "brightness(0.92)"), undefined)}
      onMouseUp={(e) => ((e.currentTarget.style.filter = ""), undefined)}
      onMouseLeave={(e) => ((e.currentTarget.style.filter = ""), undefined)}
    >
      {children}
    </button>
  );
}
