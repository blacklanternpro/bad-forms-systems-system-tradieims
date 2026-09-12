import { useEffect, useState } from "react";
import { api, clearDemo, getSession, getVirginToken, setSession, subscribeVirgin, type OrgAdmin, type OrgBrand, type OrgUser } from "../api";
import Button from "../components/Button";
import { Chip, THEMES, applyBrand, applyTheme, type ThemeName } from "../components/Chrome";
import Field from "../components/Field";
import LedgerTable from "../components/LedgerTable";
import Sheet from "../components/Sheet";
import Stamp from "../components/Stamp";
import { EmptyView, ErrorView, LoadingView } from "../components/StatusViews";
import { useAction, useLoad } from "../hooks";

const LEDGERS = ["xero", "myob", "xero-mock"] as const;

/** Yard admin: identity, theme, ledger connection, people, data export.
    Owner-only; office staff see a locked notice. */
export default function Admin() {
  const s = getSession();
  const isOwner = s?.user.role === "owner";
  const [virgin, setVirgin] = useState(!!getVirginToken());
  useEffect(() => subscribeVirgin(() => setVirgin(!!getVirginToken())), []);
  const org = useLoad(() => api<OrgAdmin>("/org/admin"), []);
  const users = useLoad(() => api<OrgUser[]>("/org/users"), []);
  const act = useAction();
  const [addUser, setAddUser] = useState(false);
  const [uName, setUName] = useState("");
  const [uEmail, setUEmail] = useState("");
  const [uRole, setURole] = useState("crew");
  const [uSecret, setUSecret] = useState("");
  const [brandColour, setBrandColour] = useState(s?.org.brand?.colour ?? "#1f4d3a");
  const [letterhead, setLetterhead] = useState(s?.org.brand?.letterhead_line ?? "");

  if (!isOwner) {
    return <EmptyView title="Owner only" hint="The admin desk is limited to the yard owner's login." testId="admin-locked" />;
  }
  if (org.loading || users.loading) return <LoadingView label="Opening admin" />;
  if (org.error) return <ErrorView message={org.error} onRetry={org.reload} />;
  if (users.error) return <ErrorView message={users.error} onRetry={users.reload} />;
  if (!org.data || !users.data) return <EmptyView title="Nothing to administer" />;

  const o = org.data;
  const ledger = o.settings.ledger;

  const setTheme = (t: ThemeName) =>
    void act.run(async () => {
      await api("/org", { method: "PATCH", body: { theme: t } });
      applyTheme(t);
      org.reload();
    });

  const saveBrand = () =>
    void act.run(async () => {
      const brand: OrgBrand = {
        colour: brandColour,
        letterhead_line: letterhead.trim() || undefined,
        tokens: { "--mark": brandColour },
      };
      await api("/org", { method: "PATCH", body: { brand } });
      applyBrand(brand.tokens);
      const sess = getSession();
      if (sess) setSession({ ...sess, org: { ...sess.org, brand } });
      org.reload();
    });

  const connect = (provider: string) =>
    void act.run(async () => {
      await api("/org/ledger/connect", { body: { provider } });
      org.reload();
    });

  const createUser = () =>
    void act.run(async () => {
      await api("/org/users", {
        body: {
          name: uName,
          role: uRole,
          email: uRole === "crew" ? null : uEmail,
          password: uRole === "crew" ? null : uSecret,
          pin: uRole === "crew" ? uSecret : null,
        },
      });
      setAddUser(false);
      setUName("");
      setUEmail("");
      setUSecret("");
      users.reload();
    });

  return (
    <div style={{ display: "grid", gap: 28, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
      {act.error && <ErrorView message={act.error} />}

      <section aria-labelledby="org-h">
        <h2 id="org-h" className="bf-h2" style={{ fontSize: 20 }}>
          Yard
        </h2>
        <p style={{ margin: "8px 0 2px", fontSize: 16, fontWeight: 600 }}>{o.name}</p>
        <p className="bf-mono" style={{ fontSize: 13, color: "var(--ink-mute)", margin: 0 }}>
          {o.legal_name ?? "—"} · ABN {o.abn ?? "—"} · yard code <strong>{o.slug}</strong>
        </p>

        <h3 className="bf-h3" style={{ marginTop: 22 }}>Look</h3>
        <div className="bf-chip-row" style={{ marginTop: 8 }}>
          {THEMES.map((t) => (
            <Chip
              key={t}
              testId={`theme-${t}`}
              active={o.theme === t}
              onClick={() => setTheme(t)}
              label={t.replace(/-/g, " ")}
            />
          ))}
        </div>

        <h3 className="bf-h3" style={{ marginTop: 22 }}>Brand</h3>
        <label className="bf-label" style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0 10px" }}>
          Mark colour
          <input
            type="color"
            aria-label="Brand mark colour"
            data-testid="brand-colour"
            value={brandColour}
            onChange={(e) => setBrandColour(e.target.value)}
            style={{ width: 54, height: 34, padding: 2, cursor: "pointer" }}
          />
          <span className="bf-mono" style={{ fontSize: 12 }}>{brandColour}</span>
        </label>
        <Field label="Letterhead line (PDFs + public pages)" value={letterhead} onChange={setLetterhead} testId="brand-letterhead" />
        <Button kind="quiet" disabled={act.busy} onClick={saveBrand} testId="brand-save">
          {act.busy ? "Saving…" : "Save brand"}
        </Button>

        <h3 className="bf-h3" style={{ marginTop: 22 }}>Ledger</h3>
        <p style={{ margin: "6px 0 10px" }}>
          {ledger ? (
            <Stamp label={`${ledger.provider.toUpperCase()} CONNECTED`} tone="ok" testId="ledger-status" />
          ) : (
            <Stamp label="NOT CONNECTED" tone="warn" testId="ledger-status" />
          )}
        </p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {LEDGERS.map((p) => (
            <Button key={p} kind="quiet" disabled={act.busy} onClick={() => connect(p)} testId={`connect-${p}`}>
              Connect {p}
            </Button>
          ))}
        </div>
        <p style={{ fontSize: 12, color: "var(--ink-mute)", marginTop: 8 }}>
          Invoices and verified receipts go to the ledger as <strong>drafts only</strong>; statuses sync back.
        </p>

        <h3 className="bf-h3" style={{ marginTop: 22 }}>Data</h3>
        <a className="bf-label" href="/api/org/export" target="_blank" rel="noreferrer" data-testid="export-link">
          Export every row (JSON) ↗
        </a>
        {s?.org.is_demo && (
          <div style={{ marginTop: 14 }}>
            <Button
              kind="quiet"
              disabled={act.busy || virgin}
              testId="clear-demo"
              onClick={() => {
                if (!window.confirm("Empties this demo for this tab until you reload. The database is not wiped.")) return;
                void act.run(async () => { await clearDemo(); });
              }}
            >
              {getVirginToken() ? "Demo cleared — reload to restore" : "Clear demo (this tab)"}
            </Button>
            <p style={{ fontSize: 12, color: "var(--ink-mute)", marginTop: 6 }}>
              Break-glass: empties jobs, quotes, pack registers and desk bait for this browser tab. Reload restores the seed.
            </p>
          </div>
        )}
      </section>

      <section aria-labelledby="people-h">
        <div style={{ display: "flex", alignItems: "center" }}>
          <h2 id="people-h" className="bf-h2" style={{ margin: 0, fontSize: 20 }}>
            People
          </h2>
          <span style={{ marginLeft: "auto" }}>
            <Button kind="mark" onClick={() => setAddUser(true)} testId="add-user">
              Add person
            </Button>
          </span>
        </div>
        <LedgerTable<OrgUser>
          testId="users-table"
          rows={users.data}
          rowKey={(u) => u.id}
          empty="No users"
          columns={[
            { key: "name", label: "Name", render: (u) => u.name },
            { key: "role", label: "Role", render: (u) => <Stamp label={u.role} tone={u.role === "owner" ? "info" : "mute"} /> },
            { key: "login", label: "Login", render: (u) => <span className="bf-mono" style={{ fontSize: 12 }}>{u.email ?? (u.pin ? `PIN ${u.pin}` : "—")}</span> },
            { key: "active", label: "Status", render: (u) => <Stamp label={u.active ? "Active" : "Off"} tone={u.active ? "ok" : "mute"} /> },
          ]}
        />
      </section>

      <Sheet title="Add person" open={addUser} onClose={() => setAddUser(false)} testId="add-user-sheet">
        <Field label="Name" value={uName} onChange={setUName} required testId="user-name" />
        <label className="bf-label" style={{ display: "block", marginBottom: 12 }}>
          Role
          <select value={uRole} onChange={(e) => setURole(e.target.value)} data-testid="user-role" style={{ display: "block", width: "100%", marginTop: 4 }}>
            <option value="crew">crew (PIN login)</option>
            <option value="office">office (email login)</option>
            <option value="owner">owner (email login)</option>
          </select>
        </label>
        {uRole !== "crew" && <Field label="Email" type="email" value={uEmail} onChange={setUEmail} required testId="user-email" />}
        <Field
          label={uRole === "crew" ? "4-digit PIN" : "Password"}
          type={uRole === "crew" ? "text" : "password"}
          value={uSecret}
          onChange={setUSecret}
          required
          testId="user-secret"
        />
        <Button kind="mark" full disabled={act.busy || !uName.trim() || !uSecret.trim()} onClick={createUser} testId="user-create">
          {act.busy ? "Adding…" : "Add"}
        </Button>
      </Sheet>
    </div>
  );
}
