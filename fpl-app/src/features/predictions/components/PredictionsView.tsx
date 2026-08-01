import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { QueryBoundary } from "@/features/fpl";
import { EmptyState, ListViewSkeleton, SectionCard } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useDebouncedValue } from "@/hooks";
import { WINDOWS, type PredictionWindow } from "../config";
import { usePredictions } from "../usePredictions";
import { PredictionBreakdown } from "./PredictionBreakdown";
import { PredictionList } from "./PredictionList";

const POSITION_FILTERS = [
  { value: "all", label: "All positions" },
  { value: "1", label: "Goalkeepers" },
  { value: "2", label: "Defenders" },
  { value: "3", label: "Midfielders" },
  { value: "4", label: "Forwards" },
];

const WINDOW_LABEL: Record<PredictionWindow, string> = {
  1: "Next GW",
  3: "Next 3",
  5: "Next 5",
  8: "Next 8",
};

/**
 * The prediction engine's UI: players ranked by expected points for the chosen
 * window, with a complete, transparent breakdown for the selected player.
 */
export function PredictionsView() {
  const { predictions, engineId, isLoading, isError, error, refetch } =
    usePredictions();

  const [window, setWindow] = useState<PredictionWindow>(1);
  const [search, setSearch] = useState("");
  const [positionId, setPositionId] = useState("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const debouncedSearch = useDebouncedValue(search, 200);

  const filtered = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();
    const list = predictions.filter((p) => {
      if (positionId !== "all" && p.player.positionId !== Number(positionId)) {
        return false;
      }
      if (query) {
        const hay = `${p.player.webName} ${p.player.teamName}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
    return list.sort(
      (a, b) => b.windows[window].expectedPoints - a.windows[window].expectedPoints,
    );
  }, [predictions, debouncedSearch, positionId, window]);

  const selected =
    filtered.find((p) => p.playerId === selectedId) ?? filtered[0] ?? null;

  return (
    <QueryBoundary
      isLoading={isLoading}
      isError={isError}
      error={error}
      onRetry={refetch}
      loadingFallback={<ListViewSkeleton />}
    >
      <div className="space-y-4">
        {/* Controls */}
        <div className="space-y-3 rounded-lg border bg-card p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search players…"
                className="pl-9"
                aria-label="Search players"
              />
            </div>
            <Select value={positionId} onValueChange={setPositionId}>
              <SelectTrigger aria-label="Position" className="sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POSITION_FILTERS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant="secondary" className="whitespace-nowrap">
              {engineId}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="mr-1 text-xs text-muted-foreground">Horizon:</span>
            {WINDOWS.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWindow(w)}
                className={cn(
                  "rounded-md border px-3 py-1 text-sm font-medium transition-colors",
                  w === window
                    ? "border-primary bg-primary text-primary-foreground"
                    : "hover:bg-accent",
                )}
              >
                {WINDOW_LABEL[w]}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No players match"
            description="Try a different search or position filter."
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
            <div className="order-2 lg:order-1">
              <PredictionList
                predictions={filtered}
                window={window}
                selectedId={selected?.playerId ?? null}
                onSelect={setSelectedId}
              />
            </div>
            <aside className="order-1 lg:order-2 lg:sticky lg:top-20 lg:self-start">
              <SectionCard title="xPts breakdown">
                {selected && (
                  <PredictionBreakdown
                    prediction={selected}
                    window={window}
                    onWindowChange={setWindow}
                  />
                )}
              </SectionCard>
            </aside>
          </div>
        )}
      </div>
    </QueryBoundary>
  );
}
