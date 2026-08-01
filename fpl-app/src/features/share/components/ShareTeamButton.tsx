import { useState } from "react";
import { Share2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import type { TeamCardData } from "../card";
import { ShareTeamDialog } from "./ShareTeamDialog";

export interface ShareTeamButtonProps {
  /** Card data to render/share, or null when there's no team yet. */
  data: TeamCardData | null;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  label?: string;
}

/**
 * Opens the share-team card dialog. Renders nothing when there's no team to
 * share, so callers can drop it in unconditionally.
 */
export function ShareTeamButton({
  data,
  variant = "outline",
  size,
  className,
  label = "Share team",
}: ShareTeamButtonProps) {
  const [open, setOpen] = useState(false);
  // Hide until there's a real projection — a 0.0 preseason card looks broken.
  if (!data || data.projectedPoints <= 0) return null;

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={() => setOpen(true)}
      >
        <Share2 className="h-4 w-4" />
        {label}
      </Button>
      <ShareTeamDialog open={open} onClose={() => setOpen(false)} data={data} />
    </>
  );
}
