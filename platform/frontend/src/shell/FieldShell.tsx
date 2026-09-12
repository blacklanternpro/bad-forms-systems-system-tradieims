import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { getSession, setSession } from "../api";
import { GloveToggle, applyBrand } from "../components/Chrome";
import { flush, pending } from "../lib/outbox";

export interface FieldShellProps {
  children: ReactNode;
}

/** Field app chrome: one-thumb layout, bottom bar, glove mode always at hand.
    The capture outbox replays whenever the shell mounts or the signal returns. */
export default function FieldShell({ children }: FieldShellProps) {
  const nav = useNavigate();
  const s = getSession();
  const [queued, setQueued] = useState(pending().length);
  useEffect(() => {
    applyBrand(getSession()?.org.brand?.tokens);
    const tryFlush = () => void flush().then(() => setQueued(pending().length));
    tryFlush();
    window.addEventListener("online", tryFlush);
    return () => window.removeEventListener("online", tryFlush);
  }, []);
  if (!s) return null;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header className="bf-mast">
        <span className="bf-wordmark" style={{ fontSize: 14 }}>
          {s.org.name}
        </span>
        {queued > 0 && (
          <span className="bf-label" data-testid="outbox-count" style={{ color: "var(--stamp-warn)" }}>
            Outbox {queued}
          </span>
        )}
        <span className="bf-mono" style={{ fontSize: 12, color: "var(--ink-mute)", marginLeft: "auto" }}>
          {s.user.name}
        </span>
      </header>
      <main style={{ flex: 1, padding: "16px 16px 90px", maxWidth: 560, width: "100%", margin: "0 auto" }}>{children}</main>
      <nav
        aria-label="Field"
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          display: "flex",
          gap: 8,
          padding: "10px 12px calc(10px + env(safe-area-inset-bottom))",
          background: "var(--paper-raise)",
          borderTop: "var(--hair) solid var(--rule)",
        }}
      >
        <NavLink
          to="/field"
          end
          className="bf-chip"
          style={{ flex: 1, textAlign: "center", display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}
        >
          Today
        </NavLink>
        <GloveToggle />
        <button
          data-testid="field-logout"
          className="bf-quiet-btn"
          onClick={() => {
            setSession(null);
            nav("/login");
          }}
          style={{ flex: 1 }}
        >
          Sign out
        </button>
      </nav>
    </div>
  );
}
