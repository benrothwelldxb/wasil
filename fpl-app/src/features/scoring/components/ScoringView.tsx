import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { QueryBoundary } from "@/features/fpl";
import { useActiveProfile } from "@/features/preferences";
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
import { useDebouncedValue } from "@/hooks";
import { useScoring } from "../useScoring";
import { ScoreBreakdown } from "./ScoreBreakdown";
import { ScoreList } from "./ScoreList";

const POSITION_FILTERS = [
  { value: "all", label: "All positions" },
  { value: "1", label: "Goalkeepers" },
  { value: "2", label: "Defenders" },
  { value: "3", label: "Midfielders" },
  { value: "4", label: "Forwards" },
];

/**
 * The scoring engine's UI: a ranked, filterable list of every player with a
 * complete, transparent breakdown for the selected one. Ratings are
 * personalised by the active preference profile.
 */
export function ScoringView() {
  const { scores, isLoading, isError, error, refetch } = useScoring();
  const activeProfile = useActiveProfile();

  const [search, setSearch] = useState("");
  const [positionId, setPositionId] = useState("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const debouncedSearch = useDebouncedValue(search, 200);

  const filtered = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();
    return scores.filter((s) => {
      if (positionId !== "all" && s.player.positionId !== Number(positionId)) {
        return false;
      }
      if (query) {
        const hay =
          `${s.player.webName} ${s.player.teamName}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }, [scores, debouncedSearch, positionId]);

  const selected =
    filtered.find((s) => s.player.id === selectedId) ?? filtered[0] ?? null;

  return (
    <QueryBoundary
      isLoading={isLoading}
      isError={isError}
      error={error}
      onRetry={refetch}
      loadingFallback={<ListViewSkeleton />}
    >
      <div className="space-y-4">
        {/* Filters */}
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 sm:flex-row sm:items-center">
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
            <SelectTrigger aria-label="Position" className="sm:w-48">
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
            Profile: {activeProfile.name}
          </Badge>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No players match"
            description="Try a different search or position filter."
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <div className="order-2 lg:order-1">
              <ScoreList
                scores={filtered}
                selectedId={selected?.player.id ?? null}
                onSelect={setSelectedId}
              />
            </div>
            <aside className="order-1 lg:order-2 lg:sticky lg:top-20 lg:self-start">
              <SectionCard title="Score breakdown">
                {selected && <ScoreBreakdown score={selected} />}
              </SectionCard>
            </aside>
          </div>
        )}
      </div>
    </QueryBoundary>
  );
}
