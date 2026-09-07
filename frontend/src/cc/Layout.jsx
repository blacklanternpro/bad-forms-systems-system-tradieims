import { Outlet, NavLink, useNavigate } from "react-router-dom";

const NAV = [
  ["day", "DAY BOARD"], ["quotes", "QUOTES"], ["jobs", "JOBS"], ["inbox", "INBOX"],
  ["ledger", "LEDGER DRAFTS"], ["directory", "DIRECTORY"], ["modules", "MODULES"],
];

export default function Layout() {
  const nav = useNavigate();
  const user = JSON.parse(localStorage.getItem("bf_user") || "{}");
  const org = JSON.parse(localStorage.getItem("bf_org") || "{}");
  const logout = () => { ["bf_token", "bf_user", "bf_org"].forEach((k) => localStorage.removeItem(k)); nav("/login"); };

  return (
    <div className="bf-ground" style={{ minWidth: 1280 }}>
      {org.is_demo && <div className="demo-banner" data-testid="demo-banner">SYNTHETIC DEMO — NOT A CLIENT</div>}
      <div className="flex items-center gap-10 px-10" style={{ height: 64, borderBottom: "1px solid #262f3d", background: "#0d1015" }}>
        <div>
          <span className="bf-h1 text-lg" style={{ color: "#f59e0b" }}>BAD FORM</span>
          <span className="mono text-xs ml-3" style={{ color: "#94a3b8" }}>{org.trading_name}</span>
        </div>
        <nav className="flex gap-1 flex-1">
          {NAV.map(([path, label]) => (
            <NavLink key={path} to={`/cc/${path}`} data-testid={`nav-${path}`}
              className="mono text-xs px-4 py-2"
              style={({ isActive }) => ({
                letterSpacing: "0.1em", color: isActive ? "#0a0c0f" : "#94a3b8",
                background: isActive ? "#f59e0b" : "transparent", fontWeight: isActive ? 700 : 400,
                clipPath: "polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)",
              })}>{label}</NavLink>
          ))}
        </nav>
        <div className="mono text-xs" style={{ color: "#94a3b8" }}>{user.name} · {String(user.role || "").toUpperCase()}</div>
        <button data-testid="logout-btn" className="bf-btn" onClick={logout}>EXIT</button>
      </div>
      <main className="px-10 py-8" style={{ maxWidth: 1600, margin: "0 auto" }}>
        <Outlet />
      </main>
    </div>
  );
}
