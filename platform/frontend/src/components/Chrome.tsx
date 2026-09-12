import { useEffect, useState, type ReactNode } from "react";

export const THEMES = ["daybook", "amber-on-void", "paper-docket"] as const;
export type ThemeName = (typeof THEMES)[number];

const THEME_LABEL: Record<ThemeName, string> = {
  daybook: "Daybook",
  "amber-on-void": "Amber on void",
  "paper-docket": "Paper docket",
};

export function applyTheme(theme: ThemeName): void {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("bf_theme", theme);
}

export function currentTheme(): ThemeName {
  const t = localStorage.getItem("bf_theme");
  return (THEMES as readonly string[]).includes(t ?? "") ? (t as ThemeName) : "daybook";
}

const BRAND_KEY = "bf_brand_tokens";

/** Client-brand token overrides on top of the active theme (the starter reskin
    the Foundry generates). Clears whatever the previous session applied. */
export function applyBrand(tokens: Record<string, string> | undefined): void {
  const el = document.documentElement;
  let prev: Record<string, string> = {};
  try {
    prev = JSON.parse(localStorage.getItem(BRAND_KEY) ?? "{}") as Record<string, string>;
  } catch {
    prev = {};
  }
  for (const k of Object.keys(prev)) el.style.removeProperty(k);
  const next = tokens ?? {};
  for (const [k, v] of Object.entries(next)) {
    if (k.startsWith("--")) el.style.setProperty(k, v);
  }
  localStorage.setItem(BRAND_KEY, JSON.stringify(next));
}

export interface ThemeSwitchProps {
  testId?: string;
}
export function ThemeSwitch({ testId }: ThemeSwitchProps) {
  const [theme, setTheme] = useState<ThemeName>(currentTheme());
  useEffect(() => applyTheme(theme), [theme]);
  return (
    <label className="bf-label" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      Theme
      <select data-testid={testId ?? "theme-switch"} value={theme} onChange={(e) => setTheme(e.target.value as ThemeName)}>
        {THEMES.map((t) => (
          <option key={t} value={t}>
            {THEME_LABEL[t]}
          </option>
        ))}
      </select>
    </label>
  );
}

export interface GloveToggleProps {
  testId?: string;
}
export function GloveToggle({ testId }: GloveToggleProps) {
  const [on, setOn] = useState(localStorage.getItem("bf_glove") === "on");
  useEffect(() => {
    document.documentElement.setAttribute("data-glove", on ? "on" : "off");
    localStorage.setItem("bf_glove", on ? "on" : "off");
  }, [on]);
  return (
    <button
      type="button"
      data-testid={testId ?? "glove-toggle"}
      className="bf-chip"
      aria-pressed={on}
      onClick={() => setOn(!on)}
    >
      Glove {on ? "on" : "off"}
    </button>
  );
}

export interface ChipProps {
  label: string;
  active?: boolean;
  onClick: () => void;
  testId?: string;
  role?: "tab" | "button";
}
export function Chip({ label, active, onClick, testId, role = "button" }: ChipProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      className="bf-chip"
      role={role === "tab" ? "tab" : undefined}
      aria-pressed={role === "button" ? !!active : undefined}
      aria-selected={role === "tab" ? !!active : undefined}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export interface PageHeadProps {
  title: string;
  children?: ReactNode;
}
export function PageHead({ title, children }: PageHeadProps) {
  return (
    <div className="bf-pagehead">
      <h2 className="bf-h2">{title}</h2>
      {children}
    </div>
  );
}
