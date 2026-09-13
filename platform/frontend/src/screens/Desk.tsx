import { useEffect, useState } from "react";
import {
  ApiError,
  api,
  clearDemo,
  getSession,
  getVirginToken,
  subscribeVirgin,
  type Board,
  type ChaseList,
  type Nudge,
} from "../api";
import Button from "../components/Button";
import { EmptyView, ErrorView, LoadingView } from "../components/StatusViews";
import { useLoad } from "../hooks";
import DeskLedger, { type DraftedInvoice } from "./desk/DeskLedger";

interface InvoiceRow {
  id: string;
  code: string;
  job_id: string;
}

/** The Desk: the morning ledger — triage, money on the table, dispatch. */
export default function Desk() {
  const [virgin, setVirgin] = useState(!!getVirginToken());
  useEffect(() => subscribeVirgin(() => setVirgin(!!getVirginToken())), []);
  const nudge = useLoad(() => api<Nudge>("/nudge"));
  const chase = useLoad(() => api<ChaseList>("/invoicing/chase"));
  const board = useLoad(() => api<Board>("/dayboard"));

  const [draftingJobId, setDraftingJobId] = useState<string | null>(null);
  const [drafted, setDrafted] = useState<DraftedInvoice | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (nudge.loading || chase.loading || board.loading) return <LoadingView label="Opening the day book" />;
  if (nudge.error) return <ErrorView message={nudge.error} onRetry={nudge.reload} />;
  if (chase.error) return <ErrorView message={chase.error} onRetry={chase.reload} />;
  if (board.error) return <ErrorView message={board.error} onRetry={board.reload} />;
  if (!nudge.data || !chase.data || !board.data) return <EmptyView title="Nothing to show" />;

  const reloadAll = () => {
    nudge.reload();
    chase.reload();
    board.reload();
  };

  const draftInvoice = async (jobId: string) => {
    const job = chase.data?.uninvoiced.find((j) => j.id === jobId);
    if (!job) return;
    setDraftingJobId(jobId);
    setActionError(null);
    setDrafted(null);
    try {
      const inv = await api<InvoiceRow>("/invoices", { body: { job_id: jobId, kind: "invoice", lines: [] } });
      setDrafted({ code: inv.code, jobId, jobCode: job.code });
      chase.reload();
    } catch (e) {
      setActionError(e instanceof ApiError ? `Could not draft an invoice for ${job.code}: ${e.message}` : `Could not draft an invoice for ${job.code}. Try again.`);
    } finally {
      setDraftingJobId(null);
    }
  };

  const session = getSession();
  const canClearDemo = !!session?.org.is_demo && (session.user.role === "owner" || session.user.role === "office");

  return (
    <DeskLedger
      nudge={nudge.data}
      chase={chase.data}
      board={board.data}
      draftingJobId={draftingJobId}
      drafted={drafted}
      actionError={actionError}
      onDraftInvoice={(id) => void draftInvoice(id)}
      onDismissNotice={() => {
        setDrafted(null);
        setActionError(null);
      }}
      daySheetHref="/api/dayboard/sheet.pdf"
    >
      {canClearDemo && (
        <Button
          kind="quiet"
          testId="desk-clear-demo"
          disabled={virgin}
          onClick={() => {
            if (!window.confirm("Empties this demo for this tab until you reload.")) return;
            void clearDemo().then(reloadAll);
          }}
        >
          {virgin ? "Demo cleared — reload to restore" : "Clear demo (this tab)"}
        </Button>
      )}
    </DeskLedger>
  );
}
