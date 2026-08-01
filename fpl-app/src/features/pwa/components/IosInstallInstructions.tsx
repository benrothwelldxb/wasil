import { Plus, Share } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BrandMark } from "@/components/common";

export interface IosInstallInstructionsProps {
  open: boolean;
  onClose: () => void;
}

const STEPS = [
  { icon: Share, text: "Tap the Share button in Safari's toolbar." },
  { icon: Plus, text: 'Scroll down and tap "Add to Home Screen".' },
  {
    icon: null,
    text: 'Tap "Add" — MyFPLScout appears on your home screen.',
  },
] as const;

/**
 * Step-by-step "Add to Home Screen" guide for iOS Safari, which has no install
 * prompt API. Built on the accessible Radix Dialog (focus trap, Escape, inert).
 */
export function IosInstallInstructions({
  open,
  onClose,
}: IosInstallInstructionsProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <BrandMark className="h-10 w-10" decorative />
            <div>
              <DialogTitle>Install MyFPLScout</DialogTitle>
              <DialogDescription>
                Add it to your home screen — three quick taps.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ol className="space-y-3">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <li key={i} className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {i + 1}
                </span>
                <span className="flex items-center gap-2 text-sm">
                  {step.text}
                  {Icon && (
                    <Icon
                      className="inline h-4 w-4 shrink-0 text-primary"
                      aria-hidden
                    />
                  )}
                </span>
              </li>
            );
          })}
        </ol>

        <p className="text-xs text-muted-foreground">
          Not seeing the option? Make sure you're using Safari — other iPhone
          browsers can't add to the home screen.
        </p>
      </DialogContent>
    </Dialog>
  );
}
