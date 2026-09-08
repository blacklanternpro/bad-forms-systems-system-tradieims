import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { fx, API, money, errMsg } from "@/lib/api";
import { queueOp, flush, compressImage } from "@/lib/outbox";
import { SigPad } from "@/components/SigPad";
import { toast } from "sonner";

const Sheet = ({ title, onClose, children, testid }) => (
  <>
    <div className="sheet-backdrop" onClick={onClose} />
    <div className="sheet p-5" data-testid={testid}>
      <div className="flex justify-between items-center mb-4">
        <span className="bf-label" style={{ color: "#f59e0b", fontSize: 12 }}>{title}</span>
        <button className="bf-btn" onClick={onClose} data-testid="sheet-close-btn">CLOSE</button>
      </div>
      {children}
    </div>
  </>
);

export default function FieldJob({ onQueue }) {
  const { slug, jobId } = useParams();
  const nav = useNavigate();
  const [d, setD] = useState(null);
  const [sheet, setSheet] = useState(null);
  const load = useCallback(() => fx.get(`/field/jobs/${jobId}`).then((r) => setD(r.data)).catch(() => {}), [jobId]);
  useEffect(() => { load(); }, [load]);
  if (!d) return <div className="p-8 mono text-xs" style={{ color: "#94a3b8" }}>LOADING…</div>;

  return (
    <div className="px-5 py-6" style={{ paddingBottom: 110 }}>
      <button className="bf-label mb-3" style={{ background: "none", border: 0, cursor: "pointer" }} data-testid="field-back-btn" onClick={() => nav(`/f/${slug}`)}>◂ TODAY</button>
      <div className="mono text-xs" style={{ color: "#f59e0b" }}>{d.job.code} · {d.job.billing.toUpperCase()}</div>
      <h1 className="bf-h1 text-2xl mb-1" data-testid="field-job-title">{d.job.title}</h1>
      <div className="mono text-xs mb-5" style={{ color: "#94a3b8" }}>{d.client.name} · {d.site?.address_text || d.site?.name || ""}</div>

      <div className="bf-card p-4 mb-4">
        <div className="bf-label mb-2">VARIATIONS</div>
        {d.variations.length === 0 && <div className="mono text-xs" style={{ color: "#4b5563" }}>NONE YET</div>}
        {d.variations.map((v) => (
          <div key={v.id} className="flex justify-between mono text-xs py-1">
            <span>{v.code} {v.title}</span>
            <span className={`bf-chip ${v.status === "signed" ? "chip-green" : "chip-steel"}`}>{v.status.toUpperCase()}</span>
          </div>
        ))}
      </div>
      <div className="bf-card p-4">
        <div className="bf-label mb-2">RECENT CAPTURES</div>
        <div className="mono text-xs" style={{ color: "#94a3b8" }}>{d.documents.length} documents on this job</div>
      </div>

      <div className="fixed left-0 right-0 bottom-0 grid grid-cols-5" style={{ maxWidth: 560, margin: "0 auto", borderTop: "2px solid #f59e0b", background: "#0d1015", zIndex: 30 }}>
        {[["capture", "CAPTURE"], ["hours", "HOURS"], ["extra", "EXTRA"], ["cert", "CERT"], ["pack", "PACK"]].map(([k, l]) => (
          <button key={k} data-testid={`sheet-btn-${k}`} onClick={() => k === "pack" ? window.open(`${API}/field/jobs/${jobId}/pack.pdf?auth=${localStorage.getItem("bf_field_token")}`, "_blank") : setSheet(k)}
            className="mono text-xs py-4" style={{ background: "none", border: 0, borderRight: "1px solid #1c232e", color: "#e7ecf3", letterSpacing: "0.12em", cursor: "pointer" }}>{l}</button>
        ))}
      </div>

      {sheet === "capture" && <CaptureSheet jobId={jobId} onClose={() => { setSheet(null); load(); }} onQueue={onQueue} />}
      {sheet === "hours" && <HoursSheet jobId={jobId} onClose={() => { setSheet(null); load(); }} onQueue={onQueue} />}
      {sheet === "extra" && <ExtraSheet jobId={jobId} d={d} onClose={() => { setSheet(null); load(); }} onQueue={onQueue} />}
      {sheet === "cert" && <CertSheet jobId={jobId} d={d} onClose={() => { setSheet(null); load(); }} />}
    </div>
  );
}

