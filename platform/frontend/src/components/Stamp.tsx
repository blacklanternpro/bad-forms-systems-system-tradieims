/** Ink-stamp status. The DAYBOOK status atom — never a pastel chip, never a CTA. */
export type StampTone = "ok" | "warn" | "bad" | "info" | "mute" | "accent";

export interface StampProps {
  label: string;
  tone: StampTone;
  testId?: string;
}

export default function Stamp({ label, tone, testId }: StampProps) {
  return (
    <span data-testid={testId} className={`bf-stamp bf-stamp--${tone}`}>
      {label}
    </span>
  );
}
