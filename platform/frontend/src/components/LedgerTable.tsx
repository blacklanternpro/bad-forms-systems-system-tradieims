import type { ReactNode } from "react";

/** Ledger-ruled table: hairline rows, tabular numerals, mono figures. */
export interface LedgerColumn<T> {
  key: string;
  label: string;
  align?: "left" | "right";
  render: (row: T) => ReactNode;
}

export interface LedgerTableProps<T> {
  columns: LedgerColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  empty: string;
  testId?: string;
}

export default function LedgerTable<T>({ columns, rows, rowKey, onRowClick, empty, testId }: LedgerTableProps<T>) {
  if (rows.length === 0) {
    return (
      <p className="bf-label" data-testid={testId ? `${testId}-empty` : undefined} style={{ padding: "28px 0", textAlign: "center", borderTop: "1px solid var(--rule)", borderBottom: "1px solid var(--rule)" }}>
        {empty}
      </p>
    );
  }
  return (
    <div style={{ overflowX: "auto" }}>
      <table data-testid={testId} style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className="bf-label" style={{ textAlign: c.align ?? "left", padding: "8px 10px", borderBottom: "1px solid var(--rule-strong)", fontWeight: 500 }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              data-testid={testId ? `${testId}-row-${rowKey(row)}` : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={{ cursor: onRowClick ? "pointer" : "default" }}
              onMouseEnter={(e) => onRowClick && (e.currentTarget.style.background = "var(--ground-sink)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}
            >
              {columns.map((c) => (
                <td key={c.key} className={c.align === "right" ? "bf-num" : undefined} style={{ padding: "10px", borderBottom: "1px solid var(--rule)", fontSize: 14, textAlign: c.align ?? "left" }}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
