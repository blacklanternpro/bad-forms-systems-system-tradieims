import { useEffect, useState } from "react";
import { cc, errMsg } from "@/lib/api";
import { toast } from "sonner";

export default function Directory() {
  const [d, setD] = useState(null);
  const [cForm, setCForm] = useState({ name: "", abn: "", email: "" });
  const [sForm, setSForm] = useState({ client_id: "", name: "", address_text: "" });
  const isOwner = (JSON.parse(localStorage.getItem("bf_user") || "{}").role) === "owner";

  const load = () => cc.get("/directory").then((r) => setD(r.data));
  useEffect(() => { load(); }, []);
  if (!d) return null;

  const addClient = async () => {
    try { await cc.post("/clients", cForm); toast.success("CLIENT ADDED"); setCForm({ name: "", abn: "", email: "" }); load(); }
    catch (e) { toast.error(errMsg(e)); }
  };
  const addSite = async () => {
    try { await cc.post("/sites", sForm); toast.success("SITE ADDED"); setSForm({ client_id: "", name: "", address_text: "" }); load(); }
    catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <div className="bf-enter">
      <div className="mb-8"><div className="bf-label mb-1">CLIENTS · SITES · CREW · VANS</div><h1 className="bf-h1 text-4xl">DIRECTORY</h1></div>
      <div className="grid grid-cols-2 gap-6 bf-stagger">
        <div className="bf-card p-6" data-testid="directory-clients">
          <div className="bf-label mb-3">CLIENTS</div>
          {d.clients.map((c) => (
            <div key={c.id} className="mono text-xs py-2" style={{ borderBottom: "1px solid #1c232e" }}>
              <span style={{ color: "#e7ecf3" }}>{c.name}</span>
              <div style={{ color: "#94a3b8" }}>ABN {c.abn || "—"} · {c.email || "no email"}</div>
            </div>
          ))}
          {isOwner && (
            <div className="flex gap-2 mt-4">
              <input className="bf-input" placeholder="Name" data-testid="client-name-input" value={cForm.name} onChange={(e) => setCForm({ ...cForm, name: e.target.value })} />
              <input className="bf-input" placeholder="ABN" data-testid="client-abn-input" value={cForm.abn} onChange={(e) => setCForm({ ...cForm, abn: e.target.value })} />
              <input className="bf-input" placeholder="Email" data-testid="client-email-input" value={cForm.email} onChange={(e) => setCForm({ ...cForm, email: e.target.value })} />
              <button className="bf-btn" data-testid="client-add-btn" onClick={addClient}>ADD</button>
            </div>
          )}
        </div>
        <div className="bf-card p-6" data-testid="directory-sites">
          <div className="bf-label mb-3">SITES</div>
          {d.sites.map((s) => (
            <div key={s.id} className="mono text-xs py-2" style={{ borderBottom: "1px solid #1c232e" }}>
              <span style={{ color: "#e7ecf3" }}>{s.name}</span><div style={{ color: "#94a3b8" }}>{s.address_text}</div>
            </div>
          ))}
          {isOwner && (
            <div className="flex gap-2 mt-4">
              <select className="bf-input" data-testid="site-client-select" value={sForm.client_id} onChange={(e) => setSForm({ ...sForm, client_id: e.target.value })}>
                <option value="">— client —</option>{d.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input className="bf-input" placeholder="Site name" data-testid="site-name-input" value={sForm.name} onChange={(e) => setSForm({ ...sForm, name: e.target.value })} />
              <input className="bf-input" placeholder="Address" data-testid="site-address-input" value={sForm.address_text} onChange={(e) => setSForm({ ...sForm, address_text: e.target.value })} />
              <button className="bf-btn" data-testid="site-add-btn" onClick={addSite} disabled={!sForm.client_id}>ADD</button>
            </div>
          )}
        </div>
        <div className="bf-card p-6" data-testid="directory-users">
          <div className="bf-label mb-3">PEOPLE</div>
          {d.users.map((u) => (
            <div key={u.id} className="flex justify-between mono text-xs py-2" style={{ borderBottom: "1px solid #1c232e" }}>
              <span>{u.name} <span style={{ color: "#94a3b8" }}>{u.email || "PIN ONLY"}</span></span>
              <span className={`bf-chip ${u.role === "owner" ? "chip-amber" : u.role === "crew" ? "chip-steel" : "chip-green"}`}>{u.role.toUpperCase()}</span>
            </div>
          ))}
        </div>
        <div className="bf-card p-6" data-testid="directory-assets">
          <div className="bf-label mb-3">VANS</div>
          {d.assets.map((a) => (
            <div key={a.id} className="flex justify-between mono text-xs py-2" style={{ borderBottom: "1px solid #1c232e" }}>
              <span>{a.name}</span><span style={{ color: "#f59e0b" }}>{a.code}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
