import { useParams } from "react-router-dom";
import { api, moduleLive, money, type JobDetail as Detail } from "../api";
import Button from "../components/Button";
import Stamp, { type StampTone } from "../components/Stamp";
import { EmptyView, ErrorView, LoadingView } from "../components/StatusViews";
import { useAction, useLoad } from "../hooks";
import { ApplyItp } from "./fab/Shop";
import { JobVariations } from "./trades/Variations";

const NEXT_STATUS: Record<string, { to: string; verb: string } | undefined> = {
  quoted: { to: "scheduled", verb: "Schedule" },
  scheduled: { to: "live", verb: "Start job" },
  live: { to: "done", verb: "Mark done" },
};

function marginTone(margin: number, quoted: number): StampTone {
  if (quoted === 0) return "mute";
  if (margin < 0) return "bad";
  if (margin < quoted * 0.2) return "warn";
  return "ok";
}

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const d = useLoad(() => api<Detail>(`/jobs/${id}`), [id]);
  const act = useAction();

  if (d.loading) return <LoadingView label="Opening job" />;
  if (d.error) return <ErrorView message={d.error} onRetry={d.reload} />;
  if (!d.data) return <EmptyView title="Job not found" />;

  const { job, stages, documents, timeline, captures, costing } = d.data;
  const next = NEXT_STATUS[job.status];

  const setStatus = (to: string) =>
    void act.run(async () => {
      await api(`/jobs/${id}`, { method: "PATCH", body: { status: to } });
      d.reload();
    });

  const invoiceNow = () =>
    void act.run(async () => {
      const inv = await api<{ id: string }>("/invoices", { body: { job_id: id } });
      await api(`/invoices/${inv.id}/push`, { method: "POST" });
      d.reload();
    });

  return (
    <div>
      <header style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "baseline", marginBottom: 6 }}>
        <span className="bf-mono" style={{ fontSize: 15, fontWeight: 700 }}>{job.code}</span>
        <h2 style={{ margin: 0, fontSize: 19 }}>{job.title}</h2>
        <Stamp label={job.status.toUpperCase()} tone={job.status === "live" ? "ok" : "info"} testId="job-status" />
        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {next && (
            <Button kind="mark" disabled={act.busy} onClick={() => setStatus(next.to)} testId="job-advance">
              {next.verb}
            </Button>
          )}
          {job.status === "done" && (
            <Button kind="accent" disabled={act.busy} onClick={invoiceNow} testId="job-invoice">
              Invoice → ledger
            </Button>
          )}
          {moduleLive("fab") && (
            <a
              className="bf-label"
              data-testid="mdr-link"
              href={`/api/fab/jobs/${id}/mdr.pdf`}
              target="_blank"
              rel="noreferrer"
              style={{ alignSelf: "center" }}
            >
              MDR pack ↗
            </a>
          )}
        </span>
      </header>
      <p className="bf-mono" style={{ fontSize: 13, color: "var(--ink-mute)", margin: "0 0 20px" }}>
        {job.client_name ?? "No client"} · {job.site_name ?? "No site"}
        {job.gate_code ? ` · gate ${job.gate_code}` : ""} · PO {job.po_ref ?? "—"}
      </p>
      {act.error && <ErrorView message={act.error} />}

      <div style={{ display: "grid", gap: 24, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <section aria-labelledby="costing-h">
          <h3 id="costing-h" className="bf-h3">Live costing</h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {[
                ["Labour", `${costing.hours.toFixed(1)} h`, money(costing.labour_cents)],
                ["Materials", "verified receipts", money(costing.materials_cents)],
                ["Plant / hire", "verified dockets", money(costing.plant_cents)],
                ["Cost to date", "", money(costing.cost_cents)],
                ["Quoted", "", money(costing.quoted_cents)],
              ].map(([l, sub, v]) => (
                <tr key={l as string}>
                  <td className="bf-label" style={{ padding: "8px 0", borderBottom: "1px solid var(--rule)" }}>
                    {l}
                    {sub ? <span style={{ display: "block", textTransform: "none", letterSpacing: 0 }}>{sub}</span> : null}
                  </td>
                  <td className="bf-num" style={{ padding: "8px 0", borderBottom: "1px solid var(--rule)" }}>{v}</td>
                </tr>
              ))}
              <tr>
                <td className="bf-label" style={{ padding: "10px 0" }}>Margin</td>
                <td className="bf-num" style={{ padding: "10px 0" }}>
                  <Stamp label={money(costing.margin_cents)} tone={marginTone(costing.margin_cents, costing.quoted_cents)} testId="margin-stamp" />
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section aria-labelledby="stages-h">
          <h3 id="stages-h" className="bf-h3">Stages</h3>
          {stages.length === 0 && moduleLive("fab") && id ? (
            <ApplyItp jobId={id} onApplied={d.reload} />
          ) : stages.length === 0 ? (
            <EmptyView title="No stages" hint="This job runs without staged sign-off." />
          ) : (
            <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {stages.map((s) => (
                <li key={s.id} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "9px 0", borderBottom: "1px solid var(--rule)" }}>
                  <Stamp label={s.completed_at ? "DONE" : s.requires_photo ? "PHOTO REQ" : "OPEN"} tone={s.completed_at ? "ok" : s.requires_photo ? "warn" : "mute"} />
                  <span style={{ fontSize: 14 }}>{s.name}</span>
                </li>
              ))}
            </ol>
          )}

          <h3 className="bf-h3" style={{ marginTop: 20 }}>Paperwork</h3>
          {captures.length === 0 && documents.length === 0 ? (
            <EmptyView title="No paperwork yet" hint="Receipts, dockets and photos captured in the field land here." />
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {captures.map((c) => (
                <li key={c.id} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "8px 0", borderBottom: "1px solid var(--rule)" }}>
                  <Stamp
                    label={c.status.toUpperCase().replace("_", " ")}
                    tone={c.status === "verified" ? "ok" : c.status === "rejected" ? "bad" : "warn"}
                  />
                  <span className="bf-mono" style={{ fontSize: 13 }}>
                    {c.capture_type} · conf {Number(c.confidence).toFixed(2)}
                  </span>
                </li>
              ))}
              {documents.map((doc) => (
                <li key={doc.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--rule)" }}>
                  <a className="bf-mono" style={{ fontSize: 13 }} href={`/api/documents/${doc.id}/raw`} target="_blank" rel="noreferrer">
                    {doc.kind}: {doc.name} ↗
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        {moduleLive("trades") && id && (
          <section aria-label="Variations">
            <JobVariations jobId={id} onChanged={d.reload} />
          </section>
        )}

        <section aria-labelledby="timeline-h">
          <h3 id="timeline-h" className="bf-h3">Timeline</h3>
          {timeline.length === 0 ? (
            <EmptyView title="No history" />
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {timeline.map((e) => (
                <li key={e.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--rule)" }}>
                  <span className="bf-mono" style={{ fontSize: 12, color: "var(--ink-mute)", display: "block" }}>
                    {new Date(e.created_at).toLocaleString("en-AU")} · {e.kind}
                  </span>
                  <span style={{ fontSize: 14 }}>{e.summary}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
