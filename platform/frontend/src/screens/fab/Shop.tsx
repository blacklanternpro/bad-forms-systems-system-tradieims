import { useState } from "react";
import { api, type ItpTemplate, type JobRow, type MaterialLot, type NdiRecord, type OffcutRow } from "../../api";
import Button from "../../components/Button";
import Field from "../../components/Field";
import LedgerTable from "../../components/LedgerTable";
import Sheet from "../../components/Sheet";
import Stamp from "../../components/Stamp";
import { EmptyView, ErrorView, LoadingView } from "../../components/StatusViews";
import { useAction, useLoad } from "../../hooks";

type Tab = "materials" | "ndi" | "offcuts" | "itp";

const TAB_LABELS: Record<Tab, string> = {
  materials: "MATERIAL LOTS",
  ndi: "NDI",
  offcuts: "OFFCUT RACK",
  itp: "ITP TEMPLATES",
};

const NDI_METHODS = ["visual", "UT", "MT", "PT", "RT"] as const;

export interface JobSelectProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  allowNone?: boolean;
  testId?: string;
}

/** Shared job picker for pack forms. */
export function JobSelect({ label, value, onChange, allowNone = false, testId }: JobSelectProps) {
  const jobs = useLoad(() => api<JobRow[]>("/jobs"));
  return (
    <label className="bf-label" style={{ display: "block", marginBottom: 12 }}>
      {label}
      <select
        data-testid={testId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ display: "block", width: "100%", marginTop: 4 }}
      >
        <option value="">{allowNone ? "— STOCK / NO JOB —" : "— PICK A JOB —"}</option>
        {(jobs.data ?? []).map((j) => (
          <option key={j.id} value={j.id}>
            {j.code} — {j.title}
          </option>
        ))}
      </select>
      {jobs.error && <ErrorView message={jobs.error} onRetry={jobs.reload} />}
    </label>
  );
}

export interface ApplyItpProps {
  jobId: string;
  onApplied: () => void;
}

/** Job-page panel: stamp an ITP's stages onto a job that has none yet. */
export function ApplyItp({ jobId, onApplied }: ApplyItpProps) {
  const templates = useLoad(() => api<ItpTemplate[]>("/fab/itp-templates"));
  const act = useAction();
  const [tplId, setTplId] = useState("");

  const apply = () =>
    void act.run(async () => {
      await api("/fab/apply-itp", { body: { job_id: jobId, template_id: tplId } });
      onApplied();
    });

  if (templates.loading) return <LoadingView label="ITP TEMPLATES" />;
  if (templates.error) return <ErrorView message={templates.error} onRetry={templates.reload} />;
  if (!templates.data || templates.data.length === 0) {
    return <EmptyView title="NO ITP TEMPLATES" hint="Build one on the SHOP page, then apply it here." />;
  }

  return (
    <div style={{ marginTop: 10 }}>
      <label className="bf-label" style={{ display: "block", marginBottom: 8 }}>
        APPLY ITP
        <select data-testid="itp-pick" value={tplId} onChange={(e) => setTplId(e.target.value)} style={{ display: "block", width: "100%", marginTop: 4 }}>
          <option value="">— PICK A TEMPLATE —</option>
          {templates.data.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.stages.length} stages)
            </option>
          ))}
        </select>
      </label>
      {act.error && <ErrorView message={act.error} />}
      <Button kind="mark" disabled={act.busy || !tplId} onClick={apply} testId="itp-apply">
        {act.busy ? "STAMPING…" : "STAMP STAGES ONTO JOB"}
      </Button>
    </div>
  );
}

