import { Check, Minus, Plus } from "lucide-react";
import type { Player } from "@/features/fpl";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { AddCheck } from "../types";

interface SquadToggleButtonProps {
  player: Player;
  selected: boolean;
  addCheck: AddCheck;
  onToggle: (player: Player) => void;
}

/**
 * Single-click add/remove control.
 *
 * - Selected → a remove button.
 * - Addable → an add button.
 * - Blocked → a disabled add button whose tooltip explains why (the rule that
 *   would be broken), so illegal teams can't be built.
 */
export function SquadToggleButton({
  player,
  selected,
  addCheck,
  onToggle,
}: SquadToggleButtonProps) {
  if (selected) {
    return (
      <Button
        size="icon"
        variant="secondary"
        aria-label={`Remove ${player.webName}`}
        onClick={() => onToggle(player)}
        className="group h-8 w-8"
      >
        <Check className="h-4 w-4 group-hover:hidden" />
        <Minus className="hidden h-4 w-4 group-hover:block" />
      </Button>
    );
  }

  const button = (
    <Button
      size="icon"
      variant="outline"
      aria-label={`Add ${player.webName}`}
      disabled={!addCheck.canAdd}
      onClick={() => onToggle(player)}
      className={cn("h-8 w-8", !addCheck.canAdd && "opacity-50")}
    >
      <Plus className="h-4 w-4" />
    </Button>
  );

  // A disabled button doesn't fire pointer events, so wrap it for the tooltip.
  if (!addCheck.canAdd && addCheck.reason) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="inline-flex">
            {button}
          </span>
        </TooltipTrigger>
        <TooltipContent>{addCheck.reason}</TooltipContent>
      </Tooltip>
    );
  }

  return button;
}
