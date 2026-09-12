import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, getSession, setSession, type FieldBoard, type FieldJobPack, type Session } from "../api";
import KioskButton from "../components/KioskButton";
import Stamp from "../components/Stamp";
import { EmptyView, ErrorView, LoadingView } from "../components/StatusViews";
import { useAction, useLoad } from "../hooks";

const YARD_KEY = "bf_kiosk_yard";

interface KioskFrameProps {
  heading: string;
  sub?: string;
  onBack?: () => void;
  children: React.ReactNode;
}

/** Rugged-tablet chrome: giant type, one heading, at most two controls below. */
function KioskFrame({ heading, sub, onBack, children }: KioskFrameProps) {
  return (
    <div className="bf-page" style={{ maxWidth: 720, margin: "0 auto", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 14, padding: "18px 0 14px", borderBottom: "2px solid var(--ink)" }}>
        {onBack && (
          <button
            data-testid="kiosk-back"
            onClick={onBack}
            aria-label="Back"
            style={{
              minWidth: 72,
              minHeight: 72,
              fontSize: 30,
              background: "var(--ground-raise)",
              color: "var(--ink)",
              border: "2px solid var(--rule-strong)",
              borderRadius: "var(--radius)",
              cursor: "pointer",
            }}
          >
            ←
          </button>
        )}
        <div>
          <h1 className="bf-h1" style={{ fontSize: 26, margin: 0 }}>{heading}</h1>
          {sub && <p className="bf-mono" style={{ margin: "4px 0 0", fontSize: 14, color: "var(--ink-mute)" }}>{sub}</p>}
        </div>
      </header>
      <main style={{ flex: 1, padding: "20px 0", display: "grid", gap: 14, alignContent: "start" }}>{children}</main>
    </div>
  );
}

