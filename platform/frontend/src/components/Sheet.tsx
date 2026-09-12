import type { ReactNode } from "react";

/** Bottom sheet for field capture flows. One-thumb: actions anchored at the bottom. */
export interface SheetProps {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  testId?: string;
}

export default function Sheet({ title, open, onClose, children, testId }: SheetProps) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(20,18,12,0.45)", zIndex: 40, display: "flex", alignItems: "flex-end" }}
    >
      <section
        data-testid={testId}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--ground)",
          borderTop: "2px solid var(--ink)",
          width: "100%",
          maxHeight: "88vh",
          overflowY: "auto",
          padding: "16px 16px calc(16px + env(safe-area-inset-bottom))",
        }}
      >
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 className="bf-label" style={{ fontSize: 12 }}>{title}</h2>
          <button
            data-testid={testId ? `${testId}-close` : undefined}
            onClick={onClose}
            style={{ background: "none", border: 0, color: "var(--ink-mute)", fontSize: 22, cursor: "pointer", minWidth: "var(--tap-min)", minHeight: "var(--tap-min)" }}
            aria-label="Close"
          >
            ×
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
