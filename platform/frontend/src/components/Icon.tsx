import type { ReactNode } from "react";

/** Line icons drawn in one stroke weight. Icon-sized SVG only; anything larger is an asset. */
export type IconName =
  | "inbox"
  | "recall"
  | "licence"
  | "quote"
  | "chevron-right"
  | "arrow-right"
  | "printer"
  | "van"
  | "away";

export interface IconProps {
  name: IconName;
  size?: number;
  title?: string;
}

const PATHS: Record<IconName, ReactNode> = {
  inbox: (
    <>
      <path d="M4 13.5V17a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3.5" />
      <path d="M4 13.5 6.2 6.3A1.5 1.5 0 0 1 7.6 5.3h8.8a1.5 1.5 0 0 1 1.4 1L20 13.5" />
      <path d="M4 13.5h4.5l1.2 2h4.6l1.2-2H20" />
    </>
  ),
  recall: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.5 8.5 13 12l-3.5 3.5" />
      <path d="M13 12H8.5" />
    </>
  ),
  licence: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <circle cx="9" cy="11" r="2" />
      <path d="M6 16c.6-1.4 1.7-2 3-2s2.4.6 3 2" />
      <path d="M14.5 10h3.5M14.5 13h3.5" />
    </>
  ),
  quote: (
    <>
      <path d="M7 3.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5Z" />
      <path d="M14 3.5V8h4" />
      <path d="M8.5 12h7M8.5 15.5h5" />
    </>
  ),
  "chevron-right": <path d="m9 6 6 6-6 6" />,
  "arrow-right": (
    <>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </>
  ),
  printer: (
    <>
      <path d="M7 8V4.5h10V8" />
      <rect x="3.5" y="8" width="17" height="8.5" rx="1.5" />
      <path d="M7 13.5h10v6H7z" />
    </>
  ),
  van: (
    <>
      <path d="M3.5 7.5h10v8h-10z" />
      <path d="M13.5 10h4.2l2.8 3v2.5h-7" />
      <circle cx="7" cy="17" r="1.6" />
      <circle cx="17" cy="17" r="1.6" />
    </>
  ),
  away: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
};

export default function Icon({ name, size = 20, title }: IconProps) {
  return (
    <svg
      className="bf-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      focusable="false"
    >
      {title && <title>{title}</title>}
      {PATHS[name]}
    </svg>
  );
}
