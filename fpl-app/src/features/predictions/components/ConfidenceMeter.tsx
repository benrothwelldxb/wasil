import { ratingBgClass, ratingTextClass } from "@/features/fixtures";
import { cn } from "@/lib/utils";

interface ConfidenceMeterProps {
  /** 0–100. */
  confidence: number;
  className?: string;
}

/** A labelled 0–100 confidence bar, coloured by value. */
export function ConfidenceMeter({ confidence, className }: ConfidenceMeterProps) {
  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Confidence</span>
        <span className={cn("font-semibold", ratingTextClass(confidence))}>
          {confidence}%
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={cn("h-full rounded-full", ratingBgClass(confidence))}
          style={{ width: `${confidence}%` }}
        />
      </div>
    </div>
  );
}
