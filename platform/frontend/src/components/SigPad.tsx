import { useEffect, useRef, useState } from "react";

/** Canvas signature pad; returns a PNG data URL on change. */
export interface SigPadProps {
  onChange: (dataUrl: string | null) => void;
  height?: number;
  testId?: string;
}

export default function SigPad({ onChange, height = 160, testId }: SigPadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * dpr;
    c.height = height * dpr;
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--ink") || "#191712";
    }
  }, [height]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true;
    const ctx = canvasRef.current?.getContext("2d");
    const p = pos(e);
    ctx?.beginPath();
    ctx?.moveTo(p.x, p.y);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    const p = pos(e);
    ctx?.lineTo(p.x, p.y);
    ctx?.stroke();
    if (!dirty) setDirty(true);
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const c = canvasRef.current;
    if (c) onChange(c.toDataURL("image/png"));
  };
  const clear = () => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (c && ctx) ctx.clearRect(0, 0, c.width, c.height);
    setDirty(false);
    onChange(null);
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        data-testid={testId}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        style={{ width: "100%", height, background: "var(--ground-raise)", border: "1px solid var(--rule-strong)", borderRadius: "var(--radius)", touchAction: "none", display: "block" }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        <span className="bf-label">{dirty ? "Signed" : "Sign here"}</span>
        <button data-testid={testId ? `${testId}-clear` : undefined} onClick={clear} type="button" className="bf-quiet-btn" style={{ border: 0, minHeight: 32 }}>
          Clear
        </button>
      </div>
    </div>
  );
}
