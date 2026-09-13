import Icon, { type IconName } from "./Icon";

/** Workshop-kiosk control: giant target, two per screen max. */
export interface KioskButtonProps {
  label: string;
  hint?: string;
  onClick: () => void;
  tone?: "mark" | "quiet";
  icon?: IconName;
  disabled?: boolean;
  testId?: string;
}

export default function KioskButton({ label, hint, onClick, tone = "quiet", icon, disabled, testId }: KioskButtonProps) {
  const mark = tone === "mark";
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      className={`bf-btn bf-kioskbtn${mark ? " bf-btn--primary" : ""}`}
    >
      {icon && (
        <span className="bf-kioskbtn__icon" aria-hidden="true">
          <Icon name={icon} size={28} />
        </span>
      )}
      <span className="bf-kioskbtn__text">
        <span className="bf-kioskbtn__label">{label}</span>
        {hint && <span className="bf-kioskbtn__hint">{hint}</span>}
      </span>
      <span className="bf-kioskbtn__go" aria-hidden="true">
        <Icon name="chevron-right" size={24} />
      </span>
    </button>
  );
}
