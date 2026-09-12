import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type FieldBoard } from "../../api";
import { Chip } from "../../components/Chrome";
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
      <div role="tablist" aria-label="Day" className="bf-chip-row" style={{ marginBottom: 16 }}>
        {(["today", "tomorrow"] as Day[]).map((d) => (
          <Chip
            key={d}
            role="tab"
            testId={`day-${d}`}
            active={day === d}
            onClick={() => setDay(d)}
            label={d === "today" ? "Today" : "Tomorrow"}
          />
        ))}
      </div>

      {board.loading && <LoadingView label="Checking the board" />}
      {board.error && <ErrorView message={board.error} onRetry={board.reload} />}
      {board.data && board.data.jobs.length === 0 && (
        <EmptyView title={day === "today" ? "Nothing on today" : "Nothing on tomorrow"} hint="If that doesn't look right, ring the office." />
      )}
      {board.data && board.data.jobs.length > 0 && (
        <div style={{ display: "grid", gap: 10 }}>
          {board.data.jobs.map((j) => (
            <Ticket
              key={j.job_id}
              code={j.code}
              title={j.title}
              stamp={j.window ? { label: j.window, tone: "info" } : undefined}
              meta={[{ label: "Site", value: j.site_name ?? "—" }, { label: "Addr", value: j.address ?? "—" }]}
              onClick={() => nav(`/field/jobs/${j.job_id}`)}
              testId={`field-${j.code}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
