import { useNavigate } from "react-router-dom";
import { api, type NotificationRow } from "../api";
import Button from "../components/Button";
import { EmptyView, ErrorView, LoadingView } from "../components/StatusViews";
import Ticket from "../components/Ticket";
import { useAction, useLoad } from "../hooks";

const TONE: Record<string, "ok" | "warn" | "bad" | "info"> = {
  capture_review: "warn",
  invoice_overdue: "bad",
  incident_reported: "bad",
  licence_expiring: "warn",
  quote_accepted: "ok",
  assignment_changed: "info",
};

export default function Notifications() {
  const nav = useNavigate();
  const notes = useLoad(() => api<NotificationRow[]>("/notifications"));
  const act = useAction();

  if (notes.loading) return <LoadingView label="Checking alerts" />;
  if (notes.error) return <ErrorView message={notes.error} onRetry={notes.reload} />;

  const items = notes.data ?? [];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
        <h2 className="bf-h2" style={{ margin: 0, fontSize: 20 }}>
          Alerts
        </h2>
        {items.length > 0 && (
          <span style={{ marginLeft: "auto" }}>
            <Button
              kind="quiet"
              disabled={act.busy}
              testId="read-all"
              onClick={() =>
                void act.run(async () => {
                  await api("/notifications/read-all", { method: "POST" });
                  notes.reload();
                })
              }
            >
              Mark all read
            </Button>
          </span>
        )}
      </div>
      {act.error && <ErrorView message={act.error} />}
      {items.length === 0 ? (
        <EmptyView title="Nothing waiting" hint="You're across everything. New events land here." />
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {items.map((n) => (
            <Ticket
              key={n.id}
              code={new Date(n.created_at).toLocaleString("en-AU")}
              title={n.title}
              stamp={{ label: n.event_type.replace(/_/g, " ").toUpperCase(), tone: TONE[n.event_type] ?? "info" }}
              onClick={() =>
                void act.run(async () => {
                  await api(`/notifications/${n.id}/read`, { method: "POST" });
                  if (n.link && n.link.startsWith("/cc")) nav(n.link.replace("/cc", ""));
                  else notes.reload();
                })
              }
              testId={`note-${n.id}`}
            >
              {n.body && <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--ink-mute)" }}>{n.body}</p>}
            </Ticket>
          ))}
        </div>
      )}
    </div>
  );
}
