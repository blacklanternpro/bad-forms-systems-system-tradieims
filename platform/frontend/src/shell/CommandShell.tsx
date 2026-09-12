import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { api, getSession, moduleLive, setSession, type NotificationRow } from "../api";
import { GloveToggle, ThemeSwitch, applyBrand } from "../components/Chrome";

/** Nav is composed per instance: pack entries only appear when the module is live. */
function navItems(): { to: string; label: string }[] {
  const items = [
    { to: "/desk", label: "DESK" },
    { to: "/dayboard", label: "DAY BOARD" },
    { to: "/jobs", label: "JOBS" },
    { to: "/quotes", label: "QUOTES" },
    { to: "/inbox", label: "INBOX" },
  ];
  if (moduleLive("trades")) items.push({ to: "/certs", label: "CERTS" });
  if (moduleLive("civil")) items.push({ to: "/plant", label: "PLANT" }, { to: "/dockets", label: "DOCKETS" });
  if (moduleLive("fab")) items.push({ to: "/shop", label: "SHOP" });
  if (moduleLive("fleet")) items.push({ to: "/fleet", label: "FLEET" });
  items.push({ to: "/admin", label: "ADMIN" });
  return items;
}

export interface CommandShellProps { children: ReactNode }

/** Command Center chrome: masthead, nav rail, notification count, search. */
export default function CommandShell({ children }: CommandShellProps) {
  const nav = useNavigate();
  const s = getSession();
  const [unread, setUnread] = useState(0);
  const [q, setQ] = useState("");

  useEffect(() => {
    let live = true;
    applyBrand(getSession()?.org.brand?.tokens);
    api<NotificationRow[]>("/notifications")
      .then((rows) => live && setUnread(rows.length))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  if (!s) return null;

  return (
    <div className="bf-page">
      <header style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "8px 20px", borderBottom: "2px solid var(--ink)", paddingBottom: 12 }}>
        <h1 className="bf-h1" style={{ fontSize: 20 }}>{s.org.name}</h1>
        <span className="bf-label">{s.org.pilot ? "PILOT — CAPTURE PIPELINE" : s.org.is_demo ? "DEMO YARD" : "COMMAND CENTER"}</span>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) nav(`/search?q=${encodeURIComponent(q.trim())}`);
          }}
          style={{ marginLeft: "auto", display: "flex", gap: 6 }}
        >
          <input
            aria-label="Search everything"
            data-testid="global-search"
            placeholder="Search jobs, clients, quotes…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ minWidth: 180, minHeight: 36, padding: "4px 10px", fontSize: 13 }}
          />
        </form>
        <NavLink to="/notifications" className="bf-label" data-testid="bell" style={{ textDecoration: "none" }}>
          BELL{unread > 0 ? ` (${unread})` : ""}
        </NavLink>
      </header>

      <nav aria-label="Primary" style={{ display: "flex", flexWrap: "wrap", gap: 4, margin: "12px 0 20px" }}>
        {navItems().map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            className="bf-label"
            style={({ isActive }) => ({
              padding: "8px 14px",
              minHeight: "var(--tap-min)",
              display: "inline-flex",
              alignItems: "center",
              textDecoration: "none",
              color: isActive ? "var(--mark-ink)" : "var(--ink-mute)",
              background: isActive ? "var(--mark)" : "transparent",
              border: isActive ? "1px solid var(--ink)" : "1px solid transparent",
              borderRadius: "var(--radius)",
            })}
          >
            {n.label}
          </NavLink>
        ))}
        <span style={{ marginLeft: "auto", display: "inline-flex", gap: 10, alignItems: "center" }}>
          <ThemeSwitch />
          <GloveToggle />
          <button
            data-testid="logout"
            className="bf-label"
            onClick={() => {
              setSession(null);
              nav("/login");
            }}
            style={{ background: "none", border: "1px solid var(--rule-strong)", borderRadius: "var(--radius)", padding: "8px 12px", cursor: "pointer", minHeight: "var(--tap-min)" }}
          >
            {s.user.name.toUpperCase()} · OUT
          </button>
        </span>
      </nav>

      <main>{children}</main>
    </div>
  );
}
