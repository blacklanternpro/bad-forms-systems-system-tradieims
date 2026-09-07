import { useEffect, useState } from "react";
import { cc, money, errMsg } from "@/lib/api";
import { toast } from "sonner";

const PURPOSE = { deposit: "chip-amber", final: "chip-green", tm: "chip-steel", bill: "chip-red" };

export default function Ledger() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(null);
  const load = () => cc.get("/xero/drafts").then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);

  const push = async (id) => {
    try {
      const { data } = await cc.post(`/xero/drafts/${id}/push`);
      toast.success(`PUSHED AS DRAFT → ${data.xero_id} (never paid/reconciled from here)`);
      load();
    } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <div className="bf-enter">
      <div className="mb-8"><div className="bf-label mb-1">DRAFTS ONLY — XERO MOCKED · MYOB NOT COMMISSIONED · NEVER PAY / RECONCILE / SUBMIT</div>
        <h1 className="bf-h1 text-4xl">LEDGER DRAFTS</h1></div>
      <div className="space-y-3" data-testid="ledger-list">
        {rows.map((x) => (
          <div key={x.id}>
            <div className="bf-card bf-row p-4 flex items-center gap-5 cursor-pointer" data-testid={`draft-row-${x.id}`} onClick={() => setOpen(open === x.id ? null : x.id)}>
              <span className={`bf-chip ${PURPOSE[x.purpose]}`} data-testid={`draft-purpose-${x.id}`}>{x.purpose.toUpperCase()}</span>
              <span className="mono text-xs" style={{ width: 90, color: "#f59e0b" }}>{x.job_code || "—"}</span>
              <span style={{ flex: 2 }} className="mono text-xs">{x.job_title || x.payload?.Reference || "—"}</span>
              <span className="mono text-xs" style={{ flex: 1, color: "#94a3b8" }}>{x.contact_name || x.payload?.Contact?.Name || "—"}</span>
              <span className="mono text-sm" style={{ width: 130, textAlign: "right" }}>{money(x.total_cents)} <span style={{ color: "#94a3b8" }}>+{money(x.gst_cents)} GST</span></span>
              <span className="mono text-xs" style={{ width: 80 }}>{(x.attachments || []).length} ATT</span>
              <span className={`bf-chip ${x.status === "pushed" ? "chip-green" : x.status === "failed" ? "chip-red" : "chip-amber"}`} data-testid={`draft-status-${x.id}`}>{x.status.replace("_", " ").toUpperCase()}</span>
              {x.status !== "pushed" && <button className="bf-btn bf-btn-amber" data-testid={`draft-push-${x.id}`} onClick={(e) => { e.stopPropagation(); push(x.id); }}>{x.status === "failed" ? "RETRY PUSH" : "PUSH DRAFT"}</button>}
              {x.status === "pushed" && <span className="mono text-xs" style={{ color: "#22c55e" }}>{x.xero_id}</span>}
            </div>
            {open === x.id && (
              <pre className="bf-card p-4 mono text-xs mt-1 overflow-x-auto" style={{ color: "#94a3b8", borderLeft: "2px solid #f59e0b" }} data-testid="draft-payload">
                {JSON.stringify({ payload: x.payload, attachments: x.attachments }, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