const CaptureSheet = ({ jobId, onClose, onQueue }) => {
  const [kind, setKind] = useState("docket_photo");
  const [busy, setBusy] = useState(false);
  const [recSecs, setRecSecs] = useState(null);
  const fileRef = useRef();
  const recRef = useRef(null);

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    const blob = await compressImage(f);
    const op = { url: `/field/jobs/${jobId}/capture`, form: { kind }, blob: await blob.arrayBuffer(), blobType: "image/jpeg" };
    await queueOp(op);
    onQueue && onQueue();
    if (navigator.onLine) {
      const n = await flush(API);
      if (n) toast.success(kind === "docket_photo" ? "CAPTURED → EXTRACTING → INBOX (NEEDS VERIFY)" : "PHOTO SAVED");
      else toast.info("QUEUED — WILL SYNC");
    } else {
      toast.info("OFFLINE — QUEUED");
    }
    setBusy(false);
    onClose();
  };

  const stopRec = () => { if (recRef.current?.state === "recording") recRef.current.stop(); };

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks = [];
      mr.ondataavailable = (e) => chunks.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecSecs(null);
        const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
        await queueOp({ url: `/field/jobs/${jobId}/capture`, form: { kind: "voice_note" }, blob: await blob.arrayBuffer(), blobType: "audio/webm", filename: "voice.webm" });
        onQueue && onQueue();
        if (navigator.onLine) { await flush(API); toast.success("VOICE TIMESHEET → INBOX (NEEDS VERIFY)"); }
        else toast.info("OFFLINE — QUEUED");
        onClose();
      };
      recRef.current = mr;
      mr.start();
      setRecSecs(0);
      let s = 0;
      const iv = setInterval(() => {
        s += 1; setRecSecs(s);
        if (s >= 10 || mr.state !== "recording") { clearInterval(iv); if (mr.state === "recording") mr.stop(); }
      }, 1000);
    } catch (e) { toast.error("MIC UNAVAILABLE — " + e.message); }
  };

  return (
    <Sheet title="CAPTURE — TAG THEN SHOOT" onClose={onClose} testid="capture-sheet">
      <div className="grid grid-cols-4 gap-2 mb-4">
        {[["docket_photo", "DOCKET"], ["before_photo", "BEFORE"], ["after_photo", "AFTER"], ["voice_note", "VOICE"]].map(([k, l]) => (
          <button key={k} className={`bf-btn ${kind === k ? "bf-btn-amber" : ""}`} data-testid={`capture-kind-${k}`} onClick={() => setKind(k)}>{l}</button>
        ))}
      </div>
      {kind === "voice_note" ? (
        recSecs === null ? (
          <button className="bf-btn bf-btn-amber w-full py-4" data-testid="voice-record-btn" onClick={startRec}>RECORD VOICE TIMESHEET (MAX 10s)</button>
        ) : (
          <button className="bf-btn w-full py-4" data-testid="voice-stop-btn" style={{ borderColor: "#ef4444", color: "#ef4444" }} onClick={stopRec}>● RECORDING {recSecs}s / 10s — TAP TO STOP</button>
        )
      ) : (
        <>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={onFile} data-testid="capture-file-input" />
          <button className="bf-btn bf-btn-amber w-full py-4" data-testid="capture-shoot-btn" disabled={busy} onClick={() => fileRef.current.click()}>
            {busy ? "COMPRESSING…" : "PHOTOGRAPH (≤1600px · JPEG 0.7)"}
          </button>
        </>
      )}
      <p className="mono text-xs mt-3" style={{ color: "#4b5563" }}>Dockets and voice timesheets go through the verify gate — nothing hits the ledger without a human.</p>
    </Sheet>
  );
};

