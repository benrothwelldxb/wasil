import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  /** Accessible label announced to screen readers. */
  label?: string;
  /** Center within a full-height area and stack the label below. */
  fullPage?: boolean;
  className?: string;
}

const SIZE_CLASS: Record<NonNullable<LoadingSpinnerProps["size"]>, string> = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-10 w-10",
};

/** A consistent, accessible loading indicator. */
export function LoadingSpinner({
  size = "md",
  label = "Loading…",
  fullPage = false,
  className,
}: LoadingSpinnerProps) {
  const spinner = (
    <Loader2
      className={cn("animate-spin text-muted-foreground", SIZE_CLASS[size])}
      aria-hidden
    />
  );

  if (fullPage) {
    return (
      <div
        role="status"
        className={cn(
          "flex min-h-[40vh] flex-col items-center justify-center gap-3",
          className,
        )}
      >
        {spinner}
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
    );
  }

  return (
    <span
      role="status"
      className={cn("inline-flex items-center gap-2", className)}
    >
      {spinner}
      <span className="sr-only">{label}</span>
    </span>
  );
}
