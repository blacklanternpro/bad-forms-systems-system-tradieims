import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { API, money, errMsg } from "@/lib/api";
import { SigPad } from "@/components/SigPad";

export default function PublicQuote() {
  const { token } = useParams();
  const [q, setQ] = useState(null);
  const [err, setErr] = useState("");
  const [name, setName] = useState("");
  const [sig, setSig] = useState(null);
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    axios.get(`${API}/public/q/${token}`).then((r) => setQ(r.data)).catch((e) => setErr(errMsg(e)));
  }, [token]);

  const accept = async () => {
    if (!name.trim()) return setErr("Enter your name to accept");
    setBusy(true); setErr("");
    try {
      const { data } = await axios.post(`${API}/public/q/${token}/accept`, { name, signature_base64: sig });
      setDone({ type: "accepted", ...data });
    } catch (e) { setErr(errMsg(e)); }
    setBusy(false);
  };
  const decline = async () => {
    setBusy(true); setErr("");
    try { await axios.post(`${API}/public/q/${token}/decline`); setDone({ type: "declined" }); }
    catch (e) { setErr(errMsg(e)); }
    setBusy(false);
  };

  if (err && !q) return <Center><div className="mono text-sm" style={{ color: "#ef4444" }} data-testid="public-quote-error">{err}</div></Center>;
  if (!q) return <Center><div className="mono text-xs" style={{ color: "#94a3b8" }}>LOADING…</div></Center>;

  if (done) return (
    <Center>
      <div className="bf-card bf-frame p-10 text-center" style={{ maxWidth: 460 }} data-testid="public-quote-done">
        <div className="bf-h1 text-3xl mb-3" style={{ color: done.type === "accepted" ? "#22c55e" : "#94a3b8" }}>
          {done.type === "accepted" ? "QUOTE ACCEPTED" : "QUOTE DECLINED"}</div>
        {done.type === "accepted" && (
          <div className="mono text-xs" style={{ color: "#94a3b8" }}>
            Job {done.job_code} raised.{done.deposit_cents > 0 && <><br />Deposit of {money(done.deposit_cents)} ex GST will be invoiced separately.</>}
          </div>
        )}
      </div>
    </Center>
  );

  return (
    <div className="bf-ground py-10 px-5" style={{ minHeight: "100vh" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }} className="bf-enter">
        {q.org.is_demo && <div className="demo-banner mb-4">SYNTHETIC DEMO — NOT A CLIENT</div>}
        <div className="bf-label" style={{ color: "#f59e0b" }}>{q.org.trading_name} · ABN {q.org.abn}</div>
        <h1 className="bf-h1 text-3xl mt-1 mb-1" data-testid="public-quote-title">QUOTE {q.code}</h1>
        <div className="mono text-xs mb-6" style={{ color: "#94a3b8" }}>{q.title} · for {q.client.name}{q.site ? ` · ${q.site.address_text || q.site.name}` : ""} · valid until {q.valid_until} · not an invoice</div>
        <div className="bf-card bf-frame p-6 mb-6">
          <table className="w-full mono text-xs">
            <tbody>
              {q.lines.map((l, i) => (
                <tr key={i}><td className="py-1">{l.description}</td><td style={{ textAlign: "right", color: "#94a3b8" }}>{l.qty} ×</td><td style={{ textAlign: "right", width: 110 }}>{money(l.unit_cents)}</td></tr>
              ))}
              <tr style={{ borderTop: "1px solid #262f3d" }}>
                <td className="pt-3 bf-label">TOTAL INC GST</td><td />
                <td className="pt-3 mono text-lg" style={{ textAlign: "right", color: "#f59e0b" }} data-testid="public-quote-total">{money(q.total_cents + q.gst_cents)}</td>
              </tr>
              {q.deposit_cents > 0 && <tr><td colSpan={3} className="pt-2 mono text-xs" style={{ color: "#94a3b8" }} data-testid="public-quote-deposit">Deposit on acceptance: {money(q.deposit_cents)} ex GST ({q.deposit_bps / 100}%)</td></tr>}
            </tbody>
          </table>
        </div>
        <a className="mono text-xs" style={{ color: "#f59e0b" }} href={`${API}/public/q/${token}/pdf`} target="_blank" rel="noreferrer" data-testid="public-quote-pdf-link">▸ VIEW LETTERHEAD PDF</a>
        {q.status === "accepted" ? (
          <div className="mono text-sm mt-6" style={{ color: "#22c55e" }}>Already accepted.</div>
        ) : (
          <div className="bf-card p-6 mt-6">
            <div className="bf-label mb-2">YOUR NAME (REQUIRED)</div>
            <input className="bf-input mb-4" data-testid="public-accept-name-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
            <div className="bf-label mb-2">SIGNATURE (OPTIONAL)</div>
            <SigPad onChange={setSig} />
            {err && <div className="mono text-xs mt-3" style={{ color: "#ef4444" }} data-testid="public-quote-action-error">{err}</div>}
            <div className="grid grid-cols-2 gap-3 mt-5">
              <button className="bf-btn bf-btn-amber py-4" data-testid="public-accept-btn" disabled={busy} onClick={accept}>ACCEPT QUOTE</button>
              <button className="bf-btn bf-btn-danger py-4" data-testid="public-decline-btn" disabled={busy} onClick={decline}>DECLINE</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const Center = ({ children }) => (
  <div className="bf-ground flex items-center justify-center" style={{ minHeight: "100vh" }}>{children}</div>
);
