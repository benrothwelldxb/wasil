import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  buildTeamCardSvg,
  CARD_HEIGHT,
  CARD_WIDTH,
  type TeamCardData,
} from "../card";
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

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

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
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Share your team card"
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/85 p-3 backdrop-blur animate-in fade-in sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-sm flex-col rounded-2xl border bg-card p-4 shadow-xl animate-in slide-in-from-bottom-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Share your team</h2>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="overflow-hidden rounded-xl border">
          <img
            src={previewUrl}
            alt="Your team card"
            width={CARD_WIDTH}
            height={CARD_HEIGHT}
            className="block h-auto w-full"
          />
        </div>

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        <div className="mt-4 flex gap-2">
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
      </div>
    </div>
  );
}
