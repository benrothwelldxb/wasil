import { useMemo, useState } from "react";
import { Download, Loader2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  buildTeamCardSvg,
  CARD_HEIGHT,
  CARD_WIDTH,
  type TeamCardData,
} from "../card";
import { track } from "@/lib/analytics";
import { shareOrDownloadPng, svgToDataUrl, svgToPngBlob } from "../image";

export interface ShareTeamDialogProps {
  open: boolean;
  onClose: () => void;
  data: TeamCardData;
}

/**
 * Previews the shareable team card and lets the user share it (Web Share API)
 * or download it as a PNG. The preview is the SVG itself (crisp, instant); the
 * PNG is only rasterised when the user actually shares or downloads.
 */
export function ShareTeamDialog({ open, onClose, data }: ShareTeamDialogProps) {
  const svg = useMemo(() => buildTeamCardSvg(data), [data]);
  const previewUrl = useMemo(() => svgToDataUrl(svg), [svg]);
  const [busy, setBusy] = useState<"share" | "download" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const gw = data.gameweek !== null ? `Gameweek ${data.gameweek}` : "this week";
  const shareText = `${data.source === "yours" ? "My" : "A"} ${gw} FPL team — projected ${data.projectedPoints.toFixed(1)} pts. Built with MyFPLScout · myfplscout.app`;

  const run = async (action: "share" | "download") => {
    setBusy(action);
    setError(null);
    try {
      const blob = await svgToPngBlob(svg, CARD_WIDTH, CARD_HEIGHT);
      const filename = "my-fpl-team.png";
      if (action === "share") {
        await shareOrDownloadPng(blob, filename, {
          title: "My FPL team",
          text: shareText,
        });
        track("team_shared");
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong. Try again.",
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Share your team</DialogTitle>
        </DialogHeader>

        <div className="overflow-hidden rounded-xl border">
          <img
            src={previewUrl}
            alt={`Team card — ${gw}, projected ${data.projectedPoints.toFixed(1)} points${data.captainName ? `, captain ${data.captainName}` : ""}`}
            width={CARD_WIDTH}
            height={CARD_HEIGHT}
            className="block h-auto w-full"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2">
          <Button
            className="flex-1"
            onClick={() => run("share")}
            disabled={busy !== null}
          >
            {busy === "share" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Share2 className="h-4 w-4" />
            )}
            Share
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => run("download")}
            disabled={busy !== null}
          >
            {busy === "download" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Save image
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
