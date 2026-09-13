import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cc, money } from "@/lib/api";

const STATUS_CHIP = { scheduled: "chip-steel", in_progress: "chip-amber", awaiting_signoff: "chip-amber", ready_to_invoice: "chip-green", draft_in_ledger: "chip-green", closed: "chip-steel" };

export default function Jobs() {
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState("all");

  useEffect(() => { cc.get(`/jobs?filter=${filter}`).then((r) => setRows(r.data)); }, [filter]);

  return (
    <div className="bf-enter">
      <div className="flex items-end justify-between mb-8">
        <div><div className="bf-label mb-1">QUOTED &amp; T&amp;M · MARGIN ON COST</div><h1 className="bf-h1 text-4xl">JOBS</h1></div>
        <div className="flex gap-2">
          <button className={`bf-btn ${filter === "all" ? "bf-btn-amber" : ""}`} data-testid="jobs-filter-all" onClick={() => setFilter("all")}>ALL</button>
          <button className={`bf-btn ${filter === "recall_due" ? "bf-btn-amber" : ""}`} data-testid="jobs-filter-recall" onClick={() => setFilter("recall_due")}>RECALL DUE</button>
          <button className={`bf-btn ${filter === "recall_week" ? "bf-btn-amber" : ""}`} data-testid="jobs-filter-recall-week" onClick={() => setFilter("recall_week")}>THIS WEEK</button>
        </div>
      </div>
      <div className="space-y-3" data-testid="jobs-list">
        {rows.length === 0 && <div className="bf-card p-10 text-center mono text-sm" style={{ color: "#94a3b8" }} data-testid="jobs-empty">NO JOBS IN THIS FILTER</div>}
        {rows.map((j) => (
          <div key={j.id} className="bf-card bf-row p-4 flex items-center gap-6 cursor-pointer" data-testid={`job-row-${j.code}`} onClick={() => nav(`/cc/jobs/${j.id}`)}>
            <span className="mono text-sm" style={{ color: "#f59e0b", width: 80 }}>{j.code}</span>
            <div style={{ flex: 2.5 }}>
              <div>{j.title}</div>
              <div className="mono text-xs" style={{ color: "#94a3b8" }}>{j.client_name} · {j.address_text || j.site_name || "—"}</div>
            </div>
            <span className={`bf-chip ${j.billing === "quoted" ? "chip-amber" : "chip-steel"}`}>{j.billing.toUpperCase()}</span>
            <span className="mono text-sm" style={{ width: 110, textAlign: "right" }}>{j.billing === "quoted" ? money(j.quoted_cents) : "T&M"}</span>
            <span className="mono text-xs" style={{ width: 70, color: "#94a3b8" }}>{j.signed_vos > 0 ? `${j.signed_vos} VO✓` : ""}</span>
            <span className="mono text-xs" style={{ width: 90, color: "#94a3b8" }}>{j.recall_on ? `RECALL ${j.recall_on.slice(0, 10)}` : ""}</span>
            {j.recall_due && <span className="bf-chip chip-red" data-testid={`recall-due-${j.code}`}>RECALL DUE</span>}
            {j.missing_po && <span className="bf-chip chip-red" data-testid={`missing-po-${j.code}`}>MISSING PO</span>}
            <span className={`bf-chip ${STATUS_CHIP[j.status]}`}>{j.status.replace(/_/g, " ").toUpperCase()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
