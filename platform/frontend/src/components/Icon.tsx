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
  | "away"
  | "arrow-left"
  | "clock"
  | "camera"
  | "check"
  | "document"
  | "phone"
  | "key"
  | "people"
  | "sign-out"
  | "glove"
  | "calendar"
  | "close"
  | "external"
  | "backspace"
  | "wrench"
  | "flag"
  | "clipboard";

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
  "arrow-left": (
    <>
      <path d="M19 12H5" />
      <path d="m11 6-6 6 6 6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12h4" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.3l1.4-2h5.6l1.4 2h2.3A1.5 1.5 0 0 1 20 8.5V17a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17z" />
      <circle cx="12" cy="12.5" r="3.2" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  document: (
    <>
      <path d="M7 3.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5Z" />
      <path d="M14 3.5V8h4" />
    </>
  ),
  phone: (
    <path d="M6.5 4h3l1.5 4-2 1.5a9 9 0 0 0 5.5 5.5L16 13l4 1.5v3a1.5 1.5 0 0 1-1.5 1.5C10.5 19 5 13.5 5 5.5A1.5 1.5 0 0 1 6.5 4Z" />
  ),
  key: (
    <>
      <circle cx="8" cy="14" r="4" />
      <path d="m11 11 8.5-8.5" />
      <path d="M16 6l2.5 2.5M18 4l2 2" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19c.7-3.2 2.7-4.8 5.5-4.8s4.8 1.6 5.5 4.8" />
      <path d="M15.5 6a3 3 0 0 1 0 5.5" />
      <path d="M17 14.4c2.1.5 3.3 2 3.8 4.6" />
    </>
  ),
  "sign-out": (
    <>
      <path d="M13.5 4.5H6A1.5 1.5 0 0 0 4.5 6v12A1.5 1.5 0 0 0 6 19.5h7.5" />
      <path d="M16 8.5l4 3.5-4 3.5" />
      <path d="M20 12h-9.5" />
    </>
  ),
  glove: (
    <>
      <path d="M7.5 12V6.2a1.4 1.4 0 0 1 2.8 0V11" />
      <path d="M10.3 11V4.6a1.4 1.4 0 0 1 2.8 0V11" />
      <path d="M13.1 11V5.6a1.4 1.4 0 0 1 2.8 0V12.5" />
      <path d="M7.5 12l-1.6-1.8a1.4 1.4 0 0 0-2.2 1.7L7 16.5c1 2.4 2.6 3.5 5.3 3.5 3.5 0 5.6-2.2 5.6-5.6V9.4" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="1.5" />
      <path d="M3.5 9.5h17M8 3.5V6.5M16 3.5V6.5" />
    </>
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
  external: (
    <>
      <path d="M14 4.5h5.5V10" />
      <path d="M19.5 4.5 11 13" />
      <path d="M17 13.5V18a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18V8.5A1.5 1.5 0 0 1 6 7h4.5" />
    </>
  ),
  backspace: (
    <>
      <path d="M8.5 5.5h10A1.5 1.5 0 0 1 20 7v10a1.5 1.5 0 0 1-1.5 1.5h-10L3 12z" />
      <path d="m11 9.5 5 5M16 9.5l-5 5" />
    </>
  ),
  wrench: (
    <path d="M14.5 4.5a4.5 4.5 0 0 0 5 6l-8.7 8.7a2 2 0 0 1-2.9-2.9l8.7-8.7a4.5 4.5 0 0 0-2.1-2.1Z" />
  ),
  flag: (
    <>
      <path d="M6 20.5V4" />
      <path d="M6 4.5h11l-2 4 2 4H6" />
    </>
  ),
  clipboard: (
    <>
      <rect x="5.5" y="5" width="13" height="15.5" rx="1.5" />
      <path d="M9 5.5V4h6v1.5" />
      <path d="M9 11h6M9 14.5h4" />
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
