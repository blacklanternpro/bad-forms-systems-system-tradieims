import { useState } from "react";
import { api, getSession, setSession, type OrgAdmin, type OrgBrand, type OrgUser } from "../api";
import Button from "../components/Button";
import { THEMES, applyBrand, applyTheme, type ThemeName } from "../components/Chrome";
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
    return <EmptyView title="OWNER ONLY" hint="The admin desk is limited to the yard owner's login." testId="admin-locked" />;
  }
  if (org.loading || users.loading) return <LoadingView label="OPENING THE ADMIN DESK" />;
  if (org.error) return <ErrorView message={org.error} onRetry={org.reload} />;
  if (users.error) return <ErrorView message={users.error} onRetry={users.reload} />;
  if (!org.data || !users.data) return <EmptyView title="NOTHING TO ADMINISTER" />;

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
        <h2 id="org-h" className="bf-label">YARD</h2>
        <p style={{ margin: "8px 0 2px", fontSize: 16, fontWeight: 600 }}>{o.name}</p>
        <p className="bf-mono" style={{ fontSize: 13, color: "var(--ink-mute)", margin: 0 }}>
          {o.legal_name ?? "—"} · ABN {o.abn ?? "—"} · yard code <strong>{o.slug}</strong>
        </p>

        <h3 className="bf-label" style={{ marginTop: 22 }}>LOOK</h3>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {THEMES.map((t) => (
            <Button key={t} kind={o.theme === t ? "mark" : "quiet"} disabled={act.busy} onClick={() => setTheme(t)} testId={`theme-${t}`}>
              {t}
            </Button>
          ))}
        </div>

        <h3 className="bf-label" style={{ marginTop: 22 }}>BRAND</h3>
        <label className="bf-label" style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0 10px" }}>
          MARK COLOUR
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
        <Field label="LETTERHEAD LINE (PDFS + PUBLIC PAGES)" value={letterhead} onChange={setLetterhead} testId="brand-letterhead" />
        <Button kind="quiet" disabled={act.busy} onClick={saveBrand} testId="brand-save">
          {act.busy ? "SAVING…" : "SAVE BRAND"}
        </Button>

        <h3 className="bf-label" style={{ marginTop: 22 }}>LEDGER</h3>
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
              CONNECT {p.toUpperCase()}
            </Button>
          ))}
        </div>
        <p style={{ fontSize: 12, color: "var(--ink-mute)", marginTop: 8 }}>
          Invoices and verified receipts go to the ledger as <strong>drafts only</strong>; statuses sync back.
        </p>

        <h3 className="bf-label" style={{ marginTop: 22 }}>DATA</h3>
        <a className="bf-label" href="/api/org/export" target="_blank" rel="noreferrer" data-testid="export-link">
          EXPORT EVERY ROW (JSON) ↗
        </a>
      </section>

      <section aria-labelledby="people-h">
        <div style={{ display: "flex", alignItems: "center" }}>
          <h2 id="people-h" className="bf-label" style={{ margin: 0 }}>PEOPLE</h2>
          <span style={{ marginLeft: "auto" }}>
            <Button kind="mark" onClick={() => setAddUser(true)} testId="add-user">ADD PERSON</Button>
          </span>
        </div>
        <LedgerTable<OrgUser>
          testId="users-table"
          rows={users.data}
          rowKey={(u) => u.id}
          empty="NO USERS"
          columns={[
            { key: "name", label: "NAME", render: (u) => u.name },
            { key: "role", label: "ROLE", render: (u) => <Stamp label={u.role.toUpperCase()} tone={u.role === "owner" ? "info" : "mute"} /> },
            { key: "login", label: "LOGIN", render: (u) => <span className="bf-mono" style={{ fontSize: 12 }}>{u.email ?? (u.pin ? `PIN ${u.pin}` : "—")}</span> },
            { key: "active", label: "STATUS", render: (u) => <Stamp label={u.active ? "ACTIVE" : "OFF"} tone={u.active ? "ok" : "mute"} /> },
          ]}
        />
      </section>

      <Sheet title="ADD PERSON" open={addUser} onClose={() => setAddUser(false)} testId="add-user-sheet">
        <Field label="NAME" value={uName} onChange={setUName} required testId="user-name" />
        <label className="bf-label" style={{ display: "block", marginBottom: 12 }}>
          ROLE
          <select value={uRole} onChange={(e) => setURole(e.target.value)} data-testid="user-role" style={{ display: "block", width: "100%", marginTop: 4 }}>
            <option value="crew">crew (PIN login)</option>
            <option value="office">office (email login)</option>
            <option value="owner">owner (email login)</option>
          </select>
        </label>
        {uRole !== "crew" && <Field label="EMAIL" type="email" value={uEmail} onChange={setUEmail} required testId="user-email" />}
        <Field
          label={uRole === "crew" ? "4-DIGIT PIN" : "PASSWORD"}
          type={uRole === "crew" ? "text" : "password"}
          value={uSecret}
          onChange={setUSecret}
          required
          testId="user-secret"
        />
        <Button kind="mark" full disabled={act.busy || !uName.trim() || !uSecret.trim()} onClick={createUser} testId="user-create">
          {act.busy ? "ADDING…" : "ADD"}
        </Button>
      </Sheet>
    </div>
  );
}
