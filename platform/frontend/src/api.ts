/** Typed API client + session. All requests go through `api()`; a 401 clears
    the session and returns the user to the login sheet. */

export interface SessionUser { id: string; name: string; role: "owner" | "office" | "crew" }
export interface SessionOrg {
  id: string;
  slug: string;
  name: string;
  theme: string;
  terminology: Record<string, string>;
  modules: Record<string, string>;
  is_demo: boolean;
}
export interface Session { token: string; user: SessionUser; org: SessionOrg }

const KEY = "bf_session";

export function getSession(): Session | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function setSession(s: Session | null): void {
  if (s) localStorage.setItem(KEY, JSON.stringify(s));
  else localStorage.removeItem(KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const BASE = import.meta.env.VITE_API_BASE ?? "";

export async function api<T>(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const s = getSession();
  const headers: Record<string, string> = {};
  if (s) headers.Authorization = `Bearer ${s.token}`;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}/api${path}`, {
    method: opts.method ?? (opts.body !== undefined || opts.form ? "POST" : "GET"),
    headers,
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });
  if (res.status === 401 && s) {
    setSession(null);
    window.location.href = "/login";
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = (await res.json()) as { detail?: string };
      if (j.detail) detail = j.detail;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}

export function money(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/* ------------------------------- API shapes ------------------------------- */

export interface JobRow {
  id: string;
  code: string;
  title: string;
  status: "quoted" | "scheduled" | "live" | "done" | "invoiced";
  client_name: string | null;
  quoted_cents: number;
  recall_on: string | null;
  starts_on: string | null;
}

export interface QuoteRow {
  id: string;
  code: string;
  title: string;
  status: "draft" | "sent" | "accepted" | "declined";
  client_name: string | null;
  total_ex_cents: number;
  valid_until: string | null;
  follow_up: boolean;
  overdue: boolean;
}

export interface CaptureCheck { name: string; ok: boolean; detail: string }
export interface CaptureRow {
  id: string;
  capture_type: string;
  status: string;
  confidence: number;
  extracted: Record<string, unknown>;
  checks: CaptureCheck[];
  job_code: string | null;
  created_by_name: string | null;
  created_at: string;
}

export interface NotificationRow {
  id: string;
  event_type: string;
  title: string;
  body: string;
  link: string | null;
  created_at: string;
}

export interface Nudge {
  date: string;
  recalls: { id: string; code: string; title: string; recall_on: string }[];
  quotes: { id: string; code: string; title: string; valid_until: string }[];
  review_count: number;
  licences_expiring: { kind: string; expires_on: string; user_name: string }[];
}

export interface ChaseList {
  uninvoiced: { id: string; code: string; title: string; quoted_cents: number; completed_at: string | null }[];
  overdue: { id: string; code: string; job_code: string | null; total_ex_cents: number; due_on: string | null }[];
  on_table_cents: number;
}

export interface TimelineEvent { id: string; kind: string; summary: string; created_at: string }

export interface JobCosting {
  hours: number;
  labour_cents: number;
  materials_cents: number;
  plant_cents: number;
  cost_cents: number;
  quoted_cents: number;
  margin_cents: number;
}

export interface JobStage { id: string; name: string; sort: number; requires_photo: boolean; completed_at: string | null }
export interface JobDocument { id: string; kind: string; name: string; created_at: string }
export interface JobCapture { id: string; capture_type: string; status: string; confidence: number; created_at: string }
export interface CommRow { channel: string; recipient: string; subject: string | null; status: string; created_at: string }

export interface JobDetail {
  job: JobRow & { site_name: string | null; address: string | null; gate_code: string | null; po_ref: string | null };
  stages: JobStage[];
  documents: JobDocument[];
  timeline: TimelineEvent[];
  comms: CommRow[];
  captures: JobCapture[];
  costing: JobCosting;
}

export interface FieldBoard {
  date: string;
  jobs: { job_id: string; code: string; title: string; window: string | null; site_name: string | null; address: string | null }[];
}

export interface FieldJobPack {
  job: {
    id: string;
    code: string;
    title: string;
    status: string;
    site_name: string | null;
    address: string | null;
    gate_code: string | null;
    site_contact: string | null;
    site_phone: string | null;
    client_name: string | null;
  };
  on_today: string[];
  drawings: { id: string; kind: string; name: string }[];
  stages: JobStage[];
  open_time_entry: { id: string; started_at: string } | null;
}

export interface SearchHits {
  jobs: { id: string; code: string; title: string }[];
  clients: { id: string; name: string }[];
  quotes: { id: string; code: string; title: string }[];
  pos: { id: string; code: string; supplier: string }[];
}

export interface OrgAdmin {
  id: string;
  slug: string;
  name: string;
  legal_name: string | null;
  abn: string | null;
  theme: string;
  settings: Record<string, unknown> & { ledger?: { provider: string; status?: string } };
  modules: Record<string, string>;
}

export interface OrgUser { id: string; name: string; email: string | null; role: string; pin: string | null; active: boolean }

/* ------------------------------ Trades pack ------------------------------ */

export interface VariationRow {
  id: string;
  code: string;
  title: string;
  detail: string | null;
  amount_cents: number;
  status: "proposed" | "approved" | "declined";
  job_code: string;
  job_title: string;
  raised_by_name: string | null;
  decided_by_name: string | null;
  created_at: string;
}

export interface CertRow {
  id: string;
  code: string;
  kind: string;
  status: "draft" | "issued";
  job_code: string | null;
  fields: Record<string, string>;
  issued_at: string | null;
  created_at: string;
}

export function moduleLive(name: string): boolean {
  const s = getSession();
  return s?.org.modules[name] === "live";
}
