import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import Button from "../components/Button";
import { EmptyView, ErrorView, LoadingView } from "../components/StatusViews";
import Ticket from "../components/Ticket";
import { useAction, useLoad } from "../hooks";

interface Board {
  date: string;
  jobs: { id: string; code: string; title: string; status: string; client_name: string | null; site_name: string | null }[];
  assignments: { id: string; job_id: string; user_name: string; time_window: string | null }[];
  away: { user_name: string; kind: string }[];
}

export default function DayBoard() {
  const nav = useNavigate();
  const [date, setDate] = useState("");
  const board = useLoad(() => api<Board>(`/dayboard${date ? `?date_str=${date}` : ""}`), [date]);
  const act = useAction();

  if (board.loading) return <LoadingView label="SETTING THE BOARD" />;
  if (board.error) return <ErrorView message={board.error} onRetry={board.reload} />;
  if (!board.data) return <EmptyView title="NO BOARD" />;

  const b = board.data;
  const crewFor = (jobId: string) => b.assignments.filter((a) => a.job_id === jobId);

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <h2 className="bf-label" style={{ margin: 0 }}>DAY BOARD — {b.date}</h2>
        <input
          type="date"
          aria-label="Board date"
          value={date || b.date}
          onChange={(e) => setDate(e.target.value)}
          style={{ minHeight: 36, padding: "4px 8px" }}
        />
        <Button
          kind="quiet"
          testId="copy-previous"
          disabled={act.busy}
          onClick={() =>
            void act.run(async () => {
              await api(`/dayboard/copy-previous${date ? `?date_str=${date}` : ""}`, { method: "POST" });
              board.reload();
            })
          }
        >
          COPY YESTERDAY
        </Button>
        <a
          className="bf-label"
          href={`/api/dayboard/sheet.pdf${date ? `?date_str=${date}` : ""}`}
          target="_blank"
          rel="noreferrer"
        >
          PRINT DAY SHEET ↗
        </a>
      </div>

      {act.error && <ErrorView message={act.error} />}

      {b.away.length > 0 && (
        <p className="bf-mono" style={{ fontSize: 13, color: "var(--stamp-warn)", marginBottom: 12 }}>
          AWAY: {b.away.map((a) => `${a.user_name} (${a.kind})`).join(", ")}
        </p>
      )}

      {b.jobs.length === 0 ? (
        <EmptyView title="EMPTY BOARD" hint="No crews assigned for this date. Assign from a job page, or copy yesterday's board." />
      ) : (
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
          {b.jobs.map((j) => (
            <Ticket
              key={j.id}
              code={j.code}
              title={j.title}
              stamp={{ label: j.status.toUpperCase(), tone: j.status === "live" ? "ok" : "info" }}
              meta={[
                { label: "SITE", value: j.site_name ?? j.client_name ?? "—" },
                { label: "CREW", value: crewFor(j.id).map((a) => a.user_name).join(", ") || "—" },
              ]}
              onClick={() => nav(`/jobs/${j.id}`)}
              testId={`board-${j.code}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