const CertSheet = ({ jobId, d, onClose }) => {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef();

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!name.trim()) { toast.error("NAME THE CERT FIRST"); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("name", name);
      const { data } = await fx.post(`/field/jobs/${jobId}/certs`, fd);
      toast.success(data.emailed_to ? `CERT STORED + QUEUED TO ${data.emailed_to} — GOES OUT WITH THE PACK` : "CERT STORED — CLIENT HAS NO EMAIL, IT RIDES IN THE PACK");
      onClose();
    } catch (e2) { toast.error(errMsg(e2)); }
    setBusy(false);
  };

  return (
    <Sheet title="CERTIFICATE — ATTACH & QUEUE TO CLIENT" onClose={onClose} testid="cert-sheet">
      <div className="bf-label mb-1">CERT NAME</div>
      <input className="bf-input mb-3" placeholder="e.g. Electrical Safety Certificate #ES-2210" data-testid="cert-name-input" value={name} onChange={(e) => setName(e.target.value)} />
      <input ref={fileRef} type="file" accept="application/pdf" style={{ display: "none" }} onChange={onFile} data-testid="cert-file-input" />
      <button className="bf-btn bf-btn-amber w-full py-4" data-testid="cert-upload-btn" disabled={busy || !name.trim()} onClick={() => fileRef.current.click()}>
        {busy ? "UPLOADING…" : "ATTACH PDF + QUEUE TO CLIENT"}
      </button>
      <p className="mono text-xs mt-3" style={{ color: "#4b5563" }}>Queues to the bill-to email {d.bill_to?.email ? `(${d.bill_to.email})` : "(none on file — stored only)"} and is listed on the job pack PDF.</p>
    </Sheet>
  );
};

const HoursSheet = ({ jobId, onClose, onQueue }) => {
  const now = new Date();
  const hh = (h) => String(h).padStart(2, "0");
  const [start, setStart] = useState(`${hh(Math.max(now.getHours() - 4, 0))}:00`);
  const [end, setEnd] = useState(`${hh(now.getHours())}:00`);
  const [note, setNote] = useState("");

  const submit = async () => {
    const today = new Date().toISOString().slice(0, 10);
    const op = { url: `/field/jobs/${jobId}/hours`, json: { started_at: `${today}T${start}:00+08:00`, ended_at: `${today}T${end}:00+08:00`, note } };
    await queueOp(op);
    onQueue && onQueue();
    if (navigator.onLine) { await flush(API); toast.success("HOURS LOGGED"); } else toast.info("OFFLINE — QUEUED");
    onClose();
  };
  return (
    <Sheet title="HOURS — AWST" onClose={onClose} testid="hours-sheet">
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div><div className="bf-label mb-1">ON</div><input type="time" className="bf-input" data-testid="hours-start-input" value={start} onChange={(e) => setStart(e.target.value)} /></div>
        <div><div className="bf-label mb-1">OFF</div><input type="time" className="bf-input" data-testid="hours-end-input" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
      </div>
      <input className="bf-input mb-4" placeholder="note (optional)" data-testid="hours-note-input" value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="bf-btn bf-btn-amber w-full" data-testid="hours-submit-btn" onClick={submit}>LOG HOURS</button>
    </Sheet>
  );
};