/** Shop floor desk: traceability ledger — heats, NDI, the offcut rack, ITPs. */
export default function Shop() {
  const [tab, setTab] = useState<Tab>("materials");
  const lots = useLoad(() => api<MaterialLot[]>("/fab/materials"));
  const ndi = useLoad(() => api<NdiRecord[]>("/fab/ndi"));
  const [rack, setRack] = useState<"available" | "all">("available");
  const offcuts = useLoad(() => api<OffcutRow[]>(`/fab/offcuts?status=${rack}`), [rack]);
  const templates = useLoad(() => api<ItpTemplate[]>("/fab/itp-templates"));
  const act = useAction();

  const [lotOpen, setLotOpen] = useState(false);
  const [heat, setHeat] = useState("");
  const [material, setMaterial] = useState("");
  const [mill, setMill] = useState("");
  const [certRef, setCertRef] = useState("");
  const [lotJob, setLotJob] = useState("");

  const [ndiOpen, setNdiOpen] = useState(false);
  const [ndiJob, setNdiJob] = useState("");
  const [method, setMethod] = useState<string>("visual");
  const [result, setResult] = useState<"pass" | "fail">("pass");
  const [reportRef, setReportRef] = useState("");
  const [inspector, setInspector] = useState("");

  const [offOpen, setOffOpen] = useState(false);
  const [offDesc, setOffDesc] = useState("");
  const [offMaterial, setOffMaterial] = useState("");
  const [offHeat, setOffHeat] = useState("");
  const [allocating, setAllocating] = useState<OffcutRow | null>(null);
  const [allocJob, setAllocJob] = useState("");

  const [tplOpen, setTplOpen] = useState(false);
  const [tplName, setTplName] = useState("");
  const [tplStages, setTplStages] = useState("");

  const bookLot = () =>
    void act.run(async () => {
      await api("/fab/materials", {
        body: { job_id: lotJob || null, heat_no: heat.trim(), material: material.trim() || null, mill: mill.trim() || null, cert_ref: certRef.trim() || null },
      });
      setLotOpen(false);
      setHeat("");
      setMaterial("");
      setMill("");
      setCertRef("");
      setLotJob("");
      lots.reload();
    });

  const recordNdi = () =>
    void act.run(async () => {
      await api("/fab/ndi", {
        body: { job_id: ndiJob, method, result, report_ref: reportRef.trim() || null, inspector: inspector.trim() || null },
      });
      setNdiOpen(false);
      setNdiJob("");
      setReportRef("");
      setInspector("");
      ndi.reload();
    });

  const rackOffcut = () =>
    void act.run(async () => {
      await api("/fab/offcuts", {
        body: { description: offDesc.trim(), material: offMaterial.trim() || null, heat_no: offHeat.trim() || null },
      });
      setOffOpen(false);
      setOffDesc("");
      setOffMaterial("");
      setOffHeat("");
      offcuts.reload();
    });

  const allocate = () =>
    void act.run(async () => {
      if (!allocating) return;
      await api(`/fab/offcuts/${allocating.id}/allocate`, { body: { job_id: allocJob } });
      setAllocating(null);
      setAllocJob("");
      offcuts.reload();
      lots.reload();
    });

  const createTemplate = () =>
    void act.run(async () => {
      const stages = tplStages
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => ({
          name: line.endsWith("*") ? line.slice(0, -1).trim() : line,
          requires_photo: line.endsWith("*"),
        }));
      await api("/fab/itp-templates", { body: { name: tplName.trim(), stages } });
      setTplOpen(false);
      setTplName("");
      setTplStages("");
      templates.reload();
    });

  return (
    <div>
      <div role="tablist" aria-label="Shop desk" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            data-testid={`tab-${t}`}
            className="bf-label"
            onClick={() => setTab(t)}
            style={{
              padding: "10px 16px",
              minHeight: "var(--tap-min)",
              cursor: "pointer",
              background: tab === t ? "var(--mark)" : "transparent",
              color: tab === t ? "var(--mark-ink)" : "var(--ink-mute)",
              border: "1px solid var(--rule-strong)",
              borderRadius: "var(--radius)",
            }}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>
      {act.error && <ErrorView message={act.error} />}

      {tab === "materials" && (
        <>
          <div style={{ marginBottom: 12 }}>
            <Button kind="mark" onClick={() => setLotOpen(true)} testId="lot-open">
              BOOK LOT
            </Button>
          </div>
          {lots.loading && <LoadingView label="PULLING HEAT REGISTER" />}
          {lots.error && <ErrorView message={lots.error} onRetry={lots.reload} />}
          {lots.data && lots.data.length === 0 && (
            <EmptyView title="NO TRACEABLE LOTS" hint="Book lots here, or capture a heat cert in the field — verified certs land as lots automatically." />
          )}
          {lots.data && lots.data.length > 0 && (
            <LedgerTable<MaterialLot>
              testId="lots-table"
              rows={lots.data}
              rowKey={(m) => m.id}
              empty="NO LOTS"
              columns={[
                { key: "heat", label: "HEAT", render: (m) => <span className="bf-mono">{m.heat_no}</span> },
                { key: "material", label: "MATERIAL", render: (m) => m.material ?? "—" },
                { key: "mill", label: "MILL", render: (m) => m.mill ?? "—" },
                { key: "cert", label: "CERT", render: (m) => <span className="bf-mono">{m.cert_ref ?? "—"}</span> },
                { key: "job", label: "JOB", render: (m) => <span className="bf-mono">{m.job_code ?? "STOCK"}</span> },
                { key: "booked", label: "BOOKED", align: "right", render: (m) => new Date(m.created_at).toLocaleDateString("en-AU") },
              ]}
            />
          )}
        </>
      )}

      {tab === "ndi" && (
        <>
          <div style={{ marginBottom: 12 }}>
            <Button kind="mark" onClick={() => setNdiOpen(true)} testId="ndi-open">
              RECORD NDI
            </Button>
          </div>
          {ndi.loading && <LoadingView label="PULLING NDI REGISTER" />}
          {ndi.error && <ErrorView message={ndi.error} onRetry={ndi.reload} />}
          {ndi.data && ndi.data.length === 0 && <EmptyView title="NO NDI RECORDS" hint="Weld inspections land here against their job." />}
          {ndi.data && ndi.data.length > 0 && (
            <LedgerTable<NdiRecord>
              testId="ndi-table"
              rows={ndi.data}
              rowKey={(n) => n.id}
              empty="NO NDI"
              columns={[
                { key: "method", label: "METHOD", render: (n) => <span className="bf-mono">{n.method}</span> },
                { key: "result", label: "RESULT", render: (n) => <Stamp label={n.result.toUpperCase()} tone={n.result === "pass" ? "ok" : "bad"} /> },
                { key: "report", label: "REPORT", render: (n) => <span className="bf-mono">{n.report_ref ?? "—"}</span> },
                { key: "inspector", label: "INSPECTOR", render: (n) => n.inspector ?? "—" },
                { key: "job", label: "JOB", render: (n) => <span className="bf-mono">{n.job_code}</span> },
                { key: "when", label: "DATE", align: "right", render: (n) => new Date(n.created_at).toLocaleDateString("en-AU") },
              ]}
            />
          )}
        </>
      )}

      {tab === "offcuts" && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
            <Button kind="mark" onClick={() => setOffOpen(true)} testId="offcut-open">
              RACK OFFCUT
            </Button>
            <button
              className="bf-label"
              data-testid="rack-filter"
              onClick={() => setRack(rack === "available" ? "all" : "available")}
              style={{ background: "none", border: "1px solid var(--rule-strong)", borderRadius: "var(--radius)", padding: "8px 12px", cursor: "pointer", minHeight: "var(--tap-min)", color: "var(--ink-mute)" }}
            >
              {rack === "available" ? "SHOWING AVAILABLE — SHOW ALL" : "SHOWING ALL — SHOW AVAILABLE"}
            </button>
          </div>
          {offcuts.loading && <LoadingView label="CHECKING THE RACK" />}
          {offcuts.error && <ErrorView message={offcuts.error} onRetry={offcuts.reload} />}
          {offcuts.data && offcuts.data.length === 0 && (
            <EmptyView title="RACK IS EMPTY" hint="Rack usable offcuts with their heat number — traceability survives the cut." />
          )}
          {offcuts.data && offcuts.data.length > 0 && (
            <LedgerTable<OffcutRow>
              testId="offcuts-table"
              rows={offcuts.data}
              rowKey={(o) => o.id}
              empty="RACK IS EMPTY"
              columns={[
                { key: "desc", label: "OFFCUT", render: (o) => o.description },
                { key: "material", label: "MATERIAL", render: (o) => o.material ?? "—" },
                { key: "heat", label: "HEAT", render: (o) => <span className="bf-mono">{o.heat_no ?? "UNTRACED"}</span> },
                {
                  key: "status",
                  label: "STATUS",
                  render: (o) => <Stamp label={o.status.toUpperCase()} tone={o.status === "available" ? "ok" : o.status === "allocated" ? "info" : "mute"} />,
                },
                {
                  key: "act",
                  label: "",
                  align: "right",
                  render: (o) =>
                    o.status === "available" ? (
                      <Button kind="accent" disabled={act.busy} onClick={() => setAllocating(o)} testId={`allocate-${o.id}`}>
                        ALLOCATE
                      </Button>
                    ) : (
                      <span className="bf-mono" style={{ fontSize: 12, color: "var(--ink-mute)" }}>—</span>
                    ),
                },
              ]}
            />
          )}
        </>
      )}

      {tab === "itp" && (
        <>
          <div style={{ marginBottom: 12 }}>
            <Button kind="mark" onClick={() => setTplOpen(true)} testId="tpl-open">
              NEW TEMPLATE
            </Button>
          </div>
          {templates.loading && <LoadingView label="PULLING ITP LIBRARY" />}
          {templates.error && <ErrorView message={templates.error} onRetry={templates.reload} />}
          {templates.data && templates.data.length === 0 && (
            <EmptyView title="NO ITP TEMPLATES" hint="Build your inspection & test plans once, stamp them onto every work order." />
          )}
          {templates.data && templates.data.length > 0 && (
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
              {templates.data.map((t) => (
                <li key={t.id} style={{ border: "1px solid var(--rule-strong)", borderRadius: "var(--radius)", padding: "14px 16px", background: "var(--ground-raise)" }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                    <strong style={{ fontSize: 15 }}>{t.name}</strong>
                    <span className="bf-label">{t.stages.length} STAGES</span>
                  </div>
                  <ol style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {t.stages.map((s, i) => (
                      <li key={i}>
                        <Stamp label={s.requires_photo ? `${s.name} 📷` : s.name} tone={s.requires_photo ? "warn" : "mute"} />
                      </li>
                    ))}
                  </ol>
                  <p className="bf-mono" style={{ fontSize: 12, color: "var(--ink-mute)", margin: "8px 0 0" }}>
                    Apply from the job page — open a job with no stages and stamp this plan on.
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <Sheet title="BOOK MATERIAL LOT" open={lotOpen} onClose={() => setLotOpen(false)} testId="lot-sheet">
        <Field label="HEAT NUMBER" value={heat} onChange={setHeat} required testId="lot-heat" />
        <Field label="MATERIAL / GRADE" value={material} onChange={setMaterial} placeholder="e.g. 350L0 PFC 250" testId="lot-material" />
        <Field label="MILL" value={mill} onChange={setMill} testId="lot-mill" />
        <Field label="CERT REF" value={certRef} onChange={setCertRef} testId="lot-cert" />
        <JobSelect label="BOOK TO" value={lotJob} onChange={setLotJob} allowNone testId="lot-job" />
        {act.error && <ErrorView message={act.error} />}
        <Button kind="mark" full disabled={act.busy || !heat.trim()} onClick={bookLot} testId="lot-submit">
          {act.busy ? "BOOKING…" : "BOOK LOT"}
        </Button>
      </Sheet>

      <Sheet title="RECORD NDI" open={ndiOpen} onClose={() => setNdiOpen(false)} testId="ndi-sheet">
        <JobSelect label="JOB" value={ndiJob} onChange={setNdiJob} testId="ndi-job" />
        <label className="bf-label" style={{ display: "block", marginBottom: 12 }}>
          METHOD
          <select data-testid="ndi-method" value={method} onChange={(e) => setMethod(e.target.value)} style={{ display: "block", width: "100%", marginTop: 4 }}>
            {NDI_METHODS.map((m) => (
              <option key={m} value={m}>{m === "visual" ? "VISUAL" : m}</option>
            ))}
          </select>
        </label>
        <label className="bf-label" style={{ display: "block", marginBottom: 12 }}>
          RESULT
          <select data-testid="ndi-result" value={result} onChange={(e) => setResult(e.target.value as "pass" | "fail")} style={{ display: "block", width: "100%", marginTop: 4 }}>
            <option value="pass">PASS</option>
            <option value="fail">FAIL</option>
          </select>
        </label>
        <Field label="REPORT REF" value={reportRef} onChange={setReportRef} testId="ndi-report" />
        <Field label="INSPECTOR" value={inspector} onChange={setInspector} testId="ndi-inspector" />
        {act.error && <ErrorView message={act.error} />}
        <Button kind="mark" full disabled={act.busy || !ndiJob} onClick={recordNdi} testId="ndi-submit">
          {act.busy ? "RECORDING…" : "RECORD NDI"}
        </Button>
      </Sheet>

      <Sheet title="RACK OFFCUT" open={offOpen} onClose={() => setOffOpen(false)} testId="offcut-sheet">
        <Field label="WHAT IS IT" value={offDesc} onChange={setOffDesc} placeholder="e.g. 1.2m PFC 250 offcut" required testId="offcut-desc" />
        <Field label="MATERIAL / GRADE" value={offMaterial} onChange={setOffMaterial} testId="offcut-material" />
        <Field label="HEAT NUMBER" value={offHeat} onChange={setOffHeat} testId="offcut-heat" />
        {act.error && <ErrorView message={act.error} />}
        <Button kind="mark" full disabled={act.busy || !offDesc.trim()} onClick={rackOffcut} testId="offcut-submit">
          {act.busy ? "RACKING…" : "RACK IT"}
        </Button>
      </Sheet>

      <Sheet
        title={allocating ? `ALLOCATE — ${allocating.description}` : ""}
        open={allocating !== null}
        onClose={() => setAllocating(null)}
        testId="allocate-sheet"
      >
        {allocating && (
          <div>
            <p className="bf-mono" style={{ marginTop: 0, fontSize: 13, color: "var(--ink-mute)" }}>
              Heat {allocating.heat_no ?? "untraced"} — allocating carries the heat onto the receiving job.
            </p>
            <JobSelect label="RECEIVING JOB" value={allocJob} onChange={setAllocJob} testId="allocate-job" />
            {act.error && <ErrorView message={act.error} />}
            <Button kind="mark" full disabled={act.busy || !allocJob} onClick={allocate} testId="allocate-submit">
              {act.busy ? "ALLOCATING…" : "ALLOCATE TO JOB"}
            </Button>
          </div>
        )}
      </Sheet>

      <Sheet title="NEW ITP TEMPLATE" open={tplOpen} onClose={() => setTplOpen(false)} testId="tpl-sheet">
        <Field label="TEMPLATE NAME" value={tplName} onChange={setTplName} placeholder="e.g. Structural steel CC2" required testId="tpl-name" />
        <label className="bf-label" style={{ display: "block", marginBottom: 12 }}>
          STAGES — ONE PER LINE, END WITH * FOR A PHOTO HOLD POINT
          <textarea
            data-testid="tpl-stages"
            value={tplStages}
            onChange={(e) => setTplStages(e.target.value)}
            rows={7}
            placeholder={"Material received + verified\nCut + prep\nFit-up *\nWeld out\nNDI clear\nBlast + paint *"}
            style={{ display: "block", width: "100%", marginTop: 4, fontFamily: "var(--font-mono)", fontSize: 13 }}
          />
        </label>
        {act.error && <ErrorView message={act.error} />}
        <Button kind="mark" full disabled={act.busy || !tplName.trim() || !tplStages.trim()} onClick={createTemplate} testId="tpl-submit">
          {act.busy ? "SAVING…" : "SAVE TEMPLATE"}
        </Button>
      </Sheet>
    </div>
  );
}
