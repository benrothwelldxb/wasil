import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface PageContainerProps {
  children: ReactNode;
  /** Constrain to a narrower max width for reading-heavy pages. */
  size?: "default" | "narrow" | "wide";
  className?: string;
}

const SIZE_CLASS: Record<NonNullable<PageContainerProps["size"]>, string> = {
  narrow: "max-w-3xl",
  default: "max-w-6xl",
  wide: "max-w-screen-2xl",
};

/**
 * Consistent horizontal padding and max-width wrapper for page content.
 * Every route renders its content inside a `PageContainer`.
 */
export function PageContainer({
  children,
  size = "default",
  className,
}: PageContainerProps) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 py-6 sm:px-6 lg:px-8",
        SIZE_CLASS[size],
        className,
      )}
    >
      {children}
    </div>
  );
}
