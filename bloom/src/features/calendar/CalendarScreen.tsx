import { useMemo, useState } from 'react';
import { Screen } from '@/components/common/Screen';
import { Card } from '@/components/ui/card';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { IconButton } from '@/components/common/IconButton';
import { CalendarDay, type DayMarkers } from '@/components/product/CalendarDay';
import { DailySummaryCard } from './DailySummaryCard';
import { useCheckIns, usePeriods, useTreatments } from '@/hooks/queries';
import { buildMonthGrid, monthLabel, WEEKDAY_LABELS } from '@/lib/calendar';
import { MOCK_TODAY } from '@/data/mock';
import type { IsoDate } from '@/lib/date';

const EMPTY_MARKERS: DayMarkers = {
  logged: false,
  period: false,
  unusual: false,
  treatment: false,
  note: false,
};

export function CalendarScreen() {
  const { data: checkIns } = useCheckIns();
  const { data: periods } = usePeriods();
  const { data: treatments } = useTreatments();

  const [anchor, setAnchor] = useState(() => {
    const d = new Date(`${MOCK_TODAY}T00:00:00`);
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [selected, setSelected] = useState<IsoDate>(MOCK_TODAY);

  const markersByDate = useMemo(() => {
    const map = new Map<string, DayMarkers>();
    const ensure = (date: string): DayMarkers => {
      const existing = map.get(date);
      if (existing) return existing;
      const fresh = { ...EMPTY_MARKERS };
      map.set(date, fresh);
      return fresh;
    };
    checkIns?.forEach((c) => {
      const m = ensure(c.date);
      m.logged = true;
      if (c.flaggedUnusual) m.unusual = true;
      if (c.note) m.note = true;
    });
    periods?.forEach((p) => {
      ensure(p.date).period = true;
    });
    treatments?.forEach((t) => {
      ensure(t.date).treatment = true;
    });
    return map;
  }, [checkIns, periods, treatments]);

  const grid = useMemo(
    () => buildMonthGrid(anchor.year, anchor.month),
    [anchor.year, anchor.month],
  );

  const goMonth = (delta: number) => {
    setAnchor((prev) => {
      const d = new Date(prev.year, prev.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const selectedCheckIn = checkIns?.find((c) => c.date === selected);
  const selectedPeriod = periods?.find((p) => p.date === selected);

  return (
    <>
      <ScreenHeader eyebrow="Your history" title="Calendar" showBack />
      <Screen>
        {/* Legend */}
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          <LegendItem className="bg-primary-soft" label="Logged" />
          <LegendItem className="bg-coral" label="Period" />
          <LegendItem className="bg-lilac" label="Treatment" />
          <LegendItem className="bg-sage" label="Note" shape="square" />
          <LegendItem className="bg-attention" label="Unusual" />
        </div>

        <Card className="mt-4 p-4">
          {/* Month header */}
          <div className="flex items-center justify-between">
            <IconButton icon="ChevronLeft" label="Previous month" onClick={() => goMonth(-1)} />
            <h2 className="text-base font-semibold text-foreground">
              {monthLabel(anchor.year, anchor.month)}
            </h2>
            <IconButton icon="ChevronRight" label="Next month" onClick={() => goMonth(1)} />
          </div>

          {/* Weekday labels */}
          <div className="mt-2 grid grid-cols-7 gap-1">
            {WEEKDAY_LABELS.map((w) => (
              <div key={w} className="py-1 text-center text-[11px] font-medium text-muted-foreground">
                {w}
              </div>
            ))}
          </div>

          {/* Grid */}
          <div className="grid grid-cols-7 gap-1">
            {grid.map((cell) => (
              <div key={cell.date} className={cell.inMonth ? '' : 'opacity-30'}>
                <CalendarDay
                  date={cell.date}
                  dayNumber={cell.dayNumber}
                  markers={markersByDate.get(cell.date) ?? EMPTY_MARKERS}
                  selected={selected === cell.date}
                  isToday={cell.date === MOCK_TODAY}
                  onSelect={setSelected}
                />
              </div>
            ))}
          </div>
        </Card>

        <div className="mt-5">
          <DailySummaryCard
            date={selected}
            {...(selectedCheckIn ? { checkIn: selectedCheckIn } : {})}
            {...(selectedPeriod ? { period: selectedPeriod } : {})}
          />
        </div>
      </Screen>
    </>
  );
}

function LegendItem({
  className,
  label,
  shape = 'dot',
}: {
  className: string;
  label: string;
  shape?: 'dot' | 'square';
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-block size-2.5 ${shape === 'square' ? 'rounded-sm' : 'rounded-full'} ${className}`}
      />
      {label}
    </span>
  );
}
