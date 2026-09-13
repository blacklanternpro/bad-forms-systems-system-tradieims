import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { api, moduleLive, type FieldJobPack } from "../../api";
import Button from "../../components/Button";
import Icon, { type IconName } from "../../components/Icon";
import Sheet from "../../components/Sheet";
import Stamp from "../../components/Stamp";
import { EmptyView, ErrorView, LoadingView } from "../../components/StatusViews";
import { useAction, useLoad } from "../../hooks";
import { clockTime, elapsedLabel } from "../../lib/dates";
import { isOffline, queueCapture } from "../../lib/outbox";
import { DocketSheet, PrestartSheet } from "../civil/FieldCab";
import { RaiseVariation } from "../trades/Variations";
import "./Field.css";

interface CaptureType {
  value: string;
  label: string;
  hint: string;
  icon: IconName;
}

function captureTypes(): CaptureType[] {
  const types: CaptureType[] = [
    { value: "receipt", label: "Receipt or supplier invoice", hint: "Wholesaler docket, fuel, hire", icon: "document" },
    { value: "voice_timesheet", label: "Voice timesheet", hint: "Say who, where, and the hours", icon: "clock" },
    { value: "prestart", label: "Pre-start", hint: "Plant or vehicle check", icon: "clipboard" },
    { value: "incident", label: "Incident", hint: "Near miss, damage, injury", icon: "flag" },
  ];
  if (moduleLive("fleet")) types.push({ value: "load_restraint", label: "Load restraint photo", hint: "Before you roll", icon: "van" });
  return types;
}

type CaptureOutcome = "clean" | "review" | "outbox";

interface CaptureResult {
  outcome: CaptureOutcome;
  message: string;
}

const OUTCOME_STAMP: Record<CaptureOutcome, { label: string; tone: "ok" | "warn" }> = {
  clean: { label: "Captured", tone: "ok" },
  review: { label: "Sent for review", tone: "warn" },
  outbox: { label: "In the outbox", tone: "warn" },
};

/** Ticks once a minute so the on-the-clock line stays honest without a clock icon spinning. */
function useMinuteTick(active: boolean): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

