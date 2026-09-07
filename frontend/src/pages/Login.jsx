import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { cc, errMsg } from "@/lib/api";

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const { data } = await cc.post("/auth/login", { email, password });
      localStorage.setItem("bf_token", data.token);
      localStorage.setItem("bf_user", JSON.stringify(data.user));
      localStorage.setItem("bf_org", JSON.stringify(data.org));
      nav("/cc/day");
    } catch (e2) { setErr(errMsg(e2)); }
    setBusy(false);
  };

  return (
    <div className="bf-ground flex items-center justify-center px-6" style={{ minHeight: "100vh" }}>
      <div className="w-full bf-enter" style={{ maxWidth: 420 }}>
        <div className="bf-label mb-2" style={{ color: "#f59e0b" }}>BAD FORM SYSTEMS</div>
        <h1 className="bf-h1 text-4xl sm:text-5xl mb-1" style={{ color: "#e7ecf3" }}>TRADES IMS</h1>
        <p className="text-sm mb-8" style={{ color: "#94a3b8" }}>Command Center — owner &amp; bookkeeper sign-in. Crew use the Field PIN at /f/&#123;org&#125;.</p>
        <div className="bf-card bf-frame p-8">
          <form onSubmit={submit} className="space-y-5">
            <div>
              <div className="bf-label mb-1">EMAIL</div>
              <input data-testid="login-email-input" className="bf-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="owner.elec@demo.badform.invalid" autoFocus />
            </div>
            <div>
              <div className="bf-label mb-1">PASSWORD</div>
              <input data-testid="login-password-input" className="bf-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••" />
            </div>
            {err && <div data-testid="login-error" className="mono text-xs" style={{ color: "#ef4444" }}>{err}</div>}
            <button data-testid="login-submit-btn" className="bf-btn bf-btn-amber w-full" disabled={busy}>{busy ? "CHECKING…" : "ENTER COMMAND CENTER"}</button>
          </form>
        </div>
        <div className="mono text-xs mt-6 space-y-1" style={{ color: "#4b5563" }}>
          <div>DEMO — owner.elec@demo.badform.invalid / DemoOwner!elec</div>
          <div>DEMO — owner.conc@demo.badform.invalid / DemoOwner!conc</div>
          <div>FIELD — /f/sw-electrical-demo · PINs 1234 / 2345 / 3456</div>
        </div>
      </div>
    </div>
  );
}
