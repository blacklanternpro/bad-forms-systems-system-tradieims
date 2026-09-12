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
    <div className="bf-sheet" onClick={onClose} role="presentation">
      <section className="bf-sheet__panel" data-testid={testId} onClick={(e) => e.stopPropagation()}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 className="bf-h2" style={{ fontSize: 18 }}>
            {title}
          </h2>
          <button
            data-testid={testId ? `${testId}-close` : undefined}
            onClick={onClose}
            className="bf-quiet-btn"
            style={{ border: 0, fontSize: 22, minWidth: "var(--tap-min)" }}
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
