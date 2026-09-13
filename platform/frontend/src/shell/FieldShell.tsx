import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { getSession, setSession } from "../api";
import { applyBrand } from "../components/Chrome";
import Icon from "../components/Icon";
import Stamp from "../components/Stamp";
import { flush, pending } from "../lib/outbox";
import "../screens/field/Field.css";

export interface FieldShellProps {
  children: ReactNode;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** Field app chrome: one-thumb layout, bottom bar, glove mode always at hand.
    The capture outbox replays whenever the shell mounts or the signal returns. */
export default function FieldShell({ children }: FieldShellProps) {
  const nav = useNavigate();
  const s = getSession();
  const [queued, setQueued] = useState(pending().length);
  const [glove, setGlove] = useState(localStorage.getItem("bf_glove") === "on");

  useEffect(() => {
    applyBrand(getSession()?.org.brand?.tokens);
    const tryFlush = () => void flush().then(() => setQueued(pending().length));
    tryFlush();
    window.addEventListener("online", tryFlush);
    return () => window.removeEventListener("online", tryFlush);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-glove", glove ? "on" : "off");
    localStorage.setItem("bf_glove", glove ? "on" : "off");
  }, [glove]);

  if (!s) return null;

  return (
    <div className="fd">
      <header className="fd-mast">
        <span className="bf-wordmark fd-mast__word">{s.org.name}</span>
        <Stamp label="Field" tone="mute" />
        <span className="fd-mast__tools">
          {queued > 0 && <Stamp label={`Outbox ${queued}`} tone="warn" testId="outbox-count" />}
          <span className="bf-avatar" title={s.user.name} aria-label={`Signed in as ${s.user.name}`} role="img">
            {initials(s.user.name)}
          </span>
        </span>
      </header>
      <main className="fd-main">{children}</main>
      <nav aria-label="Field" className="fd-bar">
        <NavLink to="/field" end className="fd-bar__item">
          <Icon name="calendar" size={22} />
          <span>Today</span>
        </NavLink>
        <button
          type="button"
          data-testid="glove-toggle"
          className="fd-bar__item"
          aria-pressed={glove}
          onClick={() => setGlove(!glove)}
        >
          <Icon name="glove" size={22} />
          <span>Glove {glove ? "on" : "off"}</span>
        </button>
        <button
          type="button"
          data-testid="field-logout"
          className="fd-bar__item"
          onClick={() => {
            setSession(null);
            nav("/login");
          }}
        >
          <Icon name="sign-out" size={22} />
          <span>Sign out</span>
        </button>
      </nav>
    </div>
  );
}
