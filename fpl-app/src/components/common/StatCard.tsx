import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface StatCardProps {
  /** Metric label, e.g. "Total points". */
  label: string;
  /** Primary value to display. */
  value: ReactNode;
  /** Optional icon shown top-right. */
  icon?: LucideIcon;
  /** Optional trend indicator. */
  trend?: {
    value: string;
    /** Direction drives colour and arrow. */
    direction: "up" | "down" | "neutral";
  };
  /** Optional supporting caption under the value. */
  hint?: ReactNode;
  /** Render a skeleton placeholder instead of content. */
  loading?: boolean;
  className?: string;
}

/**
 * A compact metric tile for dashboards. Supports an icon, an optional trend
 * badge, and a built-in loading skeleton.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  trend,
  hint,
  loading = false,
  className,
}: StatCardProps) {
  return (
    <Card className={className}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          {Icon && (
            <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
          )}
        </div>

        {loading ? (
          <Skeleton className="mt-3 h-8 w-24" />
        ) : (
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight sm:text-3xl">
              {value}
            </span>
            {trend && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 text-xs font-medium",
                  trend.direction === "up" && "text-success",
                  trend.direction === "down" && "text-destructive",
                  trend.direction === "neutral" && "text-muted-foreground",
                )}
              >
                {trend.direction === "up" && (
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                )}
                {trend.direction === "down" && (
                  <ArrowDownRight className="h-3.5 w-3.5" aria-hidden />
                )}
                {trend.value}
              </span>
            )}
          </div>
        )}

        {hint && !loading && (
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        )}
      </CardContent>
    </Card>
  );
}
