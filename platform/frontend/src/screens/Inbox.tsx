import { useState } from "react";
import { api, type CaptureRow } from "../api";
import Button from "../components/Button";
import Sheet from "../components/Sheet";
import Stamp from "../components/Stamp";
import { EmptyView, ErrorView, LoadingView } from "../components/StatusViews";
import Ticket from "../components/Ticket";
import { useAction, useLoad } from "../hooks";

/** The review queue: anything the extractor wasn't sure about waits here.
    Reviewers see the model's take, the failed checks, and can correct fields
    before the capture is allowed to allocate anywhere. */
export default function Inbox() {
  const queue = useLoad(() => api<CaptureRow[]>("/captures?status=needs_verify"));
  const act = useAction();
  const [open, setOpen] = useState<CaptureRow | null>(null);
  const [draft, setDraft] = useState<string>("");

  const openCapture = (c: CaptureRow) => {
    setOpen(c);
    setDraft(JSON.stringify(c.extracted, null, 2));
  };

  const verify = (corrected: boolean) =>
    void act.run(async () => {
      if (!open) return;
      let fields: Record<string, unknown> | undefined;
      if (corrected) {
        try {
          fields = JSON.parse(draft) as Record<string, unknown>;
        } catch {
          throw new Error("Corrected fields are not valid JSON");
        }
      }
      await api(`/captures/${open.id}/verify`, { body: corrected ? { fields } : {} });
      setOpen(null);
      queue.reload();
    });

  const reject = () =>
    void act.run(async () => {
      if (!open) return;
      await api(`/captures/${open.id}/reject`, { body: { note: "Rejected at review" } });
      setOpen(null);
      queue.reload();
    });

  if (queue.loading) return <LoadingView label="Opening the inbox" />;
  if (queue.error) return <ErrorView message={queue.error} onRetry={queue.reload} />;

  const items = queue.data ?? [];

  return (
    <div>
      <h2 className="bf-h2" style={{ marginBottom: 12, fontSize: 20 }}>
        Inbox
      </h2>
      <p className="bf-label" style={{ margin: "-8px 0 16px" }}>
        Captures waiting for a look
      </p>
      {items.length === 0 ? (
        <EmptyView title="Inbox clear" hint="Every capture has been verified or fast-tracked. Nothing is stuck." />
      ) : (
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
          {items.map((c) => {
            const failed = (c.checks ?? []).filter((k) => !k.ok);
            return (
              <Ticket
                key={c.id}
                code={c.job_code ?? "Unallocated"}
                title={c.capture_type.replace(/_/g, " ")}
                stamp={{
                  label: `Conf ${Number(c.confidence).toFixed(2)}`,
                  tone: Number(c.confidence) >= 0.8 ? "ok" : Number(c.confidence) >= 0.5 ? "warn" : "bad",
                }}
                meta={[
                  { label: "By", value: c.created_by_name ?? "—" },
                  { label: "Checks", value: failed.length ? `${failed.length} failed` : "All pass" },
                ]}
                onClick={() => openCapture(c)}
                testId={`inbox-${c.id}`}
              />
            );
          })}
        </div>
      )}

      <Sheet title={open ? `Review — ${open.capture_type.replace(/_/g, " ")}` : "Review"} open={open !== null} onClose={() => setOpen(null)} testId="review-sheet">
        {open && (
          <div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              <Stamp label={`Confidence ${Number(open.confidence).toFixed(2)}`} tone={Number(open.confidence) >= 0.8 ? "ok" : "warn"} />
              {(open.checks ?? []).map((k) => (
                <Stamp key={k.name} label={`${k.name}: ${k.ok ? "ok" : "fail"}`} tone={k.ok ? "ok" : "bad"} />
              ))}
            </div>
            <label className="bf-label" style={{ display: "block", marginBottom: 4 }}>Extracted fields (editable)</label>
            <textarea
              data-testid="review-fields"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={12}
              style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 13 }}
            />
            {act.error && <ErrorView message={act.error} />}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <Button kind="mark" disabled={act.busy} onClick={() => verify(draft !== JSON.stringify(open.extracted, null, 2))} testId="review-verify">
                Verify & allocate
              </Button>
              <Button kind="danger" disabled={act.busy} onClick={reject} testId="review-reject">
                Reject
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
