import type { ChangeEvent } from "react";

/** Labelled input, DAYBOOK form row. */
export interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "date" | "number" | "email" | "password" | "tel";
  placeholder?: string;
  required?: boolean;
  testId?: string;
}

export default function Field({ label, value, onChange, type = "text", placeholder, required, testId }: FieldProps) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <span className="bf-label" style={{ display: "block", marginBottom: 4 }}>
        {label}
        {required ? " *" : ""}
      </span>
      <input
        data-testid={testId}
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        style={{ width: "100%" }}
      />
    </label>
  );
}
