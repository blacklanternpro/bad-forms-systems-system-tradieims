import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "@/pages/Login";
import Layout from "@/cc/Layout";
import DayBoard from "@/cc/DayBoard";
import Quotes from "@/cc/Quotes";
import Jobs from "@/cc/Jobs";
import JobDetail from "@/cc/JobDetail";
import Inbox from "@/cc/Inbox";
import Ledger from "@/cc/Ledger";
import Directory from "@/cc/Directory";
import Modules from "@/cc/Modules";
import Field from "@/field/Field";
import PublicQuote from "@/pages/PublicQuote";
import PublicSign from "@/pages/PublicSign";
import { Toaster } from "sonner";

const Protected = ({ children }) =>
  localStorage.getItem("bf_token") ? children : <Navigate to="/login" replace />;

function App() {
  return (
    <>
      <Toaster theme="dark" position="top-right" toastOptions={{ style: { background: "#161b22", border: "1px solid #262f3d", color: "#e7ecf3", borderRadius: 0, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 } }} />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/cc" element={<Protected><Layout /></Protected>}>
            <Route index element={<Navigate to="/cc/day" replace />} />
            <Route path="day" element={<DayBoard />} />
            <Route path="quotes" element={<Quotes />} />
            <Route path="jobs" element={<Jobs />} />
            <Route path="jobs/:id" element={<JobDetail />} />
            <Route path="inbox" element={<Inbox />} />
            <Route path="ledger" element={<Ledger />} />
            <Route path="directory" element={<Directory />} />
            <Route path="modules" element={<Modules />} />
          </Route>
          <Route path="/f/:slug/*" element={<Field />} />
          <Route path="/q/:token" element={<PublicQuote />} />
          <Route path="/s/:token" element={<PublicSign />} />
          <Route path="*" element={<Navigate to={localStorage.getItem("bf_token") ? "/cc/day" : "/login"} replace />} />
        </Routes>
      </BrowserRouter>
    </>
  );
}
export default App;
