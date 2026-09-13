import type { ReactNode } from "react";
import Icon from "./Icon";

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
      <section
        className="bf-sheet__panel"
        data-testid={testId}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="bf-sheet__head">
          <span className="bf-sheet__grip" aria-hidden="true" />
          <h2 className="bf-sheet__title">{title}</h2>
          <button
            type="button"
            data-testid={testId ? `${testId}-close` : undefined}
            onClick={onClose}
            className="bf-sheet__close"
            aria-label="Close"
          >
            <Icon name="close" size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
