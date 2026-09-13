import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { api, getSession, getVirginToken, moduleLive, setSession, subscribeVirgin, type NotificationRow } from "../api";
import { GloveToggle, ThemeSwitch, applyBrand } from "../components/Chrome";
import Stamp from "../components/Stamp";

/** Nav is composed per instance: pack entries only appear when the module is live. */
function navItems(): { to: string; label: string; end?: boolean }[] {
  const items = [
    { to: "/desk", label: "Desk", end: true },
    { to: "/dayboard", label: "Day board" },
    { to: "/jobs", label: "Jobs" },
    { to: "/quotes", label: "Quotes" },
    { to: "/inbox", label: "Inbox" },
  ];
  if (moduleLive("trades")) items.push({ to: "/certs", label: "Certs" });
  if (moduleLive("civil")) items.push({ to: "/plant", label: "Plant" }, { to: "/dockets", label: "Dockets" });
  if (moduleLive("fab")) items.push({ to: "/shop", label: "Shop" });
  if (moduleLive("fleet")) items.push({ to: "/fleet", label: "Fleet" });
  items.push({ to: "/admin", label: "Admin" });
  return items;
}

export interface CommandShellProps {
  children: ReactNode;
}

/** Command Center chrome: masthead, nav, notification count, search. */
export default function CommandShell({ children }: CommandShellProps) {
  const nav = useNavigate();
  const s = getSession();
  const [unread, setUnread] = useState(0);
  const [virgin, setVirgin] = useState(!!getVirginToken());
  const [q, setQ] = useState("");

  useEffect(() => {
    let live = true;
    applyBrand(getSession()?.org.brand?.tokens);
    api<NotificationRow[]>("/notifications")
      .then((rows) => live && setUnread(rows.length))
      .catch(() => undefined);
    const unsub = subscribeVirgin(() => setVirgin(!!getVirginToken()));
    return () => {
      live = false;
      unsub();
    };
  }, []);

  if (!s) return null;

  const stamp = virgin
    ? { label: "Demo cleared — reload to restore", tone: "warn" as const }
    : s.org.pilot
      ? { label: "Pilot", tone: "info" as const }
      : s.org.is_demo
        ? { label: "Demo yard", tone: "info" as const }
        : null;

  const initials = s.user.name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div style={{ minHeight: "100vh" }}>
      <header className="bf-mast">
        <h1 className="bf-wordmark">{s.org.name}</h1>
        {stamp ? <Stamp label={stamp.label} tone={stamp.tone} testId="masthead-stamp" /> : (
          <span className="bf-label" data-testid="masthead-stamp">
            Office
          </span>
        )}

        <nav className="bf-nav" aria-label="Primary">
          {navItems().map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>
              {n.label}
            </NavLink>
          ))}
        </nav>

        <form
          className="bf-mast__tools"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) nav(`/search?q=${encodeURIComponent(q.trim())}`);
          }}
        >
          <input
            className="bf-search"
            aria-label="Search everything"
            data-testid="global-search"
            placeholder="Search jobs, clients, quotes…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <NavLink to="/notifications" className="bf-mast__alerts" data-testid="bell">
            Alerts{unread > 0 ? ` (${unread})` : ""}
          </NavLink>
          <ThemeSwitch compact />
          <GloveToggle />
          <span className="bf-avatar" title={s.user.name} aria-label={`Signed in as ${s.user.name}`} role="img">
            {initials}
          </span>
          <button
            type="button"
            data-testid="logout"
            className="bf-quiet-btn bf-mast__signout"
            onClick={() => {
              setSession(null);
              nav("/login");
            }}
          >
            Sign out
          </button>
        </form>
      </header>

      <main className="bf-content">{children}</main>
    </div>
  );
}
