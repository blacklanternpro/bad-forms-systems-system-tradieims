import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, type FieldJobPack } from "../../api";
import Button from "../../components/Button";
import Sheet from "../../components/Sheet";
import Stamp from "../../components/Stamp";
import { EmptyView, ErrorView, LoadingView } from "../../components/StatusViews";
import { useAction, useLoad } from "../../hooks";

const CAPTURE_TYPES = [
  { value: "receipt", label: "RECEIPT / SUPPLIER INVOICE" },
  { value: "voice_timesheet", label: "VOICE TIMESHEET" },
  { value: "prestart", label: "PRE-START" },
  { value: "incident", label: "INCIDENT" },
] as const;

/** The job pack: gate code, who's on, drawings, stages, hours, capture. */
export default function FieldJob() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const pack = useLoad(() => api<FieldJobPack>(`/field/jobs/${id}`), [id]);
  const act = useAction();
  const [capOpen, setCapOpen] = useState(false);
  const [capType, setCapType] = useState<string>("receipt");
  const [capResult, setCapResult] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (pack.loading) return <LoadingView label="OPENING JOB PACK" />;
  if (pack.error) return <ErrorView message={pack.error} onRetry={pack.reload} />;
  if (!pack.data) return <EmptyView title="JOB NOT FOUND" />;

  const p = pack.data;
  const clocked = p.open_time_entry !== null;

  const clock = (action: "start" | "stop") =>
    void act.run(async () => {
      await api(`/field/jobs/${id}/time`, { body: { action } });
      pack.reload();
    });

  const stageDone = (stageId: string) =>
    void act.run(async () => {
      await api(`/field/jobs/${id}/stage-done`, { body: { stage_id: stageId } });
      pack.reload();
    });

  const submitCapture = () =>
    void act.run(async () => {
      const form = new FormData();
      form.set("capture_type", capType);
      form.set("job_id", id ?? "");
      const f = fileRef.current?.files?.[0];
      if (f) form.set("file", f);
      const res = await api<{ routing: string; confidence: number }>("/captures", { form });
      setCapResult(
        res.routing === "fast_track"
          ? `READ CLEAN (${Number(res.confidence).toFixed(2)}) — off to the office`
          : `NOT SURE (${Number(res.confidence).toFixed(2)}) — sent to the office to check`,
      );
      if (fileRef.current) fileRef.current.value = "";
    });

  return (
    <div>
      <button className="bf-label" onClick={() => nav("/field")} style={{ background: "none", border: 0, cursor: "pointer", padding: "4px 0", marginBottom: 8, minHeight: "var(--tap-min)" }}>
        ← BOARD
      </button>
      <header style={{ marginBottom: 6 }}>
        <span className="bf-mono" style={{ fontSize: 13, color: "var(--ink-mute)" }}>{p.job.code}</span>
        <h2 style={{ margin: "2px 0 0", fontSize: 19 }}>{p.job.title}</h2>
      </header>
      <p className="bf-mono" style={{ fontSize: 13, margin: "0 0 4px" }}>
        {p.job.site_name ?? "—"} · {p.job.address ?? ""}
      </p>
      {p.job.gate_code && (
        <p style={{ margin: "0 0 4px" }}>
          <Stamp label={`GATE ${p.job.gate_code}`} tone="info" testId="gate-code" />
        </p>
      )}
      {p.job.site_contact && (
        <p className="bf-mono" style={{ fontSize: 13, margin: "0 0 4px" }}>
          Site: {p.job.site_contact} {p.job.site_phone && <a href={`tel:${p.job.site_phone}`}>{p.job.site_phone}</a>}
        </p>
      )}
      {p.on_today.length > 0 && (
        <p className="bf-mono" style={{ fontSize: 13, margin: "0 0 4px", color: "var(--ink-mute)" }}>With: {p.on_today.join(", ")}</p>
      )}

      {act.error && <ErrorView message={act.error} />}

      <div style={{ display: "grid", gap: 8, margin: "18px 0" }}>
        <Button kind={clocked ? "danger" : "mark"} full disabled={act.busy} onClick={() => clock(clocked ? "stop" : "start")} testId="clock">
          {clocked ? "CLOCK OFF" : "CLOCK ON"}
        </Button>
        <Button kind="accent" full onClick={() => { setCapResult(null); setCapOpen(true); }} testId="capture-open">
          CAPTURE PAPERWORK
        </Button>
      </div>

      <h3 className="bf-label">STAGES</h3>
      {p.stages.length === 0 ? (
        <EmptyView title="NO STAGES ON THIS JOB" />
      ) : (
        <ol style={{ margin: "6px 0 18px", padding: 0, listStyle: "none" }}>
          {p.stages.map((s) => (
            <li key={s.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--rule)" }}>
              <Stamp label={s.completed_at ? "DONE" : s.requires_photo ? "PHOTO REQ" : "OPEN"} tone={s.completed_at ? "ok" : s.requires_photo ? "warn" : "mute"} />
              <span style={{ flex: 1, fontSize: 14 }}>{s.name}</span>
              {!s.completed_at && (
                <Button kind="quiet" disabled={act.busy} onClick={() => stageDone(s.id)} testId={`stage-${s.sort}`}>
                  SIGN OFF
                </Button>
              )}
            </li>
          ))}
        </ol>
      )}

      <h3 className="bf-label">DRAWINGS</h3>
      {p.drawings.length === 0 ? (
        <EmptyView title="NO DRAWINGS ATTACHED" />
      ) : (
        <ul style={{ margin: "6px 0 0", padding: 0, listStyle: "none" }}>
          {p.drawings.map((doc) => (
            <li key={doc.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--rule)" }}>
              <a className="bf-mono" style={{ fontSize: 13 }} href={`/api/documents/${doc.id}/raw`} target="_blank" rel="noreferrer">
                {doc.name} ↗
              </a>
            </li>
          ))}
        </ul>
      )}

      <Sheet title="CAPTURE" open={capOpen} onClose={() => setCapOpen(false)} testId="capture-sheet">
        {capResult ? (
          <div style={{ textAlign: "center", padding: "12px 0" }}>
            <Stamp label={capResult.startsWith("READ CLEAN") ? "CAPTURED" : "SENT FOR REVIEW"} tone={capResult.startsWith("READ CLEAN") ? "ok" : "warn"} testId="capture-result" />
            <p className="bf-mono" style={{ fontSize: 13, marginTop: 10 }}>{capResult}</p>
            <div style={{ marginTop: 14 }}>
              <Button kind="mark" full onClick={() => setCapOpen(false)}>DONE</Button>
            </div>
          </div>
        ) : (
          <div>
            <label className="bf-label" style={{ display: "block", marginBottom: 12 }}>
              WHAT IS IT
              <select value={capType} onChange={(e) => setCapType(e.target.value)} data-testid="capture-type" style={{ display: "block", width: "100%", marginTop: 4 }}>
                {CAPTURE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </label>
            <label className="bf-label" style={{ display: "block", marginBottom: 16 }}>
              PHOTO / FILE
              <input ref={fileRef} type="file" accept="image/*,audio/*" capture="environment" data-testid="capture-file" style={{ display: "block", width: "100%", marginTop: 4 }} />
            </label>
            <Button kind="mark" full disabled={act.busy} onClick={submitCapture} testId="capture-submit">
              {act.busy ? "READING…" : "CAPTURE"}
            </Button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
