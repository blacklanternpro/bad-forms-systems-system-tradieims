import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { cc, money, errMsg, API } from "@/lib/api";
import { toast } from "sonner";

export default function JobDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [d, setD] = useState(null);
  const [po, setPo] = useState("");
  const [recall, setRecall] = useState("");
  const isOwner = (JSON.parse(localStorage.getItem("bf_user") || "{}").role) === "owner";
  const token = localStorage.getItem("bf_token");

  const load = useCallback(async () => {
    const { data } = await cc.get(`/jobs/${id}`);
    setD(data); setPo(data.job.customer_po || ""); setRecall((data.job.recall_on || "").slice(0, 10));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (!d) return <div className="mono text-xs" style={{ color: "#94a3b8" }}>LOADING…</div>;
  const { job, margin } = d;

  const prepare = async () => {
    try {
      const { data } = await cc.post(`/jobs/${id}/prepare-draft`);
      toast.success(`${data.purpose.toUpperCase()} DRAFT PREPARED — ${money(data.total_cents)} + GST · ${data.attachments.length} ATTACHMENTS · PENDING PUSH`);
      load();
    } catch (e) { toast.error(errMsg(e)); }
  };
  const savePo = async () => { await cc.patch(`/jobs/${id}`, { customer_po: po }); toast.success("PO SAVED"); load(); };
  const saveRecall = async () => { await cc.patch(`/jobs/${id}`, { recall_on: recall || null }); toast.success("RECALL SAVED"); load(); };
  const setStatus = async (s) => { await cc.patch(`/jobs/${id}`, { status: s }); load(); };

  return (
    <div className="bf-enter">
      <button className="bf-label mb-4" style={{ background: "none", border: 0, cursor: "pointer" }} onClick={() => nav("/cc/jobs")} data-testid="back-to-jobs">◂ JOBS</button>
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="mono text-sm" style={{ color: "#f59e0b" }}>{job.code} · {job.billing.toUpperCase()}</div>
          <h1 className="bf-h1 text-3xl mt-1" data-testid="job-title">{job.title}</h1>
          <div className="mono text-xs mt-2" style={{ color: "#94a3b8" }}>{d.client.name} · site {d.site?.name || "—"} · bill-to {d.bill_to.name}</div>
        </div>
        <div className="flex gap-2 items-center">
          {d.missing_po && <span className="bf-chip chip-red" data-testid="missing-po-flag">MISSING PO</span>}
          <select className="bf-input" style={{ width: 200 }} value={job.status} data-testid="job-status-select" onChange={(e) => setStatus(e.target.value)} disabled={!isOwner}>
            {["scheduled", "in_progress", "awaiting_signoff", "ready_to_invoice", "draft_in_ledger", "closed"].map((s) => <option key={s} value={s}>{s.replace(/_/g, " ").toUpperCase()}</option>)}
          </select>
          {isOwner && <button className="bf-btn bf-btn-amber" data-testid="prepare-draft-btn" onClick={prepare}>PREPARE XERO DRAFT</button>}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-8 bf-stagger">
        {[["REVENUE", margin.revenue_cents, "#e7ecf3"], ["COST (LABOUR+RECEIPTS)", margin.cost_cents, "#94a3b8"],
          ["MARGIN", margin.margin_cents, margin.margin_cents >= 0 ? "#22c55e" : "#ef4444"], ["SIGNED VOs / EXTRAS", margin.signed_vo_cents + margin.extras_cents, "#f59e0b"]].map(([l, v, c]) => (
          <div key={l} className="bf-card bf-frame p-5" data-testid={`margin-${l.split(" ")[0].toLowerCase()}`}>
            <div className="bf-label mb-2">{l}</div>
            <div className="mono text-2xl font-bold" style={{ color: c }}>{money(v)}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bf-card p-6" data-testid="job-variations">
          <div className="bf-label mb-3">VARIATIONS</div>
          {d.variations.length === 0 && <div className="mono text-xs" style={{ color: "#4b5563" }}>NONE</div>}
          {d.variations.map((v) => (
            <div key={v.id} className="flex justify-between items-center py-2 mono text-xs" style={{ borderBottom: "1px solid #1c232e" }}>
              <span style={{ color: "#f59e0b" }}>{v.code}</span><span style={{ flex: 1, marginLeft: 12 }}>{v.title}</span>
              <span className="mr-3">{money(v.amount_cents)}</span>
              <span className={`bf-chip ${v.status === "signed" ? "chip-green" : v.status === "rejected" ? "chip-red" : "chip-steel"}`}>{v.status.toUpperCase()}</span>
            </div>
          ))}
          <div className="bf-label mt-6 mb-3">EXTRAS (TRAVEL / CALLOUT / OTHER)</div>
          {d.extras.map((e) => (
            <div key={e.id} className="flex justify-between mono text-xs py-1"><span>{e.kind.toUpperCase()} — {e.description}</span><span>{e.qty} × {money(e.unit_cents)}</span></div>
          ))}
          <div className="bf-label mt-6 mb-3">RECEIPTS (COST)</div>
          {d.receipts.map((x) => (
            <div key={x.id} className="flex justify-between mono text-xs py-1"><span>{x.supplier.toUpperCase()} {x.docket_number}</span><span>{money(x.total_cents)}</span></div>
          ))}
          <div className="flex gap-3 items-end mt-6">
            <div style={{ flex: 1 }}><div className="bf-label mb-1">CUSTOMER PO</div><input className="bf-input" data-testid="job-po-input" value={po} onChange={(e) => setPo(e.target.value)} /></div>
            {isOwner && <button className="bf-btn" data-testid="job-po-save-btn" onClick={savePo}>SAVE PO</button>}
          </div>
          <div className="flex gap-3 items-end mt-4">
            <div style={{ flex: 1 }}><div className="bf-label mb-1">RECALL ON</div><input type="date" className="bf-input" data-testid="job-recall-input" value={recall} onChange={(e) => setRecall(e.target.value)} /></div>
            {isOwner && <button className="bf-btn" data-testid="job-recall-save-btn" onClick={saveRecall}>SAVE RECALL</button>}
          </div>
        </div>

        <div className="bf-card p-6" data-testid="job-drafts">
          <div className="bf-label mb-3">LEDGER DRAFTS FOR THIS JOB</div>
          {d.drafts.length === 0 && <div className="mono text-xs" style={{ color: "#4b5563" }}>NONE PREPARED</div>}
          {d.drafts.map((x) => (
            <div key={x.id} className="mono text-xs py-2" style={{ borderBottom: "1px solid #1c232e" }}>
              <span className="bf-chip chip-amber mr-2">{x.purpose.toUpperCase()}</span>
              {money(x.total_cents)} + GST {money(x.gst_cents)} · {(x.attachments || []).length} attach ·
              <span style={{ color: x.status === "pushed" ? "#22c55e" : "#f59e0b" }}> {x.status.toUpperCase()}</span>
            </div>
          ))}
          <div className="bf-label mt-6 mb-3">DOCUMENTS</div>
          <div className="grid grid-cols-4 gap-2">
            {d.documents.filter((doc) => doc.mime.startsWith("image/")).slice(0, 8).map((doc) => (
              <a key={doc.id} href={`${API}/files/${doc.id}?auth=${token}`} target="_blank" rel="noreferrer">
                <img alt={doc.kind} src={`${API}/files/${doc.id}?auth=${token}`} style={{ width: "100%", height: 70, objectFit: "cover", border: "1px solid #262f3d" }} />
                <div className="bf-label mt-1">{doc.kind.replace(/_/g, " ")}</div>
              </a>
            ))}
          </div>
          {d.documents.filter((doc) => doc.mime === "application/pdf").map((doc) => (
            <a key={doc.id} className="mono text-xs block mt-2" style={{ color: "#f59e0b" }} href={`${API}/files/${doc.id}?auth=${token}`} target="_blank" rel="noreferrer">▸ {doc.kind.replace(/_/g, " ").toUpperCase()} PDF</a>
          ))}
        </div>
      </div>
    </div>
  );
}
