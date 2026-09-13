import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, money, type JobRow } from "../api";
import Button from "../components/Button";
import { Chip, PageHead } from "../components/Chrome";
import Field from "../components/Field";
import LedgerTable from "../components/LedgerTable";
import Sheet from "../components/Sheet";
import Stamp, { type StampTone } from "../components/Stamp";
import { EmptyView, ErrorView, LoadingView } from "../components/StatusViews";
import { useAction, useLoad } from "../hooks";

const FILTERS = ["all", "live", "scheduled", "done", "recall_due", "missing_po"] as const;
type Filter = (typeof FILTERS)[number];

const FILTER_LABEL: Record<Filter, string> = {
  all: "All",
  live: "Live",
  scheduled: "Scheduled",
  done: "Done",
  recall_due: "Recall due",
  missing_po: "Missing PO",
};

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
      <PageHead title="Jobs">
        <div className="bf-chip-row">
          {FILTERS.map((f) => (
            <Chip key={f} testId={`filter-${f}`} label={FILTER_LABEL[f]} active={filter === f} onClick={() => setFilter(f)} />
          ))}
        </div>
        <Button kind="mark" onClick={() => setCreating(true)} testId="new-job">
          New job
        </Button>
      </PageHead>

      {jobs.loading && <LoadingView label="Pulling the job book" />}
      {jobs.error && <ErrorView message={jobs.error} onRetry={jobs.reload} />}
      {jobs.data && jobs.data.length === 0 && (
        <EmptyView title="No jobs under this filter" hint="Try another filter, or raise a new job." />
      )}
      {jobs.data && jobs.data.length > 0 && (
        <LedgerTable<JobRow>
          testId="jobs-table"
          rows={jobs.data}
          rowKey={(j) => j.id}
          onRowClick={(j) => nav(`/jobs/${j.id}`)}
          empty="No jobs"
          columns={[
            { key: "code", label: "Code", render: (j) => <span className="bf-mono">{j.code}</span> },
            { key: "title", label: "Job", render: (j) => j.title },
            { key: "client", label: "Client", render: (j) => j.client_name ?? "—" },
            { key: "status", label: "Status", render: (j) => <Stamp label={j.status} tone={STATUS_TONE[j.status]} /> },
            { key: "quoted", label: "Quoted", align: "right", render: (j) => money(j.quoted_cents) },
            { key: "recall", label: "Recall", render: (j) => j.recall_on ?? "—" },
          ]}
        />
      )}

      <Sheet title="New job" open={creating} onClose={() => setCreating(false)} testId="new-job-sheet">
        <Field label="Title" value={title} onChange={setTitle} required testId="job-title" />
        <Field label="Quoted value ($ ex GST)" type="number" value={quoted} onChange={setQuoted} testId="job-quoted" />
        {act.error && <ErrorView message={act.error} />}
        <Button kind="mark" full disabled={act.busy || !title.trim()} onClick={create} testId="job-create">
          {act.busy ? "Raising…" : "Raise job"}
        </Button>
      </Sheet>
    </div>
  );
}
