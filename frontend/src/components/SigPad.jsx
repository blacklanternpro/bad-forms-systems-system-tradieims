import { useRef, useState, useEffect } from "react";

export const SigPad = ({ onChange, height = 140 }) => {
  const ref = useRef(null);
  const drawing = useRef(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const c = ref.current;
    const ctx = c.getContext("2d");
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
  }, []);

  const pos = (e) => {
    const r = ref.current.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return [((p.clientX - r.left) / r.width) * ref.current.width, ((p.clientY - r.top) / r.height) * ref.current.height];
  };
  const start = (e) => { drawing.current = true; const ctx = ref.current.getContext("2d"); const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = ref.current.getContext("2d");
    const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke();
    if (!dirty) setDirty(true);
    onChange(ref.current.toDataURL("image/png"));
  };
  const end = () => { drawing.current = false; };
  const clear = () => {
    const c = ref.current;
    c.getContext("2d").clearRect(0, 0, c.width, c.height);
    setDirty(false); onChange(null);
  };

  return (
    <div>
      <canvas data-testid="signature-canvas" ref={ref} width={600} height={height * 2}
        style={{ width: "100%", height, background: "#0d1015", border: "1px dashed #3b4a5f", touchAction: "none" }}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
      <div className="flex justify-between items-center mt-1">
        <span className="bf-label">{dirty ? "SIGNATURE CAPTURED" : "SIGN IN THE BOX"}</span>
        <button type="button" data-testid="signature-clear-btn" className="bf-label" style={{ background: "none", border: 0, cursor: "pointer", color: "#94a3b8" }} onClick={clear}>CLEAR</button>
      </div>
    </div>
  );
};
