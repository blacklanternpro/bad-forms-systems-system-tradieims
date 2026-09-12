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

/** Primary verb is ink fill (`mark`). Accent is a secondary outline. Quiet is default. */
export default function Button({
  children,
  onClick,
  kind = "quiet",
  disabled,
  type = "button",
  testId,
  full,
}: ButtonProps) {
  const kindClass =
    kind === "mark" ? "bf-btn--primary" : kind === "accent" ? "bf-btn--accent" : kind === "danger" ? "bf-btn--danger" : "";
  return (
    <button
      type={type}
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      className={`bf-btn ${kindClass}`.trim()}
      style={{ width: full ? "100%" : undefined }}
    >
      {children}
    </button>
  );
}
