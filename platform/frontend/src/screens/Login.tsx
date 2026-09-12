import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, setSession, type Session } from "../api";
import Button from "../components/Button";
import Field from "../components/Field";

type Mode = "office" | "crew";

export default function Login() {
  const nav = useNavigate();
  const [mode, setMode] = useState<Mode>("office");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = (s: Session) => {
    setSession(s);
    nav(s.user.role === "crew" ? "/field" : "/desk");
  };

  const submitOffice = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      finish(await api<Session>("/auth/login", { body: { email, password } }));
    } catch {
      setError("Invalid email or password");
    } finally {
      setBusy(false);
    }
  };

  const tapDigit = async (d: string) => {
    if (d === "⌫") {
      setPin((p) => p.slice(0, -1));
      return;
    }
    const next = (pin + d).slice(0, 4);
    setPin(next);
    if (next.length === 4) {
      setBusy(true);
      setError(null);
      try {
        finish(await api<Session>("/auth/pin", { body: { org_slug: orgSlug, pin: next } }));
      } catch {
        setError("PIN not recognised");
        setPin("");
      } finally {
        setBusy(false);
      }
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <h1 className="bf-h1" style={{ fontSize: 22, marginBottom: 4 }}>BAD FORM SYSTEMS</h1>
        <p className="bf-label" style={{ marginBottom: 24 }}>SIGN IN</p>

        <div role="tablist" aria-label="Login mode" style={{ display: "flex", gap: 4, marginBottom: 20 }}>
          {(["office", "crew"] as Mode[]).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              data-testid={`mode-${m}`}
              className="bf-label"
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              style={{
                flex: 1,
                padding: "10px 0",
                minHeight: "var(--tap-min)",
                cursor: "pointer",
                background: mode === m ? "var(--mark)" : "var(--ground-raise)",
                color: mode === m ? "var(--mark-ink)" : "var(--ink-mute)",
                border: "1px solid var(--rule-strong)",
                borderRadius: "var(--radius)",
              }}
            >
              {m === "office" ? "OFFICE" : "CREW PIN"}
            </button>
          ))}
        </div>

        {mode === "office" ? (
          <form onSubmit={submitOffice}>
            <Field label="EMAIL" type="email" value={email} onChange={setEmail} required testId="login-email" />
            <Field label="PASSWORD" type="password" value={password} onChange={setPassword} required testId="login-password" />
            <Button type="submit" kind="mark" full disabled={busy} testId="login-submit">
              {busy ? "SIGNING IN…" : "SIGN IN"}
            </Button>
          </form>
        ) : (
          <div>
            <Field label="YARD CODE" value={orgSlug} onChange={setOrgSlug} placeholder="e.g. demo" required testId="login-slug" />
            <p className="bf-mono" aria-label="PIN entered" style={{ textAlign: "center", fontSize: 26, letterSpacing: "0.5em", minHeight: 38, margin: "8px 0 14px" }}>
              {"●".repeat(pin.length)}
              {"○".repeat(4 - pin.length)}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((d, i) =>
                d === "" ? (
                  <span key={i} />
                ) : (
                  <button
                    key={i}
                    data-testid={`pin-${d}`}
                    disabled={busy || (d !== "⌫" && !orgSlug)}
                    onClick={() => void tapDigit(d)}
                    style={{
                      minHeight: 64,
                      fontSize: 22,
                      fontFamily: "var(--font-mono)",
                      background: "var(--ground-raise)",
                      color: "var(--ink)",
                      border: "1px solid var(--rule-strong)",
                      borderRadius: "var(--radius)",
                      cursor: "pointer",
                      opacity: busy || (d !== "⌫" && !orgSlug) ? 0.4 : 1,
                    }}
                  >
                    {d}
                  </button>
                ),
              )}
            </div>
          </div>
        )}

        {error && (
          <p role="alert" data-testid="login-error" style={{ color: "var(--stamp-bad)", fontFamily: "var(--font-mono)", fontSize: 13, marginTop: 14, textAlign: "center" }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
