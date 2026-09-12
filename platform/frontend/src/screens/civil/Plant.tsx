import { useState } from "react";
import { api, money, type HireRate, type PlantRow } from "../../api";
import Button from "../../components/Button";
import Field from "../../components/Field";
import Sheet from "../../components/Sheet";
import Stamp from "../../components/Stamp";
import { EmptyView, ErrorView, LoadingView } from "../../components/StatusViews";
import Ticket from "../../components/Ticket";
import { useAction, useLoad } from "../../hooks";

/** Plant register: every machine, its meter, today's pre-start, and hire rates. */
export default function Plant() {
  const plant = useLoad(() => api<PlantRow[]>("/civil/plant"));
  const act = useAction();
  const [open, setOpen] = useState<PlantRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState("excavator");

  const create = () =>
    void act.run(async () => {
      await api("/civil/plant", { body: { code, name, kind } });
      setAdding(false);
      setCode("");
      setName("");
      plant.reload();
    });

  if (plant.loading) return <LoadingView label="OPENING THE PLANT REGISTER" />;
  if (plant.error) return <ErrorView message={plant.error} onRetry={plant.reload} />;

  const rows = plant.data ?? [];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
        <h2 className="bf-label" style={{ margin: 0 }}>PLANT REGISTER</h2>
        <span style={{ marginLeft: "auto" }}>
          <Button kind="mark" onClick={() => setAdding(true)} testId="add-plant">ADD MACHINE</Button>
        </span>
      </div>
      {act.error && <ErrorView message={act.error} />}

      {rows.length === 0 ? (
        <EmptyView title="NO PLANT REGISTERED" hint="Add the first machine — rates and pre-starts hang off it." />
      ) : (
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
          {rows.map((p) => (
            <Ticket
              key={p.id}
              code={p.meta.code ?? p.kind.toUpperCase()}
              title={p.name}
              stamp={
                p.prestart_today === "pass"
                  ? { label: "PRE-START OK", tone: "ok" }
                  : p.prestart_today === "fail"
                    ? { label: "BLOCKED", tone: "bad" }
                    : { label: "NO PRE-START", tone: "warn" }
              }
              meta={[
                { label: "METER", value: `${Number(p.meter_hours).toFixed(1)} h` },
                { label: "YARD", value: p.yard ?? "—" },
                { label: "REGO", value: p.rego ?? "—" },
              ]}
              onClick={() => setOpen(p)}
              testId={`plant-${p.meta.code ?? p.id}`}
            />
          ))}
        </div>
      )}

      <Sheet title={open ? `${open.meta.code ?? ""} — HIRE RATES` : ""} open={open !== null} onClose={() => setOpen(null)} testId="rates-sheet">
        {open && <RatesPanel plantId={open.id} />}
      </Sheet>

      <Sheet title="ADD MACHINE" open={adding} onClose={() => setAdding(false)} testId="add-plant-sheet">
        <Field label="FLEET CODE (e.g. EX-05)" value={code} onChange={setCode} required testId="plant-code" />
        <Field label="NAME" value={name} onChange={setName} required testId="plant-name" />
        <label className="bf-label" style={{ display: "block", marginBottom: 12 }}>
          KIND
          <select value={kind} onChange={(e) => setKind(e.target.value)} style={{ display: "block", width: "100%", marginTop: 4 }}>
            {["excavator", "truck", "roller", "loader", "attachment"].map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </label>
        <Button kind="mark" full disabled={act.busy || !code.trim() || !name.trim()} onClick={create} testId="plant-create">
          {act.busy ? "ADDING…" : "ADD"}
        </Button>
      </Sheet>
    </div>
  );
}

interface RatesPanelProps { plantId: string }

function RatesPanel({ plantId }: RatesPanelProps) {
  const rates = useLoad(() => api<HireRate[]>(`/civil/plant/${plantId}/rates`), [plantId]);
  const act = useAction();
  const [mode, setMode] = useState<"wet" | "dry">("wet");
  const [rate, setRate] = useState("");
  const [minH, setMinH] = useState("4");
  const [standby, setStandby] = useState("");

  const save = () =>
    void act.run(async () => {
      await api(`/civil/plant/${plantId}/rates`, {
        body: {
          mode,
          rate_cents_per_hour: Math.round((parseFloat(rate) || 0) * 100),
          min_hours: parseFloat(minH) || 0,
          standby_cents_per_hour: Math.round((parseFloat(standby) || 0) * 100),
        },
      });
      rates.reload();
    });

  if (rates.loading) return <LoadingView label="RATES" />;
  if (rates.error) return <ErrorView message={rates.error} onRetry={rates.reload} />;

  return (
    <div>
      {(rates.data ?? []).length === 0 ? (
        <EmptyView title="NO RATES SET" hint="Dockets can't be raised for this machine until a rate exists." />
      ) : (
        <ul style={{ margin: "0 0 16px", padding: 0, listStyle: "none" }}>
          {(rates.data ?? []).map((rt) => (
            <li key={rt.id} style={{ display: "flex", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--rule)", alignItems: "baseline" }}>
              <Stamp label={rt.mode.toUpperCase()} tone={rt.mode === "wet" ? "info" : "mute"} />
              <span className="bf-mono" style={{ fontSize: 13 }}>
                {money(rt.rate_cents_per_hour)}/h · min {Number(rt.min_hours)}h · standby {money(rt.standby_cents_per_hour)}/h
              </span>
            </li>
          ))}
        </ul>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
        <label className="bf-label">
          MODE
          <select value={mode} onChange={(e) => setMode(e.target.value as "wet" | "dry")} style={{ display: "block", width: "100%", marginTop: 4 }}>
            <option value="wet">wet (with operator)</option>
            <option value="dry">dry (machine only)</option>
          </select>
        </label>
        <Field label="RATE $/H" type="number" value={rate} onChange={setRate} testId="rate-hourly" />
        <Field label="MIN HOURS" type="number" value={minH} onChange={setMinH} testId="rate-min" />
        <Field label="STANDBY $/H" type="number" value={standby} onChange={setStandby} testId="rate-standby" />
      </div>
      {act.error && <ErrorView message={act.error} />}
      <Button kind="mark" full disabled={act.busy || !rate} onClick={save} testId="rate-save">
        {act.busy ? "SAVING…" : "SET RATE"}
      </Button>
    </div>
  );
}
