import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, clearDemo, getSession, getVirginToken, money, subscribeVirgin, type ChaseList, type Nudge } from "../api";
import Button from "../components/Button";
import Stamp from "../components/Stamp";
import { EmptyView, ErrorView, LoadingView } from "../components/StatusViews";
import Ticket from "../components/Ticket";
import { useLoad } from "../hooks";

/** The Desk: morning nudge + money on the table + what needs a look. */
export default function Desk() {
  const nav = useNavigate();
  const [virgin, setVirgin] = useState(!!getVirginToken());
  useEffect(() => subscribeVirgin(() => setVirgin(!!getVirginToken())), []);
  const nudge = useLoad(() => api<Nudge>("/nudge"));
  const chase = useLoad(() => api<ChaseList>("/invoicing/chase"));

  if (nudge.loading || chase.loading) return <LoadingView label="Opening the day book" />;
  if (nudge.error) return <ErrorView message={nudge.error} onRetry={nudge.reload} />;
  if (chase.error) return <ErrorView message={chase.error} onRetry={chase.reload} />;
  if (!nudge.data || !chase.data) return <EmptyView title="Nothing to show" />;

  const n = nudge.data;
  const c = chase.data;
  const quiet = n.review_count === 0 && n.recalls.length === 0 && n.quotes.length === 0 && n.licences_expiring.length === 0 && c.on_table_cents === 0;

  return (
    <div style={{ display: "grid", gap: 24, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
      <section aria-labelledby="nudge-h">
        <h2 id="nudge-h" className="bf-h3">
          The nudge — {n.date}
        </h2>
        {quiet && <EmptyView title="All square" hint="No reviews, recalls, chases or expiries. Good morning." />}
        <div style={{ display: "grid", gap: 10 }}>
          {n.review_count > 0 && (
            <Ticket
              code="Inbox"
              title={`${n.review_count} capture${n.review_count === 1 ? "" : "s"} waiting for a look`}
              stamp={{ label: "Review", tone: "warn" }}
              onClick={() => nav("/inbox")}
              testId="nudge-review"
            />
          )}
          {n.recalls.map((r) => (
            <Ticket
              key={r.id}
              code={r.code}
              title={r.title}
              stamp={{ label: "Recall", tone: "info" }}
              meta={[{ label: "Due", value: r.recall_on }]}
              onClick={() => nav(`/jobs/${r.id}`)}
            />
          ))}
          {n.quotes.map((q) => (
            <Ticket
              key={q.id}
              code={q.code}
              title={q.title}
              stamp={{ label: "Chase quote", tone: "warn" }}
              meta={[{ label: "Expires", value: q.valid_until }]}
              onClick={() => nav("/quotes")}
            />
          ))}
          {n.licences_expiring.map((l, i) => (
            <Ticket
              key={i}
              code="Ticket"
              title={`${l.user_name} — ${l.kind}`}
              stamp={{ label: "Expiring", tone: "bad" }}
              meta={[{ label: "Expires", value: l.expires_on }]}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="chase-h">
        <h2 id="chase-h" className="bf-h3">
          Money on the table — <span className="bf-mono">{money(c.on_table_cents)}</span>
        </h2>
        {c.uninvoiced.length === 0 && c.overdue.length === 0 ? (
          <EmptyView title="Nothing owed, nothing waiting" hint="Every finished job is invoiced and nothing is overdue." />
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {c.uninvoiced.map((j) => (
              <Ticket
                key={j.id}
                code={j.code}
                title={j.title}
                stamp={{ label: "Uninvoiced", tone: "warn" }}
                meta={[{ label: "Value", value: money(j.quoted_cents) }]}
                onClick={() => nav(`/jobs/${j.id}`)}
              />
            ))}
            {c.overdue.map((i) => (
              <Ticket
                key={i.id}
                code={i.code}
                title={i.job_code ? `Invoice on ${i.job_code}` : "Invoice"}
                stamp={{ label: "Overdue", tone: "bad" }}
                meta={[
                  { label: "Amount", value: money(i.total_ex_cents) },
                  { label: "Due", value: i.due_on ?? "—" },
                ]}
              />
            ))}
          </div>
        )}
        <p style={{ marginTop: 16, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <Link to="/dayboard" className="bf-label">
            Today’s board →
          </Link>
          <Stamp label={n.review_count > 0 ? "Desk busy" : "Desk clear"} tone={n.review_count > 0 ? "warn" : "ok"} />
        </p>
      </section>

      {getSession()?.org.is_demo && (getSession()?.user.role === "owner" || getSession()?.user.role === "office") && (
        <section aria-label="Demo clear" style={{ gridColumn: "1 / -1" }}>
          <Button
            kind="quiet"
            testId="desk-clear-demo"
            disabled={virgin}
            onClick={() => {
              if (!window.confirm("Empties this demo for this tab until you reload.")) return;
              void clearDemo().then(() => {
                nudge.reload();
                chase.reload();
              });
            }}
          >
            {virgin ? "Demo cleared — reload to restore" : "Clear demo (this tab)"}
          </Button>
        </section>
      )}
    </div>
  );
}
