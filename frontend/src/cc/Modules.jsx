import { useEffect, useState } from "react";
import { cc } from "@/lib/api";

const DESC = {
  trades: "Quotes, day board, field capture, verify gate, same-day extras, Xero drafts.",
  civil: "Wet-hire, halt badges, tips, SoR — separate commissioning.",
  fab: "Fabrication kiosks — separate commissioning.",
  fleet: "Plant & fleet — separate commissioning.",
};

export default function Modules() {
  const [mods, setMods] = useState({});
  useEffect(() => { cc.get("/modules").then((r) => setMods(r.data)); }, []);
  return (
    <div className="bf-enter">
      <div className="mb-8"><div className="bf-label mb-1">COMMISSIONING BOARD</div><h1 className="bf-h1 text-4xl">MODULES</h1></div>
      <div className="grid grid-cols-2 gap-6 bf-stagger">
        {Object.entries({ trades: mods.trades || "live", civil: "not_commissioned", fab: "not_commissioned", fleet: "not_commissioned" }).map(([k, v]) => (
          <div key={k} className={`bf-card p-8 ${v === "live" ? "bf-frame" : ""}`} data-testid={`module-${k}`} style={{ opacity: v === "live" ? 1 : 0.55 }}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="bf-h1 text-2xl">{k.toUpperCase()}</h3>
              <span className={`bf-chip ${v === "live" ? "chip-green" : "chip-red"}`} data-testid={`module-status-${k}`}>{v === "live" ? "LIVE" : "NOT COMMISSIONED"}</span>
            </div>
            <p className="mono text-xs" style={{ color: "#94a3b8" }}>{DESC[k]}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
