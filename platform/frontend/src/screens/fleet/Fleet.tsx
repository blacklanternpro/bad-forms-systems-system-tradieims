import { useState } from "react";
import {
  api,
  money,
  type CorrectiveActionRow,
  type EvidenceVault,
  type FleetAsset,
  type FloatRow,
  type WorkshopQueue,
} from "../../api";
import Button from "../../components/Button";
import { Chip } from "../../components/Chrome";
import Field from "../../components/Field";
import LedgerTable from "../../components/LedgerTable";
import Sheet from "../../components/Sheet";
import Stamp, { type StampTone } from "../../components/Stamp";
import { EmptyView, ErrorView, LoadingView } from "../../components/StatusViews";
import { useAction, useLoad } from "../../hooks";
import { JobSelect } from "../fab/Shop";

type Tab = "register" | "workshop" | "floats" | "evidence";

const TAB_LABELS: Record<Tab, string> = {
  register: "Register",
  workshop: "Workshop",
  floats: "Floats",
  evidence: "SMS evidence",
};

const FLOAT_TONE: Record<FloatRow["status"], StampTone> = { planned: "info", completed: "ok", cancelled: "mute" };
const SOURCE_LABEL: Record<string, string> = {
  vault: "Vault",
  prestarts: "PRE-START",
  workshop: "Workshop",
  corrective_actions: "Corrective",
};

interface AssetSelectProps {
  label: string;
  assets: FleetAsset[];
  value: string;
  onChange: (v: string) => void;
  testId?: string;
}

