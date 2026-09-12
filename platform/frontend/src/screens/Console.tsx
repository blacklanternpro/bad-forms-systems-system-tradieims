import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  platformApi,
  setSession,
  type FoundryMenu,
  type FoundryResult,
  type InstanceRow,
  type Session,
} from "../api";
import Button from "../components/Button";
import Field from "../components/Field";
import LedgerTable from "../components/LedgerTable";
import Sheet from "../components/Sheet";
import Stamp from "../components/Stamp";
import { EmptyView, ErrorView, LoadingView } from "../components/StatusViews";
import { useAction, useLoad } from "../hooks";

const KEY_STORE = "bf_staff_key";
type Tab = "instances" | "foundry" | "import";

const TAB_LABELS: Record<Tab, string> = { instances: "INSTANCES", foundry: "THE FOUNDRY", import: "IMPORTERS" };

interface KeyGateProps {
  onUnlocked: (key: string) => void;
}

function KeyGate({ onUnlocked }: KeyGateProps) {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const unlock = async () => {
    setBusy(true);
    setError(null);
    try {
      await platformApi<InstanceRow[]>(key, "/instances");
      localStorage.setItem(KEY_STORE, key);
      onUnlocked(key);
    } catch {
      setError("Key not accepted");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bf-page" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <h1 className="bf-h1" style={{ fontSize: 20, marginBottom: 4 }}>BAD FORM SYSTEMS</h1>
        <p className="bf-label" style={{ marginBottom: 20 }}>PLATFORM CONSOLE — STAFF ONLY</p>
        <Field label="STAFF KEY" type="password" value={key} onChange={setKey} required testId="staff-key" />
        {error && <ErrorView message={error} />}
        <Button kind="mark" full disabled={busy || !key.trim()} onClick={() => void unlock()} testId="staff-unlock">
          {busy ? "CHECKING…" : "UNLOCK"}
        </Button>
      </div>
    </div>
  );
}

interface ConsoleBodyProps {
  staffKey: string;
  onLock: () => void;
}

function ConsoleBody({ staffKey, onLock }: ConsoleBodyProps) {
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>("instances");
  const instances = useLoad(() => platformApi<InstanceRow[]>(staffKey, "/instances"));
  const menu = useLoad(() => platformApi<FoundryMenu>(staffKey, "/menu"));
  const act = useAction();

  const [aiFor, setAiFor] = useState<InstanceRow | null>(null);
  const [aiChain, setAiChain] = useState("");
  const [aiBudget, setAiBudget] = useState("");
  const [aiReceipt, setAiReceipt] = useState("");

  const [trading, setTrading] = useState("");
  const [legal, setLegal] = useState("");
  const [abn, setAbn] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [colour, setColour] = useState("#1f4d3a");
  const [theme, setTheme] = useState("daybook");
  const [yardsCsv, setYardsCsv] = useState("");
  const [jobWord, setJobWord] = useState("");
  const [sectors, setSectors] = useState<string[]>([]);
  const [pilot, setPilot] = useState(false);
  const [built, setBuilt] = useState<FoundryResult | null>(null);

  const [importSlug, setImportSlug] = useState("");
  const [importResult, setImportResult] = useState<string | null>(null);
  const clientsFile = useRef<HTMLInputElement>(null);
  const jobsFile = useRef<HTMLInputElement>(null);

  const impersonate = (slug: string) =>
    void act.run(async () => {
      const s = await platformApi<Session>(staffKey, `/instances/${slug}/impersonate`, { method: "POST" });
      setSession(s);
      nav("/desk");
    });

  const saveAi = () =>
    void act.run(async () => {
      if (!aiFor) return;
      const body: Record<string, unknown> = {};
      if (aiChain.trim()) body.chain = aiChain.split(",").map((x) => x.trim()).filter(Boolean);
      if (aiBudget.trim()) body.budget_cents = Math.round((parseFloat(aiBudget) || 0) * 100);
      if (aiReceipt.trim()) body.thresholds = { receipt: parseFloat(aiReceipt) };
      await platformApi(staffKey, `/instances/${aiFor.slug}/ai`, { method: "PATCH", body });
      setAiFor(null);
      instances.reload();
    });

  const build = () =>
    void act.run(async () => {
      const res = await platformApi<FoundryResult>(staffKey, "/foundry", {
        body: {
          trading_name: trading.trim(),
          legal_name: legal.trim() || null,
          abn: abn.trim() || null,
          brand_colour: colour,
          sectors,
          terminology: jobWord.trim() ? { job: jobWord.trim() } : {},
          yards: yardsCsv.split(",").map((y) => y.trim()).filter(Boolean),
          owner_name: ownerName.trim(),
          owner_email: ownerEmail.trim(),
          theme,
          pilot,
        },
      });
      setBuilt(res);
      instances.reload();
    });

  const runImport = (kind: "clients" | "jobs") =>
    void act.run(async () => {
      const ref = kind === "clients" ? clientsFile : jobsFile;
      const f = ref.current?.files?.[0];
      if (!importSlug || !f) return;
      const form = new FormData();
      form.set("file", f);
      const res = await platformApi<{ imported: number; skipped: number }>(
        staffKey, `/instances/${importSlug}/import/${kind}`, { form },
      );
      setImportResult(`${kind.toUpperCase()}: ${res.imported} imported, ${res.skipped} skipped`);
      if (ref.current) ref.current.value = "";
      instances.reload();
    });

  const toggleSector = (s: string) =>
    setSectors((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  return (
    <div className="bf-page">
      <header style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "8px 20px", borderBottom: "2px solid var(--ink)", paddingBottom: 12 }}>
        <h1 className="bf-h1" style={{ fontSize: 20 }}>PLATFORM CONSOLE</h1>
        <span className="bf-label">BAD FORM STAFF — EVERY ACTION AUDITED</span>
        <button
          className="bf-label"
          data-testid="console-lock"
          onClick={() => {
            localStorage.removeItem(KEY_STORE);
            onLock();
          }}
          style={{ marginLeft: "auto", background: "none", border: "1px solid var(--rule-strong)", borderRadius: "var(--radius)", padding: "8px 12px", cursor: "pointer", minHeight: "var(--tap-min)" }}
        >
          LOCK
        </button>
      </header>

      <div role="tablist" aria-label="Console" style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "14px 0 18px" }}>
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            data-testid={`console-tab-${t}`}
            className="bf-label"
            onClick={() => setTab(t)}
            style={{
              padding: "10px 16px",
              minHeight: "var(--tap-min)",
              cursor: "pointer",
              background: tab === t ? "var(--mark)" : "transparent",
              color: tab === t ? "var(--mark-ink)" : "var(--ink-mute)",
              border: "1px solid var(--rule-strong)",
              borderRadius: "var(--radius)",
            }}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>
      {act.error && <ErrorView message={act.error} />}

      {tab === "instances" && (
        <>
          {instances.loading && <LoadingView label="PULLING THE FLEET" />}
          {instances.error && <ErrorView message={instances.error} onRetry={instances.reload} />}
          {instances.data && instances.data.length === 0 && <EmptyView title="NO INSTANCES YET" hint="Build the first one in the Foundry." />}
          {instances.data && instances.data.length > 0 && (
            <LedgerTable<InstanceRow>
              testId="instances-table"
              rows={instances.data}
              rowKey={(i) => i.id}
              empty="NO INSTANCES"
              columns={[
                { key: "slug", label: "INSTANCE", render: (i) => <span className="bf-mono">{i.slug}</span> },
                { key: "name", label: "CLIENT", render: (i) => i.name },
                {
                  key: "modules",
                  label: "MODULES",
                  render: (i) => Object.keys(i.modules).filter((m) => m !== "kernel").join(" · ") || "kernel only",
                },
                {
                  key: "mode",
                  label: "MODE",
                  render: (i) => (i.pilot ? <Stamp label="PILOT" tone="warn" /> : i.is_demo ? <Stamp label="DEMO" tone="info" /> : <Stamp label="LIVE" tone="ok" />),
                },
                {
                  key: "ledger",
                  label: "LEDGER",
                  render: (i) => (i.ledger ? <Stamp label={`${i.ledger.toUpperCase()}${i.ledger_connected ? "" : " (OFF)"}`} tone={i.ledger_connected ? "ok" : "mute"} /> : <Stamp label="NONE" tone="mute" />),
                },
                { key: "queue", label: "REVIEW Q", align: "right", render: (i) => String(i.review_queue) },
                {
                  key: "acc",
                  label: "EXTRACT ACC",
                  align: "right",
                  render: (i) => (i.extraction_accuracy === null ? "—" : `${(i.extraction_accuracy * 100).toFixed(1)}%`),
                },
                { key: "jobs", label: "JOBS", align: "right", render: (i) => String(i.jobs) },
                {
                  key: "act",
                  label: "",
                  align: "right",
                  render: (i) => (
                    <span style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <Button kind="quiet" disabled={act.busy} onClick={() => { setAiFor(i); setAiChain((i.ai.chain ?? []).join(", ")); setAiBudget(i.ai.budget_cents ? String(i.ai.budget_cents / 100) : ""); setAiReceipt(i.ai.thresholds?.receipt !== undefined ? String(i.ai.thresholds.receipt) : ""); }} testId={`ai-${i.slug}`}>
                        AI
                      </Button>
                      <Button kind="accent" disabled={act.busy} onClick={() => impersonate(i.slug)} testId={`impersonate-${i.slug}`}>
                        IMPERSONATE
                      </Button>
                    </span>
                  ),
                },
              ]}
            />
          )}
        </>
      )}

      {tab === "foundry" && (
        <div style={{ display: "grid", gap: 28, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
          <section aria-labelledby="intake-h">
            <h2 id="intake-h" className="bf-label">1 · CLIENT INTAKE — ENTERED ONCE, IMPRINTED EVERYWHERE</h2>
            <div style={{ marginTop: 10 }}>
              <Field label="TRADING NAME" value={trading} onChange={setTrading} required testId="foundry-trading" />
              <Field label="LEGAL NAME" value={legal} onChange={setLegal} testId="foundry-legal" />
              <Field label="ABN" value={abn} onChange={setAbn} testId="foundry-abn" />
              <Field label="OWNER NAME" value={ownerName} onChange={setOwnerName} required testId="foundry-owner" />
              <Field label="OWNER EMAIL" type="email" value={ownerEmail} onChange={setOwnerEmail} required testId="foundry-email" />
              <Field label="YARDS / DEPOTS (COMMA SEPARATED)" value={yardsCsv} onChange={setYardsCsv} placeholder="Bunbury yard, Picton depot" testId="foundry-yards" />
              <Field label='THEIR WORD FOR "JOB" (OPTIONAL)' value={jobWord} onChange={setJobWord} placeholder="pour / callout / work order" testId="foundry-jobword" />
              <label className="bf-label" style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0 12px" }}>
                BRAND COLOUR
                <input type="color" aria-label="Brand colour" data-testid="foundry-colour" value={colour} onChange={(e) => setColour(e.target.value)} style={{ width: 54, height: 34, padding: 2, cursor: "pointer" }} />
                <span className="bf-mono" style={{ fontSize: 12 }}>{colour}</span>
              </label>
              <label className="bf-label" style={{ display: "block", marginBottom: 12 }}>
                STARTER THEME
                <select data-testid="foundry-theme" value={theme} onChange={(e) => setTheme(e.target.value)} style={{ display: "block", width: "100%", marginTop: 4 }}>
                  {(menu.data?.themes ?? ["daybook"]).map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section aria-labelledby="menu-h">
            <h2 id="menu-h" className="bf-label">2 · THE MENU — WHAT THE GALLERY DEMOS IS WHAT GETS TICKED</h2>
            {menu.loading && <LoadingView label="OPENING THE CATALOGUE" />}
            {menu.error && <ErrorView message={menu.error} onRetry={menu.reload} />}
            {menu.data && (
              <ul style={{ margin: "10px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
                {Object.entries(menu.data.catalogue).map(([key, pack]) => (
                  <li key={key} style={{ border: "1px solid var(--rule-strong)", borderRadius: "var(--radius)", padding: "12px 14px", background: "var(--ground-raise)" }}>
                    <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: key === "kernel" ? "default" : "pointer" }}>
                      <input
                        type="checkbox"
                        data-testid={`tick-${key}`}
                        checked={key === "kernel" || sectors.includes(key)}
                        disabled={key === "kernel" || pilot}
                        onChange={() => toggleSector(key)}
                        style={{ marginTop: 3, width: 18, height: 18 }}
                      />
                      <span>
                        <strong style={{ fontSize: 14 }}>{pack.label}</strong>
                        <span style={{ display: "block", fontSize: 13, color: "var(--ink-mute)" }}>{pack.blurb}</span>
                        <span className="bf-mono" style={{ display: "block", fontSize: 11, color: "var(--ink-mute)", marginTop: 4 }}>
                          {pack.bundle.join(" · ")}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <label className="bf-label" style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14, cursor: "pointer" }}>
              <input type="checkbox" data-testid="foundry-pilot" checked={pilot} onChange={() => setPilot(!pilot)} style={{ width: 18, height: 18 }} />
              PILOT MODE — CAPTURE PIPELINE ONLY (THE $2.5K TIER)
            </label>
            <div style={{ marginTop: 16 }}>
              <Button kind="mark" full disabled={act.busy || !trading.trim() || !ownerName.trim() || !ownerEmail.trim()} onClick={build} testId="foundry-build">
                {act.busy ? "FORGING…" : "3 · BUILD THE INSTANCE"}
              </Button>
            </div>
          </section>

          <section aria-labelledby="out-h">
            <h2 id="out-h" className="bf-label">OUTPUT — CLIENT.JSON + CREDENTIALS</h2>
            {!built ? (
              <EmptyView title="NOTHING FORGED YET" hint="Fill the intake, tick the menu, hit build. The manifest lands here." />
            ) : (
              <div style={{ marginTop: 10 }}>
                <Stamp label="INSTANCE LIVE" tone="ok" testId="foundry-done" />
                <dl style={{ margin: "12px 0", fontSize: 13 }}>
                  {[
                    ["OWNER LOGIN", built.credentials.owner_email],
                    ["OWNER PASSWORD", built.credentials.owner_password],
                    ["CREW PIN", built.credentials.crew_pin],
                  ].map(([k, v]) => (
                    <div key={k} style={{ display: "flex", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--rule)" }}>
                      <dt className="bf-label" style={{ minWidth: 140 }}>{k}</dt>
                      <dd className="bf-mono" style={{ margin: 0 }} data-testid={`cred-${k}`}>{v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="bf-label" style={{ margin: "14px 0 6px" }}>CLIENT.JSON — COMMIT THIS</p>
                <pre
                  data-testid="foundry-manifest"
                  style={{ background: "var(--ground-raise)", border: "1px solid var(--rule-strong)", borderRadius: "var(--radius)", padding: 12, fontSize: 12, overflowX: "auto" }}
                >
                  {JSON.stringify(built.manifest, null, 2)}
                </pre>
              </div>
            )}
          </section>
        </div>
      )}

      {tab === "import" && (
        <div style={{ maxWidth: 560 }}>
          <h2 className="bf-label">ONBOARDING IMPORTERS — REAL DATA IN DAYS, NOT MONTHS</h2>
          <label className="bf-label" style={{ display: "block", margin: "12px 0" }}>
            INSTANCE
            <select data-testid="import-slug" value={importSlug} onChange={(e) => setImportSlug(e.target.value)} style={{ display: "block", width: "100%", marginTop: 4 }}>
              <option value="">— PICK AN INSTANCE —</option>
              {(instances.data ?? []).map((i) => (
                <option key={i.id} value={i.slug}>{i.slug} — {i.name}</option>
              ))}
            </select>
          </label>
          <label className="bf-label" style={{ display: "block", marginBottom: 12 }}>
            CLIENTS CSV (name, contact_name, email, phone — XERO CONTACTS EXPORT SHAPE)
            <input ref={clientsFile} type="file" accept=".csv,text/csv" data-testid="import-clients-file" style={{ display: "block", marginTop: 4 }} />
          </label>
          <Button kind="quiet" disabled={act.busy || !importSlug} onClick={() => runImport("clients")} testId="import-clients-run">
            IMPORT CLIENTS
          </Button>
          <label className="bf-label" style={{ display: "block", margin: "18px 0 12px" }}>
            JOB HISTORY CSV (code, title, status, client, quoted_dollars)
            <input ref={jobsFile} type="file" accept=".csv,text/csv" data-testid="import-jobs-file" style={{ display: "block", marginTop: 4 }} />
          </label>
          <Button kind="quiet" disabled={act.busy || !importSlug} onClick={() => runImport("jobs")} testId="import-jobs-run">
            IMPORT JOBS
          </Button>
          <p className="bf-mono" style={{ fontSize: 13, marginTop: 14 }} data-testid="import-result">
            {importResult ?? "Price books import from inside each instance (ADMIN → price books)."}
          </p>
        </div>
      )}

      <Sheet title={aiFor ? `AI — ${aiFor.name}` : ""} open={aiFor !== null} onClose={() => setAiFor(null)} testId="ai-sheet">
        {aiFor && (
          <div>
            <Field label="PROVIDER CHAIN (COMMA SEPARATED, FIRST = PRIMARY)" value={aiChain} onChange={setAiChain} placeholder="primary-a, fallback-b" testId="ai-chain" />
            <Field label="MONTHLY BUDGET CAP ($)" type="number" value={aiBudget} onChange={setAiBudget} testId="ai-budget" />
            <Field label="RECEIPT CONFIDENCE THRESHOLD (0–1)" type="number" value={aiReceipt} onChange={setAiReceipt} placeholder="0.80" testId="ai-receipt" />
            {act.error && <ErrorView message={act.error} />}
            <Button kind="mark" full disabled={act.busy} onClick={saveAi} testId="ai-save">
              {act.busy ? "SAVING…" : "SAVE AI CONFIG"}
            </Button>
          </div>
        )}
      </Sheet>
    </div>
  );
}

/** /console — the god-mode surface. Key-gated, separate from every client login. */
export default function Console() {
  const [key, setKey] = useState<string | null>(localStorage.getItem(KEY_STORE));
  if (!key) return <KeyGate onUnlocked={setKey} />;
  return <ConsoleBody staffKey={key} onLock={() => setKey(null)} />;
}
