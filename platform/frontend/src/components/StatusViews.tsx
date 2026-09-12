/** Loading / empty / error states — every screen uses these, per convention. */
export interface LoadingViewProps {
  label?: string;
}
export function LoadingView({ label = "Loading" }: LoadingViewProps) {
  return (
    <p className="bf-label" data-testid="loading-view" style={{ padding: "40px 0", textAlign: "center" }}>
      {label}…
    </p>
  );
}

export interface EmptyViewProps {
  title: string;
  hint?: string;
  testId?: string;
}
export function EmptyView({ title, hint, testId }: EmptyViewProps) {
  return (
    <div
      data-testid={testId ?? "empty-view"}
      style={{
        padding: "40px 20px",
        textAlign: "center",
        border: "var(--hair) dashed var(--rule-strong)",
        borderRadius: "var(--radius)",
      }}
    >
      <p className="bf-h2" style={{ fontSize: 16, margin: 0 }}>
        {title}
      </p>
      {hint && (
        <p style={{ color: "var(--ink-mute)", fontSize: 13, margin: "8px 0 0" }}>{hint}</p>
      )}
    </div>
  );
}

export interface ErrorViewProps {
  message: string;
  onRetry?: () => void;
}
export function ErrorView({ message, onRetry }: ErrorViewProps) {
  return (
    <div
      data-testid="error-view"
      style={{
        padding: "24px 20px",
        textAlign: "center",
        border: "var(--hair) solid var(--stamp-bad)",
        borderRadius: "var(--radius)",
      }}
    >
      <p style={{ color: "var(--stamp-bad)", fontFamily: "var(--font-ui)", fontSize: 14, margin: 0 }}>{message}</p>
      {onRetry && (
        <button data-testid="error-retry" onClick={onRetry} className="bf-btn" style={{ marginTop: 12 }}>
          Retry
        </button>
      )}
    </div>
  );
}
