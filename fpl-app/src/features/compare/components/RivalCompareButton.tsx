import { useState } from "react";
import { Swords } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import type { CompareSummary } from "@/features/share";
import { RivalCompareDialog } from "./RivalCompareDialog";

export interface RivalCompareButtonProps {
  /** The user's team summary, or null when there's no team. */
  mine: CompareSummary | null;
  gameweek: number | null;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
}

/** Opens the head-to-head compare dialog. Renders nothing without a team. */
export function RivalCompareButton({
  mine,
  gameweek,
  variant = "outline",
  size,
  className,
}: RivalCompareButtonProps) {
  const [open, setOpen] = useState(false);
  if (!mine) return null;

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={() => setOpen(true)}
      >
        <Swords className="h-4 w-4" />
        Compare vs a rival
      </Button>
      <RivalCompareDialog
        open={open}
        onClose={() => setOpen(false)}
        mine={mine}
        gameweek={gameweek}
      />
    </>
  );
}
