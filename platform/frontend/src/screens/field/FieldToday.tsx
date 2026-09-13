import { useState } from "react";
import { Link } from "react-router-dom";
import { api, type FieldBoard } from "../../api";
import Icon from "../../components/Icon";
import Stamp from "../../components/Stamp";
import { EmptyView, ErrorView, LoadingView } from "../../components/StatusViews";
import { useLoad } from "../../hooks";
import { weekdayDate } from "../../lib/dates";
import "./Field.css";

type Day = "today" | "tomorrow";

/** Minutes from midnight for the start of a "7:00 – 11:30" window; early hours read as afternoon on a trade day. */
function windowStart(window: string | null): number {
  const m = window?.match(/^\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return Number.POSITIVE_INFINITY;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const suffix = m[3]?.toLowerCase();
  if (suffix === "pm" && h < 12) h += 12;
  else if (!suffix && h <= 5) h += 12;
  return h * 60 + min;
}

const DAYS: { id: Day; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "tomorrow", label: "Tomorrow" },
];

/** Field home: where am I going, in what order, one thumb. */
export default function FieldToday() {
  const [day, setDay] = useState<Day>("today");
  const board = useLoad(() => api<FieldBoard>(`/field/${day}`), [day]);
  const jobs = [...(board.data?.jobs ?? [])].sort((a, b) => windowStart(a.window) - windowStart(b.window));

  return (
    <div className="fd-screen">
      <header className="fd-head">
        <h1 className="fd-title">
          Your run
          {board.data && (
            <>
              {" — "}
              <span className="fd-title__date">{weekdayDate(board.data.date)}</span>
            </>
          )}
        </h1>
        <div role="tablist" aria-label="Day" className="fd-seg">
          {DAYS.map((d) => (
            <button
              key={d.id}
              type="button"
              role="tab"
              data-testid={`day-${d.id}`}
              aria-selected={day === d.id}
              className="fd-seg__item"
              onClick={() => setDay(d.id)}
            >
              {d.label}
            </button>
          ))}
        </div>
      </header>

      {board.loading && <LoadingView label="Checking the board" rows={3} />}
      {board.error && <ErrorView message={board.error} onRetry={board.reload} />}
      {board.data && jobs.length === 0 && (
        <EmptyView
          icon="calendar"
          title={day === "today" ? "Nothing on today" : "Nothing on tomorrow"}
          hint="If that doesn't look right, ring the office."
        />
      )}
      {board.data && jobs.length > 0 && (
        <>
          <p className="fd-count">
            {jobs.length} {jobs.length === 1 ? "job" : "jobs"} on your board
          </p>
          <ol className="fd-run" aria-label="Jobs in order">
            {jobs.map((j, i) => (
              <li key={j.job_id}>
                <Link to={`/field/jobs/${j.job_id}`} className="fd-run__row" data-testid={`field-${j.code}`}>
                  <span className="fd-run__n" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="fd-run__body">
                    <span className="fd-run__code bf-mono">{j.code}</span>
                    <span className="fd-run__title">{j.title}</span>
                    <span className="fd-run__sub">
                      {j.window && <Stamp label={j.window} tone="info" />}
                      <span className="fd-run__site">
                        {j.site_name ?? "Site to be confirmed"}
                        {j.address ? ` · ${j.address}` : ""}
                      </span>
                    </span>
                  </span>
                  <span className="fd-run__end">
                    <Icon name="chevron-right" size={20} />
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