const ExtraSheet = ({ jobId, d, onClose, onQueue }) => {
  const [tab, setTab] = useState("vo");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [vo, setVo] = useState(null);
  const [name, setName] = useState("");
  const [sig, setSig] = useState(null);
  const [email, setEmail] = useState(d.bill_to?.email || "");
  const [mode, setMode] = useState(null);
  const [kind, setKind] = useState("travel");
  const [desc, setDesc] = useState("");
  const [qty, setQty] = useState(1);
  const [unit, setUnit] = useState("");

  const createVo = async () => {
    if (!title || !amount) return toast.error("TITLE + AMOUNT");
    try {
      const { data } = await fx.post(`/field/jobs/${jobId}/variations`, { title, amount_cents: Math.round(Number(amount) * 100) });
      setVo(data);
      toast.success(`${data.code} DRAFTED — NOW GET IT SIGNED`);
    } catch (e) { toast.error(errMsg(e)); }
  };

  const signCanvas = async () => {
    if (!name || !sig) return toast.error("NAME + SIGNATURE REQUIRED");
    try {
      await fx.post(`/field/variations/${vo.id}/sign-canvas`, { name, image_base64: sig });
      toast.success("SIGNED ON DEVICE — SIGNED COPY EMAIL QUEUED");
      onClose();
    } catch (e) { toast.error(errMsg(e)); }
  };

  const sendEmail = async () => {
    try {
      const { data } = await fx.post(`/field/variations/${vo.id}/send-email`, email ? { to_email: email } : {});
      toast.success(`SIGN LINK EMAILED TO ${data.to_email}`);
      onClose();
    } catch (e) { toast.error(errMsg(e)); }
  };

  const addExtra = async () => {
    if (!unit) return toast.error("AMOUNT REQUIRED");
    const op = { url: `/field/jobs/${jobId}/extras`, json: { kind, description: desc, qty: Number(qty), unit_cents: Math.round(Number(unit) * 100) } };
    await queueOp(op);
    onQueue && onQueue();
    if (navigator.onLine) { await flush(API); toast.success("EXTRA ADDED"); } else toast.info("OFFLINE — QUEUED");
    onClose();
  };

  return (
    <Sheet title="EXTRA — SAME-DAY, SIGNED, DIGITAL" onClose={onClose} testid="extra-sheet">
      <div className="grid grid-cols-2 gap-2 mb-4">
        <button className={`bf-btn ${tab === "vo" ? "bf-btn-amber" : ""}`} data-testid="extra-tab-vo" onClick={() => setTab("vo")}>VARIATION (VO)</button>
        <button className={`bf-btn ${tab === "line" ? "bf-btn-amber" : ""}`} data-testid="extra-tab-line" onClick={() => setTab("line")}>TRAVEL / CALLOUT</button>
      </div>

      {tab === "vo" && !vo && (
        <>
          <input className="bf-input mb-2" placeholder="What changed? e.g. Extra circuit for shed" data-testid="vo-title-input" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className="bf-input mb-4" type="number" placeholder="Amount $ ex GST" data-testid="vo-amount-input" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <button className="bf-btn bf-btn-amber w-full" data-testid="vo-create-btn" onClick={createVo}>DRAFT VARIATION</button>
        </>
      )}

      {tab === "vo" && vo && !mode && (
        <div className="space-y-3">
          <div className="mono text-sm" style={{ color: "#f59e0b" }} data-testid="vo-code">{vo.code} — {title} — {money(Math.round(Number(amount) * 100))} ex GST</div>
          <button className="bf-btn bf-btn-amber w-full py-4" data-testid="vo-sign-phone-btn" onClick={() => setMode("canvas")}>SIGN ON THIS PHONE</button>
          <button className="bf-btn w-full py-4" data-testid="vo-email-btn" onClick={() => setMode("email")} >EMAIL TO SIGN</button>
        </div>
      )}

      {tab === "vo" && vo && mode === "canvas" && (
        <div className="space-y-3">
          <input className="bf-input" placeholder="Signer name" data-testid="vo-signer-name-input" value={name} onChange={(e) => setName(e.target.value)} />
          <SigPad onChange={setSig} />
          <button className="bf-btn bf-btn-amber w-full" data-testid="vo-sign-submit-btn" onClick={signCanvas}>LOCK SIGNATURE</button>
        </div>
      )}

      {tab === "vo" && vo && mode === "email" && (
        <div className="space-y-3">
          {d.bill_to?.email ? (
            <div className="bf-label">DEFAULT: BILL-TO {d.bill_to.email} — OVERRIDE BELOW IF NEEDED</div>
          ) : (
            <div className="mono text-xs" style={{ color: "#ef4444" }} data-testid="no-customer-email">NO CUSTOMER EMAIL — enter one or use canvas sign</div>
          )}
          <input className="bf-input" placeholder="customer@builder.com.au" data-testid="vo-email-input" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="bf-btn bf-btn-amber w-full" data-testid="vo-email-send-btn" onClick={sendEmail} disabled={!email}>SEND SIGN LINK</button>
        </div>
      )}

      {tab === "line" && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {["travel", "callout", "other"].map((k) => (
              <button key={k} className={`bf-btn ${kind === k ? "bf-btn-amber" : ""}`} data-testid={`extra-kind-${k}`} onClick={() => setKind(k)}>{k.toUpperCase()}</button>
            ))}
          </div>
          <input className="bf-input" placeholder="description" data-testid="extra-desc-input" value={desc} onChange={(e) => setDesc(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <input className="bf-input" type="number" placeholder="qty" data-testid="extra-qty-input" value={qty} onChange={(e) => setQty(e.target.value)} />
            <input className="bf-input" type="number" placeholder="unit $ ex GST" data-testid="extra-unit-input" value={unit} onChange={(e) => setUnit(e.target.value)} />
          </div>
          <button className="bf-btn bf-btn-amber w-full" data-testid="extra-submit-btn" onClick={addExtra}>ADD EXTRA LINE</button>
        </div>
      )}
    </Sheet>
  );
};
