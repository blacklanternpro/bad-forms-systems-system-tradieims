import type { ReactNode } from "react";
import Icon, { type IconName } from "./Icon";

export interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  kind?: "mark" | "accent" | "quiet" | "danger";
  size?: "sm" | "md" | "lg";
  icon?: IconName;
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
  size = "md",
  icon,
  disabled,
  type = "button",
  testId,
  full,
}: ButtonProps) {
  const kindClass =
    kind === "mark" ? "bf-btn--primary" : kind === "accent" ? "bf-btn--accent" : kind === "danger" ? "bf-btn--danger" : "";
  const sizeClass = size === "sm" ? "bf-btn--sm" : size === "lg" ? "bf-btn--lg" : "";
  return (
    <button
      type={type}
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      className={`bf-btn ${kindClass} ${sizeClass}`.replace(/\s+/g, " ").trim()}
      style={{ width: full ? "100%" : undefined }}
    >
      {icon && <Icon name={icon} size={size === "lg" ? 20 : 18} />}
      {children}
    </button>
  );
}
