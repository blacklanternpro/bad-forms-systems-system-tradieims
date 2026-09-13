import { useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api, getSession, setSession, type FieldBoard, type FieldJobPack, type Session } from "../api";
import Icon from "../components/Icon";
import KioskButton from "../components/KioskButton";
import Stamp from "../components/Stamp";
import { EmptyView, ErrorView, LoadingView } from "../components/StatusViews";
import { useAction, useLoad } from "../hooks";
import "./Kiosk.css";

const YARD_KEY = "bf_kiosk_yard";

interface KioskFrameProps {
  heading: string;
  sub?: string;
  stamp?: string;
  onBack?: () => void;
  children: ReactNode;
}

/** Rugged-tablet chrome: giant type, one heading, at most two controls below. */
function KioskFrame({ heading, sub, stamp, onBack, children }: KioskFrameProps) {
  return (
    <div className="ks">
      <header className="ks-mast">
        {onBack && (
          <button type="button" data-testid="kiosk-back" onClick={onBack} aria-label="Back" className="ks-back">
            <Icon name="arrow-left" size={28} />
          </button>
        )}
        <div className="ks-mast__text">
          <h1 className="ks-mast__title">{heading}</h1>
          {sub && <p className="ks-mast__sub">{sub}</p>}
        </div>
        {stamp && <Stamp label={stamp} tone="mute" />}
      </header>
      <main className="ks-main">{children}</main>
    </div>
  );
}

interface KioskPinProps {
  onSignedIn: (s: Session) => void;
}

const PAD: string[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

/** One-time set-up: yard code remembered on the device, then it's PIN only.
    Once signed in the session sticks — no daily login ritual. */
function KioskPin({ onSignedIn }: KioskPinProps) {
  const [yard, setYard] = useState(localStorage.getItem(YARD_KEY) ?? "");
  const [yardSet, setYardSet] = useState(Boolean(localStorage.getItem(YARD_KEY)));
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tapDigit = async (d: string) => {
    if (busy) return;
    if (d === "⌫") {
      setPin((p) => p.slice(0, -1));
      return;
    }
    const next = (pin + d).slice(0, 4);
    setPin(next);
    if (next.length === 4) {
      setBusy(true);
      setError(null);
      try {
        const s = await api<Session>("/auth/pin", { body: { org_slug: yard, pin: next } });
        setSession(s);
        onSignedIn(s);
      } catch {
        setError("PIN not recognised. Try again or ask the office.");
        setPin("");
      } finally {
        setBusy(false);
      }
    }
  };

  if (!yardSet) {
    return (
      <KioskFrame heading="Set up this kiosk" sub="Enter the yard code once. This tablet remembers it." stamp="Kiosk">
        <label className="ks-field">
          <span className="ks-field__label">Yard code</span>
          <input
            data-testid="kiosk-yard"
            value={yard}
            onChange={(e) => setYard(e.target.value.toLowerCase())}
            placeholder="e.g. steelhaus"
            className="ks-field__input bf-mono"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>
        <KioskButton
          label="Lock it in"
          hint="Stored on this device"
          tone="mark"
          icon="key"
          testId="kiosk-yard-save"
          disabled={!yard.trim()}
          onClick={() => {
            if (!yard.trim()) return;
            localStorage.setItem(YARD_KEY, yard.trim());
            setYardSet(true);
          }}
        />
      </KioskFrame>
    );
  }

  return (
    <KioskFrame heading="Tap your PIN" sub={`Yard ${yard}`} stamp="Kiosk">
      <div className="ks-pin ks-main__centre">
        <p className="ks-pin__dots" aria-label={`${pin.length} of 4 digits entered`} role="status">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`ks-pin__dot${i < pin.length ? " ks-pin__dot--on" : ""}`} aria-hidden="true" />
          ))}
        </p>
        <div className="ks-pad" role="group" aria-label="PIN pad">
          {PAD.map((d, i) =>
            d === "" ? (
              <span key={i} aria-hidden="true" />
            ) : (
              <button
                key={i}
                type="button"
                data-testid={`kiosk-pin-${d}`}
                disabled={busy}
                onClick={() => void tapDigit(d)}
                className={`ks-pad__key${d === "⌫" ? " ks-pad__key--quiet" : ""}`}
                aria-label={d === "⌫" ? "Delete" : d}
              >
                {d === "⌫" ? <Icon name="backspace" size={30} /> : d}
              </button>
            ),
          )}
        </div>
        {error && (
          <p role="alert" data-testid="kiosk-error" className="ks-pin__error">
            {error}
          </p>
        )}
        <button
          type="button"
          className="ks-quiet"
          data-testid="kiosk-change-yard"
          onClick={() => {
            localStorage.removeItem(YARD_KEY);
            setYardSet(false);
            setPin("");
            setError(null);
          }}
        >
          Change yard
        </button>
      </div>
    </KioskFrame>
  );
}

interface KioskJobProps {
  jobId: string;
  onBack: () => void;
}

