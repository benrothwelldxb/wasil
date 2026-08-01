import type { Player } from "@/features/fpl";
import { cn } from "@/lib/utils";

/**
 * Compact set-piece duty indicator — penalties, direct free-kicks, corners —
 * shown only for first/second-choice takers (the ones that matter for points).
 */
export function SetPieceBadge({
  player,
  className,
}: {
  player: Player;
  className?: string;
}) {
  const duties: { key: string; label: string; title: string }[] = [];
  if (player.penaltiesOrder !== null && player.penaltiesOrder <= 2) {
    duties.push({
      key: "pk",
      label: player.penaltiesOrder === 1 ? "PK" : "PK²",
      title: `Penalties: ${player.penaltiesOrder === 1 ? "first" : "second"} choice`,
    });
  }
  if (player.freeKicksOrder !== null && player.freeKicksOrder === 1) {
    duties.push({ key: "fk", label: "FK", title: "Free-kicks: first choice" });
  }
  if (player.cornersOrder !== null && player.cornersOrder === 1) {
    duties.push({ key: "ck", label: "CK", title: "Corners: first choice" });
  }
  if (duties.length === 0) return null;

  return (
    <span className={cn("flex flex-wrap gap-1", className)}>
      {duties.map((d) => (
        <span
          key={d.key}
          title={d.title}
          className="rounded bg-amber-500/15 px-1 py-0.5 text-[10px] font-bold uppercase leading-none text-amber-600 dark:text-amber-400"
        >
          {d.label}
        </span>
      ))}
    </span>
  );
}
