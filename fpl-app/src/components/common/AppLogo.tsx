import { Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AppLogoProps {
  /** Hide the wordmark and render the mark only (e.g. collapsed nav). */
  iconOnly?: boolean;
  className?: string;
}

/**
 * The application logo: an icon mark plus optional wordmark. Reused in the
 * header and mobile navigation so branding stays consistent.
 */
export function AppLogo({ iconOnly = false, className }: AppLogoProps) {
  return (
    <span className={cn("flex items-center gap-2 font-semibold", className)}>
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Trophy className="h-5 w-5" aria-hidden />
      </span>
      {!iconOnly && (
        <span className="text-lg tracking-tight">
          my<span className="text-primary">FPL</span>Scout
        </span>
      )}
      <span className="sr-only">myFPLScout — home</span>
    </span>
  );
}
