import { Link, useNavigate } from "react-router-dom";
import { api, money, type ChaseList, type Nudge } from "../api";
import Stamp from "../components/Stamp";
import { EmptyView, ErrorView, LoadingView } from "../components/StatusViews";
import Ticket from "../components/Ticket";
import { useLoad } from "../hooks";

/** The Desk: morning nudge + money on the table + what needs a look. */
export default function Desk() {
  const nav = useNavigate();
  const nudge = useLoad(() => api<Nudge>("/nudge"));
  const chase = useLoad(() => api<ChaseList>("/invoicing/chase"));

  if (nudge.loading || chase.loading) return <LoadingView label="OPENING THE DAY BOOK" />;
  if (nudge.error) return <ErrorView message={nudge.error} onRetry={nudge.reload} />;
  if (chase.error) return <ErrorView message={chase.error} onRetry={chase.reload} />;
  if (!nudge.data || !chase.data) return <EmptyView title="NOTHING TO SHOW" />;

  const n = nudge.data;
  const c = chase.data;
  const quiet = n.review_count === 0 && n.recalls.length === 0 && n.quotes.length === 0 && n.licences_expiring.length === 0 && c.on_table_cents === 0;

  return (
    <div style={{ display: "grid", gap: 24, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
      <section aria-labelledby="nudge-h">
        <h2 id="nudge-h" className="bf-label" style={{ marginBottom: 10 }}>THE NUDGE — {n.date}</h2>
        {quiet && <EmptyView title="ALL SQUARE" hint="No reviews, recalls, chases or expiries. Good morning." />}
        <div style={{ display: "grid", gap: 10 }}>
          {n.review_count > 0 && (
            <Ticket
              code="INBOX"
              title={`${n.review_count} capture${n.review_count === 1 ? "" : "s"} waiting for a look`}
              stamp={{ label: "REVIEW", tone: "warn" }}
              onClick={() => nav("/inbox")}
              testId="nudge-review"
            />
          )}
          {n.recalls.map((r) => (
            <Ticket
              key={r.id}
              code={r.code}
              title={r.title}
              stamp={{ label: "RECALL", tone: "info" }}
              meta={[{ label: "DUE", value: r.recall_on }]}
              onClick={() => nav(`/jobs/${r.id}`)}
            />
          ))}
          {n.quotes.map((q) => (
            <Ticket
              key={q.id}
              code={q.code}
              title={q.title}
              stamp={{ label: "CHASE QUOTE", tone: "warn" }}
              meta={[{ label: "EXPIRES", value: q.valid_until }]}
              onClick={() => nav("/quotes")}
            />
          ))}
          {n.licences_expiring.map((l, i) => (
            <Ticket
              key={i}
              code="TICKET"
              title={`${l.user_name} — ${l.kind}`}
              stamp={{ label: "EXPIRING", tone: "bad" }}
              meta={[{ label: "EXPIRES", value: l.expires_on }]}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="chase-h">
        <h2 id="chase-h" className="bf-label" style={{ marginBottom: 10 }}>
          MONEY ON THE TABLE — <span className="bf-mono">{money(c.on_table_cents)}</span>
        </h2>
        {c.uninvoiced.length === 0 && c.overdue.length === 0 ? (
          <EmptyView title="NOTHING OWED, NOTHING WAITING" hint="Every finished job is invoiced and nothing is overdue." />
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {c.uninvoiced.map((j) => (
              <Ticket
                key={j.id}
                code={j.code}
                title={j.title}
                stamp={{ label: "UNINVOICED", tone: "warn" }}
                meta={[{ label: "VALUE", value: money(j.quoted_cents) }]}
                onClick={() => nav(`/jobs/${j.id}`)}
              />
            ))}
            {c.overdue.map((i) => (
              <Ticket
                key={i.id}
                code={i.code}
                title={i.job_code ? `Invoice on ${i.job_code}` : "Invoice"}
                stamp={{ label: "OVERDUE", tone: "bad" }}
                meta={[
                  { label: "AMOUNT", value: money(i.total_ex_cents) },
                  { label: "DUE", value: i.due_on ?? "—" },
                ]}
              />
            ))}
          </div>
        )}
        <p style={{ marginTop: 16 }}>
          <Link to="/dayboard" className="bf-label">TODAY'S BOARD →</Link>
          {"  "}
          <Stamp label={n.review_count > 0 ? "DESK BUSY" : "DESK CLEAR"} tone={n.review_count > 0 ? "warn" : "ok"} />
        </p>
      </section>
    </div>
  );
}
