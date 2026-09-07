import { useEffect, useState, useCallback } from "react";
import { useParams, Routes, Route, useNavigate } from "react-router-dom";
import { fx, API, errMsg } from "@/lib/api";
import { pendingCount, flush } from "@/lib/outbox";
import FieldJob from "@/field/FieldJob";
import { toast } from "sonner";

const Pin = ({ slug, onDone }) => {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const tap = async (d) => {
    setErr("");
    const p = pin + d;
    setPin(p);
    if (p.length === 4) {
      try {
        const { data } = await fx.post(`/field/${slug}/pin`, { pin: p });
        localStorage.setItem("bf_field_token", data.token);
        localStorage.setItem("bf_field_user", JSON.stringify(data.user));
        localStorage.setItem("bf_field_org", JSON.stringify(data.org));
        onDone();
      } catch (e) { setErr(errMsg(e)); setPin(""); }
    }
  };
  return (
    <div className="flex flex-col items-center justify-center px-8" style={{ minHeight: "100vh" }}>
      <div className="bf-label mb-2" style={{ color: "#f59e0b" }}>BAD FORM FIELD</div>
      <div className="mono text-sm mb-8" style={{ color: "#94a3b8" }}>{slug}</div>
      <div className="flex gap-3 mb-8" data-testid="pin-dots">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ width: 16, height: 16, border: "1px solid #262f3d", background: i < pin.length ? "#f59e0b" : "transparent", transform: "rotate(45deg)" }} />
        ))}
      </div>
      {err && <div className="mono text-xs mb-4" style={{ color: "#ef4444" }} data-testid="pin-error">{err}</div>}
      <div className="pinpad grid grid-cols-3 gap-3 w-full" style={{ maxWidth: 300 }}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <button key={n} data-testid={`pin-${n}`} onClick={() => tap(String(n))}>{n}</button>)}
        <button onClick={() => setPin("")} data-testid="pin-clear" style={{ fontSize: 12 }}>CLR</button>
        <button data-testid="pin-0" onClick={() => tap("0")}>0</button>
        <button onClick={() => setPin(pin.slice(0, -1))} data-testid="pin-back" style={{ fontSize: 12 }}>⌫</button>
      </div>
    </div>
  );
};

const Today = ({ onLogout }) => {
  const nav = useNavigate();
  const { slug } = useParams();
  const [data, setData] = useState(null);
  useEffect(() => {
    fx.get("/field/today").then((r) => setData(r.data)).catch(() => onLogout());
  }, [onLogout]);
  if (!data) return <div className="p-8 mono text-xs" style={{ color: "#94a3b8" }}>LOADING…</div>;
  return (
    <div className="px-5 py-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <div className="bf-label">TODAY · AWST · {data.date}</div>
          <h1 className="bf-h1 text-2xl" data-testid="field-user-name">{data.user.name}</h1>
        </div>
        <button className="bf-btn" data-testid="field-logout-btn" onClick={onLogout}>PIN OUT</button>
      </div>
      {data.jobs.length === 0 ? (
        <div className="bf-card bf-frame p-12 text-center mono" style={{ color: "#94a3b8", letterSpacing: "0.15em" }} data-testid="field-empty-day">NO JOBS THIS AWST DAY</div>
      ) : (
        <div className="space-y-4 bf-stagger" data-testid="field-today-jobs">
          {data.jobs.map((j) => (
            <div key={j.job_id} className="bf-card bf-frame p-5 cursor-pointer" data-testid={`field-job-${j.code}`} onClick={() => nav(`/f/${slug}/job/${j.job_id}`)}>
              <div className="flex justify-between mb-1">
                <span className="mono text-xs" style={{ color: "#f59e0b" }}>{j.code}</span>
                <span className="mono text-sm" style={{ color: "#f59e0b" }}>{(j.window_start || "").slice(0, 5)}–{(j.window_end || "").slice(0, 5)}</span>
              </div>
              <div className="bf-h1 text-lg">{j.title}</div>
              <div className="mono text-xs mt-1" style={{ color: "#94a3b8" }}>{j.client_name}<br />{j.address_text || j.site_name}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default function Field() {
  const { slug } = useParams();
  const [authed, setAuthed] = useState(!!localStorage.getItem("bf_field_token"));
  const [online, setOnline] = useState(navigator.onLine);
  const [queued, setQueued] = useState(0);

  const refreshQueue = useCallback(async () => setQueued(await pendingCount()), []);

  useEffect(() => {
    const up = async () => { setOnline(true); const n = await flush(API); if (n) toast.success(`SYNCED ${n} QUEUED OPS`); refreshQueue(); };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    const iv = setInterval(async () => { if (navigator.onLine) { await flush(API); } refreshQueue(); }, 8000);
    refreshQueue();
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); clearInterval(iv); };
  }, [refreshQueue]);

  const logout = useCallback(() => {
    ["bf_field_token", "bf_field_user", "bf_field_org"].forEach((k) => localStorage.removeItem(k));
    setAuthed(false);
  }, []);

  const org = JSON.parse(localStorage.getItem("bf_field_org") || "{}");

  return (
    <div style={{ minHeight: "100vh", background: "#0a0c0f", maxWidth: 560, margin: "0 auto", borderLeft: "1px solid #161b22", borderRight: "1px solid #161b22" }}>
      {org.is_demo && authed && <div className="demo-banner">SYNTHETIC DEMO — NOT A CLIENT</div>}
      {!online && <div className="mono text-xs text-center py-2" style={{ background: "#7f1d1d", color: "#fecaca", letterSpacing: "0.15em" }} data-testid="offline-banner">OFFLINE — QUEUED {queued}</div>}
      {online && queued > 0 && <div className="mono text-xs text-center py-2" style={{ background: "#1a1206", color: "#f59e0b" }} data-testid="queue-banner">SYNCING — QUEUED {queued}</div>}
      {!authed ? (
        <Pin slug={slug} onDone={() => setAuthed(true)} />
      ) : (
        <Routes>
          <Route index element={<Today onLogout={logout} />} />
          <Route path="job/:jobId" element={<FieldJob onQueue={refreshQueue} />} />
        </Routes>
      )}
    </div>
  );
}