/** The two-control screen: the next hold point, sign it off or put a photo in. */
function KioskJob({ jobId, onBack }: KioskJobProps) {
  const pack = useLoad(() => api<FieldJobPack>(`/field/jobs/${jobId}`), [jobId]);
  const act = useAction();
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoIn, setPhotoIn] = useState(false);

  if (pack.loading) {
    return (
      <KioskFrame heading="Opening job" onBack={onBack}>
        <LoadingView label="Opening job" rows={2} />
      </KioskFrame>
    );
  }
  if (pack.error) {
    return (
      <KioskFrame heading="Job" onBack={onBack}>
        <ErrorView message={pack.error} onRetry={pack.reload} />
      </KioskFrame>
    );
  }
  if (!pack.data) {
    return (
      <KioskFrame heading="Job" onBack={onBack}>
        <EmptyView icon="document" title="Job not found" />
      </KioskFrame>
    );
  }

  const p = pack.data;
  const done = p.stages.filter((s) => s.completed_at).length;
  const next = p.stages.find((s) => !s.completed_at);
  const share = p.stages.length ? Math.round((done / p.stages.length) * 100) : 0;
  const photoNeeded = Boolean(next?.requires_photo) && !photoIn;

  const signOff = () => {
    if (!next || act.busy) return;
    void act.run(async () => {
      await api(`/field/jobs/${jobId}/stage-done`, { body: { stage_id: next.id } });
      setPhotoIn(false);
      pack.reload();
    });
  };

  const uploadPhoto = (file: File) =>
    void act.run(async () => {
      const form = new FormData();
      form.set("capture_type", "stage_photo");
      form.set("job_id", jobId);
      form.set("file", file);
      await api("/captures", { form });
      setPhotoIn(true);
      if (fileRef.current) fileRef.current.value = "";
    });

  return (
    <KioskFrame heading={p.job.code} sub={p.job.title} onBack={onBack}>
      {p.stages.length === 0 && <EmptyView icon="check" title="No stages on this job" hint="The office applies an ITP from the job page." />}

      {p.stages.length > 0 && !next && (
        <div className="ks-done">
          <span className="ks-done__icon" aria-hidden="true">
            <Icon name="check" size={36} />
          </span>
          <Stamp label="All stages signed off" tone="ok" testId="kiosk-all-done" />
          <p className="ks-done__text">MDR is ready for assembly at the office.</p>
        </div>
      )}

      {next && (
        <>
          <section className="ks-stage" aria-label="Next stage">
            <div className="ks-stage__head">
              <span className="ks-stage__count">
                Stage {done + 1} of {p.stages.length}
              </span>
              {next.requires_photo && (
                <Stamp label={photoIn ? "Photo in" : "Photo required"} tone={photoIn ? "ok" : "warn"} testId="kiosk-photo-state" />
              )}
            </div>
            <p className="ks-stage__name">{next.name}</p>
            <div className="ks-meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={share} aria-label="Stages signed off">
              <span className="ks-meter__fill" style={{ transform: `scaleX(${share / 100})` }} />
            </div>
          </section>
          {act.error && <ErrorView message={act.error} />}
          <KioskButton
            label={act.busy ? "Working…" : "Sign off"}
            hint={photoNeeded ? "Put a photo in first" : `Marks "${next.name}" complete`}
            tone={photoNeeded ? "quiet" : "mark"}
            icon="check"
            testId="kiosk-signoff"
            disabled={act.busy || photoNeeded}
            onClick={signOff}
          />
          <KioskButton
            label="Photo"
            hint={photoNeeded ? "This hold point needs one before sign-off" : "Evidence photo onto the job"}
            tone={photoNeeded ? "mark" : "quiet"}
            icon="camera"
            testId="kiosk-photo"
            disabled={act.busy}
            onClick={() => fileRef.current?.click()}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            data-testid="kiosk-photo-file"
            className="ks-hidden-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadPhoto(f);
            }}
          />
        </>
      )}
    </KioskFrame>
  );
}

/** Kiosk shell: the field app in rugged-tablet mode. A bolted-down tablet in the
    workshop — pick your job, sign off the next hold point, photo in. */
export default function Kiosk() {
  const nav = useNavigate();
  const [session, setSessionState] = useState<Session | null>(getSession());
  const [jobId, setJobId] = useState<string | null>(null);
  const board = useLoad(() => api<FieldBoard>("/field/today"), [session?.token]);

  if (!session) return <KioskPin onSignedIn={setSessionState} />;

  if (jobId) return <KioskJob jobId={jobId} onBack={() => setJobId(null)} />;

  return (
    <KioskFrame heading={session.org.name} sub={`Signed on as ${session.user.name}`} stamp="Shop floor">
      <h2 className="ks-h2">Pick your job</h2>
      {board.loading && <LoadingView label="Checking the board" rows={2} />}
      {board.error && <ErrorView message={board.error} onRetry={board.reload} />}
      {board.data && board.data.jobs.length === 0 && (
        <EmptyView icon="calendar" title="Nothing on the board today" hint="If that doesn't look right, ring the office." />
      )}
      {board.data &&
        board.data.jobs.map((j) => (
          <KioskButton
            key={j.job_id}
            label={j.title}
            hint={`${j.code}${j.site_name ? ` · ${j.site_name}` : ""}`}
            icon="wrench"
            testId={`kiosk-job-${j.code}`}
            onClick={() => setJobId(j.job_id)}
          />
        ))}
      <button type="button" className="ks-quiet" data-testid="kiosk-exit" onClick={() => nav("/field")}>
        Leave kiosk mode
      </button>
    </KioskFrame>
  );
}
