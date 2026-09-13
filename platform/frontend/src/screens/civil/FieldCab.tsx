import { useState } from "react";
import { api, money, type DocketRow, type PlantRow } from "../../api";
import Button from "../../components/Button";
import Field from "../../components/Field";
import Sheet from "../../components/Sheet";
import SigPad from "../../components/SigPad";
import Stamp from "../../components/Stamp";
import { ErrorView, LoadingView } from "../../components/StatusViews";
import { useAction, useLoad } from "../../hooks";

/* ------------------------------- Pre-start ------------------------------- */

export interface PrestartSheetProps { jobId: string; open: boolean; onClose: () => void }

export function PrestartSheet({ jobId, open, onClose }: PrestartSheetProps) {
  const plant = useLoad(() => api<PlantRow[]>("/civil/plant"), [open]);
  const checks = useLoad(() => api<string[]>("/civil/prestart-checks"), [open]);
  const act = useAction();
  const [assetId, setAssetId] = useState("");
  const [state, setState] = useState<Record<string, boolean>>({});
  const [fault, setFault] = useState("");
  const [meter, setMeter] = useState("");
  const [result, setResult] = useState<"pass" | "fail" | null>(null);

  const submit = () =>
    void act.run(async () => {
      const res = await api<{ result: "pass" | "fail"; dispatch_blocked: boolean }>("/civil/prestarts", {
        body: {
          asset_id: assetId,
          job_id: jobId,
          checks: (checks.data ?? []).map((name) => ({ name, ok: state[name] !== false })),
          faults: fault.trim() ? [fault.trim()] : [],
          meter_hours: meter ? parseFloat(meter) : null,
        },
      });
      setResult(res.result);
    });

  const reset = () => {
    setResult(null);
    setState({});
    setFault("");
    onClose();
  };

  return (
    <Sheet title="Pre-start" open={open} onClose={reset} testId="prestart-sheet">
      {plant.loading || checks.loading ? (
        <LoadingView label="Pre-start" />
      ) : plant.error || checks.error ? (
        <ErrorView message={plant.error ?? checks.error ?? "Failed"} />
      ) : result ? (
        <div style={{ textAlign: "center", padding: "12px 0" }}>
          <Stamp label={result === "pass" ? "PASS — CLEAR TO WORK" : "FAIL — MACHINE BLOCKED"} tone={result === "pass" ? "ok" : "bad"} testId="prestart-result" />
          <p className="bf-mono" style={{ fontSize: 13, marginTop: 10 }}>
            {result === "pass" ? "Dockets are open for this machine today." : "The office has been told. No dockets until it passes."}
          </p>
          <div style={{ marginTop: 14 }}>
            <Button kind="mark" full onClick={reset}>Done</Button>
          </div>
        </div>
      ) : (
        <div>
          <label className="bf-label" style={{ display: "block", marginBottom: 12 }}>
            Machine
            <select value={assetId} onChange={(e) => setAssetId(e.target.value)} data-testid="prestart-plant" style={{ display: "block", width: "100%", marginTop: 4 }}>
              <option value="">— pick —</option>
              {(plant.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.meta.code ?? ""} {p.name}</option>
              ))}
            </select>
          </label>
          <ul style={{ margin: "0 0 12px", padding: 0, listStyle: "none" }}>
            {(checks.data ?? []).map((name) => {
              const ok = state[name] !== false;
              return (
                <li key={name} style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--rule)" }}>
                  <button
                    aria-pressed={ok}
                    data-testid={`check-${name.slice(0, 10)}`}
                    onClick={() => setState((s) => ({ ...s, [name]: !ok }))}
                    className="bf-label"
                    style={{
                      minWidth: 64,
                      minHeight: "var(--tap-min)",
                      cursor: "pointer",
                      background: ok ? "var(--stamp-ok)" : "var(--stamp-bad)",
                      color: "var(--ground)",
                      border: 0,
                      borderRadius: "var(--radius)",
                    }}
                  >
                    {ok ? "OK" : "FAULT"}
                  </button>
                  <span style={{ fontSize: 14 }}>{name}</span>
                </li>
              );
            })}
          </ul>
          <Field label="FAULT NOTE (IF ANY)" value={fault} onChange={setFault} testId="prestart-fault" />
          <Field label="Meter hours" type="number" value={meter} onChange={setMeter} testId="prestart-meter" />
          {act.error && <ErrorView message={act.error} />}
          <Button kind="mark" full disabled={act.busy || !assetId} onClick={submit} testId="prestart-submit">
            {act.busy ? "Submitting…" : "Submit pre-start"}
          </Button>
        </div>
      )}
    </Sheet>
  );
}

/* ------------------------- Hire docket + tally + glass ------------------------- */

export interface DocketSheetProps { jobId: string; open: boolean; onClose: () => void }

