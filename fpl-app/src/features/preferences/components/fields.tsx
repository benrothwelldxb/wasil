import type { ReactNode } from "react";
import type { Team } from "@/features/fpl";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { DIFFERENTIAL_OPTIONS } from "../options";
import type { DifferentialPreference } from "../schema";

/** A labelled wrapper around a single preference control. */
export function PreferenceSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

const NONE = "none";

/** Favourite-club selector (exactly one, or none). */
export function FavouriteClubField({
  teams,
  value,
  onChange,
}: {
  teams: Team[];
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  const sorted = [...teams].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Select
      value={value === null ? NONE : value.toString()}
      onValueChange={(v) => onChange(v === NONE ? null : Number(v))}
    >
      <SelectTrigger aria-label="Favourite club" className="sm:max-w-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>No favourite club</SelectItem>
        {sorted.map((t) => (
          <SelectItem key={t.id} value={t.id.toString()}>
            {t.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const DIFFERENTIAL_VALUES = DIFFERENTIAL_OPTIONS.map((o) => o.value);

/** Five-stop differential slider (Never … Maximum). */
export function DifferentialSlider({
  value,
  onChange,
}: {
  value: DifferentialPreference;
  onChange: (value: DifferentialPreference) => void;
}) {
  const index = Math.max(0, DIFFERENTIAL_VALUES.indexOf(value));
  const current = DIFFERENTIAL_OPTIONS[index];

  return (
    <div className="space-y-3">
      <Slider
        min={0}
        max={DIFFERENTIAL_VALUES.length - 1}
        step={1}
        value={[index]}
        onValueChange={(v) => {
          const next = DIFFERENTIAL_VALUES[v[0] ?? 0];
          if (next) onChange(next);
        }}
        aria-label="Differential preference"
      />
      <div className="flex justify-between text-[11px] text-muted-foreground">
        {DIFFERENTIAL_OPTIONS.map((o, i) => (
          <span
            key={o.value}
            className={cn(
              "w-1/5 text-center",
              i === 0 && "text-left",
              i === DIFFERENTIAL_OPTIONS.length - 1 && "text-right",
              i === index && "font-semibold text-foreground",
            )}
          >
            {o.label.replace(" Differentials", "")}
          </span>
        ))}
      </div>
      {current && (
        <p className="text-xs text-muted-foreground">{current.description}</p>
      )}
    </div>
  );
}

/** Continuous Form ↔ Fixtures slider (`formBias` in [0,1]). */
export function FormFixturesField({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const pctForm = Math.round(value * 100);
  return (
    <div className="space-y-2">
      <Slider
        min={0}
        max={100}
        step={5}
        value={[pctForm]}
        onValueChange={(v) => onChange((v[0] ?? 50) / 100)}
        aria-label="Form versus fixtures"
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span className={cn(pctForm > 50 && "font-semibold text-foreground")}>
          {pctForm}% Form
        </span>
        <span>Balanced</span>
        <span className={cn(pctForm < 50 && "font-semibold text-foreground")}>
          {100 - pctForm}% Fixtures
        </span>
      </div>
    </div>
  );
}
