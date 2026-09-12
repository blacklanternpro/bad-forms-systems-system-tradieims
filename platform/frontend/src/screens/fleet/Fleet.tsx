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
import Field from "../../components/Field";
import LedgerTable from "../../components/LedgerTable";
import Sheet from "../../components/Sheet";
import Stamp, { type StampTone } from "../../components/Stamp";
import { EmptyView, ErrorView, LoadingView } from "../../components/StatusViews";
import { useAction, useLoad } from "../../hooks";
import { JobSelect } from "../fab/Shop";

type Tab = "register" | "workshop" | "floats" | "evidence";

const TAB_LABELS: Record<Tab, string> = {
  register: "REGISTER",
  workshop: "WORKSHOP",
  floats: "FLOATS",
  evidence: "SMS EVIDENCE",
};

const FLOAT_TONE: Record<FloatRow["status"], StampTone> = { planned: "info", completed: "ok", cancelled: "mute" };
const SOURCE_LABEL: Record<string, string> = {
  vault: "VAULT",
  prestarts: "PRE-START",
  workshop: "WORKSHOP",
  corrective_actions: "CORRECTIVE",
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
        <option value="">— PICK A MACHINE —</option>
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
  if (a.hours_to_service === null) return <Stamp label="NO PLAN" tone="mute" />;
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
      <div role="tablist" aria-label="Fleet desk" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            data-testid={`tab-${t}`}
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

      {tab === "register" && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center" }}>
            <Button kind="mark" onClick={() => setAssetOpen(true)} testId="asset-open">
              ADD TO REGISTER
            </Button>
            <label className="bf-label" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              DEPOT
              <select data-testid="yard-filter" value={yard} onChange={(e) => setYard(e.target.value)}>
                <option value="">ALL DEPOTS</option>
                {(yards.data ?? []).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </label>
          </div>
          {assets.loading && <LoadingView label="PULLING THE REGISTER" />}
          {assets.error && <ErrorView message={assets.error} onRetry={assets.reload} />}
          {assets.data && assets.data.length === 0 && <EmptyView title="NOTHING ON THE REGISTER" hint="Add trucks, trailers, plant and attachments." />}
          {assets.data && assets.data.length > 0 && (
            <LedgerTable<FleetAsset>
              testId="fleet-table"
              rows={assets.data}
              rowKey={(a) => a.id}
              empty="NO ASSETS"
              columns={[
                { key: "code", label: "UNIT", render: (a) => <span className="bf-mono">{a.meta.code ?? "—"}</span> },
                { key: "name", label: "ASSET", render: (a) => a.name },
                { key: "kind", label: "KIND", render: (a) => a.kind.toUpperCase() },
                { key: "rego", label: "REGO", render: (a) => <span className="bf-mono">{a.rego ?? "—"}</span> },
                { key: "yard", label: "DEPOT", render: (a) => a.yard ?? "—" },
                { key: "meter", label: "METER", align: "right", render: (a) => `${Number(a.meter_hours).toFixed(0)} h` },
                { key: "service", label: "SERVICE", render: (a) => serviceStamp(a) },
                {
                  key: "prestart",
                  label: "PRE-START",
                  render: (a) =>
                    a.prestart_today ? (
                      <Stamp label={a.prestart_today.toUpperCase()} tone={a.prestart_today === "pass" ? "ok" : "bad"} />
                    ) : (
                      <Stamp label="NONE TODAY" tone="mute" />
                    ),
                },
                { key: "fitted", label: "FITTED TO", render: (a) => a.carrier_name ?? "—" },
              ]}
            />
          )}
        </>
      )}

      {tab === "workshop" && (
        <>
          <div style={{ marginBottom: 12 }}>
            <Button kind="mark" onClick={() => setCaOpen(true)} testId="ca-open">
              RAISE CORRECTIVE ACTION
            </Button>
          </div>
          {workshop.loading && <LoadingView label="CHECKING THE WORKSHOP QUEUE" />}
          {workshop.error && <ErrorView message={workshop.error} onRetry={workshop.reload} />}
          {workshop.data && (
            <div style={{ display: "grid", gap: 24 }}>
              <section aria-labelledby="due-h">
                <h3 id="due-h" className="bf-label">SERVICES DUE — PRE-START HOURS FEED THIS QUEUE</h3>
                {workshop.data.due_services.length === 0 ? (
                  <EmptyView title="NOTHING DUE" hint="Every machine is inside its service interval." />
                ) : (
                  <LedgerTable
                    testId="due-table"
                    rows={workshop.data.due_services}
                    rowKey={(d) => d.plan_id}
                    empty="NOTHING DUE"
                    columns={[
                      { key: "unit", label: "UNIT", render: (d) => <span className="bf-mono">{d.meta.code ?? "—"}</span> },
                      { key: "asset", label: "ASSET", render: (d) => d.asset_name },
                      { key: "plan", label: "SERVICE", render: (d) => d.plan_name },
                      { key: "meter", label: "METER", align: "right", render: (d) => `${Number(d.meter_hours).toFixed(0)} h` },
                      { key: "over", label: "OVER BY", align: "right", render: (d) => <Stamp label={`${Number(d.hours_over).toFixed(0)} h`} tone="bad" /> },
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
                            COMPLETE SERVICE
                          </Button>
                        ),
                      },
                    ]}
                  />
                )}
              </section>
              <section aria-labelledby="ca-h">
                <h3 id="ca-h" className="bf-label">OPEN CORRECTIVE ACTIONS</h3>
                {workshop.data.open_corrective_actions.length === 0 ? (
                  <EmptyView title="NONE OPEN" hint="Failed pre-starts and audits raise these." />
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
                          CLOSE OUT
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
              BOOK FLOAT
            </Button>
          </div>
          {floats.loading && <LoadingView label="PULLING FLOATS" />}
          {floats.error && <ErrorView message={floats.error} onRetry={floats.reload} />}
          {floats.data && floats.data.length === 0 && <EmptyView title="NO FLOATS BOOKED" hint="Mobilisation charges start here, not on a sticky note." />}
          {floats.data && floats.data.length > 0 && (
            <LedgerTable<FloatRow>
              testId="floats-table"
              rows={floats.data}
              rowKey={(f) => f.id}
              empty="NO FLOATS"
              columns={[
                { key: "code", label: "FLOAT", render: (f) => <span className="bf-mono">{f.code}</span> },
                { key: "asset", label: "ASSET", render: (f) => f.asset_name },
                { key: "route", label: "ROUTE", render: (f) => `${f.from_yard} → ${f.to_site}` },
                { key: "date", label: "DATE", render: (f) => new Date(f.float_date).toLocaleDateString("en-AU") },
                { key: "job", label: "JOB", render: (f) => <span className="bf-mono">{f.job_code ?? "—"}</span> },
                { key: "km", label: "KM", align: "right", render: (f) => Number(f.km).toFixed(0) },
                { key: "charge", label: "CHARGE EX", align: "right", render: (f) => money(f.charge_cents) },
                { key: "status", label: "STATUS", render: (f) => <Stamp label={f.status.toUpperCase()} tone={FLOAT_TONE[f.status]} /> },
                {
                  key: "act",
                  label: "",
                  align: "right",
                  render: (f) =>
                    f.status === "planned" ? (
                      <Button kind="accent" disabled={act.busy} onClick={() => completeFloat(f.id)} testId={`float-done-${f.code}`}>
                        MARK DELIVERED
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
              ADD EVIDENCE
            </Button>
            <a className="bf-label" href="/api/fleet/evidence/pack.pdf" target="_blank" rel="noreferrer" data-testid="sms-pack">
              SMS PACK ↗
            </a>
          </div>
          {vault.loading && <LoadingView label="OPENING THE VAULT" />}
          {vault.error && <ErrorView message={vault.error} onRetry={vault.reload} />}
          {vault.data && (
            <>
              <div role="tablist" aria-label="SMS outcome" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                {[["", "ALL"] as [string, string], ...Object.entries(vault.data.outcomes)].map(([key, label]) => (
                  <button
                    key={key || "all"}
                    role="tab"
                    aria-selected={outcome === key}
                    data-testid={`outcome-${key || "all"}`}
                    className="bf-label"
                    onClick={() => setOutcome(key)}
                    style={{
                      padding: "8px 12px",
                      minHeight: "var(--tap-min)",
                      cursor: "pointer",
                      background: outcome === key ? "var(--mark)" : "var(--ground-raise)",
                      color: outcome === key ? "var(--mark-ink)" : "var(--ink-mute)",
                      border: "1px solid var(--rule-strong)",
                      borderRadius: "var(--radius)",
                    }}
                  >
                    {label.toUpperCase()}
                    {key ? ` (${vault.data?.counts[key] ?? 0})` : ""}
                  </button>
                ))}
              </div>
              {vault.data.items.length === 0 ? (
                <EmptyView title="NO EVIDENCE YET" hint="Pre-starts, services and corrective actions land here as they happen." />
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

      <Sheet title="ADD TO REGISTER" open={assetOpen} onClose={() => setAssetOpen(false)} testId="asset-sheet">
        <Field label="UNIT CODE" value={aCode} onChange={setACode} placeholder="e.g. PM-02" required testId="asset-code" />
        <Field label="NAME" value={aName} onChange={setAName} placeholder="e.g. Kenworth T610" required testId="asset-name" />
        <label className="bf-label" style={{ display: "block", marginBottom: 12 }}>
          KIND
          <select data-testid="asset-kind" value={aKind} onChange={(e) => setAKind(e.target.value)} style={{ display: "block", width: "100%", marginTop: 4 }}>
            {["truck", "trailer", "excavator", "loader", "roller", "attachment", "ute", "other"].map((k) => (
              <option key={k} value={k}>{k.toUpperCase()}</option>
            ))}
          </select>
        </label>
        <Field label="REGO" value={aRego} onChange={setARego} testId="asset-rego" />
        <Field label="DEPOT" value={aYard} onChange={setAYard} placeholder="e.g. Bunbury Depot" testId="asset-yard" />
        {act.error && <ErrorView message={act.error} />}
        <Button kind="mark" full disabled={act.busy || !aCode.trim() || !aName.trim()} onClick={addAsset} testId="asset-submit">
          {act.busy ? "ADDING…" : "ADD ASSET"}
        </Button>
      </Sheet>

      <Sheet title={servicing ? `COMPLETE — ${servicing.label}` : ""} open={servicing !== null} onClose={() => setServicing(null)} testId="service-sheet">
        {servicing && (
          <div>
            <p className="bf-mono" style={{ marginTop: 0, fontSize: 13, color: "var(--ink-mute)" }}>
              Logs the service at the current meter and resets the interval clock.
            </p>
            <Field label="WORK DONE" value={serviceNotes} onChange={setServiceNotes} placeholder="Oil, filters, greased driveline" testId="service-notes" />
            {act.error && <ErrorView message={act.error} />}
            <Button kind="mark" full disabled={act.busy} onClick={completeService} testId="service-submit">
              {act.busy ? "LOGGING…" : "LOG SERVICE"}
            </Button>
          </div>
        )}
      </Sheet>

      <Sheet title="RAISE CORRECTIVE ACTION" open={caOpen} onClose={() => setCaOpen(false)} testId="ca-sheet">
        <Field label="WHAT NEEDS FIXING" value={caTitle} onChange={setCaTitle} required testId="ca-title" />
        <Field label="DETAIL (OPTIONAL)" value={caDetail} onChange={setCaDetail} testId="ca-detail" />
        <label className="bf-label" style={{ display: "block", marginBottom: 12 }}>
          SOURCE
          <select data-testid="ca-source" value={caSource} onChange={(e) => setCaSource(e.target.value as CorrectiveActionRow["source"])} style={{ display: "block", width: "100%", marginTop: 4 }}>
            {(["manual", "prestart", "audit", "incident"] as const).map((s) => (
              <option key={s} value={s}>{s.toUpperCase()}</option>
            ))}
          </select>
        </label>
        <AssetSelect label="MACHINE (OPTIONAL)" assets={allAssets.data ?? []} value={caAsset} onChange={setCaAsset} testId="ca-asset" />
        {act.error && <ErrorView message={act.error} />}
        <Button kind="mark" full disabled={act.busy || !caTitle.trim()} onClick={raiseCa} testId="ca-submit">
          {act.busy ? "RAISING…" : "RAISE IT"}
        </Button>
      </Sheet>

      <Sheet title={closing ? `CLOSE OUT — ${closing.code}` : ""} open={closing !== null} onClose={() => setClosing(null)} testId="ca-close-sheet">
        {closing && (
          <div>
            <p style={{ marginTop: 0, fontSize: 14 }}>{closing.title}</p>
            <Field label="WHAT WAS DONE (GOES IN THE SMS EVIDENCE)" value={closeNote} onChange={setCloseNote} required testId="ca-close-note" />
            {act.error && <ErrorView message={act.error} />}
            <Button kind="mark" full disabled={act.busy || !closeNote.trim()} onClick={closeCa} testId="ca-close-submit">
              {act.busy ? "CLOSING…" : "CLOSE OUT"}
            </Button>
          </div>
        )}
      </Sheet>

      <Sheet title="BOOK FLOAT" open={floatOpen} onClose={() => setFloatOpen(false)} testId="float-sheet">
        <AssetSelect label="ASSET" assets={allAssets.data ?? []} value={fAsset} onChange={setFAsset} testId="float-asset" />
        <JobSelect label="CHARGE TO JOB (OPTIONAL)" value={fJob} onChange={setFJob} allowNone testId="float-job" />
        <Field label="FROM DEPOT" value={fFrom} onChange={setFFrom} required testId="float-from" />
        <Field label="TO SITE" value={fTo} onChange={setFTo} required testId="float-to" />
        <Field label="DATE" type="date" value={fDate} onChange={setFDate} required testId="float-date" />
        <Field label="KM" type="number" value={fKm} onChange={setFKm} testId="float-km" />
        <Field label="MOBILISATION ($ ex GST)" type="number" value={fMob} onChange={setFMob} testId="float-mob" />
        <Field label="RATE ($/km ex GST)" type="number" value={fPerKm} onChange={setFPerKm} testId="float-perkm" />
        <p className="bf-num" data-testid="float-preview" style={{ fontSize: 15, margin: "0 0 14px" }}>
          CHARGE: {money(floatPreview)}
        </p>
        {act.error && <ErrorView message={act.error} />}
        <Button kind="mark" full disabled={act.busy || !fAsset || !fFrom.trim() || !fTo.trim() || !fDate} onClick={bookFloat} testId="float-submit">
          {act.busy ? "BOOKING…" : "BOOK FLOAT"}
        </Button>
      </Sheet>

      <Sheet title="ADD SMS EVIDENCE" open={evOpen} onClose={() => setEvOpen(false)} testId="evidence-sheet">
        <label className="bf-label" style={{ display: "block", marginBottom: 12 }}>
          OUTCOME
          <select data-testid="evidence-outcome" value={evOutcome} onChange={(e) => setEvOutcome(e.target.value)} style={{ display: "block", width: "100%", marginTop: 4 }}>
            {Object.entries(vault.data?.outcomes ?? {}).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </label>
        <Field label="KIND" value={evKind} onChange={setEvKind} placeholder="e.g. policy_signoff, training, review" required testId="evidence-kind" />
        <Field label="SUMMARY" value={evSummary} onChange={setEvSummary} required testId="evidence-summary" />
        {act.error && <ErrorView message={act.error} />}
        <Button kind="mark" full disabled={act.busy || !evKind.trim() || !evSummary.trim()} onClick={addEvidence} testId="evidence-submit">
          {act.busy ? "FILING…" : "FILE EVIDENCE"}
        </Button>
      </Sheet>
    </div>
  );
}