interface KioskPinProps {
  onSignedIn: (s: Session) => void;
}

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
        setError("PIN not recognised");
        setPin("");
      } finally {
        setBusy(false);
      }
    }
  };

  if (!yardSet) {
    return (
      <KioskFrame heading="SET UP THIS KIOSK" sub="Enter the yard code once — this tablet remembers it.">
        <label className="bf-label" style={{ display: "block" }}>
          YARD CODE
          <input
            data-testid="kiosk-yard"
            value={yard}
            onChange={(e) => setYard(e.target.value.toLowerCase())}
            placeholder="e.g. steelhaus"
            style={{ display: "block", width: "100%", marginTop: 6, fontSize: 24, padding: "16px 14px", fontFamily: "var(--font-mono)" }}
          />
        </label>
        <KioskButton
          label="LOCK IT IN"
          hint="Stored on this device"
          tone="mark"
          testId="kiosk-yard-save"
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
    <KioskFrame heading={`${yard.toUpperCase()} KIOSK`} sub="Tap your PIN">
      <p className="bf-mono" aria-label="PIN entered" style={{ textAlign: "center", fontSize: 34, letterSpacing: "0.5em", minHeight: 46, margin: 0 }}>
        {"●".repeat(pin.length)}
        {"○".repeat(4 - pin.length)}
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((d, i) =>
          d === "" ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              data-testid={`kiosk-pin-${d}`}
              disabled={busy}
              onClick={() => void tapDigit(d)}
              style={{
                minHeight: 88,
                fontSize: 30,
                fontFamily: "var(--font-mono)",
                background: "var(--ground-raise)",
                color: "var(--ink)",
                border: "2px solid var(--rule-strong)",
                borderRadius: "var(--radius)",
                cursor: "pointer",
                opacity: busy ? 0.4 : 1,
              }}
            >
              {d}
            </button>
          ),
        )}
      </div>
      {error && (
        <p role="alert" data-testid="kiosk-error" style={{ color: "var(--stamp-bad)", fontFamily: "var(--font-mono)", fontSize: 15, textAlign: "center", margin: 0 }}>
          {error}
        </p>
      )}
      <button
        className="bf-label"
        data-testid="kiosk-change-yard"
        onClick={() => {
          localStorage.removeItem(YARD_KEY);
          setYardSet(false);
          setPin("");
          setError(null);
        }}
        style={{ background: "none", border: 0, color: "var(--ink-mute)", cursor: "pointer", minHeight: "var(--tap-min)", justifySelf: "center" }}
      >
        CHANGE YARD
      </button>
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

  if (pack.loading) return <KioskFrame heading="OPENING JOB" onBack={onBack}><LoadingView label="OPENING JOB" /></KioskFrame>;
  if (pack.error) return <KioskFrame heading="JOB" onBack={onBack}><ErrorView message={pack.error} onRetry={pack.reload} /></KioskFrame>;
  if (!pack.data) return <KioskFrame heading="JOB" onBack={onBack}><EmptyView title="JOB NOT FOUND" /></KioskFrame>;

  const p = pack.data;
  const done = p.stages.filter((s) => s.completed_at).length;
  const next = p.stages.find((s) => !s.completed_at);

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
      {p.stages.length === 0 && <EmptyView title="NO STAGES ON THIS JOB" hint="The office applies an ITP from the job page." />}

      {p.stages.length > 0 && !next && (
        <div style={{ textAlign: "center", padding: "30px 0" }}>
          <Stamp label="ALL STAGES SIGNED OFF" tone="ok" testId="kiosk-all-done" />
          <p className="bf-mono" style={{ fontSize: 15, marginTop: 14 }}>MDR is ready for assembly at the office.</p>
        </div>
      )}

      {next && (
        <>
          <div>
            <p className="bf-label" style={{ margin: "0 0 6px" }}>STAGE {done + 1} OF {p.stages.length}</p>
            <p style={{ margin: 0, fontSize: 30, fontWeight: 700 }}>{next.name}</p>
            {next.requires_photo && (
              <p style={{ margin: "8px 0 0" }}>
                <Stamp label={photoIn ? "PHOTO IN" : "PHOTO REQUIRED"} tone={photoIn ? "ok" : "warn"} testId="kiosk-photo-state" />
              </p>
            )}
          </div>
          {act.error && <ErrorView message={act.error} />}
          <KioskButton
            label={act.busy ? "WORKING…" : "SIGN OFF"}
            hint={`Marks "${next.name}" complete`}
            tone="mark"
            testId="kiosk-signoff"
            onClick={signOff}
          />
          <KioskButton
            label="PHOTO"
            hint={next.requires_photo ? "This hold point needs one before sign-off" : "Evidence photo onto the job"}
            testId="kiosk-photo"
            onClick={() => fileRef.current?.click()}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            data-testid="kiosk-photo-file"
            style={{ display: "none" }}
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
    <KioskFrame heading={`${session.org.name} — SHOP FLOOR`} sub={`Signed on as ${session.user.name}`}>
      {board.loading && <LoadingView label="CHECKING THE BOARD" />}
      {board.error && <ErrorView message={board.error} onRetry={board.reload} />}
      {board.data && board.data.jobs.length === 0 && (
        <EmptyView title="NOTHING ON THE BOARD TODAY" hint="If that doesn't look right, ring the office." />
      )}
      {board.data &&
        board.data.jobs.map((j) => (
          <KioskButton
            key={j.job_id}
            label={j.code}
            hint={`${j.title}${j.site_name ? ` · ${j.site_name}` : ""}`}
            testId={`kiosk-job-${j.code}`}
            onClick={() => setJobId(j.job_id)}
          />
        ))}
      <button
        className="bf-label"
        data-testid="kiosk-exit"
        onClick={() => nav("/field")}
        style={{ background: "none", border: 0, color: "var(--ink-mute)", cursor: "pointer", minHeight: "var(--tap-min)", justifySelf: "center", marginTop: 10 }}
      >
        LEAVE KIOSK MODE
      </button>
    </KioskFrame>
  );
}