/** The job pack: gate code, who's on, drawings, stages, hours, capture. */
export default function FieldJob() {
  const { id } = useParams<{ id: string }>();
  const pack = useLoad(() => api<FieldJobPack>(`/field/jobs/${id}`), [id]);
  const act = useAction();
  const [capOpen, setCapOpen] = useState(false);
  const [varOpen, setVarOpen] = useState(false);
  const [preOpen, setPreOpen] = useState(false);
  const [dockOpen, setDockOpen] = useState(false);
  const [capType, setCapType] = useState<string>("receipt");
  const [capFile, setCapFile] = useState<string | null>(null);
  const [capResult, setCapResult] = useState<CaptureResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const clocked = pack.data?.open_time_entry !== null && pack.data?.open_time_entry !== undefined;
  const now = useMinuteTick(clocked);

  if (pack.loading) {
    return (
      <div className="fd-screen">
        <BackLink />
        <LoadingView label="Opening job pack" rows={4} />
      </div>
    );
  }
  if (pack.error) {
    return (
      <div className="fd-screen">
        <BackLink />
        <ErrorView message={pack.error} onRetry={pack.reload} />
      </div>
    );
  }
  if (!pack.data) {
    return (
      <div className="fd-screen">
        <BackLink />
        <EmptyView icon="document" title="Job not found" hint="It may have been closed or moved. Check the board." />
      </div>
    );
  }

  const p = pack.data;
  const openEntry = p.open_time_entry;
  const stagesDone = p.stages.filter((s) => s.completed_at).length;
  const stageShare = p.stages.length ? Math.round((stagesDone / p.stages.length) * 100) : 0;

  const clock = (action: "start" | "stop") =>
    void act.run(async () => {
      await api(`/field/jobs/${id}/time`, { body: { action } });
      pack.reload();
    });

  const stageDone = (stageId: string) =>
    void act.run(async () => {
      await api(`/field/jobs/${id}/stage-done`, { body: { stage_id: stageId } });
      pack.reload();
    });

  const submitCapture = () =>
    void act.run(async () => {
      const form = new FormData();
      form.set("capture_type", capType);
      form.set("job_id", id ?? "");
      const f = fileRef.current?.files?.[0] ?? null;
      if (f) form.set("file", f);
      try {
        const res = await api<{ routing: string; confidence: number }>("/captures", { form });
        const conf = Number(res.confidence).toFixed(2);
        setCapResult(
          res.routing === "fast_track"
            ? { outcome: "clean", message: `Read clean (${conf}). It's on its way to the office.` }
            : { outcome: "review", message: `Not sure (${conf}). The office will check it.` },
        );
      } catch (err) {
        if (!isOffline(err)) throw err;
        await queueCapture(capType, id ?? "", f);
        setCapResult({ outcome: "outbox", message: "No signal. Saved to the outbox; it sends itself when you're back in range." });
      }
      if (fileRef.current) fileRef.current.value = "";
      setCapFile(null);
    });

  const openCapture = () => {
    setCapResult(null);
    setCapFile(null);
    setCapOpen(true);
  };

  return (
    <div className="fd-screen">
      <BackLink />

      <header className="fd-job">
        <p className="fd-job__code bf-mono">{p.job.code}</p>
        <h1 className="fd-job__title">{p.job.title}</h1>
        {p.job.client_name && <p className="fd-job__client">{p.job.client_name}</p>}
      </header>

      <section className="fd-card fd-keys" aria-label="Site details">
        <KeyRow icon="van" label="Site">
          <span className="fd-keys__value">{p.job.site_name ?? "Site to be confirmed"}</span>
          {p.job.address && <span className="fd-keys__sub">{p.job.address}</span>}
        </KeyRow>
        {p.job.gate_code && (
          <KeyRow icon="key" label="Gate code">
            <span className="fd-keys__value fd-keys__value--big bf-mono" data-testid="gate-code">
              {p.job.gate_code}
            </span>
          </KeyRow>
        )}
        {p.job.site_contact && (
          <KeyRow
            icon="phone"
            label="Site contact"
            action={
              p.job.site_phone ? (
                <a className="bf-btn bf-btn--sm fd-keys__call" href={`tel:${p.job.site_phone}`}>
                  <Icon name="phone" size={16} />
                  Call
                </a>
              ) : undefined
            }
          >
            <span className="fd-keys__value">{p.job.site_contact}</span>
            {p.job.site_phone && <span className="fd-keys__sub bf-mono">{p.job.site_phone}</span>}
          </KeyRow>
        )}
        {p.on_today.length > 0 && (
          <KeyRow icon="people" label="With you today">
            <span className="fd-keys__value">{p.on_today.join(", ")}</span>
          </KeyRow>
        )}
      </section>

      {act.error && <ErrorView message={act.error} />}

      <section className={`fd-card fd-clock${clocked ? " fd-clock--on" : ""}`} aria-label="Time on job">
        <div className="fd-clock__state">
          <span className="fd-clock__dot" aria-hidden="true" />
          <div>
            <p className="fd-clock__title">{clocked ? "On the clock" : "Not on the clock"}</p>
            <p className="fd-clock__sub">
              {clocked && openEntry
                ? `Since ${clockTime(openEntry.started_at)} · ${elapsedLabel(openEntry.started_at, now)}`
                : "Clock on when you start on site."}
            </p>
          </div>
        </div>
        <Button
          kind={clocked ? "danger" : "mark"}
          size="lg"
          icon="clock"
          full
          disabled={act.busy}
          onClick={() => clock(clocked ? "stop" : "start")}
          testId="clock"
        >
          {clocked ? "Clock off" : "Clock on"}
        </Button>
      </section>

      <section className="fd-verbs" aria-label="Actions">
        <Button kind="accent" size="lg" icon="camera" full onClick={openCapture} testId="capture-open">
          Capture paperwork
        </Button>
        {(moduleLive("trades") || moduleLive("civil")) && (
          <div className="fd-verbs__grid">
            {moduleLive("trades") && (
              <Button icon="flag" onClick={() => setVarOpen(true)} testId="variation-open">
                Raise variation
              </Button>
            )}
            {moduleLive("civil") && (
              <>
                <Button icon="clipboard" onClick={() => setPreOpen(true)} testId="prestart-open">
                  Pre-start
                </Button>
                <Button icon="document" onClick={() => setDockOpen(true)} testId="docket-open">
                  Hire docket
                </Button>
              </>
            )}
          </div>
        )}
      </section>

      {moduleLive("trades") && id && <RaiseVariation jobId={id} open={varOpen} onClose={() => setVarOpen(false)} />}
      {moduleLive("civil") && id && (
        <>
          <PrestartSheet jobId={id} open={preOpen} onClose={() => setPreOpen(false)} />
          <DocketSheet jobId={id} open={dockOpen} onClose={() => setDockOpen(false)} />
        </>
      )}

      <section className="fd-section" aria-labelledby="fd-stages">
        <div className="fd-section__head">
          <h2 id="fd-stages" className="fd-section__title">
            Stages
          </h2>
          {p.stages.length > 0 && (
            <span className="fd-section__count">
              {stagesDone} of {p.stages.length} signed off
            </span>
          )}
        </div>
        {p.stages.length > 0 && (
          <div className="fd-meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={stageShare} aria-label="Stages signed off">
            <span className="fd-meter__fill" style={{ transform: `scaleX(${stageShare / 100})` }} />
          </div>
        )}
        {p.stages.length === 0 ? (
          <EmptyView icon="check" title="No stages on this job" hint="The office adds stages from the job page." />
        ) : (
          <ol className="fd-card fd-list">
            {p.stages.map((s) => {
              const done = Boolean(s.completed_at);
              return (
                <li key={s.id} className={`fd-list__row${done ? " fd-list__row--done" : ""}`}>
                  <span className={`fd-list__mark${done ? " fd-list__mark--done" : ""}`} aria-hidden="true">
                    {done && <Icon name="check" size={16} />}
                  </span>
                  <span className="fd-list__body">
                    <span className="fd-list__title">{s.name}</span>
                    <span className={`fd-list__sub${!done && s.requires_photo ? " fd-list__sub--warn" : ""}`}>
                      {done ? "Signed off" : s.requires_photo ? "Needs a photo first" : "Open"}
                    </span>
                  </span>
                  {done ? (
                    <Stamp label="Done" tone="ok" />
                  ) : (
                    <Button size="sm" disabled={act.busy} onClick={() => stageDone(s.id)} testId={`stage-${s.sort}`}>
                      Sign off
                    </Button>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="fd-section" aria-labelledby="fd-drawings">
        <div className="fd-section__head">
          <h2 id="fd-drawings" className="fd-section__title">
            Drawings
          </h2>
          {p.drawings.length > 0 && <span className="fd-section__count">{p.drawings.length}</span>}
        </div>
        {p.drawings.length === 0 ? (
          <EmptyView icon="document" title="No drawings attached" hint="Ask the office to attach them to the job." />
        ) : (
          <ul className="fd-card fd-list">
            {p.drawings.map((doc) => (
              <li key={doc.id}>
                <a className="fd-list__row fd-list__row--link" href={`/api/documents/${doc.id}/raw`} target="_blank" rel="noreferrer">
                  <span className="fd-list__mark" aria-hidden="true">
                    <Icon name="document" size={16} />
                  </span>
                  <span className="fd-list__body">
                    <span className="fd-list__title">{doc.name}</span>
                    <span className="fd-list__sub">{doc.kind}</span>
                  </span>
                  <Icon name="external" size={18} />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Sheet title="Capture paperwork" open={capOpen} onClose={() => setCapOpen(false)} testId="capture-sheet">
        {capResult ? (
          <div className="fd-result">
            <span className={`fd-result__icon fd-result__icon--${capResult.outcome}`} aria-hidden="true">
              <Icon name={capResult.outcome === "clean" ? "check" : capResult.outcome === "outbox" ? "inbox" : "flag"} size={28} />
            </span>
            <Stamp label={OUTCOME_STAMP[capResult.outcome].label} tone={OUTCOME_STAMP[capResult.outcome].tone} testId="capture-result" />
            <p className="fd-result__text">{capResult.message}</p>
            <Button kind="mark" size="lg" full onClick={() => setCapOpen(false)}>
              Done
            </Button>
          </div>
        ) : (
          <div className="fd-capture">
            <fieldset className="fd-choice">
              <legend className="fd-choice__legend">What is it</legend>
              {captureTypes().map((t) => (
                <label key={t.value} className={`fd-choice__item${capType === t.value ? " fd-choice__item--on" : ""}`}>
                  <input
                    type="radio"
                    name="capture-type"
                    value={t.value}
                    checked={capType === t.value}
                    onChange={() => setCapType(t.value)}
                    data-testid={capType === t.value ? "capture-type" : undefined}
                  />
                  <span className="fd-choice__icon" aria-hidden="true">
                    <Icon name={t.icon} size={20} />
                  </span>
                  <span className="fd-choice__body">
                    <span className="fd-choice__label">{t.label}</span>
                    <span className="fd-choice__hint">{t.hint}</span>
                  </span>
                  <span className="fd-choice__radio" aria-hidden="true" />
                </label>
              ))}
            </fieldset>

            <div className="fd-file">
              <input
                ref={fileRef}
                id="capture-file"
                type="file"
                accept="image/*,audio/*"
                capture="environment"
                data-testid="capture-file"
                className="fd-file__input"
                onChange={(e) => setCapFile(e.target.files?.[0]?.name ?? null)}
              />
              <label htmlFor="capture-file" className="bf-btn bf-btn--lg fd-file__button">
                <Icon name="camera" size={20} />
                {capFile ? "Change photo or file" : "Take a photo or choose a file"}
              </label>
              <p className="fd-file__name" aria-live="polite">
                {capFile ?? "Nothing attached yet. Voice timesheets can go without a file."}
              </p>
            </div>

            <Button kind="mark" size="lg" full disabled={act.busy} onClick={submitCapture} testId="capture-submit">
              {act.busy ? "Reading…" : "Capture"}
            </Button>
          </div>
        )}
      </Sheet>
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/field" className="fd-back">
      <Icon name="arrow-left" size={18} />
      Board
    </Link>
  );
}

interface KeyRowProps {
  icon: IconName;
  label: string;
  action?: ReactNode;
  children: ReactNode;
}

function KeyRow({ icon, label, action, children }: KeyRowProps) {
  return (
    <div className="fd-keys__row">
      <span className="fd-keys__icon" aria-hidden="true">
        <Icon name={icon} size={18} />
      </span>
      <div className="fd-keys__body">
        <span className="fd-keys__label">{label}</span>
        {children}
      </div>
      {action}
    </div>
  );
}
