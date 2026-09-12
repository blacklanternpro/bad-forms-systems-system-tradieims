import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, money, type JobRow } from "../api";
import Button from "../components/Button";
import Field from "../components/Field";
import LedgerTable from "../components/LedgerTable";
import Sheet from "../components/Sheet";
import Stamp, { type StampTone } from "../components/Stamp";
import { EmptyView, ErrorView, LoadingView } from "../components/StatusViews";
import { useAction, useLoad } from "../hooks";

const FILTERS = ["all", "live", "scheduled", "done", "recall_due", "missing_po"] as const;
type Filter = (typeof FILTERS)[number];

const STATUS_TONE: Record<JobRow["status"], StampTone> = {
  quoted: "mute",
  scheduled: "info",
  live: "ok",
  done: "warn",
  invoiced: "mute",
};

export default function Jobs() {
  const nav = useNavigate();
  const [filter, setFilter] = useState<Filter>("all");
  const jobs = useLoad(() => api<JobRow[]>(`/jobs?filter=${filter}`), [filter]);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [quoted, setQuoted] = useState("");
  const act = useAction();

  const create = () =>
    void act.run(async () => {
      const row = await api<JobRow>("/jobs", {
        body: { title, quoted_cents: quoted ? Math.round(parseFloat(quoted) * 100) : 0 },
      });
      setCreating(false);
      setTitle("");
      setQuoted("");
      nav(`/jobs/${row.id}`);
    });

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 16 }}>
        <h2 className="bf-label" style={{ margin: 0 }}>JOBS</h2>
        {FILTERS.map((f) => (
          <button
            key={f}
            data-testid={`filter-${f}`}
            className="bf-label"
            onClick={() => setFilter(f)}
            style={{
              padding: "8px 12px",
              minHeight: "var(--tap-min)",
              cursor: "pointer",
              background: filter === f ? "var(--mark)" : "transparent",
              color: filter === f ? "var(--mark-ink)" : "var(--ink-mute)",
              border: "1px solid var(--rule-strong)",
              borderRadius: "var(--radius)",
            }}
          >
            {f.replace("_", " ").toUpperCase()}
          </button>
        ))}
        <span style={{ marginLeft: "auto" }}>
          <Button kind="mark" onClick={() => setCreating(true)} testId="new-job">NEW JOB</Button>
        </span>
      </div>

      {jobs.loading && <LoadingView label="PULLING THE JOB BOOK" />}
      {jobs.error && <ErrorView message={jobs.error} onRetry={jobs.reload} />}
      {jobs.data && jobs.data.length === 0 && (
        <EmptyView title="NO JOBS UNDER THIS FILTER" hint="Try another filter, or raise a new job." />
      )}
      {jobs.data && jobs.data.length > 0 && (
        <LedgerTable<JobRow>
          testId="jobs-table"
          rows={jobs.data}
          rowKey={(j) => j.id}
          onRowClick={(j) => nav(`/jobs/${j.id}`)}
          empty="NO JOBS"
          columns={[
            { key: "code", label: "CODE", render: (j) => <span className="bf-mono">{j.code}</span> },
            { key: "title", label: "JOB", render: (j) => j.title },
            { key: "client", label: "CLIENT", render: (j) => j.client_name ?? "—" },
            { key: "status", label: "STATUS", render: (j) => <Stamp label={j.status.toUpperCase()} tone={STATUS_TONE[j.status]} /> },
            { key: "quoted", label: "QUOTED", align: "right", render: (j) => money(j.quoted_cents) },
            { key: "recall", label: "RECALL", render: (j) => j.recall_on ?? "—" },
          ]}
        />
      )}

      <Sheet title="NEW JOB" open={creating} onClose={() => setCreating(false)} testId="new-job-sheet">
        <Field label="TITLE" value={title} onChange={setTitle} required testId="job-title" />
        <Field label="QUOTED VALUE ($ ex GST)" type="number" value={quoted} onChange={setQuoted} testId="job-quoted" />
        {act.error && <ErrorView message={act.error} />}
        <Button kind="mark" full disabled={act.busy || !title.trim()} onClick={create} testId="job-create">
          {act.busy ? "RAISING…" : "RAISE JOB"}
        </Button>
      </Sheet>
    </div>
  );
}
