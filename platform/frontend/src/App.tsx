import { useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";

interface HealthState {
  status: "loading" | "ok" | "error";
}

function Shell() {
  const [health, setHealth] = useState<HealthState>({ status: "loading" });
  useEffect(() => {
    fetch("/api/health")
      .then((r) => (r.ok ? setHealth({ status: "ok" }) : setHealth({ status: "error" })))
      .catch(() => setHealth({ status: "error" }));
  }, []);
  return (
    <main className="bf-page" data-testid="scaffold-shell">
      <h1 className="bf-h1">BAD FORM SYSTEMS</h1>
      <p className="bf-mono">
        platform scaffold ·{" "}
        {health.status === "loading" ? "checking backend…" : health.status === "ok" ? "backend up" : "backend unreachable"}
      </p>
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="*" element={<Shell />} />
    </Routes>
  );
}
