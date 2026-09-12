import { useNavigate, useSearchParams } from "react-router-dom";
import { api, type SearchHits } from "../api";
import { EmptyView, ErrorView, LoadingView } from "../components/StatusViews";
import Ticket from "../components/Ticket";
import { useLoad } from "../hooks";

export default function Search() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const q = params.get("q") ?? "";
  const hits = useLoad(() => api<SearchHits>(`/search?q=${encodeURIComponent(q)}`), [q]);

  if (!q) return <EmptyView title="TYPE SOMETHING TO SEARCH" hint="Jobs, clients, quotes and POs are all indexed." />;
  if (hits.loading) return <LoadingView label={`SEARCHING "${q.toUpperCase()}"`} />;
  if (hits.error) return <ErrorView message={hits.error} onRetry={hits.reload} />;
  if (!hits.data) return <EmptyView title="NO RESULTS" />;

  const h = hits.data;
  const total = h.jobs.length + h.clients.length + h.quotes.length + h.pos.length;

  return (
    <div>
      <h2 className="bf-label" style={{ marginBottom: 12 }}>
        SEARCH — "{q}" · {total} HIT{total === 1 ? "" : "S"}
      </h2>
      {total === 0 ? (
        <EmptyView title="NOTHING MATCHED" hint="Try a job code, client name, or quote title." />
      ) : (
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
          {h.jobs.map((j) => (
            <Ticket key={j.id} code={j.code} title={j.title} stamp={{ label: "JOB", tone: "info" }} onClick={() => nav(`/jobs/${j.id}`)} />
          ))}
          {h.quotes.map((x) => (
            <Ticket key={x.id} code={x.code} title={x.title} stamp={{ label: "QUOTE", tone: "info" }} onClick={() => nav("/quotes")} />
          ))}
          {h.clients.map((c) => (
            <Ticket key={c.id} code="CLIENT" title={c.name} stamp={{ label: "CLIENT", tone: "mute" }} />
          ))}
          {h.pos.map((p) => (
            <Ticket key={p.id} code={p.code} title={p.supplier} stamp={{ label: "PO", tone: "mute" }} />
          ))}
        </div>
      )}
    </div>
  );
}
