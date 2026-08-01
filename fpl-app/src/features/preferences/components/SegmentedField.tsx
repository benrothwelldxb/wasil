import { Check } from "lucide-react";
import type { PreferenceOption } from "../options";
import { cn } from "@/lib/utils";

interface SegmentedFieldProps<T extends string | number> {
  options: PreferenceOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Grid columns at the `sm` breakpoint. */
  columns?: 2 | 3 | 4;
  ariaLabel?: string;
}

const COLS: Record<2 | 3 | 4, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
};

/**
 * A segmented, card-style single-select used across the preference controls.
 * Generic over the option value so every choice stays strongly typed.
 */
export function SegmentedField<T extends string | number>({
  options,
  value,
  onChange,
  columns = 3,
  ariaLabel,
}: SegmentedFieldProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("grid grid-cols-1 gap-2", COLS[columns])}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "hover:border-muted-foreground/40 hover:bg-accent/40",
            )}
          >
            {active && (
              <Check className="absolute right-2 top-2 h-4 w-4 text-primary" />
            )}
            <div className="pr-5 text-sm font-semibold">{option.label}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {option.description}
            </div>
          </button>
        );
      })}
    </div>
  );
}
