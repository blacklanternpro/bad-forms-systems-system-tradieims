import { useEffect, useState } from "react";

export const THEMES = ["daybook", "amber-on-void", "paper-docket"] as const;
export type ThemeName = (typeof THEMES)[number];

export function applyTheme(theme: ThemeName): void {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("bf_theme", theme);
}

export function currentTheme(): ThemeName {
  const t = localStorage.getItem("bf_theme");
  return (THEMES as readonly string[]).includes(t ?? "") ? (t as ThemeName) : "daybook";
}

export interface ThemeSwitchProps { testId?: string }
export function ThemeSwitch({ testId }: ThemeSwitchProps) {
  const [theme, setTheme] = useState<ThemeName>(currentTheme());
  useEffect(() => applyTheme(theme), [theme]);
  return (
    <label className="bf-label" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      THEME
      <select data-testid={testId ?? "theme-switch"} value={theme} onChange={(e) => setTheme(e.target.value as ThemeName)} style={{ minHeight: 32, padding: "2px 8px" }}>
        {THEMES.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
    </label>
  );
}

export interface GloveToggleProps { testId?: string }
export function GloveToggle({ testId }: GloveToggleProps) {
  const [on, setOn] = useState(localStorage.getItem("bf_glove") === "on");
  useEffect(() => {
    document.documentElement.setAttribute("data-glove", on ? "on" : "off");
    localStorage.setItem("bf_glove", on ? "on" : "off");
  }, [on]);
  return (
    <button
      data-testid={testId ?? "glove-toggle"}
      onClick={() => setOn(!on)}
      style={{
        background: on ? "var(--mark)" : "var(--ground-raise)",
        color: on ? "var(--mark-ink)" : "var(--ink-mute)",
        border: "1px solid var(--rule-strong)",
        borderRadius: "var(--radius)",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        letterSpacing: "0.1em",
        padding: "6px 12px",
        minHeight: 32,
        cursor: "pointer",
      }}
    >
      GLOVE MODE {on ? "ON" : "OFF"}
    </button>
  );
}
