import { useEffect, useState } from "react";
import { cc, money, errMsg, API } from "@/lib/api";
import { toast } from "sonner";

export default function Quotes() {
  const [quotes, setQuotes] = useState([]);
  const [filter, setFilter] = useState("all");
  const [dir, setDir] = useState({ clients: [], sites: [] });
  const [open, setOpen] = useState(null);
  const [detail, setDetail] = useState(null);
  const [creating, setCreating] = useState(false);
  const org = JSON.parse(localStorage.getItem("bf_org") || "{}");
  const isOwner = (JSON.parse(localStorage.getItem("bf_user") || "{}").role) === "owner";
  const [form, setForm] = useState({ client_id: "", site_id: "", title: "", deposit_bps: org?.settings?.trades?.default_deposit_bps || 0, lines: [{ description: "", qty: 1, unit_cents: 0 }] });
  const [sendEmail, setSendEmail] = useState("");
  const [acceptLink, setAcceptLink] = useState(null);

  const load = () => cc.get(`/quotes?filter=${filter}`).then((r) => setQuotes(r.data));
  useEffect(() => { load(); cc.get("/directory").then((r) => setDir(r.data)); }, [filter]);

  const openQuote = async (id) => {
    if (open === id) { setOpen(null); return; }
    const { data } = await cc.get(`/quotes/${id}`);
    setDetail(data); setOpen(id); setAcceptLink(null);
    setSendEmail(data.client?.email || "");
  };

  const create = async () => {
    try {
      const lines = form.lines.filter((l) => l.description);
      if (!form.client_id || !lines.length) return toast.error("CLIENT + AT LEAST ONE LINE");
      await cc.post("/quotes", { ...form, deposit_bps: Number(form.deposit_bps), lines: lines.map((l) => ({ ...l, qty: Number(l.qty), unit_cents: Math.round(Number(l.unit_cents) * 100) })) });
      toast.success("QUOTE DRAFTED"); setCreating(false);
      setForm({ ...form, title: "", lines: [{ description: "", qty: 1, unit_cents: 0 }] });
      load();
    } catch (e) { toast.error(errMsg(e)); }
  };

  const send = async (id) => {
    try {
      const { data } = await cc.post(`/quotes/${id}/send`, { to_email: sendEmail });
      setAcceptLink(`${window.location.origin}${data.accept_path}`);
      toast.success(`EMAIL QUEUED TO ${data.to_email}`);
      load(); openQuote(id); setOpen(id);
      const d2 = await cc.get(`/quotes/${id}`); setDetail(d2.data);
      setAcceptLink(`${window.location.origin}${data.accept_path}`);
    } catch (e) { toast.error(errMsg(e)); }
  };

  const markAccepted = async (id) => {
    try {
      const { data } = await cc.post(`/quotes/${id}/mark-accepted`, {});
      toast.success(`ACCEPTED → ${data.job_code}${data.deposit_draft_id ? " + DEPOSIT DRAFT (PENDING PUSH)" : ""}`);
      load(); setOpen(null);
    } catch (e) { toast.error(errMsg(e)); }
  };

  const pdf = (id) => window.open(`${API}/quotes/${id}/pdf?auth=${localStorage.getItem("bf_token")}`, "_blank");
  const STATUS = { draft: "chip-steel", sent: "chip-amber", accepted: "chip-green", declined: "chip-red", expired: "chip-red" };

  return (
    <div className="bf-enter">
      <div className="flex items-end justify-between mb-8">
        <div><div className="bf-label mb-1">LETTERHEAD PDF · /q TOKEN ACCEPT</div><h1 className="bf-h1 text-4xl">QUOTES</h1></div>
        <div className="flex gap-2">
          <button className={`bf-btn ${filter === "all" ? "bf-btn-amber" : ""}`} data-testid="quotes-filter-all" onClick={() => setFilter("all")}>ALL</button>
          <button className={`bf-btn ${filter === "follow_up" ? "bf-btn-amber" : ""}`} data-testid="quotes-filter-follow-up" onClick={() => setFilter("follow_up")}>FOLLOW UP</button>
          {isOwner && <button className="bf-btn bf-btn-amber" data-testid="new-quote-btn" onClick={() => setCreating(!creating)}>{creating ? "CANCEL" : "NEW QUOTE"}</button>}
        </div>
      </div>

      {creating && (
        <div className="bf-card bf-frame p-6 mb-8" data-testid="quote-form">
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div><div className="bf-label mb-1">CLIENT</div>
              <select className="bf-input" data-testid="quote-client-select" value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value, site_id: "" })}>
                <option value="">— client —</option>{dir.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
            <div><div className="bf-label mb-1">SITE</div>
              <select className="bf-input" data-testid="quote-site-select" value={form.site_id} onChange={(e) => setForm({ ...form, site_id: e.target.value })}>
                <option value="">— site —</option>{dir.sites.filter((s) => s.client_id === form.client_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select></div>
            <div><div className="bf-label mb-1">TITLE</div><input className="bf-input" data-testid="quote-title-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div><div className="bf-label mb-1">DEPOSIT BPS (5000 = 50%)</div><input className="bf-input" data-testid="quote-deposit-input" type="number" value={form.deposit_bps} onChange={(e) => setForm({ ...form, deposit_bps: e.target.value })} /></div>
          </div>
          {form.lines.map((l, i) => (
            <div key={i} className="flex gap-3 mb-2">
              <input className="bf-input" style={{ flex: 3 }} placeholder="Description" data-testid={`quote-line-desc-${i}`} value={l.description} onChange={(e) => { const ls = [...form.lines]; ls[i].description = e.target.value; setForm({ ...form, lines: ls }); }} />
              <input className="bf-input" style={{ flex: 0.6 }} type="number" placeholder="Qty" data-testid={`quote-line-qty-${i}`} value={l.qty} onChange={(e) => { const ls = [...form.lines]; ls[i].qty = e.target.value; setForm({ ...form, lines: ls }); }} />
              <input className="bf-input" style={{ flex: 1 }} type="number" placeholder="Unit $ ex GST" data-testid={`quote-line-unit-${i}`} value={l.unit_cents} onChange={(e) => { const ls = [...form.lines]; ls[i].unit_cents = e.target.value; setForm({ ...form, lines: ls }); }} />
            </div>
          ))}
          <div className="flex gap-3 mt-3">
            <button className="bf-btn" data-testid="quote-add-line-btn" onClick={() => setForm({ ...form, lines: [...form.lines, { description: "", qty: 1, unit_cents: 0 }] })}>+ LINE</button>
            <button className="bf-btn bf-btn-amber" data-testid="quote-create-btn" onClick={create}>CREATE DRAFT</button>
          </div>
        </div>
      )}

      <div className="space-y-3" data-testid="quotes-list">
        {quotes.map((q) => (
          <div key={q.id}>
            <div className="bf-card bf-row p-4 flex items-center gap-6 cursor-pointer" data-testid={`quote-row-${q.code}`} onClick={() => openQuote(q.id)}>
              <span className="mono text-sm" style={{ color: "#f59e0b", width: 70 }}>{q.code}</span>
              <span style={{ flex: 2 }}>{q.title || "—"}</span>
              <span className="mono text-xs" style={{ flex: 1.5, color: "#94a3b8" }}>{q.client_name}</span>
              <span className="mono text-sm" style={{ width: 120, textAlign: "right" }}>{money(q.total_cents)}</span>
              <span className="mono text-xs" style={{ width: 90, color: "#94a3b8" }}>{q.deposit_bps ? `DEP ${q.deposit_bps / 100}%` : ""}</span>
              <span className={`bf-chip ${STATUS[q.status]}`} data-testid={`quote-status-${q.code}`}>{q.status.toUpperCase()}</span>
              {q.overdue && <span className="bf-chip chip-red" data-testid={`quote-overdue-${q.code}`}>OVERDUE</span>}
              {!q.overdue && q.follow_up && <span className="bf-chip chip-amber" data-testid={`quote-follow-up-${q.code}`}>FOLLOW UP</span>}
            </div>
            {open === q.id && detail && (
              <div className="bf-card p-6 mt-1" style={{ borderLeft: "2px solid #f59e0b" }} data-testid="quote-detail">
                <table className="w-full mono text-xs mb-4">
                  <tbody>
                    {detail.lines.map((l) => (
                      <tr key={l.id}><td className="py-1" style={{ color: "#e7ecf3" }}>{l.description}</td><td style={{ textAlign: "right", color: "#94a3b8" }}>{Number(l.qty)} ×</td><td style={{ textAlign: "right", width: 130 }}>{money(l.unit_cents)}</td></tr>
                    ))}
                    <tr style={{ borderTop: "1px solid #262f3d" }}><td className="pt-2 bf-label">SUBTOTAL / GST / TOTAL</td><td /><td className="pt-2" style={{ textAlign: "right", color: "#f59e0b" }}>{money(detail.total_cents)} / {money(detail.gst_cents)} / {money(detail.total_cents + detail.gst_cents)}</td></tr>
                  </tbody>
                </table>
                <div className="flex gap-3 items-center flex-wrap">
                  <button className="bf-btn" data-testid="quote-pdf-btn" onClick={() => pdf(q.id)}>PDF</button>
                  {isOwner && q.status !== "accepted" && q.status !== "declined" && (
                    <>
                      <input className="bf-input" style={{ width: 280 }} placeholder="to email" data-testid="quote-send-email-input" value={sendEmail} onChange={(e) => setSendEmail(e.target.value)} />
                      <button className="bf-btn bf-btn-amber" data-testid="quote-send-btn" onClick={() => send(q.id)}>SEND FOR ACCEPTANCE</button>
                      <button className="bf-btn" data-testid="quote-mark-accepted-btn" onClick={() => markAccepted(q.id)}>MARK ACCEPTED</button>
                    </>
                  )}
                </div>
                {acceptLink && <div className="mono text-xs mt-3 p-3" style={{ background: "#0d1015", border: "1px dashed #f59e0b", color: "#f59e0b" }} data-testid="quote-accept-link">CUSTOMER LINK: {acceptLink}</div>}
                {detail.sends.length > 0 && (
                  <div className="mt-3 space-y-1">{detail.sends.map((s) => (
                    <div key={s.id} className="mono text-xs" style={{ color: "#94a3b8" }}>SENT → {s.to_email} · {s.accepted_at ? "ACCEPTED" : s.revoked_at ? "REVOKED" : "OPEN"} · expires {String(s.expires_at).slice(0, 10)}</div>
                  ))}</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
