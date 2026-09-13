import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { money, type Board, type ChaseList, type Nudge } from "../../api";
import Icon, { type IconName } from "../../components/Icon";
import Stamp, { type StampTone } from "../../components/Stamp";
import "./Desk.css";

/** What a finished inline draft looks like once the API has answered. */
export interface DraftedInvoice {
  code: string;
  jobId: string;
  jobCode: string;
}

export interface DeskLedgerProps {
  nudge: Nudge;
  chase: ChaseList;
  board: Board;
  /** Job id currently being drafted, if any. */
  draftingJobId: string | null;
  drafted: DraftedInvoice | null;
  actionError: string | null;
  onDraftInvoice: (jobId: string) => void;
  onDismissNotice: () => void;
  daySheetHref: string;
  /** Page-level tools rendered under the ledger (demo controls, preview labels). */
  children?: ReactNode;
}

interface TriageItem {
  key: string;
  icon: IconName;
  title: string;
  sub: string;
  affordance: { kind: "chevron" } | { kind: "stamp"; label: string; tone: StampTone };
  to?: string;
  testId?: string;
}

const DAY_MS = 86_400_000;

function parseISODate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function longDate(iso: string): string {
  const d = parseISODate(iso);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function shortDate(iso: string): string {
  const d = parseISODate(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((parseISODate(toIso).getTime() - parseISODate(fromIso).getTime()) / DAY_MS);
}

function daysLabel(n: number, when: "until" | "ago"): string {
  if (n === 0) return when === "until" ? "Today" : "Due today";
  const unit = Math.abs(n) === 1 ? "day" : "days";
  return when === "until" ? `${n} ${unit}` : `Due ${n} ${unit} ago`;
}

/** Overdue rows: how late the invoice is, or its due date when the ledger flags it early. */
function dueLabel(dueOn: string | null, today: string): string | null {
  if (!dueOn) return null;
  const late = daysBetween(dueOn, today);
  return late < 0 ? `Due ${shortDate(dueOn)}` : daysLabel(late, "ago");
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase() || "?";
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function buildTriage(n: Nudge): TriageItem[] {
  const items: TriageItem[] = [];
  if (n.review_count > 0) {
    items.push({
      key: "review",
      icon: "inbox",
      title: `${plural(n.review_count, "capture", "captures")} waiting review`,
      sub: "Photos, notes and voice captures to verify",
      affordance: { kind: "chevron" },
      to: "/inbox",
      testId: "nudge-review",
    });
  }
  for (const r of n.recalls) {
    items.push({
      key: `recall-${r.id}`,
      icon: "recall",
      title: r.title,
      sub: `${r.code} · Recall ${shortDate(r.recall_on)}`,
      affordance: { kind: "stamp", label: "Recall", tone: "accent" },
      to: `/jobs/${r.id}`,
      testId: "nudge-recall",
    });
  }
  for (const q of n.quotes) {
    items.push({
      key: `quote-${q.id}`,
      icon: "quote",
      title: q.title,
      sub: `${q.code} · Valid until ${shortDate(q.valid_until)}`,
      affordance: { kind: "stamp", label: "Chase quote", tone: "warn" },
      to: "/quotes",
      testId: "nudge-quote",
    });
  }
  n.licences_expiring.forEach((l, i) => {
    const days = daysBetween(n.date, l.expires_on);
    items.push({
      key: `licence-${i}`,
      icon: "licence",
      title: "Licence expiry",
      sub: `${l.kind} · ${l.user_name}`,
      affordance: { kind: "stamp", label: daysLabel(days, "until"), tone: days <= 7 ? "bad" : "accent" },
      to: "/admin",
      testId: "nudge-licence",
    });
  });
  return items;
}

function TriageCard({ item }: { item: TriageItem }) {
  const body = (
    <>
      <span className="desk-card__icon">
        <Icon name={item.icon} size={32} />
      </span>
      <span>
        <span className="desk-card__title">{item.title}</span>
        <span className="desk-card__sub">{item.sub}</span>
      </span>
      <span className="desk-card__aff">
        {item.affordance.kind === "chevron" ? (
          <Icon name="chevron-right" size={18} />
        ) : (
          <Stamp label={item.affordance.label} tone={item.affordance.tone} />
        )}
      </span>
    </>
  );
  if (!item.to) {
    return (
      <article className="desk-card desk-card--static" data-testid={item.testId}>
        {body}
      </article>
    );
  }
  return (
    <Link to={item.to} className="desk-card" data-testid={item.testId}>
      {body}
    </Link>
  );
}

/** The morning ledger: triage, money on the table, dispatch — read left to right. */
export default function DeskLedger({
  nudge,
  chase,
  board,
  draftingJobId,
  drafted,
  actionError,
  onDraftInvoice,
  onDismissNotice,
  daySheetHref,
  children,
}: DeskLedgerProps) {
  const nav = useNavigate();
  const triage = buildTriage(nudge);
  const uninvoicedCents = chase.uninvoiced.reduce((s, j) => s + j.quoted_cents, 0);
  const share = chase.on_table_cents > 0 ? Math.round((uninvoicedCents / chase.on_table_cents) * 100) : 0;
  const moneyQuiet = chase.uninvoiced.length === 0 && chase.overdue.length === 0;
  const jobsById = new Map(board.jobs.map((j) => [j.id, j]));

  return (
    <div className="desk" data-testid="desk">
      <h2 className="desk__title">
        The morning ledger — <time dateTime={nudge.date}>{longDate(nudge.date)}</time>
      </h2>

      <div className="desk__grid">
        <section className="desk-col" aria-labelledby="desk-triage-h" data-testid="desk-triage">
          <h3 id="desk-triage-h" className="desk-col__head">
            Triage
          </h3>
          <div className="desk-col__body">
            {triage.length === 0 ? (
              <p className="desk-empty" data-testid="desk-triage-empty">
                <strong>All square</strong>
                No reviews, recalls, chases or expiries. Good morning.
              </p>
            ) : (
              triage.map((item) => <TriageCard key={item.key} item={item} />)
            )}
          </div>
          <p className="desk-col__foot">
            <Link to="/notifications" className="desk-link">
              View all alerts <Icon name="arrow-right" size={16} />
            </Link>
          </p>
        </section>

        <section className="desk-col" aria-labelledby="desk-money-h" data-testid="desk-money">
          <h3 id="desk-money-h" className="desk-col__head">
            Money on the table
          </h3>
          <div className="desk-col__body">
            <div className="desk-panel">
              <p className="desk-panel__label">Total on the table</p>
              <p className="desk-total" data-testid="desk-on-table">
                {money(chase.on_table_cents)}
              </p>
              <div
                className="desk-meter"
                role="meter"
                aria-label="Share of the total that is finished work not yet invoiced"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={share}
              >
                <div className="desk-meter__fill" style={{ transform: `scaleX(${share / 100})` }} />
              </div>
              <p className="desk-panel__note">
                {plural(chase.uninvoiced.length, "job", "jobs")} · <span className="bf-mono">{money(uninvoicedCents)}</span> uninvoiced
              </p>

              {drafted && (
                <div className="desk-notice" role="status" data-testid="desk-draft-notice">
                  <span>
                    Draft <span className="bf-mono">{drafted.code}</span> created for {drafted.jobCode}.{" "}
                    <Link to={`/jobs/${drafted.jobId}`}>Open job</Link>
                  </span>
                  <button type="button" className="desk-notice__dismiss" onClick={onDismissNotice}>
                    Dismiss
                  </button>
                </div>
              )}
              {actionError && (
                <div className="desk-notice desk-notice--error" role="alert" data-testid="desk-draft-error">
                  <span>{actionError}</span>
                  <button type="button" className="desk-notice__dismiss" onClick={onDismissNotice}>
                    Dismiss
                  </button>
                </div>
              )}

              {moneyQuiet ? (
                <div className="desk-list">
                  <p className="desk-empty" data-testid="desk-money-empty">
                    <strong>Nothing owed, nothing waiting</strong>
                    Every finished job is invoiced and nothing is overdue.
                  </p>
                </div>
              ) : (
                <>
                  <div className="desk-list">
                    <div className="desk-list__head">
                      <p className="desk-panel__label">Uninvoiced jobs</p>
                      <span className="desk-list__count">{plural(chase.uninvoiced.length, "job", "jobs")}</span>
                    </div>
                    {chase.uninvoiced.length === 0 ? (
                      <p className="desk-panel__note">Every finished job has an invoice.</p>
                    ) : (
                      <ul className="desk-rows">
                        {chase.uninvoiced.map((j) => {
                          const busy = draftingJobId === j.id;
                          return (
                            <li key={j.id} className="desk-row desk-row--action">
                              <div className="desk-row__main">
                                <div style={{ minWidth: 0 }}>
                                  <Link to={`/jobs/${j.id}`} className="desk-row__code" style={{ textDecoration: "none", color: "inherit" }}>
                                    {j.code}
                                  </Link>
                                  <p className="desk-row__sub">{[j.client_name, j.title].filter(Boolean).join(" · ")}</p>
                                </div>
                              </div>
                              <span className="desk-row__amt">{money(j.quoted_cents)}</span>
                              <button
                                type="button"
                                className="bf-btn bf-btn--primary bf-btn--sm"
                                data-testid="desk-draft-invoice"
                                disabled={busy || draftingJobId !== null}
                                aria-busy={busy}
                                onClick={() => onDraftInvoice(j.id)}
                              >
                                {busy ? "Drafting…" : "Draft invoice"}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>

                  <div className="desk-list">
                    <div className="desk-list__head">
                      <p className="desk-panel__label">Overdue invoices</p>
                      <span className="desk-list__count">{plural(chase.overdue.length, "invoice", "invoices")}</span>
                    </div>
                    {chase.overdue.length === 0 ? (
                      <p className="desk-panel__note">Nothing overdue.</p>
                    ) : (
                      <ul className="desk-rows">
                        {chase.overdue.map((i) => {
                          const sub = [i.client_name ?? i.job_code, dueLabel(i.due_on, nudge.date)].filter(Boolean).join(" · ");
                          const open = i.job_id ? () => nav(`/jobs/${i.job_id}`) : undefined;
                          return (
                            <li
                              key={i.id}
                              className={`desk-row desk-row--compact${open ? " desk-row--link" : ""}`}
                              data-testid="desk-overdue-row"
                              role={open ? "link" : undefined}
                              tabIndex={open ? 0 : undefined}
                              onClick={open}
                              onKeyDown={open ? (e) => e.key === "Enter" && open() : undefined}
                            >
                              <div className="desk-row__main">
                                <span className="desk-row__dot" aria-hidden="true" />
                                <div style={{ minWidth: 0 }}>
                                  <span className="desk-row__code">{i.code}</span>
                                  <p className="desk-row__sub">{sub}</p>
                                </div>
                              </div>
                              <span className="desk-row__amt">{money(i.total_ex_cents)}</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
          <p className="desk-col__foot">
            <Link to="/jobs" className="desk-link">
              View all invoices and jobs <Icon name="arrow-right" size={16} />
            </Link>
          </p>
        </section>

        <section className="desk-col" aria-labelledby="desk-dispatch-h" data-testid="desk-dispatch">
          <h3 id="desk-dispatch-h" className="desk-col__head">
            Dispatch
          </h3>
          <div className="desk-col__body">
            <div className="desk-panel">
              <p className="desk-panel__title">Today’s crew allocation</p>
              <p className="desk-panel__sub">{longDate(board.date)}</p>
              {board.assignments.length === 0 && board.away.length === 0 ? (
                <p className="desk-empty" style={{ marginTop: 14 }} data-testid="desk-dispatch-empty">
                  <strong>No one allocated yet</strong>
                  Set the board and the day sheet fills itself.
                </p>
              ) : (
                <ul className="desk-crew">
                  {board.assignments.map((a) => {
                    const job = jobsById.get(a.job_id);
                    return (
                      <li key={a.id} className="desk-crew__row" data-testid="desk-crew-row">
                        <span className="desk-crew__avatar" aria-hidden="true">
                          {initials(a.user_name)}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <p className="desk-crew__name">{a.user_name}</p>
                          <p className="desk-crew__role">{a.time_window ?? "On site"}</p>
                        </div>
                        {job ? (
                          <Link to={`/jobs/${job.id}`} className="desk-jobchip" title={`${job.code} · ${job.title}`}>
                            <Icon name="van" size={16} />
                            <span className="desk-jobchip__text">
                              <span className="desk-jobchip__code">{job.code}</span>
                              <span className="desk-jobchip__site">{job.site_name ?? job.title}</span>
                            </span>
                          </Link>
                        ) : (
                          <span className="desk-jobchip">
                            <Icon name="van" size={16} />
                            <span className="desk-jobchip__text">Unassigned</span>
                          </span>
                        )}
                      </li>
                    );
                  })}
                  {board.away.map((w, i) => (
                    <li key={`away-${i}`} className="desk-crew__row" data-testid="desk-away-row">
                      <span className="desk-crew__avatar" aria-hidden="true" style={{ color: "var(--ink-mute)" }}>
                        {initials(w.user_name)}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <p className="desk-crew__name">{w.user_name}</p>
                        <p className="desk-crew__role">Away</p>
                      </div>
                      <Stamp label={w.kind} tone="mute" />
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <a className="bf-btn desk-print" href={daySheetHref} target="_blank" rel="noreferrer" data-testid="desk-print-sheet">
              <Icon name="printer" size={18} />
              Print day sheet
            </a>
          </div>
          <p className="desk-col__foot">
            <Link to="/dayboard" className="desk-link">
              View full dispatch board <Icon name="arrow-right" size={16} />
            </Link>
          </p>
        </section>
      </div>

      {children && <div className="desk-tools">{children}</div>}
    </div>
  );
}
