import { useState } from "react";
import { api, type CertRow } from "../../api";
import Button from "../../components/Button";
import Field from "../../components/Field";
import LedgerTable from "../../components/LedgerTable";
import Sheet from "../../components/Sheet";
import Stamp from "../../components/Stamp";
import { EmptyView, ErrorView, LoadingView } from "../../components/StatusViews";
import { useAction, useLoad } from "../../hooks";

/** Field templates per certificate kind — the form-fill contract. */
const KIND_FIELDS: Record<string, { key: string; label: string }[]> = {
  electrical_compliance: [
    { key: "installation_address", label: "INSTALLATION ADDRESS" },
    { key: "work_description", label: "WORK DESCRIPTION" },
    { key: "tested_on", label: "TESTED ON (DATE)" },
    { key: "result", label: "RESULT" },
  ],
  test_report: [
    { key: "equipment", label: "EQUIPMENT / LOCATION" },
    { key: "tested_on", label: "TESTED ON (DATE)" },
    { key: "result", label: "RESULT" },
  ],
  gas_compliance: [
    { key: "installation_address", label: "INSTALLATION ADDRESS" },
    { key: "appliances", label: "APPLIANCES" },
    { key: "result", label: "RESULT" },
  ],
  plumbing_compliance: [
    { key: "installation_address", label: "INSTALLATION ADDRESS" },
    { key: "work_description", label: "WORK DESCRIPTION" },
    { key: "result", label: "RESULT" },
  ],
};

export default function Certs() {
  const certs = useLoad(() => api<CertRow[]>("/trades/certs"));
  const kinds = useLoad(() => api<Record<string, string>>("/trades/cert-kinds"));
  const act = useAction();
  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useState("electrical_compliance");
  const [values, setValues] = useState<Record<string, string>>({});

  const create = () =>
    void act.run(async () => {
      await api("/trades/certs", { body: { kind, fields: values } });
      setCreating(false);
      setValues({});
      certs.reload();
    });

  const issue = (id: string) =>
    void act.run(async () => {
      await api(`/trades/certs/${id}/issue`, { method: "POST" });
      certs.reload();
    });

  if (certs.loading || kinds.loading) return <LoadingView label="PULLING THE CERT REGISTER" />;
  if (certs.error) return <ErrorView message={certs.error} onRetry={certs.reload} />;
  if (kinds.error) return <ErrorView message={kinds.error} onRetry={kinds.reload} />;

  const rows = certs.data ?? [];
  const kindNames = kinds.data ?? {};

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
        <h2 className="bf-label" style={{ margin: 0 }}>CERTIFICATES</h2>
        <span style={{ marginLeft: "auto" }}>
          <Button kind="mark" onClick={() => setCreating(true)} testId="new-cert">NEW CERTIFICATE</Button>
        </span>
      </div>
      {act.error && <ErrorView message={act.error} />}

      {rows.length === 0 ? (
        <EmptyView title="NO CERTIFICATES YET" hint="Draft one — the number is reserved from your series the moment it's created." />
      ) : (
        <LedgerTable<CertRow>
          testId="certs-table"
          rows={rows}
          rowKey={(x) => x.id}
          empty="NO CERTIFICATES"
          columns={[
            { key: "code", label: "NO.", render: (x) => <span className="bf-mono">{x.code}</span> },
            { key: "kind", label: "TYPE", render: (x) => kindNames[x.kind] ?? x.kind },
            { key: "job", label: "JOB", render: (x) => <span className="bf-mono">{x.job_code ?? "—"}</span> },
            { key: "status", label: "STATUS", render: (x) => <Stamp label={x.status.toUpperCase()} tone={x.status === "issued" ? "ok" : "warn"} /> },
            {
              key: "act",
              label: "",
              render: (x) => (
                <span style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
                  {x.status === "draft" && (
                    <Button kind="accent" disabled={act.busy} onClick={() => issue(x.id)} testId={`issue-${x.code}`}>ISSUE</Button>
                  )}
                  <a className="bf-label" href={`/api/trades/certs/${x.id}/pdf`} target="_blank" rel="noreferrer">PDF ↗</a>
                </span>
              ),
            },
          ]}
        />
      )}

      <Sheet title="NEW CERTIFICATE" open={creating} onClose={() => setCreating(false)} testId="new-cert-sheet">
        <label className="bf-label" style={{ display: "block", marginBottom: 12 }}>
          TYPE
          <select value={kind} onChange={(e) => { setKind(e.target.value); setValues({}); }} data-testid="cert-kind" style={{ display: "block", width: "100%", marginTop: 4 }}>
            {Object.entries(kindNames).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </label>
        {(KIND_FIELDS[kind] ?? []).map((f) => (
          <Field key={f.key} label={f.label} value={values[f.key] ?? ""} onChange={(v) => setValues((cur) => ({ ...cur, [f.key]: v }))} testId={`cert-${f.key}`} />
        ))}
        <Button kind="mark" full disabled={act.busy} onClick={create} testId="cert-create">
          {act.busy ? "DRAFTING…" : "DRAFT CERTIFICATE"}
        </Button>
      </Sheet>
    </div>
  );
}
