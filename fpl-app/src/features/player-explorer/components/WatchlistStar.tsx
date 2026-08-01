import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWatchlistStore } from "../watchlistStore";

/** A star toggle to add/remove a player from the watchlist. */
export function WatchlistStar({ playerId }: { playerId: number }) {
  const watched = useWatchlistStore((s) => s.ids.includes(playerId));
  const toggle = useWatchlistStore((s) => s.toggle);

  return (
    <button
      type="button"
      onClick={() => toggle(playerId)}
      aria-pressed={watched}
      aria-label={watched ? "Remove from watchlist" : "Add to watchlist"}
      className="rounded p-1 text-muted-foreground transition-colors hover:text-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Star
        className={cn(
          "h-4 w-4",
          watched && "fill-amber-400 text-amber-500",
        )}
      />
    </button>
  );
}
