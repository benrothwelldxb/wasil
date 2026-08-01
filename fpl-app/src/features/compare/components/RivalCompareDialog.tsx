import { useMemo, useState } from "react";
import { Download, Loader2, Search, Share2 } from "lucide-react";
import { fetchManagerTeam, usePlayers, type Player } from "@/features/fpl";
import { usePredictions } from "@/features/predictions";
import {
  buildCompareCardSvg,
  COMPARE_SIZE,
  shareOrDownloadPng,
  svgToDataUrl,
  svgToPngBlob,
  type CompareSummary,
} from "@/features/share";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { projectSquad } from "../project";

export interface RivalCompareDialogProps {
  open: boolean;
  onClose: () => void;
  mine: CompareSummary;
  gameweek: number | null;
}

/**
 * Compare your team against a rival's (by their Manager ID) and share the
 * head-to-head scorecard. Both teams are projected the same way for fairness.
 */
export function RivalCompareDialog({
  open,
  onClose,
  mine,
  gameweek,
}: RivalCompareDialogProps) {
  const { byId } = usePredictions();
  const playersQuery = usePlayers();
  const playersById = useMemo(() => {
    const map = new Map<number, Player>();
    for (const p of playersQuery.data ?? []) map.set(p.id, p);
    return map;
  }, [playersQuery.data]);

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState<"share" | "download" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [theirs, setTheirs] = useState<CompareSummary | null>(null);

  const svg = useMemo(
    () => (theirs ? buildCompareCardSvg(mine, theirs, gameweek) : null),
    [mine, theirs, gameweek],
  );

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = Number(input.trim());
    if (!Number.isInteger(id) || id <= 0) {
      setError("Enter a numeric Manager ID.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const team = await fetchManagerTeam(id);
      setTheirs(
        projectSquad(
          { managerName: team.managerName, teamName: team.teamName },
          team.playerIds,
          byId,
          playersById,
        ),
      );
    } catch (err) {
      setError(
        err instanceof Error && err.message.includes("saved a team")
          ? err.message
          : "Couldn't find that team. Check the Manager ID and try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const share = async (action: "share" | "download") => {
    if (!svg) return;
    setSharing(action);
    try {
      const blob = await svgToPngBlob(svg, COMPARE_SIZE, COMPARE_SIZE);
      if (action === "share") {
        await shareOrDownloadPng(blob, "fpl-head-to-head.png", {
          title: "FPL head to head",
          text: `${mine.projectedPoints.toFixed(1)} vs ${theirs?.projectedPoints.toFixed(1)} — compared on MyFPLScout · myfplscout.app`,
        });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "fpl-head-to-head.png";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch {
      setError("Couldn't create the image. Try again.");
    } finally {
      setSharing(null);
    }
  };

  const reset = () => {
    setTheirs(null);
    setInput("");
    setError(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          reset();
        }
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Compare with a rival</DialogTitle>
        </DialogHeader>

        {!svg ? (
          <form onSubmit={lookup} className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Enter a friend's <strong>Manager ID</strong> (from their team URL)
              to see who's projected to win this week.
            </p>
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                inputMode="numeric"
                placeholder="e.g. 1234567"
                aria-label="Rival Manager ID"
              />
              <Button type="submit" disabled={busy || input.trim() === ""}>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                Compare
              </Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </form>
        ) : (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-xl border">
              <img
                src={svgToDataUrl(svg)}
                alt={`Head to head — you ${mine.projectedPoints.toFixed(1)} vs ${theirs?.projectedPoints.toFixed(1)}`}
                width={COMPARE_SIZE}
                height={COMPARE_SIZE}
                className="block h-auto w-full"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={() => share("share")}
                disabled={sharing !== null}
              >
                {sharing === "share" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Share2 className="h-4 w-4" />
                )}
                Share
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => share("download")}
                disabled={sharing !== null}
              >
                {sharing === "download" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Save
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={reset} className="w-full">
              Compare another team
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
