import Icon, { type IconName } from "./Icon";

/** Loading / empty / error states — every screen uses these, per convention. */
export interface LoadingViewProps {
  label?: string;
  /** Number of placeholder rows to sketch under the label. */
  rows?: number;
}
export function LoadingView({ label = "Loading", rows = 0 }: LoadingViewProps) {
  return (
    <div className="bf-state bf-state--loading" data-testid="loading-view" role="status" aria-live="polite">
      <p className="bf-state__title">{label}…</p>
      {rows > 0 && (
        <div className="bf-skeleton" aria-hidden="true">
          {Array.from({ length: rows }, (_, i) => (
            <span key={i} className="bf-skeleton__row" />
          ))}
        </div>
      )}
    </div>
  );
}

export interface EmptyViewProps {
  title: string;
  hint?: string;
  icon?: IconName;
  testId?: string;
}
export function EmptyView({ title, hint, icon, testId }: EmptyViewProps) {
  return (
    <div data-testid={testId ?? "empty-view"} className="bf-state bf-state--empty">
      {icon && (
        <span className="bf-state__icon" aria-hidden="true">
          <Icon name={icon} size={24} />
        </span>
      )}
      <p className="bf-state__title">{title}</p>
      {hint && <p className="bf-state__hint">{hint}</p>}
    </div>
  );
}

export interface ErrorViewProps {
  message: string;
  onRetry?: () => void;
}
export function ErrorView({ message, onRetry }: ErrorViewProps) {
  return (
    <div data-testid="error-view" className="bf-state bf-state--error" role="alert">
      <p className="bf-state__title">{message}</p>
      {onRetry && (
        <button data-testid="error-retry" onClick={onRetry} className="bf-btn bf-btn--sm bf-state__retry">
          Retry
        </button>
      )}
    </div>
  );
}