function AssetSelect({ label, assets, value, onChange, testId }: AssetSelectProps) {
  return (
    <label className="bf-label" style={{ display: "block", marginBottom: 12 }}>
      {label}
      <select data-testid={testId} value={value} onChange={(e) => onChange(e.target.value)} style={{ display: "block", width: "100%", marginTop: 4 }}>
        <option value="">— Pick a machine —</option>
        {assets.map((a) => (
          <option key={a.id} value={a.id}>
            {a.meta.code ?? "—"} — {a.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function serviceStamp(a: FleetAsset) {
  if (a.hours_to_service === null) return <Stamp label="No plan" tone="mute" />;
  const left = Number(a.hours_to_service);
  if (left <= 0) return <Stamp label={`SERVICE DUE (${Math.abs(left).toFixed(0)}h over)`} tone="bad" />;
  if (left <= 50) return <Stamp label={`DUE IN ${left.toFixed(0)}h`} tone="warn" />;
  return <Stamp label={`IN ${left.toFixed(0)}h`} tone="ok" />;
}

/** Fleet desk: the register across depots, what the workshop owes, floats
    with mobilisation charging, and the CoR/SMS evidence vault. */
export default function Fleet() {
  const [tab, setTab] = useState<Tab>("register");
  const [yard, setYard] = useState("");
  const yards = useLoad(() => api<string[]>("/fleet/yards"));
  const assets = useLoad(() => api<FleetAsset[]>(`/fleet/assets${yard ? `?yard=${encodeURIComponent(yard)}` : ""}`), [yard]);
  const allAssets = useLoad(() => api<FleetAsset[]>("/fleet/assets"));
  const workshop = useLoad(() => api<WorkshopQueue>("/fleet/workshop"));
  const floats = useLoad(() => api<FloatRow[]>("/fleet/floats"));
  const [outcome, setOutcome] = useState("");
  const vault = useLoad(() => api<EvidenceVault>(`/fleet/evidence${outcome ? `?outcome=${outcome}` : ""}`), [outcome]);
  const act = useAction();

  const [assetOpen, setAssetOpen] = useState(false);
  const [aCode, setACode] = useState("");
  const [aName, setAName] = useState("");
  const [aKind, setAKind] = useState("truck");
  const [aRego, setARego] = useState("");
  const [aYard, setAYard] = useState("");

  const [servicing, setServicing] = useState<{ plan_id: string; label: string } | null>(null);
  const [serviceNotes, setServiceNotes] = useState("");

  const [caOpen, setCaOpen] = useState(false);
  const [caTitle, setCaTitle] = useState("");
  const [caDetail, setCaDetail] = useState("");
  const [caSource, setCaSource] = useState<CorrectiveActionRow["source"]>("manual");
  const [caAsset, setCaAsset] = useState("");
  const [closing, setClosing] = useState<CorrectiveActionRow | null>(null);
  const [closeNote, setCloseNote] = useState("");

  const [floatOpen, setFloatOpen] = useState(false);
  const [fAsset, setFAsset] = useState("");
  const [fJob, setFJob] = useState("");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [fDate, setFDate] = useState("");
  const [fKm, setFKm] = useState("");
  const [fMob, setFMob] = useState("");
  const [fPerKm, setFPerKm] = useState("");

  const [evOpen, setEvOpen] = useState(false);
  const [evOutcome, setEvOutcome] = useState("fit_drivers");
  const [evKind, setEvKind] = useState("");
  const [evSummary, setEvSummary] = useState("");

  const floatPreview =
    Math.round((parseFloat(fMob) || 0) * 100) + Math.round((parseFloat(fKm) || 0) * Math.round((parseFloat(fPerKm) || 0) * 100));

  const addAsset = () =>
    void act.run(async () => {
      await api("/fleet/assets", { body: { code: aCode.trim(), name: aName.trim(), kind: aKind, rego: aRego.trim() || null, yard: aYard.trim() || null } });
      setAssetOpen(false);
      setACode("");
      setAName("");
      setARego("");
      setAYard("");
      assets.reload();
      allAssets.reload();
      yards.reload();
    });

  const completeService = () =>
    void act.run(async () => {
      if (!servicing) return;
      await api(`/fleet/service-plans/${servicing.plan_id}/complete`, { body: { notes: serviceNotes.trim() || null } });
      setServicing(null);
      setServiceNotes("");
      workshop.reload();
      assets.reload();
      vault.reload();
    });

  const raiseCa = () =>
    void act.run(async () => {
      await api("/fleet/corrective-actions", { body: { title: caTitle.trim(), detail: caDetail.trim() || null, source: caSource, asset_id: caAsset || null } });
      setCaOpen(false);
      setCaTitle("");
      setCaDetail("");
      workshop.reload();
      vault.reload();
    });

  const closeCa = () =>
    void act.run(async () => {
      if (!closing) return;
      await api(`/fleet/corrective-actions/${closing.id}/close`, { body: { note: closeNote.trim() } });
      setClosing(null);
      setCloseNote("");
      workshop.reload();
      vault.reload();
    });

  const bookFloat = () =>
    void act.run(async () => {
      await api("/fleet/floats", {
        body: {
          asset_id: fAsset,
          job_id: fJob || null,
          from_yard: fFrom.trim(),
          to_site: fTo.trim(),
          float_date: fDate,
          km: parseFloat(fKm) || 0,
          mobilisation_cents: Math.round((parseFloat(fMob) || 0) * 100),
          cents_per_km: Math.round((parseFloat(fPerKm) || 0) * 100),
        },
      });
      setFloatOpen(false);
      setFAsset("");
      setFJob("");
      setFFrom("");
      setFTo("");
      setFDate("");
      setFKm("");
      floats.reload();
    });

  const completeFloat = (id: string) =>
    void act.run(async () => {
      await api(`/fleet/floats/${id}/complete`, { method: "POST" });
      floats.reload();
    });

  const addEvidence = () =>
    void act.run(async () => {
      await api("/fleet/evidence", { body: { outcome: evOutcome, kind: evKind.trim(), summary: evSummary.trim() } });
      setEvOpen(false);
      setEvKind("");
      setEvSummary("");
      vault.reload();
    });

  return (
    <div>
      <div role="tablist" aria-label="Fleet desk" className="bf-chip-row" style={{ marginBottom: 16 }}>
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
          <Chip
            key={t}
            role="tab"
            testId={`tab-${t}`}
            active={tab === t}
            onClick={() => setTab(t)}
            label={TAB_LABELS[t]}
          />
        ))}
      </div>
      {act.error && <ErrorView message={act.error} />}

      {tab === "register" && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center" }}>
            <Button kind="mark" onClick={() => setAssetOpen(true)} testId="asset-open">
              Add to register
            </Button>
            <label className="bf-label" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              Depot
              <select data-testid="yard-filter" value={yard} onChange={(e) => setYard(e.target.value)}>
                <option value="">All depots</option>
                {(yards.data ?? []).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </label>
          </div>
          {assets.loading && <LoadingView label="Pulling the register" />}
          {assets.error && <ErrorView message={assets.error} onRetry={assets.reload} />}
          {assets.data && assets.data.length === 0 && <EmptyView title="Nothing on the register" hint="Add trucks, trailers, plant and attachments." />}
          {assets.data && assets.data.length > 0 && (
            <LedgerTable<FleetAsset>
              testId="fleet-table"
              rows={assets.data}
              rowKey={(a) => a.id}
              empty="No assets"
              columns={[
                { key: "code", label: "Unit", render: (a) => <span className="bf-mono">{a.meta.code ?? "—"}</span> },
                { key: "name", label: "Asset", render: (a) => a.name },
                { key: "kind", label: "Kind", render: (a) => a.kind.toUpperCase() },
                { key: "rego", label: "Rego", render: (a) => <span className="bf-mono">{a.rego ?? "—"}</span> },
                { key: "yard", label: "Depot", render: (a) => a.yard ?? "—" },
                { key: "meter", label: "Meter", align: "right", render: (a) => `${Number(a.meter_hours).toFixed(0)} h` },
                { key: "service", label: "Service", render: (a) => serviceStamp(a) },
                {
                  key: "prestart",
                  label: "Pre-start",
                  render: (a) =>
                    a.prestart_today ? (
                      <Stamp label={a.prestart_today.toUpperCase()} tone={a.prestart_today === "pass" ? "ok" : "bad"} />
                    ) : (
                      <Stamp label="None today" tone="mute" />
                    ),
                },
                { key: "fitted", label: "Fitted to", render: (a) => a.carrier_name ?? "—" },
              ]}
            />
          )}
        </>
      )}

      {tab === "workshop" && (
        <>
          <div style={{ marginBottom: 12 }}>
            <Button kind="mark" onClick={() => setCaOpen(true)} testId="ca-open">
              Raise corrective action
            </Button>
          </div>
          {workshop.loading && <LoadingView label="Checking the workshop queue" />}
          {workshop.error && <ErrorView message={workshop.error} onRetry={workshop.reload} />}
          {workshop.data && (
            <div style={{ display: "grid", gap: 24 }}>
              <section aria-labelledby="due-h">
                <h3 id="due-h" className="bf-h3">Services due — pre-start hours feed this queue</h3>
                {workshop.data.due_services.length === 0 ? (
                  <EmptyView title="Nothing due" hint="Every machine is inside its service interval." />
                ) : (
                  <LedgerTable
                    testId="due-table"
                    rows={workshop.data.due_services}
                    rowKey={(d) => d.plan_id}
                    empty="Nothing due"
                    columns={[
                      { key: "unit", label: "Unit", render: (d) => <span className="bf-mono">{d.meta.code ?? "—"}</span> },
                      { key: "asset", label: "Asset", render: (d) => d.asset_name },
                      { key: "plan", label: "Service", render: (d) => d.plan_name },
                      { key: "meter", label: "Meter", align: "right", render: (d) => `${Number(d.meter_hours).toFixed(0)} h` },
                      { key: "over", label: "Over by", align: "right", render: (d) => <Stamp label={`${Number(d.hours_over).toFixed(0)} h`} tone="bad" /> },
                      {
                        key: "act",
                        label: "",
                        align: "right",
                        render: (d) => (
                          <Button
                            kind="mark"
                            disabled={act.busy}
                            onClick={() => setServicing({ plan_id: d.plan_id, label: `${d.asset_name} — ${d.plan_name}` })}
                            testId={`service-${d.meta.code ?? d.plan_id}`}
                          >
                            Complete service
                          </Button>
                        ),
                      },
                    ]}
                  />
                )}
              </section>
              <section aria-labelledby="ca-h">
                <h3 id="ca-h" className="bf-h3">Open corrective actions</h3>
                {workshop.data.open_corrective_actions.length === 0 ? (
                  <EmptyView title="None open" hint="Failed pre-starts and audits raise these." />
                ) : (
                  <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                    {workshop.data.open_corrective_actions.map((ca) => (
                      <li key={ca.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--rule)" }}>
                        <span className="bf-mono" style={{ fontSize: 12, color: "var(--ink-mute)" }}>{ca.code}</span>
                        <span style={{ flex: 1, fontSize: 14 }}>
                          {ca.title}
                          <span style={{ display: "block", fontSize: 12, color: "var(--ink-mute)" }}>
                            {ca.source.toUpperCase()}{ca.asset_name ? ` · ${ca.asset_name}` : ""}
                          </span>
                        </span>
                        <Button kind="accent" disabled={act.busy} onClick={() => setClosing(ca)} testId={`close-${ca.code}`}>
                          Close out
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </>
      )}

      {tab === "floats" && (
        <>
          <div style={{ marginBottom: 12 }}>
            <Button kind="mark" onClick={() => setFloatOpen(true)} testId="float-open">
              Book float
            </Button>
          </div>
          {floats.loading && <LoadingView label="Pulling floats" />}
          {floats.error && <ErrorView message={floats.error} onRetry={floats.reload} />}
          {floats.data && floats.data.length === 0 && <EmptyView title="No floats booked" hint="Mobilisation charges start here, not on a sticky note." />}
          {floats.data && floats.data.length > 0 && (
            <LedgerTable<FloatRow>
              testId="floats-table"
              rows={floats.data}
              rowKey={(f) => f.id}
              empty="No floats"
              columns={[
                { key: "code", label: "Float", render: (f) => <span className="bf-mono">{f.code}</span> },
                { key: "asset", label: "Asset", render: (f) => f.asset_name },
                { key: "route", label: "Route", render: (f) => `${f.from_yard} → ${f.to_site}` },
                { key: "date", label: "Date", render: (f) => new Date(f.float_date).toLocaleDateString("en-AU") },
                { key: "job", label: "JOB", render: (f) => <span className="bf-mono">{f.job_code ?? "—"}</span> },
                { key: "km", label: "KM", align: "right", render: (f) => Number(f.km).toFixed(0) },
                { key: "charge", label: "Charge ex", align: "right", render: (f) => money(f.charge_cents) },
                { key: "status", label: "Status", render: (f) => <Stamp label={f.status.toUpperCase()} tone={FLOAT_TONE[f.status]} /> },
                {
                  key: "act",
                  label: "",
                  align: "right",
                  render: (f) =>
                    f.status === "planned" ? (
                      <Button kind="accent" disabled={act.busy} onClick={() => completeFloat(f.id)} testId={`float-done-${f.code}`}>
                        Mark delivered
                      </Button>
                    ) : (
                      <span className="bf-mono" style={{ fontSize: 12, color: "var(--ink-mute)" }}>—</span>
                    ),
                },
              ]}
            />
          )}
        </>
      )}

      {tab === "evidence" && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12, alignItems: "center" }}>
            <Button kind="mark" onClick={() => setEvOpen(true)} testId="evidence-open">
              Add evidence
            </Button>
            <a className="bf-label" href="/api/fleet/evidence/pack.pdf" target="_blank" rel="noreferrer" data-testid="sms-pack">
              SMS pack ↗
            </a>
          </div>
          {vault.loading && <LoadingView label="Opening the vault" />}
          {vault.error && <ErrorView message={vault.error} onRetry={vault.reload} />}
          {vault.data && (
            <>
              <div role="tablist" aria-label="SMS outcome" className="bf-chip-row" style={{ marginBottom: 14 }}>
                {[["", "All"] as [string, string], ...Object.entries(vault.data.outcomes)].map(([key, label]) => (
                  <Chip
                    key={key || "all"}
                    role="tab"
                    testId={`outcome-${key || "all"}`}
                    active={outcome === key}
                    onClick={() => setOutcome(key)}
                    label={`${label}${key ? ` (${vault.data?.counts[key] ?? 0})` : ""}`}
                  />
                ))}
              </div>
              {vault.data.items.length === 0 ? (
                <EmptyView title="No evidence yet" hint="Pre-starts, services and corrective actions land here as they happen." />
              ) : (
                <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                  {vault.data.items.map((i, idx) => (
                    <li key={idx} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "9px 0", borderBottom: "1px solid var(--rule)" }}>
                      <span className="bf-mono" style={{ fontSize: 12, color: "var(--ink-mute)", whiteSpace: "nowrap" }}>{i.date}</span>
                      <Stamp label={SOURCE_LABEL[i.source] ?? i.source.toUpperCase()} tone={i.source === "vault" ? "info" : "mute"} />
                      <span style={{ flex: 1, fontSize: 14 }}>{i.summary}</span>
                      <span className="bf-label" style={{ whiteSpace: "nowrap" }}>{vault.data?.outcomes[i.outcome]}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}

      <Sheet title="Add to register" open={assetOpen} onClose={() => setAssetOpen(false)} testId="asset-sheet">
        <Field label="Unit code" value={aCode} onChange={setACode} placeholder="e.g. PM-02" required testId="asset-code" />
        <Field label="Name" value={aName} onChange={setAName} placeholder="e.g. Kenworth T610" required testId="asset-name" />
        <label className="bf-label" style={{ display: "block", marginBottom: 12 }}>
          Kind
          <select data-testid="asset-kind" value={aKind} onChange={(e) => setAKind(e.target.value)} style={{ display: "block", width: "100%", marginTop: 4 }}>
            {["truck", "trailer", "excavator", "loader", "roller", "attachment", "ute", "other"].map((k) => (
              <option key={k} value={k}>{k.toUpperCase()}</option>
            ))}
          </select>
        </label>
        <Field label="Rego" value={aRego} onChange={setARego} testId="asset-rego" />
        <Field label="Depot" value={aYard} onChange={setAYard} placeholder="e.g. Bunbury Depot" testId="asset-yard" />
        {act.error && <ErrorView message={act.error} />}
        <Button kind="mark" full disabled={act.busy || !aCode.trim() || !aName.trim()} onClick={addAsset} testId="asset-submit">
          {act.busy ? "Adding…" : "Add asset"}
        </Button>
      </Sheet>

      <Sheet title={servicing ? `COMPLETE — ${servicing.label}` : ""} open={servicing !== null} onClose={() => setServicing(null)} testId="service-sheet">
        {servicing && (
          <div>
            <p className="bf-mono" style={{ marginTop: 0, fontSize: 13, color: "var(--ink-mute)" }}>
              Logs the service at the current meter and resets the interval clock.
            </p>
            <Field label="Work done" value={serviceNotes} onChange={setServiceNotes} placeholder="Oil, filters, greased driveline" testId="service-notes" />
            {act.error && <ErrorView message={act.error} />}
            <Button kind="mark" full disabled={act.busy} onClick={completeService} testId="service-submit">
              {act.busy ? "Logging…" : "Log service"}
            </Button>
          </div>
        )}
      </Sheet>

      <Sheet title="Raise corrective action" open={caOpen} onClose={() => setCaOpen(false)} testId="ca-sheet">
        <Field label="What needs fixing" value={caTitle} onChange={setCaTitle} required testId="ca-title" />
        <Field label="Detail (optional)" value={caDetail} onChange={setCaDetail} testId="ca-detail" />
        <label className="bf-label" style={{ display: "block", marginBottom: 12 }}>
          SOURCE
          <select data-testid="ca-source" value={caSource} onChange={(e) => setCaSource(e.target.value as CorrectiveActionRow["source"])} style={{ display: "block", width: "100%", marginTop: 4 }}>
            {(["manual", "prestart", "audit", "incident"] as const).map((s) => (
              <option key={s} value={s}>{s.toUpperCase()}</option>
            ))}
          </select>
        </label>
        <AssetSelect label="Machine (optional)" assets={allAssets.data ?? []} value={caAsset} onChange={setCaAsset} testId="ca-asset" />
        {act.error && <ErrorView message={act.error} />}
        <Button kind="mark" full disabled={act.busy || !caTitle.trim()} onClick={raiseCa} testId="ca-submit">
          {act.busy ? "Raising…" : "Raise it"}
        </Button>
      </Sheet>

      <Sheet title={closing ? `Close out — ${closing.code}` : ""} open={closing !== null} onClose={() => setClosing(null)} testId="ca-close-sheet">
        {closing && (
          <div>
            <p style={{ marginTop: 0, fontSize: 14 }}>{closing.title}</p>
            <Field label="What was done (goes in the SMS evidence)" value={closeNote} onChange={setCloseNote} required testId="ca-close-note" />
            {act.error && <ErrorView message={act.error} />}
            <Button kind="mark" full disabled={act.busy || !closeNote.trim()} onClick={closeCa} testId="ca-close-submit">
              {act.busy ? "Closing…" : "Close out"}
            </Button>
          </div>
        )}
      </Sheet>

      <Sheet title="Book float" open={floatOpen} onClose={() => setFloatOpen(false)} testId="float-sheet">
        <AssetSelect label="Asset" assets={allAssets.data ?? []} value={fAsset} onChange={setFAsset} testId="float-asset" />
        <JobSelect label="Charge to job (optional)" value={fJob} onChange={setFJob} allowNone testId="float-job" />
        <Field label="From depot" value={fFrom} onChange={setFFrom} required testId="float-from" />
        <Field label="To site" value={fTo} onChange={setFTo} required testId="float-to" />
        <Field label="Date" type="date" value={fDate} onChange={setFDate} required testId="float-date" />
        <Field label="Km" type="number" value={fKm} onChange={setFKm} testId="float-km" />
        <Field label="Mobilisation ($ ex GST)" type="number" value={fMob} onChange={setFMob} testId="float-mob" />
        <Field label="Rate ($/km ex GST)" type="number" value={fPerKm} onChange={setFPerKm} testId="float-perkm" />
        <p className="bf-num" data-testid="float-preview" style={{ fontSize: 15, margin: "0 0 14px" }}>
          CHARGE: {money(floatPreview)}
        </p>
        {act.error && <ErrorView message={act.error} />}
        <Button kind="mark" full disabled={act.busy || !fAsset || !fFrom.trim() || !fTo.trim() || !fDate} onClick={bookFloat} testId="float-submit">
          {act.busy ? "Booking…" : "Book float"}
        </Button>
      </Sheet>

      <Sheet title="Add SMS evidence" open={evOpen} onClose={() => setEvOpen(false)} testId="evidence-sheet">
        <label className="bf-label" style={{ display: "block", marginBottom: 12 }}>
          OUTCOME
          <select data-testid="evidence-outcome" value={evOutcome} onChange={(e) => setEvOutcome(e.target.value)} style={{ display: "block", width: "100%", marginTop: 4 }}>
            {Object.entries(vault.data?.outcomes ?? {}).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </label>
        <Field label="Kind" value={evKind} onChange={setEvKind} placeholder="e.g. policy_signoff, training, review" required testId="evidence-kind" />
        <Field label="Summary" value={evSummary} onChange={setEvSummary} required testId="evidence-summary" />
        {act.error && <ErrorView message={act.error} />}
        <Button kind="mark" full disabled={act.busy || !evKind.trim() || !evSummary.trim()} onClick={addEvidence} testId="evidence-submit">
          {act.busy ? "Filing…" : "File evidence"}
        </Button>
      </Sheet>
    </div>
  );
}
