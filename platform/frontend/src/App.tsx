import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { getSession } from "./api";
import { applyTheme, currentTheme } from "./components/Chrome";
import Gallery from "./gallery/Gallery";
import Admin from "./screens/Admin";
import DayBoard from "./screens/DayBoard";
import Desk from "./screens/Desk";
import FieldJob from "./screens/field/FieldJob";
import FieldToday from "./screens/field/FieldToday";
import Inbox from "./screens/Inbox";
import JobDetail from "./screens/JobDetail";
import Jobs from "./screens/Jobs";
import Kiosk from "./screens/Kiosk";
import Login from "./screens/Login";
import Notifications from "./screens/Notifications";
import Quotes from "./screens/Quotes";
import Search from "./screens/Search";
import Dockets from "./screens/civil/Dockets";
import Plant from "./screens/civil/Plant";
import Shop from "./screens/fab/Shop";
import Fleet from "./screens/fleet/Fleet";
import Certs from "./screens/trades/Certs";
import CommandShell from "./shell/CommandShell";
import FieldShell from "./shell/FieldShell";

applyTheme(currentTheme());

function home(): string {
  const s = getSession();
  if (!s) return "/login";
  return s.user.role === "crew" ? "/field" : "/desk";
}

interface GuardProps { children: ReactNode; office?: boolean }

/** Route guard: no session → login; crew hitting an office page → field. */
function Guard({ children, office = false }: GuardProps) {
  const s = getSession();
  if (!s) return <Navigate to="/login" replace />;
  if (office && s.user.role === "crew") return <Navigate to="/field" replace />;
  return <>{children}</>;
}

function cc(el: ReactNode): ReactNode {
  return (
    <Guard office>
      <CommandShell>{el}</CommandShell>
    </Guard>
  );
}

function field(el: ReactNode): ReactNode {
  return (
    <Guard>
      <FieldShell>{el}</FieldShell>
    </Guard>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to={home()} replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/gallery" element={<Gallery />} />

      <Route path="/desk" element={cc(<Desk />)} />
      <Route path="/dayboard" element={cc(<DayBoard />)} />
      <Route path="/jobs" element={cc(<Jobs />)} />
      <Route path="/jobs/:id" element={cc(<JobDetail />)} />
      <Route path="/quotes" element={cc(<Quotes />)} />
      <Route path="/inbox" element={cc(<Inbox />)} />
      <Route path="/notifications" element={cc(<Notifications />)} />
      <Route path="/admin" element={cc(<Admin />)} />
      <Route path="/search" element={cc(<Search />)} />
      <Route path="/certs" element={cc(<Certs />)} />
      <Route path="/plant" element={cc(<Plant />)} />
      <Route path="/dockets" element={cc(<Dockets />)} />
      <Route path="/shop" element={cc(<Shop />)} />
      <Route path="/fleet" element={cc(<Fleet />)} />

      <Route path="/field" element={field(<FieldToday />)} />
      <Route path="/field/jobs/:id" element={field(<FieldJob />)} />
      <Route path="/kiosk" element={<Kiosk />} />

      <Route path="*" element={<Navigate to={home()} replace />} />
    </Routes>
  );
}