export function DocketSheet({ jobId, open, onClose }: DocketSheetProps) {
  const plant = useLoad(() => api<PlantRow[]>("/civil/plant"), [open]);
  const act = useAction();
  const [assetId, setAssetId] = useState("");
  const [mode, setMode] = useState<"wet" | "dry">("wet");
  const [hours, setHours] = useState("");
  const [standby, setStandby] = useState("");
  const [loads, setLoads] = useState(0);
  const [docket, setDocket] = useState<DocketRow | null>(null);
  const [signerName, setSignerName] = useState("");
  const [sig, setSig] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const create = () =>
    void act.run(async () => {
      const row = await api<DocketRow>("/civil/dockets", {
        body: {
          job_id: jobId,
          asset_id: assetId,
          mode,
          hours: parseFloat(hours) || 0,
          standby_hours: parseFloat(standby) || 0,
          tally: loads > 0 ? { loads } : {},
        },
      });
      setDocket(row);
    });

  const sign = () =>
    void act.run(async () => {
      if (!docket || !sig) return;
      await api(`/civil/dockets/${docket.id}/sign`, { body: { signed_by_name: signerName, signature_png: sig } });
      setDone(true);
    });

  const reset = () => {
    setDocket(null);
    setDone(false);
    setLoads(0);
    setHours("");
    setStandby("");
    setSig(null);
    setSignerName("");
    onClose();
  };

  return (
    <Sheet title={docket ? `${docket.code} — sign on glass` : "Hire docket"} open={open} onClose={reset} testId="docket-sheet">
      {plant.loading ? (
        <LoadingView label="DOCKET" />
      ) : plant.error ? (
        <ErrorView message={plant.error} />
      ) : done ? (
        <div style={{ textAlign: "center", padding: "12px 0" }}>
          <Stamp label="SIGNED — OFF TO THE OFFICE" tone="ok" testId="docket-signed" />
          <p className="bf-mono" style={{ fontSize: 13, marginTop: 10 }}>The office approves it, and the PDF goes to the client.</p>
          <div style={{ marginTop: 14 }}>
            <Button kind="mark" full onClick={reset}>Done</Button>
          </div>
        </div>
      ) : docket ? (
        <div>
          <p className="bf-mono" style={{ fontSize: 14, marginTop: 0 }}>
            {Number(docket.hours)}h {mode} · standby {Number(docket.standby_hours)}h · <strong>{money(docket.total_cents)}</strong> ex GST
          </p>
          <Field label="Supervisor name (head contractor)" value={signerName} onChange={setSignerName} required testId="signer-name" />
          <SigPad onChange={setSig} testId="docket-sig" />
          {act.error && <ErrorView message={act.error} />}
          <div style={{ marginTop: 12 }}>
            <Button kind="mark" full disabled={act.busy || !sig || !signerName.trim()} onClick={sign} testId="docket-sign">
              {act.busy ? "Saving…" : "Lock in signature"}
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <label className="bf-label" style={{ display: "block", marginBottom: 12 }}>
            Machine
            <select value={assetId} onChange={(e) => setAssetId(e.target.value)} data-testid="docket-plant" style={{ display: "block", width: "100%", marginTop: 4 }}>
              <option value="">— pick —</option>
              {(plant.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.meta.code ?? ""} {p.name}</option>
              ))}
            </select>
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
            <label className="bf-label">
              Mode
              <select value={mode} onChange={(e) => setMode(e.target.value as "wet" | "dry")} style={{ display: "block", width: "100%", marginTop: 4 }}>
                <option value="wet">wet</option>
                <option value="dry">dry</option>
              </select>
            </label>
            <Field label="Hours" type="number" value={hours} onChange={setHours} testId="docket-hours" />
            <Field label="Standby hrs" type="number" value={standby} onChange={setStandby} testId="docket-standby" />
          </div>

          <p className="bf-label" style={{ margin: "4px 0 6px" }}>Tally — loads</p>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
            <button
              aria-label="Minus one load"
              data-testid="tally-minus"
              onClick={() => setLoads((n) => Math.max(0, n - 1))}
              style={{ minWidth: 72, minHeight: 72, fontSize: 30, background: "var(--ground-raise)", border: "1px solid var(--rule-strong)", borderRadius: "var(--radius)", cursor: "pointer", color: "var(--ink)" }}
            >
              −
            </button>
            <span className="bf-mono" data-testid="tally-count" style={{ fontSize: 40, fontWeight: 700, minWidth: 70, textAlign: "center" }}>{loads}</span>
            <button
              aria-label="Plus one load"
              data-testid="tally-plus"
              onClick={() => setLoads((n) => n + 1)}
              style={{ minWidth: 72, minHeight: 72, fontSize: 30, background: "var(--mark)", color: "var(--mark-ink)", border: "1px solid var(--ink)", borderRadius: "var(--radius)", cursor: "pointer" }}
            >
              +
            </button>
          </div>

          {act.error && <ErrorView message={act.error} />}
          <Button kind="mark" full disabled={act.busy || !assetId || !hours} onClick={create} testId="docket-create">
            {act.busy ? "RAISING…" : "RAISE DOCKET"}
          </Button>
        </div>
      )}
    </Sheet>
  );
}
