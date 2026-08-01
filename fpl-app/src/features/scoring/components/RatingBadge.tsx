import { ratingBgClass, ratingTextClass } from "@/features/fixtures";
import { cn } from "@/lib/utils";

interface RatingBadgeProps {
  rating: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE: Record<NonNullable<RatingBadgeProps["size"]>, string> = {
  sm: "text-sm px-2 py-0.5",
  md: "text-base px-2.5 py-1",
  lg: "text-2xl px-3 py-1.5",
};

/** A 0–100 rating chip, coloured by value (green = strong). */
export function RatingBadge({ rating, size = "md", className }: RatingBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md font-bold tabular-nums",
        "bg-opacity-10",
        ratingTextClass(rating),
        SIZE[size],
        className,
      )}
    >
      <span
        className={cn(
          "mr-1.5 inline-block h-2 w-2 rounded-full",
          ratingBgClass(rating),
        )}
        aria-hidden
      />
      {Math.round(rating)}
    </span>
  );
}
