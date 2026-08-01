import type { ReactNode } from "react";
import { ArrowDownWideNarrow, ArrowUpWideNarrow, Search, X } from "lucide-react";
import type { Position, Team } from "@/features/fpl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OWNERSHIP_OPTIONS, SORT_OPTIONS } from "../columns";
import type { PlayerSortKey } from "../types";
import type { UsePlayerExplorerResult } from "../usePlayerExplorer";

const ALL = "all";

interface PlayerFiltersProps {
  explorer: UsePlayerExplorerResult;
  teams: Team[];
  positions: Position[];
  priceBounds: [number, number];
  resultCount: number;
  totalCount: number;
  /** Sort options for the dropdown (defaults to the base columns). */
  sortOptions?: { key: PlayerSortKey; label: string }[];
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * The Player Explorer filter toolbar: search, position, club, ownership,
 * price range, and sort. Styled like a modern SaaS data-table control bar.
 */
export function PlayerFilters({
  explorer,
  teams,
  positions,
  priceBounds,
  resultCount,
  totalCount,
  sortOptions = SORT_OPTIONS,
}: PlayerFiltersProps) {
  const { filters, sort } = explorer;
  const priceValue = filters.priceRange ?? priceBounds;

  const sortedTeams = [...teams].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4 shadow-sm">
      {/* Search + reset */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(e) => explorer.setSearch(e.target.value)}
            placeholder="Search players or clubs…"
            className="pl-9"
            aria-label="Search players"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => explorer.setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="whitespace-nowrap">
            {resultCount.toLocaleString()} of {totalCount.toLocaleString()}
          </Badge>
          {explorer.isFiltered && (
            <Button variant="ghost" size="sm" onClick={explorer.reset}>
              <X className="h-4 w-4" />
              Reset
            </Button>
          )}
        </div>
      </div>

      {/* Selects */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Field label="Position">
          <Select
            value={filters.positionId?.toString() ?? ALL}
            onValueChange={(v) =>
              explorer.setPositionId(v === ALL ? null : Number(v))
            }
          >
            <SelectTrigger aria-label="Filter by position">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All positions</SelectItem>
              {positions.map((p) => (
                <SelectItem key={p.id} value={p.id.toString()}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Club">
          <Select
            value={filters.teamId?.toString() ?? ALL}
            onValueChange={(v) =>
              explorer.setTeamId(v === ALL ? null : Number(v))
            }
          >
            <SelectTrigger aria-label="Filter by club">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All clubs</SelectItem>
              {sortedTeams.map((t) => (
                <SelectItem key={t.id} value={t.id.toString()}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Ownership">
          <Select
            value={filters.minOwnership.toString()}
            onValueChange={(v) => explorer.setMinOwnership(Number(v))}
          >
            <SelectTrigger aria-label="Filter by ownership">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OWNERSHIP_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value.toString()}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Sort by">
          <div className="flex gap-2">
            <Select
              value={sort.key}
              onValueChange={(v) => {
                const key = v as PlayerSortKey;
                if (key !== sort.key) explorer.toggleSort(key);
              }}
            >
              <SelectTrigger aria-label="Sort by" className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sortOptions.map((o) => (
                  <SelectItem key={o.key} value={o.key}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => explorer.toggleSort(sort.key)}
              aria-label={`Sort ${sort.direction === "asc" ? "ascending" : "descending"}`}
              title={sort.direction === "asc" ? "Ascending" : "Descending"}
            >
              {sort.direction === "asc" ? (
                <ArrowUpWideNarrow className="h-4 w-4" />
              ) : (
                <ArrowDownWideNarrow className="h-4 w-4" />
              )}
            </Button>
          </div>
        </Field>
      </div>

      {/* Price range */}
      <Field label="Price range">
        <div className="flex items-center gap-4 pt-1">
          <span className="w-14 text-sm tabular-nums text-muted-foreground">
            £{priceValue[0].toFixed(1)}
          </span>
          <Slider
            min={priceBounds[0]}
            max={priceBounds[1]}
            step={0.1}
            value={priceValue}
            onValueChange={(v) =>
              explorer.setPriceRange([v[0] ?? priceBounds[0], v[1] ?? priceBounds[1]])
            }
            className="flex-1"
            aria-label="Price range"
          />
          <span className="w-14 text-right text-sm tabular-nums text-muted-foreground">
            £{priceValue[1].toFixed(1)}
          </span>
        </div>
      </Field>
    </div>
  );
}
