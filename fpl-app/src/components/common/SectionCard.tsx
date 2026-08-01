import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface SectionCardProps {
  /** Optional card title. */
  title?: ReactNode;
  /** Optional supporting description under the title. */
  description?: ReactNode;
  /** Optional actions rendered in the header (top-right). */
  actions?: ReactNode;
  children: ReactNode;
  /** Remove default content padding (e.g. for edge-to-edge tables). */
  disablePadding?: boolean;
  className?: string;
  contentClassName?: string;
}

/**
 * A titled content card — the default building block for grouping related
 * content within a page. Header is only rendered when a title/description or
 * actions are supplied.
 */
export function SectionCard({
  title,
  description,
  actions,
  children,
  disablePadding = false,
  className,
  contentClassName,
}: SectionCardProps) {
  const hasHeader = Boolean(title || description || actions);

  return (
    <Card className={className}>
      {hasHeader && (
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1.5">
            {title && <CardTitle className="text-lg">{title}</CardTitle>}
            {description && <CardDescription>{description}</CardDescription>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </CardHeader>
      )}
      <CardContent
        className={cn(
          disablePadding && "p-0",
          hasHeader && !disablePadding && "pt-0",
          contentClassName,
        )}
      >
        {children}
      </CardContent>
    </Card>
  );
}
