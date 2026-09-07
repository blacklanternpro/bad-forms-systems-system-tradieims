import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { API, money, errMsg } from "@/lib/api";
import { SigPad } from "@/components/SigPad";

export default function PublicSign() {
  const { token } = useParams();
  const [v, setV] = useState(null);
  const [err, setErr] = useState("");
  const [name, setName] = useState("");
  const [sig, setSig] = useState(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    axios.get(`${API}/public/s/${token}`).then((r) => setV(r.data)).catch((e) => setErr(errMsg(e)));
  }, [token]);

  const sign = async () => {
    if (!name.trim()) return setErr("Enter your name");
    setBusy(true); setErr("");
    try {
      await axios.post(`${API}/public/s/${token}/sign`, { name, signature_base64: sig });
      setDone(true);
    } catch (e) { setErr(errMsg(e)); }
    setBusy(false);
  };

  const C = ({ children }) => <div className="bf-ground flex items-center justify-center px-5" style={{ minHeight: "100vh" }}>{children}</div>;

  if (err && !v) return <C><div className="mono text-sm text-center" style={{ color: "#ef4444" }} data-testid="public-sign-error">{err}</div></C>;
  if (!v) return <C><div className="mono text-xs" style={{ color: "#94a3b8" }}>LOADING…</div></C>;
  if (done) return <C><div className="bf-card bf-frame p-10 text-center" data-testid="public-sign-done"><div className="bf-h1 text-3xl" style={{ color: "#22c55e" }}>VARIATION SIGNED</div><div className="mono text-xs mt-2" style={{ color: "#94a3b8" }}>A signed copy has been queued to your email.</div></div></C>;

  return (
    <C>
      <div style={{ maxWidth: 520, width: "100%" }} className="bf-enter">
        {v.org.is_demo && <div className="demo-banner mb-4">SYNTHETIC DEMO — NOT A CLIENT</div>}
        <div className="bf-label" style={{ color: "#f59e0b" }}>{v.org.trading_name} · ABN {v.org.abn}</div>
        <h1 className="bf-h1 text-3xl mt-1 mb-1" data-testid="public-sign-title">SIGN {v.code}</h1>
        <div className="mono text-xs mb-5" style={{ color: "#94a3b8" }}>Job {v.job.code} — {v.job.title} · not an invoice</div>
        <div className="bf-card bf-frame p-6 mb-5">
          <div className="mb-2">{v.title}</div>
          <div className="mono text-lg" style={{ color: "#f59e0b" }} data-testid="public-sign-amount">{money(v.amount_cents)} ex GST · GST {money(v.gst_cents)} · total {money(v.amount_cents + v.gst_cents)}</div>
        </div>
        <div className="bf-card p-6">
          <div className="bf-label mb-2">YOUR NAME</div>
          <input className="bf-input mb-4" data-testid="public-sign-name-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
          <div className="bf-label mb-2">SIGNATURE</div>
          <SigPad onChange={setSig} />
          {err && <div className="mono text-xs mt-3" style={{ color: "#ef4444" }} data-testid="public-sign-action-error">{err}</div>}
          <button className="bf-btn bf-btn-amber w-full py-4 mt-5" data-testid="public-sign-btn" disabled={busy} onClick={sign}>SIGN VARIATION</button>
        </div>
      </div>
    </C>
  );
}
