import { useState } from "react";
import { api, money, type VariationRow } from "../../api";
import Button from "../../components/Button";
import Field from "../../components/Field";
import Sheet from "../../components/Sheet";
import Stamp from "../../components/Stamp";
import { EmptyView, ErrorView, LoadingView } from "../../components/StatusViews";
import { useAction, useLoad } from "../../hooks";

export interface JobVariationsProps {
  jobId: string;
  onChanged: () => void;
}

/** Variations panel on the job page: approve/decline what the crew raised. */
export function JobVariations({ jobId, onChanged }: JobVariationsProps) {
  const list = useLoad(() => api<VariationRow[]>(`/trades/variations?job_id=${jobId}`), [jobId]);
  const act = useAction();
  const [name, setName] = useState("");
  const [deciding, setDeciding] = useState<VariationRow | null>(null);

  const decide = (decision: "approved" | "declined") =>
    void act.run(async () => {
      if (!deciding) return;
      await api(`/trades/variations/${deciding.id}/decide`, { body: { decision, decided_by_name: name } });
      setDeciding(null);
      setName("");
      list.reload();
      onChanged();
    });

  if (list.loading) return <LoadingView label="Variations" />;
  if (list.error) return <ErrorView message={list.error} onRetry={list.reload} />;

  const items = list.data ?? [];

  return (
    <div>
      <h3 className="bf-h3">Variations</h3>
      {items.length === 0 ? (
        <EmptyView title="No variations" hint="Crew raise these from the field when scope moves." />
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {items.map((v) => (
            <li key={v.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--rule)" }}>
              <span className="bf-mono" style={{ fontSize: 12, color: "var(--ink-mute)" }}>{v.code}</span>
              <span style={{ flex: 1, fontSize: 14 }}>
                {v.title}
                {v.decided_by_name && (
                  <span style={{ display: "block", fontSize: 12, color: "var(--ink-mute)" }}>{v.status} by {v.decided_by_name}</span>
                )}
              </span>
              <span className="bf-num" style={{ fontSize: 13 }}>{money(v.amount_cents)}</span>
              {v.status === "proposed" ? (
                <Button kind="accent" disabled={act.busy} onClick={() => setDeciding(v)} testId={`decide-${v.code}`}>
                  Decide
                </Button>
              ) : (
                <Stamp label={v.status.toUpperCase()} tone={v.status === "approved" ? "ok" : "bad"} />
              )}
            </li>
          ))}
        </ul>
      )}

      <Sheet title={deciding ? `${deciding.code} — ${money(deciding.amount_cents)}` : ""} open={deciding !== null} onClose={() => setDeciding(null)} testId="decide-sheet">
        {deciding && (
          <div>
            <p style={{ marginTop: 0, fontSize: 14 }}>{deciding.title}</p>
            {deciding.detail && <p style={{ fontSize: 13, color: "var(--ink-mute)" }}>{deciding.detail}</p>}
            <Field label="Decided by (client / authoriser name)" value={name} onChange={setName} required testId="decider-name" />
            {act.error && <ErrorView message={act.error} />}
            <div style={{ display: "flex", gap: 8 }}>
              <Button kind="mark" disabled={act.busy || !name.trim()} onClick={() => decide("approved")} testId="approve-variation">
                Approve — grows job value
              </Button>
              <Button kind="danger" disabled={act.busy || !name.trim()} onClick={() => decide("declined")} testId="decline-variation">
                Decline
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}

export interface RaiseVariationProps {
  jobId: string;
  open: boolean;
  onClose: () => void;
}

/** Field-side raise sheet: title + dollars, one thumb, off to the office. */
export function RaiseVariation({ jobId, open, onClose }: RaiseVariationProps) {
  const act = useAction();
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [amount, setAmount] = useState("");
  const [sentCode, setSentCode] = useState<string | null>(null);

  const submit = () =>
    void act.run(async () => {
      const row = await api<VariationRow>("/trades/variations", {
        body: { job_id: jobId, title, detail: detail || null, amount_cents: Math.round((parseFloat(amount) || 0) * 100) },
      });
      setSentCode(row.code);
      setTitle("");
      setDetail("");
      setAmount("");
    });

  return (
    <Sheet title="Raise variation" open={open} onClose={() => { setSentCode(null); onClose(); }} testId="variation-sheet">
      {sentCode ? (
        <div style={{ textAlign: "center", padding: "12px 0" }}>
          <Stamp label={`${sentCode} SENT`} tone="ok" testId="variation-sent" />
          <p className="bf-mono" style={{ fontSize: 13, marginTop: 10 }}>The office has it — they'll take it to the client.</p>
          <div style={{ marginTop: 14 }}>
            <Button kind="mark" full onClick={() => { setSentCode(null); onClose(); }}>Done</Button>
          </div>
        </div>
      ) : (
        <div>
          <Field label="What changed" value={title} onChange={setTitle} required testId="variation-title" />
          <Field label="Detail (optional)" value={detail} onChange={setDetail} testId="variation-detail" />
          <Field label="Extra cost ($ ex GST)" type="number" value={amount} onChange={setAmount} testId="variation-amount" />
          {act.error && <ErrorView message={act.error} />}
          <Button kind="mark" full disabled={act.busy || !title.trim()} onClick={submit} testId="variation-submit">
            {act.busy ? "Sending…" : "Send to office"}
          </Button>
        </div>
      )}
    </Sheet>
  );
}
