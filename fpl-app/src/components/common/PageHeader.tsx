import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  /** Main page title. */
  title: string;
  /** Optional supporting description. */
  description?: ReactNode;
  /** Optional actions rendered on the right (buttons, filters, etc.). */
  actions?: ReactNode;
  className?: string;
}

/**
 * A standardised page heading block: title, optional description, and an
 * optional actions slot. Keeps every page's header visually consistent.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-muted-foreground sm:text-base">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
