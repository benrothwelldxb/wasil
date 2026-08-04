import type { TravelPreference } from '@/domain/types';
import { cn } from '@/lib/utils';
import { MAX_PREFERENCES, PREFERENCE_META, PREFERENCE_ORDER } from './preferences';

interface PreferencePickerProps {
  value: TravelPreference[];
  onChange: (next: TravelPreference[]) => void;
}

export function PreferencePicker({ value, onChange }: PreferencePickerProps) {
  const toggle = (pref: TravelPreference) => {
    if (value.includes(pref)) {
      onChange(value.filter((p) => p !== pref));
    } else if (value.length < MAX_PREFERENCES) {
      onChange([...value, pref]);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {PREFERENCE_ORDER.map((pref) => {
          const meta = PREFERENCE_META[pref];
          const Icon = meta.icon;
          const active = value.includes(pref);
          const disabled = !active && value.length >= MAX_PREFERENCES;
          return (
            <button
              key={pref}
              type="button"
              aria-pressed={active}
              disabled={disabled}
              onClick={() => toggle(pref)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors',
                active
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground',
                disabled && 'cursor-not-allowed opacity-40 hover:border-border hover:text-muted-foreground',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {meta.label}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Pick up to {MAX_PREFERENCES} — they reshape how journeys are ranked ({value.length}/
        {MAX_PREFERENCES}).
      </p>
    </div>
  );
}
