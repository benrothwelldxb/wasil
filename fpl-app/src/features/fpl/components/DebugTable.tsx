import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface DebugColumn<T> {
  /** Column header text. */
  header: string;
  /** Cell renderer for a row. */
  cell: (row: T) => ReactNode;
  /** Text alignment; defaults to left. */
  align?: "left" | "right";
  /** Hide on narrow screens to keep tables readable. */
  hideOnMobile?: boolean;
}

interface DebugTableProps<T> {
  columns: DebugColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string | number;
}

/**
 * A small, strongly-typed table used across the debug page. Generic over the
 * row type so each section keeps full type-safety on its columns.
 */
export function DebugTable<T>({
  columns,
  rows,
  getRowKey,
}: DebugTableProps<T>) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-[32rem] text-sm">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            {columns.map((col, i) => (
              <th
                key={i}
                scope="col"
                className={cn(
                  "px-3 py-2 text-left font-medium",
                  col.align === "right" && "text-right",
                  col.hideOnMobile && "hidden sm:table-cell",
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={getRowKey(row)}
              className="border-t transition-colors hover:bg-muted/30"
            >
              {columns.map((col, i) => (
                <td
                  key={i}
                  className={cn(
                    "px-3 py-2",
                    col.align === "right" && "text-right tabular-nums",
                    col.hideOnMobile && "hidden sm:table-cell",
                  )}
                >
                  {col.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
