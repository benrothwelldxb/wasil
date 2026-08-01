import { cn } from "@/lib/utils";
import { BrandMark } from "./BrandMark";

export interface AppLogoProps {
  /** Hide the wordmark and render the mark only (e.g. collapsed nav). */
  iconOnly?: boolean;
  className?: string;
}

/**
 * The application logo: the MyFPLScout mark plus optional wordmark
 * ("MyFPL" in brand ink, "Scout" in brand green). Reused across the header and
 * navigation so branding stays consistent.
 */
export function AppLogo({ iconOnly = false, className }: AppLogoProps) {
  return (
    <span className={cn("flex items-center gap-2 font-semibold", className)}>
      <BrandMark className="h-8 w-8" decorative />
      {!iconOnly && (
        <span className="text-lg tracking-tight text-[hsl(var(--brand-ink))]">
          MyFPL<span className="text-[hsl(var(--brand-green))]">Scout</span>
        </span>
      )}
      <span className="sr-only">MyFPLScout — home</span>
    </span>
  );
}
