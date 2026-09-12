import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { getSession, setSession } from "../api";
import { GloveToggle } from "../components/Chrome";

export interface FieldShellProps { children: ReactNode }

/** Field app chrome: one-thumb layout, bottom bar, glove mode always at hand. */
export default function FieldShell({ children }: FieldShellProps) {
  const nav = useNavigate();
  const s = getSession();
  if (!s) return null;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header style={{ padding: "14px 16px 10px", borderBottom: "2px solid var(--ink)", display: "flex", alignItems: "baseline", gap: 12 }}>
        <span className="bf-label" style={{ fontSize: 12 }}>{s.org.name}</span>
        <span className="bf-mono" style={{ fontSize: 12, color: "var(--ink-mute)", marginLeft: "auto" }}>{s.user.name}</span>
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
          background: "var(--ground-raise)",
          borderTop: "1px solid var(--rule-strong)",
        }}
      >
        <NavLink
          to="/field"
          end
          className="bf-label"
          style={({ isActive }) => ({
            flex: 1,
            textAlign: "center",
            padding: "12px 0",
            minHeight: "var(--tap-min)",
            textDecoration: "none",
            background: isActive ? "var(--mark)" : "transparent",
            color: isActive ? "var(--mark-ink)" : "var(--ink-mute)",
            border: "1px solid var(--rule-strong)",
            borderRadius: "var(--radius)",
          })}
        >
          TODAY
        </NavLink>
        <GloveToggle />
        <button
          data-testid="field-logout"
          className="bf-label"
          onClick={() => {
            setSession(null);
            nav("/login");
          }}
          style={{ flex: 1, background: "none", border: "1px solid var(--rule-strong)", borderRadius: "var(--radius)", cursor: "pointer", minHeight: "var(--tap-min)" }}
        >
          OUT
        </button>
      </nav>
    </div>
  );
}
