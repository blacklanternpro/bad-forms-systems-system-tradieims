import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, money, type QuoteRow } from "../api";
import Button from "../components/Button";
import { PageHead } from "../components/Chrome";
import Field from "../components/Field";
import LedgerTable from "../components/LedgerTable";
import Sheet from "../components/Sheet";
import Stamp, { type StampTone } from "../components/Stamp";
import { EmptyView, ErrorView, LoadingView } from "../components/StatusViews";
import { useAction, useLoad } from "../hooks";

interface DraftLine { description: string; qty: string; unit: string }

function quoteTone(q: QuoteRow): { label: string; tone: StampTone } {
  if (q.status === "accepted") return { label: "ACCEPTED", tone: "ok" };
  if (q.status === "declined") return { label: "DECLINED", tone: "bad" };
  if (q.overdue) return { label: "EXPIRED", tone: "bad" };
  if (q.follow_up) return { label: "CHASE", tone: "warn" };
  return { label: q.status.toUpperCase(), tone: q.status === "sent" ? "info" : "mute" };
}

export default function Quotes() {
  const nav = useNavigate();
  const quotes = useLoad(() => api<QuoteRow[]>("/quotes"));
  const act = useAction();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([{ description: "", qty: "1", unit: "" }]);

  const setLine = (i: number, patch: Partial<DraftLine>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const create = () =>
    void act.run(async () => {
      await api("/quotes", {
        body: {
          title,
          lines: lines
            .filter((l) => l.description.trim())
            .map((l) => ({
              description: l.description,
              qty: parseFloat(l.qty) || 1,
              unit_cents: Math.round((parseFloat(l.unit) || 0) * 100),
            })),
        },
      });
      setCreating(false);
      setTitle("");
      setLines([{ description: "", qty: "1", unit: "" }]);
      quotes.reload();
    });

  const send = (id: string) =>
    void act.run(async () => {
      await api(`/quotes/${id}/send`, { method: "POST" });
      quotes.reload();
    });

  const toJob = (id: string) =>
    void act.run(async () => {
      const job = await api<{ id: string }>(`/quotes/${id}/to-job`, { method: "POST" });
      nav(`/jobs/${job.id}`);
    });

  return (
    <div>
      <PageHead title="Quotes">
        <Button kind="mark" onClick={() => setCreating(true)} testId="new-quote">
          New quote
        </Button>
      </PageHead>

      {act.error && <ErrorView message={act.error} />}
      {quotes.loading && <LoadingView label="Pulling quotes" />}
      {quotes.error && <ErrorView message={quotes.error} onRetry={quotes.reload} />}
      {quotes.data && quotes.data.length === 0 && <EmptyView title="No quotes yet" hint="Raise the first one — it lands here as a draft." />}
      {quotes.data && quotes.data.length > 0 && (
        <LedgerTable<QuoteRow>
          testId="quotes-table"
          rows={quotes.data}
          rowKey={(q) => q.id}
          empty="No quotes"
          columns={[
            { key: "code", label: "Code", render: (q) => <span className="bf-mono">{q.code}</span> },
            { key: "title", label: "Quote", render: (q) => q.title },
            { key: "client", label: "Client", render: (q) => q.client_name ?? "—" },
            {
              key: "status",
              label: "Status",
              render: (q) => {
                const t = quoteTone(q);
                return <Stamp label={t.label} tone={t.tone} />;
              },
            },
            { key: "total", label: "Total ex", align: "right", render: (q) => money(q.total_ex_cents) },
            { key: "valid", label: "Valid to", render: (q) => q.valid_until ?? "—" },
            {
              key: "act",
              label: "",
              render: (q) => (
                <span style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  {q.status === "draft" && (
                    <Button kind="accent" disabled={act.busy} onClick={() => send(q.id)} testId={`send-${q.code}`}>Send</Button>
                  )}
                  {q.status === "accepted" && (
                    <Button kind="mark" disabled={act.busy} onClick={() => toJob(q.id)} testId={`tojob-${q.code}`}>To job</Button>
                  )}
                  <a className="bf-label" style={{ alignSelf: "center" }} href={`/api/quotes/${q.id}/pdf`} target="_blank" rel="noreferrer">PDF ↗</a>
                </span>
              ),
            },
          ]}
        />
      )}

      <Sheet title="New quote" open={creating} onClose={() => setCreating(false)} testId="new-quote-sheet">
        <Field label="Title" value={title} onChange={setTitle} required testId="quote-title" />
        <p className="bf-label" style={{ margin: "4px 0 8px" }}>Lines</p>
        {lines.map((l, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 70px 100px", gap: 8, marginBottom: 8 }}>
            <input aria-label={`Line ${i + 1} description`} placeholder="Description" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
            <input aria-label={`Line ${i + 1} quantity`} type="number" placeholder="Qty" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} />
            <input aria-label={`Line ${i + 1} unit price`} type="number" placeholder="$ each" value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} />
          </div>
        ))}
        <Button kind="quiet" onClick={() => setLines((ls) => [...ls, { description: "", qty: "1", unit: "" }])} testId="add-line">
          + Line
        </Button>
        <div style={{ marginTop: 14 }}>
          <Button kind="mark" full disabled={act.busy || !title.trim()} onClick={create} testId="quote-create">
            {act.busy ? "Raising…" : "Raise quote"}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
