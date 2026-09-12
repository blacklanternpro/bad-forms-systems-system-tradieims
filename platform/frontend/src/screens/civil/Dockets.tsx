import { useState } from "react";
import { api, money, type DocketRow, type QuarryTicketRow } from "../../api";
import Button from "../../components/Button";
import { Chip } from "../../components/Chrome";
import LedgerTable from "../../components/LedgerTable";
import Stamp, { type StampTone } from "../../components/Stamp";
import { EmptyView, ErrorView, LoadingView } from "../../components/StatusViews";
import { useAction, useLoad } from "../../hooks";

const STATUS_TONE: Record<DocketRow["status"], StampTone> = { draft: "warn", signed: "info", approved: "ok" };
type Tab = "dockets" | "quarry";

/** Docket desk: what the machines earned, waiting on glass or approval,
    plus the quarry tonnage register. Approval emails the daily docket PDF. */
export default function Dockets() {
  const [tab, setTab] = useState<Tab>("dockets");
  const dockets = useLoad(() => api<DocketRow[]>("/civil/dockets"));
  const quarry = useLoad(() => api<QuarryTicketRow[]>("/civil/quarry-tickets"));
  const act = useAction();

  const approve = (id: string) =>
    void act.run(async () => {
      await api(`/civil/dockets/${id}/approve`, { method: "POST" });
      dockets.reload();
    });

  return (
    <div>
      <div role="tablist" aria-label="Docket desk" className="bf-chip-row" style={{ marginBottom: 16 }}>
        {(["dockets", "quarry"] as Tab[]).map((t) => (
          <Chip
            key={t}
            role="tab"
            testId={`tab-${t}`}
            active={tab === t}
            onClick={() => setTab(t)}
            label={t === "dockets" ? "Hire dockets" : "Quarry tickets"}
          />
        ))}
      </div>
      {act.error && <ErrorView message={act.error} />}

      {tab === "dockets" && (
        <>
          {dockets.loading && <LoadingView label="Pulling dockets" />}
          {dockets.error && <ErrorView message={dockets.error} onRetry={dockets.reload} />}
          {dockets.data && dockets.data.length === 0 && (
            <EmptyView title="No dockets yet" hint="Operators raise dockets from the cab after their pre-start." />
          )}
          {dockets.data && dockets.data.length > 0 && (
            <LedgerTable<DocketRow>
              testId="dockets-table"
              rows={dockets.data}
              rowKey={(d) => d.id}
              empty="No dockets"
              columns={[
                { key: "code", label: "Docket", render: (d) => <span className="bf-mono">{d.code}</span> },
                { key: "plant", label: "Plant", render: (d) => d.plant_name },
                { key: "job", label: "Job", render: (d) => <span className="bf-mono">{d.job_code}</span> },
                { key: "mode", label: "Mode", render: (d) => <Stamp label={d.mode} tone={d.mode === "wet" ? "info" : "mute"} /> },
                { key: "hours", label: "Hrs / stby", align: "right", render: (d) => `${Number(d.hours)} / ${Number(d.standby_hours)}` },
                { key: "tally", label: "Tally", render: (d) => Object.entries(d.tally).map(([k, v]) => `${k} ${v}`).join(" · ") || "—" },
                { key: "total", label: "Total ex", align: "right", render: (d) => money(d.total_cents) },
                {
                  key: "status",
                  label: "Status",
                  render: (d) => <Stamp label={d.status === "signed" ? `SIGNED — ${d.signed_by_name}` : d.status.toUpperCase()} tone={STATUS_TONE[d.status]} />,
                },
                {
                  key: "act",
                  label: "",
                  render: (d) => (
                    <span style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
                      {d.status === "signed" && (
                        <Button kind="mark" disabled={act.busy} onClick={() => approve(d.id)} testId={`approve-${d.code}`}>
                          Approve + email
                        </Button>
                      )}
                      <a className="bf-label" href={`/api/civil/dockets/${d.id}/pdf`} target="_blank" rel="noreferrer">PDF ↗</a>
                    </span>
                  ),
                },
              ]}
            />
          )}
        </>
      )}

      {tab === "quarry" && (
        <>
          {quarry.loading && <LoadingView label="Pulling tonnage" />}
          {quarry.error && <ErrorView message={quarry.error} onRetry={quarry.reload} />}
          {quarry.data && quarry.data.length === 0 && (
            <EmptyView title="No quarry tickets" hint="Verified quarry ticket captures land here with their tonnage." />
          )}
          {quarry.data && quarry.data.length > 0 && (
            <LedgerTable<QuarryTicketRow>
              testId="quarry-table"
              rows={quarry.data}
              rowKey={(t) => t.id}
              empty="No tickets"
              columns={[
                { key: "ticket", label: "Ticket", render: (t) => <span className="bf-mono">{t.ticket_no ?? "—"}</span> },
                { key: "quarry", label: "Quarry", render: (t) => t.quarry ?? "—" },
                { key: "material", label: "Material", render: (t) => t.material ?? "—" },
                { key: "job", label: "Job", render: (t) => <span className="bf-mono">{t.job_code ?? "—"}</span> },
                { key: "tonnes", label: "Tonnes", align: "right", render: (t) => Number(t.tonnes).toFixed(1) },
                { key: "value", label: "Value ex", align: "right", render: (t) => money(Math.round(Number(t.tonnes) * t.rate_cents_per_tonne)) },
              ]}
            />
          )}
        </>
      )}
    </div>
  );
}
