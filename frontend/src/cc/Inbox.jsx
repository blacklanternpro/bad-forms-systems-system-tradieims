import { useEffect, useState } from "react";
import { cc, money, errMsg, API } from "@/lib/api";
import { toast } from "sonner";

export default function Inbox() {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("needs_verify");
  const [edit, setEdit] = useState({});
  const token = localStorage.getItem("bf_token");

  const load = () => cc.get(`/inbox?status=${status}`).then((r) => setRows(r.data));
  useEffect(() => { load(); }, [status]); // eslint-disable-line

  const field = (row, k, def = "") => (edit[row.id]?.[k] !== undefined ? edit[row.id][k] : (row[k] ?? def));
  const setF = (row, k, v) => setEdit({ ...edit, [row.id]: { ...(edit[row.id] || {}), [k]: v } });

  const verify = async (row, withBill) => {
    try {
      const e = edit[row.id] || {};
      const body = {
        supplier: field(row, "supplier", "other"),
        total_cents: e.total_dollars !== undefined ? Math.round(Number(e.total_dollars) * 100) : row.total_cents,
        gst_cents: e.gst_dollars !== undefined ? Math.round(Number(e.gst_dollars) * 100) : row.gst_cents,
        docket_number: field(row, "docket_number"),
        create_bill_draft: withBill,
      };
      const { data } = await cc.post(`/extractions/${row.id}/verify`, body);
      toast.success(`VERIFIED → RECEIPT${data.bill_draft_id ? " + ACCPAY BILL DRAFT (PENDING PUSH)" : ""}`);
      load();
    } catch (e2) { toast.error(errMsg(e2)); }
  };
  const reject = async (row) => { await cc.post(`/extractions/${row.id}/reject`); toast.success("REJECTED"); load(); };

  return (
    <div className="bf-enter">
      <div className="flex items-end justify-between mb-8">
        <div><div className="bf-label mb-1">HUMAN GATE — NOTHING POSTS WITHOUT VERIFY</div><h1 className="bf-h1 text-4xl">INBOX</h1></div>
        <div className="flex gap-2">
          {["needs_verify", "verified", "failed", "rejected", "all"].map((s) => (
            <button key={s} className={`bf-btn ${status === s ? "bf-btn-amber" : ""}`} data-testid={`inbox-filter-${s}`} onClick={() => setStatus(s)}>{s.replace("_", " ").toUpperCase()}</button>
          ))}
        </div>
      </div>
      {rows.length === 0 && <div className="bf-card p-10 text-center mono" style={{ color: "#94a3b8" }} data-testid="inbox-empty">INBOX CLEAR</div>}
      <div className="grid grid-cols-2 gap-6 bf-stagger" data-testid="inbox-list">
        {rows.map((row) => (
          <div key={row.id} className="bf-card bf-frame p-5 flex gap-5" data-testid={`inbox-item-${row.docket_number || row.id}`}>
            <img alt="docket" src={`${API}/files/${row.document_id}?auth=${token}`} style={{ width: 130, height: 170, objectFit: "cover", border: "1px solid #262f3d" }} />
            <div className="flex-1">
              <div className="flex justify-between mb-3">
                <span className="bf-chip chip-amber">{(row.kind || "unknown").replace("_", " ").toUpperCase()}</span>
                <span className={`bf-chip ${row.status === "needs_verify" ? "chip-red" : row.status === "verified" ? "chip-green" : "chip-steel"}`}>{row.status.toUpperCase()}</span>
              </div>
              <div className="mono text-xs mb-2" style={{ color: "#94a3b8" }}>{row.job_code ? `${row.job_code} · ${row.job_title}` : "UNASSIGNED"}</div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div><div className="bf-label">SUPPLIER</div>
                  <select className="bf-input" data-testid="inbox-supplier-select" value={field(row, "supplier", "other") || "other"} onChange={(e) => setF(row, "supplier", e.target.value)} disabled={row.status !== "needs_verify"}>
                    {["reece", "middys", "rexel", "other"].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select></div>
                <div><div className="bf-label">DOCKET #</div><input className="bf-input" data-testid="inbox-docket-input" value={field(row, "docket_number") || ""} onChange={(e) => setF(row, "docket_number", e.target.value)} disabled={row.status !== "needs_verify"} /></div>
                <div><div className="bf-label">TOTAL $</div><input className="bf-input" type="number" data-testid="inbox-total-input" value={edit[row.id]?.total_dollars !== undefined ? edit[row.id].total_dollars : ((row.total_cents || 0) / 100)} onChange={(e) => setF(row, "total_dollars", e.target.value)} disabled={row.status !== "needs_verify"} /></div>
                <div><div className="bf-label">GST $</div><input className="bf-input" type="number" data-testid="inbox-gst-input" value={edit[row.id]?.gst_dollars !== undefined ? edit[row.id].gst_dollars : ((row.gst_cents || 0) / 100)} onChange={(e) => setF(row, "gst_dollars", e.target.value)} disabled={row.status !== "needs_verify"} /></div>
              </div>
              {row.status === "needs_verify" && (
                <div className="flex gap-2 flex-wrap">
                  <button className="bf-btn bf-btn-amber" data-testid="inbox-verify-btn" onClick={() => verify(row, false)}>VERIFY</button>
                  <button className="bf-btn" data-testid="inbox-verify-bill-btn" onClick={() => verify(row, true)}>VERIFY + BILL DRAFT</button>
                  <button className="bf-btn bf-btn-danger" data-testid="inbox-reject-btn" onClick={() => reject(row)}>REJECT</button>
                </div>
              )}
              {row.status === "failed" && <div className="mono text-xs" style={{ color: "#ef4444" }}>EXTRACT FAILED — {row.error}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
