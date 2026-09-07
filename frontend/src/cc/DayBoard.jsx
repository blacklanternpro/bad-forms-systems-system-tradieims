import { useEffect, useState, useCallback } from "react";
import { cc, errMsg } from "@/lib/api";
import { toast } from "sonner";

const todayIso = () => new Date(new Date().toLocaleString("en-US", { timeZone: "Australia/Perth" })).toISOString().slice(0, 10);

export default function DayBoard() {
  const [date, setDate] = useState(todayIso());
  const [board, setBoard] = useState({ jobs: [] });
  const [dir, setDir] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [form, setForm] = useState({ job_id: "", user_id: "", window_start: "07:00", window_end: "15:00" });
  const isOwner = (JSON.parse(localStorage.getItem("bf_user") || "{}").role) === "owner";

  const load = useCallback(async () => {
    const { data } = await cc.get(`/dayboard?date_str=${date}`);
    setBoard(data);
  }, [date]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    cc.get("/directory").then((r) => setDir(r.data));
    cc.get("/jobs").then((r) => setJobs(r.data));
  }, []);

  const shift = (n) => {
    const d = new Date(date); d.setDate(d.getDate() + n);
    setDate(d.toISOString().slice(0, 10));
  };

  const copyPrev = async () => {
    try {
      const { data } = await cc.post("/dayboard/copy-previous", { date });
      toast.success(`COPIED ${data.copied} ASSIGNMENTS FROM ${data.from}`);
      load();
    } catch (e) { toast.error(errMsg(e)); }
  };

  const assign = async () => {
    if (!form.job_id || !form.user_id) return toast.error("PICK A JOB AND CREW");
    try {
      await cc.post("/dayboard/assign", { ...form, on_date: date });
      toast.success("ASSIGNED"); load();
    } catch (e) { toast.error(errMsg(e)); }
  };

  const unassign = async (id) => { await cc.delete(`/dayboard/assign/${id}`); load(); };
  const crew = (dir?.users || []).filter((u) => u.role === "crew");

  return (
    <div className="bf-enter">
      <div className="flex items-end justify-between mb-8">
        <div>
          <div className="bf-label mb-1">SCHEDULE — AWST</div>
          <h1 className="bf-h1 text-4xl" data-testid="dayboard-title">DAY BOARD</h1>
        </div>
        <div className="flex gap-2 items-center">
          <button className="bf-btn" data-testid="dayboard-prev-btn" onClick={() => shift(-1)}>◂ PREV</button>
          <input type="date" className="bf-input" style={{ width: 170 }} data-testid="dayboard-date-input" value={date} onChange={(e) => setDate(e.target.value)} />
          <button className="bf-btn" data-testid="dayboard-next-btn" onClick={() => shift(1)}>NEXT ▸</button>
          {isOwner && <button className="bf-btn bf-btn-amber" data-testid="copy-previous-day-btn" onClick={copyPrev}>COPY PREVIOUS DAY</button>}
        </div>
      </div>

      {isOwner && (
        <div className="bf-card p-5 mb-8 flex gap-3 items-end" data-testid="assign-form">
          <div style={{ flex: 2 }}>
            <div className="bf-label mb-1">JOB</div>
            <select className="bf-select bf-input" data-testid="assign-job-select" value={form.job_id} onChange={(e) => setForm({ ...form, job_id: e.target.value })}>
              <option value="">— job —</option>
              {jobs.map((j) => <option key={j.id} value={j.id}>{`${j.code} · ${j.title}`}</option>)}
            </select>
          </div>
          <div style={{ flex: 1.4 }}>
            <div className="bf-label mb-1">CREW</div>
            <select className="bf-select bf-input" data-testid="assign-crew-select" value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })}>
              <option value="">— crew —</option>
              {crew.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div><div className="bf-label mb-1">FROM</div><input type="time" className="bf-input" data-testid="assign-start-input" value={form.window_start} onChange={(e) => setForm({ ...form, window_start: e.target.value })} /></div>
          <div><div className="bf-label mb-1">TO</div><input type="time" className="bf-input" data-testid="assign-end-input" value={form.window_end} onChange={(e) => setForm({ ...form, window_end: e.target.value })} /></div>
          <button className="bf-btn bf-btn-amber" data-testid="assign-submit-btn" onClick={assign}>ASSIGN</button>
        </div>
      )}

      {board.jobs.length === 0 ? (
        <div className="bf-card bf-frame p-16 text-center" data-testid="empty-day-board">
          <div className="mono text-2xl" style={{ color: "#94a3b8", letterSpacing: "0.2em" }}>NO JOBS THIS AWST DAY</div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-6 bf-stagger" data-testid="dayboard-jobs">
          {board.jobs.map((j) => (
            <div key={j.job_id} className="bf-card bf-frame p-6" data-testid={`dayboard-job-${j.code}`}>
              <div className="flex justify-between items-start mb-3">
                <div>
                  <span className="mono text-xs" style={{ color: "#f59e0b" }}>{j.code}</span>
                  <h3 className="bf-h1 text-lg mt-1" style={{ color: "#e7ecf3" }}>{j.title}</h3>
                </div>
                <span className={`bf-chip ${j.billing === "quoted" ? "chip-amber" : "chip-steel"}`}>{j.billing.toUpperCase()}</span>
              </div>
              <div className="mono text-xs mb-4" style={{ color: "#94a3b8" }}>
                {j.client_name}<br />{j.address_text || j.site_name || "—"}
              </div>
              <div className="space-y-2">
                {j.crew.map((c) => (
                  <div key={c.assignment_id} className="flex justify-between items-center mono text-xs px-3 py-2" style={{ background: "#0d1015", border: "1px solid #262f3d" }}>
                    <span style={{ color: "#e7ecf3" }}>{c.name}</span>
                    <span style={{ color: "#f59e0b" }}>{(c.window_start || "").slice(0, 5)}–{(c.window_end || "").slice(0, 5)}
                      {isOwner && <button data-testid={`unassign-${c.assignment_id}`} onClick={() => unassign(c.assignment_id)} style={{ background: "none", border: 0, color: "#ef4444", cursor: "pointer", marginLeft: 10 }}>✕</button>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
