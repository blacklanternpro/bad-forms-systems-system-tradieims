import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type FieldBoard } from "../../api";
import { EmptyView, ErrorView, LoadingView } from "../../components/StatusViews";
import Ticket from "../../components/Ticket";
import { useLoad } from "../../hooks";

type Day = "today" | "tomorrow";

/** Field home: where am I going, in what order, one thumb. */
export default function FieldToday() {
  const nav = useNavigate();
  const [day, setDay] = useState<Day>("today");
  const board = useLoad(() => api<FieldBoard>(`/field/${day}`), [day]);

  return (
    <div>
      <div role="tablist" aria-label="Day" style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {(["today", "tomorrow"] as Day[]).map((d) => (
          <button
            key={d}
            role="tab"
            aria-selected={day === d}
            data-testid={`day-${d}`}
            className="bf-label"
            onClick={() => setDay(d)}
            style={{
              flex: 1,
              padding: "12px 0",
              minHeight: "var(--tap-min)",
              cursor: "pointer",
              background: day === d ? "var(--mark)" : "var(--ground-raise)",
              color: day === d ? "var(--mark-ink)" : "var(--ink-mute)",
              border: "1px solid var(--rule-strong)",
              borderRadius: "var(--radius)",
            }}
          >
            {d.toUpperCase()}
          </button>
        ))}
      </div>

      {board.loading && <LoadingView label="CHECKING THE BOARD" />}
      {board.error && <ErrorView message={board.error} onRetry={board.reload} />}
      {board.data && board.data.jobs.length === 0 && (
        <EmptyView title={day === "today" ? "NOTHING ON TODAY" : "NOTHING ON TOMORROW"} hint="If that doesn't look right, ring the office." />
      )}
      {board.data && board.data.jobs.length > 0 && (
        <div style={{ display: "grid", gap: 10 }}>
          {board.data.jobs.map((j) => (
            <Ticket
              key={j.job_id}
              code={j.code}
              title={j.title}
              stamp={j.window ? { label: j.window, tone: "info" } : undefined}
              meta={[{ label: "SITE", value: j.site_name ?? "—" }, { label: "ADDR", value: j.address ?? "—" }]}
              onClick={() => nav(`/field/jobs/${j.job_id}`)}
              testId={`field-${j.code}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
