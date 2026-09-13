import { useState } from "react";
import type { Board, ChaseList, Nudge } from "../api";
import Stamp from "../components/Stamp";
import DeskLedger, { type DraftedInvoice } from "../screens/desk/DeskLedger";

/* Synthetic yard data for design review. Nothing here is a real client, job, or amount. */

const DATE = "2026-09-12";

const NUDGE: Nudge = {
  date: DATE,
  review_count: 3,
  recalls: [{ id: "r1", code: "HVAC-1187", title: "Recall alert", recall_on: "2026-09-14" }],
  quotes: [],
  licences_expiring: [{ kind: "Driver licence", expires_on: "2026-09-19", user_name: "J. Nguyen" }],
};

const CHASE: ChaseList = {
  uninvoiced: [
    { id: "j2417", code: "JOB-2417", title: "Level 3 office", client_name: "Bayside Fitout", quoted_cents: 1_425_000, completed_at: "2026-09-10" },
    { id: "j2421", code: "JOB-2421", title: "Fitout works", client_name: "Northpoint Retail", quoted_cents: 968_000, completed_at: "2026-09-10" },
    { id: "j2423", code: "JOB-2423", title: "Common areas", client_name: "Summit Apartments", quoted_cents: 792_000, completed_at: "2026-09-11" },
    { id: "j2426", code: "JOB-2426", title: "Electrical upgrade", client_name: "Harbour Clinic", quoted_cents: 561_000, completed_at: "2026-09-11" },
  ],
  overdue: [
    { id: "i2387", code: "INV-2387", job_id: "j2380", job_code: "JOB-2380", client_name: "Riverstone Group", total_ex_cents: 385_000, due_on: "2026-08-29" },
    { id: "i2391", code: "INV-2391", job_id: "j2385", job_code: "JOB-2385", client_name: "Metro Projects", total_ex_cents: 231_000, due_on: "2026-09-03" },
    { id: "i2394", code: "INV-2394", job_id: "j2390", job_code: "JOB-2390", client_name: "BuildCorp NSW", total_ex_cents: 123_000, due_on: "2026-09-07" },
  ],
  on_table_cents: 4_485_000,
};

const BOARD: Board = {
  date: DATE,
  jobs: [
    { id: "j2417", code: "JOB-2417", title: "Level 3 office", status: "live", client_name: "Bayside Fitout", site_name: "Bayside Fitout" },
    { id: "j2421", code: "JOB-2421", title: "Fitout works", status: "live", client_name: "Northpoint Retail", site_name: "Northpoint Retail" },
    { id: "j2423", code: "JOB-2423", title: "Common areas", status: "live", client_name: "Summit Apartments", site_name: "Summit Apartments" },
    { id: "j2426", code: "JOB-2426", title: "Electrical upgrade", status: "live", client_name: "Harbour Clinic", site_name: "Harbour Clinic" },
    { id: "j2428", code: "JOB-2428", title: "Warehouse callout", status: "scheduled", client_name: "Westgate Logistics", site_name: "Warehouse Callout" },
  ],
  assignments: [
    { id: "a1", job_id: "j2417", user_name: "Matt Williams", time_window: "Lead tech" },
    { id: "a2", job_id: "j2421", user_name: "Jason Nguyen", time_window: "Tech" },
    { id: "a3", job_id: "j2423", user_name: "Sarah Patel", time_window: "Apprentice" },
    { id: "a4", job_id: "j2426", user_name: "Ben Kowalski", time_window: "Tech" },
    { id: "a5", job_id: "j2428", user_name: "Jake Simpson", time_window: "Labourer" },
  ],
  away: [],
};

/** `/gallery/desk`: the Desk ledger on synthetic data, for design review at any viewport. */
export default function DeskPreview() {
  const [drafting, setDrafting] = useState<string | null>(null);
  const [drafted, setDrafted] = useState<DraftedInvoice | null>(null);
  const [chase, setChase] = useState<ChaseList>(CHASE);

  const draft = (jobId: string) => {
    setDrafting(jobId);
    window.setTimeout(() => {
      const job = chase.uninvoiced.find((j) => j.id === jobId);
      if (job) {
        setDrafted({ code: `INV-${2400 + chase.overdue.length + 1}`, jobId, jobCode: job.code });
        setChase({
          ...chase,
          uninvoiced: chase.uninvoiced.filter((j) => j.id !== jobId),
          on_table_cents: chase.on_table_cents - job.quoted_cents,
        });
      }
      setDrafting(null);
    }, 600);
  };

  return (
    <DeskLedger
      nudge={NUDGE}
      chase={chase}
      board={BOARD}
      draftingJobId={drafting}
      drafted={drafted}
      actionError={null}
      onDraftInvoice={draft}
      onDismissNotice={() => setDrafted(null)}
      daySheetHref="/api/dayboard/sheet.pdf"
    >
      <Stamp label="Synthetic data" tone="mute" testId="desk-preview-label" />
      <span className="bf-label">Design preview — every name, job and amount here is invented.</span>
    </DeskLedger>
  );
}
